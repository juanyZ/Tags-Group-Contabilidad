/**
 * SEED MÍNIMO — pocos registros, todas las relaciones.
 *
 * Pensado para recorrer el sistema sin cargar nada a mano y sin la marea de
 * datos del seed completo. Son 3 clientes, 3 expedientes, 7 vencimientos,
 * 2 recurrentes, 3 honorarios y 5 gastos, elegidos para que se vea:
 *
 *   · cliente con VARIAS causas          (Pérez, con dos expedientes)
 *   · cliente sin causas                 (Gómez, potencial)
 *   · honorario CON y SIN expediente     (el de Pérez vs. el de Gómez)
 *   · las tres situaciones de cobranza   (parcial / cobrado / sin cobrar)
 *   · los cinco estados del semáforo     (vencido, hoy, por vencer, en fecha, cumplido)
 *   · evento del estudio, sin causa      (la reunión de agenda semanal)
 *   · gasto reembolsable PENDIENTE       (entra en la cuenta corriente)
 *   · gasto reembolsable REINTEGRADO     (NO entra: ya está saldado)
 *   · gasto general del estudio          (no se le reclama a nadie)
 *
 * Los vencimientos son RELATIVOS a hoy, así el tablero se ve vivo cualquier
 * día que se corra.
 *
 * ES ADITIVO: si ya cargaste datos a mano, no se tocan. Los códigos los genera
 * el mismo helper que usa la aplicación, así que continúan la numeración real
 * y nunca chocan con lo que ya exista.
 *
 * TODOS los datos son de prueba e inventados.
 *
 *   npm run seed:minimo
 */
import { PrismaClient } from '@prisma/client';
import { crearConCodigo } from '../src/services/codigos.service.js';

const prisma = new PrismaClient();

const MS_DIA = 86400000;
const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hoy = FORMATO.format(new Date());

/** Fecha relativa a hoy, en días. dias(-4) = hace cuatro días. */
function dias(n) {
  return new Date(new Date(hoy + 'T00:00:00.000Z').getTime() + n * MS_DIA);
}

/** Busca un item de catálogo por tipo y valor. */
async function cat(tipo, valor) {
  const item = await prisma.catalogoItem.findUnique({ where: { tipo_valor: { tipo, valor } } });
  if (!item) throw new Error('Falta el catálogo ' + tipo + ' / ' + valor);
  return item.id;
}

const NOMBRE_TESTIGO = 'Pérez, Juan Carlos';

async function main() {
  console.log('\nCargando datos mínimos de prueba (hoy = ' + hoy + ')...\n');

  // Solo se aborta si ESTE seed ya se corrió. Lo que hayas cargado a mano se
  // respeta: los datos de ejemplo se agregan al lado.
  const yaEsta = await prisma.cliente.findFirst({ where: { nombre: NOMBRE_TESTIGO } });
  if (yaEsta) {
    console.error('  Los datos de ejemplo ya están cargados (' + yaEsta.codigo + ').');
    console.error('  Para volver a empezar de cero:  npm run limpiar -- --confirmar\n');
    process.exit(1);
  }

  const previos = await prisma.cliente.count();
  if (previos > 0) {
    console.log('  Ya había ' + previos + ' cliente(s) cargado(s). No se tocan: esto se agrega al lado.\n');
  }

  // Se usa la ficha de abogado que ya existe: este seed no crea abogados.
  const abogado = await prisma.abogado.findFirst({ where: { activo: true } });
  if (!abogado) throw new Error('No hay ninguna ficha de abogado cargada.');

  // ---------------------------------------------------------------- CLIENTES
  const perez = await crearConCodigo(prisma, 'cliente', {
    tipoPersona: 'FISICA',
    nombre: NOMBRE_TESTIGO,
    documento: '20987654',
    fechaNacConstit: new Date('1972-11-02T00:00:00.000Z'),
    domicilio: 'Calle San Martín 128',
    provinciaId: await cat('PROVINCIA', 'Buenos Aires'),
    telefono: '223 555 0101',
    email: 'jcperez@example.com',
    origenId: await cat('ORIGEN_CONTACTO', 'Recomendación de cliente'),
    estado: 'ACTIVO',
    fechaAlta: dias(-420),
    abogadoId: abogado.id,
    observaciones: 'Cliente con dos causas abiertas. Sirve para ver la cuenta corriente completa.',
  });

  const constructora = await crearConCodigo(prisma, 'cliente', {
    tipoPersona: 'JURIDICA',
    nombre: 'Empresa Constructora del Sur S.A.',
    documento: '30701234564',
    fechaNacConstit: new Date('2011-06-20T00:00:00.000Z'),
    domicilio: 'Av. Colón 2100, Piso 8',
    provinciaId: await cat('PROVINCIA', 'Buenos Aires'),
    telefono: '223 555 0202',
    email: 'legales@constructorasur.example.com',
    origenId: await cat('ORIGEN_CONTACTO', 'Recomendación de colega'),
    estado: 'ACTIVO',
    fechaAlta: dias(-300),
    abogadoId: abogado.id,
    observaciones: 'Persona jurídica. Honorarios ya cobrados por completo.',
  });

  const gomez = await crearConCodigo(prisma, 'cliente', {
    tipoPersona: 'FISICA',
    nombre: 'Gómez, María Alejandra',
    documento: '27345678',
    domicilio: 'Rivadavia 4520, 3° A',
    provinciaId: await cat('PROVINCIA', 'Buenos Aires'),
    telefono: '223 555 0303',
    email: 'magomez@example.com',
    origenId: await cat('ORIGEN_CONTACTO', 'Sitio web'),
    estado: 'POTENCIAL',
    fechaAlta: dias(-20),
    abogadoId: abogado.id,
    observaciones: 'Consulta inicial, todavía sin causa abierta.',
  });

  console.log('  Clientes ......... 3   ' + [perez, constructora, gomez].map((c) => c.codigo).join(', '));

  // ------------------------------------------------------------- EXPEDIENTES
  const enTramite = await cat('ESTADO_EXPEDIENTE', 'En trámite');

  const exp1 = await crearConCodigo(prisma, 'expediente', {
    fechaInicio: dias(-380),
    caratula: 'Pérez, Juan c/ Logística Andina S.A. s/ Despido',
    clienteId: perez.id,
    caracter: 'ACTOR',
    contraparte: 'Logística Andina S.A.',
    fueroId: await cat('FUERO', 'Laboral'),
    juzgadoId: await cat('JUZGADO', 'Juzgado Laboral N 2'),
    numeroExpediente: 'LAB-4520/2025',
    etapaId: await cat('ETAPA_PROCESAL', 'Apertura a prueba'),
    estadoId: enTramite,
    abogadoId: abogado.id,
    ultimaActuacion: dias(-15),
    montoReclamado: 8500000,
    observaciones: 'Causa principal. Tiene vencimientos en los cinco estados del semáforo.',
  });

  const exp2 = await crearConCodigo(prisma, 'expediente', {
    fechaInicio: dias(-120),
    caratula: 'Pérez, Juan c/ Seguros del Plata S.A. s/ Daños y perjuicios',
    clienteId: perez.id,
    caracter: 'ACTOR',
    contraparte: 'Seguros del Plata S.A.',
    fueroId: await cat('FUERO', 'Daños y Perjuicios'),
    juzgadoId: await cat('JUZGADO', 'Juzgado Civil y Comercial N 1'),
    numeroExpediente: 'CIV-0912/2026',
    etapaId: await cat('ETAPA_PROCESAL', 'Demanda'),
    estadoId: enTramite,
    abogadoId: abogado.id,
    ultimaActuacion: dias(-40),
    montoReclamado: 3200000,
    observaciones: 'Segunda causa del mismo cliente: la cuenta corriente es una sola, por cliente.',
  });

  const exp3 = await crearConCodigo(prisma, 'expediente', {
    fechaInicio: dias(-260),
    caratula: 'Constructora del Sur S.A. c/ Municipalidad s/ Contencioso',
    clienteId: constructora.id,
    caracter: 'ACTOR',
    contraparte: 'Municipalidad de General Pueyrredón',
    fueroId: await cat('FUERO', 'Contencioso Administrativo'),
    juzgadoId: await cat('JUZGADO', 'Cámara de Apelaciones Sala I'),
    numeroExpediente: 'CA-3312/2025',
    etapaId: await cat('ETAPA_PROCESAL', 'Alegatos'),
    estadoId: enTramite,
    abogadoId: abogado.id,
    ultimaActuacion: dias(-8),
    montoReclamado: 18000000,
    observaciones: 'Certificados de obra impagos.',
  });

  console.log(
    '  Expedientes ...... 3   ' +
      [exp1, exp2, exp3].map((e) => e.codigo).join(', ') +
      '   (los dos primeros son del mismo cliente)'
  );

  // ------------------------------------------------------------ VENCIMIENTOS
  // Elegidos para cubrir los cinco estados del semáforo de una sola pasada.
  const eventos = [
    [-12, '10:00', 'Audiencia', 'Audiencia de vista de causa', exp1.id, 'ALTA', 'CUMPLIDO'],
    [-4, null, 'Presentación de escrito', 'Contestar traslado del memorial de agravios', exp1.id, 'ALTA', 'PENDIENTE'],
    [0, '11:00', 'Audiencia', 'Audiencia de conciliación', exp1.id, 'ALTA', 'PENDIENTE'],
    [3, null, 'Vencimiento de plazo', 'Vence plazo de prueba informativa', exp1.id, 'MEDIA', 'PENDIENTE'],
    [6, '09:30', 'Pericia', 'Designación de perito contable', exp3.id, 'ALTA', 'PENDIENTE'],
    [25, null, 'Presentación de escrito', 'Alegato sobre el mérito de la prueba', exp2.id, 'MEDIA', 'PENDIENTE'],
    // Sin expediente: es un evento del estudio, no de una causa.
    [9, null, 'Reunión interna', 'Revisión de agenda semanal del estudio', null, 'BAJA', 'PENDIENTE'],
  ];

  for (const [offset, hora, tipo, descripcion, expedienteId, prioridad, estado] of eventos) {
    await crearConCodigo(prisma, 'eventoPuntual', {
      fechaVto: dias(offset),
      hora,
      tipoId: await cat('TIPO_EVENTO', tipo),
      descripcion,
      expedienteId,
      responsableId: abogado.id,
      prioridad,
      estado,
    });
  }

  console.log('  Vencimientos ..... 7   (vencido, vence hoy, por vencer, en fecha y cumplido)');

  // -------------------------------------------------------------- RECURRENTES
  await crearConCodigo(prisma, 'eventoRecurrente', {
    descripcion: 'Reunión semanal de equipo',
    tipoId: await cat('TIPO_EVENTO_RECURRENTE', 'Reunión interna'),
    periodicidad: 'SEMANAL',
    fechaBase: dias(-56),
    responsableId: abogado.id,
    activo: true,
  });

  await crearConCodigo(prisma, 'eventoRecurrente', {
    descripcion: 'Presentación DDJJ IVA del estudio',
    tipoId: await cat('TIPO_EVENTO_RECURRENTE', 'Vencimiento fiscal'),
    periodicidad: 'MENSUAL',
    fechaBase: dias(-90),
    responsableId: abogado.id,
    activo: true,
  });

  console.log('  Recurrentes ...... 2   (uno semanal y uno mensual)');

  // --------------------------------------------------------------- HONORARIOS
  const transferencia = await cat('MEDIO_PAGO', 'Transferencia');

  // PARCIAL: pactado $1.500.000 + IVA = $1.815.000, cobrado $500.000.
  await crearConCodigo(prisma, 'honorario', {
    clienteId: perez.id,
    expedienteId: exp1.id,
    fechaPacto: dias(-370),
    tipoPacto: 'CUOTA_LITIS',
    montoPactado: 1500000,
    ivaPorcentaje: 21,
    observaciones: '20% del monto de condena. Cobro parcial.',
    pagos: { create: [{ fecha: dias(-60), monto: 500000, medioPagoId: transferencia }] },
  });

  // COBRADO: dos pagos que suman el total. Se ve el 100% y el semáforo en verde.
  await crearConCodigo(prisma, 'honorario', {
    clienteId: constructora.id,
    expedienteId: exp3.id,
    fechaPacto: dias(-250),
    tipoPacto: 'MONTO_FIJO',
    montoPactado: 800000,
    ivaPorcentaje: 21,
    observaciones: 'Pactado al inicio, cobrado en dos cuotas.',
    pagos: {
      create: [
        { fecha: dias(-200), monto: 500000, medioPagoId: transferencia },
        { fecha: dias(-90), monto: 468000, medioPagoId: transferencia },
      ],
    },
  });

  // SIN COBRAR y SIN expediente: una consulta que todavía no derivó en causa.
  await crearConCodigo(prisma, 'honorario', {
    clienteId: gomez.id,
    expedienteId: null,
    fechaPacto: dias(-15),
    tipoPacto: 'POR_HORA',
    montoPactado: 200000,
    ivaPorcentaje: 21,
    observaciones: 'Consulta inicial. Todavía sin cobrar y sin causa abierta.',
  });

  console.log('  Honorarios ....... 3   (parcial, cobrado y sin cobrar)');

  // ------------------------------------------------------------------ GASTOS
  const gastos = [
    // De causa y REEMBOLSABLES PENDIENTES: estos sí entran en la cuenta corriente.
    [-370, 'EXPEDIENTE', exp1.id, 'Tasa de justicia', 'Tasa de justicia 3% sobre el monto de demanda', 'Transferencia', 255000, true, 'PENDIENTE'],
    [-140, 'EXPEDIENTE', exp1.id, 'Cédula / Notificación', 'Cédula al domicilio de la demandada', 'Efectivo', 32000, true, 'PENDIENTE'],
    // REINTEGRADO: ya se lo devolvieron, por eso NO aparece en la cuenta corriente.
    [-240, 'EXPEDIENTE', exp3.id, 'Tasa de justicia', 'Tasa de justicia del contencioso', 'Transferencia', 180000, true, 'REINTEGRADO'],
    // Generales del estudio: no se le reclaman a ningún cliente.
    [-25, 'ESTUDIO', null, 'Alquiler de la oficina', 'Alquiler del mes', 'Transferencia', 850000, false, 'NO_CORRESPONDE'],
    [-22, 'ESTUDIO', null, 'Internet y teléfono', 'Internet y telefonía de la oficina', 'Débito / Crédito', 96000, false, 'NO_CORRESPONDE'],
  ];

  for (const [offset, tipo, expedienteId, rubro, detalle, medio, importe, reembolsable, reintegro] of gastos) {
    await crearConCodigo(prisma, 'gasto', {
      fecha: dias(offset),
      tipo,
      expedienteId,
      rubroId: await cat('RUBRO_GASTO', rubro),
      detalle,
      medioPagoId: await cat('MEDIO_PAGO', medio),
      importe,
      reembolsable,
      estadoReintegro: reintegro,
    });
  }

  console.log('  Gastos ........... 5   (dos de causa pendientes, uno reintegrado, dos del estudio)');

  console.log('');
  console.log('  ------------------------------------------------------');
  console.log('   Datos de PRUEBA e inventados. Para borrarlos:');
  console.log('     npm run limpiar -- --confirmar');
  console.log('  ------------------------------------------------------');
  console.log('');
}

main()
  .catch((e) => {
    console.error('\nError cargando los datos:', e.message, '\n');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
