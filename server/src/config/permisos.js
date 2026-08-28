/**
 * Matriz de permisos (RBAC) en un unico lugar.
 *
 * Tenerla centralizada, y no como listas de roles sueltas repartidas por las
 * rutas, permite auditarla de un vistazo y testearla. El frontend recibe una
 * copia para ocultar botones, pero eso es SOLO cosmetica: la decision real la
 * toma siempre este archivo, del lado del servidor.
 *
 * Convencion: 'recurso:accion'.
 */

export const ROLES = ['ADMIN', 'ABOGADO', 'SECRETARIA', 'LECTURA'];

const TODOS = ['ADMIN', 'ABOGADO', 'SECRETARIA', 'LECTURA'];
const CARGA = ['ADMIN', 'ABOGADO', 'SECRETARIA'];
const PROFESIONALES = ['ADMIN', 'ABOGADO'];
const SOLO_ADMIN = ['ADMIN'];

export const PERMISOS = {
  // --- Operacion diaria ----------------------------------------------------
  'clientes:leer': TODOS,
  'clientes:escribir': CARGA,
  'clientes:eliminar': PROFESIONALES,

  'expedientes:leer': TODOS,
  'expedientes:escribir': CARGA,
  'expedientes:eliminar': PROFESIONALES,

  'eventos:leer': TODOS,
  'eventos:escribir': CARGA,
  'eventos:eliminar': CARGA,

  'recurrentes:leer': TODOS,
  'recurrentes:escribir': CARGA,
  'recurrentes:eliminar': PROFESIONALES,

  // --- Economia ------------------------------------------------------------
  // La secretaria PUEDE consultar honorarios (necesita informarle el saldo al
  // cliente que llama) pero no puede pactarlos ni registrar cobros.
  'honorarios:leer': TODOS,
  'honorarios:escribir': PROFESIONALES,
  'honorarios:eliminar': SOLO_ADMIN,

  'gastos:leer': TODOS,
  'gastos:escribir': CARGA,
  'gastos:eliminar': PROFESIONALES,

  'cuentacorriente:leer': TODOS,
  'dashboard:leer': TODOS,

  // --- Adjuntos ------------------------------------------------------------
  'adjuntos:leer': TODOS,
  'adjuntos:escribir': CARGA,
  'adjuntos:eliminar': PROFESIONALES,

  // --- Configuracion y administracion --------------------------------------
  'config:leer': TODOS,
  'config:escribir': SOLO_ADMIN,

  'catalogos:leer': TODOS,
  'catalogos:escribir': PROFESIONALES,

  'abogados:leer': TODOS,
  'abogados:escribir': SOLO_ADMIN,

  'plazos:leer': TODOS,
  'plazos:escribir': PROFESIONALES,

  'usuarios:leer': SOLO_ADMIN,
  'usuarios:escribir': SOLO_ADMIN,

  'audit:leer': SOLO_ADMIN,
};

/** true si el rol tiene el permiso. Desconocido => false (deniega por defecto). */
export function tienePermiso(rol, permiso) {
  const permitidos = PERMISOS[permiso];
  if (!permitidos) return false;
  return permitidos.includes(rol);
}

/** Lista de permisos de un rol. Se manda al frontend para pintar la UI. */
export function permisosDeRol(rol) {
  return Object.keys(PERMISOS).filter((p) => PERMISOS[p].includes(rol));
}
