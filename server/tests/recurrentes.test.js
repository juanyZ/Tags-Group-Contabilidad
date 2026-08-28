import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ocurrenciaK,
  proximaOcurrencia,
  ocurrenciasEnRango,
  proyectarProxima,
} from '../src/services/recurrentes.service.js';

const HOY = '2026-08-07';

/**
 * Estos casos salen de los datos reales de la planilla que se esta
 * reemplazando (solapa EVENTOS RECURRENTES, con "hoy" = 7 de agosto de 2026).
 * Sirven como prueba de paridad: si el sistema nuevo no reproduce exactamente
 * los mismos proximos vencimientos que el Excel, algo cambio de significado.
 */
test('paridad con la planilla: proximos vencimientos de los recurrentes reales', () => {
  const casos = [
    { id: 'REC-001', base: '2026-03-31', per: 'ANUAL', esperado: '2027-03-31' },
    { id: 'REC-002', base: '2026-01-18', per: 'MENSUAL', esperado: '2026-08-18' },
    { id: 'REC-003', base: '2026-01-15', per: 'MENSUAL', esperado: '2026-08-15' },
    { id: 'REC-004', base: '2026-01-05', per: 'SEMANAL', esperado: '2026-08-10' },
    { id: 'REC-005', base: '2026-01-12', per: 'QUINCENAL', esperado: '2026-08-10' },
    { id: 'REC-006', base: '2026-01-28', per: 'MENSUAL', esperado: '2026-08-28' },
    { id: 'REC-007', base: '2026-01-20', per: 'TRIMESTRAL', esperado: '2026-10-20' },
    { id: 'REC-008', base: '2026-01-30', per: 'MENSUAL', esperado: '2026-08-30' },
    { id: 'REC-009', base: '2026-01-10', per: 'MENSUAL', esperado: '2026-08-10' },
  ];

  for (const c of casos) {
    assert.equal(
      proximaOcurrencia(c.base, c.per, HOY),
      c.esperado,
      c.id + ' (' + c.per + ' desde ' + c.base + ')'
    );
  }
});

test('si la ocurrencia cae justo hoy, hoy es la proxima', () => {
  assert.equal(proximaOcurrencia('2026-01-07', 'MENSUAL', HOY), '2026-08-07');
  assert.equal(proximaOcurrencia('2026-08-07', 'SEMANAL', HOY), '2026-08-07');
});

test('si la fecha base es futura, la base es la proxima ocurrencia', () => {
  assert.equal(proximaOcurrencia('2026-12-01', 'MENSUAL', HOY), '2026-12-01');
});

test('ocurrenciaK cuenta siempre desde la base, sin arrastrar el recorte', () => {
  // Un mensual con base 31/01: febrero se recorta al 28, pero marzo tiene que
  // volver al 31. Si se encadenara desde la ocurrencia anterior, quedaria
  // clavado en el 28 para siempre.
  assert.equal(ocurrenciaK('2026-01-31', 'MENSUAL', 0), '2026-01-31');
  assert.equal(ocurrenciaK('2026-01-31', 'MENSUAL', 1), '2026-02-28');
  assert.equal(ocurrenciaK('2026-01-31', 'MENSUAL', 2), '2026-03-31');
  assert.equal(ocurrenciaK('2026-01-31', 'MENSUAL', 3), '2026-04-30');
  assert.equal(ocurrenciaK('2026-01-31', 'MENSUAL', 4), '2026-05-31');
});

test('el paso de cada periodicidad', () => {
  assert.equal(ocurrenciaK('2026-01-05', 'SEMANAL', 1), '2026-01-12');
  assert.equal(ocurrenciaK('2026-01-05', 'QUINCENAL', 1), '2026-01-19');
  assert.equal(ocurrenciaK('2026-01-05', 'MENSUAL', 1), '2026-02-05');
  assert.equal(ocurrenciaK('2026-01-05', 'BIMESTRAL', 1), '2026-03-05');
  assert.equal(ocurrenciaK('2026-01-05', 'TRIMESTRAL', 1), '2026-04-05');
  assert.equal(ocurrenciaK('2026-01-05', 'CUATRIMESTRAL', 1), '2026-05-05');
  assert.equal(ocurrenciaK('2026-01-05', 'SEMESTRAL', 1), '2026-07-05');
  assert.equal(ocurrenciaK('2026-01-05', 'ANUAL', 1), '2027-01-05');
});

test('ocurrenciasEnRango proyecta el mes completo del calendario', () => {
  // La reunion semanal de equipo (REC-004) en agosto de 2026.
  const agosto = ocurrenciasEnRango('2026-01-05', 'SEMANAL', '2026-08-01', '2026-08-31');
  assert.deepEqual(agosto, ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
});

test('ocurrenciasEnRango con un mensual devuelve una sola fecha por mes', () => {
  const agosto = ocurrenciasEnRango('2026-01-18', 'MENSUAL', '2026-08-01', '2026-08-31');
  assert.deepEqual(agosto, ['2026-08-18']);
});

test('ocurrenciasEnRango devuelve vacio si no cae nada en el rango', () => {
  // Un anual cuya fecha cae en marzo no aparece en el calendario de agosto.
  const agosto = ocurrenciasEnRango('2026-03-31', 'ANUAL', '2026-08-01', '2026-08-31');
  assert.deepEqual(agosto, []);
});

test('ocurrenciasEnRango incluye los bordes del rango', () => {
  const r = ocurrenciasEnRango('2026-08-03', 'SEMANAL', '2026-08-03', '2026-08-10');
  assert.deepEqual(r, ['2026-08-03', '2026-08-10']);
});

test('un recurrente inactivo no proyecta ninguna fecha', () => {
  const r = proyectarProxima(
    { activo: false, fechaBase: '2026-01-20', periodicidad: 'SEMESTRAL' },
    { hoy: HOY, clavesCumplidas: new Set() }
  );
  assert.equal(r.fechaVto, null);
});

test('al tildar la ocurrencia actual, el proximo vto pasa a la siguiente', () => {
  // Es la mejora sobre el Excel: en vez de borrar el tilde a mano a fin de mes,
  // el sistema avanza solo y guarda que ese periodo quedo cumplido.
  const rec = { activo: true, fechaBase: '2026-01-10', periodicidad: 'MENSUAL' };

  const sinCumplir = proyectarProxima(rec, { hoy: HOY, clavesCumplidas: new Set() });
  assert.equal(sinCumplir.fechaVto, '2026-08-10');
  assert.equal(sinCumplir.claveCumplimiento, '2026-08-10');

  const cumplido = proyectarProxima(rec, {
    hoy: HOY,
    clavesCumplidas: new Set(['2026-08-10']),
  });
  assert.equal(cumplido.fechaVto, '2026-09-10');
  assert.equal(cumplido.ultimaCumplida, '2026-08-10');
});

test('una periodicidad desconocida no rompe: devuelve null', () => {
  assert.equal(proximaOcurrencia('2026-01-01', 'CADA_LUNA_LLENA', HOY), null);
  assert.deepEqual(ocurrenciasEnRango('2026-01-01', 'CADA_LUNA_LLENA', '2026-08-01', '2026-08-31'), []);
});
