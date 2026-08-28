/**
 * Tests del diff de auditoría.
 *
 * Se usa un cliente de transacción falso: `registrarCambios` solo necesita algo
 * con `.auditLog.createMany()`, así que no hace falta base de datos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarCambios } from '../src/services/auditoria.service.js';

/** Doble de prueba que captura las filas que se hubieran insertado. */
function txFalso() {
  const filas = [];
  return {
    filas,
    auditLog: {
      createMany: async ({ data }) => {
        filas.push(...data);
        return { count: data.length };
      },
    },
  };
}

const req = { usuario: { id: 7 }, ip: '10.0.0.1', headers: { 'user-agent': 'test' } };

test('registra un renglon por cada campo que cambio', async () => {
  const tx = txFalso();

  const cantidad = await registrarCambios({
    tx,
    req,
    entidad: 'Cliente',
    entidadId: 1,
    anterior: { nombre: 'Gomez, Maria', telefono: '111', estado: 'ACTIVO' },
    nuevo: { nombre: 'Gomez, Maria Alejandra', telefono: '111', estado: 'INACTIVO' },
  });

  assert.equal(cantidad, 2); // telefono no cambio
  const campos = tx.filas.map((f) => f.campo).sort();
  assert.deepEqual(campos, ['estado', 'nombre']);

  const nombre = tx.filas.find((f) => f.campo === 'nombre');
  assert.equal(nombre.valorAnterior, 'Gomez, Maria');
  assert.equal(nombre.valorNuevo, 'Gomez, Maria Alejandra');
  assert.equal(nombre.usuarioId, 7);
  assert.equal(nombre.accion, 'ACTUALIZAR');
});

test('no registra nada cuando se guarda sin tocar ningun campo', async () => {
  const tx = txFalso();
  const cantidad = await registrarCambios({
    tx,
    req,
    entidad: 'Cliente',
    entidadId: 1,
    anterior: { nombre: 'Igual', estado: 'ACTIVO' },
    nuevo: { nombre: 'Igual', estado: 'ACTIVO' },
  });

  assert.equal(cantidad, 0);
  assert.equal(tx.filas.length, 0);
});

test('IGNORA los campos que la operacion no escribe', async () => {
  // Regresion: `anterior` es la fila completa de Prisma e incluye campos que el
  // update no toca (codigo, creadoEn...). Si se unieran las claves de las dos
  // versiones, esos campos aparecerian como "cambiados a vacio" y el historial
  // mostraria modificaciones que nunca pasaron.
  const tx = txFalso();

  await registrarCambios({
    tx,
    req,
    entidad: 'Cliente',
    entidadId: 1,
    anterior: {
      id: 1,
      codigo: 'CLI-001',
      nombre: 'Gomez',
      creadoEn: new Date('2024-01-01'),
      version: 3,
      eliminadoEn: null,
    },
    nuevo: { nombre: 'Gomez Alejandra' },
  });

  assert.equal(tx.filas.length, 1);
  assert.equal(tx.filas[0].campo, 'nombre');
  assert.equal(
    tx.filas.some((f) => f.campo === 'codigo'),
    false,
    'el codigo no se toca en un update y no debe figurar como cambiado'
  );
});

test('nunca copia campos sensibles al historial', async () => {
  const tx = txFalso();

  await registrarCambios({
    tx,
    req,
    entidad: 'Usuario',
    entidadId: 2,
    anterior: { passwordHash: '$2a$12$viejo', nombre: 'Ana' },
    nuevo: { passwordHash: '$2a$12$nuevo', nombre: 'Ana Maria' },
  });

  assert.equal(tx.filas.length, 1);
  assert.equal(tx.filas[0].campo, 'nombre');
  assert.equal(
    JSON.stringify(tx.filas).includes('$2a$12$'),
    false,
    'ningun hash de contrasena puede terminar en la auditoria'
  );
});

test('ignora los campos de infraestructura', async () => {
  const tx = txFalso();

  await registrarCambios({
    tx,
    req,
    entidad: 'Cliente',
    entidadId: 1,
    anterior: { version: 1, creadoEn: new Date('2024-01-01'), id: 1 },
    nuevo: { version: 2, creadoEn: new Date('2026-01-01'), id: 1 },
  });

  assert.equal(tx.filas.length, 0);
});

test('normaliza fechas y decimales a texto legible', async () => {
  const tx = txFalso();

  await registrarCambios({
    tx,
    req,
    entidad: 'Honorario',
    entidadId: 5,
    anterior: { fechaPacto: new Date('2026-03-10T00:00:00Z'), montoPactado: { toString: () => '1000.00' } },
    nuevo: { fechaPacto: new Date('2026-04-15T00:00:00Z'), montoPactado: { toString: () => '2500.50' } },
  });

  const fecha = tx.filas.find((f) => f.campo === 'fechaPacto');
  assert.equal(fecha.valorAnterior, '2026-03-10');
  assert.equal(fecha.valorNuevo, '2026-04-15');

  const monto = tx.filas.find((f) => f.campo === 'montoPactado');
  assert.equal(monto.valorAnterior, '1000.00');
  assert.equal(monto.valorNuevo, '2500.50');
});
