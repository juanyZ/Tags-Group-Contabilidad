/**
 * CLIENTES - base única de contactos.
 *
 * Es el módulo de referencia del frontend: el resto de las pantallas de carga
 * repiten esta misma estructura (filtros → tabla paginada → modal de alta y
 * edición con validación del backend).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPaginado, post, put, del, descargar } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla, Paginacion, useTabla } from '../components/Tabla.jsx';
import { Panel, Chip, Aviso, Vacio } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Texto, Fecha, Selector, SelectorFlotante, AreaTexto, opcionesDeEnum } from '../components/Campos.jsx';
import { useOpcionesCatalogo, useAbogados, useGuardar, errorDe } from '../hooks/useDatos.js';
import { fecha, etiqueta, hoyISO } from '../lib/formato.js';

const TIPOS_PERSONA = ['FISICA', 'JURIDICA'];
const ESTADOS = ['ACTIVO', 'POTENCIAL', 'INACTIVO', 'EX_CLIENTE'];

const VACIO = {
  tipoPersona: 'FISICA',
  nombre: '',
  documento: '',
  fechaNacConstit: null,
  domicilio: '',
  provinciaId: null,
  telefono: '',
  email: '',
  origenId: null,
  estado: 'ACTIVO',
  fechaAlta: null,
  abogadoId: null,
  observaciones: '',
};

export function Clientes() {
  const puede = useAuth((s) => s.puede);
  const tabla = useTabla('nombre', 'asc');

  const [filtros, setFiltros] = useState({ estado: '', tipoPersona: '', abogadoId: '' });
  const [editando, setEditando] = useState(null); // null | {} (nuevo) | fila
  const [aEliminar, setAEliminar] = useState(null);

  const provincias = useOpcionesCatalogo('PROVINCIA');
  const origenes = useOpcionesCatalogo('ORIGEN_CONTACTO');
  const abogados = useAbogados();

  const params = {
    page: tabla.page,
    limit: 25,
    ordenarPor: tabla.ordenarPor,
    orden: tabla.orden,
    q: tabla.q || undefined,
    estado: filtros.estado || undefined,
    tipoPersona: filtros.tipoPersona || undefined,
    abogadoId: filtros.abogadoId || undefined,
  };

  const consulta = useQuery({
    queryKey: ['clientes', params],
    queryFn: () => getPaginado('/clientes', params),
    placeholderData: (previo) => previo, // evita el parpadeo al paginar
  });

  const eliminar = useGuardar((id) => del('/clientes/' + id), {
    invalidar: [['clientes'], ['dashboard']],
    onExito: () => setAEliminar(null),
  });

  const opcionesAbogados = (abogados.data || []).map((a) => ({ valor: a.id, texto: a.nombre }));

  function cambiarFiltro(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    tabla.resetPagina();
  }

  return (
    <>
      <Cabecera
        titulo="Clientes"
        subtitulo="Base única de contactos del estudio: personas físicas y jurídicas"
      >
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => descargar('/export/clientes.csv', 'clientes.csv')}
        >
          ↓ CSV
        </button>
        {puede('clientes:escribir') ? (
          <button type="button" className="btn btn-primario" onClick={() => setEditando(VACIO)}>
            + Nuevo cliente
          </button>
        ) : null}
      </Cabecera>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nombre, código, DNI/CUIT o email..."
          value={tabla.q}
          onChange={(e) => tabla.setBusqueda(e.target.value)}
        />
        <SelectorFlotante label="Estado" value={filtros.estado} onChange={(e) => cambiarFiltro('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {etiqueta(s)}
            </option>
          ))}
        </SelectorFlotante>
        <SelectorFlotante
          label="Tipo de persona"
          value={filtros.tipoPersona}
          onChange={(e) => cambiarFiltro('tipoPersona', e.target.value)}
        >
          <option value="">Física y jurídica</option>
          <option value="FISICA">Persona física</option>
          <option value="JURIDICA">Persona jurídica</option>
        </SelectorFlotante>
        <SelectorFlotante
          label="Responsable"
          value={filtros.abogadoId}
          onChange={(e) => cambiarFiltro('abogadoId', e.target.value)}
        >
          <option value="">Todos los responsables</option>
          {opcionesAbogados.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.texto}
            </option>
          ))}
        </SelectorFlotante>
      </div>

      <Panel sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data ? consulta.data.items : []}
          ordenarPor={tabla.ordenarPor}
          orden={tabla.orden}
          onOrdenar={tabla.alternarOrden}
          vacio={
            <Vacio
              titulo="No hay clientes que coincidan"
              texto="Probá cambiando los filtros o cargá el primer cliente."
            />
          }
          columnas={[
            { clave: 'codigo', titulo: 'ID', ancho: 74, ordenable: true, render: (f) => <span className="codigo">{f.codigo}</span> },
            {
              clave: 'nombre',
              titulo: 'Apellido y nombre / Razón social',
              ordenable: true,
              render: (f) => (
                <div>
                  <span className="negrita">{f.nombre}</span>
                  <span className="chico gris">
                    {f.tipoPersona === 'FISICA' ? 'Persona física' : 'Persona jurídica'}
                    {f.documento ? ' · ' + f.documento : ''}
                  </span>
                </div>
              ),
            },
            {
              clave: 'contacto',
              titulo: 'Contacto',
              render: (f) => (
                <div className="chico">
                  {f.telefono ? <div>{f.telefono}</div> : null}
                  {f.email ? <div className="gris truncar">{f.email}</div> : null}
                  {!f.telefono && !f.email ? <span className="gris">—</span> : null}
                </div>
              ),
            },
            { clave: 'provincia', titulo: 'Provincia', ancho: 120 },
            {
              clave: 'estado',
              titulo: 'Estado',
              ancho: 100,
              ordenable: true,
              render: (f) => <Chip valor={f.estado} clase={f.estado === 'ACTIVO' ? 'BAJA' : ''} />,
            },
            { clave: 'abogado', titulo: 'Responsable', ancho: 145 },
            {
              clave: 'cantidadExpedientes',
              titulo: 'Causas',
              ancho: 70,
              align: 'right',
              render: (f) => f.cantidadExpedientes || 0,
            },
            { clave: 'fechaAlta', titulo: 'Alta', ancho: 92, ordenable: true, render: (f) => fecha(f.fechaAlta) },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 150,
              render: (f) => (
                <div className="fila" style={{ gap: 4 }}>
                  <Link className="btn btn-sutil btn-chico" to={'/cuenta-corriente/' + f.id}>
                    Cuenta
                  </Link>
                  {puede('clientes:escribir') ? (
                    <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(f)}>
                      Editar
                    </button>
                  ) : null}
                  {puede('clientes:eliminar') ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico rojo"
                      onClick={() => setAEliminar(f)}
                      title="Dar de baja"
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
        <FormularioCliente
          inicial={editando}
          provincias={provincias}
          origenes={origenes}
          abogados={opcionesAbogados}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      <Confirmar
        abierto={!!aEliminar}
        titulo="Dar de baja al cliente"
        mensaje={
          aEliminar
            ? 'Se va a dar de baja a "' +
              aEliminar.nombre +
              '". No se borra nada: el cliente y todo su historial siguen en la base y se puede reactivar.'
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

function FormularioCliente({ inicial, provincias, origenes, abogados, onCerrar }) {
  const esNuevo = !inicial.id;
  const [datos, setDatos] = useState({
    ...VACIO,
    ...inicial,
    fechaAlta: inicial.fechaAlta || hoyISO(),
  });

  const guardar = useGuardar(
    (body) => (esNuevo ? post('/clientes', body) : put('/clientes/' + inicial.id, body)),
    { invalidar: [['clientes'], ['dashboard']], onExito: onCerrar }
  );

  const error = errorDe(guardar);
  const campo = (clave) => (error && error.porCampo ? error.porCampo[clave] : null);
  const set = (clave) => (valor) => setDatos((d) => ({ ...d, [clave]: valor }));

  function enviar(e) {
    e.preventDefault();
    // Solo se mandan los campos del contrato: el backend rechaza el resto.
    const body = {
      tipoPersona: datos.tipoPersona,
      nombre: datos.nombre,
      documento: datos.documento || null,
      fechaNacConstit: datos.fechaNacConstit || null,
      domicilio: datos.domicilio || null,
      provinciaId: datos.provinciaId || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      origenId: datos.origenId || null,
      estado: datos.estado,
      fechaAlta: datos.fechaAlta,
      abogadoId: datos.abogadoId || null,
      observaciones: datos.observaciones || null,
    };
    if (!esNuevo) body.version = inicial.version;
    guardar.mutate(body);
  }

  return (
    <Modal
      abierto
      titulo={esNuevo ? 'Nuevo cliente' : 'Editar ' + inicial.codigo + ' — ' + inicial.nombre}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-cliente" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-cliente" onSubmit={enviar}>
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

        <div className="form-grid">
          <Selector
            label="Tipo de persona"
            obligatorio
            valor={datos.tipoPersona}
            onChange={set('tipoPersona')}
            opciones={opcionesDeEnum(TIPOS_PERSONA, (v) => (v === 'FISICA' ? 'Persona física' : 'Persona jurídica'))}
            error={campo('tipoPersona')}
          />
          <Texto
            label={datos.tipoPersona === 'FISICA' ? 'DNI' : 'CUIT'}
            valor={datos.documento}
            onChange={set('documento')}
            error={campo('documento')}
            ayuda="Se guarda sin puntos ni guiones"
          />
          <Texto
            label={datos.tipoPersona === 'FISICA' ? 'Apellido y nombre' : 'Razón social'}
            obligatorio
            ancho
            valor={datos.nombre}
            onChange={set('nombre')}
            error={campo('nombre')}
            ayuda="Podés corregirlo después: los expedientes y honorarios no se desenganchan."
          />
          <Fecha
            label={datos.tipoPersona === 'FISICA' ? 'Fecha de nacimiento' : 'Fecha de constitución'}
            valor={datos.fechaNacConstit}
            onChange={set('fechaNacConstit')}
            error={campo('fechaNacConstit')}
          />
          <Fecha
            label="Fecha de alta"
            obligatorio
            valor={datos.fechaAlta}
            onChange={set('fechaAlta')}
            error={campo('fechaAlta')}
          />
          <Texto
            label="Domicilio"
            ancho
            valor={datos.domicilio}
            onChange={set('domicilio')}
            error={campo('domicilio')}
          />
          <Selector
            label="Provincia"
            numerico
            valor={datos.provinciaId}
            onChange={set('provinciaId')}
            opciones={provincias}
            error={campo('provinciaId')}
          />
          <Texto label="Teléfono" valor={datos.telefono} onChange={set('telefono')} error={campo('telefono')} />
          <Texto
            label="Email"
            type="email"
            valor={datos.email}
            onChange={set('email')}
            error={campo('email')}
          />
          <Selector
            label="Origen del contacto"
            numerico
            valor={datos.origenId}
            onChange={set('origenId')}
            opciones={origenes}
            error={campo('origenId')}
          />
          <Selector
            label="Estado"
            obligatorio
            valor={datos.estado}
            onChange={set('estado')}
            opciones={opcionesDeEnum(ESTADOS, etiqueta)}
            error={campo('estado')}
          />
          <Selector
            label="Abogado responsable"
            numerico
            valor={datos.abogadoId}
            onChange={set('abogadoId')}
            opciones={abogados}
            error={campo('abogadoId')}
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
