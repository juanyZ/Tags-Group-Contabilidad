/**
 * Utilidad de desarrollo: detecta importaciones declaradas y no usadas, e
 * importaciones repetidas del mismo módulo. Vite no avisa de esto porque no
 * rompe el build, pero ensucia el código.
 *
 *   node scripts/revisar-imports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(process.cwd(), 'src');

function archivos(dir) {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivos(completo));
    else if (/\.(jsx?|mjs)$/.test(entrada.name)) salida.push(completo);
  }
  return salida;
}

let problemas = 0;

for (const archivo of archivos(RAIZ)) {
  const codigo = fs.readFileSync(archivo, 'utf8');
  const relativo = path.relative(process.cwd(), archivo);

  const modulos = new Map();
  const importados = [];

  const re = /import\s+(?:([\w*\s{},$]+?)\s+from\s+)?['"]([^'"]+)['"]/g;
  let m = re.exec(codigo);
  while (m) {
    const clausula = m[1] || '';
    const desde = m[2];

    modulos.set(desde, (modulos.get(desde) || 0) + 1);

    // Nombres entre llaves, con soporte para "x as y".
    const llaves = clausula.match(/\{([^}]*)\}/);
    if (llaves) {
      for (const parte of llaves[1].split(',')) {
        const nombre = parte.trim().split(/\s+as\s+/).pop().trim();
        if (nombre) importados.push(nombre);
      }
    }
    // Import por defecto.
    const porDefecto = clausula.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
    if (porDefecto && !porDefecto.startsWith('*')) importados.push(porDefecto);

    m = re.exec(codigo);
  }

  // Se quitan las líneas de import antes de buscar los usos.
  const cuerpo = codigo.replace(/^\s*import\s.+?['"];?\s*$/gm, '');

  for (const nombre of importados) {
    const usos = new RegExp('\\b' + nombre.replace(/\$/g, '\\$') + '\\b').test(cuerpo);
    if (!usos) {
      console.log('  [sin usar] ' + relativo + ' -> ' + nombre);
      problemas += 1;
    }
  }

  for (const [desde, veces] of modulos) {
    if (veces > 1) {
      console.log('  [import repetido] ' + relativo + ' -> ' + desde + ' (' + veces + ' veces)');
      problemas += 1;
    }
  }
}

console.log(problemas === 0 ? '\nSin importaciones sobrantes.' : '\nTotal: ' + problemas + ' observacion(es).');
