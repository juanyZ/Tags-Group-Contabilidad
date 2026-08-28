/**
 * Feed unificado de vencimientos: eventos puntuales + ocurrencias proyectadas
 * de los recurrentes, en una sola lista con el mismo semaforo.
 *
 * Lo comparten el calendario (listado y grilla mensual) y la agenda semanal.
 * Es la pieza que evita que cada vista arme su propia mezcla y termine
 * mostrando cosas distintas.
 */
import { prisma } from '../../config/prisma.js';
import { aISO } from '../../utils/fechas.js';
import { decorarVencimiento, ordenarPorUrgencia } from '../../services/semaforo.service.js';
import { ocurrenciasEnRango, claveCumplimiento } from '../../services/recurrentes.service.js';
import { soloVivos } from '../../lib/consultas.js';

/**
 * Trae los eventos puntuales de un rango (o todos los pendientes si no se
 * indica rango) ya normalizados a la forma comun del feed.
 */
async function puntuales(opciones) {
  const where = Object.assign({}, soloVivos());

  if (opciones.desde || opciones.hasta) {
    where.fechaVto = {};
    if (opciones.desde) where.fechaVto.gte = new Date(opciones.desde + 'T00:00:00.000Z');
    if (opciones.hasta) where.fechaVto.lte = new Date(opciones.hasta + 'T00:00:00.000Z');
  }

  if (opciones.responsableId) where.responsableId = opciones.responsableId;
  if (opciones.expedienteId) where.expedienteId = opciones.expedienteId;

  const filas = await prisma.eventoPuntual.findMany({
    where,
    include: {
      tipo: { select: { valor: true } },
      responsable: { select: { id: true, nombre: true } },
      expediente: {
        select: {
          id: true,
          codigo: true,
          caratula: true,
          cliente: { select: { id: true, nombre: true } },
        },
      },
    },
    // Tope defensivo: un rango absurdo no puede traer la tabla entera.
    take: 2000,
  });

  return filas.map((ev) => ({
    origen: 'PUNTUAL',
    id: ev.id,
    codigo: ev.codigo,
    fechaVto: aISO(ev.fechaVto),
    hora: ev.hora,
    tipo: ev.tipo ? ev.tipo.valor : null,
    descripcion: ev.descripcion,
    expedienteId: ev.expedienteId,
    expediente: ev.expediente ? ev.expediente.caratula : null,
    clienteId: ev.expediente && ev.expediente.cliente ? ev.expediente.cliente.id : null,
    cliente: ev.expediente && ev.expediente.cliente ? ev.expediente.cliente.nombre : null,
    responsableId: ev.responsableId,
    responsable: ev.responsable ? ev.responsable.nombre : null,
    prioridad: ev.prioridad,
    estado: ev.estado,
    cumplido: ev.estado === 'CUMPLIDO',
    cancelado: ev.estado === 'CANCELADO',
  }));
}

/**
 * Proyecta los recurrentes activos sobre el rango pedido.
 * Un recurrente puede aportar varias filas al feed (por ejemplo, cuatro o
 * cinco ocurrencias de la reunion semanal dentro de un mes).
 */
async function recurrentesProyectados(opciones) {
  // Los recurrentes necesitan un rango CERRADO para proyectarse (son infinitos
  // hacia adelante). Los puntuales, en cambio, pueden pedirse sin piso: un
  // plazo vencido de hace tres meses tiene que seguir apareciendo. Por eso el
  // rango de los recurrentes se puede fijar aparte con `desdeRecurrentes`.
  const desde = opciones.desdeRecurrentes || opciones.desde;
  if (!desde || !opciones.hasta) return [];

  const where = Object.assign({ activo: true }, soloVivos());
  if (opciones.responsableId) where.responsableId = opciones.responsableId;

  const filas = await prisma.eventoRecurrente.findMany({
    where,
    include: {
      tipo: { select: { valor: true } },
      responsable: { select: { id: true, nombre: true } },
      cumplimientos: { select: { periodoClave: true } },
    },
    take: 500,
  });

  const proyectados = [];

  for (const rec of filas) {
    const cumplidas = new Set(rec.cumplimientos.map((c) => c.periodoClave));
    const ocurrencias = ocurrenciasEnRango(rec.fechaBase, rec.periodicidad, desde, opciones.hasta);

    for (const fecha of ocurrencias) {
      const clave = claveCumplimiento(fecha);
      const cumplida = cumplidas.has(clave);

      // Una ocurrencia YA PASADA y sin tilde no es un plazo incumplido: es una
      // proyeccion sobre la que el sistema no tiene informacion. Si se marcara
      // vencida, la grilla del mes quedaria roja hasta el dia de hoy y el rojo
      // dejaria de significar algo. Ver SITUACION.HISTORICO.
      const historica = !cumplida && opciones.hoy && fecha < opciones.hoy;

      proyectados.push({
        origen: 'RECURRENTE',
        // Id compuesto: un recurrente aporta varias filas y cada una necesita
        // una clave propia para React y para el endpoint de cumplimiento.
        id: rec.id,
        claveFila: 'REC-' + rec.id + '-' + clave,
        codigo: rec.codigo,
        fechaVto: fecha,
        hora: null,
        tipo: rec.tipo ? rec.tipo.valor : null,
        descripcion: rec.descripcion,
        expedienteId: null,
        expediente: null,
        clienteId: null,
        // Los recurrentes no son de una causa: son del estudio.
        cliente: 'evento del estudio',
        responsableId: rec.responsableId,
        responsable: rec.responsable ? rec.responsable.nombre : null,
        prioridad: 'MEDIA',
        periodicidad: rec.periodicidad,
        periodoClave: clave,
        estado: cumplida ? 'CUMPLIDO' : historica ? 'HISTORICO' : 'PENDIENTE',
        cumplido: cumplida,
        cancelado: false,
        historico: historica,
      });
    }
  }

  return proyectados;
}

/**
 * Feed completo, decorado con el semaforo y ordenado por urgencia.
 *
 * @param {object} opciones { desde, hasta, responsableId, expedienteId,
 *                            incluirRecurrentes, soloPendientes }
 * @param {object} ctx      { hoy, umbralDias }
 */
export async function feedUnificado(opciones, ctx) {
  const incluirRecurrentes = opciones.incluirRecurrentes !== false;

  const [listaPuntuales, listaRecurrentes] = await Promise.all([
    puntuales(opciones),
    incluirRecurrentes
      ? recurrentesProyectados(Object.assign({ hoy: ctx.hoy }, opciones))
      : Promise.resolve([]),
  ]);

  let todos = listaPuntuales.concat(listaRecurrentes);

  if (opciones.soloPendientes) {
    // Las ocurrencias historicas tampoco son "pendientes": ya pasaron y nadie
    // puede hacerlas. Dejarlas seria llenar la lista de trabajo imposible.
    todos = todos.filter((e) => !e.cumplido && !e.cancelado && !e.historico);
  }

  const decorados = todos.map((e) =>
    decorarVencimiento(e, { hoy: ctx.hoy, umbralDias: ctx.umbralDias })
  );

  return ordenarPorUrgencia(decorados);
}

export { puntuales as eventosPuntualesDelRango, recurrentesProyectados };
