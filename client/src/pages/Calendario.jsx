/**
 * CALENDARIO: listado ordenado por urgencia (izquierda) y grilla del mes
 * (derecha). Las dos vistas salen del mismo feed del backend, así que no puede
 * pasar que una muestre algo que la otra no.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla } from '../components/Tabla.jsx';
import { Panel, Vacio, SemaforoConDias, Cargando, ErrorCarga } from '../components/Comunes.jsx';
import { useAbogados } from '../hooks/useDatos.js';
import { fecha, MESES } from '../lib/formato.js';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Color del punto de cada evento en la grilla, según su situación. */
const COLOR = {
  HISTORICO: 'var(--neutro)',
  VENCIDO: 'var(--rojo)',
  VENCE_HOY: 'var(--naranja)',
  POR_VENCER: 'var(--amarillo)',
  EN_FECHA: 'var(--verde)',
  CUMPLIDO: 'var(--cian)',
  CANCELADO: 'var(--neutro)',
  SIN_FECHA: 'var(--neutro)',
};

export function Calendario() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [soloDelMes, setSoloDelMes] = useState(false);
  const [responsableId, setResponsableId] = useState('');

  const abogados = useAbogados();

  const paramsListado = {
    responsableId: responsableId || undefined,
    anio: soloDelMes ? anio : undefined,
    mes: soloDelMes ? mes : undefined,
  };

  const listado = useQuery({
    queryKey: ['calendario', 'listado', paramsListado],
    queryFn: () => get('/calendario', paramsListado),
  });

  const grilla = useQuery({
    queryKey: ['calendario', 'mes', anio, mes, responsableId],
    queryFn: () => get('/calendario/mes', { anio, mes, responsableId: responsableId || undefined }),
  });

  function moverMes(delta) {
    let m = mes + delta;
    let a = anio;
    if (m < 1) {
      m = 12;
      a -= 1;
    } else if (m > 12) {
      m = 1;
      a += 1;
    }
    setMes(m);
    setAnio(a);
  }

  return (
    <>
      <Cabecera
        titulo="Calendario de vencimientos"
        subtitulo="Puntuales y recurrentes unificados: lo más urgente arriba, lo cumplido al fondo"
      >
        <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
          <option value="">Todos los responsables</option>
          {(abogados.data || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      </Cabecera>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 6fr)' }}>
        {/* --- Listado ordenado por urgencia --- */}
        <Panel
          titulo="Próximos vencimientos"
          icono="⚑"
          sinPadding
          acciones={
            <label className="fila chico gris" style={{ gap: 6, cursor: 'pointer', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={soloDelMes}
                onChange={(e) => setSoloDelMes(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--oro)' }}
              />
              Solo el mes del calendario
            </label>
          }
        >
          <div style={{ maxHeight: 620, overflowY: 'auto' }}>
            <Tabla
              consulta={listado}
              filas={listado.data ? listado.data.items : []}
              claveFila={(f) => f.origen + '-' + f.id + '-' + f.fechaVto}
              vacio={<Vacio titulo="No hay vencimientos en el rango elegido" />}
              columnas={[
                {
                  clave: 'origen',
                  titulo: '',
                  ancho: 34,
                  render: (f) => (
                    <span
                      title={f.origen === 'RECURRENTE' ? 'Evento recurrente' : 'Evento puntual'}
                      className="oro"
                    >
                      {f.origen === 'RECURRENTE' ? '⟳' : '⚑'}
                    </span>
                  ),
                },
                {
                  clave: 'fechaVto',
                  titulo: 'Fecha',
                  ancho: 94,
                  render: (f) => (
                    <div>
                      <div className="mono">{fecha(f.fechaVto)}</div>
                      {f.hora ? <div className="chico oro">{f.hora}</div> : null}
                    </div>
                  ),
                },
                {
                  clave: 'descripcion',
                  titulo: 'Qué hay que hacer',
                  render: (f) => (
                    <div>
                      <span className="truncar" style={{ maxWidth: 260 }}>
                        {f.descripcion}
                      </span>
                      <span className="chico gris truncar" style={{ maxWidth: 260 }}>
                        {f.expediente || f.cliente || 'Evento del estudio'}
                      </span>
                    </div>
                  ),
                },
                {
                  clave: 'situacion',
                  titulo: 'Situación',
                  ancho: 180,
                  render: (f) => <SemaforoConDias item={f} />,
                },
              ]}
            />
          </div>
        </Panel>

        {/* --- Grilla del mes --- */}
        <Panel
          titulo={'Mes de ' + MESES[mes - 1] + ' ' + anio}
          icono="▤"
          sinPadding
          acciones={
            <span className="fila" style={{ gap: 5 }}>
              <button type="button" className="btn btn-sutil btn-chico" onClick={() => moverMes(-1)}>
                ‹
              </button>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                style={{ padding: '2px 6px', fontSize: 12 }}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                style={{ padding: '2px 6px', fontSize: 12 }}
              >
                {[anio - 2, anio - 1, anio, anio + 1, anio + 2].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sutil btn-chico" onClick={() => moverMes(1)}>
                ›
              </button>
            </span>
          }
        >
          {grilla.isLoading ? <Cargando /> : null}
          {grilla.isError ? <ErrorCarga error={grilla.error} onReintentar={grilla.refetch} /> : null}
          {grilla.data ? <GrillaMes datos={grilla.data} /> : null}
        </Panel>
      </div>

      <div className="fila chico gris" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <span>Referencias:</span>
        <span className="badge VENCIDO">Vencido</span>
        <span className="badge VENCE_HOY">Vence hoy</span>
        <span className="badge POR_VENCER">Por vencer</span>
        <span className="badge EN_FECHA">En fecha</span>
        <span className="badge CUMPLIDO">Cumplido</span>
        <span className="badge HISTORICO">Ocurrencia pasada</span>
        <span className="oro">⟳ recurrente</span>
        <span className="oro">⚑ puntual</span>
      </div>
    </>
  );
}

function GrillaMes({ datos }) {
  const MAX_POR_DIA = 4;

  return (
    <div className="calendario">
      {DIAS_SEMANA.map((d) => (
        <div key={d} className="cabecera-dia">
          {d}
        </div>
      ))}

      {datos.semanas.map((semana) =>
        semana.map((dia) => (
          <div
            key={dia.fecha}
            className={
              'dia' +
              (dia.esDelMes ? '' : ' fuera-mes') +
              (dia.esHoy ? ' hoy' : '') +
              (dia.tieneVencido ? ' con-vencido' : '')
            }
          >
            <div className="numero">{dia.dia}</div>

            {dia.eventos.slice(0, MAX_POR_DIA).map((ev) => (
              <div
                key={ev.origen + '-' + ev.id + '-' + ev.fechaVto}
                className="evento"
                title={
                  (ev.hora ? ev.hora + ' · ' : '') +
                  ev.descripcion +
                  (ev.expediente ? ' — ' + ev.expediente : '') +
                  ' (' + ev.situacionEtiqueta + ')'
                }
              >
                <span
                  className="punto"
                  style={{ background: COLOR[ev.situacion] || 'var(--neutro)' }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.origen === 'RECURRENTE' ? '⟳ ' : ''}
                  {ev.descripcion}
                </span>
              </div>
            ))}

            {dia.cantidad > MAX_POR_DIA ? (
              <div className="mas">+{dia.cantidad - MAX_POR_DIA} más</div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
