import { Router } from 'express';
import { z } from 'zod';
import * as servicio from './recurrentes.service.js';
import {
  validar,
  idParam,
  texto,
  textoOpcional,
  idOpcional,
  fechaISO,
  version,
} from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado } from '../../utils/respuesta.js';

const router = Router();

export const PERIODICIDADES = [
  'SEMANAL',
  'QUINCENAL',
  'MENSUAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'CUATRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
];

const camposBase = {
  descripcion: texto(300),
  tipoId: idOpcional,
  periodicidad: z.enum(PERIODICIDADES),
  // La primera vez que ocurrio: desde ahi se proyecta todo.
  fechaBase: fechaISO,
  responsableId: idOpcional,
  activo: z.coerce.boolean().default(true),
  observaciones: textoOpcional(2000),
};

const esquemaCrear = z.object(camposBase).strict();
const esquemaActualizar = z.object(Object.assign({}, camposBase, { version })).strict();

const esquemaListar = z.object({
  q: z.string().trim().max(200).optional(),
  activo: z.coerce.boolean().optional(),
  responsableId: z.coerce.number().int().positive().optional(),
  periodicidad: z.enum(PERIODICIDADES).optional(),
});

const esquemaCumplir = z
  .object({
    // Si no viene, el service toma la ocurrencia vigente.
    periodoClave: fechaISO.optional(),
    observacion: textoOpcional(300),
  })
  .strict();

router.get(
  '/',
  autorizar('recurrentes:leer'),
  validar({ query: esquemaListar }),
  asyncHandler(async (req, res) => ok(res, await servicio.listar(req.datosQuery)))
);

router.get(
  '/:id',
  autorizar('recurrentes:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.obtener(req.params.id)))
);

/** Historial de periodos cumplidos: lo que el tilde del Excel no guardaba. */
router.get(
  '/:id/historial',
  autorizar('recurrentes:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.historial(req.params.id)))
);

router.post(
  '/',
  autorizar('recurrentes:escribir'),
  validar({ body: esquemaCrear }),
  asyncHandler(async (req, res) => creado(res, await servicio.crear(req.body, req)))
);

router.put(
  '/:id',
  autorizar('recurrentes:escribir'),
  validar({ params: idParam, body: esquemaActualizar }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.actualizar(req.params.id, req.body, req))
  )
);

router.post(
  '/:id/cumplir',
  autorizar('recurrentes:escribir'),
  validar({ params: idParam, body: esquemaCumplir }),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await servicio.marcarCumplido(
        req.params.id,
        req.body.periodoClave,
        req.body.observacion,
        req
      )
    )
  )
);

router.delete(
  '/:id/cumplir/:periodoClave',
  autorizar('recurrentes:escribir'),
  validar({
    params: z.object({
      id: z.coerce.number().int().positive(),
      periodoClave: fechaISO,
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await servicio.desmarcarCumplido(req.params.id, req.params.periodoClave, req))
  )
);

router.delete(
  '/:id',
  autorizar('recurrentes:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await servicio.eliminar(req.params.id, req)))
);

export default router;
