/**
 * Forma unica de respuesta de la API: { data, error, meta }.
 * Que el contrato sea siempre el mismo permite un interceptor unico en el
 * frontend y evita que cada pantalla invente su propio manejo de errores.
 */

export function ok(res, data, meta, status) {
  return res.status(status || 200).json({ data, error: null, meta: meta || null });
}

export function creado(res, data, meta) {
  return ok(res, data, meta, 201);
}

export function sinContenido(res) {
  return res.status(204).end();
}

/** Respuesta paginada. `meta` lleva lo necesario para pintar el paginador. */
export function paginado(res, items, info) {
  const page = info.page;
  const limit = info.limit;
  const total = info.total;
  return res.status(200).json({
    data: items,
    error: null,
    meta: {
      page,
      limit,
      total,
      totalPaginas: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  });
}
