/**
 * EVENTOS RECURRENTES.
 *
 * Se carga una vez el evento y su periodicidad; el próximo vencimiento se
 * proyecta solo. La diferencia con la planilla: el cumplimiento de cada período
 * queda registrado con fecha y autor, y el próximo vencimiento avanza solo. Ya
 * no hay que "borrar la columna de tildes" a fin de mes.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, del } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla } from '../components/Tabla.jsx';
import { Panel, Aviso, Vacio, SemaforoConDias, Cargando } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Texto, Fecha, Selector, AreaTexto, Check, opcionesDeEnum } from '../components/Campos.jsx';
import { useOpcionesCatalogo, useAbogados, useGuardar, errorDe } from '../hooks/useDatos.js';
import { fecha, fechaHora, etiqueta, hoyISO } from '../lib/formato.js';

const PERIODICIDADES = [
  'SEMANAL',
  'QUINCENAL',
  'MENSUAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'CUATRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
];

const VACIO = {
  descripcion: '',
  tipoId: null,
  periodicidad: 'MENSUAL',
  fechaBase: null,
  responsableId: null,
  activo: true,
  observaciones: '',
};

export function Recurrentes() {
  const puede = useAuth((s) => s.puede);
  const [editando, setEditando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [verHistorial, setVerHistorial] = useState(null);

  const tipos = useOpcionesCatalogo('TIPO_EVENTO_RECURRENTE');
  const abogados = useAbogados();

  const consulta = useQuery({
    queryKey: ['recurrentes'],
    queryFn: () => get('/recurrentes'),
  });

  const INVALIDAR = [['recurrentes'], ['calendario'], ['agenda'], ['dashboard']];

  const cumplir = useGuardar(
    ({ id, periodoClave }) => post('/recurrentes/' + id + '/cumplir', { periodoClave }),
    { invalidar: INVALIDAR }
  );

  const descumplir = useGuardar(
    ({ id, periodoClave }) => del('/recurrentes/' + id + '/cumplir/' + periodoClave),
    { invalidar: INVALIDAR }
  );

  const eliminar = useGuardar((id) => del('/recurrentes/' + id), {
    invalidar: INVALIDAR,
    onExito: () => setAEliminar(null),
  });

  const opcionesAbogados = (abogados.data || []).map((a) => ({ valor: a.id, texto: a.nombre }));

  return (
    <>
      <Cabecera
        titulo="Eventos recurrentes"
        subtitulo="Lo que se repite: se carga una sola vez y la próxima fecha se calcula sola"
      >
        {puede('recurrentes:escribir') ? (
          <button type="button" className="btn btn-primario" onClick={() => setEditando(VACIO)}>
            + Nuevo recurrente
          </button>
        ) : null}
      </Cabecera>

      <Aviso>
        <span>ⓘ</span>
        <span>
          Al marcar un período como cumplido, el próximo vencimiento avanza solo al siguiente y queda
          el registro de quién lo hizo y cuándo. No hace falta borrar nada a fin de mes.
        </span>
      </Aviso>

      <Panel sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data || []}
          vacio={<Vacio titulo="No hay eventos recurrentes cargados" />}
          columnas={[
            {
              clave: 'codigo',
              titulo: 'ID',
              ancho: 74,
              render: (f) => <span className="codigo">{f.codigo}</span>,
            },
            {
              clave: 'descripcion',
              titulo: 'Descripción del evento',
              render: (f) => (
                <div>
                  <span className={'negrita ' + (f.activo ? '' : 'gris')}>{f.descripcion}</span>
                  <span className="chico gris">{f.tipo || 'Sin tipo'}</span>
                </div>
              ),
            },
            {
              clave: 'periodicidad',
              titulo: 'Periodicidad',
              ancho: 120,
              render: (f) => etiqueta(f.periodicidad),
            },
            {
              clave: 'fechaBase',
              titulo: 'Fecha base',
              ancho: 100,
              render: (f) => <span className="mono chico">{fecha(f.fechaBase)}</span>,
            },
            { clave: 'responsable', titulo: 'Responsable', ancho: 140 },
            {
              clave: 'activo',
              titulo: 'Activo',
              ancho: 66,
              render: (f) =>
                f.activo ? <span className="verde">Sí</span> : <span className="gris">No</span>,
            },
            {
              clave: 'fechaVto',
              titulo: 'Próximo vto.',
              ancho: 100,
              render: (f) => <span className="mono">{fecha(f.fechaVto)}</span>,
            },
            {
              clave: 'situacion',
              titulo: 'Situación',
              ancho: 185,
              render: (f) =>
                f.activo ? <SemaforoConDias item={f} /> : <span className="badge SIN_FECHA">Inactivo</span>,
            },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 195,
              render: (f) => (
                <div className="fila" style={{ gap: 4 }}>
                  {puede('recurrentes:escribir') && f.activo && f.claveCumplimiento ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico verde"
                      title={'Marcar cumplido el período ' + fecha(f.claveCumplimiento)}
                      disabled={cumplir.isPending}
                      onClick={() =>
                        cumplir.mutate({ id: f.id, periodoClave: f.claveCumplimiento })
                      }
                    >
                      ✓ Cumplir
                    </button>
                  ) : null}
                  {f.ultimaCumplida && puede('recurrentes:escribir') ? (
                    <button
                      type="button"
                      className="btn btn-sutil btn-chico"
                      title={'Deshacer el tilde del período ' + fecha(f.ultimaCumplida)}
                      disabled={descumplir.isPending}
                      onClick={() =>
                        descumplir.mutate({ id: f.id, periodoClave: f.ultimaCumplida })
                      }
                    >
                      ↶
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sutil btn-chico"
                    onClick={() => setVerHistorial(f)}
                    title="Ver historial de cumplimientos"
                  >
                    ⧉
                  </button>
                  {puede('recurrentes:escribir') ? (
                    <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(f)}>
                      Editar
                    </button>
                  ) : null}
                  {puede('recurrentes:eliminar') ? (
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
      </Panel>

      {editando ? (
        <FormularioRecurrente
          inicial={editando}
          tipos={tipos}
          abogados={opcionesAbogados}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      {verHistorial ? (
        <Historial recurrente={verHistorial} onCerrar={() => setVerHistorial(null)} />
      ) : null}

      <Confirmar
        abierto={!!aEliminar}
        titulo="Eliminar el evento recurrente"
        mensaje={
          aEliminar
            ? 'Se va a dar de baja "' +
              aEliminar.descripcion +
              '". Si solo querés que deje de aparecer, alcanza con desmarcarlo como activo.'
            : ''
        }
        procesando={eliminar.isPending}
        onCancelar={() => setAEliminar(null)}
        onConfirmar={() => eliminar.mutate(aEliminar.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function Historial({ recurrente, onCerrar }) {
  const consulta = useQuery({
    queryKey: ['recurrentes', recurrente.id, 'historial'],
    queryFn: () => get('/recurrentes/' + recurrente.id + '/historial'),
  });

  return (
    <Modal abierto titulo={'Historial · ' + recurrente.descripcion} onCerrar={onCerrar}>
      {consulta.isLoading ? (
        <Cargando />
      ) : (
        <Tabla
          filas={consulta.data || []}
          claveFila={(f) => f.id}
          vacio={
            <Vacio
              titulo="Todavía no se cumplió ningún período"
              texto="Cuando marques uno como cumplido, va a quedar registrado acá."
            />
          }
          columnas={[
            {
              clave: 'periodoClave',
              titulo: 'Período',
              ancho: 110,
              render: (f) => <span className="mono">{fecha(f.periodoClave)}</span>,
            },
            {
              clave: 'cumplidoEn',
              titulo: 'Marcado el',
              ancho: 150,
              render: (f) => fechaHora(f.cumplidoEn),
            },
            { clave: 'cumplidoPor', titulo: 'Por' },
            { clave: 'observacion', titulo: 'Observación' },
          ]}
        />
      )}
    </Modal>
  );
}

function FormularioRecurrente({ inicial, tipos, abogados, onCerrar }) {
  const esNuevo = !inicial.id;
  const [datos, setDatos] = useState({
    ...VACIO,
    ...inicial,
    fechaBase: inicial.fechaBase || hoyISO(),
  });

  const guardar = useGuardar(
    (body) => (esNuevo ? post('/recurrentes', body) : put('/recurrentes/' + inicial.id, body)),
    { invalidar: [['recurrentes'], ['calendario'], ['agenda'], ['dashboard']], onExito: onCerrar }
  );

  const error = errorDe(guardar);
  const campo = (c) => (error && error.porCampo ? error.porCampo[c] : null);
  const set = (c) => (v) => setDatos((d) => ({ ...d, [c]: v }));

  function enviar(e) {
    e.preventDefault();
    const body = {
      descripcion: datos.descripcion,
      tipoId: datos.tipoId || null,
      periodicidad: datos.periodicidad,
      fechaBase: datos.fechaBase,
      responsableId: datos.responsableId || null,
      activo: datos.activo,
      observaciones: datos.observaciones || null,
    };
    if (!esNuevo) body.version = inicial.version;
    guardar.mutate(body);
  }

  return (
    <Modal
      abierto
      titulo={esNuevo ? 'Nuevo evento recurrente' : 'Editar ' + inicial.codigo}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-rec" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-rec" onSubmit={enviar}>
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

        <div className="form-grid">
          <Texto
            label="Descripción del evento"
            obligatorio
            ancho
            valor={datos.descripcion}
            onChange={set('descripcion')}
            error={campo('descripcion')}
            placeholder="Presentación DDJJ IVA del estudio"
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
            label="Periodicidad"
            obligatorio
            valor={datos.periodicidad}
            onChange={set('periodicidad')}
            opciones={opcionesDeEnum(PERIODICIDADES, etiqueta)}
            error={campo('periodicidad')}
          />
          <Fecha
            label="Fecha base"
            obligatorio
            valor={datos.fechaBase}
            onChange={set('fechaBase')}
            error={campo('fechaBase')}
            ayuda="La primera vez que ocurrió: desde ahí se proyecta todo."
          />
          <Selector
            label="Responsable"
            numerico
            valor={datos.responsableId}
            onChange={set('responsableId')}
            opciones={abogados}
            error={campo('responsableId')}
          />
          <div className="ancho-total">
            <Check
              label="Activo"
              valor={datos.activo}
              onChange={set('activo')}
              ayuda="En No deja de aparecer en el calendario y la agenda, sin borrarlo ni perder el historial."
            />
          </div>
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
