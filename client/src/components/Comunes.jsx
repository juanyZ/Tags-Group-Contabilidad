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

/**
 * Tarjeta de indicador.
 *
 * Todo lo que no sea `etiqueta` y `valor` es opcional, asi la forma corta
 * -que es como se usa en la mayoria de las pantallas- sigue siendo una linea.
 *
 *   icono     glifo dentro del circulo de color. Sin icono no hay circulo.
 *   tono      vencido | hoy | proximo | oro | verde. Pinta valor, icono,
 *             barra y la regla superior de un solo tiro.
 *   delta     variacion contra el periodo anterior. Numero, o el objeto
 *             { valor, texto, invertido }. `invertido` marca los casos donde
 *             subir es mala noticia (gastos, saldo a cobrar): el color sale
 *             del significado, no del signo.
 *   progreso  0-100. Dibuja la barra debajo del pie.
 *   cargando  esqueleto, para que la tarjeta ocupe su lugar antes del dato.
 */
export function Stat({
  etiqueta: label,
  valor,
  pie,
  tono,
  icono,
  delta,
  progreso,
  cargando,
}) {
  const clase = 'stat ' + (tono || '');

  if (cargando) {
    return (
      <div className={clase} aria-busy="true">
        <div className="stat-cabecera">
          <div className="stat-texto">
            <span className="stat-hueso etiqueta" />
            <span className="stat-hueso valor" />
          </div>
          {icono ? <div className="icono hueso" /> : null}
        </div>
        <div className="pie">
          <span className="stat-hueso pie" />
        </div>
      </div>
    );
  }

  const d = normalizarDelta(delta);

  return (
    <div className={clase}>
      <div className="stat-cabecera">
        <div className="stat-texto">
          <div className="etiqueta">{label}</div>
          <div className="valor">{valor}</div>
        </div>
        {/* aria-hidden: el glifo es decorativo, la etiqueta ya nombra el dato. */}
        {icono ? (
          <div className="icono" aria-hidden="true">
            {icono}
          </div>
        ) : null}
      </div>

      {d || pie ? (
        <div className="pie">
          {d ? (
            <span className={'stat-delta ' + d.clase}>
              <span aria-hidden="true">{d.flecha}</span>
              {d.texto}
            </span>
          ) : null}
          {pie ? <span>{pie}</span> : null}
        </div>
      ) : null}

      {progreso == null ? null : <Progreso valor={progreso} />}
    </div>
  );
}

/**
 * Resuelve la variacion a flecha, texto y color.
 *
 * El 0 se muestra como "sin cambios" y en gris: una flecha en un cambio nulo
 * hace pensar que algo se movio.
 */
function normalizarDelta(delta) {
  if (delta == null || delta === '') return null;
  const cfg = typeof delta === 'object' ? delta : { valor: delta };
  const n = Number(cfg.valor);
  if (!Number.isFinite(n)) return null;

  const sube = n > 0;
  const quieto = n === 0;
  const bueno = cfg.invertido ? !sube : sube;

  return {
    clase: quieto ? 'plano' : bueno ? 'bien' : 'mal',
    flecha: quieto ? '=' : sube ? '↑' : '↓',
    texto: cfg.texto || porcentaje(Math.abs(n)),
  };
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
