/**
 * Servicio compartido de vencimientos: consulta la base y aplica el semaforo.
 *
 * Lo usan expedientes (para su columna "proximo vto."), la ficha, el tablero y
 * el calendario. Que este centralizado es lo que garantiza que las cuatro
 * pantallas digan lo mismo del mismo plazo.
 */
import { prisma } from '../config/prisma.js';
import { aISO } from '../utils/fechas.js';
import { calcularSituacion, diasRestantes, textoDias, etiquetaSituacion, SITUACION } from './semaforo.service.js';

/** Estados que hacen que un evento siga contando como trabajo por hacer. */
export const ESTADOS_PENDIENTES = ['PENDIENTE', 'EN_CURSO', 'REPROGRAMADO'];

/** Where reutilizable: eventos vivos y pendientes. */
export const WHERE_PENDIENTES = {
  eliminadoEn: null,
  estado: { in: ESTADOS_PENDIENTES },
};

/**
 * Resumen de vencimientos por expediente, en UNA sola consulta para todos los
 * ids pedidos. Hacerlo de a uno seria el clasico N+1: con 25 expedientes en
 * pantalla serian 25 consultas extra por cada carga de la grilla.
 *
 * @param {number[]} expedienteIds
 * @param {{hoy: string, umbralDias: number}} ctx
 * @returns {Map<number, object>}
 */
export async function resumenPorExpediente(expedienteIds, ctx) {
  const resultado = new Map();
  if (!expedienteIds || expedienteIds.length === 0) return resultado;

  const eventos = await prisma.eventoPuntual.findMany({
    where: { expedienteId: { in: expedienteIds }, eliminadoEn: null },
    select: { expedienteId: true, fechaVto: true, estado: true },
  });

  for (const id of expedienteIds) {
    resultado.set(id, {
      proximoVto: null,
      situacion: SITUACION.SIN_FECHA,
      situacionEtiqueta: etiquetaSituacion(SITUACION.SIN_FECHA),
      dias: null,
      diasTexto: '',
      pendientes: 0,
      vencidos: 0,
      cumplidos: 0,
      movimientos: 0,
    });
  }

  for (const ev of eventos) {
    const acumulado = resultado.get(ev.expedienteId);
    if (!acumulado) continue;

    acumulado.movimientos += 1;

    if (ev.estado === 'CUMPLIDO') {
      acumulado.cumplidos += 1;
      continue;
    }
    if (ev.estado === 'CANCELADO') continue;

    acumulado.pendientes += 1;

    const fecha = aISO(ev.fechaVto);
    if (fecha && fecha < ctx.hoy) acumulado.vencidos += 1;

    // El "proximo vencimiento" es el pendiente mas cercano, incluidos los que
    // ya vencieron: un plazo atrasado es justamente lo primero que hay que ver.
    if (fecha && (!acumulado.proximoVto || fecha < acumulado.proximoVto)) {
      acumulado.proximoVto = fecha;
    }
  }

  for (const acumulado of resultado.values()) {
    const situacion = calcularSituacion({
      fechaVto: acumulado.proximoVto,
      hoy: ctx.hoy,
      umbralDias: ctx.umbralDias,
    });
    const dias = diasRestantes(acumulado.proximoVto, ctx.hoy);

    acumulado.situacion = situacion;
    acumulado.situacionEtiqueta = etiquetaSituacion(situacion);
    acumulado.dias = dias;
    acumulado.diasTexto = textoDias(situacion, dias);
  }

  return resultado;
}

/**
 * Conteo global de vencimientos pendientes por situacion.
 *
 * OJO: es SIEMPRE global, nunca filtrado por el periodo del tablero. Es a
 * proposito y esta documentado en la guia de la planilla: si se filtra agosto,
 * un plazo vencido de julio TIENE que seguir apareciendo. Un vencimiento
 * atrasado no deja de existir porque uno cambie el mes que esta mirando.
 */
export async function conteoGlobalVencimientos(ctx) {
  const eventos = await prisma.eventoPuntual.findMany({
    where: WHERE_PENDIENTES,
    select: { fechaVto: true },
  });

  const conteo = { vencidos: 0, venceHoy: 0, porVencer: 0, enFecha: 0 };

  for (const ev of eventos) {
    const situacion = calcularSituacion({
      fechaVto: ev.fechaVto,
      hoy: ctx.hoy,
      umbralDias: ctx.umbralDias,
    });
    if (situacion === SITUACION.VENCIDO) conteo.vencidos += 1;
    else if (situacion === SITUACION.VENCE_HOY) conteo.venceHoy += 1;
    else if (situacion === SITUACION.POR_VENCER) conteo.porVencer += 1;
    else if (situacion === SITUACION.EN_FECHA) conteo.enFecha += 1;
  }

  return conteo;
}
