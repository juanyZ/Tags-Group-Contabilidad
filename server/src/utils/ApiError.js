/**
 * Error de negocio con codigo HTTP. Todo lo que se lanza a proposito usa esta
 * clase; cualquier otra cosa que llegue al handler de errores se trata como un
 * 500 y NO se le muestra el detalle al cliente.
 */
export class ApiError extends Error {
  constructor(status, mensaje, opciones) {
    super(mensaje);
    const opts = opciones || {};
    this.name = 'ApiError';
    this.status = status;
    this.codigo = opts.codigo || null;
    this.detalles = opts.detalles || null;
    // Marca explicita: distingue un error previsto de un bug inesperado.
    this.esOperacional = true;
  }

  static badRequest(m, o) {
    return new ApiError(400, m, o);
  }

  static noAutenticado(m, o) {
    return new ApiError(401, m || 'No autenticado', o);
  }

  static prohibido(m, o) {
    return new ApiError(403, m || 'No tenes permiso para esta operacion', o);
  }

  static noEncontrado(m, o) {
    return new ApiError(404, m || 'Recurso no encontrado', o);
  }

  static conflicto(m, o) {
    return new ApiError(409, m, o);
  }

  static noProcesable(m, o) {
    return new ApiError(422, m, o);
  }

  static demasiadasPeticiones(m, o) {
    return new ApiError(429, m || 'Demasiadas peticiones', o);
  }
}
