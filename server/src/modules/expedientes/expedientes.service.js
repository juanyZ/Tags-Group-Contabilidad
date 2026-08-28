/**
 * EXPEDIENTES / CAUSAS.
 *
 * Los campos que en la planilla habia que mirar a mano (proximo vencimiento,
 * situacion, cantidad de plazos pendientes) aca se calculan solos a partir de
 * los eventos puntuales de la causa. Ademas se suman dos controles que la
 * planilla no tenia: caducidad de instancia y prescripcion.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aDateUTC, aISO, hoyISO } from '../../utils/fechas.js';
import { aNumero } from '../../utils/dinero.js';
import { crearConCodigo } from '../../services/codigos.service.js';
import { registrarAlta, registrarBaja, registrarCambios } from '../../services/auditoria.service.js';
import { resumenPorExpediente } from '../../services/vencimientos.service.js';
import { fechaCaducidad, alertaPlazoLargo } from '../../services/plazos.service.js';
import { parametrosVencimientos } from '../config/config.service.js';
import { validarItem } from '../catalogos/catalogos.service.js';
import {
  soloVivos,
  paginar,
  ordenar,
  buscarEn,
  verificarVersion,
  exigirExistencia,
} from '../../lib/consultas.js';
import { ORDENABLES } from './expedientes.schema.js';

const INCLUDE_BASE = {
  cliente: { select: { id: true, codigo: true, nombre: true } },
  fuero: { select: { id: true, valor: true } },
  juzgado: { select: { id: true, valor: true } },
  etapa: { select: { id: true, valor: true } },
  estado: { select: { id: true, valor: true, computaComoActivo: true } },
  abogado: { select: { id: true, nombre: true } },
};

function serializar(exp, extras) {
  if (!exp) return null;
  return Object.assign(
    {
      id: exp.id,
      codigo: exp.codigo,
      fechaInicio: aISO(exp.fechaInicio),
      caratula: exp.caratula,
      clienteId: exp.clienteId,
      cliente: exp.cliente ? exp.cliente.nombre : null,
      clienteCodigo: exp.cliente ? exp.cliente.codigo : null,
      caracter: exp.caracter,
      contraparte: exp.contraparte,
      fueroId: exp.fueroId,
      fuero: exp.fuero ? exp.fuero.valor : null,
      juzgadoId: exp.juzgadoId,
      juzgado: exp.juzgado ? exp.juzgado.valor : null,
      numeroExpediente: exp.numeroExpediente,
      etapaId: exp.etapaId,
      etapa: exp.etapa ? exp.etapa.valor : null,
      estadoId: exp.estadoId,
      estado: exp.estado ? exp.estado.valor : null,
      estadoEsActivo: exp.estado ? exp.estado.computaComoActivo : true,
      abogadoId: exp.abogadoId,
      abogado: exp.abogado ? exp.abogado.nombre : null,
      ultimaActuacion: aISO(exp.ultimaActuacion),
      montoReclamado: exp.montoReclamado == null ? null : aNumero(exp.montoReclamado),
      mesesCaducidad: exp.mesesCaducidad,
      fechaPrescripcion: aISO(exp.fechaPrescripcion),
      observaciones: exp.observaciones,
      version: exp.version,
      eliminadoEn: exp.eliminadoEn ? exp.eliminadoEn.toISOString() : null,
    },
    extras || {}
  );
}

function aDatosPrisma(body) {
  return {
    fechaInicio: aDateUTC(body.fechaInicio),
    caratula: body.caratula,
    clienteId: body.clienteId,
    caracter: body.caracter,
    contraparte: body.contraparte,
    fueroId: body.fueroId,
    juzgadoId: body.juzgadoId,
    numeroExpediente: body.numeroExpediente,
    etapaId: body.etapaId,
    estadoId: body.estadoId,
    abogadoId: body.abogadoId,
    ultimaActuacion: aDateUTC(body.ultimaActuacion),
    montoReclamado: body.montoReclamado == null ? null : body.montoReclamado,
    mesesCaducidad: body.mesesCaducidad,
    fechaPrescripcion: aDateUTC(body.fechaPrescripcion),
    observaciones: body.observaciones,
  };
}

/**
 * Alertas de plazo largo: caducidad de instancia y prescripcion.
 * Se calculan, no se guardan: dependen del dia de hoy.
 */
function alertasProcesales(exp, params, hoy) {
  const meses = exp.mesesCaducidad || params.mesesCaducidadDefault;
  const baseCaducidad = aISO(exp.ultimaActuacion) || aISO(exp.fechaInicio);

  const caducidad = baseCaducidad
    ? alertaPlazoLargo(fechaCaducidad(baseCaducidad, meses), hoy, 60)
    : null;

  const prescripcion = exp.fechaPrescripcion
    ? alertaPlazoLargo(aISO(exp.fechaPrescripcion), hoy, 90)
    : null;

  return {
    caducidad: caducidad ? Object.assign({ mesesAplicados: meses }, caducidad) : null,
    prescripcion,
  };
}

export async function listar(consulta, filtroPropio) {
  const { skip, take, page, limit } = paginar(consulta);
  const params = await parametrosVencimientos();
  const hoy = hoyISO();

  const where = Object.assign(
    consulta.incluirEliminados ? {} : soloVivos(),
    buscarEn(['caratula', 'codigo', 'numeroExpediente', 'contraparte'], consulta.q),
    consulta.clienteId ? { clienteId: consulta.clienteId } : {},
    consulta.fueroId ? { fueroId: consulta.fueroId } : {},
    consulta.estadoId ? { estadoId: consulta.estadoId } : {},
    consulta.etapaId ? { etapaId: consulta.etapaId } : {},
    consulta.abogadoId ? { abogadoId: consulta.abogadoId } : {},
    consulta.caracter ? { caracter: consulta.caracter } : {},
    // Filtro "solo causas activas": excluye las que estan en un estado marcado
    // como no activo (concluido, archivado).
    consulta.soloActivas ? { estado: { computaComoActivo: true } } : {},
    filtroPropio || {}
  );

  const [items, total] = await Promise.all([
    prisma.expediente.findMany({
      where,
      include: INCLUDE_BASE,
      orderBy: ordenar(consulta, ORDENABLES, 'fechaInicio'),
      skip,
      take,
    }),
    prisma.expediente.count({ where }),
  ]);

  // Una sola consulta de vencimientos para toda la pagina (evita el N+1).
  const resumenes = await resumenPorExpediente(
    items.map((e) => e.id),
    { hoy, umbralDias: params.umbralDias }
  );

  const serializados = items.map((exp) =>
    serializar(
      exp,
      Object.assign({}, resumenes.get(exp.id), { alertas: alertasProcesales(exp, params, hoy) })
    )
  );

  return { items: serializados, page, limit, total };
}

export async function obtener(id) {
  const params = await parametrosVencimientos();
  const hoy = hoyISO();

  const exp = await prisma.expediente.findUnique({ where: { id }, include: INCLUDE_BASE });
  exigirExistencia(exp, 'El expediente no existe o fue eliminado');

  const resumenes = await resumenPorExpediente([id], { hoy, umbralDias: params.umbralDias });

  return serializar(
    exp,
    Object.assign({}, resumenes.get(id), { alertas: alertasProcesales(exp, params, hoy) })
  );
}

/** Lista liviana para los desplegables de eventos, gastos y ficha. */
export async function opciones() {
  return prisma.expediente.findMany({
    where: soloVivos(),
    select: {
      id: true,
      codigo: true,
      caratula: true,
      clienteId: true,
      cliente: { select: { id: true, nombre: true } },
    },
    orderBy: { caratula: 'asc' },
    take: 2000,
  });
}

export async function crear(body, req) {
  await validarReferencias(body);

  const expediente = await prisma.$transaction(async (tx) => {
    const creado = await crearConCodigo(tx, 'expediente', aDatosPrisma(body), {
      include: INCLUDE_BASE,
    });
    await registrarAlta({
      tx,
      req,
      entidad: 'Expediente',
      entidadId: creado.id,
      resumen: creado.codigo + ' - ' + creado.caratula,
    });
    return creado;
  });

  return serializar(expediente);
}

export async function actualizar(id, body, req) {
  await validarReferencias(body);

  const actual = await prisma.expediente.findUnique({ where: { id } });
  exigirExistencia(actual, 'El expediente no existe o fue eliminado');
  verificarVersion(actual, body.version, 'Expediente');

  const datos = aDatosPrisma(body);

  const expediente = await prisma.$transaction(async (tx) => {
    const guardado = await tx.expediente.update({
      where: { id },
      data: Object.assign({}, datos, { version: { increment: 1 } }),
      include: INCLUDE_BASE,
    });
    await registrarCambios({
      tx,
      req,
      entidad: 'Expediente',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });
    return guardado;
  });

  return serializar(expediente);
}

export async function eliminar(id, req) {
  const actual = await prisma.expediente.findUnique({ where: { id } });
  exigirExistencia(actual, 'El expediente no existe o ya fue eliminado');

  const pendientes = await prisma.eventoPuntual.count({
    where: { expedienteId: id, eliminadoEn: null, estado: { in: ['PENDIENTE', 'EN_CURSO', 'REPROGRAMADO'] } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.expediente.update({
      where: { id },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'Expediente',
      entidadId: id,
      resumen:
        actual.codigo +
        ' - ' +
        actual.caratula +
        (pendientes > 0 ? ' (tenia ' + pendientes + ' plazo/s pendiente/s)' : ''),
    });
  });

  return { id, plazosPendientes: pendientes };
}

export async function restaurar(id, req) {
  const actual = await prisma.expediente.findUnique({ where: { id } });
  if (!actual) throw ApiError.noEncontrado('El expediente no existe');
  if (!actual.eliminadoEn) throw ApiError.badRequest('El expediente no esta eliminado');

  const expediente = await prisma.$transaction(async (tx) => {
    const guardado = await tx.expediente.update({
      where: { id },
      data: { eliminadoEn: null, version: { increment: 1 } },
      include: INCLUDE_BASE,
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'Expediente',
      entidadId: id,
      resumen: 'restaurado: ' + actual.codigo,
    });
    return guardado;
  });

  return serializar(expediente);
}

async function validarReferencias(body) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: body.clienteId, eliminadoEn: null },
  });
  if (!cliente) throw ApiError.badRequest('El cliente elegido no existe o fue eliminado');

  await Promise.all([
    validarItem(body.fueroId, 'FUERO', 'Fuero / materia'),
    validarItem(body.juzgadoId, 'JUZGADO', 'Juzgado / organismo'),
    validarItem(body.etapaId, 'ETAPA_PROCESAL', 'Etapa procesal'),
    validarItem(body.estadoId, 'ESTADO_EXPEDIENTE', 'Estado del expediente'),
    body.abogadoId
      ? prisma.abogado.findUnique({ where: { id: body.abogadoId } }).then((a) => {
          if (!a) throw ApiError.badRequest('El abogado responsable elegido no existe');
        })
      : null,
  ]);
}

export { serializar as serializarExpediente, alertasProcesales };
