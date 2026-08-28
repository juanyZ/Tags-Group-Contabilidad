import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirCalendario,
  CALENDARIO_VACIO,
  esHabil,
  estaEnFeria,
  proximoHabil,
  habilAnterior,
  sumarDiasHabiles,
  contarDiasHabiles,
  calcularVencimiento,
  fechaCaducidad,
  alertaPlazoLargo,
} from '../src/services/plazos.service.js';

// Calendario de prueba: feria de enero y de julio (Nacion/CABA) mas algunos
// feriados. Se cargan como DATOS, igual que lo hara el estudio.
const CAL = construirCalendario(
  [
    { fecha: '2026-08-17', descripcion: 'Paso a la inmortalidad del Gral. San Martin' },
    { fecha: '2026-05-01', descripcion: 'Dia del Trabajador' },
    { fecha: '2026-05-25', descripcion: 'Revolucion de Mayo' },
  ],
  [
    { desde: '2026-01-01', hasta: '2026-01-31', descripcion: 'Feria de enero' },
    { desde: '2026-07-13', hasta: '2026-07-24', descripcion: 'Feria de julio' },
  ]
);

test('sabados y domingos son inhabiles', () => {
  assert.equal(esHabil('2026-08-07', CAL), true); // viernes
  assert.equal(esHabil('2026-08-08', CAL), false); // sabado
  assert.equal(esHabil('2026-08-09', CAL), false); // domingo
  assert.equal(esHabil('2026-08-10', CAL), true); // lunes
});

test('los feriados cargados son inhabiles', () => {
  assert.equal(esHabil('2026-08-17', CAL), false); // feriado (lunes)
  assert.equal(esHabil('2026-08-17', CALENDARIO_VACIO), true); // sin calendario, es habil
});

test('la feria judicial inhabilita el rango completo', () => {
  assert.equal(estaEnFeria('2026-01-15', CAL), true);
  assert.equal(estaEnFeria('2026-07-20', CAL), true);
  assert.equal(estaEnFeria('2026-08-20', CAL), false);
  assert.equal(esHabil('2026-01-15', CAL), false); // jueves, pero en feria
  assert.equal(esHabil('2026-07-13', CAL), false); // primer dia de feria
  assert.equal(esHabil('2026-07-24', CAL), false); // ultimo dia de feria
  assert.equal(esHabil('2026-07-27', CAL), true); // lunes siguiente a la feria
});

test('proximoHabil salta fines de semana y feriados encadenados', () => {
  assert.equal(proximoHabil('2026-08-08', CAL), '2026-08-10'); // sabado -> lunes
  // Sabado 15, domingo 16 y feriado el lunes 17 -> martes 18.
  assert.equal(proximoHabil('2026-08-15', CAL), '2026-08-18');
  assert.equal(proximoHabil('2026-08-10', CAL), '2026-08-10'); // ya es habil
  // Toda la feria de enero: el primer habil del anio es el 2 de febrero (lunes).
  assert.equal(proximoHabil('2026-01-02', CAL), '2026-02-02');
});

test('habilAnterior retrocede al ultimo dia habil', () => {
  assert.equal(habilAnterior('2026-08-09', CAL), '2026-08-07'); // domingo -> viernes
  assert.equal(habilAnterior('2026-08-17', CAL), '2026-08-14'); // feriado -> viernes
});

test('el plazo empieza a correr el dia habil siguiente al acto', () => {
  // Notificado el viernes 7, un plazo de 5 dias habiles vence el viernes 14:
  // lunes 10, martes 11, miercoles 12, jueves 13, viernes 14. El dia del acto
  // no se cuenta (CPCCN art. 156).
  assert.equal(sumarDiasHabiles('2026-08-07', 5, CAL), '2026-08-14');
});

test('el computo de dias habiles saltea el feriado del 17 de agosto', () => {
  // Desde el viernes 14, 3 dias habiles: martes 18 (el lunes 17 es feriado),
  // miercoles 19, jueves 20.
  assert.equal(sumarDiasHabiles('2026-08-14', 3, CAL), '2026-08-20');
  // Sin el feriado cargado darian un dia menos.
  assert.equal(sumarDiasHabiles('2026-08-14', 3, CALENDARIO_VACIO), '2026-08-19');
});

test('un plazo que atraviesa la feria de julio se corre entero', () => {
  // Desde el viernes 10 de julio, 2 dias habiles. Del 13 al 24 hay feria, asi
  // que los dos dias caen el lunes 27 y el martes 28.
  assert.equal(sumarDiasHabiles('2026-07-10', 2, CAL), '2026-07-28');
});

test('un plazo de cero dias habiles no mueve la fecha', () => {
  assert.equal(sumarDiasHabiles('2026-08-07', 0, CAL), '2026-08-07');
});

test('contarDiasHabiles cuenta ambos extremos', () => {
  // Del lunes 10 al viernes 14 de agosto: 5 dias habiles.
  assert.equal(contarDiasHabiles('2026-08-10', '2026-08-14', CAL), 5);
  // Del lunes 10 al lunes 17: se suman 5 + sabado/domingo (0) + feriado (0) = 5.
  assert.equal(contarDiasHabiles('2026-08-10', '2026-08-17', CAL), 5);
  assert.equal(contarDiasHabiles('2026-08-14', '2026-08-10', CAL), 0); // rango invertido
});

test('calcularVencimiento en dias habiles', () => {
  const r = calcularVencimiento({ desde: '2026-08-07', dias: 5, computo: 'HABILES', calendario: CAL });
  assert.equal(r.vencimiento, '2026-08-14');
  assert.equal(r.trasladado, false);
});

test('un plazo en dias corridos que cae inhabil se traslada al habil siguiente', () => {
  // 7 de agosto + 1 dia corrido = sabado 8 -> se traslada al lunes 10.
  const r = calcularVencimiento({ desde: '2026-08-07', dias: 1, computo: 'CORRIDOS', calendario: CAL });
  assert.equal(r.vencimiento, '2026-08-10');
  assert.equal(r.trasladado, true);
});

test('un plazo en dias corridos que cae habil no se mueve', () => {
  const r = calcularVencimiento({ desde: '2026-08-07', dias: 3, computo: 'CORRIDOS', calendario: CAL });
  assert.equal(r.vencimiento, '2026-08-10');
  assert.equal(r.trasladado, false);
});

test('calcularVencimiento con datos invalidos devuelve null, no explota', () => {
  assert.equal(calcularVencimiento({ desde: null, dias: 5, calendario: CAL }).vencimiento, null);
  assert.equal(calcularVencimiento({ desde: '2026-08-07', dias: -1, calendario: CAL }).vencimiento, null);
  assert.equal(calcularVencimiento({ desde: '2026-08-07', dias: 1.5, calendario: CAL }).vencimiento, null);
});

test('la caducidad de instancia se cuenta en meses corridos', () => {
  assert.equal(fechaCaducidad('2026-02-28', 6), '2026-08-28');
  assert.equal(fechaCaducidad('2026-01-31', 3), '2026-04-30'); // recorte de fin de mes
  assert.equal(fechaCaducidad(null, 6), null);
  assert.equal(fechaCaducidad('2026-01-31', 0), null);
});

test('la alerta de plazo largo clasifica por cercania', () => {
  assert.equal(alertaPlazoLargo('2026-08-01', '2026-08-07', 60).nivel, 'VENCIDO');
  assert.equal(alertaPlazoLargo('2026-08-07', '2026-08-07', 60).nivel, 'HOY');
  assert.equal(alertaPlazoLargo('2026-09-01', '2026-08-07', 60).nivel, 'PROXIMO');
  assert.equal(alertaPlazoLargo('2027-09-01', '2026-08-07', 60).nivel, 'OK');
  assert.equal(alertaPlazoLargo('2026-08-01', '2026-08-07', 60).dias, -6);
});
