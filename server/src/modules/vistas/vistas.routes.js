/**
 * Rutas de las vistas derivadas: tablero, calendario, agenda, cuenta corriente
 * y ficha. Todas son de solo lectura: no se carga nada, se arman solas.
 */
import { Router } from 'express';
import { z } from 'zod';
import * as calendario from './calendario.service.js';
import * as agenda from './agenda.service.js';
import * as cuenta from './cuentacorriente.service.js';
import * as ficha from './ficha.service.js';
import * as dashboard from './dashboard.service.js';
import { validar, idParam, fechaISO } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respuesta.js';

const router = Router();

const anio = z.coerce.number().int().min(2000).max(2100);
// mes = 0 significa "todo el ano" en el selector de periodo del tablero.
const mes = z.coerce.number().int().min(0).max(12);

// --- Tablero ---------------------------------------------------------------

router.get(
  '/dashboard',
  autorizar('dashboard:leer'),
  validar({ query: z.object({ anio: anio.optional(), mes: mes.optional() }) }),
  asyncHandler(async (req, res) => ok(res, await dashboard.tablero(req.datosQuery)))
);

// --- Calendario ------------------------------------------------------------

router.get(
  '/calendario',
  autorizar('eventos:leer'),
  validar({
    query: z.object({
      desde: fechaISO.optional(),
      hasta: fechaISO.optional(),
      anio: anio.optional(),
      mes: z.coerce.number().int().min(1).max(12).optional(),
      responsableId: z.coerce.number().int().positive().optional(),
      soloPendientes: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await calendario.listado(req.datosQuery)))
);

router.get(
  '/calendario/mes',
  autorizar('eventos:leer'),
  validar({
    query: z.object({
      anio,
      mes: z.coerce.number().int().min(1).max(12),
      responsableId: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await calendario.grillaMensual(req.datosQuery.anio, req.datosQuery.mes, req.datosQuery)
    )
  )
);

// --- Agenda ----------------------------------------------------------------

router.get(
  '/agenda',
  autorizar('eventos:leer'),
  validar({
    query: z.object({
      desde: fechaISO.optional(),
      hasta: fechaISO.optional(),
      responsableId: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => ok(res, await agenda.agenda(req.datosQuery)))
);

// --- Cuenta corriente ------------------------------------------------------

router.get(
  '/cuenta-corriente/resumen',
  autorizar('cuentacorriente:leer'),
  asyncHandler(async (req, res) => ok(res, await cuenta.resumenCartera()))
);

router.get(
  '/cuenta-corriente/:id',
  autorizar('cuentacorriente:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await cuenta.cuentaCorriente(req.params.id)))
);

// --- Ficha del expediente --------------------------------------------------

router.get(
  '/ficha/:id',
  autorizar('expedientes:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await ficha.ficha(req.params.id)))
);

export default router;
