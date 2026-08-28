/**
 * Punto de entrada del servidor.
 *
 * Se encarga de tres cosas: fijar la zona horaria, levantar el HTTP y cerrar
 * de forma ordenada. El cron de notificaciones se registra solo si esta
 * habilitado por configuracion.
 */

// La zona horaria se fija ANTES de cualquier otro import, para que todo el
// proceso comparta el mismo criterio. De todas formas, la logica de negocio
// nunca depende de esto: usa hoyISO(), que resuelve la zona explicitamente.
// Esto es defensa en profundidad, no la defensa principal.
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

import cron from 'node-cron';
import { crearApp } from './app.js';
import { env } from './config/env.js';
import { desconectarPrisma, pingDb } from './config/prisma.js';
import { generarAvisosDiarios } from './services/notificaciones.service.js';
import { hoyISO, ZONA_AR } from './utils/fechas.js';

const app = crearApp();

const servidor = app.listen(env.PORT, () => {
  console.log('');
  console.log('  Sistema de gestion para estudios juridicos');
  console.log('  API escuchando en http://localhost:' + env.PORT + '/api/v1');
  console.log('  Entorno: ' + env.NODE_ENV);
  console.log('  Zona horaria: ' + ZONA_AR + '  (hoy es ' + hoyISO() + ')');
  console.log('');
});

// Aviso temprano si la base no responde: es mucho mas claro que ver fallar el
// primer request del usuario.
pingDb().then((ok) => {
  if (!ok) {
    console.warn('  [aviso] No se pudo conectar a la base de datos.');
    console.warn('          Revisa DATABASE_URL y que MySQL este levantado.');
    console.warn('          Si es la primera vez: npm run migrate:deploy && npm run seed');
    console.log('');
  }
});

// --- Cron de notificaciones -------------------------------------------------
let tareaCron = null;

if (env.NOTIFY_CRON_ENABLED) {
  // Todos los dias a la hora configurada, en horario de Argentina.
  const expresion = '0 ' + env.NOTIFY_CRON_HOUR + ' * * *';

  tareaCron = cron.schedule(
    expresion,
    async () => {
      try {
        const resultado = await generarAvisosDiarios();
        console.log('[cron] Avisos diarios:', JSON.stringify(resultado));
      } catch (err) {
        // Un fallo del cron no puede tumbar el servidor.
        console.error('[cron] Error generando avisos diarios:', err.message);
      }
    },
    { timezone: ZONA_AR }
  );

  console.log('  Cron de vencimientos activo: todos los dias a las ' + env.NOTIFY_CRON_HOUR + ':00');
  console.log('');
}

// --- Cierre ordenado --------------------------------------------------------
async function cerrar(senal) {
  console.log('\n[' + senal + '] Cerrando...');

  if (tareaCron) tareaCron.stop();

  servidor.close(async () => {
    await desconectarPrisma();
    console.log('Cerrado correctamente.');
    process.exit(0);
  });

  // Si algo queda colgado, se fuerza la salida a los 10 segundos.
  setTimeout(() => {
    console.error('Cierre forzado tras 10 segundos.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => cerrar('SIGTERM'));
process.on('SIGINT', () => cerrar('SIGINT'));

process.on('unhandledRejection', (razon) => {
  console.error('[unhandledRejection]', razon);
});
