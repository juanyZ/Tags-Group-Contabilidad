import { z } from 'zod';
import {
  fechaISO,
  texto,
  textoOpcional,
  idOpcional,
  paginacion,
  version,
  importe,
} from '../../middlewares/validar.js';

export const CARACTERES = ['ACTOR', 'DEMANDADO', 'TERCERO', 'QUERELLANTE', 'CONSULTANTE'];

const camposBase = {
  fechaInicio: fechaISO,
  // La caratula es larga por naturaleza: "Actor c/ Demandado s/ Objeto".
  caratula: texto(300),
  clienteId: z.coerce.number().int().positive(),
  caracter: z.enum(CARACTERES),
  contraparte: textoOpcional(200),
  fueroId: idOpcional,
  juzgadoId: idOpcional,
  numeroExpediente: textoOpcional(80),
  etapaId: idOpcional,
  estadoId: idOpcional,
  abogadoId: idOpcional,
  ultimaActuacion: fechaISO.optional().nullable(),
  montoReclamado: importe.optional().nullable(),
  // Caducidad de instancia en meses. Null = usa el default de configuracion.
  mesesCaducidad: z.coerce.number().int().min(1).max(120).optional().nullable(),
  fechaPrescripcion: fechaISO.optional().nullable(),
  observaciones: textoOpcional(2000),
};

export const crearExpediente = z.object(camposBase).strict();

export const actualizarExpediente = z
  .object(Object.assign({}, camposBase, { version }))
  .strict();

export const listarExpedientes = paginacion.extend({
  clienteId: z.coerce.number().int().positive().optional(),
  fueroId: z.coerce.number().int().positive().optional(),
  estadoId: z.coerce.number().int().positive().optional(),
  etapaId: z.coerce.number().int().positive().optional(),
  abogadoId: z.coerce.number().int().positive().optional(),
  caracter: z.enum(CARACTERES).optional(),
  soloActivas: z.coerce.boolean().optional(),
  soloMias: z.coerce.boolean().optional(),
  incluirEliminados: z.coerce.boolean().optional(),
});

export const ORDENABLES = [
  'caratula',
  'codigo',
  'fechaInicio',
  'ultimaActuacion',
  'montoReclamado',
  'creadoEn',
];
