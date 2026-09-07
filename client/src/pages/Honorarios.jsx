/**
 * HONORARIOS Y COBRANZAS.
 *
 * Diferencia central con la planilla: el "cobrado" no se escribe, se registra
 * cada COBRO con su fecha y su medio de pago, y el total sale de la suma. Por
 * eso es imposible que se duplique, que era el bug documentado del Excel.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, getPaginado, post, put, del, descargar } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { useRangoPeriodo } from '../store/ui.js';
import { Cabecera, SelectorPeriodo } from '../components/Cabecera.jsx';
import { Tabla, Paginacion, useTabla } from '../components/Tabla.jsx';
import { Panel, Stat, Aviso, Vacio, Progreso, Importe, Semaforo } from '../components/Comunes.jsx';
import { Modal, Confirmar } from '../components/Modal.jsx';
import { Fecha, Selector, AreaTexto, Monto, Calculado, Texto, opcionesDeEnum } from '../components/Campos.jsx';
import {
  useOpcionesCatalogo,
  useClientesOpciones,
  useExpedientesOpciones,
  useGuardar,
  errorDe,
} from '../hooks/useDatos.js';
import { fecha, etiqueta, pesos, hoyISO } from '../lib/formato.js';

const TIPOS_PACTO = ['MONTO_FIJO', 'POR_ETAPAS', 'CUOTA_LITIS', 'POR_HORA', 'ABONO_MENSUAL'];
const IVAS = [0, 10.5, 21];

const VACIO = {
  clienteId: null,
  expedienteId: null,
  fechaPacto: null,
  tipoPacto: 'MONTO_FIJO',
  montoPactado: null,
  ivaPorcentaje: 21,
  observaciones: '',
};

export function Honorarios() {
  const puede = useAuth((s) => s.puede);
  const rango = useRangoPeriodo();
  const tabla = useTabla('fechaPacto', 'desc');

  const [filtros, setFiltros] = useState({ clienteId: '', situacion: '', tipoPacto: '' });
  const [editando, setEditando] = useState(null);
  const [cobrando, setCobrando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);

  const clientes = useClientesOpciones();
  const expedientes = useExpedientesOpciones();
  const mediosPago = useOpcionesCatalogo('MEDIO_PAGO');

  const params = {
    page: tabla.page,
    limit: 25,
    ordenarPor: tabla.ordenarPor,
    orden: tabla.orden,
    q: tabla.q || undefined,
    clienteId: filtros.clienteId || undefined,
    situacion: filtros.situacion || undefined,
    tipoPacto: filtros.tipoPacto || undefined,
  };

  const consulta = useQuery({
    queryKey: ['honorarios', params],
    queryFn: () => getPaginado('/honorarios', params),
    placeholderData: (previo) => previo,
  });

  const resumen = useQuery({
    queryKey: ['honorarios', 'resumen', rango],
    queryFn: () => get('/honorarios/resumen', rango),
  });

  const eliminar = useGuardar((id) => del('/honorarios/' + id), {
    invalidar: [['honorarios'], ['dashboard'], ['cuenta-corriente']],
    onExito: () => setAEliminar(null),
  });

  const opcionesClientes = (clientes.data || []).map((c) => ({
    valor: c.id,
    texto: c.nombre + ' (' + c.codigo + ')',
  }));

  function cambiarFiltro(clave, valor) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    tabla.resetPagina();
  }

  const t = resumen.data ? resumen.data.totales : null;

  return (
    <>
      <Cabecera
        titulo="Honorarios y cobranzas"
        subtitulo="Lo pactado y lo cobrado, con saldo, porcentaje y semáforo de cobranza"
      >
        <SelectorPeriodo />
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => descargar('/export/honorarios.csv', 'honorarios.csv')}
        >
          ↓ CSV
        </button>
        {puede('honorarios:escribir') ? (
          <button type="button" className="btn btn-primario" onClick={() => setEditando(VACIO)}>
            + Nuevo pacto
          </button>
        ) : null}
      </Cabecera>

      {t ? (
        <div className="grid-stats" style={{ marginBottom: 14 }}>
          <Stat etiqueta="Total pactado" icono="▤" tono="oro" valor={pesos(t.totalConIva)} pie="Honorarios con IVA" />
          <Stat etiqueta="Total cobrado" icono="✓" tono="verde" valor={pesos(t.totalCobrado)} pie="Lo que ya entró" />
          <Stat etiqueta="Saldo a cobrar" icono="⚑" tono="vencido" valor={pesos(t.saldoACobrar)} pie="Lo que falta entrar" />
          <Stat
            etiqueta="Cobrado en el período"
            icono="$"
            valor={pesos(resumen.data.cobradoPeriodo)}
            pie="Según la fecha de cada cobro"
          />
        </div>
      ) : null}

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por cliente..."
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
        <select value={filtros.situacion} onChange={(e) => cambiarFiltro('situacion', e.target.value)}>
          <option value="">Toda situación</option>
          <option value="COBRADO">Cobrado</option>
          <option value="PARCIAL">Parcial</option>
          <option value="SIN_COBRAR">Sin cobrar</option>
        </select>
        <select value={filtros.tipoPacto} onChange={(e) => cambiarFiltro('tipoPacto', e.target.value)}>
          <option value="">Todo tipo de pacto</option>
          {TIPOS_PACTO.map((p) => (
            <option key={p} value={p}>
              {etiqueta(p)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid-principal">
        <Panel sinPadding>
          <Tabla
            consulta={consulta}
            filas={consulta.data ? consulta.data.items : []}
            vacio={<Vacio titulo="No hay honorarios que coincidan" />}
            ordenarPor={tabla.ordenarPor}
            orden={tabla.orden}
            onOrdenar={tabla.alternarOrden}
            columnas={[
              {
                clave: 'codigo',
                titulo: 'ID',
                ancho: 74,
                render: (f) => <span className="codigo">{f.codigo}</span>,
              },
              {
                clave: 'fechaPacto',
                titulo: 'Pacto',
                ancho: 92,
                ordenable: true,
                render: (f) => <span className="mono chico">{fecha(f.fechaPacto)}</span>,
              },
              {
                clave: 'cliente',
                titulo: 'Cliente',
                render: (f) => (
                  <div>
                    <Link to={'/cuenta-corriente/' + f.clienteId} className="negrita">
                      {f.cliente}
                    </Link>
                    <span className="chico gris truncar" style={{ maxWidth: 260 }}>
                      {etiqueta(f.tipoPacto)}
                      {f.expediente ? ' · ' + f.expediente : ''}
                    </span>
                  </div>
                ),
              },
              {
                clave: 'totalConIva',
                titulo: 'Total c/IVA',
                ancho: 125,
                align: 'right',
                render: (f) => (
                  <div>
                    <Importe valor={f.totalConIva} />
                    <div className="chico gris">IVA {f.ivaPorcentaje}%</div>
                  </div>
                ),
              },
              {
                clave: 'cobrado',
                titulo: 'Cobrado',
                ancho: 125,
                align: 'right',
                render: (f) => (
                  <div>
                    <Importe valor={f.cobrado} />
                    <div className="chico gris">
                      {f.cantidadPagos} pago{f.cantidadPagos === 1 ? '' : 's'}
                      {f.ultimoCobro ? ' · ' + fecha(f.ultimoCobro) : ''}
                    </div>
                  </div>
                ),
              },
              {
                clave: 'saldo',
                titulo: 'Saldo',
                ancho: 125,
                align: 'right',
                render: (f) => <Importe valor={f.saldo} resaltarSiPositivo />,
              },
              {
                clave: 'porcentajeCobrado',
                titulo: '% cob.',
                ancho: 120,
                render: (f) => <Progreso valor={f.porcentajeCobrado} />,
              },
              {
                clave: 'situacion',
                titulo: 'Situación',
                ancho: 110,
                render: (f) => (
                  <Semaforo
                    situacion={
                      f.situacion === 'COBRADO'
                        ? 'CUMPLIDO'
                        : f.situacion === 'PARCIAL'
                          ? 'POR_VENCER'
                          : 'VENCIDO'
                    }
                    texto={etiqueta(f.situacion)}
                  />
                ),
              },
              {
                clave: 'acciones',
                titulo: '',
                ancho: 160,
                render: (f) => (
                  <div className="fila" style={{ gap: 4 }}>
                    {puede('honorarios:escribir') ? (
                      <button
                        type="button"
                        className="btn btn-sutil btn-chico verde"
                        onClick={() => setCobrando(f)}
                        title="Registrar un cobro"
                      >
                        + Cobro
                      </button>
                    ) : null}
                    {puede('honorarios:escribir') ? (
                      <button type="button" className="btn btn-sutil btn-chico" onClick={() => setEditando(f)}>
                        Editar
                      </button>
                    ) : null}
                    {puede('honorarios:eliminar') ? (
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

        <Panel titulo="Mayores saldos pendientes" icono="⚑" sinPadding>
          <Tabla
            filas={resumen.data ? resumen.data.mayoresSaldos : []}
            claveFila={(f) => f.clienteId}
            vacio={<Vacio titulo="Sin saldos" texto="Toda la cartera está cobrada." />}
            columnas={[
              {
                clave: 'cliente',
                titulo: 'Cliente',
                render: (f) => (
                  <Link to={'/cuenta-corriente/' + f.clienteId} className="truncar" style={{ maxWidth: 120 }}>
                    {f.cliente}
                  </Link>
                ),
              },
              {
                clave: 'porcentajeCobrado',
                titulo: '%',
                ancho: 58,
                align: 'right',
                render: (f) => f.porcentajeCobrado + '%',
              },
              {
                clave: 'saldo',
                titulo: 'Saldo',
                ancho: 112,
                align: 'right',
                render: (f) => <Importe valor={f.saldo} resaltarSiPositivo />,
              },
            ]}
          />
        </Panel>
      </div>

      {editando ? (
        <FormularioHonorario
          inicial={editando}
          clientes={opcionesClientes}
          expedientes={expedientes.data || []}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      {cobrando ? (
        <PanelCobros honorario={cobrando} mediosPago={mediosPago} onCerrar={() => setCobrando(null)} />
      ) : null}

      <Confirmar
        abierto={!!aEliminar}
        titulo="Dar de baja el pacto de honorarios"
        mensaje={
          aEliminar
            ? 'Se va a dar de baja ' +
              aEliminar.codigo +
              ' de ' +
              aEliminar.cliente +
              '. Los cobros registrados quedan en el historial.'
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

function FormularioHonorario({ inicial, clientes, expedientes, onCerrar }) {
  const esNuevo = !inicial.id;
  const [datos, setDatos] = useState({
    ...VACIO,
    ...inicial,
    fechaPacto: inicial.fechaPacto || hoyISO(),
  });

  const guardar = useGuardar(
    (body) => (esNuevo ? post('/honorarios', body) : put('/honorarios/' + inicial.id, body)),
    { invalidar: [['honorarios'], ['dashboard'], ['cuenta-corriente']], onExito: onCerrar }
  );

  const error = errorDe(guardar);
  const campo = (c) => (error && error.porCampo ? error.porCampo[c] : null);
  const set = (c) => (v) => setDatos((d) => ({ ...d, [c]: v }));

  // Solo se ofrecen los expedientes del cliente elegido: el backend rechaza
  // imputar un pacto a la causa de otro cliente.
  const expedientesDelCliente = expedientes
    .filter((e) => !datos.clienteId || e.clienteId === datos.clienteId)
    .map((e) => ({ valor: e.id, texto: e.caratula }));

  const total =
    datos.montoPactado != null
      ? datos.montoPactado * (1 + Number(datos.ivaPorcentaje || 0) / 100)
      : null;

  function enviar(e) {
    e.preventDefault();
    const body = {
      clienteId: datos.clienteId,
      expedienteId: datos.expedienteId || null,
      fechaPacto: datos.fechaPacto,
      tipoPacto: datos.tipoPacto,
      montoPactado: datos.montoPactado,
      ivaPorcentaje: datos.ivaPorcentaje,
      observaciones: datos.observaciones || null,
    };
    if (!esNuevo) body.version = inicial.version;
    guardar.mutate(body);
  }

  return (
    <Modal
      abierto
      titulo={esNuevo ? 'Nuevo pacto de honorarios' : 'Editar ' + inicial.codigo}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-hon" className="btn btn-primario" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-hon" onSubmit={enviar}>
        {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

        <Aviso>
          <span>ⓘ</span>
          <span>
            Podés cargar más de un pacto por cliente (por ejemplo, uno por causa). Los cobros se
            registran aparte, con el botón «+ Cobro».
          </span>
        </Aviso>

        <div className="form-grid">
          <Selector
            label="Cliente"
            obligatorio
            numerico
            valor={datos.clienteId}
            onChange={(v) => setDatos((d) => ({ ...d, clienteId: v, expedienteId: null }))}
            opciones={clientes}
            error={campo('clienteId')}
          />
          <Selector
            label="Expediente (opcional)"
            numerico
            valor={datos.expedienteId}
            onChange={set('expedienteId')}
            opciones={expedientesDelCliente}
            vacio="— Sin imputar a una causa —"
            error={campo('expedienteId')}
          />
          <Fecha
            label="Fecha del pacto"
            obligatorio
            valor={datos.fechaPacto}
            onChange={set('fechaPacto')}
            error={campo('fechaPacto')}
          />
          <Selector
            label="Tipo de pacto"
            obligatorio
            valor={datos.tipoPacto}
            onChange={set('tipoPacto')}
            opciones={opcionesDeEnum(TIPOS_PACTO, etiqueta)}
            error={campo('tipoPacto')}
          />
          <Monto
            label="Honorarios pactados"
            obligatorio
            valor={datos.montoPactado}
            onChange={set('montoPactado')}
            error={campo('montoPactado')}
          />
          <Selector
            label="IVA %"
            valor={datos.ivaPorcentaje}
            onChange={(v) => set('ivaPorcentaje')(Number(v))}
            opciones={IVAS.map((i) => ({ valor: i, texto: i + '%' }))}
            error={campo('ivaPorcentaje')}
          />
          <Calculado
            label="Total con IVA"
            ancho
            valor={total == null ? null : pesos(total)}
            ayuda="Se calcula solo: pactado más IVA."
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

/** Alta y baja de cobros de un pacto. */
function PanelCobros({ honorario, mediosPago, onCerrar }) {
  const puede = useAuth((s) => s.puede);
  const [nuevo, setNuevo] = useState({
    fecha: hoyISO(),
    monto: null,
    medioPagoId: null,
    observacion: '',
  });

  const detalle = useQuery({
    queryKey: ['honorarios', honorario.id],
    queryFn: () => get('/honorarios/' + honorario.id),
    initialData: honorario,
  });

  const INVALIDAR = [['honorarios'], ['dashboard'], ['cuenta-corriente']];

  const agregar = useGuardar((body) => post('/honorarios/' + honorario.id + '/pagos', body), {
    invalidar: INVALIDAR,
    onExito: () => setNuevo({ fecha: hoyISO(), monto: null, medioPagoId: null, observacion: '' }),
  });

  const borrar = useGuardar((pagoId) => del('/honorarios/' + honorario.id + '/pagos/' + pagoId), {
    invalidar: INVALIDAR,
  });

  const error = errorDe(agregar);
  const h = detalle.data;

  return (
    <Modal abierto titulo={'Cobros · ' + honorario.cliente} onCerrar={onCerrar}>
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <Stat etiqueta="Total c/IVA" icono="▤" valor={pesos(h.totalConIva)} />
        <Stat etiqueta="Cobrado" icono="✓" tono="verde" valor={pesos(h.cobrado)} />
        <Stat etiqueta="Saldo" icono="⚑" tono="vencido" valor={pesos(h.saldo)} />
      </div>

      {h.saldoAFavorCliente > 0 ? (
        <Aviso>
          <span>ⓘ</span>
          <span>
            El cliente pagó {pesos(h.saldoAFavorCliente)} de más sobre este pacto. Verificá si
            corresponde imputarlo a otra causa.
          </span>
        </Aviso>
      ) : null}

      {puede('honorarios:escribir') ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            agregar.mutate({
              fecha: nuevo.fecha,
              monto: nuevo.monto,
              medioPagoId: nuevo.medioPagoId || null,
              observacion: nuevo.observacion || null,
            });
          }}
        >
          {error ? <Aviso tipo="error">{error.mensaje}</Aviso> : null}

          <div className="form-grid">
            <Fecha
              label="Fecha del cobro"
              obligatorio
              valor={nuevo.fecha}
              onChange={(v) => setNuevo((n) => ({ ...n, fecha: v }))}
              error={error && error.porCampo ? error.porCampo.fecha : null}
            />
            <Monto
              label="Monto"
              obligatorio
              valor={nuevo.monto}
              onChange={(v) => setNuevo((n) => ({ ...n, monto: v }))}
              error={error && error.porCampo ? error.porCampo.monto : null}
            />
            <Selector
              label="Medio de pago"
              numerico
              valor={nuevo.medioPagoId}
              onChange={(v) => setNuevo((n) => ({ ...n, medioPagoId: v }))}
              opciones={mediosPago}
            />
            <Texto
              label="Observación"
              valor={nuevo.observacion}
              onChange={(v) => setNuevo((n) => ({ ...n, observacion: v }))}
            />
          </div>

          <button type="submit" className="btn btn-primario" disabled={agregar.isPending}>
            {agregar.isPending ? 'Registrando...' : 'Registrar cobro'}
          </button>
        </form>
      ) : null}

      <div className="mt-16">
        <Tabla
          filas={h.pagos || []}
          vacio={<Vacio titulo="Todavía no hay cobros registrados" />}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: 100, render: (p) => fecha(p.fecha) },
            {
              clave: 'monto',
              titulo: 'Monto',
              ancho: 130,
              align: 'right',
              render: (p) => <Importe valor={p.monto} />,
            },
            { clave: 'medioPago', titulo: 'Medio de pago', ancho: 140 },
            { clave: 'observacion', titulo: 'Observación' },
            {
              clave: 'acciones',
              titulo: '',
              ancho: 46,
              render: (p) =>
                puede('honorarios:escribir') ? (
                  <button
                    type="button"
                    className="btn btn-sutil btn-chico rojo"
                    title="Eliminar este cobro"
                    disabled={borrar.isPending}
                    onClick={() => borrar.mutate(p.id)}
                  >
                    ✕
                  </button>
                ) : null,
            },
          ]}
        />
      </div>
    </Modal>
  );
}
