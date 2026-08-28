import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './config.service.js';
import { validar, textoOpcional, texto, importe } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respuesta.js';

const router = Router();

const esquemaConfig = z
  .object({
    nombreEstudio: texto(160),
    titular: textoOpcional(160),
    matricula: textoOpcional(60),
    cuit: textoOpcional(20),
    domicilio: textoOpcional(200),
    localidad: textoOpcional(120),
    telefono: textoOpcional(60),
    email: z
      .union([z.string().trim().email().max(180), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' || v == null ? null : v)),
    anioTrabajo: z.coerce.number().int().min(2000).max(2100),
    // Topes con sentido: un umbral de 400 dias pintaria todo de amarillo y el
    // semaforo dejaria de servir para algo.
    diasPorVencer: z.coerce.number().int().min(1).max(90),
    ventanaProximos: z.coerce.number().int().min(1).max(365),
    valorJus: importe,
    jurisdiccionDefault: texto(60),
    mesesCaducidadDefault: z.coerce.number().int().min(1).max(120),
  })
  .strict();

router.get(
  '/',
  autorizar('config:leer'),
  asyncHandler(async (req, res) => ok(res, await servicio.obtenerConfig()))
);

router.put(
  '/',
  autorizar('config:escribir'),
  validar({ body: esquemaConfig }),
  asyncHandler(async (req, res) => ok(res, await servicio.actualizarConfig(req.body, req)))
);

export default router;
