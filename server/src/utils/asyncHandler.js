/**
 * Express 4 no captura rechazos de funciones async: si un controller lanza, la
 * peticion queda colgada hasta el timeout. Este wrapper de cuatro lineas evita
 * sumar una dependencia solo para eso.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
