/**
 * CUENTA CORRIENTE DEL CLIENTE.
 *
 * Es la hoja para imprimir o mandarle al cliente cuando pregunta cómo viene la
 * cuenta. Se arma sola: honorarios + gastos a reintegrar en el debe, los pagos
 * en el haber, y el saldo acumulado movimiento a movimiento.
 *
 * Los gastos ya marcados como reintegrados NO entran: se consideran saldados.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, descargar } from '../lib/api.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla } from '../components/Tabla.jsx';
import { Panel, Stat, Vacio, Cargando, ErrorCarga, Importe, Semaforo, Progreso } from '../components/Comunes.jsx';
import { useClientesOpciones } from '../hooks/useDatos.js';
import { fecha, etiqueta, pesos } from '../lib/formato.js';

export function CuentaCorriente() {
  const { id } = useParams();
  const navegar = useNavigate();
  const clientes = useClientesOpciones();
  const [elegido, setElegido] = useState(id ? Number(id) : null);

  useEffect(() => {
    if (id) setElegido(Number(id));
  }, [id]);

  function cambiarCliente(valor) {
    const nuevo = valor ? Number(valor) : null;
    setElegido(nuevo);
    navegar(nuevo ? '/cuenta-corriente/' + nuevo : '/cuenta-corriente');
  }

  return (
    <>
      <Cabecera
        titulo="Cuenta corriente"
        subtitulo="Lo facturado, lo que puso el estudio y lo que el cliente pagó"
      >
        <select
          value={elegido || ''}
          onChange={(e) => cambiarCliente(e.target.value)}
          style={{ minWidth: 'min(300px, 100%)' }}
        >
          <option value="">— Elegí un cliente —</option>
          {(clientes.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.codigo})
            </option>
          ))}
        </select>
        {elegido ? (
          <button
            type="button"
            className="btn btn-chico"
            onClick={() => descargar('/export/cuenta-corriente/' + elegido + '.pdf', 'cuenta-corriente.pdf')}
          >
            ↓ PDF
          </button>
        ) : null}
      </Cabecera>

      {elegido ? <DetalleCuenta clienteId={elegido} /> : <ResumenCartera onElegir={cambiarCliente} />}
    </>
  );
}

// ---------------------------------------------------------------------------

function ResumenCartera({ onElegir }) {
  const consulta = useQuery({
    queryKey: ['cuenta-corriente', 'resumen'],
    queryFn: () => get('/cuenta-corriente/resumen'),
  });

  const t = consulta.data ? consulta.data.totales : null;

  return (
    <>
      {t ? (
        <div className="grid-stats" style={{ marginBottom: 14 }}>
          <Stat etiqueta="Facturado a la cartera" icono="▤" tono="oro" valor={pesos(t.facturado)} />
          <Stat etiqueta="Cobrado" icono="✓" tono="verde" valor={pesos(t.cobrado)} />
          <Stat etiqueta="Saldo total a cobrar" icono="⚑" tono="vencido" valor={pesos(t.saldo)} />
        </div>
      ) : null}

      <Panel titulo="Cuenta de cada cliente" icono="≡" sinPadding>
        <Tabla
          consulta={consulta}
          filas={consulta.data ? consulta.data.clientes : []}
          claveFila={(f) => f.clienteId}
          onFilaClick={(f) => onElegir(f.clienteId)}
          vacio={
            <Vacio
              titulo="Todavía no hay cuentas para mostrar"
              texto="Cargá honorarios o gastos de causa y acá vas a ver la cuenta de cada cliente."
            />
          }
          columnas={[
            {
              clave: 'codigo',
              titulo: 'ID',
              ancho: 74,
              render: (f) => <span className="codigo">{f.codigo}</span>,
            },
            { clave: 'cliente', titulo: 'Cliente', render: (f) => <span className="negrita">{f.cliente}</span> },
            {
              clave: 'honorarios',
              titulo: 'Honorarios',
              ancho: 130,
              align: 'right',
              render: (f) => <Importe valor={f.honorarios} />,
            },
            {
              clave: 'gastos',
              titulo: 'Gastos a reint.',
              ancho: 130,
              align: 'right',
              render: (f) => <Importe valor={f.gastos} />,
            },
            {
              clave: 'facturado',
              titulo: 'Total facturado',
              ancho: 135,
              align: 'right',
              render: (f) => <Importe valor={f.facturado} />,
            },
            {
              clave: 'cobrado',
              titulo: 'Cobrado',
              ancho: 130,
              align: 'right',
              render: (f) => <Importe valor={f.cobrado} />,
            },
            {
              clave: 'porcentajeCobrado',
              titulo: '% cancelado',
              ancho: 130,
              render: (f) => <Progreso valor={f.porcentajeCobrado} />,
            },
            {
              clave: 'saldo',
              titulo: 'Saldo',
              ancho: 135,
              align: 'right',
              render: (f) => <Importe valor={f.saldo} resaltarSiPositivo />,
            },
          ]}
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------

function DetalleCuenta({ clienteId }) {
  const consulta = useQuery({
    queryKey: ['cuenta-corriente', clienteId],
    queryFn: () => get('/cuenta-corriente/' + clienteId),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError) return <ErrorCarga error={consulta.error} onReintentar={consulta.refetch} />;

  const c = consulta.data;
  const t = c.totales;

  const situacionSemaforo =
    t.situacion === 'AL_DIA' ? 'CUMPLIDO' : t.situacion === 'SIN_PAGOS' ? 'VENCIDO' : 'POR_VENCER';

  return (
    <>
      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat etiqueta="Honorarios" icono="▤" valor={pesos(t.honorarios)} pie="Pactado con IVA" />
        <Stat etiqueta="Gastos a reintegrar" icono="↧" valor={pesos(t.gastosAReintegrar)} pie="Los puso el estudio" />
        <Stat etiqueta="Total facturado" icono="$" tono="oro" valor={pesos(t.totalFacturado)} pie="Honorarios + gastos" />
        <Stat etiqueta="Cobrado" icono="✓" tono="verde" valor={pesos(t.cobrado)} pie="Lo que ya pagó" />
      </div>

      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat etiqueta="Saldo" icono="⚑" tono="vencido" valor={pesos(t.saldo)} pie="Lo que debe hoy" />
        <Stat etiqueta="% cancelado" icono="◔" valor={t.porcentajeCancelado + '%'} pie="Sobre el total facturado" />
        <Stat etiqueta="Expedientes" icono="◫" valor={t.expedientes} pie="Causas del cliente" />
        {/* No usa <Stat> porque el valor es un badge y no un numero, pero
            respeta su estructura para que la tarjeta calce en la fila. */}
        <div className="stat">
          <div className="stat-cabecera">
            <div className="stat-texto">
              <div className="etiqueta">Situación</div>
              <Semaforo situacion={situacionSemaforo} texto={etiqueta(t.situacion)} />
            </div>
            <div className="icono" aria-hidden="true">
              ◉
            </div>
          </div>
          <div className="pie">Estado de la cuenta</div>
        </div>
      </div>

      {t.saldoAFavorCliente > 0 ? (
        <div className="aviso">
          <span>ⓘ</span>
          <span>
            El cliente tiene <strong>{pesos(t.saldoAFavorCliente)}</strong> a favor: pagó más de lo
            facturado hasta hoy.
          </span>
        </div>
      ) : null}

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <Panel titulo="Datos del cliente" icono="❑">
          <dl className="datos">
            <dt>Cliente</dt>
            <dd className="negrita">{c.cliente.nombre}</dd>
            <dt>Tipo de persona</dt>
            <dd>{c.cliente.tipoPersona === 'FISICA' ? 'Persona física' : 'Persona jurídica'}</dd>
            <dt>DNI / CUIT</dt>
            <dd>{c.cliente.documento || '—'}</dd>
            <dt>Teléfono</dt>
            <dd>{c.cliente.telefono || '—'}</dd>
            <dt>Email</dt>
            <dd>{c.cliente.email || '—'}</dd>
            <dt>Domicilio</dt>
            <dd>{c.cliente.domicilio || '—'}</dd>
            <dt>Provincia</dt>
            <dd>{c.cliente.provincia || '—'}</dd>
          </dl>
        </Panel>

        <Panel titulo="Condiciones y estado" icono="◫">
          <dl className="datos">
            <dt>Estado del cliente</dt>
            <dd>{etiqueta(c.cliente.estado)}</dd>
            <dt>Cliente desde</dt>
            <dd>{fecha(c.cliente.clienteDesde)}</dd>
            <dt>Abogado responsable</dt>
            <dd>{c.cliente.abogado || '—'}</dd>
            <dt>Tipo de pacto</dt>
            <dd>{c.condiciones.tipoPacto ? etiqueta(c.condiciones.tipoPacto) : '—'}</dd>
            <dt>Fecha del pacto</dt>
            <dd>{fecha(c.condiciones.fechaPacto)}</dd>
            <dt>Último cobro</dt>
            <dd>{fecha(c.condiciones.ultimoCobro)}</dd>
          </dl>
        </Panel>
      </div>

      <Panel
        titulo="Detalle de movimientos · ordenado por fecha"
        icono="≡"
        sinPadding
        acciones={
          <Link to={'/expedientes?clienteId=' + clienteId} className="chico">
            Ver sus expedientes →
          </Link>
        }
      >
        <Tabla
          filas={c.movimientos}
          claveFila={(f) => f.concepto + '-' + f.referencia + '-' + f.fecha + '-' + f.debe + '-' + f.haber}
          vacio={<Vacio titulo="Sin movimientos" texto="Este cliente todavía no tiene facturación ni pagos." />}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: 100, render: (f) => fecha(f.fecha) },
            {
              clave: 'concepto',
              titulo: 'Concepto',
              ancho: 165,
              render: (f) => (
                <span
                  className={
                    f.concepto === 'COBRO' ? 'verde' : f.concepto === 'HONORARIOS' ? 'oro' : ''
                  }
                >
                  {etiqueta(f.concepto)}
                </span>
              ),
            },
            {
              clave: 'referencia',
              titulo: 'Ref.',
              ancho: 78,
              render: (f) => <span className="codigo">{f.referencia}</span>,
            },
            { clave: 'detalle', titulo: 'Detalle' },
            {
              clave: 'debe',
              titulo: 'Debe',
              ancho: 130,
              align: 'right',
              render: (f) => (f.debe > 0 ? <Importe valor={f.debe} /> : <span className="gris">—</span>),
            },
            {
              clave: 'haber',
              titulo: 'Haber',
              ancho: 130,
              align: 'right',
              render: (f) =>
                f.haber > 0 ? (
                  <span className="mono verde">{pesos(f.haber)}</span>
                ) : (
                  <span className="gris">—</span>
                ),
            },
            {
              clave: 'saldo',
              titulo: 'Saldo',
              ancho: 135,
              align: 'right',
              render: (f) => <span className="mono negrita">{pesos(f.saldo)}</span>,
            },
          ]}
        />
      </Panel>

      <p className="chico gris mt-16">
        Los gastos ya marcados como «Reintegrado» no aparecen en la cuenta: se consideran saldados.
        Solo entran los que siguen en «Pendiente».
      </p>
    </>
  );
}
