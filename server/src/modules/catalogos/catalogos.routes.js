import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './catalogos.service.js';
import { validar, idParam, texto } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado } from '../../utils/respuesta.js';

const router = Router();

const tipoCatalogo = z.enum(servicio.TIPOS);
const scope = z.enum(servicio.SCOPES_RUBRO).optional().nullable();

const esquemaCrear = z
  .object({
    tipo: tipoCatalogo,
    valor: texto(160),
    orden: z.coerce.number().int().min(0).max(9999).default(0),
    scope,
    computaComoActivo: z.coerce.boolean().default(true),
  })
  .strict();

const esquemaActualizar = z
  .object({
    valor: texto(160),
    orden: z.coerce.number().int().min(0).max(9999).default(0),
    activo: z.coerce.boolean().default(true),
    scope,
    computaComoActivo: z.coerce.boolean().default(true),
  })
  .strict();

const esquemaListar = z.object({
  tipo: tipoCatalogo.optional(),
  scope: z.enum(servicio.SCOPES_RUBRO).optional(),
  incluirInactivos: z.coerce.boolean().optional(),
});

/** Todos los catalogos agrupados: una sola llamada al entrar a la app. */
router.get(
  '/todos',
  autorizar('catalogos:leer'),
  asyncHandler(async (req, res) => ok(res, await servicio.todos()))
);

router.get(
  '/',
  autorizar('catalogos:leer'),
  validar({ query: esquemaListar }),
  asyncHandler(async (req, res) => ok(res, await servicio.listar(req.datosQuery)))
);

router.post(
  '/',
  autorizar('catalogos:escribir'),
  validar({ body: esquemaCrear }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('catalogos:escribir'),
  validar({ params: idParam, body: esquemaActualizar }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

/** No borra: desactiva. Ver el comentario del service. */
router.delete(
  '/:id',
  autorizar('catalogos:escribir'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.desactivar(req.params.id, req)))
);

export default router;
