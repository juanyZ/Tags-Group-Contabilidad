/**
 * AGENDA SEMANAL: una tarjeta por día, de lunes a domingo.
 * Es la vista para arrancar la semana: se ve de un golpe qué día está cargado.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Panel, Cargando, ErrorCarga, Aviso } from '../components/Comunes.jsx';
import { SelectorFecha } from '../components/SelectorFecha.jsx';
import { useAbogados } from '../hooks/useDatos.js';
import { SelectorFlotante } from '../components/Campos.jsx';
import { hoyISO, lunesDe, sumarDias, fecha } from '../lib/formato.js';

export function Agenda() {
  const lunes = lunesDe(hoyISO());
  const [desde, setDesde] = useState(lunes);
  const [hasta, setHasta] = useState(sumarDias(lunes, 13));
  const [responsableId, setResponsableId] = useState('');

  const abogados = useAbogados();

  const consulta = useQuery({
    queryKey: ['agenda', desde, hasta, responsableId],
    queryFn: () => get('/agenda', { desde, hasta, responsableId: responsableId || undefined }),
  });

  function mover(dias) {
    setDesde(sumarDias(desde, dias));
    setHasta(sumarDias(hasta, dias));
  }

  function estaSemana() {
    const l = lunesDe(hoyISO());
    setDesde(l);
    setHasta(sumarDias(l, 13));
  }

  return (
    <>
      <Cabecera
        titulo="Agenda semanal"
        subtitulo="Una tarjeta por día con todo lo que hay para hacer. Se muestran hasta 14 días."
      >
        <button type="button" className="btn btn-chico" onClick={() => mover(-7)}>
          ‹ Semana anterior
        </button>
        <button type="button" className="btn btn-chico" onClick={estaSemana}>
          Esta semana
        </button>
        <button type="button" className="btn btn-chico" onClick={() => mover(7)}>
          Semana siguiente ›
        </button>
      </Cabecera>

      <div className="filtros">
        <label className="fila chico gris" style={{ gap: 6 }}>
          Desde
          <SelectorFecha valor={desde} onChange={(v) => setDesde(v)} />
        </label>
        <label className="fila chico gris" style={{ gap: 6 }}>
          hasta
          <SelectorFecha valor={hasta} onChange={(v) => setHasta(v)} />
        </label>
        <SelectorFlotante label="Responsable" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
          <option value="">Todos los responsables</option>
          {(abogados.data || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </SelectorFlotante>
      </div>

      {consulta.isLoading ? <Cargando /> : null}
      {consulta.isError ? <ErrorCarga error={consulta.error} onReintentar={consulta.refetch} /> : null}

      {consulta.data ? (
        <>
          {consulta.data.recortado ? (
            <Aviso>
              <span>ⓘ</span>
              <span>
                Pediste {consulta.data.diasSolicitados} días y la agenda muestra hasta{' '}
                {consulta.data.maxDias}. Se están mostrando del {fecha(consulta.data.desde)} al{' '}
                {fecha(consulta.data.hasta)}. Para ver el resto, corré la fecha «desde».
              </span>
            </Aviso>
          ) : null}

          <Panel
            titulo={
              'Del ' +
              fecha(consulta.data.desde) +
              ' al ' +
              fecha(consulta.data.hasta) +
              ' · ' +
              consulta.data.totalEventos +
              ' evento(s)'
            }
            icono="☰"
          >
            <div className="agenda">
              {consulta.data.dias.map((dia) => (
                <TarjetaDia key={dia.fecha} dia={dia} />
              ))}
            </div>
          </Panel>

          <div className="fila chico gris" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <span>Referencias:</span>
            <span>la hora adelante = evento puntual con horario</span>
            <span className="oro">⟳ recurrente</span>
            <span className="verde">✓ ya cumplido</span>
            <span>el día de hoy va en dorado</span>
          </div>
        </>
      ) : null}
    </>
  );
}

function TarjetaDia({ dia }) {
  return (
    <div className={'tarjeta-dia' + (dia.esHoy ? ' es-hoy' : '')}>
      <div className="cabecera">
        <div className="nombre">{dia.nombreDia}</div>
        <div className="fecha">{dia.fechaCorta}</div>
      </div>

      <div className={'contador' + (dia.cantidad === 0 ? ' vacio' : '')}>
        {dia.cantidad === 0
          ? '— sin eventos —'
          : dia.cantidad + (dia.cantidad === 1 ? ' evento' : ' eventos')}
      </div>

      <div className="lista">
        {dia.eventos.map((ev) => (
          <div
            key={ev.origen + '-' + ev.id + '-' + ev.fechaVto}
            className="item"
            style={{
              borderLeftColor:
                ev.situacion === 'VENCIDO'
                  ? 'var(--rojo)'
                  : ev.situacion === 'VENCE_HOY'
                    ? 'var(--naranja)'
                    : ev.situacion === 'CUMPLIDO'
                      ? 'var(--cian)'
                      : 'var(--linea-fuerte)',
            }}
            title={ev.expediente || ev.cliente || 'Evento del estudio'}
          >
            {ev.cumplido ? <span className="verde">✓ </span> : null}
            {ev.origen === 'RECURRENTE' ? <span className="oro">⟳ </span> : null}
            {ev.hora ? <span className="hora">{ev.hora} </span> : null}
            {ev.descripcion}
          </div>
        ))}
      </div>
    </div>
  );
}
