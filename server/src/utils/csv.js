/**
 * Generacion de CSV.
 *
 * Dos detalles que no son obvios y que importan:
 *
 * 1. INYECCION DE FORMULAS (CSV injection). Si una celda empieza con =, +, -,
 *    @, TAB o CR, Excel y Google Sheets la interpretan como formula al abrir
 *    el archivo. Un cliente llamado "=HYPERLINK(...)" se convierte en un
 *    ataque contra la maquina de quien abre el export. Se neutraliza
 *    anteponiendo una comilla simple.
 *
 * 2. BOM UTF-8. Sin el, Excel en Windows abre el archivo en ANSI y los
 *    acentos y la enie salen rotos.
 *
 * No se usa ninguna dependencia: son treinta lineas y evitan sumar un paquete.
 */

const CARACTERES_PELIGROSOS = /^[=+\-@\t\r]/;

function escaparCelda(valor) {
  if (valor == null) return '';

  let texto = String(valor);

  // 1) Neutralizar formulas.
  if (CARACTERES_PELIGROSOS.test(texto)) {
    texto = "'" + texto;
  }

  // 2) Comillas, punto y coma y saltos de linea obligan a entrecomillar.
  if (/[";\n\r]/.test(texto)) {
    texto = '"' + texto.replace(/"/g, '""') + '"';
  }

  return texto;
}

/**
 * Arma un CSV.
 *
 * @param {Array<{clave: string, titulo: string}>} columnas
 * @param {Array<object>} filas
 * @returns {string} contenido listo para enviar, con BOM
 */
export function generarCSV(columnas, filas) {
  // Punto y coma como separador: es lo que espera Excel en configuracion
  // regional argentina, donde la coma es el separador decimal.
  const SEP = ';';

  const cabecera = columnas.map((c) => escaparCelda(c.titulo)).join(SEP);

  const cuerpo = filas
    .map((fila) => columnas.map((c) => escaparCelda(fila[c.clave])).join(SEP))
    .join('\r\n');

  return '﻿' + cabecera + '\r\n' + cuerpo + '\r\n';
}

/** Configura los headers de la respuesta para que el navegador descargue. */
export function enviarCSV(res, nombreArchivo, contenido) {
  const nombreSeguro = nombreArchivo.replace(/[^\w.\-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment; filename="' + nombreSeguro + '"');
  return res.send(contenido);
}

/** Formatea un numero para que Excel-AR lo lea como numero (coma decimal). */
export function numeroAR(valor) {
  if (valor == null) return '';
  return String(valor).replace('.', ',');
}
