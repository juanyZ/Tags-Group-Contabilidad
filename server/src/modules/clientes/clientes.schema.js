/**
 * Esquemas de validacion de CLIENTES.
 *
 * Son estrictos a proposito: lo que no esta declarado se descarta. Asi un
 * cliente HTTP no puede mandar {"codigo":"CLI-999"} o {"version":50} y alterar
 * campos que le corresponde manejar al servidor.
 */
import { z } from 'zod';
import {
  fechaISO,
  texto,
  textoOpcional,
  idOpcional,
  paginacion,
  version,
} from '../../middlewares/validar.js';

export const TIPOS_PERSONA = ['FISICA', 'JURIDICA'];
export const ESTADOS_CLIENTE = ['ACTIVO', 'POTENCIAL', 'INACTIVO', 'EX_CLIENTE'];

const camposBase = {
  tipoPersona: z.enum(TIPOS_PERSONA),
  nombre: texto(200),
  // Se acepta con o sin puntos/guiones: se normaliza al guardar.
  documento: textoOpcional(20),
  fechaNacConstit: fechaISO.optional().nullable(),
  domicilio: textoOpcional(200),
  provinciaId: idOpcional,
  telefono: textoOpcional(60),
  email: z
    .union([z.string().trim().email('Email invalido').max(180), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : v.toLowerCase())),
  origenId: idOpcional,
  estado: z.enum(ESTADOS_CLIENTE).default('ACTIVO'),
  fechaAlta: fechaISO,
  abogadoId: idOpcional,
  observaciones: textoOpcional(2000),
};

export const crearCliente = z.object(camposBase).strict();

/** En la edicion la version es obligatoria: habilita el bloqueo optimista. */
export const actualizarCliente = z
  .object(Object.assign({}, camposBase, { version }))
  .strict();

export const listarClientes = paginacion.extend({
  estado: z.enum(ESTADOS_CLIENTE).optional(),
  tipoPersona: z.enum(TIPOS_PERSONA).optional(),
  abogadoId: z.coerce.number().int().positive().optional(),
  provinciaId: z.coerce.number().int().positive().optional(),
  soloMias: z.coerce.boolean().optional(),
  incluirEliminados: z.coerce.boolean().optional(),
});

/** Campos por los que se puede ordenar. Lista blanca: ver lib/consultas.js. */
export const ORDENABLES = ['nombre', 'codigo', 'fechaAlta', 'estado', 'creadoEn'];
