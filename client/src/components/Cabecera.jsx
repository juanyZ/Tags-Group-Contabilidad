/**
 * Cabecera de pantalla: titulo, subtitulo y acciones a la derecha.
 * Mas el selector de periodo, que comparten el tablero, honorarios y gastos.
 */
import { useUI } from '../store/ui.js';
import { MESES } from '../lib/formato.js';
import { SelectorFlotante } from './Campos.jsx';

export function Cabecera({ titulo, subtitulo, children }) {
  return (
    <header className="topbar">
      <div>
        <h1>{titulo}</h1>
        {subtitulo ? <div className="subtitulo">{subtitulo}</div> : null}
      </div>
      {children ? <div className="topbar-derecha">{children}</div> : null}
    </header>
  );
}

/**
 * Selector de periodo: "todo el año" mas los doce meses, igual que la planilla.
 * El valor vive en el store, asi que se mantiene al cambiar de pantalla.
 */
export function SelectorPeriodo() {
  const anio = useUI((s) => s.anio);
  const mes = useUI((s) => s.mes);
  const setPeriodo = useUI((s) => s.setPeriodo);

  const actual = new Date().getFullYear();
  const anios = [];
  for (let a = actual + 1; a >= actual - 5; a -= 1) anios.push(a);

  return (
    <div className="fila" style={{ gap: 6 }}>
      <span className="chico gris nowrap">Período</span>
      <SelectorFlotante
        label="Mes"
        value={mes}
        onChange={(e) => setPeriodo(anio, Number(e.target.value))}
        style={{ minWidth: 130 }}
      >
        <option value={0}>Todo el año</option>
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </SelectorFlotante>
      <SelectorFlotante
        label="Año"
        value={anio}
        onChange={(e) => setPeriodo(Number(e.target.value), mes)}
        style={{ minWidth: 90 }}
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </SelectorFlotante>
    </div>
  );
}
