/**
 * Hooks de datos compartidos.
 *
 * Los catalogos y las listas de opciones se piden una vez y se cachean largo:
 * cambian una vez cada varios meses y los necesitan casi todas las pantallas.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, normalizarError } from '../lib/api.js';

const CACHE_LARGO = 10 * 60 * 1000;

/** Todos los catalogos agrupados por tipo, en una sola llamada. */
export function useCatalogos() {
  return useQuery({
    queryKey: ['catalogos'],
    queryFn: () => get('/catalogos/todos'),
    staleTime: CACHE_LARGO,
  });
}

/** Atajo: opciones de un tipo de catalogo listas para el <Selector>. */
export function useOpcionesCatalogo(tipo) {
  const catalogos = useCatalogos();
  const items = catalogos.data && catalogos.data[tipo] ? catalogos.data[tipo] : [];
  return items.map((i) => ({ valor: i.id, texto: i.valor, scope: i.scope }));
}

export function useAbogados() {
  return useQuery({
    queryKey: ['abogados'],
    queryFn: () => get('/abogados'),
    staleTime: CACHE_LARGO,
  });
}

export function useClientesOpciones() {
  return useQuery({
    queryKey: ['clientes', 'opciones'],
    queryFn: () => get('/clientes/opciones'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useExpedientesOpciones() {
  return useQuery({
    queryKey: ['expedientes', 'opciones'],
    queryFn: () => get('/expedientes/opciones'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => get('/config'),
    staleTime: CACHE_LARGO,
  });
}

/**
 * Mutacion con manejo de errores ya normalizado e invalidacion de cache.
 *
 * `invalidar` es la lista de queryKeys a refrescar despues de guardar. Tenerlo
 * explicito evita el problema tipico de guardar y que la grilla siga mostrando
 * el dato viejo.
 */
export function useGuardar(fn, opciones) {
  const qc = useQueryClient();
  const opts = opciones || {};

  return useMutation({
    mutationFn: fn,
    onSuccess: (datos) => {
      for (const clave of opts.invalidar || []) {
        qc.invalidateQueries({ queryKey: Array.isArray(clave) ? clave : [clave] });
      }
      if (opts.onExito) opts.onExito(datos);
    },
    onError: (error) => {
      if (opts.onError) opts.onError(normalizarError(error));
    },
  });
}

/** Extrae el error normalizado de una mutacion, listo para pintar. */
export function errorDe(mutacion) {
  if (!mutacion || !mutacion.error) return null;
  return normalizarError(mutacion.error);
}
