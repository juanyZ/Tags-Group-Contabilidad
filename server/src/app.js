/**
 * Aplicacion Express.
 *
 * El orden de los middlewares no es arbitrario: helmet y CORS van primero
 * (antes de tocar el cuerpo), despues el parseo, despues el rate limit y
 * recien al final las rutas. El manejador de errores va ultimo, siempre.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { env, esProduccion, origenesPermitidos } from './config/env.js';
import { pingDb } from './config/prisma.js';
import { limiteGeneral } from './middlewares/limites.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/errores.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { hoyISO, ZONA_AR } from './utils/fechas.js';
import v1 from './routes/v1.js';

export function crearApp() {
  const app = express();

  // Detras de un proxy inverso (nginx, Traefik) hace falta para que req.ip sea
  // la IP real del cliente y no la del proxy: el rate limit y la auditoria
  // dependen de eso.
  app.set('trust proxy', esProduccion ? 1 : false);
  app.disable('x-powered-by');

  // --- Cabeceras de seguridad ---------------------------------------------
  app.use(
    helmet({
      // La API no sirve HTML, asi que la CSP por defecto de helmet alcanza y
      // sobra. El frontend es una app aparte con su propia configuracion.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      // HSTS solo tiene sentido sobre HTTPS: en desarrollo romperia localhost.
      hsts: esProduccion ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // --- CORS: lista blanca, nunca '*' --------------------------------------
  app.use(
    cors({
      origin(origen, callback) {
        // Sin origen: curl, health checks, apps moviles. Se permite.
        if (!origen) return callback(null, true);
        if (origenesPermitidos.includes(origen)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS: ' + origen));
      },
      // Necesario para que viaje la cookie del refresh token.
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    })
  );

  // --- Parseo --------------------------------------------------------------
  // Tope de 1 MB: ningun formulario de esta app manda mas que eso (los
  // archivos van por multipart, con su propio limite).
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // --- Logs ----------------------------------------------------------------
  if (!esProduccion) {
    app.use(morgan('dev'));
  } else {
    // Formato acotado: metodo, ruta, estado y tiempo. Sin cuerpos ni query
    // strings completos, que pueden llevar datos personales.
    app.use(morgan(':method :url :status :response-time ms'));
  }

  // --- Rate limit general --------------------------------------------------
  app.use('/api', limiteGeneral);

  // --- Health check --------------------------------------------------------
  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      const db = await pingDb();
      return res.status(db ? 200 : 503).json({
        data: {
          estado: db ? 'ok' : 'sin base de datos',
          hoy: hoyISO(),
          zonaHoraria: ZONA_AR,
          entorno: env.NODE_ENV,
        },
        error: null,
        meta: null,
      });
    })
  );

  // --- API -----------------------------------------------------------------
  app.use('/api/v1', v1);

  // --- 404 y errores (siempre al final) ------------------------------------
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
