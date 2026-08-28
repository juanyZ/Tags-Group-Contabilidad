/**
 * Tabla reutilizable con orden, paginacion y estados de carga/vacio/error.
 *
 * El orden y la paginacion son del SERVIDOR: la tabla solo avisa que cambio el
 * criterio y quien la usa vuelve a consultar. Ordenar en el cliente ordenaria
 * unicamente la pagina visible, que es un error clasico y confunde al usuario.
 *
 * @param columnas [{ clave, titulo, ancho, align, ordenable, render(fila) }]
 */
import { useState } from 'react';
import { Cargando, ErrorCarga, Vacio } from './Comunes.jsx';

export function Tabla({
  columnas,
  filas,
  consulta,
  vacio,
  onFilaClick,
  ordenarPor,
  orden,
  onOrdenar,
  claveFila,
}) {
  if (consulta && consulta.isLoading) return <Cargando />;
  if (consulta && consulta.isError) {
    return <ErrorCarga error={consulta.error} onReintentar={consulta.refetch} />;
  }
  if (!filas || filas.length === 0) return vacio || <Vacio />;

  const flecha = (clave) => {
    if (ordenarPor !== clave) return null;
    return <span className="oro"> {orden === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="tabla-wrap">
      <table className="tabla">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                className={
                  (c.ordenable && onOrdenar ? 'ordenable ' : '') +
                  (c.align === 'right' ? 'num ' : '') +
                  (c.clave === 'acciones' ? 'acciones-fila' : '')
                }
                style={c.ancho ? { width: c.ancho } : undefined}
                onClick={c.ordenable && onOrdenar ? () => onOrdenar(c.clave) : undefined}
                title={c.ordenable && onOrdenar ? 'Ordenar por ' + c.titulo : undefined}
              >
                {c.titulo}
                {c.ordenable ? flecha(c.clave) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr
              key={claveFila ? claveFila(fila) : fila.id != null ? fila.id : i}
              className={onFilaClick ? 'clickeable' : ''}
              onClick={onFilaClick ? () => onFilaClick(fila) : undefined}
            >
              {columnas.map((c) => (
                <td
                  key={c.clave}
                  // La columna de acciones se atenúa hasta que el mouse entra en
                  // la fila: baja el ruido visual de la grilla sin esconder los
                  // botones (siguen siendo alcanzables por teclado).
                  className={
                    (c.align === 'right' ? 'num ' : '') +
                    (c.clave === 'acciones' ? 'acciones-fila' : '')
                  }
                >
                  {c.render ? c.render(fila) : mostrar(fila[c.clave])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mostrar(valor) {
  if (valor == null || valor === '') return <span className="gris">—</span>;
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  return String(valor);
}

/** Paginador. `meta` es el que devuelve la API en el sobre de respuesta. */
export function Paginacion({ meta, pagina, onPagina }) {
  if (!meta || !meta.total) return null;

  const total = meta.total;
  const totalPaginas = meta.totalPaginas || 1;
  const desde = (pagina - 1) * meta.limit + 1;
  const hasta = Math.min(pagina * meta.limit, total);

  return (
    <div className="paginacion">
      <span>
        {desde}–{hasta} de <strong className="oro">{total}</strong>
      </span>
      {totalPaginas > 1 ? (
        <div className="paginas">
          <button
            type="button"
            className="btn btn-chico"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            ‹ Anterior
          </button>
          <span className="chico">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            className="btn btn-chico"
            disabled={pagina >= totalPaginas}
            onClick={() => onPagina(pagina + 1)}
          >
            Siguiente ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hook de estado de tabla: pagina, orden y busqueda en un solo lugar.
 * Cambiar el orden o el filtro vuelve a la pagina 1, que es lo que se espera.
 */
export function useTabla(ordenInicial, direccionInicial) {
  const [estado, setEstado] = useState({
    page: 1,
    ordenarPor: ordenInicial,
    orden: direccionInicial || 'desc',
    q: '',
  });

  return {
    ...estado,
    setPagina: (page) => setEstado((e) => ({ ...e, page })),
    setBusqueda: (q) => setEstado((e) => ({ ...e, q, page: 1 })),
    alternarOrden: (clave) =>
      setEstado((e) => ({
        ...e,
        page: 1,
        ordenarPor: clave,
        orden: e.ordenarPor === clave && e.orden === 'asc' ? 'desc' : 'asc',
      })),
    resetPagina: () => setEstado((e) => ({ ...e, page: 1 })),
  };
}
