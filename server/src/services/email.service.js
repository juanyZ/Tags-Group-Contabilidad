/**
 * Envio de email. Es un HOOK opcional: si no hay SMTP configurado, el sistema
 * funciona igual y las notificaciones quedan solo en el panel de la app.
 *
 * Las credenciales SMTP salen exclusivamente de variables de entorno. No hay
 * ningun valor por defecto ni de ejemplo en el codigo: si alguien clona el
 * repositorio, no se lleva ninguna casilla del estudio.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporte = null;
let intentoDeInicializacion = false;

export function emailHabilitado() {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function obtenerTransporte() {
  if (!emailHabilitado()) return null;
  if (transporte || intentoDeInicializacion) return transporte;

  intentoDeInicializacion = true;
  try {
    transporte = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      // 465 es SMTPS implicito; el resto usa STARTTLS.
      secure: (env.SMTP_PORT || 587) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } catch (err) {
    // Un SMTP mal configurado no puede tumbar el servidor.
    console.error('[email] No se pudo inicializar el transporte:', err.message);
    transporte = null;
  }
  return transporte;
}

/**
 * Envia un email. Nunca lanza: si falla, lo registra y devuelve false, porque
 * un problema del servidor de correo no tiene que hacer fallar la operacion de
 * negocio que lo disparo.
 */
export async function enviarEmail(opciones) {
  const t = obtenerTransporte();
  if (!t) return false;

  try {
    await t.sendMail({
      from: env.SMTP_FROM,
      to: opciones.para,
      subject: opciones.asunto,
      text: opciones.texto,
      html: opciones.html,
    });
    return true;
  } catch (err) {
    // Se loguea el error pero NO el contenido del mensaje: puede tener datos
    // de clientes.
    console.error('[email] Fallo el envio a', opciones.para, '-', err.message);
    return false;
  }
}

/** Plantilla del resumen diario de vencimientos. */
export function plantillaVencimientos(datos) {
  const filas = datos.eventos
    .map(
      (e) =>
        '<tr>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee">' + e.fechaTexto + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee">' + escapar(e.descripcion) + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee">' + escapar(e.expediente || 'Evento del estudio') + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee;color:' + e.color + '">' + e.situacion + '</td>' +
        '</tr>'
    )
    .join('');

  const html =
    '<div style="font-family:system-ui,Arial,sans-serif;color:#222">' +
    '<h2 style="color:#1b4d3e;margin-bottom:4px">' + escapar(datos.titulo) + '</h2>' +
    '<p style="color:#666;margin-top:0">' + escapar(datos.subtitulo) + '</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
    '<thead><tr style="background:#1b4d3e;color:#fff">' +
    '<th style="padding:8px 10px;text-align:left">Fecha</th>' +
    '<th style="padding:8px 10px;text-align:left">Que hay que hacer</th>' +
    '<th style="padding:8px 10px;text-align:left">Expediente</th>' +
    '<th style="padding:8px 10px;text-align:left">Situacion</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table>' +
    '<p style="color:#888;font-size:12px;margin-top:20px">' +
    'Mensaje automatico del sistema de gestion del estudio.</p></div>';

  const texto = datos.eventos
    .map((e) => e.fechaTexto + ' - ' + e.descripcion + ' (' + e.situacion + ')')
    .join('\n');

  return { html, texto: datos.titulo + '\n\n' + texto };
}

/** Escapa HTML: los datos vienen de la base y podrian tener < o &. */
function escapar(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
