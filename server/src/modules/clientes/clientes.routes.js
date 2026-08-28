/**
 * Rutas de CLIENTES. Patron de referencia para el resto de los modulos:
 *   autenticar -> autorizar(permiso) -> validar(esquema) -> controller
 *
 * Los controllers son finos a proposito: traducen HTTP y nada mas. Toda la
 * logica esta en el service, que es lo que permite testearla y reutilizarla
 * desde las vistas derivadas sin pasar por la red.
 */
import { Router } from 'express';
import * as servicio from './clientes.service.js';
import * as esquemas from './clientes.schema.js';
import { validar, idParam } from '../../middlewares/validar.js';
import { autorizar, filtroPropio } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado, paginado } from '../../utils/respuesta.js';

const router = Router();

router.get(
  '/',
  autorizar('clientes:leer'),
  validar({ query: esquemas.listarClientes }),
  asyncHandler(async (req, res) => {
    const r = await servicio.listar(req.datosQuery, filtroPropio(req));
    return paginado(res, r.items, { page: r.page, limit: r.limit, total: r.total });
  })
);

/** Lista liviana para los desplegables de otras pantallas. */
router.get(
  '/opciones',
  autorizar('clientes:leer'),
  asyncHandler(async (req, res) => ok(res, await servicio.opciones()))
);

router.get(
  '/:id',
  autorizar('clientes:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.obtener(req.params.id)))
);

router.post(
  '/',
  autorizar('clientes:escribir'),
  validar({ body: esquemas.crearCliente }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('clientes:escribir'),
  validar({ params: idParam, body: esquemas.actualizarCliente }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

router.delete(
  '/:id',
  autorizar('clientes:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.eliminar(req.params.id, req)))
);

router.post(
  '/:id/restaurar',
  autorizar('clientes:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.restaurar(req.params.id, req)))
);

export default router;
