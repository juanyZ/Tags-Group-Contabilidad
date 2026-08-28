/**
 * Autorizacion (RBAC). Se aplica endpoint por endpoint contra la matriz de
 * src/config/permisos.js.
 *
 * El frontend oculta botones segun los permisos que recibe al loguearse, pero
 * eso es solo comodidad visual: si alguien llama la API a mano, la unica
 * defensa real es este middleware.
 */
import { tienePermiso } from '../config/permisos.js';
import { ApiError } from '../utils/ApiError.js';

/** autorizar('clientes:escribir') */
export function autorizar(permiso) {
  return (req, res, next) => {
    if (!req.usuario) return next(ApiError.noAutenticado());
    if (!tienePermiso(req.usuario.rol, permiso)) {
      return next(
        ApiError.prohibido('Tu rol no tiene permiso para esta operacion', {
          codigo: 'SIN_PERMISO',
          detalles: { permiso },
        })
      );
    }
    return next();
  };
}

/**
 * Filtro opcional "solo mis causas".
 *
 * Un ABOGADO puede pedir ?soloMias=true para ver unicamente lo suyo. No es una
 * restriccion: en un estudio chico todos necesitan poder cubrir al companero,
 * asi que por defecto se ve todo. Si el estudio quisiera aislamiento duro,
 * este es el unico lugar a cambiar (forzando el filtro para el rol ABOGADO).
 */
export function filtroPropio(req) {
  const soloMias = req.datosQuery && req.datosQuery.soloMias;
  if (!soloMias) return null;
  if (!req.usuario.abogadoId) {
    // El usuario no esta vinculado a una ficha de abogado: no tiene "sus"
    // causas. Se devuelve un filtro imposible en vez de ignorar el pedido,
    // para no mostrarle de mas sin que se de cuenta.
    return { abogadoId: -1 };
  }
  return { abogadoId: req.usuario.abogadoId };
}
