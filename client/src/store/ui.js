/**
 * Estado de interfaz que se comparte entre pantallas: el periodo del tablero
 * y el filtro "solo mis causas". Se persiste en sessionStorage para que no se
 * pierda al recargar, pero NO en localStorage: son preferencias de sesion, no
 * configuracion permanente.
 */
import { useMemo } from 'react';
import { create } from 'zustand';

const CLAVE = 'tags-ui';

function leerGuardado() {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : {};
  } catch {
    return {};
  }
}

function guardar(estado) {
  try {
    sessionStorage.setItem(
      CLAVE,
      JSON.stringify({ anio: estado.anio, mes: estado.mes, soloMias: estado.soloMias })
    );
  } catch {
    // sessionStorage puede estar deshabilitado: no es critico.
  }
}

const guardado = leerGuardado();
const ahora = new Date();

export const useUI = create((set, get) => ({
  // mes = 0 significa "todo el ano", igual que el selector de la planilla.
  anio: guardado.anio || ahora.getFullYear(),
  mes: guardado.mes != null ? guardado.mes : 0,
  soloMias: guardado.soloMias || false,

  setPeriodo(anio, mes) {
    set({ anio, mes });
    guardar(get());
  },

  setSoloMias(valor) {
    set({ soloMias: valor });
    guardar(get());
  },
}));

/**
 * Rango de fechas del periodo elegido.
 *
 * Es una funcion suelta y NO un metodo del store a proposito. Como devuelve un
 * objeto nuevo en cada llamada, usarla como selector (`useUI((s) => s.rango())`)
 * rompe: Zustand compara los snapshots por referencia, nunca coinciden y se
 * dispara un re-render infinito.
 *
 * La forma correcta es seleccionar los primitivos y memorizar el resultado:
 *
 *   const anio = useUI((s) => s.anio);
 *   const mes = useUI((s) => s.mes);
 *   const rango = useMemo(() => rangoDelPeriodo(anio, mes), [anio, mes]);
 */
export function rangoDelPeriodo(anio, mes) {
  if (!mes) return { desde: anio + '-01-01', hasta: anio + '-12-31' };
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: anio + '-' + mm + '-01', hasta: anio + '-' + mm + '-' + ultimo };
}

/** Hook de conveniencia: devuelve el rango ya memorizado. */
export function useRangoPeriodo() {
  const anio = useUI((s) => s.anio);
  const mes = useUI((s) => s.mes);
  return useMemo(() => rangoDelPeriodo(anio, mes), [anio, mes]);
}
