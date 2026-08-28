/**
 * COMPUTO DE PLAZOS PROCESALES EN DIAS HABILES.
 *
 * ADVERTENCIA IMPORTANTE, LEER ANTES DE TOCAR ESTE ARCHIVO:
 * el sistema hace la ARITMETICA del calendario, no interpreta derecho procesal.
 * Cuantos dias tiene cada plazo, desde cuando corre y si se cuenta en dias
 * habiles o corridos cambia segun jurisdiccion, fuero e instancia. Todo eso son
 * DATOS que carga el estudio (tablas plazo_tipos, feriados y ferias_judiciales),
 * no reglas escritas en el codigo. Nunca hardcodear un plazo aca.
 *
 * Criterios que si estan implementados, porque son aritmetica y no criterio:
 *  - Sabados y domingos son inhabiles.
 *  - Los feriados y las ferias judiciales cargados son inhabiles.
 *  - El plazo empieza a correr el dia habil SIGUIENTE al acto (no se cuenta el
 *    dia del acto). Es la regla general del CPCCN art. 156.
 *  - Si un plazo en dias corridos vence en dia inhabil, se traslada al primer
 *    dia habil siguiente.
 */
import { aISO, esFinDeSemana, sumarDias, sumarMeses, diffDias } from '../utils/fechas.js';

/**
 * Arma la estructura que consultan las funciones de calculo.
 * Se construye una vez por request y se reutiliza: convertir los feriados a Set
 * evita recorrer el array por cada dia del plazo.
 */
export function construirCalendario(feriados, ferias) {
  return {
    feriados: new Set((feriados || []).map((f) => aISO(f.fecha)).filter(Boolean)),
    ferias: (ferias || [])
      .map((f) => ({ desde: aISO(f.desde), hasta: aISO(f.hasta) }))
      .filter((f) => f.desde && f.hasta),
  };
}

/** Calendario vacio: solo sabados y domingos son inhabiles. */
export const CALENDARIO_VACIO = { feriados: new Set(), ferias: [] };

export function estaEnFeria(iso, calendario) {
  const f = aISO(iso);
  if (!f) return false;
  return (calendario.ferias || []).some((r) => f >= r.desde && f <= r.hasta);
}

/** true si el dia es habil judicialmente. */
export function esHabil(iso, calendario) {
  const f = aISO(iso);
  if (!f) return false;
  const cal = calendario || CALENDARIO_VACIO;
  if (esFinDeSemana(f)) return false;
  if (cal.feriados && cal.feriados.has(f)) return false;
  if (estaEnFeria(f, cal)) return false;
  return true;
}

/** Primer dia habil igual o posterior a la fecha dada. */
export function proximoHabil(iso, calendario) {
  let actual = aISO(iso);
  if (!actual) return null;
  // Tope de 400 dias: una feria mal cargada no puede colgar el proceso.
  for (let i = 0; i < 400; i += 1) {
    if (esHabil(actual, calendario)) return actual;
    actual = sumarDias(actual, 1);
  }
  return null;
}

/** Ultimo dia habil igual o anterior a la fecha dada. */
export function habilAnterior(iso, calendario) {
  let actual = aISO(iso);
  if (!actual) return null;
  for (let i = 0; i < 400; i += 1) {
    if (esHabil(actual, calendario)) return actual;
    actual = sumarDias(actual, -1);
  }
  return null;
}

/**
 * Avanza `cantidad` dias habiles a partir del dia SIGUIENTE a `desde`.
 * El dia del acto no se cuenta: un plazo de 5 dias notificado un lunes habil
 * vence el lunes siguiente, no el viernes.
 */
export function sumarDiasHabiles(desde, cantidad, calendario) {
  const inicio = aISO(desde);
  if (!inicio || !Number.isInteger(cantidad) || cantidad < 0) return null;

  let actual = inicio;
  let contados = 0;
  let guarda = 0;

  while (contados < cantidad && guarda < 4000) {
    actual = sumarDias(actual, 1);
    if (esHabil(actual, calendario)) contados += 1;
    guarda += 1;
  }

  return contados === cantidad ? actual : null;
}

/** Cantidad de dias habiles en [desde, hasta], ambos inclusive. */
export function contarDiasHabiles(desde, hasta, calendario) {
  const a = aISO(desde);
  const b = aISO(hasta);
  if (!a || !b || a > b) return 0;

  let contador = 0;
  let actual = a;
  let guarda = 0;
  while (actual <= b && guarda < 4000) {
    if (esHabil(actual, calendario)) contador += 1;
    actual = sumarDias(actual, 1);
    guarda += 1;
  }
  return contador;
}

/**
 * Vencimiento de un plazo.
 *
 * @param {object} args
 * @param {string} args.desde     Fecha del acto (notificacion, traslado...).
 * @param {number} args.dias      Cantidad de dias del plazo.
 * @param {'HABILES'|'CORRIDOS'} args.computo
 * @param {object} args.calendario
 * @returns {{ vencimiento: string|null, trasladado: boolean }}
 */
export function calcularVencimiento(args) {
  const desde = aISO(args.desde);
  const dias = args.dias;
  const computo = args.computo || 'HABILES';
  const calendario = args.calendario || CALENDARIO_VACIO;

  if (!desde || !Number.isInteger(dias) || dias < 0) {
    return { vencimiento: null, trasladado: false };
  }

  if (computo === 'HABILES') {
    return { vencimiento: sumarDiasHabiles(desde, dias, calendario), trasladado: false };
  }

  // Dias corridos: se cuentan de calendario, pero si cae inhabil se traslada.
  const bruto = sumarDias(desde, dias);
  const vencimiento = proximoHabil(bruto, calendario);
  return { vencimiento, trasladado: vencimiento !== bruto };
}

// ---------------------------------------------------------------------------
//  Caducidad de instancia y prescripcion
// ---------------------------------------------------------------------------

/**
 * Fecha de caducidad de instancia: se cuenta en meses CORRIDOS desde la ultima
 * actuacion util. Cuantos meses son depende del fuero y la instancia, por eso
 * `meses` llega como dato desde el expediente o la configuracion.
 */
export function fechaCaducidad(ultimaActuacion, meses) {
  const base = aISO(ultimaActuacion);
  if (!base || !Number.isInteger(meses) || meses <= 0) return null;
  return sumarMeses(base, meses);
}

/**
 * Estado de alerta de un plazo largo (caducidad o prescripcion).
 * Devuelve el nivel para pintar el aviso y los dias que faltan.
 */
export function alertaPlazoLargo(fechaLimite, hoy, diasAviso) {
  const limite = aISO(fechaLimite);
  const h = aISO(hoy);
  if (!limite || !h) return null;

  const dias = diffDias(h, limite);
  const umbral = diasAviso == null ? 60 : diasAviso;

  let nivel = 'OK';
  if (dias < 0) nivel = 'VENCIDO';
  else if (dias === 0) nivel = 'HOY';
  else if (dias <= umbral) nivel = 'PROXIMO';

  return { fechaLimite: limite, dias, nivel };
}
