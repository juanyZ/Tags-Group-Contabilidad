/**
 * CONFIGURACION DEL ESTUDIO (fila unica) mas los parametros que consumen todas
 * las vistas: umbral del semaforo, ventana de proximos vencimientos, etc.
 *
 * Se cachea en memoria: la lee practicamente cada endpoint y cambia una vez
 * cada varios meses. El cache se invalida al guardar, asi que no hay ventana
 * en la que alguien vea un umbral viejo despues de cambiarlo.
 */
import { prisma } from '../../config/prisma.js';
import { registrarCambios } from '../../services/auditoria.service.js';
import { aNumero } from '../../utils/dinero.js';

const ID_CONFIG = 1;

// TTL corto ademas de la invalidacion explicita: si en el futuro hubiera mas
// de un proceso (por ejemplo dos replicas del backend), el otro proceso se
// entera del cambio como mucho un minuto despues.
const TTL_MS = 60000;

let cache = null;
let cacheVence = 0;

/** Valores por defecto si todavia no se corrio el seed. */
const POR_DEFECTO = {
  id: ID_CONFIG,
  nombreEstudio: 'Estudio Juridico',
  titular: null,
  matricula: null,
  cuit: null,
  domicilio: null,
  localidad: null,
  telefono: null,
  email: null,
  anioTrabajo: new Date().getFullYear(),
  diasPorVencer: 7,
  ventanaProximos: 30,
  valorJus: 0,
  jurisdiccionDefault: 'NACION',
  mesesCaducidadDefault: 6,
};

function serializar(config) {
  if (!config) return POR_DEFECTO;
  return Object.assign({}, config, {
    valorJus: aNumero(config.valorJus),
    actualizado: config.actualizado ? config.actualizado.toISOString() : null,
  });
}

export function invalidarCache() {
  cache = null;
  cacheVence = 0;
}

export async function obtenerConfig() {
  if (cache && Date.now() < cacheVence) return cache;

  const fila = await prisma.configEstudio.findUnique({ where: { id: ID_CONFIG } });
  cache = serializar(fila);
  cacheVence = Date.now() + TTL_MS;
  return cache;
}

/**
 * Atajo para las vistas: devuelve solo lo que necesita el motor de semaforos.
 * Tenerlo aparte evita que cada vista tenga que acordarse de que parametro usar.
 */
export async function parametrosVencimientos() {
  const config = await obtenerConfig();
  return {
    umbralDias: config.diasPorVencer,
    ventanaProximos: config.ventanaProximos,
    jurisdiccion: config.jurisdiccionDefault,
    mesesCaducidadDefault: config.mesesCaducidadDefault,
  };
}

export async function actualizarConfig(body, req) {
  const anterior = await prisma.configEstudio.findUnique({ where: { id: ID_CONFIG } });

  const datos = {
    nombreEstudio: body.nombreEstudio,
    titular: body.titular,
    matricula: body.matricula,
    cuit: body.cuit,
    domicilio: body.domicilio,
    localidad: body.localidad,
    telefono: body.telefono,
    email: body.email,
    anioTrabajo: body.anioTrabajo,
    diasPorVencer: body.diasPorVencer,
    ventanaProximos: body.ventanaProximos,
    valorJus: body.valorJus,
    jurisdiccionDefault: body.jurisdiccionDefault,
    mesesCaducidadDefault: body.mesesCaducidadDefault,
  };

  const guardada = await prisma.$transaction(async (tx) => {
    const fila = await tx.configEstudio.upsert({
      where: { id: ID_CONFIG },
      create: Object.assign({ id: ID_CONFIG }, datos),
      update: datos,
    });

    await registrarCambios({
      tx,
      req,
      entidad: 'ConfigEstudio',
      entidadId: ID_CONFIG,
      anterior: anterior || {},
      nuevo: datos,
    });

    return fila;
  });

  invalidarCache();
  return serializar(guardada);
}
