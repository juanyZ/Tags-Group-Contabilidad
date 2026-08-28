/**
 * GASTOS DEL ESTUDIO.
 *
 * Dos familias: los de una causa (que pueden reintegrarse) y los generales de
 * estructura. El desplegable de rubro depende del tipo de gasto elegido, igual
 * que en la planilla.
 *
 * Mejora sobre el Excel: si el gasto es "del expediente" y no se elige cuál,
 * NO se guarda. Allá la celda quedaba en rojo, el gasto se guardaba igual y no
 * entraba en la cuenta corriente de nadie.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, getPaginado, post, put, patch, del, descargar } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { useRangoPeriodo } from '../store/ui.js';
import { Cabecera, SelectorPeriodo } from '../components/Cabecera.jsx';
import { Tabla, Paginacion, useTabla } from '../components/Tabla.jsx';
import { Panel, Stat, Aviso, Vacio, Progreso, Importe, Chip } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Texto, Fecha, Selector, AreaTexto, Monto, Check, Calculado, opcionesDeEnum } from '../components/Campos.jsx';
import {
  useCatalogos,
  useOpcionesCatalogo,
  useExpedientesOpciones,
  useGuardar,
  errorDe,
} from '../hooks/useDatos.js';
import { fecha, etiqueta, pesos, hoyISO } from '../lib/formato.js';

const TIPOS = ['EXPEDIENTE', 'ESTUDIO'];
const ESTADOS_REINTEGRO = ['PENDIENTE', 'REINTEGRADO', 'NO_CORRESPONDE'];

const VACIO = {
  fecha: null,
  tipo: 'EXPEDIENTE',
  expedienteId: null,
  rubroId: null,
  detalle: '',
  medioPagoId: null,
  importe: null,
  reembolsable: true,
  estadoReintegro: 'PENDIENTE',
  observaciones: '',
};

export function Gastos() {
  const puede = useAuth((s) => s.puede);
  const rango = useRangoPeriodo();
  const tabla = useTabla('fecha', 'desc');

  const [filtros, setFiltros] = useState({ tipo: '', estadoReintegro: '', expedienteId: '' });
  const [editando, setEditando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [seleccion, setSeleccion] = useState([]);

  const expedientes = useExpedientesOpciones();
  const mediosPago = useOpcionesCatalogo('MEDIO_PAGO');
  const catalogos = useCatalogos();

  const params = {
    page: tabla.page,
    limit: 25,
    ordenarPor: tabla.ordenarPor,
    orden: tabla.orden,
    q: tabla.q || undefined,
    tipo: filtros.tipo || undefined,
    estadoReintegro: filtros.estadoReintegro || undefined,
    expedienteId: filtros.expedienteId || undefined,
    desde: rango.desde,
    hasta: rango.hasta,
  };

  const consulta = useQuery({
    queryKey: ['gastos', params],
    queryFn: () => getPaginado('/gastos', params),
    placeholderData: (previo) => previo,
  });

  const resumen = useQuery({
    queryKey: ['gastos', 'resumen', rango],
    queryFn: () => get('/gastos/resumen', rango),
  });

  const INVALIDAR = [['gastos'], ['dashboard'], ['cuenta-corriente']];

  const eliminar = useGuardar((id) => del('/gastos/' + id), {
    invalidar: INVALIDAR,
    onExito: () => setAEliminar(null),
  });

  const marcarReintegro = useGuardar(
    ({ ids, estado }) => patch('/gastos/reintegro', { ids, estado }),
    { invalidar: INVALIDAR, onExito: () => setSeleccion([]) }
  );

  function cambiarFiltro(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    tabla.resetPagina();
  }

  function alternarSeleccion(id) {
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat(id)));
  }

  const r = resumen.data;

  return (
    <>
      <Cabecera
        titulo="Gastos del estudio"
        subtitulo="Gastos de causa y generales, con control de reintegros"
      >
        <SelectorPeriodo />
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => descargar('/export/gastos.csv?desde=' + rango.desde + '&hasta=' + rango.hasta, 'gastos.csv')}
        >
          ↓ CSV
        </button>
        {puede('gastos:escribir') ? (
          <button type="button" className="btn btn-primario" onClick={() => setEditando(VACIO)}>
            + Nuevo gasto
          </button>
        ) : null}
      </Cabecera>

      {r ? (
        <div className="grid grid-4" style={{ marginBottom: 14 }}>
          <Stat etiqueta="Total del período" valor={pesos(r.totalPeriodo)} pie={r.cantidad + ' gasto(s)'} />
          <Stat etiqueta="Gastos de causas" valor={pesos(r.totalCausas)} pie="Imputables a expedientes" />
          <Stat etiqueta="Gastos del estudio" valor={pesos(r.totalEstudio)} pie="Estructura fija" />
          <Stat
            etiqueta="A reintegrar"
            tono="oro"
            valor={pesos(r.totalAReintegrar)}
            pie="Histórico pendiente de cobro"
          />
        </div>
      ) : null}

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por detalle o código..."
          value={tabla.q}
          onChange={(e) => tabla.setBusqueda(e.target.value)}
        />
        <select value={filtros.tipo} onChange={(e) => cambiarFiltro('tipo', e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="EXPEDIENTE">Del expediente</option>
          <option value="ESTUDIO">General del estudio</option>
        </select>
        <select
          value={filtros.estadoReintegro}
          onChange={(e) => cambiarFiltro('estadoReintegro', e.target.value)}
        >
          <option value="">Todo estado de reintegro</option>
          {ESTADOS_REINTEGRO.map((s) => (
            <option key={s} value={s}>
              {etiqueta(s)}
            </option>
          ))}
        </select>
        <select
          value={filtros.expedienteId}
          onChange={(e) => cambiarFiltro('expedienteId', e.target.value)}
        >
          <option value="">Todos los expedientes</option>
          {(expedientes.data || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.caratula}
            </option>
          ))}
        </select>

        {seleccion.length > 0 && puede('gastos:escribir') ? (
          <span className="fila fila-fin" style={{ gap: 7 }}>
            <span className="chico oro">{seleccion.length} seleccionado(s)</span>
            <button
              type="button"
              className="btn btn-chico"
              disabled={marcarReintegro.isPending}
              onClick={() => marcarReintegro.mutate({ ids: seleccion, estado: 'REINTEGRADO' })}
            >
              Marcar reintegrados
            </button>
            <button type="button" className="btn btn-sutil btn-chico" onClick={() => setSeleccion([])}>
              Limpiar
            </button>
          </span>
        ) : null}
      </div>

      <div className="grid-principal">
        <Panel sinPadding>
          <Tabla
            consulta={consulta}
            filas={consulta.data ? consulta.data.items : []}
            vacio={<Vacio titulo="No hay gastos en el período elegido" />}
            ordenarPor={tabla.ordenarPor}
            orden={tabla.orden}
            onOrdenar={tabla.alternarOrden}
            columnas={[
              {
                clave: 'sel',
                titulo: '',
                ancho: 32,
                render: (f) =>
                  f.reembolsable && f.estadoReintegro === 'PENDIENTE' ? (
                    <input
                      type="checkbox"
                      checked={seleccion.includes(f.id)}
                      onChange={() => alternarSeleccion(f.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 14, height: 14, accentColor: 'var(--oro)' }}
                    />
                  ) : null,
              },
              {
                clave: 'codigo',
                titulo: 'ID',
                ancho: 68,
                render: (f) => <span className="codigo">{f.codigo}</span>,
              },
              {
                clave: 'fecha',
                titulo: 'Fecha',
                ancho: 86,
                ordenable: true,
                render: (f) => <span className="mono chico">{fecha(f.fecha)}</span>,
              },
              {
                clave: 'tipo',
                titulo: 'Tipo',
                ancho: 96,
                render: (f) => (
                  <span
                    className={'chico nowrap ' + (f.tipo === 'EXPEDIENTE' ? 'oro' : 'gris')}
                    title={etiqueta(f.tipo)}
                  >
                    {f.tipo === 'EXPEDIENTE' ? 'De causa' : 'Del estudio'}
                  </span>
                ),
              },
              {
                clave: 'detalle',
                titulo: 'Rubro y detalle',
                render: (f) => (
                  <div>
                    <span className="negrita">{f.rubro || 'Sin rubro'}</span>
                    <span className="chico gris truncar" style={{ maxWidth: 300 }}>
                      {f.detalle || '—'}
                      {f.expediente ? ' · ' + f.expediente : ''}
                    </span>
                  </div>
                ),
              },
              { clave: 'medioPago', titulo: 'Medio de pago', ancho: 112 },
              {
                clave: 'importe',
                titulo: 'Importe',
                ancho: 118,
                align: 'right',
                ordenable: true,
                render: (f) => <Importe valor={f.importe} />,
              },
              {
                clave: 'estadoReintegro',
                titulo: 'Reintegro',
                ancho: 108,
                render: (f) =>
                  f.reembolsable ? (
                    <Chip
                      valor={f.estadoReintegro}
                      clase={f.estadoReintegro === 'PENDIENTE' ? 'MEDIA' : 'BAJA'}
                    />
                  ) : (
                    <span className="gris chico nowrap">No reembolsable</span>
                  ),
              },
              {
                clave: 'acciones',
                titulo: '',
                ancho: 86,
                render: (f) => (
                  <div className="fila" style={{ gap: 4 }}>
                    {puede('gastos:escribir') ? (
                      <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(f)}>
                        Editar
                      </button>
                    ) : null}
                    {puede('gastos:eliminar') ? (
                      <button
                        type="button"
                        className="btn btn-sutil btn-chico rojo"
                        onClick={() => setAEliminar(f)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
          <div style={{ padding: '0 12px' }}>
            <Paginacion
              meta={consulta.data ? consulta.data.meta : null}
              pagina={tabla.page}
              onPagina={tabla.setPagina}
            />
          </div>
        </Panel>

        <Panel titulo="Rubros más caros del período" icono="◫" sinPadding>
          <Tabla
            filas={r ? r.rubros : []}
            claveFila={(f) => f.rubro}
            vacio={<Vacio titulo="Sin gastos en el período" />}
            columnas={[
              {
                clave: 'rubro',
                titulo: 'Rubro',
                render: (f) => (
                  <span className="truncar" style={{ maxWidth: 110 }}>
                    {f.rubro}
                  </span>
                ),
              },
              {
                clave: 'porcentaje',
                titulo: '%',
                ancho: 74,
                render: (f) => <Progreso valor={f.porcentaje} />,
              },
              {
                clave: 'importe',
                titulo: 'Importe',
                ancho: 104,
                align: 'right',
                render: (f) => <Importe valor={f.importe} />,
              },
            ]}
          />
        </Panel>
      </div>

      {editando ? (
        <FormularioGasto
          inicial={editando}
          catalogos={catalogos.data}
          mediosPago={mediosPago}
          expedientes={expedientes.data || []}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      <Confirmar
        abierto={!!aEliminar}
        titulo="Dar de baja el gasto"
        mensaje={aEliminar ? 'Se va a dar de baja ' + aEliminar.codigo + ' por ' + pesos(aEliminar.importe) + '.' : ''}
        textoBoton="Dar de baja"
        procesando={eliminar.isPending}
        onCancelar={() => setAEliminar(null)}
        onConfirmar={() => eliminar.mutate(aEliminar.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function FormularioGasto({ inicial, catalogos, mediosPago, expedientes, onCerrar }) {
  const esNuevo = !inicial.id;
  const [datos, setDatos] = useState({
    ...VACIO,
    ...inicial,
    fecha: inicial.fecha || hoyISO(),
  });

  const guardar = useGuardar(
    (body) => (esNuevo ? post('/gastos', body) : put('/gastos/' + inicial.id, body)),
    { invalidar: [['gastos'], ['dashboard'], ['cuenta-corriente']], onExito: onCerrar }
  );

  const error = errorDe(guardar);
  const campo = (c) => (error && error.porCampo ? error.porCampo[c] : null);

  /**
   * Cambiar el tipo de gasto limpia el rubro y el expediente: los rubros de
   * causa y los de estructura son listas distintas, y un gasto general no
   * puede quedar colgado de un expediente.
   */
  function cambiarTipo(tipo) {
    setDatos((d) => ({
      ...d,
      tipo,
      rubroId: null,
      expedienteId: tipo === 'ESTUDIO' ? null : d.expedienteId,
      reembolsable: tipo === 'EXPEDIENTE' ? d.reembolsable : false,
      estadoReintegro: tipo === 'EXPEDIENTE' ? d.estadoReintegro : 'NO_CORRESPONDE',
    }));
  }

  const set = (c) => (v) => setDatos((d) => ({ ...d, [c]: v }));

  // El desplegable de rubro depende del tipo elegido.
  const rubros = ((catalogos && catalogos.RUBRO_GASTO) || [])
    .filter((rb) => !rb.scope || rb.scope === datos.tipo)
    .map((rb) => ({ valor: rb.id, texto: rb.valor }));

  const expedienteElegido = expedientes.find((e) => e.id === datos.expedienteId);
  const clienteDerivado =
    expedienteElegido && expedienteElegido.cliente ? expedienteElegido.cliente.nombre : null;

  function enviar(e) {
    e.preventDefault();
    const body = {
      fecha: datos.fecha,
      tipo: datos.tipo,
      expedienteId: datos.tipo === 'EXPEDIENTE' ? datos.expedienteId : null,
      rubroId: datos.rubroId || null,
      detalle: datos.detalle || null,
      medioPagoId: datos.medioPagoId || null,
      importe: datos.importe,
      reembolsable: datos.tipo === 'EXPEDIENTE' ? datos.reembolsable : false,
      estadoReintegro: datos.tipo === 'EXPEDIENTE' ? datos.estadoReintegro : 'NO_CORRESPONDE',
      observaciones: datos.observaciones || null,
    };
    if (!esNuevo) body.version = inicial.version;
    guardar.mutate(body);
  }

  return (
    <Modal
      abierto
      titulo={esNuevo ? 'Nuevo gasto' : 'Editar ' + inicial.codigo}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-gasto" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-gasto" onSubmit={enviar}>
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

        <div className="form-grid">
          <Selector
            label="Tipo de gasto"
            obligatorio
            valor={datos.tipo}
            onChange={cambiarTipo}
            opciones={opcionesDeEnum(TIPOS, etiqueta)}
            error={campo('tipo')}
            ayuda="Define qué rubros se ofrecen abajo."
          />
          <Fecha
            label="Fecha"
            obligatorio
            valor={datos.fecha}
            onChange={set('fecha')}
            error={campo('fecha')}
          />

          {datos.tipo === 'EXPEDIENTE' ? (
            <>
              <Selector
                label="Expediente"
                obligatorio
                ancho
                numerico
                valor={datos.expedienteId}
                onChange={set('expedienteId')}
                opciones={expedientes.map((e) => ({ valor: e.id, texto: e.caratula }))}
                error={campo('expedienteId')}
                ayuda="Obligatorio: sin esto el gasto no entra en la cuenta corriente de ningún cliente."
              />
              <Calculado label="Cliente" ancho valor={clienteDerivado} ayuda="Sale solo del expediente." />
            </>
          ) : null}

          <Selector
            label="Rubro"
            numerico
            valor={datos.rubroId}
            onChange={set('rubroId')}
            opciones={rubros}
            error={campo('rubroId')}
          />
          <Selector
            label="Medio de pago"
            numerico
            valor={datos.medioPagoId}
            onChange={set('medioPagoId')}
            opciones={mediosPago}
            error={campo('medioPagoId')}
          />
          <Texto
            label="Detalle"
            ancho
            valor={datos.detalle}
            onChange={set('detalle')}
            error={campo('detalle')}
            placeholder="Qué se pagó exactamente"
          />
          <Monto
            label="Importe"
            obligatorio
            valor={datos.importe}
            onChange={set('importe')}
            error={campo('importe')}
          />

          {datos.tipo === 'EXPEDIENTE' ? (
            <>
              <Selector
                label="Estado del reintegro"
                valor={datos.estadoReintegro}
                onChange={set('estadoReintegro')}
                opciones={opcionesDeEnum(ESTADOS_REINTEGRO, etiqueta)}
                error={campo('estadoReintegro')}
                ayuda="Los reintegrados salen de la cuenta corriente: se consideran saldados."
              />
              <div className="ancho-total">
                <Check
                  label="El cliente tiene que reintegrarlo"
                  valor={datos.reembolsable}
                  onChange={set('reembolsable')}
                  ayuda="Si está marcado y queda pendiente, aparece en su cuenta corriente."
                />
              </div>
            </>
          ) : null}

          <AreaTexto
            label="Observaciones"
            ancho
            valor={datos.observaciones}
            onChange={set('observaciones')}
            error={campo('observaciones')}
          />
        </div>
      </form>
    </Modal>
  );
}
