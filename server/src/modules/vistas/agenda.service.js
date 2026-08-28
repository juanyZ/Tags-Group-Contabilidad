/**
 * AGENDA SEMANAL: una tarjeta por dia, de lunes a domingo.
 *
 * Igual que en la planilla, se muestran hasta 14 dias. El tope no es un
 * capricho: con mas tarjetas la vista deja de leerse "de un golpe", que es
 * justamente para lo que sirve.
 */
import { hoyISO, aISO, diffDias, sumarDias, rangoDias, formatoAR } from '../../utils/fechas.js';
import { parametrosVencimientos } from '../config/config.service.js';
import { feedUnificado } from './unificado.service.js';

const MAX_DIAS = 14;

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

/**
 * @param {object} consulta { desde, hasta, responsableId }
 */
export async function agenda(consulta) {
  const params = await parametrosVencimientos();
  const hoy = hoyISO();

  const desde = aISO(consulta.desde) || hoy;
  let hasta = aISO(consulta.hasta) || sumarDias(desde, 6);

  // Si el rango pedido excede los 14 dias se recorta y se avisa, en vez de
  // devolver una pantalla gigante o un error.
  const solicitados = diffDias(desde, hasta) + 1;
  let recortado = false;
  if (solicitados > MAX_DIAS) {
    hasta = sumarDias(desde, MAX_DIAS - 1);
    recortado = true;
  }

  const items = await feedUnificado(
    { desde, hasta, desdeRecurrentes: desde, responsableId: consulta.responsableId },
    { hoy, umbralDias: params.umbralDias }
  );

  const porDia = new Map();
  for (const item of items) {
    const f = aISO(item.fechaVto);
    if (!f) continue;
    if (!porDia.has(f)) porDia.set(f, []);
    porDia.get(f).push(item);
  }

  const dias = rangoDias(desde, hasta, MAX_DIAS).map((fecha) => {
    const eventos = porDia.get(fecha) || [];
    const d = new Date(fecha + 'T00:00:00.000Z').getUTCDay();

    return {
      fecha,
      fechaCorta: fecha.slice(8, 10) + '/' + fecha.slice(5, 7),
      fechaLarga: formatoAR(fecha),
      nombreDia: NOMBRES_DIA[d],
      esHoy: fecha === hoy,
      esFinDeSemana: d === 0 || d === 6,
      cantidad: eventos.length,
      tieneVencido: eventos.some((e) => e.situacion === 'VENCIDO'),
      // Dentro del dia se ordena por hora: los eventos con horario primero,
      // que es como se recorre una jornada.
      eventos: eventos.slice().sort((a, b) => {
        const ha = a.hora || '99:99';
        const hb = b.hora || '99:99';
        return ha < hb ? -1 : ha > hb ? 1 : 0;
      }),
    };
  });

  return {
    desde,
    hasta,
    hoy,
    recortado,
    diasSolicitados: solicitados,
    maxDias: MAX_DIAS,
    totalEventos: items.length,
    dias,
  };
}
