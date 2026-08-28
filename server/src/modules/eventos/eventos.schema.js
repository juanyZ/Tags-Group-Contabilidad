import { z } from 'zod';
import {
  fechaISO,
  texto,
  textoOpcional,
  idOpcional,
  horaOpcional,
  paginacion,
  version,
} from '../../middlewares/validar.js';

export const PRIORIDADES = ['ALTA', 'MEDIA', 'BAJA'];
export const ESTADOS_EVENTO = [
  'PENDIENTE',
  'EN_CURSO',
  'CUMPLIDO',
  'REPROGRAMADO',
  'CANCELADO',
];

const camposBase = {
  fechaVto: fechaISO,
  hora: horaOpcional,
  tipoId: idOpcional,
  // Corta y clara: es lo unico que se ve en la celda del calendario.
  descripcion: texto(300),
  // Vacio = evento del estudio, no de una causa.
  expedienteId: idOpcional,
  responsableId: idOpcional,
  prioridad: z.enum(PRIORIDADES).default('MEDIA'),
  estado: z.enum(ESTADOS_EVENTO).default('PENDIENTE'),
  observaciones: textoOpcional(2000),
};

export const crearEvento = z.object(camposBase).strict();

export const actualizarEvento = z.object(Object.assign({}, camposBase, { version })).strict();

export const cambiarEstadoEvento = z.object({ estado: z.enum(ESTADOS_EVENTO) }).strict();

export const listarEventos = paginacion.extend({
  expedienteId: z.coerce.number().int().positive().optional(),
  clienteId: z.coerce.number().int().positive().optional(),
  responsableId: z.coerce.number().int().positive().optional(),
  tipoId: z.coerce.number().int().positive().optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  estado: z.enum(ESTADOS_EVENTO).optional(),
  soloPendientes: z.coerce.boolean().optional(),
  soloEstudio: z.coerce.boolean().optional(),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
  incluirEliminados: z.coerce.boolean().optional(),
});

export const ORDENABLES = ['fechaVto', 'codigo', 'descripcion', 'prioridad', 'estado', 'creadoEn'];
