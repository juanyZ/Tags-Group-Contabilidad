/**
 * Manejo de fechas. ESTE ARCHIVO ES CRITICO: es donde se concentra el riesgo
 * numero uno de un sistema de plazos, la zona horaria.
 *
 * El problema concreto: un contenedor Docker corre en UTC. A las 21:30 de
 * Buenos Aires (UTC-3) ya es el dia siguiente en UTC. Si el semaforo usara
 * `new Date()` a secas, a partir de las 21hs un plazo que vence manana
 * apareceria como "vence hoy" y uno que vence hoy como "vencido".
 *
 * Reglas del archivo:
 *  - El "hoy" del negocio se calcula SIEMPRE en la zona de Argentina.
 *  - Una fecha de vencimiento es un dia de calendario, no un instante: se
 *    representa como string 'YYYY-MM-DD' en toda la logica de negocio.
 *  - Para persistir en MySQL DATE se usa un Date en medianoche UTC, que es
 *    exactamente lo que Prisma espera y devuelve para @db.Date.
 *  - No se usa ninguna libreria de fechas: Intl resuelve la zona horaria y el
 *    resto es aritmetica de dias sobre UTC, que no tiene horario de verano.
 */

export const ZONA_AR = 'America/Argentina/Buenos_Aires';

const MS_DIA = 86400000;

// 'en-CA' formatea como YYYY-MM-DD, que es justo el formato ISO que usamos.
const FORMATO_ISO_AR = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_AR,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** El dia de hoy segun el calendario argentino: 'YYYY-MM-DD'. */
export function hoyISO() {
  return FORMATO_ISO_AR.format(new Date());
}

/** true si el string tiene forma ISO y ademas es una fecha real (no 2026-02-31). */
export function esISO(valor) {
  if (typeof valor !== 'string' || !RE_ISO.test(valor)) return false;
  const d = new Date(valor + 'T00:00:00.000Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

/**
 * Normaliza cualquier entrada a 'YYYY-MM-DD'.
 * Acepta el Date que devuelve Prisma para @db.Date (medianoche UTC) y strings.
 * Devuelve null si no hay fecha, para que el llamador decida que hacer.
 */
export function aISO(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === 'string') {
    if (RE_ISO.test(valor)) return esISO(valor) ? valor : null;
    // Tolera ISO completo con hora ('2026-08-07T00:00:00.000Z').
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Convierte 'YYYY-MM-DD' al Date de medianoche UTC que se guarda en MySQL DATE.
 * Nunca usar `new Date('2026-08-07')` sin la Z explicita en otros contextos:
 * el comportamiento cambia segun el motor y la zona local.
 */
export function aDateUTC(iso) {
  const norm = aISO(iso);
  return norm ? new Date(norm + 'T00:00:00.000Z') : null;
}

/** Suma (o resta, con n negativo) dias de calendario. */
export function sumarDias(iso, n) {
  const base = aDateUTC(iso);
  if (!base) return null;
  return new Date(base.getTime() + n * MS_DIA).toISOString().slice(0, 10);
}

/** Cantidad de dias del mes (mes 1-12). */
export function diasDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Suma meses recortando al ultimo dia valido del mes destino.
 * Necesario para la periodicidad mensual: el 31 de enero + 1 mes debe caer el
 * 28/29 de febrero, no "derramarse" al 2 o 3 de marzo como hace Date.setMonth.
 */
export function sumarMeses(iso, n) {
  const norm = aISO(iso);
  if (!norm) return null;
  const partes = norm.split('-').map(Number);
  const anio = partes[0];
  const mes = partes[1];
  const dia = partes[2];

  const totalMeses = anio * 12 + (mes - 1) + n;
  const anioDestino = Math.floor(totalMeses / 12);
  const mesDestino = ((totalMeses % 12) + 12) % 12; // 0-11, sin negativos

  const ultimoDia = diasDelMes(anioDestino, mesDestino + 1);
  const diaDestino = Math.min(dia, ultimoDia);

  return (
    String(anioDestino).padStart(4, '0') +
    '-' +
    String(mesDestino + 1).padStart(2, '0') +
    '-' +
    String(diaDestino).padStart(2, '0')
  );
}

/** Dias enteros de `desde` a `hasta`. Positivo si hasta es posterior. */
export function diffDias(desde, hasta) {
  const a = aDateUTC(desde);
  const b = aDateUTC(hasta);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_DIA);
}

/** 0 = domingo ... 6 = sabado. Se calcula en UTC, sin efectos de zona local. */
export function diaSemana(iso) {
  const d = aDateUTC(iso);
  return d ? d.getUTCDay() : null;
}

/** true para sabado y domingo. */
export function esFinDeSemana(iso) {
  const ds = diaSemana(iso);
  return ds === 0 || ds === 6;
}

export function primerDiaDelMes(anio, mes) {
  return anio + '-' + String(mes).padStart(2, '0') + '-01';
}

export function ultimoDiaDelMes(anio, mes) {
  return (
    anio + '-' + String(mes).padStart(2, '0') + '-' + String(diasDelMes(anio, mes)).padStart(2, '0')
  );
}

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa', el formato que espera un usuario argentino. */
export function formatoAR(iso) {
  const norm = aISO(iso);
  if (!norm) return '';
  const p = norm.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

/** Rango [desde, hasta] inclusive como lista de ISO. Acotado por seguridad. */
export function rangoDias(desde, hasta, maximo = 400) {
  const d = aISO(desde);
  const h = aISO(hasta);
  if (!d || !h) return [];
  const total = diffDias(d, h);
  if (total < 0) return [];
  const dias = [];
  for (let i = 0; i <= Math.min(total, maximo - 1); i += 1) {
    dias.push(sumarDias(d, i));
  }
  return dias;
}
