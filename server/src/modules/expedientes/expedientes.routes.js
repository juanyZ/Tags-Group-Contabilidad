import { Router } from 'express';
import * as servicio from './expedientes.service.js';
import * as esquemas from './expedientes.schema.js';
import { validar, idParam } from '../../middlewares/validar.js';
import { autorizar, filtroPropio } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado, paginado } from '../../utils/respuesta.js';

const router = Router();

router.get(
  '/',
  autorizar('expedientes:leer'),
  validar({ query: esquemas.listarExpedientes }),
  asyncHandler(async (req, res) => {
    const r = await servicio.listar(req.datosQuery, filtroPropio(req));
    return paginado(res, r.items, { page: r.page, limit: r.limit, total: r.total });
  })
);

router.get(
  '/opciones',
  autorizar('expedientes:leer'),
  asyncHandler(async (req, res) => ok(res, await servicio.opciones()))
);

router.get(
  '/:id',
  autorizar('expedientes:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.obtener(req.params.id)))
);

router.post(
  '/',
  autorizar('expedientes:escribir'),
  validar({ body: esquemas.crearExpediente }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('expedientes:escribir'),
  validar({ params: idParam, body: esquemas.actualizarExpediente }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

router.delete(
  '/:id',
  autorizar('expedientes:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.eliminar(req.params.id, req)))
);

router.post(
  '/:id/restaurar',
  autorizar('expedientes:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.restaurar(req.params.id, req)))
);

export default router;
