/**
 * TABLERO GENERAL.
 *
 * REGLA CENTRAL, tomada de la guia de la planilla y facil de romper sin querer:
 *
 *   Las alertas de VENCIDOS / VENCEN HOY / POR VENCER son SIEMPRE GLOBALES.
 *   NO siguen el filtro de periodo.
 *
 * Es a proposito: si el usuario filtra agosto, un plazo vencido de julio TIENE
 * que seguir apareciendo. Un vencimiento atrasado no deja de existir porque
 * uno cambie el mes que esta mirando.
 *
 * En cambio, facturado, cobrado, gastos y el resultado economico SI dependen
 * del periodo elegido.
 */
import { prisma } from '../../config/prisma.js';
import { hoyISO, primerDiaDelMes, ultimoDiaDelMes, sumarDias, aISO } from '../../utils/fechas.js';
import { aNumero, redondear, porcentaje } from '../../utils/dinero.js';
import { parametrosVencimientos, obtenerConfig } from '../config/config.service.js';
import {
  conteoGlobalVencimientos,
  WHERE_PENDIENTES,
} from '../../services/vencimientos.service.js';
import { decorarVencimiento, ordenarPorUrgencia, SITUACION } from '../../services/semaforo.service.js';
import { calcularHonorario } from '../../services/honorarios.calculo.js';
import { resumenCartera } from './cuentacorriente.service.js';
import { soloVivos, rangoFechas } from '../../lib/consultas.js';

/**
 * Traduce el selector de periodo a un rango de fechas.
 * `mes = 0` (o ausente) significa TODO EL ANIO.
 */
export function resolverPeriodo(anio, mes) {
  const anioFinal = anio || new Date().getFullYear();
  if (!mes || mes === 0) {
    return {
      desde: anioFinal + '-01-01',
      hasta: anioFinal + '-12-31',
      etiqueta: 'Todo el ano ' + anioFinal,
    };
  }
  return {
    desde: primerDiaDelMes(anioFinal, mes),
    hasta: ultimoDiaDelMes(anioFinal, mes),
    etiqueta: 'Mes ' + String(mes).padStart(2, '0') + '/' + anioFinal,
  };
}

export async function tablero(consulta) {
  const params = await parametrosVencimientos();
  const config = await obtenerConfig();
  const hoy = hoyISO();
  const periodo = resolverPeriodo(consulta.anio, consulta.mes);

  const [
    alertas,
    vencidosSinCumplir,
    proximos,
    expedientesActivos,
    expedientesTotal,
    clientesActivos,
    clientesTotal,
    porEstado,
    porFuero,
    cargaAbogados,
    economia,
    cartera,
    carteraPorEstado,
  ] = await Promise.all([
    // 1) Las tres alertas: SIEMPRE globales, sin filtro de periodo.
    conteoGlobalVencimientos({ hoy, umbralDias: params.umbralDias }),
    listaVencidos(hoy, params.umbralDias),
    listaProximos(hoy, params.umbralDias, params.ventanaProximos),

    prisma.expediente.count({
      where: Object.assign(soloVivos(), { estado: { computaComoActivo: true } }),
    }),
    prisma.expediente.count({ where: soloVivos() }),
    prisma.cliente.count({ where: Object.assign(soloVivos(), { estado: 'ACTIVO' }) }),
    prisma.cliente.count({ where: soloVivos() }),
    expedientesPorEstado(),
    causasPorFuero(),
    cargaPorAbogado(hoy),
    resumenEconomico(periodo),
    resumenCartera(),
    clientesPorEstado(),
  ]);

  return {
    hoy,
    estudio: {
      nombre: config.nombreEstudio,
      titular: config.titular,
      matricula: config.matricula,
    },
    periodo,
    parametros: { umbralDias: params.umbralDias, ventanaProximos: params.ventanaProximos },

    // Tarjetas superiores.
    alertas: {
      vencidos: alertas.vencidos,
      venceHoy: alertas.venceHoy,
      porVencer: alertas.porVencer,
      // Se repite aca de forma explicita para que quede claro en la respuesta
      // que estos tres numeros no responden al filtro de periodo.
      alcance: 'GLOBAL',
    },
    totales: {
      expedientesActivos,
      expedientesTotal,
      clientesActivos,
      clientesTotal,
    },

    // Paneles.
    vencidosSinCumplir,
    proximosVencimientos: proximos,
    expedientesPorEstado: porEstado,
    causasPorFuero: porFuero,
    cargaPorAbogado: cargaAbogados,
    carteraClientes: carteraPorEstado,
    mayoresSaldos: cartera.clientes.filter((c) => c.saldo > 0).slice(0, 8),
    resumenEconomico: economia,
    cobranzaGlobal: {
      facturadoHistorico: cartera.totales.facturado,
      cobradoHistorico: cartera.totales.cobrado,
      saldoTotalACobrar: cartera.totales.saldo,
      porcentajeCobranza: porcentaje(cartera.totales.cobrado, cartera.totales.facturado),
    },
  };
}

/** Plazos atrasados, del mas viejo al mas nuevo. */
async function listaVencidos(hoy, umbralDias) {
  const eventos = await prisma.eventoPuntual.findMany({
    where: Object.assign({}, WHERE_PENDIENTES, {
      fechaVto: { lt: new Date(hoy + 'T00:00:00.000Z') },
    }),
    include: {
      responsable: { select: { nombre: true } },
      expediente: { select: { caratula: true, cliente: { select: { nombre: true } } } },
    },
    orderBy: { fechaVto: 'asc' },
    take: 15,
  });

  return eventos.map((ev) =>
    decorarVencimiento(
      {
        id: ev.id,
        codigo: ev.codigo,
        fechaVto: aISO(ev.fechaVto),
        descripcion: ev.descripcion,
        responsable: ev.responsable ? ev.responsable.nombre : null,
        expediente: ev.expediente ? ev.expediente.caratula : null,
        cliente: ev.expediente && ev.expediente.cliente ? ev.expediente.cliente.nombre : null,
      },
      { hoy, umbralDias }
    )
  );
}

/** Lo que se viene, arrancando por hoy. */
async function listaProximos(hoy, umbralDias, ventana) {
  const eventos = await prisma.eventoPuntual.findMany({
    where: Object.assign({}, WHERE_PENDIENTES, {
      fechaVto: {
        gte: new Date(hoy + 'T00:00:00.000Z'),
        lte: new Date(sumarDias(hoy, ventana) + 'T00:00:00.000Z'),
      },
    }),
    include: {
      responsable: { select: { nombre: true } },
      expediente: { select: { caratula: true, cliente: { select: { nombre: true } } } },
    },
    orderBy: { fechaVto: 'asc' },
    take: 15,
  });

  return eventos.map((ev) =>
    decorarVencimiento(
      {
        id: ev.id,
        codigo: ev.codigo,
        fechaVto: aISO(ev.fechaVto),
        descripcion: ev.descripcion,
        responsable: ev.responsable ? ev.responsable.nombre : null,
        expediente: ev.expediente ? ev.expediente.caratula : null,
        cliente: ev.expediente && ev.expediente.cliente ? ev.expediente.cliente.nombre : null,
      },
      { hoy, umbralDias }
    )
  );
}

async function expedientesPorEstado() {
  const filas = await prisma.expediente.groupBy({
    by: ['estadoId'],
    where: soloVivos(),
    _count: { _all: true },
  });

  const ids = filas.map((f) => f.estadoId).filter(Boolean);
  const estados = await prisma.catalogoItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, valor: true },
  });
  const nombres = new Map(estados.map((e) => [e.id, e.valor]));

  const total = filas.reduce((a, f) => a + f._count._all, 0);

  return filas
    .map((f) => ({
      estado: f.estadoId ? nombres.get(f.estadoId) || 'Sin estado' : 'Sin estado',
      cantidad: f._count._all,
      porcentaje: porcentaje(f._count._all, total),
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

async function clientesPorEstado() {
  const filas = await prisma.cliente.groupBy({
    by: ['estado'],
    where: soloVivos(),
    _count: { _all: true },
  });
  const total = filas.reduce((a, f) => a + f._count._all, 0);

  const etiquetas = {
    ACTIVO: 'Activo',
    POTENCIAL: 'Potencial',
    INACTIVO: 'Inactivo',
    EX_CLIENTE: 'Ex cliente',
  };

  return {
    total,
    items: filas
      .map((f) => ({
        estado: etiquetas[f.estado] || f.estado,
        cantidad: f._count._all,
        porcentaje: porcentaje(f._count._all, total),
      }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

/** Causas y vencimientos pendientes agrupados por fuero. */
async function causasPorFuero() {
  const expedientes = await prisma.expediente.findMany({
    where: soloVivos(),
    select: {
      id: true,
      fuero: { select: { valor: true } },
      eventos: {
        where: WHERE_PENDIENTES,
        select: { id: true },
      },
    },
  });

  const mapa = new Map();
  for (const exp of expedientes) {
    const nombre = exp.fuero ? exp.fuero.valor : 'Sin fuero';
    const fila = mapa.get(nombre) || { fuero: nombre, causas: 0, vencimientos: 0 };
    fila.causas += 1;
    fila.vencimientos += exp.eventos.length;
    mapa.set(nombre, fila);
  }

  return Array.from(mapa.values()).sort((a, b) => b.causas - a.causas);
}

/** Cuantas causas y cuantos plazos pendientes tiene cada abogado. */
async function cargaPorAbogado(hoy) {
  const abogados = await prisma.abogado.findMany({
    where: { activo: true },
    select: {
      id: true,
      nombre: true,
      _count: { select: { expedientes: true } },
    },
    orderBy: { nombre: 'asc' },
  });

  const pendientes = await prisma.eventoPuntual.groupBy({
    by: ['responsableId'],
    where: WHERE_PENDIENTES,
    _count: { _all: true },
  });

  const vencidos = await prisma.eventoPuntual.groupBy({
    by: ['responsableId'],
    where: Object.assign({}, WHERE_PENDIENTES, {
      fechaVto: { lt: new Date(hoy + 'T00:00:00.000Z') },
    }),
    _count: { _all: true },
  });

  const mapaPendientes = new Map(pendientes.map((p) => [p.responsableId, p._count._all]));
  const mapaVencidos = new Map(vencidos.map((p) => [p.responsableId, p._count._all]));

  return abogados.map((a) => ({
    abogadoId: a.id,
    abogado: a.nombre,
    causas: a._count.expedientes,
    pendientes: mapaPendientes.get(a.id) || 0,
    vencidos: mapaVencidos.get(a.id) || 0,
  }));
}

/**
 * Resumen economico DEL PERIODO elegido.
 *  - facturado: honorarios pactados con fecha de pacto dentro del periodo
 *  - cobrado:   pagos con fecha dentro del periodo
 *  - gastos:    gastos con fecha dentro del periodo
 */
async function resumenEconomico(periodo) {
  const [honorarios, pagos, gastos, gastosPendientes] = await Promise.all([
    prisma.honorario.findMany({
      where: Object.assign(soloVivos(), rangoFechas('fechaPacto', periodo.desde, periodo.hasta)),
      select: { montoPactado: true, ivaPorcentaje: true },
    }),
    prisma.honorarioPago.findMany({
      where: Object.assign(
        { honorario: soloVivos() },
        rangoFechas('fecha', periodo.desde, periodo.hasta)
      ),
      select: { monto: true },
    }),
    prisma.gasto.findMany({
      where: Object.assign(soloVivos(), rangoFechas('fecha', periodo.desde, periodo.hasta)),
      select: { importe: true, tipo: true },
    }),
    prisma.gasto.findMany({
      where: Object.assign(soloVivos(), {
        tipo: 'EXPEDIENTE',
        reembolsable: true,
        estadoReintegro: 'PENDIENTE',
      }),
      select: { importe: true },
    }),
  ]);

  const facturado = redondear(
    honorarios.reduce((a, h) => a + calcularHonorario(h, []).totalConIva, 0)
  );
  const cobrado = redondear(pagos.reduce((a, p) => a + aNumero(p.monto), 0));

  let gastosTotal = 0;
  let gastosCausas = 0;
  let gastosEstudio = 0;
  for (const g of gastos) {
    const importe = aNumero(g.importe);
    gastosTotal += importe;
    if (g.tipo === 'EXPEDIENTE') gastosCausas += importe;
    else gastosEstudio += importe;
  }

  const pendienteReintegro = redondear(
    gastosPendientes.reduce((a, g) => a + aNumero(g.importe), 0)
  );

  return {
    periodo: periodo.etiqueta,
    facturado,
    cobrado,
    gastos: redondear(gastosTotal),
    gastosCausas: redondear(gastosCausas),
    gastosEstudio: redondear(gastosEstudio),
    // El resultado del periodo se mide sobre lo COBRADO, no lo facturado: es
    // caja real, que es lo que le sirve al estudio para decidir.
    resultado: redondear(cobrado - gastosTotal),
    gastosPendientesReintegro: pendienteReintegro,
  };
}

export { SITUACION, ordenarPorUrgencia };
