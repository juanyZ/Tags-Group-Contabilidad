/**
 * Calculo economico de honorarios. Funciones puras, sin acceso a la base.
 *
 * El punto clave frente a la planilla: "cobrado" NO es un campo que alguien
 * escribe a mano, es la suma de los pagos registrados. Por eso es imposible
 * que se duplique al repetir un cliente, que era el bug documentado del Excel.
 */
import { aNumero, redondear, porcentaje, conIva } from '../utils/dinero.js';
import { aISO } from '../utils/fechas.js';

export const SITUACION_COBRANZA = {
  COBRADO: 'COBRADO',
  PARCIAL: 'PARCIAL',
  SIN_COBRAR: 'SIN_COBRAR',
};

/**
 * Calcula los importes derivados de un pacto de honorarios.
 *
 * @param {object} honorario  { montoPactado, ivaPorcentaje }
 * @param {Array}  pagos      [{ fecha, monto }]
 */
export function calcularHonorario(honorario, pagos) {
  const lista = pagos || [];

  const montoPactado = aNumero(honorario.montoPactado);
  const ivaPorcentaje = aNumero(honorario.ivaPorcentaje);
  const totalConIva = conIva(montoPactado, ivaPorcentaje);
  const iva = redondear(totalConIva - montoPactado);

  const cobrado = redondear(lista.reduce((acc, p) => acc + aNumero(p.monto), 0));
  const saldo = redondear(totalConIva - cobrado);

  // Se toma la fecha del pago mas reciente, no la del ultimo cargado: si se
  // registra tarde un pago viejo, la fecha del ultimo cobro no debe retroceder.
  let ultimoCobro = null;
  for (const p of lista) {
    const f = aISO(p.fecha);
    if (f && (!ultimoCobro || f > ultimoCobro)) ultimoCobro = f;
  }

  let situacion = SITUACION_COBRANZA.SIN_COBRAR;
  // Tolerancia de un centavo: evita que un redondeo deje un saldo de $0,004
  // y el pacto figure eternamente como "parcial".
  if (saldo <= 0.01) situacion = SITUACION_COBRANZA.COBRADO;
  else if (cobrado > 0) situacion = SITUACION_COBRANZA.PARCIAL;

  return {
    montoPactado,
    ivaPorcentaje,
    iva,
    totalConIva,
    cobrado,
    // El saldo nunca se muestra negativo: si el cliente pago de mas, el
    // excedente se informa aparte para que salte a la vista.
    saldo: Math.max(0, saldo),
    saldoAFavorCliente: saldo < -0.01 ? redondear(Math.abs(saldo)) : 0,
    porcentajeCobrado: porcentaje(cobrado, totalConIva),
    ultimoCobro,
    cantidadPagos: lista.length,
    situacion,
  };
}

/** Totales de una lista de honorarios ya calculados. */
export function resumirHonorarios(calculados) {
  const base = {
    totalPactado: 0,
    totalConIva: 0,
    totalCobrado: 0,
    saldoACobrar: 0,
    cantidad: calculados.length,
    cobrados: 0,
    parciales: 0,
    sinCobrar: 0,
  };

  for (const h of calculados) {
    base.totalPactado += h.montoPactado;
    base.totalConIva += h.totalConIva;
    base.totalCobrado += h.cobrado;
    base.saldoACobrar += h.saldo;
    if (h.situacion === SITUACION_COBRANZA.COBRADO) base.cobrados += 1;
    else if (h.situacion === SITUACION_COBRANZA.PARCIAL) base.parciales += 1;
    else base.sinCobrar += 1;
  }

  base.totalPactado = redondear(base.totalPactado);
  base.totalConIva = redondear(base.totalConIva);
  base.totalCobrado = redondear(base.totalCobrado);
  base.saldoACobrar = redondear(base.saldoACobrar);
  base.porcentajeCobranza = porcentaje(base.totalCobrado, base.totalConIva);

  return base;
}
