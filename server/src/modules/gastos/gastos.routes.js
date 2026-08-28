import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './gastos.service.js';
import * as esquemas from './gastos.schema.js';
import { validar, idParam, fechaISO } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado, paginado } from '../../utils/respuesta.js';

const router = Router();

router.get(
  '/',
  autorizar('gastos:leer'),
  validar({ query: esquemas.listarGastos }),
  asyncHandler(async (req, res) => {
    const r = await servicio.listar(req.datosQuery);
    return paginado(res, r.items, { page: r.page, limit: r.limit, total: r.total });
  })
);

router.get(
  '/resumen',
  autorizar('gastos:leer'),
  validar({ query: z.object({ desde: fechaISO.optional(), hasta: fechaISO.optional() }) }),
  asyncHandler(async (req, res) => ok(res, await servicio.resumen(req.datosQuery)))
);

router.get(
  '/:id',
  autorizar('gastos:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.obtener(req.params.id)))
);

router.post(
  '/',
  autorizar('gastos:escribir'),
  validar({ body: esquemas.crearGasto }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('gastos:escribir'),
  validar({ params: idParam, body: esquemas.actualizarGasto }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

/** Marcar reintegros de a lote: es como se usa en la practica. */
router.patch(
  '/reintegro',
  autorizar('gastos:escribir'),
  validar({ body: esquemas.marcarReintegro }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.marcarReintegro(req.body.ids, req.body.estado, req))
  )
);

router.delete(
  '/:id',
  autorizar('gastos:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.eliminar(req.params.id, req)))
);

export default router;
