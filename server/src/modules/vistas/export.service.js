/**
 * EXPORTACIONES: cuenta corriente y ficha a PDF, listados a CSV.
 *
 * Los PDF se arman con PDFKit escribiendo directo al stream de la respuesta:
 * no se genera un archivo intermedio en disco, asi que no hay que limpiarlo
 * despues ni queda informacion de clientes tirada en el servidor.
 */
import PDFDocument from 'pdfkit';
import { formatoAR, hoyISO } from '../../utils/fechas.js';

const VERDE = '#1b4d3e';
const GRIS = '#666666';
const AMBAR = '#b8860b';

/** Formato de moneda argentino: $ 1.234.567,89 */
export function pesos(valor) {
  const n = Number(valor || 0);
  return (
    '$ ' +
    n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function encabezado(doc, estudio, titulo, subtitulo) {
  doc.rect(0, 0, doc.page.width, 90).fill(VERDE);

  doc
    .fillColor('#ffffff')
    .fontSize(16)
    .text(estudio.nombreEstudio || 'Estudio Juridico', 40, 28, { width: 380 });

  doc.fontSize(9).fillColor('#d9e5e0');
  const datos = [estudio.titular, estudio.matricula, estudio.telefono, estudio.email]
    .filter(Boolean)
    .join('  ·  ');
  if (datos) doc.text(datos, 40, 50, { width: 380 });

  doc
    .fontSize(13)
    .fillColor('#ffffff')
    .text(titulo, 40, 68, { width: doc.page.width - 80, align: 'right' });

  doc.fillColor('#000000').moveDown(3);
  doc.y = 110;

  if (subtitulo) {
    doc.fontSize(11).fillColor(GRIS).text(subtitulo, 40, doc.y);
    doc.moveDown(0.8);
  }
  doc.fillColor('#000000');
}

function pie(doc) {
  const y = doc.page.height - 50;
  doc
    .fontSize(8)
    .fillColor(GRIS)
    .text(
      'Emitido el ' + formatoAR(hoyISO()) + '  ·  Documento generado automaticamente',
      40,
      y,
      { width: doc.page.width - 80, align: 'center' }
    );
}

/** Dibuja una fila de la tabla y devuelve la nueva posicion Y. */
function filaTabla(doc, columnas, valores, y, opciones) {
  const opts = opciones || {};
  const alto = opts.alto || 18;

  if (opts.fondo) {
    doc.rect(40, y - 3, doc.page.width - 80, alto).fill(opts.fondo);
    doc.fillColor(opts.colorTexto || '#000000');
  } else {
    doc.fillColor(opts.colorTexto || '#000000');
  }

  doc.fontSize(opts.tamano || 8.5);

  let x = 40;
  for (let i = 0; i < columnas.length; i += 1) {
    doc.text(String(valores[i] == null ? '' : valores[i]), x + 3, y, {
      width: columnas[i].ancho - 6,
      align: columnas[i].align || 'left',
      lineBreak: false,
      ellipsis: true,
    });
    x += columnas[i].ancho;
  }

  doc.fillColor('#000000');
  return y + alto;
}

/** Salto de pagina cuando no entra otra fila. */
function asegurarEspacio(doc, y, necesario) {
  if (y + necesario > doc.page.height - 70) {
    pie(doc);
    doc.addPage();
    return 60;
  }
  return y;
}

// ---------------------------------------------------------------------------
//  Cuenta corriente
// ---------------------------------------------------------------------------

export function pdfCuentaCorriente(res, cuenta, estudio) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="cuenta-corriente-' + cuenta.cliente.codigo + '.pdf"'
  );
  doc.pipe(res);

  encabezado(doc, estudio, 'CUENTA CORRIENTE', cuenta.cliente.nombre);

  // --- Datos del cliente ---
  let y = doc.y;
  doc.fontSize(9).fillColor(GRIS);
  const datosCliente = [
    ['Codigo', cuenta.cliente.codigo],
    ['Documento', cuenta.cliente.documento || '—'],
    ['Domicilio', cuenta.cliente.domicilio || '—'],
    ['Telefono', cuenta.cliente.telefono || '—'],
    ['Email', cuenta.cliente.email || '—'],
    ['Cliente desde', formatoAR(cuenta.cliente.clienteDesde)],
  ];

  for (let i = 0; i < datosCliente.length; i += 1) {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = 40 + col * 260;
    doc.fillColor(GRIS).fontSize(8).text(datosCliente[i][0], x, y + fila * 14);
    doc.fillColor('#000000').fontSize(9).text(datosCliente[i][1], x + 70, y + fila * 14, {
      width: 180,
      ellipsis: true,
    });
  }
  y += Math.ceil(datosCliente.length / 2) * 14 + 12;

  // --- Totales ---
  doc.rect(40, y, doc.page.width - 80, 54).fill('#f2f6f4');
  const totales = [
    ['Honorarios', pesos(cuenta.totales.honorarios)],
    ['Gastos a reintegrar', pesos(cuenta.totales.gastosAReintegrar)],
    ['Total facturado', pesos(cuenta.totales.totalFacturado)],
    ['Cobrado', pesos(cuenta.totales.cobrado)],
    ['SALDO', pesos(cuenta.totales.saldo)],
  ];
  const anchoCelda = (doc.page.width - 80) / totales.length;
  for (let i = 0; i < totales.length; i += 1) {
    const x = 40 + i * anchoCelda;
    doc.fillColor(GRIS).fontSize(7.5).text(totales[i][0], x, y + 10, {
      width: anchoCelda,
      align: 'center',
    });
    doc
      .fillColor(i === totales.length - 1 ? AMBAR : VERDE)
      .fontSize(11)
      .text(totales[i][1], x, y + 26, { width: anchoCelda, align: 'center' });
  }
  y += 68;

  // --- Detalle de movimientos ---
  doc.fillColor(VERDE).fontSize(11).text('DETALLE DE MOVIMIENTOS', 40, y);
  y += 18;

  const columnas = [
    { titulo: 'Fecha', ancho: 60 },
    { titulo: 'Concepto', ancho: 90 },
    { titulo: 'Detalle', ancho: 175 },
    { titulo: 'Debe', ancho: 65, align: 'right' },
    { titulo: 'Haber', ancho: 65, align: 'right' },
    { titulo: 'Saldo', ancho: 60, align: 'right' },
  ];

  y = filaTabla(
    doc,
    columnas,
    columnas.map((c) => c.titulo),
    y,
    { fondo: VERDE, colorTexto: '#ffffff', tamano: 8 }
  );

  const etiquetas = {
    HONORARIOS: 'Honorarios',
    GASTO_A_REINTEGRAR: 'Gasto a reintegrar',
    COBRO: 'Cobro',
  };

  let alterna = false;
  for (const m of cuenta.movimientos) {
    y = asegurarEspacio(doc, y, 20);
    y = filaTabla(
      doc,
      columnas,
      [
        formatoAR(m.fecha),
        etiquetas[m.concepto] || m.concepto,
        m.detalle,
        m.debe > 0 ? pesos(m.debe) : '—',
        m.haber > 0 ? pesos(m.haber) : '—',
        pesos(m.saldo),
      ],
      y,
      { fondo: alterna ? '#f7f7f7' : null }
    );
    alterna = !alterna;
  }

  if (cuenta.movimientos.length === 0) {
    doc.fontSize(9).fillColor(GRIS).text('Sin movimientos registrados.', 43, y + 4);
    y += 20;
  }

  pie(doc);
  doc.end();
}

// ---------------------------------------------------------------------------
//  Ficha del expediente
// ---------------------------------------------------------------------------

export function pdfFichaExpediente(res, ficha, estudio) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="ficha-' + ficha.expediente.codigo + '.pdf"'
  );
  doc.pipe(res);

  encabezado(doc, estudio, 'FICHA DEL EXPEDIENTE', ficha.expediente.caratula);

  let y = doc.y;

  const datos = [
    ['Codigo', ficha.expediente.codigo],
    ['Cliente', ficha.expediente.cliente],
    ['Caracter', ficha.expediente.caracter],
    ['Contraparte', ficha.expediente.contraparte || '—'],
    ['Fuero / materia', ficha.expediente.fuero || '—'],
    ['Juzgado', ficha.expediente.juzgado || '—'],
    ['N de expediente', ficha.expediente.numeroExpediente || '—'],
    ['Etapa procesal', ficha.expediente.etapa || '—'],
    ['Estado', ficha.expediente.estado || '—'],
    ['Abogado', ficha.expediente.abogado || '—'],
    ['Fecha de inicio', formatoAR(ficha.expediente.fechaInicio)],
    ['Ultima actuacion', formatoAR(ficha.expediente.ultimaActuacion) || '—'],
    ['Monto reclamado', ficha.expediente.montoReclamado ? pesos(ficha.expediente.montoReclamado) : '—'],
    ['Proximo vencimiento', formatoAR(ficha.seguimiento.proximoVto) || 'Sin plazos'],
  ];

  for (let i = 0; i < datos.length; i += 1) {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = 40 + col * 260;
    doc.fillColor(GRIS).fontSize(8).text(datos[i][0], x, y + fila * 15);
    doc.fillColor('#000000').fontSize(9).text(datos[i][1], x + 95, y + fila * 15, {
      width: 155,
      ellipsis: true,
    });
  }
  y += Math.ceil(datos.length / 2) * 15 + 14;

  // --- Economia ---
  doc.rect(40, y, doc.page.width - 80, 50).fill('#f2f6f4');
  const eco = [
    ['Honorarios del cliente', pesos(ficha.economia.honorariosDelCliente)],
    ['Cobrado del cliente', pesos(ficha.economia.cobradoDelCliente)],
    ['Saldo del cliente', pesos(ficha.economia.saldoDelCliente)],
    ['Gastos de la causa', pesos(ficha.economia.gastosDeLaCausa)],
  ];
  const anchoEco = (doc.page.width - 80) / eco.length;
  for (let i = 0; i < eco.length; i += 1) {
    const x = 40 + i * anchoEco;
    doc.fillColor(GRIS).fontSize(7.5).text(eco[i][0], x, y + 10, { width: anchoEco, align: 'center' });
    doc.fillColor(VERDE).fontSize(10.5).text(eco[i][1], x, y + 25, { width: anchoEco, align: 'center' });
  }
  y += 64;

  // --- Movimientos ---
  doc.fillColor(VERDE).fontSize(11).text('DETALLE DE MOVIMIENTOS', 40, y);
  y += 18;

  const columnas = [
    { titulo: 'Fecha', ancho: 58 },
    { titulo: 'Tipo', ancho: 85 },
    { titulo: 'Descripcion', ancho: 190 },
    { titulo: 'Responsable', ancho: 90 },
    { titulo: 'Situacion', ancho: 92 },
  ];

  y = filaTabla(
    doc,
    columnas,
    columnas.map((c) => c.titulo),
    y,
    { fondo: VERDE, colorTexto: '#ffffff', tamano: 8 }
  );

  let alterna = false;
  for (const m of ficha.movimientos) {
    y = asegurarEspacio(doc, y, 20);
    y = filaTabla(
      doc,
      columnas,
      [
        formatoAR(m.fechaVto),
        m.tipo || '—',
        m.descripcion,
        m.responsable || '—',
        m.situacionEtiqueta + (m.diasTexto && m.diasTexto !== '—' ? ' (' + m.diasTexto + ')' : ''),
      ],
      y,
      { fondo: alterna ? '#f7f7f7' : null }
    );
    alterna = !alterna;
  }

  if (ficha.movimientos.length === 0) {
    doc.fontSize(9).fillColor(GRIS).text('Sin movimientos registrados.', 43, y + 4);
  }

  pie(doc);
  doc.end();
}
