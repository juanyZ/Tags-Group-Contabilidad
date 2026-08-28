/**
 * Generacion de los IDs legibles: CLI-001, EXP-001, EVT-001, HON-001, GTO-001,
 * REC-001.
 *
 * Los genera SIEMPRE el backend. Si el codigo llegara desde el cliente, dos
 * usuarios podrian mandar el mismo, o alguien podria pisar el codigo de otro
 * registro a proposito.
 *
 * Estrategia: se inserta la fila con un codigo provisorio unico y despues se
 * actualiza al definitivo derivado del id autoincremental, todo dentro de una
 * transaccion. Se eligio esto sobre el clasico "buscar el maximo y sumarle uno"
 * porque ese patron tiene una condicion de carrera real: dos altas simultaneas
 * leen el mismo maximo y la segunda explota contra el indice unico. Aca el id
 * lo asigna MySQL, que ya garantiza unicidad.
 *
 * Contrapartida honesta: los codigos pueden tener huecos si una transaccion se
 * revierte (el autoincrement no se devuelve). Es preferible un hueco a un
 * choque de codigos o a serializar todas las altas.
 */
import { randomUUID } from 'node:crypto';

export const PREFIJOS = {
  cliente: 'CLI',
  expediente: 'EXP',
  eventoPuntual: 'EVT',
  eventoRecurrente: 'REC',
  honorario: 'HON',
  gasto: 'GTO',
};

/** Formatea el codigo definitivo: CLI-001, y CLI-1234 cuando ya no entra en 3. */
export function formatearCodigo(prefijo, id) {
  return prefijo + '-' + String(id).padStart(3, '0');
}

/** Codigo provisorio, unico y reconocible, que vive solo dentro de la transaccion. */
export function codigoProvisorio(prefijo) {
  return prefijo + '-TMP-' + randomUUID().slice(0, 12);
}

/**
 * Crea un registro asignandole el codigo legible definitivo.
 *
 * @param {object} tx      cliente de transaccion de Prisma
 * @param {string} modelo  nombre del modelo Prisma ('cliente', 'expediente'...)
 * @param {object} datos   datos del registro, SIN codigo
 * @param {object} opciones  { include, select } que se aplican al resultado final
 */
export async function crearConCodigo(tx, modelo, datos, opciones) {
  const prefijo = PREFIJOS[modelo];
  if (!prefijo) throw new Error('No hay prefijo de codigo definido para: ' + modelo);

  const creado = await tx[modelo].create({
    data: Object.assign({}, datos, { codigo: codigoProvisorio(prefijo) }),
    select: { id: true },
  });

  return tx[modelo].update({
    where: { id: creado.id },
    data: { codigo: formatearCodigo(prefijo, creado.id) },
    include: opciones && opciones.include ? opciones.include : undefined,
    select: opciones && opciones.select ? opciones.select : undefined,
  });
}
