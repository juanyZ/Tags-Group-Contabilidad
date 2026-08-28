/**
 * Panel de notificaciones del usuario y disparo manual del resumen diario.
 */
import { Router } from 'express';
import { z } from 'zod';
import * as servicio from '../services/notificaciones.service.js';
import { validar } from '../middlewares/validar.js';
import { autorizar } from '../middlewares/autorizar.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respuesta.js';

const router = Router();

router.get(
  '/',
  validar({ query: z.object({ soloNoLeidas: z.coerce.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const items = await servicio.listarDeUsuario(req.usuario.id, req.datosQuery.soloNoLeidas);
    const noLeidas = await servicio.contarNoLeidas(req.usuario.id);
    return ok(res, items, { noLeidas });
  })
);

router.post(
  '/leer',
  validar({
    body: z.object({ ids: z.array(z.coerce.number().int().positive()).optional() }).strict(),
  }),
  asyncHandler(async (req, res) => ok(res, await servicio.marcarLeidas(req.usuario.id, req.body.ids)))
);

/**
 * Disparo manual del resumen diario. Sirve para probar la configuracion SMTP
 * sin esperar al cron. Solo administradores.
 */
router.post(
  '/generar',
  autorizar('config:escribir'),
  asyncHandler(async (req, res) => ok(res, await servicio.generarAvisosDiarios()))
);

export default router;
