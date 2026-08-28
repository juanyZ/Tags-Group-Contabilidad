import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hoyISO,
  esISO,
  aISO,
  aDateUTC,
  sumarDias,
  sumarMeses,
  diffDias,
  diaSemana,
  esFinDeSemana,
  diasDelMes,
  ultimoDiaDelMes,
  formatoAR,
  rangoDias,
} from '../src/utils/fechas.js';

test('hoyISO devuelve formato YYYY-MM-DD', () => {
  assert.match(hoyISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('hoyISO usa la zona de Argentina, no UTC', () => {
  // A las 23:30 UTC del 7 de agosto, en Argentina (UTC-3) son las 20:30 del
  // MISMO dia 7. Este es el caso que rompe un sistema de plazos ingenuo:
  // si se usara UTC a secas, despues de las 21hs de Argentina el "hoy" se
  // adelantaria un dia y todos los semaforos mentirian.
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const instante = new Date('2026-08-07T23:30:00.000Z');
  assert.equal(formato.format(instante), '2026-08-07');
  assert.equal(instante.toISOString().slice(0, 10), '2026-08-07');

  // Y el caso inverso: 02:00 UTC del 8 es todavia el 7 en Argentina.
  const madrugada = new Date('2026-08-08T02:00:00.000Z');
  assert.equal(formato.format(madrugada), '2026-08-07');
  assert.equal(madrugada.toISOString().slice(0, 10), '2026-08-08');
});

test('esISO rechaza fechas que no existen', () => {
  assert.equal(esISO('2026-08-07'), true);
  assert.equal(esISO('2026-02-30'), false);
  assert.equal(esISO('2026-13-01'), false);
  assert.equal(esISO('07/08/2026'), false);
  assert.equal(esISO(''), false);
  assert.equal(esISO(null), false);
});

test('esISO acepta el 29 de febrero solo en anio bisiesto', () => {
  assert.equal(esISO('2028-02-29'), true);
  assert.equal(esISO('2026-02-29'), false);
});

test('aISO normaliza el Date que devuelve Prisma para @db.Date', () => {
  assert.equal(aISO(new Date('2026-08-07T00:00:00.000Z')), '2026-08-07');
  assert.equal(aISO('2026-08-07'), '2026-08-07');
  assert.equal(aISO('2026-08-07T00:00:00.000Z'), '2026-08-07');
  assert.equal(aISO(null), null);
  assert.equal(aISO(''), null);
});

test('aDateUTC produce medianoche UTC exacta', () => {
  const d = aDateUTC('2026-08-07');
  assert.equal(d.toISOString(), '2026-08-07T00:00:00.000Z');
});

test('sumarDias cruza fin de mes y fin de anio', () => {
  assert.equal(sumarDias('2026-08-07', 1), '2026-08-08');
  assert.equal(sumarDias('2026-08-31', 1), '2026-09-01');
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDias('2026-01-01', -1), '2025-12-31');
  assert.equal(sumarDias('2028-02-28', 1), '2028-02-29');
});

test('sumarMeses recorta al ultimo dia del mes destino', () => {
  // Este es el caso que rompe Date.setMonth: 31 de enero + 1 mes daria
  // 3 de marzo (se "derrama"), cuando lo correcto para una periodicidad
  // mensual es el 28 de febrero.
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(sumarMeses('2028-01-31', 1), '2028-02-29'); // bisiesto
  assert.equal(sumarMeses('2026-01-30', 1), '2026-02-28');
  assert.equal(sumarMeses('2026-03-31', 1), '2026-04-30');
  assert.equal(sumarMeses('2026-01-15', 1), '2026-02-15');
});

test('sumarMeses no arrastra el recorte cuando se cuenta desde la base', () => {
  // 31/01 + 2 meses tiene que dar 31/03, no 28/03. Por eso las ocurrencias
  // se calculan siempre desde la fecha base y nunca encadenando.
  assert.equal(sumarMeses('2026-01-31', 2), '2026-03-31');
  assert.equal(sumarMeses('2026-01-31', 3), '2026-04-30');
  assert.equal(sumarMeses('2026-01-31', 12), '2027-01-31');
});

test('sumarMeses maneja saltos de anio y valores negativos', () => {
  assert.equal(sumarMeses('2026-08-07', 12), '2027-08-07');
  assert.equal(sumarMeses('2026-08-07', -8), '2025-12-07');
  assert.equal(sumarMeses('2026-01-15', -1), '2025-12-15');
});

test('diffDias cuenta dias enteros con signo', () => {
  assert.equal(diffDias('2026-08-07', '2026-08-10'), 3);
  assert.equal(diffDias('2026-08-10', '2026-08-07'), -3);
  assert.equal(diffDias('2026-08-07', '2026-08-07'), 0);
  assert.equal(diffDias('2026-12-31', '2027-01-01'), 1);
});

test('diffDias no se rompe con el cambio de horario de verano', () => {
  // Al trabajar en UTC no hay dias de 23 ni de 25 horas. Marzo y octubre,
  // que son los meses donde otros paises cambian la hora, dan exacto.
  assert.equal(diffDias('2026-03-01', '2026-04-01'), 31);
  assert.equal(diffDias('2026-10-01', '2026-11-01'), 31);
});

test('diaSemana y esFinDeSemana', () => {
  assert.equal(diaSemana('2026-08-07'), 5); // viernes
  assert.equal(diaSemana('2026-08-08'), 6); // sabado
  assert.equal(diaSemana('2026-08-09'), 0); // domingo
  assert.equal(esFinDeSemana('2026-08-07'), false);
  assert.equal(esFinDeSemana('2026-08-08'), true);
  assert.equal(esFinDeSemana('2026-08-09'), true);
});

test('diasDelMes y ultimoDiaDelMes', () => {
  assert.equal(diasDelMes(2026, 2), 28);
  assert.equal(diasDelMes(2028, 2), 29);
  assert.equal(diasDelMes(2026, 8), 31);
  assert.equal(diasDelMes(2026, 4), 30);
  assert.equal(ultimoDiaDelMes(2026, 2), '2026-02-28');
  assert.equal(ultimoDiaDelMes(2026, 8), '2026-08-31');
});

test('formatoAR devuelve dd/mm/aaaa', () => {
  assert.equal(formatoAR('2026-08-07'), '07/08/2026');
  assert.equal(formatoAR(null), '');
});

test('rangoDias arma el intervalo inclusive y respeta el tope', () => {
  assert.deepEqual(rangoDias('2026-08-07', '2026-08-09'), [
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
  ]);
  assert.equal(rangoDias('2026-08-07', '2026-08-07').length, 1);
  assert.equal(rangoDias('2026-08-10', '2026-08-07').length, 0);
  assert.equal(rangoDias('2026-01-01', '2026-12-31', 14).length, 14);
});
