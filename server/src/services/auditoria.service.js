/**
 * Auditoria: quien cambio que, cuando, desde donde.
 *
 * Se registra un renglon POR CAMPO modificado, no por operacion. Eso permite
 * responder la pregunta que de verdad importa en un estudio: "quien le bajo el
 * monto a este honorario y que decia antes".
 *
 * La escritura se hace dentro de la MISMA transaccion que el cambio de negocio
 * (por eso todas las funciones aceptan un cliente `tx`): si falla la auditoria,
 * se revierte el cambio. Auditar despues, por fuera, deja huecos justo en los
 * casos raros, que son los que uno necesita investigar.
 */
import { prisma } from '../config/prisma.js';

/** Campos que jamas se copian a la auditoria, ni siquiera hasheados. */
const CAMPOS_SENSIBLES = new Set(['passwordHash', 'password', 'tokenHash', 'refreshToken']);

/** Campos de infraestructura que no aportan nada al historial. */
const CAMPOS_IGNORADOS = new Set(['creadoEn', 'actualizado', 'version', 'id']);

/** Normaliza un valor a texto legible y acotado, para guardarlo como TEXT. */
function aTexto(valor) {
  if (valor == null) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    // Decimal de Prisma y similares exponen toString().
    if (typeof valor.toString === 'function' && valor.toString !== Object.prototype.toString) {
      return valor.toString().slice(0, 1000);
    }
    return JSON.stringify(valor).slice(0, 1000);
  }
  return String(valor).slice(0, 1000);
}

function datosPeticion(req) {
  if (!req) return { usuarioId: null, ip: null, userAgent: null };
  return {
    usuarioId: req.usuario ? req.usuario.id : null,
    // Se toma la IP ya normalizada por Express (respeta trust proxy).
    ip: (req.ip || '').slice(0, 64) || null,
    userAgent: (req.headers['user-agent'] || '').slice(0, 255) || null,
  };
}

/**
 * Registra una accion simple (alta, baja, login...) sin diff de campos.
 */
export async function registrarAccion(opciones) {
  const cliente = opciones.tx || prisma;
  const base = datosPeticion(opciones.req);

  await cliente.auditLog.create({
    data: {
      usuarioId: opciones.usuarioId != null ? opciones.usuarioId : base.usuarioId,
      entidad: opciones.entidad,
      entidadId: opciones.entidadId != null ? opciones.entidadId : null,
      accion: opciones.accion,
      campo: opciones.campo || null,
      valorAnterior: aTexto(opciones.valorAnterior),
      valorNuevo: aTexto(opciones.valorNuevo),
      ip: base.ip,
      userAgent: base.userAgent,
    },
  });
}

/**
 * Registra un alta: un renglon con el resumen, sin desglosar campo por campo
 * (el estado inicial completo se puede reconstruir del registro creado).
 */
export async function registrarAlta(opciones) {
  return registrarAccion({
    tx: opciones.tx,
    req: opciones.req,
    entidad: opciones.entidad,
    entidadId: opciones.entidadId,
    accion: 'CREAR',
    valorNuevo: opciones.resumen || null,
  });
}

/**
 * Compara dos versiones del registro y escribe un renglon por cada campo que
 * cambio realmente. Si nada cambio, no escribe nada: no se ensucia el historial
 * con "guardo sin tocar nada".
 *
 * Devuelve la cantidad de campos auditados.
 */
export async function registrarCambios(opciones) {
  const cliente = opciones.tx || prisma;
  const base = datosPeticion(opciones.req);
  const anterior = opciones.anterior || {};
  const nuevo = opciones.nuevo || {};

  // Se recorren SOLO las claves de `nuevo`, es decir los campos que la
  // operacion realmente escribe. Si se unieran las claves de `anterior`, todo
  // campo que el update no toca (por ejemplo `codigo`, que lo maneja el
  // sistema) apareceria como "cambiado a vacio" y ensuciaria el historial con
  // modificaciones que nunca ocurrieron.
  const claves = Object.keys(nuevo);
  const filas = [];

  for (const campo of claves) {
    if (CAMPOS_SENSIBLES.has(campo) || CAMPOS_IGNORADOS.has(campo)) continue;

    const antes = aTexto(anterior[campo]);
    const despues = aTexto(nuevo[campo]);
    if (antes === despues) continue;

    filas.push({
      usuarioId: base.usuarioId,
      entidad: opciones.entidad,
      entidadId: opciones.entidadId,
      accion: 'ACTUALIZAR',
      campo,
      valorAnterior: antes,
      valorNuevo: despues,
      ip: base.ip,
      userAgent: base.userAgent,
    });
  }

  if (filas.length === 0) return 0;

  await cliente.auditLog.createMany({ data: filas });
  return filas.length;
}

/** Baja logica. Se guarda el nombre del registro para que el log sea legible. */
export async function registrarBaja(opciones) {
  return registrarAccion({
    tx: opciones.tx,
    req: opciones.req,
    entidad: opciones.entidad,
    entidadId: opciones.entidadId,
    accion: 'ELIMINAR',
    valorAnterior: opciones.resumen || null,
  });
}
