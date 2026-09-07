/**
 * FICHA DEL EXPEDIENTE: todo lo de una causa en una sola vista.
 *
 * Aclaración importante, la misma que hacía la planilla: los honorarios y lo
 * cobrado son del CLIENTE ENTERO, porque la cuenta se lleva por cliente. Los
 * gastos, en cambio, sí son de esta causa puntual.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, descargar } from '../lib/api.js';
import { Cabecera } from '../components/Cabecera.jsx';
import { Tabla } from '../components/Tabla.jsx';
import {
  Panel,
  Stat,
  Vacio,
  Cargando,
  ErrorCarga,
  Importe,
  SemaforoConDias,
  Chip,
  Aviso,
} from '../components/Comunes.jsx';
import { useExpedientesOpciones } from '../hooks/useDatos.js';
import { fecha, etiqueta, pesos } from '../lib/formato.js';

export function Ficha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const expedientes = useExpedientesOpciones();
  const [elegido, setElegido] = useState(id ? Number(id) : null);

  useEffect(() => {
    if (id) setElegido(Number(id));
  }, [id]);

  function cambiar(valor) {
    const nuevo = valor ? Number(valor) : null;
    setElegido(nuevo);
    navegar(nuevo ? '/ficha/' + nuevo : '/ficha');
  }

  return (
    <>
      <Cabecera
        titulo="Ficha del expediente"
        subtitulo="Estado procesal, importes e historial completo de movimientos de la causa"
      >
        <select value={elegido || ''} onChange={(e) => cambiar(e.target.value)} style={{ minWidth: 380 }}>
          <option value="">— Elegí un expediente —</option>
          {(expedientes.data || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.codigo} · {e.caratula}
            </option>
          ))}
        </select>
        {elegido ? (
          <button
            type="button"
            className="btn btn-chico"
            onClick={() => descargar('/export/ficha/' + elegido + '.pdf', 'ficha.pdf')}
          >
            ↓ PDF
          </button>
        ) : null}
      </Cabecera>

      {elegido ? (
        <Detalle expedienteId={elegido} />
      ) : (
        <Vacio
          titulo="Elegí un expediente"
          texto="Es la hoja que conviene abrir antes de atender al cliente o de ir al juzgado."
        />
      )}
    </>
  );
}

function Detalle({ expedienteId }) {
  const consulta = useQuery({
    queryKey: ['ficha', expedienteId],
    queryFn: () => get('/ficha/' + expedienteId),
  });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError) return <ErrorCarga error={consulta.error} onReintentar={consulta.refetch} />;

  const f = consulta.data;
  const e = f.expediente;
  const s = f.seguimiento;
  const alertas = s.alertas || {};

  return (
    <>
      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat etiqueta="Estado" icono="◉" valor={e.estado || '—'} pie="Situación procesal" />
        <Stat etiqueta="Etapa procesal" icono="⚖" valor={e.etapa || '—'} pie="En qué instancia está" />
        {/* Fecha mas semaforo: no entra en <Stat>, pero copia su estructura
            para no desalinearse del resto de la fila. */}
        <div className="stat">
          <div className="stat-cabecera">
            <div className="stat-texto">
              <div className="etiqueta">Próximo vencimiento</div>
              <div className="valor" style={{ fontSize: 20 }}>
                {fecha(s.proximoVto)}
              </div>
              <div style={{ marginTop: 6 }}>
                <SemaforoConDias item={{ situacion: s.situacion, situacionEtiqueta: s.situacionEtiqueta, diasTexto: s.diasTexto }} />
              </div>
            </div>
            <div className="icono" aria-hidden="true">
              ◷
            </div>
          </div>
        </div>
        <Stat
          etiqueta="Saldo del cliente"
          icono="⚑"
          tono="vencido"
          valor={pesos(f.economia.saldoDelCliente)}
          pie="Lo que debe en total"
        />
      </div>

      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat etiqueta="Movimientos" icono="≡" valor={s.movimientos} pie="Eventos registrados" />
        <Stat etiqueta="Pendientes" icono="◔" tono="proximo" valor={s.pendientes} pie="Todavía sin cumplir" />
        <Stat etiqueta="Vencidos" icono="⚠" tono="vencido" valor={s.vencidos} pie="Plazos ya pasados" />
        <Stat etiqueta="Cumplidos" icono="✓" tono="verde" valor={s.cumplidos} pie="Ya resueltos" />
      </div>

      {/* Alertas procesales: caducidad y prescripción */}
      {alertas.caducidad && alertas.caducidad.nivel !== 'OK' ? (
        <Aviso tipo={alertas.caducidad.nivel === 'VENCIDO' ? 'error' : ''}>
          <span>⚠</span>
          <span>
            <strong>Caducidad de instancia:</strong> con {alertas.caducidad.mesesAplicados} meses desde
            la última actuación, el plazo{' '}
            {alertas.caducidad.nivel === 'VENCIDO'
              ? 'venció el ' + fecha(alertas.caducidad.fechaLimite)
              : 'cae el ' + fecha(alertas.caducidad.fechaLimite) + ' (' + alertas.caducidad.dias + ' días)'}
            . Verificá si corresponde impulsar el expediente.
          </span>
        </Aviso>
      ) : null}

      {alertas.prescripcion && alertas.prescripcion.nivel !== 'OK' ? (
        <Aviso tipo={alertas.prescripcion.nivel === 'VENCIDO' ? 'error' : ''}>
          <span>⚠</span>
          <span>
            <strong>Prescripción:</strong> la fecha cargada es el{' '}
            {fecha(alertas.prescripcion.fechaLimite)} ({alertas.prescripcion.dias} días).
          </span>
        </Aviso>
      ) : null}

      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <Panel titulo="Datos del expediente" icono="⚖">
          <dl className="datos">
            <dt>Código</dt>
            <dd className="codigo">{e.codigo}</dd>
            <dt>Carátula</dt>
            <dd className="negrita">{e.caratula}</dd>
            <dt>Cliente</dt>
            <dd>
              <Link to={'/cuenta-corriente/' + e.clienteId}>{e.cliente}</Link>
            </dd>
            <dt>Carácter</dt>
            <dd>{etiqueta(e.caracter)}</dd>
            <dt>Contraparte</dt>
            <dd>{e.contraparte || '—'}</dd>
            <dt>Fuero / materia</dt>
            <dd>{e.fuero || '—'}</dd>
            <dt>Juzgado</dt>
            <dd>{e.juzgado || '—'}</dd>
            <dt>N° de expediente</dt>
            <dd>{e.numeroExpediente || '—'}</dd>
          </dl>
        </Panel>

        <Panel titulo="Seguimiento e importes" icono="◫">
          <dl className="datos">
            <dt>Fecha de inicio</dt>
            <dd>{fecha(e.fechaInicio)}</dd>
            <dt>Última actuación</dt>
            <dd>{fecha(e.ultimaActuacion)}</dd>
            <dt>Abogado responsable</dt>
            <dd>{e.abogado || '—'}</dd>
            <dt>Monto reclamado</dt>
            <dd className="mono">{e.montoReclamado ? pesos(e.montoReclamado) : '—'}</dd>
            <dt>Honorarios del cliente</dt>
            <dd className="mono">{pesos(f.economia.honorariosDelCliente)}</dd>
            <dt>Cobrado del cliente</dt>
            <dd className="mono verde">{pesos(f.economia.cobradoDelCliente)}</dd>
            <dt>Gastos de esta causa</dt>
            <dd className="mono">{pesos(f.economia.gastosDeLaCausa)}</dd>
            <dt>Gastos sin reintegrar</dt>
            <dd className="mono oro">{pesos(f.economia.gastosPendientesReintegro)}</dd>
          </dl>
          <p className="chico gris" style={{ marginBottom: 0, marginTop: 10 }}>
            Los honorarios y lo cobrado son del cliente entero, porque la cuenta se lleva por cliente.
            Los gastos sí son de esta causa puntual.
          </p>
        </Panel>
      </div>

      {e.observaciones ? (
        <Panel titulo="Observaciones de la causa" icono="✎">
          <p style={{ margin: 0 }}>{e.observaciones}</p>
        </Panel>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <Panel titulo="Detalle de movimientos del expediente" icono="⚑" sinPadding>
          <Tabla
            filas={f.movimientos}
            vacio={<Vacio titulo="Esta causa todavía no tiene vencimientos cargados" />}
            columnas={[
              {
                clave: 'fechaVto',
                titulo: 'Fecha',
                ancho: 96,
                render: (m) => (
                  <div>
                    <div className="mono">{fecha(m.fechaVto)}</div>
                    {m.hora ? <div className="chico oro">{m.hora}</div> : null}
                  </div>
                ),
              },
              { clave: 'tipo', titulo: 'Tipo de evento', ancho: 150 },
              { clave: 'descripcion', titulo: 'Descripción / detalle' },
              { clave: 'responsable', titulo: 'Responsable', ancho: 140 },
              {
                clave: 'prioridad',
                titulo: 'Prior.',
                ancho: 74,
                render: (m) => <Chip valor={m.prioridad} />,
              },
              {
                clave: 'estado',
                titulo: 'Estado',
                ancho: 110,
                render: (m) => etiqueta(m.estado),
              },
              {
                clave: 'situacion',
                titulo: 'Situación',
                ancho: 185,
                render: (m) => <SemaforoConDias item={m} />,
              },
            ]}
          />
        </Panel>
      </div>

      <div style={{ marginTop: 14 }}>
        <Panel titulo="Gastos de la causa" icono="−" sinPadding>
          <Tabla
            filas={f.gastos}
            vacio={<Vacio titulo="Sin gastos cargados en esta causa" />}
            columnas={[
              {
                clave: 'codigo',
                titulo: 'ID',
                ancho: 74,
                render: (g) => <span className="codigo">{g.codigo}</span>,
              },
              { clave: 'fecha', titulo: 'Fecha', ancho: 96, render: (g) => fecha(g.fecha) },
              { clave: 'rubro', titulo: 'Rubro', ancho: 180 },
              { clave: 'detalle', titulo: 'Detalle' },
              {
                clave: 'importe',
                titulo: 'Importe',
                ancho: 130,
                align: 'right',
                render: (g) => <Importe valor={g.importe} />,
              },
              {
                clave: 'estadoReintegro',
                titulo: 'Reintegro',
                ancho: 130,
                render: (g) =>
                  g.reembolsable ? (
                    <Chip valor={g.estadoReintegro} clase={g.estadoReintegro === 'PENDIENTE' ? 'MEDIA' : 'BAJA'} />
                  ) : (
                    <span className="gris chico">No reembolsable</span>
                  ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
