/**
 * EVENTOS PUNTUALES - la pantalla que más se usa en el día a día.
 *
 * Audiencias, plazos, escritos, pericias, mediaciones y reuniones. El cliente
 * no se carga: sale solo del expediente elegido.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaginado, post, put, patch, del, descargar } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla, Paginacion, useTabla } from '../components/Tabla.jsx';
import { Panel, Aviso, Vacio, SemaforoConDias, Chip } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Texto, Fecha, Hora, Selector, AreaTexto, Calculado, opcionesDeEnum } from '../components/Campos.jsx';
import { SelectorFecha } from '../components/SelectorFecha.jsx';
import {
  useOpcionesCatalogo,
  useAbogados,
  useExpedientesOpciones,
  useGuardar,
  errorDe,
} from '../hooks/useDatos.js';
import { fecha, etiqueta, hoyISO } from '../lib/formato.js';

const PRIORIDADES = ['ALTA', 'MEDIA', 'BAJA'];
const ESTADOS = ['PENDIENTE', 'EN_CURSO', 'CUMPLIDO', 'REPROGRAMADO', 'CANCELADO'];

const VACIO = {
  fechaVto: null,
  hora: null,
  tipoId: null,
  descripcion: '',
  expedienteId: null,
  responsableId: null,
  prioridad: 'MEDIA',
  estado: 'PENDIENTE',
  observaciones: '',
};

export function Puntuales() {
  const puede = useAuth((s) => s.puede);
  const tabla = useTabla('fechaVto', 'asc');

  const [filtros, setFiltros] = useState({
    estado: '',
    prioridad: '',
    responsableId: '',
    expedienteId: '',
    soloPendientes: true,
    desde: '',
    hasta: '',
  });
  const [editando, setEditando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);

  const tipos = useOpcionesCatalogo('TIPO_EVENTO');
  const abogados = useAbogados();
  const expedientes = useExpedientesOpciones();

  const params = {
    page: tabla.page,
    limit: 30,
    ordenarPor: tabla.ordenarPor,
    orden: tabla.orden,
    q: tabla.q || undefined,
    estado: filtros.estado || undefined,
    prioridad: filtros.prioridad || undefined,
    responsableId: filtros.responsableId || undefined,
    expedienteId: filtros.expedienteId || undefined,
    soloPendientes: filtros.soloPendientes || undefined,
    desde: filtros.desde || undefined,
    hasta: filtros.hasta || undefined,
  };

  const consulta = useQuery({
    queryKey: ['eventos', params],
    queryFn: () => getPaginado('/eventos', params),
    placeholderData: (previo) => previo,
  });

  const INVALIDAR = [['eventos'], ['dashboard'], ['calendario'], ['agenda'], ['expedientes']];

  const cambiarEstado = useGuardar(
    ({ id, estado }) => patch('/eventos/' + id + '/estado', { estado }),
    { invalidar: INVALIDAR }
  );

  const eliminar = useGuardar((id) => del('/eventos/' + id), {
    invalidar: INVALIDAR,
    onExito: () => setAEliminar(null),
  });

  const opcionesAbogados = (abogados.data || []).map((a) => ({ valor: a.id, texto: a.nombre }));
  const opcionesExpedientes = (expedientes.data || []).map((e) => ({
    valor: e.id,
    texto: e.caratula,
    cliente: e.cliente ? e.cliente.nombre : null,
  }));

  function cambiarFiltro(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    tabla.resetPagina();
  }

  return (
    <>
      <Cabecera
        titulo="Vencimientos"
        subtitulo="Audiencias, plazos, escritos, pericias, mediaciones y reuniones con fecha propia"
      >
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => descargar('/export/eventos.csv', 'vencimientos.csv')}
        >
          ↓ CSV
        </button>
        {puede('eventos:escribir') ? (
          <button type="button" className="btn btn-primario" onClick={() => setEditando(VACIO)}>
            + Nuevo vencimiento
          </button>
        ) : null}
      </Cabecera>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por descripción o código..."
          value={tabla.q}
          onChange={(e) => tabla.setBusqueda(e.target.value)}
        />
        <label className="fila chico" style={{ gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filtros.soloPendientes}
            onChange={(e) => cambiarFiltro('soloPendientes', e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--oro)' }}
          />
          Solo pendientes
        </label>
        <select value={filtros.estado} onChange={(e) => cambiarFiltro('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {etiqueta(s)}
            </option>
          ))}
        </select>
        <select value={filtros.prioridad} onChange={(e) => cambiarFiltro('prioridad', e.target.value)}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {etiqueta(p)}
            </option>
          ))}
        </select>
        <select
          value={filtros.responsableId}
          onChange={(e) => cambiarFiltro('responsableId', e.target.value)}
        >
          <option value="">Todos los responsables</option>
          {opcionesAbogados.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.texto}
            </option>
          ))}
        </select>
        <SelectorFecha
          valor={filtros.desde}
          onChange={(v) => cambiarFiltro('desde', v || '')}
          placeholder="Desde"
        />
        <SelectorFecha
          valor={filtros.hasta}
          onChange={(v) => cambiarFiltro('hasta', v || '')}
          placeholder="Hasta"
        />
      </div>

      <Panel sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data ? consulta.data.items : []}
          ordenarPor={tabla.ordenarPor}
          orden={tabla.orden}
          onOrdenar={tabla.alternarOrden}
          vacio={<Vacio titulo="No hay vencimientos que coincidan" />}
          columnas={[
            {
              clave: 'codigo',
              titulo: 'ID',
              ancho: 74,
              render: (f) => <span className="codigo">{f.codigo}</span>,
            },
            {
              clave: 'fechaVto',
              titulo: 'Fecha',
              ancho: 96,
              ordenable: true,
              render: (f) => (
                <div>
                  <div className="mono">{fecha(f.fechaVto)}</div>
                  {f.hora ? <div className="chico oro">{f.hora}</div> : null}
                </div>
              ),
            },
            { clave: 'tipo', titulo: 'Tipo', ancho: 130 },
            {
              clave: 'descripcion',
              titulo: 'Qué hay que hacer',
              ordenable: true,
              render: (f) => (
                <div>
                  <span className="truncar" style={{ maxWidth: 330 }}>
                    {f.descripcion}
                  </span>
                  <span className="chico gris truncar" style={{ maxWidth: 330 }}>
                    {f.expediente || 'Evento del estudio'}
                    {f.cliente ? ' · ' + f.cliente : ''}
                  </span>
                </div>
              ),
            },
            { clave: 'responsable', titulo: 'Responsable', ancho: 135 },
            {
              clave: 'prioridad',
              titulo: 'Prior.',
              ancho: 74,
              render: (f) => <Chip valor={f.prioridad} />,
            },
            {
              clave: 'situacion',
              titulo: 'Situación',
              ancho: 190,
              render: (f) => <SemaforoConDias item={f} />,
            },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 165,
              render: (f) => (
                <div className="fila" style={{ gap: 4 }}>
                  {puede('eventos:escribir') && f.estado !== 'CUMPLIDO' ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico verde"
                      title="Marcar como cumplido"
                      disabled={cambiarEstado.isPending}
                      onClick={() => cambiarEstado.mutate({ id: f.id, estado: 'CUMPLIDO' })}
                    >
                      ✓ Cumplido
                    </button>
                  ) : null}
                  {puede('eventos:escribir') ? (
                    <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(f)}>
                      Editar
                    </button>
                  ) : null}
                  {puede('eventos:eliminar') ? (
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

      {editando ? (
        <FormularioEvento
          inicial={editando}
          tipos={tipos}
          abogados={opcionesAbogados}
          expedientes={opcionesExpedientes}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      <Confirmar
        abierto={!!aEliminar}
        titulo="Eliminar el vencimiento"
        mensaje={aEliminar ? 'Se va a dar de baja "' + aEliminar.descripcion + '".' : ''}
        procesando={eliminar.isPending}
        onCancelar={() => setAEliminar(null)}
        onConfirmar={() => eliminar.mutate(aEliminar.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function FormularioEvento({ inicial, tipos, abogados, expedientes, onCerrar }) {
  const esNuevo = !inicial.id;
  const [datos, setDatos] = useState({
    ...VACIO,
    ...inicial,
    fechaVto: inicial.fechaVto || hoyISO(),
  });

  const guardar = useGuardar(
    (body) => (esNuevo ? post('/eventos', body) : put('/eventos/' + inicial.id, body)),
    {
      invalidar: [['eventos'], ['dashboard'], ['calendario'], ['agenda'], ['expedientes']],
      onExito: onCerrar,
    }
  );

  const error = errorDe(guardar);
  const campo = (c) => (error && error.porCampo ? error.porCampo[c] : null);
  const set = (c) => (v) => setDatos((d) => ({ ...d, [c]: v }));

  // El cliente es derivado: se muestra pero no se carga.
  const expedienteElegido = expedientes.find((e) => e.valor === datos.expedienteId);
  const clienteDerivado = expedienteElegido ? expedienteElegido.cliente : null;

  function enviar(e) {
    e.preventDefault();
    const body = {
      fechaVto: datos.fechaVto,
      hora: datos.hora || null,
      tipoId: datos.tipoId || null,
      descripcion: datos.descripcion,
      expedienteId: datos.expedienteId || null,
      responsableId: datos.responsableId || null,
      prioridad: datos.prioridad,
      estado: datos.estado,
      observaciones: datos.observaciones || null,
    };
    if (!esNuevo) body.version = inicial.version;
    guardar.mutate(body);
  }

  return (
    <Modal
      abierto
      titulo={esNuevo ? 'Nuevo vencimiento' : 'Editar ' + inicial.codigo}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-evt" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-evt" onSubmit={enviar}>
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

        <div className="form-grid">
          <Fecha
            label="Fecha de vencimiento"
            obligatorio
            valor={datos.fechaVto}
            onChange={set('fechaVto')}
            error={campo('fechaVto')}
          />
          <Hora label="Hora (opcional)" valor={datos.hora} onChange={set('hora')} error={campo('hora')} />
          <Texto
            label="Descripción"
            obligatorio
            ancho
            valor={datos.descripcion}
            onChange={set('descripcion')}
            error={campo('descripcion')}
            ayuda="Corta y clara: es lo único que se ve en el calendario y la agenda."
          />
          <Selector
            label="Tipo de evento"
            numerico
            valor={datos.tipoId}
            onChange={set('tipoId')}
            opciones={tipos}
            error={campo('tipoId')}
          />
          <Selector
            label="Responsable"
            numerico
            valor={datos.responsableId}
            onChange={set('responsableId')}
            opciones={abogados}
            error={campo('responsableId')}
          />
          <Selector
            label="Expediente"
            ancho
            numerico
            valor={datos.expedienteId}
            onChange={set('expedienteId')}
            opciones={expedientes}
            vacio="— Evento del estudio (sin causa) —"
            error={campo('expedienteId')}
          />
          <Calculado
            label="Cliente"
            ancho
            valor={clienteDerivado}
            ayuda="Sale solo del expediente elegido: no se carga a mano."
          />
          <Selector
            label="Prioridad"
            valor={datos.prioridad}
            onChange={set('prioridad')}
            opciones={opcionesDeEnum(PRIORIDADES, etiqueta)}
            error={campo('prioridad')}
          />
          <Selector
            label="Estado"
            valor={datos.estado}
            onChange={set('estado')}
            opciones={opcionesDeEnum(ESTADOS, etiqueta)}
            error={campo('estado')}
            ayuda="En Cumplido deja de figurar como pendiente."
          />
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
