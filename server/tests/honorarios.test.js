import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularHonorario,
  resumirHonorarios,
  SITUACION_COBRANZA,
} from '../src/services/honorarios.calculo.js';
import { aNumero, redondear, porcentaje, conIva, sumar } from '../src/utils/dinero.js';

test('IVA y total, con los tres porcentajes que se usan', () => {
  assert.equal(conIva(1000, 21), 1210);
  assert.equal(conIva(1000, 10.5), 1105);
  assert.equal(conIva(1000, 0), 1000);
});

test('paridad con la planilla: HON-001', () => {
  // Del Excel: pactado $1.700.000 + IVA 21% = $2.057.000, cobrado $750.000,
  // saldo $1.307.000, 36% cobrado.
  const r = calcularHonorario(
    { montoPactado: 1700000, ivaPorcentaje: 21 },
    [{ fecha: '2026-08-06', monto: 750000 }]
  );
  assert.equal(r.totalConIva, 2057000);
  assert.equal(r.iva, 357000);
  assert.equal(r.cobrado, 750000);
  assert.equal(r.saldo, 1307000);
  assert.equal(r.porcentajeCobrado, 36);
  assert.equal(r.situacion, SITUACION_COBRANZA.PARCIAL);
});

test('paridad con la planilla: HON-009 totalmente cobrado', () => {
  // Pactado $1.470.000 + 21% = $1.778.700, cobrado $1.778.700, 100%.
  const r = calcularHonorario(
    { montoPactado: 1470000, ivaPorcentaje: 21 },
    [{ fecha: '2025-10-15', monto: 1778700 }]
  );
  assert.equal(r.totalConIva, 1778700);
  assert.equal(r.saldo, 0);
  assert.equal(r.porcentajeCobrado, 100);
  assert.equal(r.situacion, SITUACION_COBRANZA.COBRADO);
});

test('sin pagos: sin cobrar y saldo igual al total', () => {
  const r = calcularHonorario({ montoPactado: 180000, ivaPorcentaje: 21 }, []);
  assert.equal(r.totalConIva, 217800);
  assert.equal(r.cobrado, 0);
  assert.equal(r.saldo, 217800);
  assert.equal(r.porcentajeCobrado, 0);
  assert.equal(r.situacion, SITUACION_COBRANZA.SIN_COBRAR);
  assert.equal(r.ultimoCobro, null);
});

test('varios pagos se suman y la fecha del ultimo cobro es la mas reciente', () => {
  // Mejora sobre el Excel, que solo permitia un acumulado escrito a mano.
  const r = calcularHonorario({ montoPactado: 1000000, ivaPorcentaje: 21 }, [
    { fecha: '2026-03-10', monto: 300000 },
    { fecha: '2026-06-15', monto: 400000 },
    // Un pago viejo cargado tarde NO debe hacer retroceder la fecha del ultimo cobro.
    { fecha: '2026-01-05', monto: 100000 },
  ]);
  assert.equal(r.cobrado, 800000);
  assert.equal(r.cantidadPagos, 3);
  assert.equal(r.ultimoCobro, '2026-06-15');
  assert.equal(r.saldo, 410000);
});

test('el cobrado nunca se puede duplicar: sale de los pagos, no de un campo', () => {
  // El bug del Excel era repetir un cliente en dos renglones y que el cobrado
  // se sumara dos veces. Aca cada pago es una fila propia e identificable, asi
  // que dos pactos del mismo cliente son dos cuentas independientes.
  const pactoA = calcularHonorario({ montoPactado: 100000, ivaPorcentaje: 21 }, [
    { fecha: '2026-01-10', monto: 50000 },
  ]);
  const pactoB = calcularHonorario({ montoPactado: 200000, ivaPorcentaje: 21 }, [
    { fecha: '2026-02-10', monto: 60000 },
  ]);
  const resumen = resumirHonorarios([pactoA, pactoB]);

  assert.equal(resumen.totalCobrado, 110000); // 50.000 + 60.000, sin duplicar
  assert.equal(resumen.totalConIva, 363000); // 121.000 + 242.000
  assert.equal(resumen.saldoACobrar, 253000);
});

test('si el cliente paga de mas, el saldo no queda negativo', () => {
  const r = calcularHonorario({ montoPactado: 1000, ivaPorcentaje: 0 }, [
    { fecha: '2026-01-10', monto: 1200 },
  ]);
  assert.equal(r.saldo, 0);
  assert.equal(r.saldoAFavorCliente, 200);
  assert.equal(r.situacion, SITUACION_COBRANZA.COBRADO);
  assert.equal(r.porcentajeCobrado, 100); // acotado, no 120
});

test('un saldo de centavos por redondeo se considera cobrado', () => {
  const r = calcularHonorario({ montoPactado: 100, ivaPorcentaje: 10.5 }, [
    { fecha: '2026-01-10', monto: 110.5 },
  ]);
  assert.equal(r.situacion, SITUACION_COBRANZA.COBRADO);
});

test('resumirHonorarios agrega totales y conteos', () => {
  const lista = [
    calcularHonorario({ montoPactado: 1000, ivaPorcentaje: 0 }, [{ fecha: '2026-01-01', monto: 1000 }]),
    calcularHonorario({ montoPactado: 1000, ivaPorcentaje: 0 }, [{ fecha: '2026-01-01', monto: 500 }]),
    calcularHonorario({ montoPactado: 1000, ivaPorcentaje: 0 }, []),
  ];
  const r = resumirHonorarios(lista);
  assert.equal(r.cantidad, 3);
  assert.equal(r.cobrados, 1);
  assert.equal(r.parciales, 1);
  assert.equal(r.sinCobrar, 1);
  assert.equal(r.totalConIva, 3000);
  assert.equal(r.totalCobrado, 1500);
  assert.equal(r.saldoACobrar, 1500);
  assert.equal(r.porcentajeCobranza, 50);
});

test('helpers de dinero', () => {
  assert.equal(redondear(1.005), 1.01);
  assert.equal(redondear(0.1 + 0.2), 0.3); // el clasico del punto flotante
  assert.equal(aNumero(null), 0);
  assert.equal(aNumero('1234.56'), 1234.56);
  assert.equal(aNumero({ toString: () => '99.99' }), 99.99); // Decimal de Prisma
  assert.equal(sumar(0.1, 0.2, 0.3), 0.6);
  assert.equal(porcentaje(50, 200), 25);
  assert.equal(porcentaje(1, 0), 0); // no divide por cero
});
