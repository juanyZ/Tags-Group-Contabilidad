/**
 * NOTIFICACIONES.
 *
 * Dos canales:
 *  - Panel dentro de la app (siempre).
 *  - Email al responsable (opcional, si hay SMTP configurado).
 *
 * La deduplicacion es por (usuario, clave). La clave incluye la fecha, asi que
 * el aviso de un vencimiento se genera una vez por dia y por persona: el cron
 * puede correr diez veces sin llenar de ruido la bandeja de nadie.
 */
import { prisma } from '../config/prisma.js';
import { hoyISO, aISO, sumarDias, formatoAR } from '../utils/fechas.js';
import { calcularSituacion, etiquetaSituacion, SITUACION } from './semaforo.service.js';
import { WHERE_PENDIENTES } from './vencimientos.service.js';
import { enviarEmail, plantillaVencimientos, emailHabilitado } from './email.service.js';

const COLORES = {
  VENCIDO: '#c0392b',
  VENCE_HOY: '#e67e22',
  POR_VENCER: '#b8860b',
  EN_FECHA: '#1b7a4b',
};

/** Crea la notificacion si no existe ya para ese usuario y clave. */
async function crearSiNoExiste(datos) {
  try {
    await prisma.notificacion.create({ data: datos });
    return true;
  } catch (err) {
    // P2002 = ya existia (unique usuarioId + claveDedupe). Es el caso normal
    // cuando el cron corre dos veces el mismo dia: no es un error.
    if (err.code === 'P2002') return false;
    throw err;
  }
}

/**
 * Genera las notificaciones del dia y, si hay SMTP, manda el resumen.
 * Devuelve un resumen de lo hecho, util para el log del cron y para el
 * endpoint manual de disparo.
 */
export async function generarAvisosDiarios() {
  const hoy = hoyISO();
  const config = await prisma.configEstudio.findUnique({ where: { id: 1 } });
  const umbralDias = config ? config.diasPorVencer : 7;

  const limite = sumarDias(hoy, umbralDias);

  // Vencimientos relevantes: los atrasados y los que entran en el umbral.
  const eventos = await prisma.eventoPuntual.findMany({
    where: Object.assign({}, WHERE_PENDIENTES, {
      fechaVto: { lte: new Date(limite + 'T00:00:00.000Z') },
    }),
    include: {
      responsable: {
        select: { id: true, nombre: true, email: true, usuario: { select: { id: true, email: true, activo: true } } },
      },
      expediente: { select: { caratula: true } },
    },
    orderBy: { fechaVto: 'asc' },
  });

  // Se agrupan por usuario destinatario. Un evento sin responsable, o cuyo
  // responsable no tiene usuario, va a los administradores: no puede quedar
  // un plazo sin que nadie lo vea.
  const admins = await prisma.usuario.findMany({
    where: { rol: 'ADMIN', activo: true, eliminadoEn: null },
    select: { id: true, email: true, nombre: true },
  });

  const porUsuario = new Map();

  const agregar = (usuarioId, email, evento) => {
    if (!porUsuario.has(usuarioId)) porUsuario.set(usuarioId, { email, eventos: [] });
    porUsuario.get(usuarioId).eventos.push(evento);
  };

  for (const ev of eventos) {
    const fecha = aISO(ev.fechaVto);
    const situacion = calcularSituacion({ fechaVto: fecha, hoy, umbralDias });

    // Lo que ya esta en fecha holgada no genera aviso.
    if (situacion === SITUACION.EN_FECHA || situacion === SITUACION.SIN_FECHA) continue;

    const item = {
      id: ev.id,
      codigo: ev.codigo,
      fecha,
      fechaTexto: formatoAR(fecha),
      descripcion: ev.descripcion,
      expediente: ev.expediente ? ev.expediente.caratula : null,
      situacion: etiquetaSituacion(situacion),
      situacionClave: situacion,
      color: COLORES[situacion] || '#333',
    };

    const usuarioResponsable =
      ev.responsable && ev.responsable.usuario && ev.responsable.usuario.activo
        ? ev.responsable.usuario
        : null;

    if (usuarioResponsable) {
      agregar(usuarioResponsable.id, usuarioResponsable.email, item);
    } else {
      for (const admin of admins) agregar(admin.id, admin.email, item);
    }
  }

  let notificacionesCreadas = 0;
  let emailsEnviados = 0;

  for (const [usuarioId, datos] of porUsuario.entries()) {
    // 1) Notificaciones individuales en el panel.
    for (const ev of datos.eventos) {
      const creada = await crearSiNoExiste({
        usuarioId,
        tipo: 'VENCIMIENTO',
        titulo: ev.situacion + ': ' + ev.descripcion,
        mensaje:
          'Vence el ' + ev.fechaTexto + (ev.expediente ? ' - ' + ev.expediente : ' - Evento del estudio'),
        entidadTipo: 'EventoPuntual',
        entidadId: ev.id,
        // La clave incluye el dia: se avisa una vez por dia mientras siga pendiente.
        claveDedupe: 'vto:' + ev.id + ':' + hoy,
      });
      if (creada) notificacionesCreadas += 1;
    }

    // 2) Un unico email con el resumen, no uno por vencimiento.
    if (emailHabilitado() && datos.email && datos.eventos.length > 0) {
      const vencidos = datos.eventos.filter((e) => e.situacionClave === 'VENCIDO').length;
      const hoyCount = datos.eventos.filter((e) => e.situacionClave === 'VENCE_HOY').length;

      const plantilla = plantillaVencimientos({
        titulo: 'Vencimientos del ' + formatoAR(hoy),
        subtitulo:
          datos.eventos.length +
          ' vencimiento(s) para revisar: ' +
          vencidos +
          ' vencido(s), ' +
          hoyCount +
          ' para hoy.',
        eventos: datos.eventos,
      });

      const enviado = await enviarEmail({
        para: datos.email,
        asunto:
          '[Estudio] ' +
          datos.eventos.length +
          ' vencimiento(s) - ' +
          formatoAR(hoy),
        texto: plantilla.texto,
        html: plantilla.html,
      });
      if (enviado) emailsEnviados += 1;
    }
  }

  return {
    fecha: hoy,
    eventosAnalizados: eventos.length,
    usuariosNotificados: porUsuario.size,
    notificacionesCreadas,
    emailsEnviados,
    emailHabilitado: emailHabilitado(),
  };
}

/** Notificaciones del usuario para el panel de la campanita. */
export async function listarDeUsuario(usuarioId, soloNoLeidas) {
  const where = { usuarioId };
  if (soloNoLeidas) where.leidaEn = null;

  const items = await prisma.notificacion.findMany({
    where,
    orderBy: { creadoEn: 'desc' },
    take: 100,
  });

  return items.map((n) => ({
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    entidadTipo: n.entidadTipo,
    entidadId: n.entidadId,
    leida: n.leidaEn != null,
    creadoEn: n.creadoEn.toISOString(),
  }));
}

export async function marcarLeidas(usuarioId, ids) {
  const where = { usuarioId, leidaEn: null };
  // Sin ids se marcan todas: es el boton "marcar todo como leido".
  if (ids && ids.length > 0) where.id = { in: ids };

  const r = await prisma.notificacion.updateMany({ where, data: { leidaEn: new Date() } });
  return { marcadas: r.count };
}

export async function contarNoLeidas(usuarioId) {
  return prisma.notificacion.count({ where: { usuarioId, leidaEn: null } });
}
