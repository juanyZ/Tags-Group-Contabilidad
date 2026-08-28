import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITUACION,
  calcularSituacion,
  diasRestantes,
  textoDias,
  decorarVencimiento,
  ordenarPorUrgencia,
  resumirSituaciones,
  esPendiente,
} from '../src/services/semaforo.service.js';

const HOY = '2026-08-07';
const UMBRAL = 7;

const sit = (fechaVto, extra) =>
  calcularSituacion(Object.assign({ fechaVto, hoy: HOY, umbralDias: UMBRAL }, extra || {}));

test('los cinco estados basicos del semaforo', () => {
  assert.equal(sit('2026-08-06'), SITUACION.VENCIDO);
  assert.equal(sit('2026-08-07'), SITUACION.VENCE_HOY);
  assert.equal(sit('2026-08-10'), SITUACION.POR_VENCER);
  assert.equal(sit('2026-09-30'), SITUACION.EN_FECHA);
  assert.equal(sit('2026-08-10', { cumplido: true }), SITUACION.CUMPLIDO);
});

test('los bordes exactos del umbral POR_VENCER', () => {
  // Con umbral 7: hoy+7 todavia es POR_VENCER, hoy+8 ya es EN_FECHA.
  assert.equal(sit('2026-08-14'), SITUACION.POR_VENCER); // hoy + 7
  assert.equal(sit('2026-08-15'), SITUACION.EN_FECHA); // hoy + 8
  assert.equal(sit('2026-08-08'), SITUACION.POR_VENCER); // hoy + 1
});

test('el umbral es configurable y se respeta', () => {
  const con15 = calcularSituacion({ fechaVto: '2026-08-20', hoy: HOY, umbralDias: 15 });
  const con7 = calcularSituacion({ fechaVto: '2026-08-20', hoy: HOY, umbralDias: 7 });
  assert.equal(con15, SITUACION.POR_VENCER);
  assert.equal(con7, SITUACION.EN_FECHA);
});

test('lo cumplido nunca figura como vencido, por vieja que sea la fecha', () => {
  // Regla critica: si no, el tablero mostraria como atrasado todo el historico.
  assert.equal(sit('2020-01-01', { cumplido: true }), SITUACION.CUMPLIDO);
});

test('lo cancelado no es ni cumplido ni vencido', () => {
  assert.equal(sit('2020-01-01', { cancelado: true }), SITUACION.CANCELADO);
  // Cancelado gana sobre cumplido: si se cancelo, no se hizo.
  assert.equal(sit('2026-08-01', { cancelado: true, cumplido: true }), SITUACION.CANCELADO);
});

test('sin fecha de vencimiento devuelve SIN_FECHA', () => {
  assert.equal(sit(null), SITUACION.SIN_FECHA);
  assert.equal(sit(''), SITUACION.SIN_FECHA);
});

test('un evento reprogramado sigue contando como pendiente', () => {
  assert.equal(esPendiente('PENDIENTE'), true);
  assert.equal(esPendiente('EN_CURSO'), true);
  assert.equal(esPendiente('REPROGRAMADO'), true);
  assert.equal(esPendiente('CUMPLIDO'), false);
  assert.equal(esPendiente('CANCELADO'), false);
});

test('diasRestantes con signo', () => {
  assert.equal(diasRestantes('2026-08-10', HOY), 3);
  assert.equal(diasRestantes('2026-08-07', HOY), 0);
  assert.equal(diasRestantes('2026-07-30', HOY), -8);
  assert.equal(diasRestantes(null, HOY), null);
});

test('el texto de dias replica el de la planilla', () => {
  assert.equal(textoDias(SITUACION.VENCIDO, -8), '8 dias vencidos');
  assert.equal(textoDias(SITUACION.VENCIDO, -1), '1 dia vencido');
  assert.equal(textoDias(SITUACION.VENCE_HOY, 0), 'VENCE HOY');
  assert.equal(textoDias(SITUACION.POR_VENCER, 3), '3 dias por vencer');
  assert.equal(textoDias(SITUACION.POR_VENCER, 1), '1 dia por vencer');
  assert.equal(textoDias(SITUACION.CUMPLIDO, null), '—');
});

test('decorarVencimiento agrega todo lo que la UI necesita', () => {
  const d = decorarVencimiento(
    { fechaVto: '2026-07-30', descripcion: 'Audiencia' },
    { hoy: HOY, umbralDias: UMBRAL }
  );
  assert.equal(d.situacion, SITUACION.VENCIDO);
  assert.equal(d.dias, -8);
  assert.equal(d.diasTexto, '8 dias vencidos');
  assert.equal(d.situacionEtiqueta, 'Vencido');
  assert.equal(d.ordenSituacion, 0);
  assert.equal(d.descripcion, 'Audiencia'); // no pierde los campos originales
});

test('el orden es el que pide el calendario', () => {
  const items = [
    { descripcion: 'en fecha', fechaVto: '2026-09-30' },
    { descripcion: 'cumplido viejo', fechaVto: '2026-07-01', cumplido: true },
    { descripcion: 'vencido nuevo', fechaVto: '2026-08-05' },
    { descripcion: 'vence hoy', fechaVto: '2026-08-07' },
    { descripcion: 'vencido viejo', fechaVto: '2026-07-20' },
    { descripcion: 'por vencer', fechaVto: '2026-08-10' },
    { descripcion: 'sin fecha', fechaVto: null },
  ].map((i) => decorarVencimiento(i, { hoy: HOY, umbralDias: UMBRAL }));

  const orden = ordenarPorUrgencia(items).map((i) => i.descripcion);

  assert.deepEqual(orden, [
    'vencido viejo', // los vencidos primero, del mas viejo al mas nuevo
    'vencido nuevo',
    'vence hoy',
    'por vencer',
    'en fecha',
    'sin fecha',
    'cumplido viejo', // lo cumplido, al fondo de todo
  ]);
});

test('el orden es estable ante empates', () => {
  const items = [
    { descripcion: 'B', fechaVto: '2026-08-10', hora: '10:00' },
    { descripcion: 'A', fechaVto: '2026-08-10', hora: '09:00' },
    { descripcion: 'C', fechaVto: '2026-08-10', hora: '09:00' },
  ].map((i) => decorarVencimiento(i, { hoy: HOY, umbralDias: UMBRAL }));

  const orden = ordenarPorUrgencia(items).map((i) => i.descripcion);
  assert.deepEqual(orden, ['A', 'C', 'B']);
});

test('resumirSituaciones cuenta por estado', () => {
  const items = [
    { fechaVto: '2026-07-20' },
    { fechaVto: '2026-07-25' },
    { fechaVto: '2026-08-07' },
    { fechaVto: '2026-08-10' },
    { fechaVto: '2026-12-01' },
  ].map((i) => decorarVencimiento(i, { hoy: HOY, umbralDias: UMBRAL }));

  const r = resumirSituaciones(items);
  assert.equal(r.VENCIDO, 2);
  assert.equal(r.VENCE_HOY, 1);
  assert.equal(r.POR_VENCER, 1);
  assert.equal(r.EN_FECHA, 1);
});

test('una ocurrencia pasada de un recurrente no es un vencimiento incumplido', () => {
  // El sistema no puede saber si la reunión de hace tres semanas se hizo: nadie
  // la tildó. Marcarla en rojo pintaría medio calendario de alarma y el rojo
  // dejaría de significar algo.
  assert.equal(sit('2026-08-03', { historico: true }), SITUACION.HISTORICO);
  assert.equal(textoDias(SITUACION.HISTORICO, -25), '—');

  // Si en cambio SÍ se tildó, es un cumplido normal.
  assert.equal(sit('2026-08-03', { cumplido: true }), SITUACION.CUMPLIDO);

  // Y un evento puntual atrasado sigue siendo VENCIDO: la excepción es solo
  // para las proyecciones de recurrentes.
  assert.equal(sit('2026-08-03'), SITUACION.VENCIDO);
});

test('lo historico va al fondo del orden, despues de lo cumplido', () => {
  const items = [
    { descripcion: 'historico', fechaVto: '2026-08-01', historico: true },
    { descripcion: 'vencido', fechaVto: '2026-08-01' },
    { descripcion: 'cumplido', fechaVto: '2026-08-01', cumplido: true },
  ].map((i) => decorarVencimiento(i, { hoy: HOY, umbralDias: UMBRAL }));

  assert.deepEqual(ordenarPorUrgencia(items).map((i) => i.descripcion), [
    'vencido',
    'cumplido',
    'historico',
  ]);
});
