/**
 * Campos de formulario.
 *
 * Se conserva del Excel la distincion visual entre lo que se CARGA y lo que se
 * CALCULA: los campos editables tienen fondo propio y borde solido; los
 * calculados van con borde punteado, en dorado y en solo lectura. Es la misma
 * convencion que ya conoce quien viene de la planilla.
 *
 * Todos aceptan `error` para pintar el mensaje que devolvio la validacion del
 * backend debajo del campo correspondiente.
 */

function Envoltura({ label, obligatorio, error, ayuda, calculado, ancho, children }) {
  return (
    <div
      className={
        'campo' + (error ? ' con-error' : '') + (calculado ? ' calculado' : '') + (ancho ? ' ancho-total' : '')
      }
    >
      {label ? (
        <label>
          {label}
          {obligatorio ? <span className="obligatorio">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <span className="error-campo">{error}</span> : null}
      {!error && ayuda ? <span className="ayuda">{ayuda}</span> : null}
    </div>
  );
}

export function Texto({ label, valor, onChange, error, ayuda, obligatorio, ancho, ...resto }) {
  return (
    <Envoltura label={label} obligatorio={obligatorio} error={error} ayuda={ayuda} ancho={ancho}>
      <input
        type="text"
        value={valor == null ? '' : valor}
        onChange={(e) => onChange(e.target.value)}
        {...resto}
      />
    </Envoltura>
  );
}

export function AreaTexto({ label, valor, onChange, error, ayuda, ancho, filas, ...resto }) {
  return (
    <Envoltura label={label} error={error} ayuda={ayuda} ancho={ancho}>
      <textarea
        rows={filas || 3}
        value={valor == null ? '' : valor}
        onChange={(e) => onChange(e.target.value)}
        {...resto}
      />
    </Envoltura>
  );
}

/** Fecha en formato ISO (lo que espera la API). El navegador la muestra local. */
export function Fecha({ label, valor, onChange, error, ayuda, obligatorio, ancho, ...resto }) {
  return (
    <Envoltura label={label} obligatorio={obligatorio} error={error} ayuda={ayuda} ancho={ancho}>
      <input
        type="date"
        value={valor ? String(valor).slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value || null)}
        {...resto}
      />
    </Envoltura>
  );
}

export function Hora({ label, valor, onChange, error, ayuda }) {
  return (
    <Envoltura label={label} error={error} ayuda={ayuda}>
      <input type="time" value={valor || ''} onChange={(e) => onChange(e.target.value || null)} />
    </Envoltura>
  );
}

/** Importe. Se envia como numero, no como texto con formato. */
export function Monto({ label, valor, onChange, error, ayuda, obligatorio, ancho }) {
  return (
    <Envoltura label={label} obligatorio={obligatorio} error={error} ayuda={ayuda} ancho={ancho}>
      <input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={valor == null || valor === '' ? '' : valor}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </Envoltura>
  );
}

export function Numero({ label, valor, onChange, error, ayuda, min, max }) {
  return (
    <Envoltura label={label} error={error} ayuda={ayuda}>
      <input
        type="number"
        min={min}
        max={max}
        value={valor == null || valor === '' ? '' : valor}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </Envoltura>
  );
}

/**
 * Desplegable.
 * @param opciones  [{ valor, texto }] o [{ id, nombre }] segun `claveValor`
 */
export function Selector({
  label,
  valor,
  onChange,
  opciones,
  error,
  ayuda,
  obligatorio,
  ancho,
  vacio,
  numerico,
}) {
  return (
    <Envoltura label={label} obligatorio={obligatorio} error={error} ayuda={ayuda} ancho={ancho}>
      <select
        value={valor == null ? '' : String(valor)}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') return onChange(null);
          return onChange(numerico ? Number(v) : v);
        }}
      >
        <option value="">{vacio || '— Elegir —'}</option>
        {(opciones || []).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

export function Check({ label, valor, onChange, ayuda }) {
  const id = 'chk-' + label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="campo-check">
      <input id={id} type="checkbox" checked={!!valor} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {label}
        {ayuda ? <span className="ayuda"> — {ayuda}</span> : null}
      </label>
    </div>
  );
}

/**
 * Campo de solo lectura para valores CALCULADOS por el backend.
 * Se ve distinto a proposito: comunica "esto no lo edites, sale solo".
 */
export function Calculado({ label, valor, ayuda, ancho }) {
  return (
    <Envoltura label={label} ayuda={ayuda} calculado ancho={ancho}>
      <input type="text" value={valor == null || valor === '' ? '—' : valor} readOnly tabIndex={-1} />
    </Envoltura>
  );
}

/** Convierte un catalogo del backend a opciones del Selector. */
export function opcionesDeCatalogo(items) {
  return (items || []).map((i) => ({ valor: i.id, texto: i.valor }));
}

/** Convierte una lista de enums a opciones, usando el mapa de etiquetas. */
export function opcionesDeEnum(valores, formateador) {
  return (valores || []).map((v) => ({ valor: v, texto: formateador ? formateador(v) : v }));
}
