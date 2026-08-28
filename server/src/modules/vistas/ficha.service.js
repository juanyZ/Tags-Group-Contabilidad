/**
 * FICHA DEL EXPEDIENTE: todo lo de una causa en una sola vista.
 *
 * Aclaracion que la planilla hacia explicita y conviene repetir: los
 * HONORARIOS y lo COBRADO son del CLIENTE ENTERO, porque la cuenta se lleva
 * por cliente. Los GASTOS, en cambio, si son de esta causa puntual. Mezclar
 * las dos cosas seria mostrar un resultado economico por expediente que no
 * existe en la contabilidad del estudio.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aISO, hoyISO } from '../../utils/fechas.js';
import { aNumero, redondear } from '../../utils/dinero.js';
import { decorarVencimiento } from '../../services/semaforo.service.js';
import { parametrosVencimientos } from '../config/config.service.js';
import { resumenPorExpediente } from '../../services/vencimientos.service.js';
import { alertasProcesales } from '../expedientes/expedientes.service.js';
import { cuentaCorriente } from './cuentacorriente.service.js';
import { soloVivos } from '../../lib/consultas.js';

export async function ficha(expedienteId) {
  const params = await parametrosVencimientos();
  const hoy = hoyISO();

  const exp = await prisma.expediente.findUnique({
    where: { id: expedienteId },
    include: {
      cliente: { select: { id: true, codigo: true, nombre: true } },
      fuero: { select: { valor: true } },
      juzgado: { select: { valor: true } },
      etapa: { select: { valor: true } },
      estado: { select: { valor: true } },
      abogado: { select: { nombre: true } },
    },
  });

  if (!exp || exp.eliminadoEn) {
    throw ApiError.noEncontrado('El expediente no existe o fue eliminado');
  }

  const [eventos, gastos, resumenes, cuenta] = await Promise.all([
    prisma.eventoPuntual.findMany({
      where: Object.assign({ expedienteId }, soloVivos()),
      include: {
        tipo: { select: { valor: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: { fechaVto: 'asc' },
    }),
    prisma.gasto.findMany({
      where: Object.assign({ expedienteId }, soloVivos()),
      include: { rubro: { select: { valor: true } } },
      orderBy: { fecha: 'desc' },
    }),
    resumenPorExpediente([expedienteId], { hoy, umbralDias: params.umbralDias }),
    // La economia que se muestra es la del cliente. Ver el comentario de arriba.
    cuentaCorriente(exp.clienteId),
  ]);

  const movimientos = eventos.map((ev) =>
    decorarVencimiento(
      {
        id: ev.id,
        codigo: ev.codigo,
        fechaVto: aISO(ev.fechaVto),
        hora: ev.hora,
        tipo: ev.tipo ? ev.tipo.valor : null,
        descripcion: ev.descripcion,
        responsable: ev.responsable ? ev.responsable.nombre : null,
        prioridad: ev.prioridad,
        estado: ev.estado,
        cumplido: ev.estado === 'CUMPLIDO',
        cancelado: ev.estado === 'CANCELADO',
      },
      { hoy, umbralDias: params.umbralDias }
    )
  );

  const gastosSerializados = gastos.map((g) => ({
    id: g.id,
    codigo: g.codigo,
    fecha: aISO(g.fecha),
    rubro: g.rubro ? g.rubro.valor : null,
    detalle: g.detalle,
    importe: aNumero(g.importe),
    reembolsable: g.reembolsable,
    estadoReintegro: g.estadoReintegro,
  }));

  const totalGastos = redondear(gastosSerializados.reduce((a, g) => a + g.importe, 0));
  const gastosPendientesReintegro = redondear(
    gastosSerializados
      .filter((g) => g.reembolsable && g.estadoReintegro === 'PENDIENTE')
      .reduce((a, g) => a + g.importe, 0)
  );

  const resumen = resumenes.get(expedienteId) || {};

  return {
    hoy,
    expediente: {
      id: exp.id,
      codigo: exp.codigo,
      caratula: exp.caratula,
      fechaInicio: aISO(exp.fechaInicio),
      clienteId: exp.clienteId,
      cliente: exp.cliente ? exp.cliente.nombre : null,
      clienteCodigo: exp.cliente ? exp.cliente.codigo : null,
      caracter: exp.caracter,
      contraparte: exp.contraparte,
      fuero: exp.fuero ? exp.fuero.valor : null,
      juzgado: exp.juzgado ? exp.juzgado.valor : null,
      numeroExpediente: exp.numeroExpediente,
      etapa: exp.etapa ? exp.etapa.valor : null,
      estado: exp.estado ? exp.estado.valor : null,
      abogado: exp.abogado ? exp.abogado.nombre : null,
      ultimaActuacion: aISO(exp.ultimaActuacion),
      montoReclamado: exp.montoReclamado == null ? null : aNumero(exp.montoReclamado),
      observaciones: exp.observaciones,
    },
    seguimiento: {
      proximoVto: resumen.proximoVto || null,
      situacion: resumen.situacion || 'SIN_FECHA',
      situacionEtiqueta: resumen.situacionEtiqueta || 'Sin fecha',
      diasTexto: resumen.diasTexto || '',
      movimientos: movimientos.length,
      pendientes: resumen.pendientes || 0,
      vencidos: resumen.vencidos || 0,
      cumplidos: resumen.cumplidos || 0,
      alertas: alertasProcesales(exp, params, hoy),
    },
    economia: {
      // Del cliente entero.
      honorariosDelCliente: cuenta.totales.honorarios,
      cobradoDelCliente: cuenta.totales.cobrado,
      saldoDelCliente: cuenta.totales.saldo,
      // De esta causa puntual.
      gastosDeLaCausa: totalGastos,
      gastosPendientesReintegro,
    },
    gastos: gastosSerializados,
    movimientos,
  };
}
