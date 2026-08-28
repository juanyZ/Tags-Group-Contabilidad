/**
 * CUENTA CORRIENTE DEL CLIENTE.
 *
 * Es la hoja que se imprime o se le manda al cliente cuando pregunta como
 * viene la cuenta. Se arma sola con tres fuentes:
 *
 *   DEBE  = honorarios pactados (con IVA) + gastos que puso el estudio y
 *           todavia no le reintegraron
 *   HABER = los pagos del cliente
 *   SALDO = acumulado, movimiento a movimiento, ordenado por fecha
 *
 * Regla heredada de la planilla, importante: los gastos ya marcados como
 * REINTEGRADO no entran en la cuenta, porque se consideran saldados. Solo
 * entran los que siguen en PENDIENTE.
 */
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { aISO } from '../../utils/fechas.js';
import { aNumero, redondear, porcentaje } from '../../utils/dinero.js';
import { calcularHonorario } from '../../services/honorarios.calculo.js';
import { soloVivos } from '../../lib/consultas.js';

export const SITUACION_CUENTA = {
  AL_DIA: 'AL_DIA',
  CON_SALDO: 'CON_SALDO',
  SIN_PAGOS: 'SIN_PAGOS',
};

export async function cuentaCorriente(clienteId) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      provincia: { select: { valor: true } },
      abogado: { select: { nombre: true } },
    },
  });
  if (!cliente || cliente.eliminadoEn) {
    throw ApiError.noEncontrado('El cliente no existe o fue eliminado');
  }

  const [honorarios, gastos, expedientes] = await Promise.all([
    prisma.honorario.findMany({
      where: Object.assign({ clienteId }, soloVivos()),
      include: {
        pagos: { include: { medioPago: { select: { valor: true } } } },
        expediente: { select: { codigo: true, caratula: true } },
      },
    }),
    // Solo gastos de causas DE ESTE CLIENTE, reembolsables y aun pendientes.
    prisma.gasto.findMany({
      where: Object.assign(
        {
          tipo: 'EXPEDIENTE',
          reembolsable: true,
          estadoReintegro: 'PENDIENTE',
          expediente: { clienteId, eliminadoEn: null },
        },
        soloVivos()
      ),
      include: {
        rubro: { select: { valor: true } },
        expediente: { select: { codigo: true, caratula: true } },
      },
    }),
    prisma.expediente.count({ where: Object.assign({ clienteId }, soloVivos()) }),
  ]);

  const movimientos = [];

  let totalHonorarios = 0;
  let totalCobrado = 0;
  let ultimoCobro = null;
  let fechaPactoMasReciente = null;
  let tipoPactoMasReciente = null;

  for (const hon of honorarios) {
    const pagos = hon.pagos.map((p) => ({ fecha: aISO(p.fecha), monto: aNumero(p.monto) }));
    const calculo = calcularHonorario(hon, pagos);

    totalHonorarios += calculo.totalConIva;
    totalCobrado += calculo.cobrado;

    const fechaPacto = aISO(hon.fechaPacto);
    if (!fechaPactoMasReciente || fechaPacto > fechaPactoMasReciente) {
      fechaPactoMasReciente = fechaPacto;
      tipoPactoMasReciente = hon.tipoPacto;
    }

    movimientos.push({
      fecha: fechaPacto,
      concepto: 'HONORARIOS',
      detalle:
        hon.tipoPacto.replace(/_/g, ' ').toLowerCase() +
        (hon.expediente ? ' - ' + hon.expediente.caratula : '') +
        (hon.observaciones ? '. ' + hon.observaciones : ''),
      referencia: hon.codigo,
      debe: calculo.totalConIva,
      haber: 0,
    });

    for (const p of hon.pagos) {
      const fechaPago = aISO(p.fecha);
      if (!ultimoCobro || fechaPago > ultimoCobro) ultimoCobro = fechaPago;

      movimientos.push({
        fecha: fechaPago,
        concepto: 'COBRO',
        detalle:
          'Pago recibido a cuenta' +
          (p.medioPago ? ' (' + p.medioPago.valor + ')' : '') +
          (p.observacion ? '. ' + p.observacion : ''),
        referencia: hon.codigo,
        debe: 0,
        haber: aNumero(p.monto),
      });
    }
  }

  let totalGastos = 0;
  for (const g of gastos) {
    const importe = aNumero(g.importe);
    totalGastos += importe;

    movimientos.push({
      fecha: aISO(g.fecha),
      concepto: 'GASTO_A_REINTEGRAR',
      detalle:
        (g.rubro ? g.rubro.valor : 'Gasto') +
        (g.detalle ? ' - ' + g.detalle : '') +
        (g.expediente ? ' [' + g.expediente.codigo + ']' : ''),
      referencia: g.codigo,
      debe: importe,
      haber: 0,
    });
  }

  // Orden cronologico y saldo acumulado. Ante misma fecha va primero lo que
  // suma al debe: primero se factura, despues se cobra.
  const ordenConcepto = { HONORARIOS: 0, GASTO_A_REINTEGRAR: 1, COBRO: 2 };
  movimientos.sort((a, b) => {
    if (a.fecha !== b.fecha) return String(a.fecha).localeCompare(String(b.fecha));
    return ordenConcepto[a.concepto] - ordenConcepto[b.concepto];
  });

  let acumulado = 0;
  for (const m of movimientos) {
    acumulado = redondear(acumulado + m.debe - m.haber);
    m.saldo = acumulado;
  }

  const totalFacturado = redondear(totalHonorarios + totalGastos);
  const saldo = redondear(totalFacturado - totalCobrado);

  let situacion = SITUACION_CUENTA.CON_SALDO;
  if (saldo <= 0.01) situacion = SITUACION_CUENTA.AL_DIA;
  else if (totalCobrado <= 0) situacion = SITUACION_CUENTA.SIN_PAGOS;

  return {
    cliente: {
      id: cliente.id,
      codigo: cliente.codigo,
      nombre: cliente.nombre,
      tipoPersona: cliente.tipoPersona,
      documento: cliente.documento,
      telefono: cliente.telefono,
      email: cliente.email,
      domicilio: cliente.domicilio,
      provincia: cliente.provincia ? cliente.provincia.valor : null,
      estado: cliente.estado,
      clienteDesde: aISO(cliente.fechaAlta),
      abogado: cliente.abogado ? cliente.abogado.nombre : null,
    },
    condiciones: {
      tipoPacto: tipoPactoMasReciente,
      fechaPacto: fechaPactoMasReciente,
      ultimoCobro,
    },
    totales: {
      honorarios: redondear(totalHonorarios),
      gastosAReintegrar: redondear(totalGastos),
      totalFacturado,
      cobrado: redondear(totalCobrado),
      saldo: Math.max(0, saldo),
      saldoAFavorCliente: saldo < -0.01 ? redondear(Math.abs(saldo)) : 0,
      porcentajeCancelado: porcentaje(totalCobrado, totalFacturado),
      expedientes,
      situacion,
    },
    movimientos,
  };
}

/**
 * Resumen de la cartera: el saldo de todos los clientes, para la pantalla
 * general y para el tablero. Se calcula en una sola pasada por cliente.
 */
export async function resumenCartera() {
  const [honorarios, gastos] = await Promise.all([
    prisma.honorario.findMany({
      where: soloVivos(),
      include: { pagos: { select: { monto: true, fecha: true } }, cliente: { select: { id: true, nombre: true, codigo: true } } },
    }),
    prisma.gasto.findMany({
      where: Object.assign(
        {
          tipo: 'EXPEDIENTE',
          reembolsable: true,
          estadoReintegro: 'PENDIENTE',
          expediente: { eliminadoEn: null },
        },
        soloVivos()
      ),
      include: { expediente: { select: { clienteId: true } } },
    }),
  ]);

  const porCliente = new Map();

  const asegurar = (id, nombre, codigo) => {
    if (!porCliente.has(id)) {
      porCliente.set(id, {
        clienteId: id,
        cliente: nombre,
        codigo,
        honorarios: 0,
        gastos: 0,
        cobrado: 0,
        facturado: 0,
        saldo: 0,
      });
    }
    return porCliente.get(id);
  };

  for (const hon of honorarios) {
    const fila = asegurar(hon.clienteId, hon.cliente.nombre, hon.cliente.codigo);
    const calculo = calcularHonorario(hon, hon.pagos);
    fila.honorarios += calculo.totalConIva;
    fila.cobrado += calculo.cobrado;
  }

  // Un cliente puede tener gastos sin tener honorarios pactados. Los que
  // faltan se traen en UNA consulta, no de a uno dentro del bucle.
  const idsFaltantes = Array.from(
    new Set(
      gastos
        .filter((g) => g.expediente && !porCliente.has(g.expediente.clienteId))
        .map((g) => g.expediente.clienteId)
    )
  );

  if (idsFaltantes.length > 0) {
    const faltantes = await prisma.cliente.findMany({
      where: { id: { in: idsFaltantes } },
      select: { id: true, nombre: true, codigo: true },
    });
    for (const c of faltantes) asegurar(c.id, c.nombre, c.codigo);
  }

  for (const g of gastos) {
    if (!g.expediente) continue;
    const fila = porCliente.get(g.expediente.clienteId);
    if (!fila) continue; // cliente eliminado: su gasto no se le reclama a nadie
    fila.gastos += aNumero(g.importe);
  }

  const filas = Array.from(porCliente.values()).map((f) => {
    f.honorarios = redondear(f.honorarios);
    f.gastos = redondear(f.gastos);
    f.cobrado = redondear(f.cobrado);
    f.facturado = redondear(f.honorarios + f.gastos);
    f.saldo = redondear(Math.max(0, f.facturado - f.cobrado));
    f.porcentajeCobrado = porcentaje(f.cobrado, f.facturado);
    return f;
  });

  filas.sort((a, b) => b.saldo - a.saldo);

  return {
    clientes: filas,
    totales: {
      facturado: redondear(filas.reduce((a, f) => a + f.facturado, 0)),
      cobrado: redondear(filas.reduce((a, f) => a + f.cobrado, 0)),
      saldo: redondear(filas.reduce((a, f) => a + f.saldo, 0)),
    },
  };
}
