/**
 * CONFIGURACIÓN: el motor de la plantilla.
 *
 * Datos del estudio, parámetros del semáforo, listas de desplegables, abogados,
 * calendario procesal (feriados y ferias) y usuarios. Se toca una vez al
 * principio y después casi nunca.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, del } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla } from '../components/Tabla.jsx';
import { Panel, Aviso, Vacio, Cargando } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Texto, Numero, Monto, Selector, SelectorFlotante, Check, opcionesDeEnum } from '../components/Campos.jsx';
import { SelectorFecha } from '../components/SelectorFecha.jsx';
import { useAbogados, useConfig, useGuardar, errorDe } from '../hooks/useDatos.js';
import { fecha, etiqueta, fechaHora } from '../lib/formato.js';

const SOLAPAS = [
  { id: 'estudio', texto: 'Datos y parámetros' },
  { id: 'listas', texto: 'Listas de desplegables' },
  { id: 'abogados', texto: 'Abogados' },
  { id: 'calendario', texto: 'Calendario procesal' },
  { id: 'usuarios', texto: 'Usuarios' },
  { id: 'auditoria', texto: 'Auditoría' },
];

export function Configuracion() {
  const puede = useAuth((s) => s.puede);
  const [solapa, setSolapa] = useState('estudio');

  const visibles = SOLAPAS.filter((s) => {
    if (s.id === 'usuarios') return puede('usuarios:leer');
    if (s.id === 'auditoria') return puede('audit:leer');
    return true;
  });

  return (
    <>
      <Cabecera
        titulo="Configuración"
        subtitulo="Datos del estudio, parámetros y todas las listas que alimentan los desplegables"
      />

      <div className="filtros" style={{ borderBottom: '1px solid var(--linea-sutil)', paddingBottom: 10 }}>
        {visibles.map((s) => (
          <button
            key={s.id}
            type="button"
            className={'btn btn-chico' + (solapa === s.id ? ' btn-primario' : '')}
            onClick={() => setSolapa(s.id)}
          >
            {s.texto}
          </button>
        ))}
      </div>

      {solapa === 'estudio' ? <DatosEstudio /> : null}
      {solapa === 'listas' ? <Listas /> : null}
      {solapa === 'abogados' ? <Abogados /> : null}
      {solapa === 'calendario' ? <CalendarioProcesal /> : null}
      {solapa === 'usuarios' ? <Usuarios /> : null}
      {solapa === 'auditoria' ? <Auditoria /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function DatosEstudio() {
  const puede = useAuth((s) => s.puede);
  const config = useConfig();
  const [datos, setDatos] = useState(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (config.data) setDatos(config.data);
  }, [config.data]);

  const guardar = useGuardar((body) => put('/config', body), {
    invalidar: [['config'], ['dashboard']],
    onExito: () => {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    },
  });

  if (!datos) return <Cargando />;

  const error = errorDe(guardar);
  const campo = (c) => (error && error.porCampo ? error.porCampo[c] : null);
  const set = (c) => (v) => setDatos((d) => ({ ...d, [c]: v }));
  const soloLectura = !puede('config:escribir');

  function enviar(e) {
    e.preventDefault();
    guardar.mutate({
      nombreEstudio: datos.nombreEstudio,
      titular: datos.titular || null,
      matricula: datos.matricula || null,
      cuit: datos.cuit || null,
      domicilio: datos.domicilio || null,
      localidad: datos.localidad || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      anioTrabajo: datos.anioTrabajo,
      diasPorVencer: datos.diasPorVencer,
      ventanaProximos: datos.ventanaProximos,
      valorJus: datos.valorJus,
      jurisdiccionDefault: datos.jurisdiccionDefault,
      mesesCaducidadDefault: datos.mesesCaducidadDefault,
    });
  }

  return (
    <form onSubmit={enviar}>
      {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}
      {guardado ? <Aviso tipo="exito">Configuración guardada.</Aviso> : null}

      <div className="grid grid-2">
        <Panel titulo="Datos del estudio" icono="◈">
          <Texto label="Nombre del estudio" obligatorio valor={datos.nombreEstudio} onChange={set('nombreEstudio')} error={campo('nombreEstudio')} disabled={soloLectura} />
          <Texto label="Titular" valor={datos.titular} onChange={set('titular')} disabled={soloLectura} />
          <Texto label="Matrícula" valor={datos.matricula} onChange={set('matricula')} disabled={soloLectura} />
          <Texto label="CUIT" valor={datos.cuit} onChange={set('cuit')} disabled={soloLectura} />
          <Texto label="Domicilio" valor={datos.domicilio} onChange={set('domicilio')} disabled={soloLectura} />
          <Texto label="Localidad" valor={datos.localidad} onChange={set('localidad')} disabled={soloLectura} />
          <Texto label="Teléfono" valor={datos.telefono} onChange={set('telefono')} disabled={soloLectura} />
          <Texto label="Email" type="email" valor={datos.email} onChange={set('email')} error={campo('email')} disabled={soloLectura} />
        </Panel>

        <Panel titulo="Parámetros del sistema" icono="⚙">
          <Numero
            label="Año de trabajo"
            valor={datos.anioTrabajo}
            onChange={set('anioTrabajo')}
            error={campo('anioTrabajo')}
            min={2000}
            max={2100}
            ayuda="El año por defecto de los selectores de período."
          />
          <Numero
            label="Avisar «por vencer» con (días)"
            valor={datos.diasPorVencer}
            onChange={set('diasPorVencer')}
            error={campo('diasPorVencer')}
            min={1}
            max={90}
            ayuda="Cuántos días antes se enciende el semáforo amarillo."
          />
          <Numero
            label="Ventana de próximos vencimientos (días)"
            valor={datos.ventanaProximos}
            onChange={set('ventanaProximos')}
            error={campo('ventanaProximos')}
            min={1}
            max={365}
            ayuda="El horizonte del panel de alertas del tablero."
          />
          <Monto
            label="Valor del JUS"
            valor={datos.valorJus}
            onChange={set('valorJus')}
            error={campo('valorJus')}
            ayuda="Por si pactás honorarios en JUS. Actualizalo por jurisdicción."
          />
          <Texto
            label="Jurisdicción por defecto"
            valor={datos.jurisdiccionDefault}
            onChange={set('jurisdiccionDefault')}
            error={campo('jurisdiccionDefault')}
            ayuda="Se usa para elegir qué feriados y ferias aplican al calcular plazos."
            disabled={soloLectura}
          />
          <Numero
            label="Caducidad de instancia por defecto (meses)"
            valor={datos.mesesCaducidadDefault}
            onChange={set('mesesCaducidadDefault')}
            error={campo('mesesCaducidadDefault')}
            min={1}
            max={120}
            ayuda="Se puede pisar expediente por expediente. Revisalo contra tu fuero."
          />
        </Panel>
      </div>

      {!soloLectura ? (
        <div className="mt-16">
          <button type="submit" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      ) : (
        <p className="chico gris mt-16">Solo el administrador puede modificar la configuración.</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------

const TIPOS_CATALOGO = [
  ['PROVINCIA', 'Provincias'],
  ['FUERO', 'Fueros / materias'],
  ['ETAPA_PROCESAL', 'Etapas procesales'],
  ['ESTADO_EXPEDIENTE', 'Estados de expediente'],
  ['JUZGADO', 'Juzgados / organismos'],
  ['ORIGEN_CONTACTO', 'Orígenes de contacto'],
  ['TIPO_EVENTO', 'Tipos de evento puntual'],
  ['TIPO_EVENTO_RECURRENTE', 'Tipos de evento recurrente'],
  ['MEDIO_PAGO', 'Medios de pago'],
  ['RUBRO_GASTO', 'Rubros de gasto'],
];

function Listas() {
  const puede = useAuth((s) => s.puede);
  const [tipo, setTipo] = useState('FUERO');
  const [nuevo, setNuevo] = useState('');
  const [scope, setScope] = useState('EXPEDIENTE');
  const [aDesactivar, setADesactivar] = useState(null);

  const consulta = useQuery({
    queryKey: ['catalogos', 'lista', tipo],
    queryFn: () => get('/catalogos', { tipo, incluirInactivos: true }),
  });

  const INVALIDAR = [['catalogos']];

  const crear = useGuardar((body) => post('/catalogos', body), {
    invalidar: INVALIDAR,
    onExito: () => setNuevo(''),
  });

  const actualizar = useGuardar(({ id, body }) => put('/catalogos/' + id, body), {
    invalidar: INVALIDAR,
  });

  const desactivar = useGuardar((id) => del('/catalogos/' + id), {
    invalidar: INVALIDAR,
    onExito: () => setADesactivar(null),
  });

  const error = errorDe(crear);

  return (
    <>
      <Aviso>
        <span>ⓘ</span>
        <span>
          Las opciones nunca se borran: se <strong>desactivan</strong>. Así, un registro viejo sigue
          mostrando su valor aunque la opción ya no se ofrezca para cargas nuevas. Es la solución al
          problema que tenía la planilla cuando se borraba un valor de una lista ya usada.
        </span>
      </Aviso>

      <div className="filtros">
        <SelectorFlotante
          label="Catálogo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ minWidth: 'min(240px, 100%)' }}
        >
          {TIPOS_CATALOGO.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </SelectorFlotante>

        {puede('catalogos:escribir') ? (
          <form
            className="fila"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              crear.mutate({
                tipo,
                valor: nuevo,
                orden: 999,
                scope: tipo === 'RUBRO_GASTO' ? scope : null,
                computaComoActivo: true,
              });
            }}
          >
            <input
              type="text"
              placeholder="Agregar una opción nueva..."
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              style={{ minWidth: 'min(260px, 100%)' }}
              required
            />
            {tipo === 'RUBRO_GASTO' ? (
              <SelectorFlotante label="Alcance" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="EXPEDIENTE">De expediente</option>
                <option value="ESTUDIO">Del estudio</option>
              </SelectorFlotante>
            ) : null}
            <button type="submit" className="btn btn-primario btn-chico" disabled={crear.isPending}>
              + Agregar
            </button>
          </form>
        ) : null}
      </div>

      {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

      <Panel sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data || []}
          vacio={<Vacio titulo="Esta lista está vacía" />}
          columnas={[
            { clave: 'valor', titulo: 'Opción', render: (f) => <span className={f.activo ? '' : 'gris'}>{f.valor}</span> },
            {
              clave: 'scope',
              titulo: 'Ámbito',
              ancho: 150,
              render: (f) => (f.scope ? etiqueta(f.scope) : <span className="gris">—</span>),
            },
            {
              clave: 'computaComoActivo',
              titulo: 'Cuenta como activa',
              ancho: 160,
              render: (f) =>
                tipo === 'ESTADO_EXPEDIENTE' ? (
                  puede('catalogos:escribir') ? (
                    <input
                      type="checkbox"
                      checked={f.computaComoActivo}
                      onChange={() =>
                        actualizar.mutate({
                          id: f.id,
                          body: {
                            valor: f.valor,
                            orden: f.orden,
                            activo: f.activo,
                            scope: f.scope,
                            computaComoActivo: !f.computaComoActivo,
                          },
                        })
                      }
                      style={{ width: 15, height: 15, accentColor: 'var(--oro)' }}
                      title="Si está marcado, las causas en este estado cuentan como activas en el tablero"
                    />
                  ) : (
                    <span>{f.computaComoActivo ? 'Sí' : 'No'}</span>
                  )
                ) : (
                  <span className="gris">—</span>
                ),
            },
            {
              clave: 'activo',
              titulo: 'Estado',
              ancho: 110,
              render: (f) =>
                f.activo ? <span className="verde">Activa</span> : <span className="gris">Desactivada</span>,
            },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 130,
              render: (f) =>
                puede('catalogos:escribir') ? (
                  f.activo ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico rojo"
                      onClick={() => setADesactivar(f)}
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico verde"
                      onClick={() =>
                        actualizar.mutate({
                          id: f.id,
                          body: {
                            valor: f.valor,
                            orden: f.orden,
                            activo: true,
                            scope: f.scope,
                            computaComoActivo: f.computaComoActivo,
                          },
                        })
                      }
                    >
                      Reactivar
                    </button>
                  )
                ) : null,
            },
          ]}
        />
      </Panel>

      <Confirmar
        abierto={!!aDesactivar}
        titulo="Desactivar la opción"
        mensaje={
          aDesactivar
            ? '"' +
              aDesactivar.valor +
              '" deja de ofrecerse para cargas nuevas, pero los registros que ya la usan la siguen mostrando.'
            : ''
        }
        textoBoton="Desactivar"
        procesando={desactivar.isPending}
        onCancelar={() => setADesactivar(null)}
        onConfirmar={() => desactivar.mutate(aDesactivar.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function Abogados() {
  const puede = useAuth((s) => s.puede);
  const [editando, setEditando] = useState(null);
  const abogados = useAbogados();

  const guardar = useGuardar(
    ({ id, body }) => (id ? put('/abogados/' + id, body) : post('/abogados', body)),
    { invalidar: [['abogados'], ['dashboard']], onExito: () => setEditando(null) }
  );

  const error = errorDe(guardar);

  return (
    <>
      <div className="filtros">
        {puede('abogados:escribir') ? (
          <button
            type="button"
            className="btn btn-primario btn-chico"
            onClick={() => setEditando({ nombre: '', matricula: '', email: '', telefono: '', activo: true })}
          >
            + Nuevo abogado
          </button>
        ) : null}
      </div>

      <Panel sinPadding>
        <Tabla
          consulta={abogados}
          filas={abogados.data || []}
          vacio={<Vacio titulo="No hay abogados cargados" />}
          columnas={[
            { clave: 'nombre', titulo: 'Nombre', render: (a) => <span className="negrita">{a.nombre}</span> },
            { clave: 'matricula', titulo: 'Matrícula', ancho: 130 },
            { clave: 'email', titulo: 'Email', ancho: 240 },
            { clave: 'telefono', titulo: 'Teléfono', ancho: 140 },
            { clave: 'cantidadClientes', titulo: 'Clientes', ancho: 90, align: 'right' },
            { clave: 'cantidadExpedientes', titulo: 'Causas', ancho: 90, align: 'right' },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 90,
              render: (a) =>
                puede('abogados:escribir') ? (
                  <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(a)}>
                    Editar
                  </button>
                ) : null,
            },
          ]}
        />
      </Panel>

      {editando ? (
        <Modal
          abierto
          titulo={editando.id ? 'Editar abogado' : 'Nuevo abogado'}
          onCerrar={() => setEditando(null)}
          chico
          pie={
            <>
              <button type="button" className="btn" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button type="submit" form="form-abo" className="btn btn-primario" disabled={guardar.isPending}>
                Guardar
              </button>
            </>
          }
        >
          <form
            id="form-abo"
            onSubmit={(e) => {
              e.preventDefault();
              guardar.mutate({
                id: editando.id,
                body: {
                  nombre: editando.nombre,
                  matricula: editando.matricula || null,
                  email: editando.email || null,
                  telefono: editando.telefono || null,
                  activo: editando.activo !== false,
                },
              });
            }}
          >
            {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}
            <Texto
              label="Nombre"
              obligatorio
              valor={editando.nombre}
              onChange={(v) => setEditando((a) => ({ ...a, nombre: v }))}
              error={error && error.porCampo ? error.porCampo.nombre : null}
            />
            <Texto
              label="Matrícula"
              valor={editando.matricula}
              onChange={(v) => setEditando((a) => ({ ...a, matricula: v }))}
            />
            <Texto
              label="Email"
              type="email"
              valor={editando.email}
              onChange={(v) => setEditando((a) => ({ ...a, email: v }))}
              error={error && error.porCampo ? error.porCampo.email : null}
              ayuda="A esta casilla llegan los avisos de vencimientos, si el correo está configurado."
            />
            <Texto
              label="Teléfono"
              valor={editando.telefono}
              onChange={(v) => setEditando((a) => ({ ...a, telefono: v }))}
            />
            <Check
              label="Activo"
              valor={editando.activo !== false}
              onChange={(v) => setEditando((a) => ({ ...a, activo: v }))}
              ayuda="Un abogado inactivo no se ofrece en los desplegables, pero sigue siendo el responsable histórico de sus causas."
            />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function CalendarioProcesal() {
  const puede = useAuth((s) => s.puede);
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);

  const feriados = useQuery({
    queryKey: ['plazos', 'feriados', anio],
    queryFn: () => get('/plazos/feriados', { anio }),
  });

  const ferias = useQuery({
    queryKey: ['plazos', 'ferias'],
    queryFn: () => get('/plazos/ferias'),
  });

  const tipos = useQuery({
    queryKey: ['plazos', 'tipos'],
    queryFn: () => get('/plazos/tipos'),
  });

  const [nuevoFeriado, setNuevoFeriado] = useState({ fecha: '', descripcion: '', jurisdiccion: 'NACION' });

  const crearFeriado = useGuardar((body) => post('/plazos/feriados', body), {
    invalidar: [['plazos']],
    onExito: () => setNuevoFeriado({ fecha: '', descripcion: '', jurisdiccion: 'NACION' }),
  });

  const borrarFeriado = useGuardar((id) => del('/plazos/feriados/' + id), { invalidar: [['plazos']] });

  return (
    <>
      <Aviso>
        <span>⚠</span>
        <span>
          El sistema hace la <strong>aritmética</strong> del calendario, no interpreta derecho
          procesal. Cuántos días tiene cada plazo, desde cuándo corre y si se cuenta en días hábiles
          o corridos son <strong>datos que carga el estudio</strong> según su jurisdicción y su
          fuero. Los tipos de plazo que trae el sistema son orientativos y hay que revisarlos.
        </span>
      </Aviso>

      <div className="grid grid-2">
        <Panel titulo="Feriados" icono="▤" sinPadding>
          {puede('plazos:escribir') ? (
            <form
              className="filtros"
              style={{ padding: '12px 14px 0', marginBottom: 0 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!nuevoFeriado.fecha || !nuevoFeriado.descripcion) return;
                crearFeriado.mutate(nuevoFeriado);
              }}
            >
              <SelectorFecha
                valor={nuevoFeriado.fecha}
                onChange={(v) => setNuevoFeriado((f) => ({ ...f, fecha: v || '' }))}
                obligatorio
              />
              <input
                type="text"
                placeholder="Descripción"
                value={nuevoFeriado.descripcion}
                onChange={(e) => setNuevoFeriado((f) => ({ ...f, descripcion: e.target.value }))}
                required
              />
              <button type="submit" className="btn btn-chico btn-primario">
                + Agregar
              </button>
            </form>
          ) : null}

          <div className="filtros" style={{ padding: '10px 14px 0', marginBottom: 0 }}>
            <SelectorFlotante label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {[anioActual - 1, anioActual, anioActual + 1].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectorFlotante>
          </div>

          <Tabla
            consulta={feriados}
            filas={feriados.data || []}
            vacio={<Vacio titulo="Sin feriados cargados para este año" />}
            columnas={[
              { clave: 'fecha', titulo: 'Fecha', ancho: 100, render: (f) => fecha(f.fecha) },
              { clave: 'descripcion', titulo: 'Descripción' },
              { clave: 'jurisdiccion', titulo: 'Jurisdicción', ancho: 120 },
              {
                clave: 'acciones',
                titulo: '',
                ancho: 46,
                render: (f) =>
                  puede('plazos:escribir') ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico rojo"
                      onClick={() => borrarFeriado.mutate(f.id)}
                    >
                      ✕
                    </button>
                  ) : null,
              },
            ]}
          />
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel titulo="Ferias judiciales" icono="▦" sinPadding>
            <Tabla
              consulta={ferias}
              filas={ferias.data || []}
              vacio={<Vacio titulo="Sin ferias cargadas" />}
              columnas={[
                { clave: 'desde', titulo: 'Desde', ancho: 100, render: (f) => fecha(f.desde) },
                { clave: 'hasta', titulo: 'Hasta', ancho: 100, render: (f) => fecha(f.hasta) },
                { clave: 'descripcion', titulo: 'Descripción' },
                { clave: 'jurisdiccion', titulo: 'Jurisdicción', ancho: 110 },
              ]}
            />
          </Panel>

          <Panel titulo="Tipos de plazo" icono="⏱" sinPadding>
            <Tabla
              consulta={tipos}
              filas={tipos.data || []}
              vacio={<Vacio titulo="Sin tipos de plazo cargados" />}
              columnas={[
                { clave: 'nombre', titulo: 'Plazo' },
                { clave: 'dias', titulo: 'Días', ancho: 62, align: 'right' },
                {
                  clave: 'computo',
                  titulo: 'Cómputo',
                  ancho: 100,
                  render: (t) => etiqueta(t.computo),
                },
                { clave: 'fuero', titulo: 'Fuero', ancho: 140 },
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

const ROLES = ['ADMIN', 'ABOGADO', 'SECRETARIA', 'LECTURA'];

function Usuarios() {
  const [editando, setEditando] = useState(null);
  const [reseteando, setReseteando] = useState(null);

  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => get('/usuarios') });
  const abogados = useAbogados();

  const guardar = useGuardar(
    ({ id, body }) => (id ? put('/usuarios/' + id, body) : post('/usuarios', body)),
    { invalidar: [['usuarios']], onExito: () => setEditando(null) }
  );

  const desbloquear = useGuardar((id) => post('/usuarios/' + id + '/desbloquear'), {
    invalidar: [['usuarios']],
  });

  const error = errorDe(guardar);
  const opcionesAbogados = (abogados.data || []).map((a) => ({ valor: a.id, texto: a.nombre }));

  return (
    <>
      <Aviso>
        <span>ⓘ</span>
        <span>
          Los permisos se aplican en el <strong>servidor</strong>, en cada pedido. Ocultar un botón
          es solo comodidad visual: aunque alguien fuerce la interfaz, la API igual le responde 403.
        </span>
      </Aviso>

      <div className="filtros">
        <button
          type="button"
          className="btn btn-primario btn-chico"
          onClick={() =>
            setEditando({ email: '', nombre: '', password: '', rol: 'LECTURA', abogadoId: null, activo: true })
          }
        >
          + Nuevo usuario
        </button>
      </div>

      <Panel sinPadding>
        <Tabla
          consulta={usuarios}
          filas={usuarios.data || []}
          vacio={<Vacio titulo="No hay usuarios" />}
          columnas={[
            { clave: 'nombre', titulo: 'Nombre', render: (u) => <span className="negrita">{u.nombre}</span> },
            { clave: 'email', titulo: 'Email', ancho: 260 },
            { clave: 'rol', titulo: 'Rol', ancho: 140, render: (u) => etiqueta(u.rol) },
            { clave: 'abogado', titulo: 'Ficha de abogado', ancho: 180 },
            {
              clave: 'activo',
              titulo: 'Estado',
              ancho: 130,
              render: (u) =>
                u.bloqueado ? (
                  <span className="rojo">Bloqueado</span>
                ) : u.activo ? (
                  <span className="verde">Activo</span>
                ) : (
                  <span className="gris">Inactivo</span>
                ),
            },
            {
              clave: 'ultimoLoginEn',
              titulo: 'Último ingreso',
              ancho: 150,
              render: (u) => (u.ultimoLoginEn ? fechaHora(u.ultimoLoginEn) : '—'),
            },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 210,
              render: (u) => (
                <div className="fila" style={{ gap: 4 }}>
                  {u.bloqueado ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico verde"
                      onClick={() => desbloquear.mutate(u.id)}
                    >
                      Desbloquear
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-sutil btn-chico" onClick={() => setReseteando(u)}>
                    Contraseña
                  </button>
                  <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(u)}>
                    Editar
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Panel>

      {editando ? (
        <Modal
          abierto
          titulo={editando.id ? 'Editar usuario' : 'Nuevo usuario'}
          onCerrar={() => setEditando(null)}
          chico
          pie={
            <>
              <button type="button" className="btn" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button type="submit" form="form-usr" className="btn btn-primario" disabled={guardar.isPending}>
                Guardar
              </button>
            </>
          }
        >
          <form
            id="form-usr"
            onSubmit={(e) => {
              e.preventDefault();
              const body = editando.id
                ? {
                    nombre: editando.nombre,
                    rol: editando.rol,
                    abogadoId: editando.abogadoId || null,
                    activo: editando.activo !== false,
                  }
                : {
                    email: editando.email,
                    nombre: editando.nombre,
                    password: editando.password,
                    rol: editando.rol,
                    abogadoId: editando.abogadoId || null,
                    activo: true,
                  };
              guardar.mutate({ id: editando.id, body });
            }}
          >
            {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

            {!editando.id ? (
              <Texto
                label="Email"
                type="email"
                obligatorio
                valor={editando.email}
                onChange={(v) => setEditando((u) => ({ ...u, email: v }))}
                error={error && error.porCampo ? error.porCampo.email : null}
              />
            ) : null}

            <Texto
              label="Nombre"
              obligatorio
              valor={editando.nombre}
              onChange={(v) => setEditando((u) => ({ ...u, nombre: v }))}
              error={error && error.porCampo ? error.porCampo.nombre : null}
            />

            {!editando.id ? (
              <Texto
                label="Contraseña inicial"
                type="password"
                obligatorio
                valor={editando.password}
                onChange={(v) => setEditando((u) => ({ ...u, password: v }))}
                error={error && error.porCampo ? error.porCampo.password : null}
                ayuda="Mínimo 10 caracteres, con mayúscula, minúscula y número."
              />
            ) : null}

            <Selector
              label="Rol"
              obligatorio
              valor={editando.rol}
              onChange={(v) => setEditando((u) => ({ ...u, rol: v }))}
              opciones={opcionesDeEnum(ROLES, etiqueta)}
              error={error && error.porCampo ? error.porCampo.rol : null}
            />
            <Selector
              label="Ficha de abogado"
              numerico
              valor={editando.abogadoId}
              onChange={(v) => setEditando((u) => ({ ...u, abogadoId: v }))}
              opciones={opcionesAbogados}
              vacio="— Sin vincular —"
              ayuda="Vincular habilita el filtro «solo mis causas»."
            />

            {editando.id ? (
              <Check
                label="Activo"
                valor={editando.activo !== false}
                onChange={(v) => setEditando((u) => ({ ...u, activo: v }))}
                ayuda="Desactivar cierra sus sesiones abiertas de inmediato."
              />
            ) : null}
          </form>
        </Modal>
      ) : null}

      {reseteando ? (
        <ResetPassword usuario={reseteando} onCerrar={() => setReseteando(null)} />
      ) : null}
    </>
  );
}

function ResetPassword({ usuario, onCerrar }) {
  const [password, setPassword] = useState('');
  const guardar = useGuardar((body) => post('/usuarios/' + usuario.id + '/password', body), {
    invalidar: [['usuarios']],
    onExito: onCerrar,
  });
  const error = errorDe(guardar);

  return (
    <Modal
      abierto
      titulo={'Restablecer contraseña · ' + usuario.nombre}
      onCerrar={onCerrar}
      chico
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-reset" className="btn btn-primario" disabled={guardar.isPending}>
            Restablecer
          </button>
        </>
      }
    >
      <form
        id="form-reset"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate({ password });
        }}
      >
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}
        <Texto
          label="Contraseña nueva"
          type="password"
          obligatorio
          valor={password}
          onChange={setPassword}
          error={error && error.porCampo ? error.porCampo.password : null}
          ayuda="Mínimo 10 caracteres, con mayúscula, minúscula y número."
        />
        <p className="chico gris">
          Al restablecerla se cierran todas las sesiones de esta persona. Comunicásela por un canal
          seguro y pedile que la cambie al entrar.
        </p>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function Auditoria() {
  const [filtros, setFiltros] = useState({ entidad: '', accion: '', page: 1 });

  const consulta = useQuery({
    queryKey: ['audit', filtros],
    queryFn: () =>
      get('/audit', {
        page: filtros.page,
        limit: 50,
        entidad: filtros.entidad || undefined,
        accion: filtros.accion || undefined,
      }),
  });

  const ENTIDADES = ['Cliente', 'Expediente', 'EventoPuntual', 'EventoRecurrente', 'Honorario', 'Gasto', 'Usuario'];
  const ACCIONES = ['CREAR', 'ACTUALIZAR', 'ELIMINAR', 'LOGIN', 'LOGIN_FALLIDO', 'LOGOUT', 'DESCARGA'];

  return (
    <>
      <Aviso>
        <span>ⓘ</span>
        <span>
          Registro de solo lectura: no hay forma de editarlo ni borrarlo desde la aplicación. Un log
          que se puede modificar no sirve como log.
        </span>
      </Aviso>

      <div className="filtros">
        <SelectorFlotante
          label="Entidad"
          value={filtros.entidad}
          onChange={(e) => setFiltros((f) => ({ ...f, entidad: e.target.value, page: 1 }))}
        >
          <option value="">Todas las entidades</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </SelectorFlotante>
        <SelectorFlotante
          label="Acción"
          value={filtros.accion}
          onChange={(e) => setFiltros((f) => ({ ...f, accion: e.target.value, page: 1 }))}
        >
          <option value="">Todas las acciones</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>
              {etiqueta(a)}
            </option>
          ))}
        </SelectorFlotante>
      </div>

      <Panel sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data || []}
          vacio={<Vacio titulo="Sin registros de auditoría" />}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha y hora', ancho: 150, render: (a) => fechaHora(a.fecha) },
            { clave: 'usuario', titulo: 'Usuario', ancho: 170 },
            {
              clave: 'accion',
              titulo: 'Acción',
              ancho: 130,
              render: (a) => (
                <span className={a.accion === 'ELIMINAR' || a.accion === 'LOGIN_FALLIDO' ? 'rojo' : ''}>
                  {etiqueta(a.accion)}
                </span>
              ),
            },
            {
              clave: 'entidad',
              titulo: 'Registro',
              ancho: 170,
              render: (a) => (
                <span className="codigo">
                  {a.entidad}
                  {a.entidadId ? ' #' + a.entidadId : ''}
                </span>
              ),
            },
            { clave: 'campo', titulo: 'Campo', ancho: 140 },
            {
              clave: 'valorAnterior',
              titulo: 'Antes',
              render: (a) => (
                <span className="chico gris truncar" style={{ maxWidth: 220 }}>
                  {a.valorAnterior || '—'}
                </span>
              ),
            },
            {
              clave: 'valorNuevo',
              titulo: 'Después',
              render: (a) => (
                <span className="chico truncar" style={{ maxWidth: 220 }}>
                  {a.valorNuevo || '—'}
                </span>
              ),
            },
            { clave: 'ip', titulo: 'IP', ancho: 120, render: (a) => <span className="codigo">{a.ip || '—'}</span> },
          ]}
        />
        <div className="paginacion" style={{ padding: '11px 14px' }}>
          <button
            type="button"
            className="btn btn-chico"
            disabled={filtros.page <= 1}
            onClick={() => setFiltros((f) => ({ ...f, page: f.page - 1 }))}
          >
            ‹ Anterior
          </button>
          <span className="chico">Página {filtros.page}</span>
          <button
            type="button"
            className="btn btn-chico"
            disabled={!consulta.data || consulta.data.length < 50}
            onClick={() => setFiltros((f) => ({ ...f, page: f.page + 1 }))}
          >
            Siguiente ›
          </button>
        </div>
      </Panel>
    </>
  );
}
