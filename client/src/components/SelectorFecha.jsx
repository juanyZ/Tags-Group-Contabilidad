/**
 * Selector de fecha con calendario propio, en reemplazo del <input type="date">
 * nativo (cuyo look varia entre navegadores y no sigue el sistema visual).
 *
 * Valor y onChange siempre en formato ISO ('aaaa-mm-dd'), igual que el input
 * nativo al que reemplaza — asi no hay que tocar los formularios que lo usan.
 */
import { useEffect, useRef, useState } from 'react';
import { fecha as formatearCorta, MESES } from '../lib/formato.js';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'];

function aUTC(iso) {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [anio, mes, dia] = s.split('-').map(Number);
  if (!anio || !mes || !dia) return null;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function aISO(d) {
  return d.toISOString().slice(0, 10);
}

function hoyUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Las 42 celdas (6 semanas) que arrancan el lunes de la semana del dia 1. */
function celdasDelMes(anio, mes) {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const corrimiento = (primero.getUTCDay() + 6) % 7; // 0 = lunes
  const celdas = [];
  for (let i = 0; i < 42; i++) {
    celdas.push(new Date(Date.UTC(anio, mes, 1 - corrimiento + i)));
  }
  return celdas;
}

export function SelectorFecha({
  valor,
  onChange,
  placeholder,
  obligatorio,
  disabled,
  id,
}) {
  const [abierto, setAbierto] = useState(false);
  const seleccionada = aUTC(valor);
  const hoy = hoyUTC();
  const [vista, setVista] = useState(seleccionada || hoy);
  const cajaRef = useRef(null);

  useEffect(() => {
    if (seleccionada) setVista(seleccionada);
  }, [valor]);

  useEffect(() => {
    if (!abierto) return undefined;
    function alClickAfuera(e) {
      if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierto(false);
    }
    function alEscape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', alClickAfuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alClickAfuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierto]);

  const anio = vista.getUTCFullYear();
  const mes = vista.getUTCMonth();
  const celdas = celdasDelMes(anio, mes);
  const isoHoy = aISO(hoy);
  const isoSeleccionado = seleccionada ? aISO(seleccionada) : null;

  function elegir(d) {
    onChange(aISO(d));
    setAbierto(false);
  }

  return (
    <div className={'selector-fecha' + (abierto ? ' abierto' : '')} ref={cajaRef}>
      <button
        type="button"
        id={id}
        className="selector-fecha-boton"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className={valor ? '' : 'vacio'}>
          {valor ? formatearCorta(valor) : placeholder || 'Elegir fecha'}
        </span>
        <svg
          className="selector-fecha-icono"
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="2.5" x2="8" y2="6.5" />
          <line x1="16" y1="2.5" x2="16" y2="6.5" />
        </svg>
      </button>

      {abierto ? (
        <div className="selector-fecha-panel" role="dialog" aria-label="Elegir fecha">
          <div className="selector-fecha-cabecera">
            <button
              type="button"
              className="selector-fecha-nav"
              aria-label="Mes anterior"
              onClick={() => setVista(new Date(Date.UTC(anio, mes - 1, 1)))}
            >
              ‹
            </button>
            <strong>
              {MESES[mes]} {anio}
            </strong>
            <button
              type="button"
              className="selector-fecha-nav"
              aria-label="Mes siguiente"
              onClick={() => setVista(new Date(Date.UTC(anio, mes + 1, 1)))}
            >
              ›
            </button>
          </div>

          <div className="selector-fecha-grilla">
            {DIAS.map((d) => (
              <span key={d} className="selector-fecha-dia-nombre">
                {d}
              </span>
            ))}
            {celdas.map((d) => {
              const iso = aISO(d);
              return (
                <button
                  type="button"
                  key={iso}
                  className={
                    'selector-fecha-celda' +
                    (d.getUTCMonth() === mes ? '' : ' fuera-de-mes') +
                    (iso === isoHoy ? ' es-hoy' : '') +
                    (iso === isoSeleccionado ? ' seleccionado' : '')
                  }
                  onClick={() => elegir(d)}
                >
                  {d.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className="selector-fecha-pie">
            <button type="button" className="selector-fecha-accion" onClick={() => elegir(hoy)}>
              Hoy
            </button>
            {valor && !obligatorio ? (
              <button
                type="button"
                className="selector-fecha-accion"
                onClick={() => {
                  onChange(null);
                  setAbierto(false);
                }}
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
