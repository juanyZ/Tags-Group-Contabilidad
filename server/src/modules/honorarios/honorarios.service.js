/**
 * HONORARIOS Y COBRANZAS.
 *
 * Diferencia central con la planilla: "cobrado" no es un campo que se escribe,
 * es la SUMA de los pagos registrados (tabla honorario_pagos). De ahi salen
 * tres cosas gratis:
 *   1. Es imposible duplicar el cobrado repitiendo un cliente, que era el bug
 *      documentado del Excel.
 *   2. Queda el detalle de cada cobro con su fecha y su medio de pago, en vez
 *      de un unico acumulado sin historia.
 *   3. La cuenta corriente y el resumen mensual salen del mismo dato, sin
 *      posibilidad de que difieran.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aDateUTC, aISO } from '../../utils/fechas.js';
import { aNumero } from '../../utils/dinero.js';
import { crearConCodigo } from '../../services/codigos.service.js';
import { registrarAccion, registrarAlta, registrarBaja, registrarCambios } from '../../services/auditoria.service.js';
import { calcularHonorario, resumirHonorarios } from '../../services/honorarios.calculo.js';
import { validarItem } from '../catalogos/catalogos.service.js';
import {
  soloVivos,
  paginar,
  ordenar,
  verificarVersion,
  exigirExistencia,
  rangoFechas,
} from '../../lib/consultas.js';
import { ORDENABLES } from './honorarios.schema.js';

const INCLUDE_BASE = {
  cliente: { select: { id: true, codigo: true, nombre: true } },
  expediente: { select: { id: true, codigo: true, caratula: true } },
  pagos: {
    orderBy: { fecha: 'desc' },
    include: { medioPago: { select: { id: true, valor: true } } },
  },
};

function serializarPago(p) {
  return {
    id: p.id,
    fecha: aISO(p.fecha),
    monto: aNumero(p.monto),
    medioPagoId: p.medioPagoId,
    medioPago: p.medioPago ? p.medioPago.valor : null,
    observacion: p.observacion,
  };
}

function serializar(hon) {
  if (!hon) return null;
  const pagos = (hon.pagos || []).map(serializarPago);
  const calculo = calcularHonorario(hon, pagos);

  return Object.assign(
    {
      id: hon.id,
      codigo: hon.codigo,
      clienteId: hon.clienteId,
      cliente: hon.cliente ? hon.cliente.nombre : null,
      clienteCodigo: hon.cliente ? hon.cliente.codigo : null,
      expedienteId: hon.expedienteId,
      expediente: hon.expediente ? hon.expediente.caratula : null,
      fechaPacto: aISO(hon.fechaPacto),
      tipoPacto: hon.tipoPacto,
      observaciones: hon.observaciones,
      version: hon.version,
      pagos,
    },
    calculo
  );
}

export async function listar(consulta) {
  const { skip, take, page, limit } = paginar(consulta);

  const where = Object.assign(
    soloVivos(),
    consulta.clienteId ? { clienteId: consulta.clienteId } : {},
    consulta.expedienteId ? { expedienteId: consulta.expedienteId } : {},
    consulta.tipoPacto ? { tipoPacto: consulta.tipoPacto } : {},
    consulta.q ? { cliente: { nombre: { contains: consulta.q } } } : {},
    rangoFechas('fechaPacto', consulta.desde, consulta.hasta)
  );

  const [items, total] = await Promise.all([
    prisma.honorario.findMany({
      where,
      include: INCLUDE_BASE,
      orderBy: ordenar(consulta, ORDENABLES, 'fechaPacto'),
      skip,
      take,
    }),
    prisma.honorario.count({ where }),
  ]);

  let serializados = items.map(serializar);

  // Filtro por situacion de cobranza: se aplica despues del calculo porque la
  // situacion es derivada, no una columna de la base.
  if (consulta.situacion) {
    serializados = serializados.filter((h) => h.situacion === consulta.situacion);
  }

  return { items: serializados, page, limit, total };
}

export async function obtener(id) {
  const hon = await prisma.honorario.findUnique({ where: { id }, include: INCLUDE_BASE });
  exigirExistencia(hon, 'El honorario no existe o fue eliminado');
  return serializar(hon);
}

/**
 * Resumen de cobranza del panel derecho: totales, mayores saldos pendientes y
 * lo cobrado en el periodo elegido.
 */
export async function resumen(consulta) {
  const items = await prisma.honorario.findMany({
    where: soloVivos(),
    include: INCLUDE_BASE,
  });

  const calculados = items.map(serializar);
  const totales = resumirHonorarios(calculados);

  // Mayores saldos pendientes, agrupados POR CLIENTE (no por pacto): es lo que
  // se quiere ver para salir a cobrar.
  const porCliente = new Map();
  for (const h of calculados) {
    if (h.saldo <= 0) continue;
    const actual = porCliente.get(h.clienteId) || {
      clienteId: h.clienteId,
      cliente: h.cliente,
      total: 0,
      cobrado: 0,
      saldo: 0,
    };
    actual.total += h.totalConIva;
    actual.cobrado += h.cobrado;
    actual.saldo += h.saldo;
    porCliente.set(h.clienteId, actual);
  }

  const mayoresSaldos = Array.from(porCliente.values())
    .map((c) =>
      Object.assign(c, {
        porcentajeCobrado: c.total > 0 ? Math.round((c.cobrado / c.total) * 100) : 0,
      })
    )
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 10);

  // Cobrado del periodo: se filtra por la FECHA DEL PAGO, no la del pacto.
  let cobradoPeriodo = 0;
  if (consulta && consulta.desde && consulta.hasta) {
    const pagos = await prisma.honorarioPago.findMany({
      where: Object.assign(
        { honorario: soloVivos() },
        rangoFechas('fecha', consulta.desde, consulta.hasta)
      ),
      select: { monto: true },
    });
    cobradoPeriodo = pagos.reduce((acc, p) => acc + aNumero(p.monto), 0);
  }

  return {
    totales,
    mayoresSaldos,
    cobradoPeriodo: Math.round(cobradoPeriodo * 100) / 100,
    clientesConPacto: porCliente.size,
  };
}

function aDatosPrisma(body) {
  return {
    clienteId: body.clienteId,
    expedienteId: body.expedienteId,
    fechaPacto: aDateUTC(body.fechaPacto),
    tipoPacto: body.tipoPacto,
    montoPactado: body.montoPactado,
    ivaPorcentaje: body.ivaPorcentaje,
    observaciones: body.observaciones,
  };
}

export async function crear(body, req) {
  await validarReferencias(body);

  const hon = await prisma.$transaction(async (tx) => {
    const creado = await crearConCodigo(tx, 'honorario', aDatosPrisma(body), {
      include: INCLUDE_BASE,
    });
    await registrarAlta({
      tx,
      req,
      entidad: 'Honorario',
      entidadId: creado.id,
      resumen: creado.codigo + ' - ' + body.montoPactado + ' (' + body.tipoPacto + ')',
    });
    return creado;
  });

  return serializar(hon);
}

export async function actualizar(id, body, req) {
  await validarReferencias(body);

  const actual = await prisma.honorario.findUnique({ where: { id } });
  exigirExistencia(actual, 'El honorario no existe o fue eliminado');
  verificarVersion(actual, body.version, 'Honorario');

  const datos = aDatosPrisma(body);

  const hon = await prisma.$transaction(async (tx) => {
    const guardado = await tx.honorario.update({
      where: { id },
      data: Object.assign({}, datos, { version: { increment: 1 } }),
      include: INCLUDE_BASE,
    });
    await registrarCambios({
      tx,
      req,
      entidad: 'Honorario',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });
    return guardado;
  });

  return serializar(hon);
}

export async function eliminar(id, req) {
  const actual = await prisma.honorario.findUnique({
    where: { id },
    include: { _count: { select: { pagos: true } } },
  });
  exigirExistencia(actual, 'El honorario no existe o ya fue eliminado');

  await prisma.$transaction(async (tx) => {
    await tx.honorario.update({
      where: { id },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'Honorario',
      entidadId: id,
      resumen: actual.codigo + ' (tenia ' + actual._count.pagos + ' pago/s registrado/s)',
    });
  });

  return { id };
}

// ---------------------------------------------------------------------------
//  Pagos
// ---------------------------------------------------------------------------

export async function agregarPago(honorarioId, body, req) {
  const hon = await prisma.honorario.findUnique({
    where: { id: honorarioId },
    include: { pagos: true },
  });
  exigirExistencia(hon, 'El honorario no existe o fue eliminado');

  await validarItem(body.medioPagoId, 'MEDIO_PAGO', 'Medio de pago');

  // Aviso, no bloqueo: cobrar de mas puede ser legitimo (un anticipo de otra
  // causa, un ajuste). Se deja pasar pero queda registrado en la auditoria.
  const calculoPrevio = calcularHonorario(hon, hon.pagos);
  const excede = body.monto > calculoPrevio.saldo + 0.01;

  await prisma.$transaction(async (tx) => {
    const pago = await tx.honorarioPago.create({
      data: {
        honorarioId,
        fecha: aDateUTC(body.fecha),
        monto: body.monto,
        medioPagoId: body.medioPagoId,
        observacion: body.observacion,
      },
    });
    await registrarAccion({
      tx,
      req,
      entidad: 'HonorarioPago',
      entidadId: pago.id,
      accion: 'CREAR',
      campo: 'monto',
      valorNuevo:
        'pago de ' + body.monto + ' sobre ' + hon.codigo + (excede ? ' (EXCEDE EL SALDO)' : ''),
    });
  });

  return obtener(honorarioId);
}

export async function eliminarPago(honorarioId, pagoId, req) {
  const pago = await prisma.honorarioPago.findUnique({ where: { id: pagoId } });
  if (!pago || pago.honorarioId !== honorarioId) {
    throw ApiError.noEncontrado('El pago no existe en este honorario');
  }

  await prisma.$transaction(async (tx) => {
    // Los pagos si se borran fisicamente: son pocos, y un pago mal cargado no
    // deberia quedar sumando. La auditoria conserva el rastro de que existio.
    await tx.honorarioPago.delete({ where: { id: pagoId } });
    await registrarAccion({
      tx,
      req,
      entidad: 'HonorarioPago',
      entidadId: pagoId,
      accion: 'ELIMINAR',
      valorAnterior: 'pago de ' + aNumero(pago.monto) + ' del ' + aISO(pago.fecha),
    });
  });

  return obtener(honorarioId);
}

async function validarReferencias(body) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: body.clienteId, eliminadoEn: null },
  });
  if (!cliente) throw ApiError.badRequest('El cliente elegido no existe o fue eliminado');

  if (body.expedienteId) {
    const exp = await prisma.expediente.findFirst({
      where: { id: body.expedienteId, eliminadoEn: null },
    });
    if (!exp) throw ApiError.badRequest('El expediente elegido no existe o fue eliminado');
    if (exp.clienteId !== body.clienteId) {
      throw ApiError.badRequest('El expediente elegido pertenece a otro cliente');
    }
  }
}

export { serializar as serializarHonorario };
