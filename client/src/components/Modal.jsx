/**
 * Modal y dialogo de confirmacion.
 *
 * Accesibilidad y comodidad de carga: se cierra con Escape, bloquea el scroll
 * de fondo mientras esta abierto y devuelve el foco al abrirse. La app se usa
 * mucho con teclado, asi que estos detalles no son adorno.
 */
import { useEffect, useRef } from 'react';

export function Modal({ abierto, titulo, onCerrar, children, pie, chico }) {
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    const alPresionar = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPresionar);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco al primer campo: se puede empezar a escribir sin tocar el mouse.
    const primero = caja.current
      ? caja.current.querySelector('input, select, textarea, button')
      : null;
    if (primero) primero.focus();

    return () => {
      document.removeEventListener('keydown', alPresionar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="modal-fondo"
      onMouseDown={(e) => {
        // Solo cierra si el click empezo en el fondo: si no, arrastrar una
        // seleccion de texto desde adentro cerraria el formulario a medio llenar.
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className={'modal' + (chico ? ' chico' : '')}
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <header className="modal-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="btn btn-sutil fila-fin" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="modal-cuerpo">{children}</div>
        {pie ? <footer className="modal-pie">{pie}</footer> : null}
      </div>
    </div>
  );
}

/**
 * Confirmacion para acciones destructivas. Se usa en todas las bajas: nada se
 * borra sin un paso intermedio.
 */
export function Confirmar({ abierto, titulo, mensaje, textoBoton, onConfirmar, onCancelar, procesando }) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo || 'Confirmar'}
      onCerrar={onCancelar}
      chico
      pie={
        <>
          <button type="button" className="btn" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-peligro" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Procesando...' : textoBoton || 'Eliminar'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--texto-2)' }}>{mensaje}</p>
    </Modal>
  );
}
