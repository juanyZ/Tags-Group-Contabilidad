import { z } from 'zod';
import {
  fechaISO,
  textoOpcional,
  idOpcional,
  paginacion,
  version,
  importe,
} from '../../middlewares/validar.js';

export const TIPOS_GASTO = ['EXPEDIENTE', 'ESTUDIO'];
export const ESTADOS_REINTEGRO = ['PENDIENTE', 'REINTEGRADO', 'NO_CORRESPONDE'];

const camposBase = {
  fecha: fechaISO,
  tipo: z.enum(TIPOS_GASTO),
  // Obligatorio si tipo === 'EXPEDIENTE'. Se verifica en el refine de abajo y,
  // por segunda vez, en el service: la validacion de forma no reemplaza a la
  // de negocio, porque el service tambien se llama desde otros lugares.
  expedienteId: idOpcional,
  rubroId: idOpcional,
  detalle: textoOpcional(300),
  medioPagoId: idOpcional,
  importe: importe.refine((v) => v > 0, 'El importe tiene que ser mayor a cero'),
  reembolsable: z.coerce.boolean().default(false),
  estadoReintegro: z.enum(ESTADOS_REINTEGRO).default('NO_CORRESPONDE'),
  observaciones: textoOpcional(2000),
};

const reglaExpediente = (datos, ctx) => {
  if (datos.tipo === 'EXPEDIENTE' && !datos.expedienteId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expedienteId'],
      message: 'Elegi de que expediente es el gasto',
    });
  }
  if (datos.reembolsable && datos.tipo !== 'EXPEDIENTE') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reembolsable'],
      message: 'Solo un gasto de expediente se le puede reintegrar al estudio',
    });
  }
};

export const crearGasto = z.object(camposBase).strict().superRefine(reglaExpediente);

export const actualizarGasto = z
  .object(Object.assign({}, camposBase, { version }))
  .strict()
  .superRefine(reglaExpediente);

export const listarGastos = paginacion.extend({
  tipo: z.enum(TIPOS_GASTO).optional(),
  expedienteId: z.coerce.number().int().positive().optional(),
  clienteId: z.coerce.number().int().positive().optional(),
  rubroId: z.coerce.number().int().positive().optional(),
  estadoReintegro: z.enum(ESTADOS_REINTEGRO).optional(),
  reembolsable: z.coerce.boolean().optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});

export const marcarReintegro = z
  .object({
    ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
    estado: z.enum(ESTADOS_REINTEGRO),
  })
  .strict();

export const ORDENABLES = ['fecha', 'codigo', 'importe', 'tipo', 'creadoEn'];
