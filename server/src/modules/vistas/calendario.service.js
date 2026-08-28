/**
 * CALENDARIO: el listado ordenado y la grilla del mes.
 *
 * Las dos vistas salen del mismo feed unificado, asi que no puede pasar que la
 * grilla muestre un evento que el listado no tiene.
 */
import { hoyISO, primerDiaDelMes, ultimoDiaDelMes, sumarDias, diaSemana, aISO } from '../../utils/fechas.js';
import { parametrosVencimientos } from '../config/config.service.js';
import { feedUnificado } from './unificado.service.js';

/**
 * Listado de vencimientos ordenado por urgencia.
 *
 * Sin rango de fechas trae todos los pendientes mas los recurrentes de los
 * proximos meses. Con `mes`/`anio` se acota a ese mes, que es el interruptor
 * "mostrar solo lo que vence en el mes del calendario" de la planilla.
 */
export async function listado(consulta) {
  const params = await parametrosVencimientos();
  const hoy = hoyISO();

  let desde = consulta.desde || null;
  let hasta = consulta.hasta || null;
  // Los recurrentes se proyectan desde hoy salvo que se pida un mes concreto.
  let desdeRecurrentes = hoy;

  if (consulta.mes && consulta.anio) {
    // Interruptor "mostrar solo lo que vence en el mes del calendario".
    desde = primerDiaDelMes(consulta.anio, consulta.mes);
    hasta = ultimoDiaDelMes(consulta.anio, consulta.mes);
    desdeRecurrentes = desde;
  } else if (!hasta) {
    // Vista por defecto: los puntuales SIN piso hacia atras (un plazo vencido
    // no deja de importar por viejo) y hacia adelante la ventana configurada.
    hasta = sumarDias(hoy, Math.max(params.ventanaProximos, 60));
  }

  const items = await feedUnificado(
    {
      desde,
      hasta,
      desdeRecurrentes,
      responsableId: consulta.responsableId,
      soloPendientes: consulta.soloPendientes,
    },
    { hoy, umbralDias: params.umbralDias }
  );

  return { hoy, umbralDias: params.umbralDias, items };
}

/**
 * Grilla mensual de lunes a domingo.
 *
 * Devuelve semanas completas, incluidos los dias del mes anterior y siguiente
 * que caen en la primera y ultima semana, para que la grilla siempre tenga
 * filas parejas de siete celdas.
 */
export async function grillaMensual(anio, mes, consulta) {
  const params = await parametrosVencimientos();
  const hoy = hoyISO();

  const primero = primerDiaDelMes(anio, mes);
  const ultimo = ultimoDiaDelMes(anio, mes);

  // Se retrocede hasta el lunes anterior (o el mismo, si el 1 cae lunes).
  const diaSemanaPrimero = diaSemana(primero); // 0=domingo
  const retroceso = diaSemanaPrimero === 0 ? 6 : diaSemanaPrimero - 1;
  const inicioGrilla = sumarDias(primero, -retroceso);

  const diaSemanaUltimo = diaSemana(ultimo);
  const avance = diaSemanaUltimo === 0 ? 0 : 7 - diaSemanaUltimo;
  const finGrilla = sumarDias(ultimo, avance);

  const items = await feedUnificado(
    {
      desde: inicioGrilla,
      hasta: finGrilla,
      responsableId: consulta ? consulta.responsableId : undefined,
    },
    { hoy, umbralDias: params.umbralDias }
  );

  // Se agrupan por dia. Un Map por fecha evita recorrer la lista entera por
  // cada una de las ~42 celdas de la grilla.
  const porDia = new Map();
  for (const item of items) {
    const f = aISO(item.fechaVto);
    if (!f) continue;
    if (!porDia.has(f)) porDia.set(f, []);
    porDia.get(f).push(item);
  }

  const semanas = [];
  let semanaActual = [];
  let cursor = inicioGrilla;

  while (cursor <= finGrilla) {
    const eventosDelDia = porDia.get(cursor) || [];

    semanaActual.push({
      fecha: cursor,
      dia: Number(cursor.slice(8, 10)),
      esDelMes: cursor >= primero && cursor <= ultimo,
      esHoy: cursor === hoy,
      // Un dia se pinta en rojo si tiene algo vencido sin cumplir.
      tieneVencido: eventosDelDia.some((e) => e.situacion === 'VENCIDO'),
      cantidad: eventosDelDia.length,
      eventos: eventosDelDia,
    });

    if (semanaActual.length === 7) {
      semanas.push(semanaActual);
      semanaActual = [];
    }
    cursor = sumarDias(cursor, 1);
  }

  if (semanaActual.length > 0) semanas.push(semanaActual);

  return {
    anio,
    mes,
    hoy,
    desde: inicioGrilla,
    hasta: finGrilla,
    semanas,
    totalEventos: items.length,
  };
}
