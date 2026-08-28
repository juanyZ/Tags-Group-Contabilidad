import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './honorarios.service.js';
import * as esquemas from './honorarios.schema.js';
import { validar, idParam, fechaISO } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado, paginado } from '../../utils/respuesta.js';

const router = Router();

router.get(
  '/',
  autorizar('honorarios:leer'),
  validar({ query: esquemas.listarHonorarios }),
  asyncHandler(async (req, res) => {
    const r = await servicio.listar(req.datosQuery);
    return paginado(res, r.items, { page: r.page, limit: r.limit, total: r.total });
  })
);

router.get(
  '/resumen',
  autorizar('honorarios:leer'),
  validar({ query: z.object({ desde: fechaISO.optional(), hasta: fechaISO.optional() }) }),
  asyncHandler(async (req, res) => ok(res, await servicio.resumen(req.datosQuery)))
);

router.get(
  '/:id',
  autorizar('honorarios:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.obtener(req.params.id)))
);

router.post(
  '/',
  autorizar('honorarios:escribir'),
  validar({ body: esquemas.crearHonorario }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('honorarios:escribir'),
  validar({ params: idParam, body: esquemas.actualizarHonorario }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

router.delete(
  '/:id',
  autorizar('honorarios:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.eliminar(req.params.id, req)))
);

// --- Pagos: subrecurso del honorario --------------------------------------

router.post(
  '/:id/pagos',
  autorizar('honorarios:escribir'),
  validar({ params: idParam, body: esquemas.crearPago }),
  asyncHandler(async (req, res) =>
    creado(res, await servicio.agregarPago(req.params.id, req.body, req))
  )
);

router.delete(
  '/:id/pagos/:pagoId',
  autorizar('honorarios:escribir'),
  validar({
    params: z.object({
      id: z.coerce.number().int().positive(),
      pagoId: z.coerce.number().int().positive(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.eliminarPago(req.params.id, req.params.pagoId, req))
  )
);

export default router;
