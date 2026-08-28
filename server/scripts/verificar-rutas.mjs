/**
 * Utilidad de desarrollo: construye la app y lista todos los endpoints
 * registrados. Sirve para verificar que el arbol de routers quedo bien armado
 * sin necesidad de levantar la base de datos.
 *
 *   node scripts/verificar-rutas.mjs
 */
import { crearApp } from '../src/app.js';

const app = crearApp();
const rutas = [];

function limpiarSegmento(regexp) {
  // Express guarda el prefijo del router como expresion regular. Se lo
  // convierte a algo legible quitando los metacaracteres.
  let s = regexp.source;
  s = s.split('\\/?(?=\\/|$)').join('');
  s = s.split('\\/').join('/');
  s = s.split('^').join('');
  s = s.split('$').join('');
  s = s.split('?').join('');
  s = s.split('=').join('');
  s = s.split('(').join('');
  s = s.split(')').join('');
  return s === '/' ? '' : s;
}

function walk(stack, prefijo) {
  for (const capa of stack) {
    if (capa.route) {
      for (const metodo of Object.keys(capa.route.methods)) {
        rutas.push(metodo.toUpperCase().padEnd(7) + prefijo + capa.route.path);
      }
    } else if (capa.name === 'router' && capa.handle && capa.handle.stack) {
      walk(capa.handle.stack, prefijo + limpiarSegmento(capa.regexp));
    }
  }
}

walk(app._router.stack, '');

console.log('OK: la aplicacion se construyo sin errores.');
console.log('Endpoints registrados: ' + rutas.length + '\n');
console.log(rutas.join('\n'));
