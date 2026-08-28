import { z } from 'zod';
import {
  fechaISO,
  textoOpcional,
  idOpcional,
  paginacion,
  version,
  importe,
} from '../../middlewares/validar.js';

export const TIPOS_PACTO = [
  'MONTO_FIJO',
  'POR_ETAPAS',
  'CUOTA_LITIS',
  'POR_HORA',
  'ABONO_MENSUAL',
];

export const SITUACIONES_COBRANZA = ['COBRADO', 'PARCIAL', 'SIN_COBRAR'];

/** Los tres valores de IVA que se usan en la practica. */
export const IVA_VALIDOS = [0, 10.5, 21];

const camposBase = {
  clienteId: z.coerce.number().int().positive(),
  expedienteId: idOpcional,
  fechaPacto: fechaISO,
  tipoPacto: z.enum(TIPOS_PACTO),
  montoPactado: importe,
  ivaPorcentaje: z.coerce
    .number()
    .refine((v) => IVA_VALIDOS.includes(v), 'El IVA debe ser 0, 10.5 o 21')
    .default(21),
  observaciones: textoOpcional(2000),
};

export const crearHonorario = z.object(camposBase).strict();

export const actualizarHonorario = z.object(Object.assign({}, camposBase, { version })).strict();

export const listarHonorarios = paginacion.extend({
  clienteId: z.coerce.number().int().positive().optional(),
  expedienteId: z.coerce.number().int().positive().optional(),
  tipoPacto: z.enum(TIPOS_PACTO).optional(),
  situacion: z.enum(SITUACIONES_COBRANZA).optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});

export const crearPago = z
  .object({
    fecha: fechaISO,
    // Un pago de cero no es un pago; el minimo evita ensuciar el historial.
    monto: importe.refine((v) => v > 0, 'El monto del pago tiene que ser mayor a cero'),
    medioPagoId: idOpcional,
    observacion: textoOpcional(300),
  })
  .strict();

export const ORDENABLES = ['fechaPacto', 'codigo', 'montoPactado', 'creadoEn'];
