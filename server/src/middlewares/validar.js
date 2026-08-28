/**
 * Validacion y saneamiento de entradas con Zod.
 *
 * Dos puntos importantes:
 *  1. Se REEMPLAZA req.body/query/params por el resultado parseado. Como los
 *     esquemas son estrictos, cualquier campo que el cliente mande de mas se
 *     descarta: es la defensa contra mass assignment (que alguien mande
 *     {"rol":"ADMIN"} en el alta de un usuario).
 *  2. Nunca se confia en la validacion del frontend. Este middleware corre
 *     para TODO endpoint que reciba datos.
 */
import { z } from 'zod';

export function validar(esquemas) {
  return (req, res, next) => {
    try {
      if (esquemas.body) req.body = esquemas.body.parse(req.body);
      if (esquemas.query) {
        // req.query es un getter de solo lectura en Express 5 y un objeto sin
        // prototipo en el 4: se guarda aparte para no depender de eso.
        req.datosQuery = esquemas.query.parse(req.query);
      }
      if (esquemas.params) req.params = esquemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err); // El manejador central lo convierte en 422 con detalle.
    }
  };
}

// ---------------------------------------------------------------------------
//  Piezas reutilizables
// ---------------------------------------------------------------------------

/** ID numerico que viene por la URL (siempre llega como string). */
export const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

/** Paginacion estandar. El limite maximo evita que alguien pida 1.000.000. */
export const paginacion = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(25),
  orden: z.enum(['asc', 'desc']).default('desc'),
  ordenarPor: z.string().max(40).optional(),
  q: z.string().trim().max(200).optional(),
});

/** Fecha de negocio: siempre 'YYYY-MM-DD'. Se rechaza cualquier otro formato. */
export const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD')
  .refine((v) => {
    const d = new Date(v + 'T00:00:00.000Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'La fecha no existe en el calendario');

/** Texto obligatorio ya recortado, con tope de largo. */
export const texto = (max, min) =>
  z.string().trim().min(min == null ? 1 : min).max(max);

/** Texto opcional: '' se normaliza a null para no guardar cadenas vacias. */
export const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v));

/** Importe monetario: no negativo y con dos decimales como maximo. */
export const importe = z
  .coerce.number()
  .nonnegative('El importe no puede ser negativo')
  .max(9999999999.99, 'El importe es demasiado grande')
  .refine((n) => Number.isInteger(Math.round(n * 100)), 'Como maximo dos decimales');

/** Referencia opcional a otra entidad. '' o null => null. */
export const idOpcional = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v));

/** Hora 'HH:mm' en formato 24h, opcional. */
export const horaOpcional = z
  .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe ser HH:mm'), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v));

/**
 * Version para bloqueo optimista. Se exige en todos los PUT: si el cliente no
 * la manda, no puede saber sobre que version esta editando.
 */
export const version = z.coerce.number().int().positive();
