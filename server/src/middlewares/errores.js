/**
 * Manejo central de errores.
 *
 * Regla de seguridad: al cliente le llega un mensaje util pero generico; el
 * detalle (stack, query, constraint que fallo) queda solo en el log del
 * servidor. Filtrar un error de Prisma tal cual le revela a un atacante la
 * estructura de la base.
 */
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError.js';
import { esProduccion } from '../config/env.js';

/** 404 para rutas que no existen. Va antes del handler de errores. */
export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    data: null,
    error: { mensaje: 'Ruta no encontrada', codigo: 'RUTA_NO_ENCONTRADA' },
    meta: null,
  });
}

function traducirErrorPrisma(err) {
  switch (err.code) {
    case 'P2002': {
      // Violacion de UNIQUE. Se nombra el campo, que es informacion que el
      // usuario necesita, pero no se expone el nombre de la tabla.
      const campos = (err.meta && err.meta.target) || [];
      const lista = Array.isArray(campos) ? campos.join(', ') : String(campos);
      return new ApiError(409, 'Ya existe un registro con ese valor' + (lista ? ' (' + lista + ')' : ''), {
        codigo: 'DUPLICADO',
      });
    }
    case 'P2003':
      return new ApiError(409, 'No se puede completar: el registro esta referenciado por otros datos', {
        codigo: 'FK_EN_USO',
      });
    case 'P2025':
      return new ApiError(404, 'El registro no existe o fue eliminado', { codigo: 'NO_ENCONTRADO' });
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars -- Express identifica el handler por sus 4 argumentos.
export function manejadorErrores(err, req, res, next) {
  let error = err;

  // 1) Validacion de entrada: se devuelve el detalle campo por campo, que es
  //    informacion del propio input del usuario y no filtra nada del servidor.
  if (error instanceof ZodError) {
    return res.status(422).json({
      data: null,
      error: {
        mensaje: 'Los datos enviados no son validos',
        codigo: 'VALIDACION',
        detalles: error.issues.map((i) => ({
          campo: i.path.join('.'),
          mensaje: i.message,
        })),
      },
      meta: null,
    });
  }

  // 2) Errores conocidos de Prisma -> ApiError equivalente.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const traducido = traducirErrorPrisma(error);
    if (traducido) {
      // El original se loguea igual, para poder diagnosticar.
      console.error('[prisma]', error.code, error.message);
      error = traducido;
    }
  }

  // 3) Body mal formado (JSON invalido) que tira el parser de Express.
  if (error && error.type === 'entity.parse.failed') {
    error = ApiError.badRequest('El cuerpo de la peticion no es JSON valido');
  }
  if (error && error.type === 'entity.too.large') {
    error = new ApiError(413, 'El cuerpo de la peticion es demasiado grande');
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      data: null,
      error: {
        mensaje: error.message,
        codigo: error.codigo,
        detalles: error.detalles,
      },
      meta: null,
    });
  }

  // 4) Todo lo demas es un bug: se loguea completo y se responde generico.
  console.error('[error-no-controlado]', {
    metodo: req.method,
    ruta: req.originalUrl,
    usuarioId: req.usuario ? req.usuario.id : null,
    mensaje: error && error.message,
    stack: error && error.stack,
  });

  return res.status(500).json({
    data: null,
    error: {
      mensaje: 'Ocurrio un error interno. Volve a intentar en unos minutos.',
      codigo: 'ERROR_INTERNO',
      // Solo fuera de produccion se devuelve el detalle, para poder depurar.
      detalles: esProduccion ? null : String(error && error.message),
    },
    meta: null,
  });
}
