/**
 * Componentes chicos que usan todas las pantallas.
 *
 * Estan juntos a proposito: son piezas de pocas lineas que siempre se importan
 * en grupo. Separarlas en once archivos agregaria ruido sin ganar nada.
 */
import { etiqueta, pesos, porcentaje } from '../lib/formato.js';

// ---------------------------------------------------------------------------
//  Semaforo
// ---------------------------------------------------------------------------

/**
 * Badge del semaforo. La situacion y su etiqueta vienen calculadas del
 * backend: aca solo se elige la clase CSS.
 */
export function Semaforo({ situacion, texto }) {
  if (!situacion) return <span className="gris">—</span>;
  return <span className={'badge ' + situacion}>{texto || etiqueta(situacion)}</span>;
}

/**
 * Situación + el texto de días ("3 días por vencer"), que es lo que se lee de
 * verdad. En columnas angostas el texto baja debajo del badge en vez de
 * recortarse: un "3 días por venc..." no le sirve a nadie.
 */
export function SemaforoConDias({ item }) {
  if (!item || !item.situacion) return <span className="gris">—</span>;
  return (
    <div className="semaforo-dias">
      <span className={'badge ' + item.situacion}>{item.situacionEtiqueta}</span>
      {item.diasTexto && item.diasTexto !== '—' ? (
        <span className="chico gris nowrap">{item.diasTexto}</span>
      ) : null}
    </div>
  );
}

export function Chip({ valor, clase }) {
  if (!valor) return <span className="gris">—</span>;
  return <span className={'chip ' + (clase || valor)}>{etiqueta(valor)}</span>;
}

// ---------------------------------------------------------------------------
//  Indicadores
// ---------------------------------------------------------------------------

export function Stat({ etiqueta: label, valor, pie, tono, icono }) {
  return (
    <div className={'stat ' + (tono || '')}>
      <div className="etiqueta">
        {icono ? <span>{icono}</span> : null}
        {label}
      </div>
      <div className="valor">{valor}</div>
      {pie ? <div className="pie">{pie}</div> : null}
    </div>
  );
}

export function Panel({ titulo, icono, acciones, children, sinPadding }) {
  return (
    <section className="panel">
      {titulo ? (
        <header className="panel-titulo">
          {icono ? <span>{icono}</span> : null}
          <span>{titulo}</span>
          {acciones ? <span className="fila-fin">{acciones}</span> : null}
        </header>
      ) : null}
      {sinPadding ? children : <div className="panel-cuerpo">{children}</div>}
    </section>
  );
}

/** Barra de avance con el porcentaje al lado. */
export function Progreso({ valor }) {
  const v = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className="fila" style={{ gap: 7 }}>
      <div className={'progreso' + (v >= 100 ? ' completo' : '')}>
        <div style={{ width: v + '%' }} />
      </div>
      <span className="chico mono nowrap">{porcentaje(v)}</span>
    </div>
  );
}

/** Importe alineado a la derecha, en rojo si hay saldo pendiente. */
export function Importe({ valor, resaltarSiPositivo }) {
  const n = Number(valor) || 0;
  const clase = resaltarSiPositivo && n > 0 ? 'rojo negrita' : '';
  return <span className={'mono ' + clase}>{pesos(n)}</span>;
}

// ---------------------------------------------------------------------------
//  Estados de la pantalla
// ---------------------------------------------------------------------------

export function Cargando({ texto }) {
  return (
    <div className="estado">
      <div className="spinner" />
      {texto || 'Cargando...'}
    </div>
  );
}

export function Vacio({ titulo, texto, accion }) {
  return (
    <div className="estado">
      <div className="icono-grande">◇</div>
      <div className="titulo">{titulo || 'No hay nada para mostrar'}</div>
      {texto ? <div>{texto}</div> : null}
      {accion ? <div style={{ marginTop: 14 }}>{accion}</div> : null}
    </div>
  );
}

export function ErrorCarga({ error, onReintentar }) {
  const mensaje = error && error.mensaje ? error.mensaje : 'No se pudieron cargar los datos';
  return (
    <div className="estado error">
      <div className="icono-grande">⚠</div>
      <div className="titulo">{mensaje}</div>
      {onReintentar ? (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-chico" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Aviso con ícono. Si el contenido es texto plano se le antepone el ícono que
 * corresponde al tipo; si ya viene armado con sus propios <span>, se respeta.
 * Así todas las llamadas viejas quedan bien sin tener que tocarlas una por una.
 */
const ICONO_AVISO = { error: '⚠', exito: '✓' };

export function Aviso({ tipo, children }) {
  if (!children) return null;
  const esTextoPlano = typeof children === 'string' || typeof children === 'number';
  return (
    <div className={'aviso ' + (tipo || '')}>
      {esTextoPlano ? (
        <>
          <span>{ICONO_AVISO[tipo] || 'ⓘ'}</span>
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Envuelve el ciclo cargando / error / vacio / contenido para no repetirlo en
 * cada pantalla.
 */
export function Contenido({ consulta, vacioSi, vacio, children }) {
  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError) return <ErrorCarga error={consulta.error} onReintentar={consulta.refetch} />;
  if (vacioSi) return vacio || <Vacio />;
  return children;
}
