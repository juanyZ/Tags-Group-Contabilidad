/**
 * Cliente HTTP unico de la aplicacion.
 *
 * Decisiones importantes:
 *
 * 1. El ACCESS TOKEN vive EN MEMORIA, nunca en localStorage. Si un XSS logra
 *    ejecutar codigo, no encuentra un token guardado que sobreviva a la
 *    recarga. La sesion se rehidrata con el refresh token, que esta en una
 *    cookie HttpOnly que el JavaScript no puede leer.
 *
 * 2. Un solo interceptor central maneja el 401 por token expirado: pide un
 *    token nuevo y reintenta la peticion original, de forma transparente. Si
 *    llegan varias peticiones vencidas a la vez, se encolan y comparten UN
 *    solo refresh (si no, cinco pantallas abiertas dispararian cinco
 *    rotaciones y la deteccion de reuso del backend cortaria la sesion).
 */
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api/v1';

/** Token en memoria del modulo. Se pierde al recargar, a proposito. */
let accessToken = null;
let alCerrarSesion = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** El store de auth registra aca que hacer cuando la sesion muere. */
export function onSesionExpirada(callback) {
  alCerrarSesion = callback;
}

export const api = axios.create({
  baseURL: BASE,
  // Necesario para que viaje la cookie del refresh token.
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = 'Bearer ' + accessToken;
  }
  return config;
});

// --- Manejo del refresh, con cola para evitar rotaciones simultaneas -------
let refrescando = false;
let cola = [];

function resolverCola(token, error) {
  cola.forEach((p) => (error ? p.rechazar(error) : p.resolver(token)));
  cola = [];
}

api.interceptors.response.use(
  (respuesta) => respuesta,
  async (error) => {
    const original = error.config;
    const estado = error.response ? error.response.status : null;
    const codigo =
      error.response && error.response.data && error.response.data.error
        ? error.response.data.error.codigo
        : null;

    // Solo se reintenta el 401 por token expirado, y una unica vez.
    const debeRefrescar =
      estado === 401 &&
      codigo === 'TOKEN_EXPIRADO' &&
      original &&
      !original._reintentado &&
      !original.url.includes('/auth/refresh');

    if (!debeRefrescar) {
      // Un 401 que no es de token expirado significa sesion invalida.
      if (estado === 401 && original && !original.url.includes('/auth/login')) {
        setAccessToken(null);
        if (alCerrarSesion) alCerrarSesion();
      }
      return Promise.reject(normalizarError(error));
    }

    original._reintentado = true;

    if (refrescando) {
      // Ya hay un refresh en curso: esperar a que termine y reintentar.
      return new Promise((resolver, rechazar) => {
        cola.push({ resolver, rechazar });
      })
        .then((token) => {
          original.headers.Authorization = 'Bearer ' + token;
          return api(original);
        })
        .catch((e) => Promise.reject(e));
    }

    refrescando = true;

    try {
      const r = await axios.post(BASE + '/auth/refresh', {}, { withCredentials: true });
      const nuevo = r.data.data.accessToken;
      setAccessToken(nuevo);
      resolverCola(nuevo, null);
      original.headers.Authorization = 'Bearer ' + nuevo;
      return api(original);
    } catch (e) {
      resolverCola(null, e);
      setAccessToken(null);
      if (alCerrarSesion) alCerrarSesion();
      return Promise.reject(normalizarError(e));
    } finally {
      refrescando = false;
    }
  }
);

/**
 * Convierte cualquier fallo en una forma unica y en castellano, para que las
 * pantallas no tengan que inspeccionar la estructura de axios.
 */
export function normalizarError(error) {
  if (error.response && error.response.data && error.response.data.error) {
    const e = error.response.data.error;
    return {
      mensaje: e.mensaje || 'Ocurrio un error',
      codigo: e.codigo || null,
      detalles: e.detalles || null,
      status: error.response.status,
      // Los errores de validacion vienen campo por campo: se arma un mapa
      // listo para pintar debajo de cada input.
      porCampo: Array.isArray(e.detalles)
        ? e.detalles.reduce((acc, d) => {
            acc[d.campo] = d.mensaje;
            return acc;
          }, {})
        : {},
    };
  }

  if (error.code === 'ECONNABORTED') {
    return { mensaje: 'La consulta tardo demasiado. Volve a intentar.', codigo: 'TIMEOUT', porCampo: {} };
  }

  if (!error.response) {
    return {
      mensaje: 'No se pudo conectar con el servidor. Revisa tu conexion.',
      codigo: 'SIN_CONEXION',
      porCampo: {},
    };
  }

  return { mensaje: 'Ocurrio un error inesperado', codigo: null, porCampo: {} };
}

// --- Atajos ----------------------------------------------------------------
// Todas devuelven directamente el `data` del sobre { data, error, meta }.

export async function get(url, params) {
  const r = await api.get(url, { params });
  return r.data.data;
}

/** Igual que get() pero conserva el meta (paginacion). */
export async function getPaginado(url, params) {
  const r = await api.get(url, { params });
  return { items: r.data.data, meta: r.data.meta };
}

export async function post(url, body) {
  const r = await api.post(url, body);
  return r.data.data;
}

export async function put(url, body) {
  const r = await api.put(url, body);
  return r.data.data;
}

export async function patch(url, body) {
  const r = await api.patch(url, body);
  return r.data.data;
}

export async function del(url) {
  const r = await api.delete(url);
  return r.data.data;
}

/**
 * Descarga un archivo (PDF o CSV) respetando la sesion.
 * No se puede usar un <a href> comun porque el access token va en la cabecera
 * Authorization, y un link del navegador no la manda.
 */
export async function descargar(url, nombreSugerido) {
  const r = await api.get(url, { responseType: 'blob' });

  const blob = new Blob([r.data], {
    type: r.headers['content-type'] || 'application/octet-stream',
  });
  const enlace = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);

  enlace.href = objectUrl;
  enlace.download = nombreSugerido;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // Liberar el objeto: si no, el blob queda en memoria hasta recargar.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
