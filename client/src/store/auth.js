/**
 * Estado de sesion.
 *
 * Zustand y no Redux porque lo unico que hay que compartir globalmente es la
 * sesion y un par de filtros: el resto del estado de la app es estado de
 * SERVIDOR y lo maneja React Query. Meter los datos del servidor en un store
 * global obliga a reimplementar cache, invalidacion y refetch a mano.
 */
import { create } from 'zustand';
import { api, setAccessToken, onSesionExpirada, normalizarError } from '../lib/api.js';

export const useAuth = create((set, get) => ({
  usuario: null,
  cargando: true, // true mientras se intenta rehidratar la sesion al arrancar
  error: null,

  /**
   * Al abrir la app se intenta un refresh. Si la cookie HttpOnly todavia es
   * valida, el usuario entra sin volver a escribir la contrasena; si no, va al
   * login. Este es el motivo por el que no hace falta guardar nada en
   * localStorage.
   */
  async iniciar() {
    try {
      const r = await api.post('/auth/refresh');
      setAccessToken(r.data.data.accessToken);
      set({ usuario: r.data.data.usuario, cargando: false, error: null });
    } catch {
      setAccessToken(null);
      set({ usuario: null, cargando: false });
    }
  },

  async login(email, password) {
    set({ error: null });
    try {
      const r = await api.post('/auth/login', { email, password });
      setAccessToken(r.data.data.accessToken);
      set({ usuario: r.data.data.usuario, error: null });
      return true;
    } catch (e) {
      const err = normalizarError(e);
      set({ error: err.mensaje });
      return false;
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Aunque falle la llamada, la sesion local se cierra igual.
    }
    setAccessToken(null);
    set({ usuario: null });
  },

  /** Corta la sesion sin llamar al backend (la disparo el interceptor). */
  cerrarLocal() {
    setAccessToken(null);
    set({ usuario: null });
  },

  /**
   * Chequeo de permisos para la UI.
   * OJO: esto solo sirve para ocultar botones. La decision real la toma el
   * backend en cada request; si alguien fuerza la UI, igual recibe un 403.
   */
  puede(permiso) {
    const u = get().usuario;
    if (!u || !u.permisos) return false;
    return u.permisos.includes(permiso);
  },
}));

// El interceptor avisa cuando la sesion murio del todo.
onSesionExpirada(() => {
  useAuth.getState().cerrarLocal();
});
