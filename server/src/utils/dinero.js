/**
 * Helpers de dinero.
 *
 * Prisma devuelve los Decimal como objetos Decimal.js. Se convierten a Number
 * solo en el borde de salida (al armar el JSON), nunca en el medio de una
 * cadena de sumas. Con importes de estudio juridico el double de JavaScript
 * alcanza de sobra, pero los redondeos se hacen explicitos para que no
 * aparezcan centavos fantasma en pantalla.
 */

/** Redondeo a 2 decimales estable (evita el 1.005 -> 1.00 del binario). */
export function redondear(n, decimales) {
  const d = decimales == null ? 2 : decimales;
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Convierte Decimal | string | number | null a Number redondeado a 2 decimales. */
export function aNumero(valor) {
  if (valor == null) return 0;
  const n =
    typeof valor === 'object' && typeof valor.toString === 'function'
      ? Number(valor.toString())
      : Number(valor);
  return Number.isFinite(n) ? redondear(n) : 0;
}

export function sumar() {
  const valores = Array.prototype.slice.call(arguments);
  return redondear(valores.reduce((acc, v) => acc + aNumero(v), 0));
}

/** Porcentaje de `parte` sobre `total`, entero, acotado a [0, 100]. */
export function porcentaje(parte, total) {
  const t = aNumero(total);
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((aNumero(parte) / t) * 100)));
}

/** Aplica IVA. `porcentajeIva` es el numero (21), no la fraccion (0.21). */
export function conIva(neto, porcentajeIva) {
  return redondear(aNumero(neto) * (1 + aNumero(porcentajeIva) / 100));
}
