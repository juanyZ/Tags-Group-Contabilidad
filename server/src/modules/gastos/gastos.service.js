/**
 * GASTOS DEL ESTUDIO.
 *
 * Dos familias: los de una causa (tasa de justicia, cedulas, peritos), que
 * pueden reintegrarse al estudio, y los generales de estructura (alquiler,
 * sueldos, servicios).
 *
 * Validacion que la planilla no tenia: si el gasto es "del expediente" y no se
 * eligio cual, NO SE GUARDA. En el Excel la celda quedaba pintada de rojo, el
 * gasto se guardaba igual y no entraba en la cuenta corriente de nadie: plata
 * puesta por el estudio que no se le reclamaba a ningun cliente.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aDateUTC, aISO } from '../../utils/fechas.js';
import { aNumero, redondear } from '../../utils/dinero.js';
import { crearConCodigo } from '../../services/codigos.service.js';
import { registrarAlta, registrarBaja, registrarCambios } from '../../services/auditoria.service.js';
import { validarItem } from '../catalogos/catalogos.service.js';
import {
  soloVivos,
  paginar,
  ordenar,
  buscarEn,
  rangoFechas,
  verificarVersion,
  exigirExistencia,
} from '../../lib/consultas.js';
import { ORDENABLES } from './gastos.schema.js';

const INCLUDE_BASE = {
  rubro: { select: { id: true, valor: true, scope: true } },
  medioPago: { select: { id: true, valor: true } },
  expediente: {
    select: {
      id: true,
      codigo: true,
      caratula: true,
      cliente: { select: { id: true, nombre: true } },
    },
  },
};

function serializar(g) {
  if (!g) return null;
  return {
    id: g.id,
    codigo: g.codigo,
    fecha: aISO(g.fecha),
    tipo: g.tipo,
    expedienteId: g.expedienteId,
    expediente: g.expediente ? g.expediente.caratula : null,
    expedienteCodigo: g.expediente ? g.expediente.codigo : null,
    // Derivado del expediente, igual que en los eventos.
    clienteId: g.expediente && g.expediente.cliente ? g.expediente.cliente.id : null,
    cliente: g.expediente && g.expediente.cliente ? g.expediente.cliente.nombre : null,
    rubroId: g.rubroId,
    rubro: g.rubro ? g.rubro.valor : null,
    detalle: g.detalle,
    medioPagoId: g.medioPagoId,
    medioPago: g.medioPago ? g.medioPago.valor : null,
    importe: aNumero(g.importe),
    reembolsable: g.reembolsable,
    estadoReintegro: g.estadoReintegro,
    observaciones: g.observaciones,
    version: g.version,
  };
}

function aDatosPrisma(body) {
  return {
    fecha: aDateUTC(body.fecha),
    tipo: body.tipo,
    // Un gasto general del estudio nunca lleva expediente, aunque el cliente
    // mande uno por error al cambiar el tipo en el formulario.
    expedienteId: body.tipo === 'EXPEDIENTE' ? body.expedienteId : null,
    rubroId: body.rubroId,
    detalle: body.detalle,
    medioPagoId: body.medioPagoId,
    importe: body.importe,
    reembolsable: body.tipo === 'EXPEDIENTE' ? body.reembolsable : false,
    estadoReintegro: body.tipo === 'EXPEDIENTE' ? body.estadoReintegro : 'NO_CORRESPONDE',
    observaciones: body.observaciones,
  };
}

export async function listar(consulta) {
  const { skip, take, page, limit } = paginar(consulta);

  const where = Object.assign(
    soloVivos(),
    buscarEn(['detalle', 'codigo'], consulta.q),
    consulta.tipo ? { tipo: consulta.tipo } : {},
    consulta.expedienteId ? { expedienteId: consulta.expedienteId } : {},
    consulta.clienteId ? { expediente: { clienteId: consulta.clienteId } } : {},
    consulta.rubroId ? { rubroId: consulta.rubroId } : {},
    consulta.estadoReintegro ? { estadoReintegro: consulta.estadoReintegro } : {},
    consulta.reembolsable != null ? { reembolsable: consulta.reembolsable } : {},
    rangoFechas('fecha', consulta.desde, consulta.hasta)
  );

  const [items, total] = await Promise.all([
    prisma.gasto.findMany({
      where,
      include: INCLUDE_BASE,
      orderBy: ordenar(consulta, ORDENABLES, 'fecha'),
      skip,
      take,
    }),
    prisma.gasto.count({ where }),
  ]);

  return { items: items.map(serializar), page, limit, total };
}

export async function obtener(id) {
  const g = await prisma.gasto.findUnique({ where: { id }, include: INCLUDE_BASE });
  exigirExistencia(g, 'El gasto no existe o fue eliminado');
  return serializar(g);
}

/**
 * Resumen del panel derecho: totales del periodo, rubros mas caros y el total
 * historico pendiente de reintegro.
 */
export async function resumen(consulta) {
  const wherePeriodo = Object.assign(soloVivos(), rangoFechas('fecha', consulta.desde, consulta.hasta));

  const [delPeriodo, aReintegrar] = await Promise.all([
    prisma.gasto.findMany({
      where: wherePeriodo,
      include: { rubro: { select: { valor: true } } },
    }),
    // El pendiente de reintegro es HISTORICO, no del periodo: es plata que el
    // estudio puso y todavia no le devolvieron, sin importar cuando fue.
    prisma.gasto.findMany({
      where: Object.assign(soloVivos(), {
        tipo: 'EXPEDIENTE',
        reembolsable: true,
        estadoReintegro: 'PENDIENTE',
      }),
      select: { importe: true },
    }),
  ]);

  let totalPeriodo = 0;
  let totalCausas = 0;
  let totalEstudio = 0;
  const porRubro = new Map();

  for (const g of delPeriodo) {
    const importe = aNumero(g.importe);
    totalPeriodo += importe;
    if (g.tipo === 'EXPEDIENTE') totalCausas += importe;
    else totalEstudio += importe;

    const nombre = g.rubro ? g.rubro.valor : 'Sin rubro';
    porRubro.set(nombre, (porRubro.get(nombre) || 0) + importe);
  }

  const totalAReintegrar = aReintegrar.reduce((acc, g) => acc + aNumero(g.importe), 0);

  const rubros = Array.from(porRubro.entries())
    .map(([rubro, importe]) => ({
      rubro,
      importe: redondear(importe),
      porcentaje: totalPeriodo > 0 ? Math.round((importe / totalPeriodo) * 100) : 0,
    }))
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 10);

  return {
    totalPeriodo: redondear(totalPeriodo),
    totalCausas: redondear(totalCausas),
    totalEstudio: redondear(totalEstudio),
    totalAReintegrar: redondear(totalAReintegrar),
    cantidad: delPeriodo.length,
    promedioPorGasto: delPeriodo.length > 0 ? redondear(totalPeriodo / delPeriodo.length) : 0,
    rubros,
  };
}

export async function crear(body, req) {
  await validarReferencias(body);

  const gasto = await prisma.$transaction(async (tx) => {
    const creado = await crearConCodigo(tx, 'gasto', aDatosPrisma(body), {
      include: INCLUDE_BASE,
    });
    await registrarAlta({
      tx,
      req,
      entidad: 'Gasto',
      entidadId: creado.id,
      resumen: creado.codigo + ' - ' + body.importe + ' (' + body.tipo + ')',
    });
    return creado;
  });

  return serializar(gasto);
}

export async function actualizar(id, body, req) {
  await validarReferencias(body);

  const actual = await prisma.gasto.findUnique({ where: { id } });
  exigirExistencia(actual, 'El gasto no existe o fue eliminado');
  verificarVersion(actual, body.version, 'Gasto');

  const datos = aDatosPrisma(body);

  const gasto = await prisma.$transaction(async (tx) => {
    const guardado = await tx.gasto.update({
      where: { id },
      data: Object.assign({}, datos, { version: { increment: 1 } }),
      include: INCLUDE_BASE,
    });
    await registrarCambios({
      tx,
      req,
      entidad: 'Gasto',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });
    return guardado;
  });

  return serializar(gasto);
}

/** Marca uno o varios gastos como reintegrados (operacion de a lote). */
export async function marcarReintegro(ids, estado, req) {
  const gastos = await prisma.gasto.findMany({
    where: { id: { in: ids }, eliminadoEn: null },
  });
  if (gastos.length === 0) throw ApiError.noEncontrado('No se encontraron gastos para actualizar');

  const noReembolsables = gastos.filter((g) => !g.reembolsable && estado === 'REINTEGRADO');
  if (noReembolsables.length > 0) {
    throw ApiError.badRequest(
      'Hay gastos marcados como no reembolsables: no se pueden dar por reintegrados'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.gasto.updateMany({
      where: { id: { in: ids } },
      data: { estadoReintegro: estado },
    });
    for (const g of gastos) {
      await registrarCambios({
        tx,
        req,
        entidad: 'Gasto',
        entidadId: g.id,
        anterior: { estadoReintegro: g.estadoReintegro },
        nuevo: { estadoReintegro: estado },
      });
    }
  });

  return { actualizados: gastos.length, estado };
}

export async function eliminar(id, req) {
  const actual = await prisma.gasto.findUnique({ where: { id } });
  exigirExistencia(actual, 'El gasto no existe o ya fue eliminado');

  await prisma.$transaction(async (tx) => {
    await tx.gasto.update({
      where: { id },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'Gasto',
      entidadId: id,
      resumen: actual.codigo + ' - ' + aNumero(actual.importe),
    });
  });

  return { id };
}

async function validarReferencias(body) {
  // LA validacion que resuelve el bug de la celda roja del Excel.
  if (body.tipo === 'EXPEDIENTE') {
    if (!body.expedienteId) {
      throw ApiError.badRequest(
        'Un gasto del expediente tiene que indicar de que causa es. Sin eso no entraria en la cuenta corriente de ningun cliente.',
        { codigo: 'EXPEDIENTE_REQUERIDO', detalles: { campo: 'expedienteId' } }
      );
    }
    const exp = await prisma.expediente.findFirst({
      where: { id: body.expedienteId, eliminadoEn: null },
    });
    if (!exp) throw ApiError.badRequest('El expediente elegido no existe o fue eliminado');
  }

  // El rubro tiene que corresponder al tipo de gasto: no se puede imputar
  // "Alquiler de la oficina" a una causa ni "Tasa de justicia" a la estructura.
  if (body.rubroId) {
    const rubro = await validarItem(body.rubroId, 'RUBRO_GASTO', 'Rubro');
    if (rubro.scope && rubro.scope !== body.tipo) {
      throw ApiError.badRequest(
        'El rubro "' + rubro.valor + '" no corresponde a un gasto de tipo ' + body.tipo
      );
    }
  }

  await validarItem(body.medioPagoId, 'MEDIO_PAGO', 'Medio de pago');
}

export { serializar as serializarGasto };
