/**
 * Proyeccion de eventos recurrentes.
 *
 * Decision de diseno: NO se materializan filas por ocurrencia. Un evento
 * semanal cargado en 2020 generaria cientos de registros basura y habria que
 * mantenerlos si cambia la periodicidad. En su lugar, las ocurrencias se
 * calculan en memoria desde (fechaBase + periodicidad) cada vez que se piden.
 * Lo unico que se persiste es el CUMPLIMIENTO de una ocurrencia concreta.
 *
 * Funciones puras: reciben el "hoy" y no tocan la base.
 */
import { aISO, diffDias, sumarDias, sumarMeses } from '../utils/fechas.js';

/**
 * Traduccion de periodicidad a paso de calendario.
 *
 * QUINCENAL son 14 dias corridos (cada dos semanas), no "dos veces por mes":
 * es como venia funcionando la planilla y es lo que espera el estudio.
 */
export const PASOS = {
  SEMANAL: { unidad: 'dias', n: 7 },
  QUINCENAL: { unidad: 'dias', n: 14 },
  MENSUAL: { unidad: 'meses', n: 1 },
  BIMESTRAL: { unidad: 'meses', n: 2 },
  TRIMESTRAL: { unidad: 'meses', n: 3 },
  CUATRIMESTRAL: { unidad: 'meses', n: 4 },
  SEMESTRAL: { unidad: 'meses', n: 6 },
  ANUAL: { unidad: 'meses', n: 12 },
};

/** Devuelve la ocurrencia numero k (k >= 0) contada desde la fecha base. */
export function ocurrenciaK(fechaBase, periodicidad, k) {
  const base = aISO(fechaBase);
  const paso = PASOS[periodicidad];
  if (!base || !paso || k < 0) return null;

  return paso.unidad === 'dias'
    ? sumarDias(base, paso.n * k)
    : // Siempre se suma desde la BASE, nunca encadenando desde la ocurrencia
      // anterior: si no, un 31 de enero recortado al 28 de febrero arrastraria
      // el recorte y todas las fechas siguientes caerian el 28.
      sumarMeses(base, paso.n * k);
}

/**
 * Primera ocurrencia igual o posterior a `desde`.
 * Si la fecha base todavia no llego, la propia base es la proxima.
 */
export function proximaOcurrencia(fechaBase, periodicidad, desde) {
  const base = aISO(fechaBase);
  const ref = aISO(desde);
  const paso = PASOS[periodicidad];
  if (!base || !ref || !paso) return null;

  if (base >= ref) return base;

  if (paso.unidad === 'dias') {
    const transcurridos = diffDias(base, ref);
    const k = Math.ceil(transcurridos / paso.n);
    return ocurrenciaK(base, periodicidad, k);
  }

  // Para meses se estima el salto y se ajusta. El ajuste es necesario porque
  // el recorte de fin de mes puede correr la fecha uno o dos dias.
  const partesBase = base.split('-').map(Number);
  const partesRef = ref.split('-').map(Number);
  const mesesDeDiferencia =
    (partesRef[0] - partesBase[0]) * 12 + (partesRef[1] - partesBase[1]);

  let k = Math.max(0, Math.floor(mesesDeDiferencia / paso.n));

  // Retrocede si se paso, y avanza mientras siga siendo anterior a la referencia.
  while (k > 0 && ocurrenciaK(base, periodicidad, k - 1) >= ref) k -= 1;
  // Tope de seguridad: evita un bucle infinito ante datos corruptos.
  let guarda = 0;
  while (ocurrenciaK(base, periodicidad, k) < ref && guarda < 1200) {
    k += 1;
    guarda += 1;
  }

  return ocurrenciaK(base, periodicidad, k);
}

/**
 * Todas las ocurrencias dentro de [desde, hasta], inclusive.
 * Es lo que usa la grilla mensual del calendario y la agenda semanal.
 */
export function ocurrenciasEnRango(fechaBase, periodicidad, desde, hasta, maximo) {
  const tope = maximo == null ? 500 : maximo;
  const inicio = aISO(desde);
  const fin = aISO(hasta);
  if (!inicio || !fin || inicio > fin) return [];

  const ocurrencias = [];
  let actual = proximaOcurrencia(fechaBase, periodicidad, inicio);

  // Se avanza de a una ocurrencia. Con el tope de 500 y rangos de un mes o una
  // quincena (lo que piden las vistas), el costo es despreciable.
  let iteraciones = 0;
  while (actual && actual <= fin && iteraciones < tope) {
    ocurrencias.push(actual);
    const siguiente = proximaOcurrencia(fechaBase, periodicidad, sumarDias(actual, 1));
    if (!siguiente || siguiente <= actual) break; // proteccion ante datos raros
    actual = siguiente;
    iteraciones += 1;
  }

  return ocurrencias;
}

/**
 * Clave con la que se registra el cumplimiento de una ocurrencia.
 *
 * Es la fecha de la ocurrencia. Al ser unica por recurrente, tildar dos veces
 * el mismo periodo es idempotente, y queda historial de todos los periodos
 * anteriores (en el Excel el tilde se borraba a mano y no dejaba rastro).
 */
export function claveCumplimiento(fechaOcurrencia) {
  return aISO(fechaOcurrencia);
}

/**
 * Arma la vista de un recurrente: proxima ocurrencia y si ya esta cumplida.
 *
 * @param {object} recurrente  fila de eventos_recurrentes
 * @param {object} ctx  { hoy, clavesCumplidas: Set<string> }
 */
export function proyectarProxima(recurrente, ctx) {
  // Un recurrente inactivo no proyecta nada: sigue en la lista pero sin fecha,
  // que es la forma de "apagarlo" sin borrarlo ni perder el historial.
  if (!recurrente.activo) {
    return { fechaVto: null, cumplido: false, claveCumplimiento: null };
  }

  const fecha = proximaOcurrencia(recurrente.fechaBase, recurrente.periodicidad, ctx.hoy);
  if (!fecha) return { fechaVto: null, cumplido: false, claveCumplimiento: null };

  const clave = claveCumplimiento(fecha);
  const cumplido = ctx.clavesCumplidas ? ctx.clavesCumplidas.has(clave) : false;

  // Si la ocurrencia de hoy ya se cumplio, lo que corresponde mostrar como
  // "proximo vencimiento" es la ocurrencia siguiente, no la que ya se hizo.
  if (cumplido) {
    const siguiente = proximaOcurrencia(
      recurrente.fechaBase,
      recurrente.periodicidad,
      sumarDias(fecha, 1)
    );
    return {
      fechaVto: siguiente,
      cumplido: false,
      claveCumplimiento: claveCumplimiento(siguiente),
      ultimaCumplida: clave,
    };
  }

  return { fechaVto: fecha, cumplido: false, claveCumplimiento: clave };
}
