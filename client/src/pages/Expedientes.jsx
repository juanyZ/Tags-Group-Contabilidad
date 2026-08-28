/**
 * EXPEDIENTES / CAUSAS.
 *
 * El próximo vencimiento, la situación y la cantidad de plazos pendientes
 * vienen calculados del backend a partir de los eventos de cada causa: no son
 * campos que alguien carga y quedan desactualizados.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPaginado, post, put, del, descargar } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla, Paginacion, useTabla } from '../components/Tabla.jsx';
import { Panel, Aviso, Vacio, SemaforoConDias, Importe } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Texto, Fecha, Selector, AreaTexto, Monto, Numero, opcionesDeEnum } from '../components/Campos.jsx';
import {
  useOpcionesCatalogo,
  useAbogados,
  useClientesOpciones,
  useGuardar,
  errorDe,
} from '../hooks/useDatos.js';
import { fecha, etiqueta, hoyISO } from '../lib/formato.js';

const CARACTERES = ['ACTOR', 'DEMANDADO', 'TERCERO', 'QUERELLANTE', 'CONSULTANTE'];

const VACIO = {
  fechaInicio: null,
  caratula: '',
  clienteId: null,
  caracter: 'ACTOR',
  contraparte: '',
  fueroId: null,
  juzgadoId: null,
  numeroExpediente: '',
  etapaId: null,
  estadoId: null,
  abogadoId: null,
  ultimaActuacion: null,
  montoReclamado: null,
  mesesCaducidad: null,
  fechaPrescripcion: null,
  observaciones: '',
};

export function Expedientes() {
  const puede = useAuth((s) => s.puede);
  const tabla = useTabla('fechaInicio', 'desc');

  const [filtros, setFiltros] = useState({
    clienteId: '',
    fueroId: '',
    estadoId: '',
    abogadoId: '',
    soloActivas: false,
  });
  const [editando, setEditando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);

  const fueros = useOpcionesCatalogo('FUERO');
  const juzgados = useOpcionesCatalogo('JUZGADO');
  const etapas = useOpcionesCatalogo('ETAPA_PROCESAL');
  const estados = useOpcionesCatalogo('ESTADO_EXPEDIENTE');
  const abogados = useAbogados();
  const clientes = useClientesOpciones();

  const params = {
    page: tabla.page,
    limit: 25,
    ordenarPor: tabla.ordenarPor,
    orden: tabla.orden,
    q: tabla.q || undefined,
    clienteId: filtros.clienteId || undefined,
    fueroId: filtros.fueroId || undefined,
    estadoId: filtros.estadoId || undefined,
    abogadoId: filtros.abogadoId || undefined,
    soloActivas: filtros.soloActivas || undefined,
  };

  const consulta = useQuery({
    queryKey: ['expedientes', params],
    queryFn: () => getPaginado('/expedientes', params),
    placeholderData: (previo) => previo,
  });

  const eliminar = useGuardar((id) => del('/expedientes/' + id), {
    invalidar: [['expedientes'], ['dashboard']],
    onExito: () => setAEliminar(null),
  });

  const opcionesAbogados = (abogados.data || []).map((a) => ({ valor: a.id, texto: a.nombre }));
  const opcionesClientes = (clientes.data || []).map((c) => ({
    valor: c.id,
    texto: c.nombre + ' (' + c.codigo + ')',
  }));

  function cambiarFiltro(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    tabla.resetPagina();
  }

  return (
    <>
      <Cabecera titulo="Expedientes" subtitulo="Las causas del estudio, con su etapa, estado y seguimiento">
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => descargar('/export/expedientes.csv', 'expedientes.csv')}
        >
          ↓ CSV
        </button>
        {puede('expedientes:escribir') ? (
          <button type="button" className="btn btn-primario" onClick={() => setEditando(VACIO)}>
            + Nuevo expediente
          </button>
        ) : null}
      </Cabecera>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por carátula, código, N° de expediente o contraparte..."
          value={tabla.q}
          onChange={(e) => tabla.setBusqueda(e.target.value)}
        />
        <select value={filtros.clienteId} onChange={(e) => cambiarFiltro('clienteId', e.target.value)}>
          <option value="">Todos los clientes</option>
          {opcionesClientes.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.texto}
            </option>
          ))}
        </select>
        <select value={filtros.fueroId} onChange={(e) => cambiarFiltro('fueroId', e.target.value)}>
          <option value="">Todos los fueros</option>
          {fueros.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.texto}
            </option>
          ))}
        </select>
        <select value={filtros.estadoId} onChange={(e) => cambiarFiltro('estadoId', e.target.value)}>
          <option value="">Todos los estados</option>
          {estados.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.texto}
            </option>
          ))}
        </select>
        <select value={filtros.abogadoId} onChange={(e) => cambiarFiltro('abogadoId', e.target.value)}>
          <option value="">Todos los abogados</option>
          {opcionesAbogados.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.texto}
            </option>
          ))}
        </select>
        <label className="fila chico" style={{ gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filtros.soloActivas}
            onChange={(e) => cambiarFiltro('soloActivas', e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--oro)' }}
          />
          Solo causas activas
        </label>
      </div>

      <Panel sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data ? consulta.data.items : []}
          ordenarPor={tabla.ordenarPor}
          orden={tabla.orden}
          onOrdenar={tabla.alternarOrden}
          vacio={<Vacio titulo="No hay expedientes que coincidan" />}
          columnas={[
            {
              clave: 'codigo',
              titulo: 'ID',
              ancho: 74,
              ordenable: true,
              render: (f) => <span className="codigo">{f.codigo}</span>,
            },
            {
              clave: 'caratula',
              titulo: 'Carátula',
              ordenable: true,
              render: (f) => (
                <div>
                  <Link to={'/ficha/' + f.id} className="negrita truncar" style={{ maxWidth: 340 }}>
                    {f.caratula}
                  </Link>
                  <span className="chico gris">
                    {f.cliente} · {etiqueta(f.caracter)}
                    {f.numeroExpediente ? ' · ' + f.numeroExpediente : ''}
                  </span>
                </div>
              ),
            },
            { clave: 'fuero', titulo: 'Fuero', ancho: 130 },
            { clave: 'etapa', titulo: 'Etapa', ancho: 140 },
            {
              clave: 'estado',
              titulo: 'Estado',
              ancho: 110,
              render: (f) => (
                <span className={f.estadoEsActivo ? '' : 'gris'}>{f.estado || '—'}</span>
              ),
            },
            {
              clave: 'proximoVto',
              titulo: 'Próximo vto.',
              ancho: 190,
              render: (f) => (
                <div>
                  <div className="mono chico">{fecha(f.proximoVto)}</div>
                  <SemaforoConDias item={f} />
                </div>
              ),
            },
            {
              clave: 'pendientes',
              titulo: 'Pend.',
              ancho: 62,
              align: 'right',
              render: (f) =>
                f.vencidos > 0 ? (
                  <span className="rojo negrita" title={f.vencidos + ' vencido(s)'}>
                    {f.pendientes}
                  </span>
                ) : (
                  f.pendientes || 0
                ),
            },
            {
              clave: 'montoReclamado',
              titulo: 'Monto reclamado',
              ancho: 135,
              align: 'right',
              render: (f) => (f.montoReclamado ? <Importe valor={f.montoReclamado} /> : <span className="gris">—</span>),
            },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 120,
              render: (f) => (
                <div className="fila" style={{ gap: 4 }}>
                  <Link className="btn btn-sutil btn-chico" to={'/ficha/' + f.id}>
                    Ficha
                  </Link>
                  {puede('expedientes:escribir') ? (
                    <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(f)}>
                      Editar
                    </button>
                  ) : null}
                  {puede('expedientes:eliminar') ? (
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
        <FormularioExpediente
          inicial={editando}
          clientes={opcionesClientes}
          fueros={fueros}
          juzgados={juzgados}
          etapas={etapas}
          estados={estados}
          abogados={opcionesAbogados}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      <Confirmar
        abierto={!!aEliminar}
        titulo="Dar de baja el expediente"
        mensaje={
          aEliminar
            ? 'Se va a dar de baja "' +
              aEliminar.caratula +
              '". No se borra nada: la causa y sus movimientos quedan en la base.'
            : ''
        }
        textoBoton="Dar de baja"
        procesando={eliminar.isPending}
        onCancelar={() => setAEliminar(null)}
        onConfirmar={() => eliminar.mutate(aEliminar.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function FormularioExpediente({ inicial, clientes, fueros, juzgados, etapas, estados, abogados, onCerrar }) {
  const esNuevo = !inicial.id;
  const [datos, setDatos] = useState({
    ...VACIO,
    ...inicial,
    fechaInicio: inicial.fechaInicio || hoyISO(),
  });

  const guardar = useGuardar(
    (body) => (esNuevo ? post('/expedientes', body) : put('/expedientes/' + inicial.id, body)),
    { invalidar: [['expedientes'], ['dashboard'], ['calendario']], onExito: onCerrar }
  );

  const error = errorDe(guardar);
  const campo = (c) => (error && error.porCampo ? error.porCampo[c] : null);
  const set = (c) => (v) => setDatos((d) => ({ ...d, [c]: v }));

  function enviar(e) {
    e.preventDefault();
    const body = {
      fechaInicio: datos.fechaInicio,
      caratula: datos.caratula,
      clienteId: datos.clienteId,
      caracter: datos.caracter,
      contraparte: datos.contraparte || null,
      fueroId: datos.fueroId || null,
      juzgadoId: datos.juzgadoId || null,
      numeroExpediente: datos.numeroExpediente || null,
      etapaId: datos.etapaId || null,
      estadoId: datos.estadoId || null,
      abogadoId: datos.abogadoId || null,
      ultimaActuacion: datos.ultimaActuacion || null,
      montoReclamado: datos.montoReclamado == null ? null : datos.montoReclamado,
      mesesCaducidad: datos.mesesCaducidad == null ? null : datos.mesesCaducidad,
      fechaPrescripcion: datos.fechaPrescripcion || null,
      observaciones: datos.observaciones || null,
    };
    if (!esNuevo) body.version = inicial.version;
    guardar.mutate(body);
  }

  return (
    <Modal
      abierto
      titulo={esNuevo ? 'Nuevo expediente' : 'Editar ' + inicial.codigo}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-exp" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-exp" onSubmit={enviar}>
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

        <div className="form-grid">
          <Texto
            label="Carátula"
            obligatorio
            ancho
            valor={datos.caratula}
            onChange={set('caratula')}
            error={campo('caratula')}
            ayuda='Formato "Actor c/ Demandado s/ Objeto".'
            placeholder="Pérez, Juan c/ Logística Andina S.A. s/ Despido"
          />
          <Selector
            label="Cliente"
            obligatorio
            numerico
            valor={datos.clienteId}
            onChange={set('clienteId')}
            opciones={clientes}
            error={campo('clienteId')}
          />
          <Selector
            label="Carácter en el juicio"
            obligatorio
            valor={datos.caracter}
            onChange={set('caracter')}
            opciones={opcionesDeEnum(CARACTERES, etiqueta)}
            error={campo('caracter')}
          />
          <Texto
            label="Contraparte"
            valor={datos.contraparte}
            onChange={set('contraparte')}
            error={campo('contraparte')}
          />
          <Texto
            label="N° de expediente"
            valor={datos.numeroExpediente}
            onChange={set('numeroExpediente')}
            error={campo('numeroExpediente')}
          />
          <Selector
            label="Fuero / materia"
            numerico
            valor={datos.fueroId}
            onChange={set('fueroId')}
            opciones={fueros}
            error={campo('fueroId')}
          />
          <Selector
            label="Juzgado / organismo"
            numerico
            valor={datos.juzgadoId}
            onChange={set('juzgadoId')}
            opciones={juzgados}
            error={campo('juzgadoId')}
          />
          <Selector
            label="Etapa procesal"
            numerico
            valor={datos.etapaId}
            onChange={set('etapaId')}
            opciones={etapas}
            error={campo('etapaId')}
          />
          <Selector
            label="Estado"
            numerico
            valor={datos.estadoId}
            onChange={set('estadoId')}
            opciones={estados}
            error={campo('estadoId')}
          />
          <Fecha
            label="Fecha de inicio"
            obligatorio
            valor={datos.fechaInicio}
            onChange={set('fechaInicio')}
            error={campo('fechaInicio')}
          />
          <Fecha
            label="Última actuación"
            valor={datos.ultimaActuacion}
            onChange={set('ultimaActuacion')}
            error={campo('ultimaActuacion')}
            ayuda="Desde acá se cuenta la caducidad de instancia."
          />
          <Selector
            label="Abogado responsable"
            numerico
            valor={datos.abogadoId}
            onChange={set('abogadoId')}
            opciones={abogados}
            error={campo('abogadoId')}
          />
          <Monto
            label="Monto reclamado"
            valor={datos.montoReclamado}
            onChange={set('montoReclamado')}
            error={campo('montoReclamado')}
          />
          <Numero
            label="Caducidad de instancia (meses)"
            valor={datos.mesesCaducidad}
            onChange={set('mesesCaducidad')}
            error={campo('mesesCaducidad')}
            min={1}
            max={120}
            ayuda="Vacío = usa el valor por defecto de Configuración."
          />
          <Fecha
            label="Fecha de prescripción"
            valor={datos.fechaPrescripcion}
            onChange={set('fechaPrescripcion')}
            error={campo('fechaPrescripcion')}
            ayuda="Se carga a mano: depende del tipo de acción."
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
