/**
 * TABLERO GENERAL - la pantalla de entrada.
 *
 * Recordatorio que vale la pena tener a la vista: las tres alertas de arriba
 * (vencidos / vencen hoy / por vencer) son SIEMPRE globales y no siguen el
 * filtro de período. Si se filtra agosto, un plazo vencido de julio tiene que
 * seguir apareciendo. El resto de los números sí responden al período.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useUI } from '../store/ui.js';
import { Cabecera, SelectorPeriodo } from '../components/Cabecera.jsx';
import { Panel, Stat, SemaforoConDias, Cargando, ErrorCarga, Vacio, Progreso, Importe } from '../components/Comunes.jsx';
import { Tabla } from '../components/Tabla.jsx';
import { fecha, fechaLarga, pesos, numero, porcentaje } from '../lib/formato.js';

export function Tablero() {
  const anio = useUI((s) => s.anio);
  const mes = useUI((s) => s.mes);

  const consulta = useQuery({
    queryKey: ['dashboard', anio, mes],
    queryFn: () => get('/dashboard', { anio, mes }),
    refetchInterval: 120000,
  });

  if (consulta.isLoading) return <Cargando texto="Armando el tablero..." />;
  if (consulta.isError) return <ErrorCarga error={consulta.error} onReintentar={consulta.refetch} />;

  const d = consulta.data;

  return (
    <>
      <Cabecera
        titulo="Tablero general"
        subtitulo={'Hoy es ' + fechaLarga(d.hoy) + ' · clientes, expedientes, vencimientos y economía del estudio'}
      >
        <SelectorPeriodo />
      </Cabecera>

      {/* --- Fila de indicadores ------------------------------------------ */}
      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat
          etiqueta="Vencidos"
          icono="⚠"
          tono="vencido"
          valor={numero(d.alertas.vencidos)}
          pie="Plazos ya pasados · global"
        />
        <Stat
          etiqueta="Vencen hoy"
          icono="◷"
          tono="hoy"
          valor={numero(d.alertas.venceHoy)}
          pie="Para hoy mismo · global"
        />
        <Stat
          etiqueta="Por vencer"
          icono="◔"
          tono="proximo"
          valor={numero(d.alertas.porVencer)}
          pie={'Dentro de ' + d.parametros.umbralDias + ' días · global'}
        />
        <Stat
          etiqueta="Expedientes"
          icono="◫"
          valor={numero(d.totales.expedientesActivos)}
          pie={'Causas activas de ' + d.totales.expedientesTotal + ' totales'}
        />
      </div>

      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <Stat
          etiqueta="Clientes"
          icono="❑"
          valor={numero(d.totales.clientesActivos)}
          pie={'Activos de ' + d.totales.clientesTotal + ' en cartera'}
        />
        <Stat
          etiqueta="Facturado"
          icono="▤"
          tono="oro"
          valor={pesos(d.resumenEconomico.facturado)}
          pie={'Honorarios del período'}
        />
        <Stat
          etiqueta="Cobrado"
          icono="✓"
          tono="verde"
          valor={pesos(d.resumenEconomico.cobrado)}
          pie="Cobros del período"
        />
        <Stat
          etiqueta="Gastos"
          icono="↧"
          valor={pesos(d.resumenEconomico.gastos)}
          pie="Salidas de caja del período"
        />
      </div>

      <div className="aviso">
        <span>ⓘ</span>
        <span>
          Las alertas de <strong>vencidos</strong>, <strong>vencen hoy</strong> y{' '}
          <strong>por vencer</strong> no siguen el filtro de período: es a propósito, para que un
          plazo atrasado de otro mes te siga apareciendo. Facturado, cobrado y gastos sí
          corresponden a <strong>{d.periodo.etiqueta.toLowerCase()}</strong>.
        </span>
      </div>

      {/* --- Vencimientos -------------------------------------------------- */}
      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <Panel titulo="Vencidos sin cumplir" icono="●" sinPadding>
          <Tabla
            columnas={[
              { clave: 'fechaVto', titulo: 'Fecha', ancho: 88, render: (f) => fecha(f.fechaVto) },
              {
                clave: 'descripcion',
                titulo: 'Qué hay que hacer',
                render: (f) => (
                  <div>
                    <span className="truncar">{f.descripcion}</span>
                    {f.cliente ? <span className="chico gris">{f.cliente}</span> : null}
                  </div>
                ),
              },
              { clave: 'responsable', titulo: 'Responsable', ancho: 130 },
              {
                clave: 'situacion',
                titulo: 'Situación',
                ancho: 165,
                render: (f) => <SemaforoConDias item={f} />,
              },
            ]}
            filas={d.vencidosSinCumplir}
            vacio={<Vacio titulo="Ningún plazo atrasado" texto="Todo al día." />}
          />
        </Panel>

        <Panel titulo="Próximos vencimientos" icono="▤" sinPadding>
          <Tabla
            columnas={[
              { clave: 'fechaVto', titulo: 'Fecha', ancho: 88, render: (f) => fecha(f.fechaVto) },
              {
                clave: 'descripcion',
                titulo: 'Qué hay que hacer',
                render: (f) => (
                  <div>
                    <span className="truncar">{f.descripcion}</span>
                    {f.cliente ? <span className="chico gris">{f.cliente}</span> : null}
                  </div>
                ),
              },
              { clave: 'responsable', titulo: 'Responsable', ancho: 130 },
              {
                clave: 'situacion',
                titulo: 'Situación',
                ancho: 165,
                render: (f) => <SemaforoConDias item={f} />,
              },
            ]}
            filas={d.proximosVencimientos}
            vacio={<Vacio titulo="Sin vencimientos próximos" />}
          />
        </Panel>
      </div>

      {/* --- Distribuciones ------------------------------------------------ */}
      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <Panel titulo="Expedientes por estado" icono="◫" sinPadding>
          <Tabla
            columnas={[
              { clave: 'estado', titulo: 'Estado' },
              { clave: 'cantidad', titulo: 'Cant.', ancho: 60, align: 'right' },
              {
                clave: 'porcentaje',
                titulo: '%',
                ancho: 110,
                render: (f) => <Progreso valor={f.porcentaje} />,
              },
            ]}
            filas={d.expedientesPorEstado}
            vacio={<Vacio titulo="Sin expedientes cargados" />}
          />
        </Panel>

        <Panel titulo="Causas por fuero" icono="⚖" sinPadding>
          <Tabla
            columnas={[
              { clave: 'fuero', titulo: 'Fuero / materia' },
              { clave: 'causas', titulo: 'Causas', ancho: 65, align: 'right' },
              { clave: 'vencimientos', titulo: 'Vtos.', ancho: 60, align: 'right' },
            ]}
            filas={d.causasPorFuero}
            vacio={<Vacio titulo="Sin datos" />}
          />
        </Panel>

        <Panel titulo="Cartera de clientes" icono="❑" sinPadding>
          <Tabla
            columnas={[
              { clave: 'estado', titulo: 'Situación' },
              { clave: 'cantidad', titulo: 'Cant.', ancho: 60, align: 'right' },
              {
                clave: 'porcentaje',
                titulo: '%',
                ancho: 110,
                render: (f) => <Progreso valor={f.porcentaje} />,
              },
            ]}
            filas={d.carteraClientes.items}
            vacio={<Vacio titulo="Sin clientes cargados" />}
          />
        </Panel>
      </div>

      {/* --- Carga y economía ---------------------------------------------- */}
      <div className="grid grid-2">
        <Panel titulo="Carga por abogado" icono="◉" sinPadding>
          <Tabla
            columnas={[
              { clave: 'abogado', titulo: 'Abogado / responsable' },
              { clave: 'causas', titulo: 'Causas', ancho: 70, align: 'right' },
              { clave: 'pendientes', titulo: 'Pend.', ancho: 65, align: 'right' },
              {
                clave: 'vencidos',
                titulo: 'Vencidos',
                ancho: 80,
                align: 'right',
                render: (f) =>
                  f.vencidos > 0 ? <span className="rojo negrita">{f.vencidos}</span> : '0',
              },
            ]}
            filas={d.cargaPorAbogado}
            vacio={<Vacio titulo="Sin abogados cargados" />}
          />
        </Panel>

        <Panel titulo={'Resumen económico · ' + d.periodo.etiqueta} icono="$">
          <dl className="datos" style={{ gridTemplateColumns: '1fr auto', gap: '9px 14px' }}>
            <dt style={{ textAlign: 'left' }}>Honorarios facturados en el período</dt>
            <dd className="mono derecha">{pesos(d.resumenEconomico.facturado)}</dd>

            <dt style={{ textAlign: 'left' }}>Cobrado en el período</dt>
            <dd className="mono derecha verde">{pesos(d.resumenEconomico.cobrado)}</dd>

            <dt style={{ textAlign: 'left' }}>Gastos de causas del período</dt>
            <dd className="mono derecha">{pesos(d.resumenEconomico.gastosCausas)}</dd>

            <dt style={{ textAlign: 'left' }}>Gastos del estudio del período</dt>
            <dd className="mono derecha">{pesos(d.resumenEconomico.gastosEstudio)}</dd>

            <dt style={{ textAlign: 'left' }} className="negrita oro">
              Resultado del período (cobrado − gastos)
            </dt>
            <dd
              className={
                'mono derecha negrita ' + (d.resumenEconomico.resultado >= 0 ? 'verde' : 'rojo')
              }
            >
              {pesos(d.resumenEconomico.resultado)}
            </dd>

            <dt style={{ textAlign: 'left' }}>Gastos pendientes de reintegro</dt>
            <dd className="mono derecha">{pesos(d.resumenEconomico.gastosPendientesReintegro)}</dd>

            <dt style={{ textAlign: 'left' }} className="negrita">
              Saldo total a cobrar (histórico)
            </dt>
            <dd className="mono derecha negrita rojo">{pesos(d.cobranzaGlobal.saldoTotalACobrar)}</dd>

            <dt style={{ textAlign: 'left' }}>% de cobranza general</dt>
            <dd className="derecha">{porcentaje(d.cobranzaGlobal.porcentajeCobranza)}</dd>
          </dl>
        </Panel>
      </div>

      {/* --- Mayores saldos ------------------------------------------------ */}
      <div style={{ marginTop: 14 }}>
        <Panel
          titulo="Mayores saldos a cobrar"
          icono="⚑"
          sinPadding
          acciones={
            <Link to="/cuenta-corriente" className="chico">
              Ver cuentas corrientes →
            </Link>
          }
        >
          <Tabla
            columnas={[
              {
                clave: 'cliente',
                titulo: 'Cliente',
                render: (f) => (
                  <Link to={'/cuenta-corriente/' + f.clienteId}>{f.cliente}</Link>
                ),
              },
              {
                clave: 'porcentajeCobrado',
                titulo: '% cobrado',
                ancho: 150,
                render: (f) => <Progreso valor={f.porcentajeCobrado} />,
              },
              {
                clave: 'facturado',
                titulo: 'Facturado',
                ancho: 130,
                align: 'right',
                render: (f) => <Importe valor={f.facturado} />,
              },
              {
                clave: 'saldo',
                titulo: 'Saldo',
                ancho: 130,
                align: 'right',
                render: (f) => <Importe valor={f.saldo} resaltarSiPositivo />,
              },
            ]}
            filas={d.mayoresSaldos}
            vacio={<Vacio titulo="Sin saldos pendientes" texto="Toda la cartera está al día." />}
          />
        </Panel>
      </div>
    </>
  );
}
