/**
 * EVENTOS RECURRENTES.
 *
 * Se carga una sola vez el evento y su periodicidad; el proximo vencimiento se
 * proyecta solo (services/recurrentes.service.js).
 *
 * Mejora sobre la planilla: alla el cumplimiento era un tilde en una columna
 * que habia que SELECCIONAR Y BORRAR A MANO a fin de mes, y que no dejaba
 * ningun rastro de los meses anteriores. Aca cada periodo cumplido queda
 * registrado con fecha y autor, y el proximo vencimiento avanza solo.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aDateUTC, aISO, hoyISO } from '../../utils/fechas.js';
import { crearConCodigo } from '../../services/codigos.service.js';
import { registrarAccion, registrarAlta, registrarBaja, registrarCambios } from '../../services/auditoria.service.js';
import { decorarVencimiento, ordenarPorUrgencia } from '../../services/semaforo.service.js';
import { proyectarProxima, proximaOcurrencia } from '../../services/recurrentes.service.js';
import { parametrosVencimientos } from '../config/config.service.js';
import { validarItem } from '../catalogos/catalogos.service.js';
import { soloVivos, verificarVersion, exigirExistencia } from '../../lib/consultas.js';

const INCLUDE_BASE = {
  tipo: { select: { id: true, valor: true } },
  responsable: { select: { id: true, nombre: true } },
};

/**
 * Trae los cumplimientos de varios recurrentes de una sola vez y los agrupa
 * por recurrenteId, para no hacer una consulta por fila.
 */
async function cumplimientosPorRecurrente(ids) {
  const mapa = new Map();
  if (ids.length === 0) return mapa;

  const filas = await prisma.recurrenteCumplimiento.findMany({
    where: { recurrenteId: { in: ids } },
    select: { recurrenteId: true, periodoClave: true },
  });

  for (const f of filas) {
    if (!mapa.has(f.recurrenteId)) mapa.set(f.recurrenteId, new Set());
    mapa.get(f.recurrenteId).add(f.periodoClave);
  }
  return mapa;
}

function serializar(rec, ctx, clavesCumplidas) {
  const proyeccion = proyectarProxima(rec, {
    hoy: ctx.hoy,
    clavesCumplidas: clavesCumplidas || new Set(),
  });

  const base = {
    id: rec.id,
    codigo: rec.codigo,
    origen: 'RECURRENTE',
    descripcion: rec.descripcion,
    tipoId: rec.tipoId,
    tipo: rec.tipo ? rec.tipo.valor : null,
    periodicidad: rec.periodicidad,
    fechaBase: aISO(rec.fechaBase),
    responsableId: rec.responsableId,
    responsable: rec.responsable ? rec.responsable.nombre : null,
    activo: rec.activo,
    observaciones: rec.observaciones,
    version: rec.version,
    fechaVto: proyeccion.fechaVto,
    claveCumplimiento: proyeccion.claveCumplimiento,
    ultimaCumplida: proyeccion.ultimaCumplida || null,
    // Un recurrente inactivo no esta "cumplido": esta apagado. Se marca como
    // tal para que la UI lo muestre en gris y no en verde.
    inactivo: !rec.activo,
  };

  return decorarVencimiento(base, ctx);
}

export async function listar(consulta) {
  const params = await parametrosVencimientos();
  const ctx = { hoy: hoyISO(), umbralDias: params.umbralDias };

  const where = Object.assign(
    soloVivos(),
    consulta.q ? { descripcion: { contains: consulta.q } } : {},
    consulta.activo != null ? { activo: consulta.activo } : {},
    consulta.responsableId ? { responsableId: consulta.responsableId } : {},
    consulta.periodicidad ? { periodicidad: consulta.periodicidad } : {}
  );

  const items = await prisma.eventoRecurrente.findMany({
    where,
    include: INCLUDE_BASE,
    orderBy: { codigo: 'asc' },
    // Son pocos por naturaleza (la planilla soportaba 60). No se pagina: la
    // pantalla los muestra todos, que es como se usan.
    take: 500,
  });

  const cumplimientos = await cumplimientosPorRecurrente(items.map((r) => r.id));
  const serializados = items.map((r) => serializar(r, ctx, cumplimientos.get(r.id)));

  return ordenarPorUrgencia(serializados);
}

export async function obtener(id) {
  const params = await parametrosVencimientos();
  const rec = await prisma.eventoRecurrente.findUnique({ where: { id }, include: INCLUDE_BASE });
  exigirExistencia(rec, 'El evento recurrente no existe o fue eliminado');

  const cumplimientos = await cumplimientosPorRecurrente([id]);
  return serializar(rec, { hoy: hoyISO(), umbralDias: params.umbralDias }, cumplimientos.get(id));
}

/** Historial completo de cumplimientos: lo que la planilla no guardaba. */
export async function historial(id) {
  const rec = await prisma.eventoRecurrente.findUnique({ where: { id } });
  exigirExistencia(rec, 'El evento recurrente no existe');

  const filas = await prisma.recurrenteCumplimiento.findMany({
    where: { recurrenteId: id },
    orderBy: { periodoClave: 'desc' },
    take: 200,
  });

  return filas.map((f) => ({
    id: f.id,
    periodoClave: f.periodoClave,
    cumplidoEn: f.cumplidoEn.toISOString(),
    cumplidoPor: f.cumplidoPor,
    observacion: f.observacion,
  }));
}

function aDatosPrisma(body) {
  return {
    descripcion: body.descripcion,
    tipoId: body.tipoId,
    periodicidad: body.periodicidad,
    fechaBase: aDateUTC(body.fechaBase),
    responsableId: body.responsableId,
    activo: body.activo,
    observaciones: body.observaciones,
  };
}

export async function crear(body, req) {
  await validarReferencias(body);
  const params = await parametrosVencimientos();

  const rec = await prisma.$transaction(async (tx) => {
    const creado = await crearConCodigo(tx, 'eventoRecurrente', aDatosPrisma(body), {
      include: INCLUDE_BASE,
    });
    await registrarAlta({
      tx,
      req,
      entidad: 'EventoRecurrente',
      entidadId: creado.id,
      resumen: creado.codigo + ' - ' + creado.descripcion + ' (' + creado.periodicidad + ')',
    });
    return creado;
  });

  return serializar(rec, { hoy: hoyISO(), umbralDias: params.umbralDias }, new Set());
}

export async function actualizar(id, body, req) {
  await validarReferencias(body);

  const actual = await prisma.eventoRecurrente.findUnique({ where: { id } });
  exigirExistencia(actual, 'El evento recurrente no existe o fue eliminado');
  verificarVersion(actual, body.version, 'EventoRecurrente');

  const params = await parametrosVencimientos();
  const datos = aDatosPrisma(body);

  const rec = await prisma.$transaction(async (tx) => {
    const guardado = await tx.eventoRecurrente.update({
      where: { id },
      data: Object.assign({}, datos, { version: { increment: 1 } }),
      include: INCLUDE_BASE,
    });
    await registrarCambios({
      tx,
      req,
      entidad: 'EventoRecurrente',
      entidadId: id,
      anterior: actual,
      nuevo: datos,
    });
    return guardado;
  });

  const cumplimientos = await cumplimientosPorRecurrente([id]);
  return serializar(rec, { hoy: hoyISO(), umbralDias: params.umbralDias }, cumplimientos.get(id));
}

/**
 * Marca cumplida una ocurrencia concreta.
 *
 * La clave es la fecha de la ocurrencia, asi que la operacion es idempotente:
 * tildar dos veces el mismo periodo no duplica nada. Si no se indica periodo,
 * se toma la ocurrencia vigente.
 */
export async function marcarCumplido(id, periodoClave, observacion, req) {
  const rec = await prisma.eventoRecurrente.findUnique({ where: { id } });
  exigirExistencia(rec, 'El evento recurrente no existe');
  if (!rec.activo) throw ApiError.badRequest('El evento esta inactivo: no tiene periodo que cumplir');

  const hoy = hoyISO();
  const clave = periodoClave || proximaOcurrencia(rec.fechaBase, rec.periodicidad, hoy);
  if (!clave) throw ApiError.badRequest('No se pudo determinar el periodo a marcar');

  const params = await parametrosVencimientos();

  await prisma.$transaction(async (tx) => {
    await tx.recurrenteCumplimiento.upsert({
      where: { recurrenteId_periodoClave: { recurrenteId: id, periodoClave: clave } },
      create: {
        recurrenteId: id,
        periodoClave: clave,
        cumplidoPor: req.usuario ? req.usuario.nombre : null,
        observacion: observacion || null,
      },
      update: { observacion: observacion || null },
    });
    await registrarAccion({
      tx,
      req,
      entidad: 'EventoRecurrente',
      entidadId: id,
      accion: 'ACTUALIZAR',
      campo: 'cumplimiento',
      valorNuevo: 'periodo ' + clave + ' cumplido',
    });
  });

  const cumplimientos = await cumplimientosPorRecurrente([id]);
  const conRelaciones = await prisma.eventoRecurrente.findUnique({
    where: { id },
    include: INCLUDE_BASE,
  });

  return serializar(conRelaciones, { hoy, umbralDias: params.umbralDias }, cumplimientos.get(id));
}

/** Deshace el tilde de un periodo (se marco por error). */
export async function desmarcarCumplido(id, periodoClave, req) {
  const rec = await prisma.eventoRecurrente.findUnique({ where: { id } });
  exigirExistencia(rec, 'El evento recurrente no existe');

  const params = await parametrosVencimientos();

  await prisma.$transaction(async (tx) => {
    const borrados = await tx.recurrenteCumplimiento.deleteMany({
      where: { recurrenteId: id, periodoClave },
    });
    if (borrados.count > 0) {
      await registrarAccion({
        tx,
        req,
        entidad: 'EventoRecurrente',
        entidadId: id,
        accion: 'ACTUALIZAR',
        campo: 'cumplimiento',
        valorAnterior: 'periodo ' + periodoClave + ' cumplido',
        valorNuevo: 'pendiente',
      });
    }
  });

  const cumplimientos = await cumplimientosPorRecurrente([id]);
  const conRelaciones = await prisma.eventoRecurrente.findUnique({
    where: { id },
    include: INCLUDE_BASE,
  });

  return serializar(conRelaciones, { hoy: hoyISO(), umbralDias: params.umbralDias }, cumplimientos.get(id));
}

export async function eliminar(id, req) {
  const actual = await prisma.eventoRecurrente.findUnique({ where: { id } });
  exigirExistencia(actual, 'El evento recurrente no existe o ya fue eliminado');

  await prisma.$transaction(async (tx) => {
    await tx.eventoRecurrente.update({
      where: { id },
      data: { eliminadoEn: new Date(), version: { increment: 1 } },
    });
    await registrarBaja({
      tx,
      req,
      entidad: 'EventoRecurrente',
      entidadId: id,
      resumen: actual.codigo + ' - ' + actual.descripcion,
    });
  });

  return { id };
}

async function validarReferencias(body) {
  await Promise.all([
    validarItem(body.tipoId, 'TIPO_EVENTO_RECURRENTE', 'Tipo de evento'),
    body.responsableId
      ? prisma.abogado.findUnique({ where: { id: body.responsableId } }).then((a) => {
          if (!a) throw ApiError.badRequest('El responsable elegido no existe');
        })
      : null,
  ]);
}

export { serializar as serializarRecurrente, cumplimientosPorRecurrente };
