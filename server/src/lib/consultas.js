/**
 * Helpers de acceso a datos compartidos por todos los modulos.
 *
 * Existen para que las reglas transversales (borrado logico, paginacion,
 * bloqueo optimista) esten escritas UNA sola vez. Si cada modulo repitiera
 * `eliminadoEn: null` a mano, alcanza con olvidarlo en un lugar para que
 * empiecen a aparecer registros borrados en una pantalla.
 */
import { ApiError } from '../utils/ApiError.js';

/** Filtro base: solo registros vivos. */
export const VIVOS = { eliminadoEn: null };

/** Combina el filtro de vivos con los filtros propios del modulo. */
export function soloVivos(where) {
  return Object.assign({}, where || {}, VIVOS);
}

/** Traduce page/limit a skip/take de Prisma. */
export function paginar(datosQuery) {
  const page = datosQuery.page || 1;
  const limit = datosQuery.limit || 25;
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

/**
 * Construye el orderBy validando el campo contra una lista blanca.
 * Sin la lista blanca, un ?ordenarPor= arbitrario permite ordenar por columnas
 * que no deberian ser visibles y filtrar informacion por diferencia de orden.
 */
export function ordenar(datosQuery, permitidos, porDefecto) {
  const campo =
    datosQuery.ordenarPor && permitidos.includes(datosQuery.ordenarPor)
      ? datosQuery.ordenarPor
      : porDefecto;
  const direccion = datosQuery.orden === 'asc' ? 'asc' : 'desc';
  return { [campo]: direccion };
}

/**
 * Busqueda de texto libre sobre varios campos.
 * Prisma parametriza el valor, asi que no hay riesgo de inyeccion; el usuario
 * puede escribir comillas o punto y coma sin problema.
 */
export function buscarEn(campos, termino) {
  if (!termino) return {};
  return { OR: campos.map((c) => ({ [c]: { contains: termino } })) };
}

/**
 * Bloqueo optimista.
 *
 * El cliente manda la version que tenia cargada. Si en el medio otro usuario
 * guardo, la version de la base ya no coincide y se responde 409 en vez de
 * pisar el trabajo del otro en silencio. Es la respuesta al riesgo de
 * concurrencia que trae pasar de un Excel de un solo usuario a una app
 * multiusuario.
 */
export function verificarVersion(registroActual, versionEnviada, nombreEntidad) {
  if (registroActual.version !== versionEnviada) {
    throw ApiError.conflicto(
      'Otro usuario modifico este registro mientras lo editabas. Recarga la pantalla y volve a aplicar tus cambios.',
      {
        codigo: 'CONFLICTO_VERSION',
        detalles: {
          entidad: nombreEntidad,
          versionEnviada,
          versionActual: registroActual.version,
        },
      }
    );
  }
}

/** Lanza 404 si el registro no existe o esta dado de baja. */
export function exigirExistencia(registro, mensaje) {
  if (!registro || registro.eliminadoEn) {
    throw ApiError.noEncontrado(mensaje || 'El registro no existe o fue eliminado');
  }
  return registro;
}

/** Filtro de rango de fechas para una columna DATE. */
export function rangoFechas(campo, desde, hasta) {
  if (!desde && !hasta) return {};
  const filtro = {};
  if (desde) filtro.gte = new Date(desde + 'T00:00:00.000Z');
  if (hasta) filtro.lte = new Date(hasta + 'T00:00:00.000Z');
  return { [campo]: filtro };
}
