/**
 * SEMAFORO DE VENCIMIENTOS - regla transversal del sistema.
 *
 * Este es el unico lugar del proyecto donde se decide si algo esta vencido.
 * Lo consumen el tablero, el calendario, la agenda, expedientes, la ficha y la
 * grilla de eventos. Si hubiera dos implementaciones, tarde o temprano una
 * pintaria en rojo lo que la otra pinta en verde, que es exactamente el tipo de
 * error que hace que un abogado se pierda un plazo.
 *
 * Todas las funciones son PURAS: reciben el "hoy" como parametro y no leen el
 * reloj ni la base. Por eso se pueden testear a fondo (ver tests/semaforo.test.js).
 */
import { aISO, diffDias } from '../utils/fechas.js';

export const SITUACION = {
  VENCIDO: 'VENCIDO',
  VENCE_HOY: 'VENCE_HOY',
  POR_VENCER: 'POR_VENCER',
  EN_FECHA: 'EN_FECHA',
  CUMPLIDO: 'CUMPLIDO',
  /** Sin fecha de vencimiento cargada (ej. un recurrente desactivado). */
  SIN_FECHA: 'SIN_FECHA',
  /**
   * Extension propia sobre los cinco estados de la planilla: un evento
   * cancelado no esta cumplido (no se hizo) pero tampoco esta vencido (ya no
   * hay que hacerlo). Mostrarlo como CUMPLIDO seria mentir en el historial.
   */
  CANCELADO: 'CANCELADO',
  /**
   * Ocurrencia PASADA de un evento recurrente, sin registro de cumplimiento.
   *
   * No es un vencimiento incumplido: es una proyeccion. El sistema no tiene
   * forma de saber si la reunion de hace tres semanas se hizo o no, porque
   * nadie la tildo. Marcarla en rojo pintaria de alarma medio calendario y
   * arruinaria el valor del semaforo, que sirve justamente porque el rojo es
   * excepcional.
   */
  HISTORICO: 'HISTORICO',
};

/**
 * Prioridad de ordenamiento. Menor numero = mas arriba en las listas.
 * Replica el orden que pide el calendario: vencidos primero, cumplidos al fondo.
 */
export const ORDEN_SITUACION = {
  VENCIDO: 0,
  VENCE_HOY: 1,
  POR_VENCER: 2,
  EN_FECHA: 3,
  SIN_FECHA: 4,
  CUMPLIDO: 5,
  CANCELADO: 6,
  HISTORICO: 7,
};

/** Estados de un evento puntual que siguen contando como trabajo pendiente. */
const ESTADOS_PENDIENTES = new Set(['PENDIENTE', 'EN_CURSO', 'REPROGRAMADO']);

/**
 * Un evento reprogramado sigue siendo pendiente: si la fecha nueva ya paso,
 * tiene que aparecer vencido igual. Cancelado, en cambio, sale del circuito.
 */
export function esPendiente(estadoEvento) {
  return ESTADOS_PENDIENTES.has(estadoEvento);
}

/**
 * Calcula la situacion de un vencimiento.
 *
 * @param {object} args
 * @param {string|Date|null} args.fechaVto  Fecha de vencimiento.
 * @param {string} args.hoy                 'YYYY-MM-DD' del dia de hoy en Argentina.
 * @param {number} args.umbralDias          Dias de anticipacion para POR_VENCER.
 * @param {boolean} [args.cumplido]         Si ya fue resuelto.
 * @param {boolean} [args.cancelado]        Si fue cancelado.
 * @param {boolean} [args.historico]        Ocurrencia pasada de un recurrente.
 * @returns {string} una clave de SITUACION
 */
export function calcularSituacion(args) {
  const hoy = aISO(args.hoy);
  const fechaVto = aISO(args.fechaVto);
  const umbral = Number.isFinite(args.umbralDias) ? args.umbralDias : 7;

  // El orden de los cortes importa: lo cumplido y lo cancelado ganan sobre
  // cualquier fecha. Un plazo cumplido la semana pasada NO es un vencido.
  if (args.cancelado) return SITUACION.CANCELADO;
  if (args.historico) return SITUACION.HISTORICO;
  if (args.cumplido) return SITUACION.CUMPLIDO;
  if (!fechaVto || !hoy) return SITUACION.SIN_FECHA;

  const dias = diffDias(hoy, fechaVto); // negativo = ya paso

  if (dias < 0) return SITUACION.VENCIDO;
  if (dias === 0) return SITUACION.VENCE_HOY;
  if (dias <= umbral) return SITUACION.POR_VENCER;
  return SITUACION.EN_FECHA;
}

/**
 * Dias restantes (positivo) o transcurridos desde el vencimiento (negativo).
 * Devuelve null si no hay fecha.
 */
export function diasRestantes(fechaVto, hoy) {
  const f = aISO(fechaVto);
  const h = aISO(hoy);
  if (!f || !h) return null;
  return diffDias(h, f);
}

/**
 * El texto que ve el usuario, igual que en la planilla:
 * "8 dias vencidos", "1 dia vencido", "VENCE HOY", "3 dias por vencer".
 */
export function textoDias(situacion, dias) {
  switch (situacion) {
    case SITUACION.CUMPLIDO:
      return '—'; // guion largo: ya no importa cuanto falta
    case SITUACION.CANCELADO:
      return 'Cancelado';
    case SITUACION.HISTORICO:
      return '—';
    case SITUACION.SIN_FECHA:
      return 'Sin fecha';
    case SITUACION.VENCE_HOY:
      return 'VENCE HOY';
    case SITUACION.VENCIDO: {
      const n = Math.abs(dias == null ? 0 : dias);
      return n === 1 ? '1 dia vencido' : n + ' dias vencidos';
    }
    default: {
      const n = dias == null ? 0 : dias;
      return n === 1 ? '1 dia por vencer' : n + ' dias por vencer';
    }
  }
}

/** Etiqueta corta para mostrar en el badge. */
export function etiquetaSituacion(situacion) {
  const mapa = {
    VENCIDO: 'Vencido',
    VENCE_HOY: 'Vence hoy',
    POR_VENCER: 'Por vencer',
    EN_FECHA: 'En fecha',
    CUMPLIDO: 'Cumplido',
    SIN_FECHA: 'Sin fecha',
    CANCELADO: 'Cancelado',
    HISTORICO: 'Ocurrencia pasada',
  };
  return mapa[situacion] || situacion;
}

/**
 * Enriquece un vencimiento con todo lo que la UI necesita para pintarlo.
 * Es el punto unico por el que pasa cualquier item antes de salir de la API.
 */
export function decorarVencimiento(item, contexto) {
  const hoy = contexto.hoy;
  const umbralDias = contexto.umbralDias;

  const situacion = calcularSituacion({
    fechaVto: item.fechaVto,
    hoy,
    umbralDias,
    cumplido: item.cumplido === true,
    cancelado: item.cancelado === true,
    historico: item.historico === true,
  });

  const dias = diasRestantes(item.fechaVto, hoy);

  return Object.assign({}, item, {
    situacion,
    situacionEtiqueta: etiquetaSituacion(situacion),
    dias,
    diasTexto: textoDias(situacion, dias),
    ordenSituacion: ORDEN_SITUACION[situacion],
  });
}

/**
 * Ordena como pide la planilla:
 *   vencidos (del mas viejo al mas nuevo) -> vence hoy -> por vencer ->
 *   en fecha -> sin fecha -> cumplidos -> cancelados
 *
 * Dentro de cada grupo, por fecha ascendente. Para los vencidos eso da
 * justamente "del mas viejo al mas nuevo", que es lo que se necesita para
 * atacar primero el atraso mas grave.
 */
export function ordenarPorUrgencia(items) {
  return items.slice().sort((a, b) => {
    const ordenA = a.ordenSituacion != null ? a.ordenSituacion : ORDEN_SITUACION[a.situacion];
    const ordenB = b.ordenSituacion != null ? b.ordenSituacion : ORDEN_SITUACION[b.situacion];
    if (ordenA !== ordenB) return ordenA - ordenB;

    const fa = aISO(a.fechaVto);
    const fb = aISO(b.fechaVto);
    if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;

    // Desempate estable por hora y despues por descripcion, para que dos
    // cargas iguales no bailen entre recargas de pantalla.
    const ha = a.hora || '';
    const hb = b.hora || '';
    if (ha !== hb) return ha < hb ? -1 : 1;
    return String(a.descripcion || '').localeCompare(String(b.descripcion || ''), 'es');
  });
}

/** Conteo por situacion, para las tarjetas del tablero. */
export function resumirSituaciones(items) {
  const base = {
    VENCIDO: 0,
    VENCE_HOY: 0,
    POR_VENCER: 0,
    EN_FECHA: 0,
    CUMPLIDO: 0,
    SIN_FECHA: 0,
    CANCELADO: 0,
    HISTORICO: 0,
  };
  for (const it of items) {
    if (base[it.situacion] != null) base[it.situacion] += 1;
  }
  return base;
}
