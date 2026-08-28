import { Router } from 'express';
import * as servicio from './eventos.service.js';
import * as esquemas from './eventos.schema.js';
import { validar, idParam } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado, paginado } from '../../utils/respuesta.js';

const router = Router();

router.get(
  '/',
  autorizar('eventos:leer'),
  validar({ query: esquemas.listarEventos }),
  asyncHandler(async (req, res) => {
    const r = await servicio.listar(req.datosQuery);
    return paginado(res, r.items, { page: r.page, limit: r.limit, total: r.total });
  })
);

router.get(
  '/:id',
  autorizar('eventos:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.obtener(req.params.id)))
);

router.post(
  '/',
  autorizar('eventos:escribir'),
  validar({ body: esquemas.crearEvento }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('eventos:escribir'),
  validar({ params: idParam, body: esquemas.actualizarEvento }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

/** Atajo de la grilla: marcar cumplido / reprogramado / cancelado con un clic. */
router.patch(
  '/:id/estado',
  autorizar('eventos:escribir'),
  validar({ params: idParam, body: esquemas.cambiarEstadoEvento }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.cambiarEstado(req.params.id, req.body.estado, req))
  )
);

router.delete(
  '/:id',
  autorizar('eventos:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.eliminar(req.params.id, req)))
);

export default router;
