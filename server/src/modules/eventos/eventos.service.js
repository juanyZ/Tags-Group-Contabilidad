/**
 * EVENTOS PUNTUALES: audiencias, plazos, escritos, pericias, mediaciones,
 * cedulas y reuniones. Es la solapa que mas se usa en el dia a dia.
 *
 * El cliente NO se guarda en el evento: se deriva del expediente. Guardarlo
 * seria duplicar un dato que ya vive en otro lado y que quedaria desactualizado
 * el dia que una causa cambie de titular.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aDateUTC, aISO, hoyISO } from '../../utils/fechas.js';
import { crearConCodigo } from '../../services/codigos.service.js';
import { registrarAlta, registrarBaja, registrarCambios } from '../../services/auditoria.service.js';
import { decorarVencimiento, ordenarPorUrgencia } from '../../services/semaforo.service.js';
import { parametrosVencimientos } from '../config/config.service.js';
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
import { ORDENABLES } from './eventos.schema.js';

const INCLUDE_BASE = {
  tipo: { select: { id: true, valor: true } },
  responsable: { select: { id: true, nombre: true } },
  expediente: {
    select: {
      id: true,
      codigo: true,
      caratula: true,
      cliente: { select: { id: true, nombre: true } },
    },
  },
};

/** Un evento cumplido o cancelado deja de ser trabajo pendiente. */
function estadoACondiciones(estado) {
  return {
    cumplido: estado === 'CUMPLIDO',
    cancelado: estado === 'CANCELADO',
  };
}

function serializar(ev, ctx) {
  if (!ev) return null;

  const base = {
    id: ev.id,
    codigo: ev.codigo,
    origen: 'PUNTUAL', // lo usa el calendario para el icono
    fechaVto: aISO(ev.fechaVto),
    hora: ev.hora,
    tipoId: ev.tipoId,
    tipo: ev.tipo ? ev.tipo.valor : null,
    descripcion: ev.descripcion,
    expedienteId: ev.expedienteId,
    expediente: ev.expediente ? ev.expediente.caratula : null,
    expedienteCodigo: ev.expediente ? ev.expediente.codigo : null,
    // Derivado, nunca guardado.
    clienteId: ev.expediente && ev.expediente.cliente ? ev.expediente.cliente.id : null,
    cliente: ev.expediente && ev.expediente.cliente ? ev.expediente.cliente.nombre : null,
    responsableId: ev.responsableId,
    responsable: ev.responsable ? ev.responsable.nombre : null,
    prioridad: ev.prioridad,
    estado: ev.estado,
    observaciones: ev.observaciones,
    version: ev.version,
  };

  const condiciones = estadoACondiciones(ev.estado);

  return decorarVencimiento(Object.assign(base, condiciones), ctx);
}

function aDatosPrisma(body) {
  return {
    fechaVto: aDateUTC(body.fechaVto),
    hora: body.hora,
    tipoId: body.tipoId,
    descripcion: body.descripcion,
    expedienteId: body.expedienteId,
    responsableId: body.responsableId,
    prioridad: body.prioridad,
    estado: body.estado,
    observaciones: body.observaciones,
  };
}

export async function listar(consulta) {
  const { skip, take, page, limit } = paginar(consulta);
  const params = await parametrosVencimientos();
  const ctx = { hoy: hoyISO(), umbralDias: params.umbralDias };

  const where = Object.assign(
    consulta.incluirEliminados ? {} : soloVivos(),
    buscarEn(['descripcion', 'codigo'], consulta.q),
    consulta.expedienteId ? { expedienteId: consulta.expedienteId } : {},
    consulta.responsableId ? { responsableId: consulta.responsableId } : {},
    consulta.tipoId ? { tipoId: consulta.tipoId } : {},
    consulta.prioridad ? { prioridad: consulta.prioridad } : {},
    consulta.estado ? { estado: consulta.estado } : {},
    consulta.soloPendientes ? { estado: { in: ['PENDIENTE', 'EN_CURSO', 'REPROGRAMADO'] } } : {},
    // "Eventos del estudio" = los que no tienen expediente.
    consulta.soloEstudio ? { expedienteId: null } : {},
    consulta.clienteId ? { expediente: { clienteId: consulta.clienteId } } : {},
    rangoFechas('fechaVto', consulta.desde, consulta.hasta)
  );

  const [items, total] = await Promise.all([
    prisma.eventoPuntual.findMany({
      where,
      include: INCLUDE_BASE,
      orderBy: ordenar(consulta, ORDENABLES, 'fechaVto'),
      skip,
      take,
    }),
    prisma.eventoPuntual.count({ where }),
  ]);

  let serializados = items.map((ev) => serializar(ev, ctx));

  // El orden por urgencia se aplica sobre la pagina ya traida. Es una decision
  // consciente: ordenar por situacion en SQL exigiria calcular el semaforo en
  // la base y duplicar ahi la logica que vive en el service.
  if (consulta.ordenarPor === 'urgencia' || !consulta.ordenarPor) {
    serializados = ordenarPorUrgencia(serializados);
  }

  return { items: serializados, page, limit, total };
}

export async function obtener(id) {
  const params = await parametrosVencimientos();
  const ev = await prisma.eventoPuntual.findUnique({ where: { id }, include: INCLUDE_BASE });
  exigirExistencia(ev, 'El evento no existe o fue eliminado');
  return serializar(ev, { hoy: hoyISO(), umbralDias: params.umbralDias });
}

export async function crear(body, req) {
  await validarReferencias(body);

  const params = await parametrosVencimientos();

  const evento = await prisma.$transaction(async (tx) => {
    const creado = await crearConCodigo(tx, 'eventoPuntual', aDatosPrisma(body), {
      include: INCLUDE_BASE,
    });
    await registrarAlta({
      tx,
      req,
      entidad: 'EventoPuntual',
      entidadId: creado.id,
      resumen: creado.codigo + ' - ' + creado.descripcion + ' (' + aISO(creado.fechaVto) + ')',
    });
    return creado;
  });

  return serializar(evento, { hoy: hoyISO(), umbralDias: params.umbralDias });
}

export async function actualizar(id, body, req) {
  await validarReferencias(body);

  const actual = await prisma.eventoPuntual.findUnique({ where: { id } });
  exigirExistencia(actual, 'El evento no existe o fue eliminado');
  verificarVersion(actual, body.version, 'EventoPuntual');

  const params = await parametrosVencimientos();
  const datos = aDatosPrisma(body);

  const evento = await prisma.$transaction(async (tx) => {
    const guardado = await tx.eventoPuntual.update({
      where: { id },
      data: Object.assign({}, datos, { version: { increment: 1 } }),
      include: INCLUDE_BASE,
    });
    await registrarCambios({
      tx,
      req,
      entidad: 'EventoPuntual',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });
    return guardado;
  });

  return serializar(evento, { hoy: hoyISO(), umbralDias: params.umbralDias });
}

/**
 * Cambio rapido de estado, que es la operacion mas frecuente del dia a dia
 * ("ya lo hice"). Se separa del PUT completo para que se pueda hacer desde la
 * grilla con un clic y sin mandar el objeto entero.
 */
export async function cambiarEstado(id, estado, req) {
  const actual = await prisma.eventoPuntual.findUnique({ where: { id } });
  exigirExistencia(actual, 'El evento no existe o fue eliminado');

  const params = await parametrosVencimientos();

  const evento = await prisma.$transaction(async (tx) => {
    const guardado = await tx.eventoPuntual.update({
      where: { id },
      data: { estado, version: { increment: 1 } },
      include: INCLUDE_BASE,
    });
    await registrarCambios({
      tx,
      req,
      entidad: 'EventoPuntual',
      entidadId: id,
      anterior: { estado: actual.estado },
      nuevo: { estado },
    });
    return guardado;
  });

  return serializar(evento, { hoy: hoyISO(), umbralDias: params.umbralDias });
}

export async function eliminar(id, req) {
  const actual = await prisma.eventoPuntual.findUnique({ where: { id } });
  exigirExistencia(actual, 'El evento no existe o ya fue eliminado');

  await prisma.$transaction(async (tx) => {
    await tx.eventoPuntual.update({
      where: { id },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'EventoPuntual',
      entidadId: id,
      resumen: actual.codigo + ' - ' + actual.descripcion,
    });
  });

  return { id };
}

async function validarReferencias(body) {
  if (body.expedienteId) {
    const exp = await prisma.expediente.findFirst({
      where: { id: body.expedienteId, eliminadoEn: null },
    });
    if (!exp) throw ApiError.badRequest('El expediente elegido no existe o fue eliminado');
  }

  await Promise.all([
    validarItem(body.tipoId, 'TIPO_EVENTO', 'Tipo de evento'),
    body.responsableId
      ? prisma.abogado.findUnique({ where: { id: body.responsableId } }).then((a) => {
          if (!a) throw ApiError.badRequest('El responsable elegido no existe');
        })
      : null,
  ]);
}

export { serializar as serializarEvento, INCLUDE_BASE as INCLUDE_EVENTO };
