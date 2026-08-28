/**
 * Formateo para pantalla: fechas dd/mm/aaaa, montos en pesos con separador de
 * miles y etiquetas legibles.
 *
 * IMPORTANTE: aca NO se calcula nada. Los semaforos, saldos y dias los resuelve
 * el backend; el frontend solo los muestra. Duplicar esa logica es la forma
 * segura de que las dos mitades del sistema terminen diciendo cosas distintas.
 */

const MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMERO = new Intl.NumberFormat('es-AR');

const FORMATO_HOY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El hoy del navegador, en horario argentino. Solo para valores por defecto
 *  de formularios: el "hoy" que manda es el del servidor. */
export function hoyISO() {
  return FORMATO_HOY.format(new Date());
}

/** '2026-08-07' -> '07/08/2026' */
export function fecha(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const p = s.split('-');
  if (p.length !== 3) return '—';
  return p[2] + '/' + p[1] + '/' + p[0];
}

/** '2026-08-07' -> '7 de agosto de 2026' */
export function fechaLarga(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** Fecha y hora de un timestamp ISO completo (auditoria, notificaciones). */
export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(d);
}

/** 1234567.89 -> '$ 1.234.567,89' */
export function pesos(valor) {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return MONEDA.format(n).replace('ARS', '$').replace(/\s+/g, ' ').trim();
}

/** Version compacta para tarjetas: $ 21,1 M */
export function pesosCorto(valor) {
  const n = Number(valor || 0);
  if (Math.abs(n) >= 1000000) return '$ ' + (n / 1000000).toFixed(1).replace('.', ',') + ' M';
  if (Math.abs(n) >= 1000) return '$ ' + Math.round(n / 1000) + ' mil';
  return pesos(n);
}

export function numero(valor) {
  if (valor == null) return '—';
  return NUMERO.format(Number(valor));
}

export function porcentaje(valor) {
  if (valor == null) return '—';
  return Math.round(Number(valor)) + '%';
}

/**
 * ENUM_CON_GUIONES -> 'Enum con guiones'.
 * Se usa para todo lo que el backend manda como enum y no tiene etiqueta propia.
 */
export function legible(valor) {
  if (!valor) return '—';
  const texto = String(valor).replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Etiquetas que no salen bien con `legible`. */
const ETIQUETAS = {
  // Situacion del semaforo
  VENCIDO: 'Vencido',
  VENCE_HOY: 'Vence hoy',
  POR_VENCER: 'Por vencer',
  EN_FECHA: 'En fecha',
  CUMPLIDO: 'Cumplido',
  SIN_FECHA: 'Sin fecha',
  CANCELADO: 'Cancelado',
  // Estados de cliente
  EX_CLIENTE: 'Ex cliente',
  // Cobranza
  SIN_COBRAR: 'Sin cobrar',
  PARCIAL: 'Parcial',
  // Cuenta corriente
  AL_DIA: 'Al dia',
  CON_SALDO: 'Con saldo',
  SIN_PAGOS: 'Sin pagos',
  // Gastos
  NO_CORRESPONDE: 'No corresponde',
  REINTEGRADO: 'Reintegrado',
  PENDIENTE: 'Pendiente',
  EXPEDIENTE: 'Del expediente',
  ESTUDIO: 'General del estudio',
  // Pactos
  MONTO_FIJO: 'Monto fijo',
  POR_ETAPAS: 'Por etapas',
  CUOTA_LITIS: 'Cuota litis',
  POR_HORA: 'Por hora',
  ABONO_MENSUAL: 'Abono mensual',
  // Movimientos de cuenta corriente
  HONORARIOS: 'Honorarios',
  GASTO_A_REINTEGRAR: 'Gasto a reintegrar',
  COBRO: 'Cobro',
  // Roles
  ADMIN: 'Administrador',
  ABOGADO: 'Abogado',
  SECRETARIA: 'Secretaría',
  LECTURA: 'Solo lectura',
};

export function etiqueta(valor) {
  if (!valor) return '—';
  return ETIQUETAS[valor] || legible(valor);
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Suma dias a una fecha ISO. Solo para valores por defecto de filtros. */
export function sumarDias(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de la fecha dada. */
export function lunesDe(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00.000Z');
  const dia = d.getUTCDay(); // 0 = domingo
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia);
}

/** Texto vacio -> guion largo. Evita celdas en blanco que parecen un error. */
export function omostrar(valor) {
  return valor == null || valor === '' ? '—' : valor;
}
