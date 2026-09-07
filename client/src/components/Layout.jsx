/**
 * Estructura general: barra lateral con las 12 solapas de la planilla y el
 * área de contenido.
 *
 * Las solapas van AGRUPADAS por naturaleza del trabajo (operación diaria,
 * economía, sistema). En la planilla eran doce pestañas en fila; acá, con
 * grupos, el ojo encuentra lo que busca sin leer las doce etiquetas.
 *
 * La cantidad de vencidos se muestra como badge rojo sobre "Vencimientos": es
 * el número que el estudio necesita ver apenas entra, sin ir al tablero.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { get, api, normalizarError } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { Modal } from './Modal.jsx';
import { Aviso } from './Comunes.jsx';
import { Texto } from './Campos.jsx';

const GRUPOS = [
  {
    titulo: 'Resumen',
    items: [{ a: '/', icono: '▦', texto: 'Tablero', exacto: true }],
  },
  {
    titulo: 'Operación',
    items: [
      { a: '/clientes', icono: '❑', texto: 'Clientes', permiso: 'clientes:leer' },
      { a: '/expedientes', icono: '⚖', texto: 'Expedientes', permiso: 'expedientes:leer' },
      { a: '/puntuales', icono: '⚑', texto: 'Vencimientos', permiso: 'eventos:leer' },
      { a: '/recurrentes', icono: '⟳', texto: 'Recurrentes', permiso: 'recurrentes:leer' },
    ],
  },
  {
    titulo: 'Agenda',
    items: [
      { a: '/calendario', icono: '▤', texto: 'Calendario', permiso: 'eventos:leer' },
      { a: '/agenda', icono: '☰', texto: 'Agenda semanal', permiso: 'eventos:leer' },
    ],
  },
  {
    titulo: 'Economía',
    items: [
      { a: '/honorarios', icono: '◈', texto: 'Honorarios', permiso: 'honorarios:leer' },
      { a: '/gastos', icono: '▽', texto: 'Gastos', permiso: 'gastos:leer' },
      {
        a: '/cuenta-corriente',
        icono: '≡',
        texto: 'Cuenta corriente',
        permiso: 'cuentacorriente:leer',
      },
    ],
  },
  {
    titulo: 'Consulta',
    items: [
      { a: '/ficha', icono: '◉', texto: 'Ficha del expediente', permiso: 'expedientes:leer' },
      { a: '/configuracion', icono: '⚙', texto: 'Configuración', permiso: 'config:leer' },
    ],
  },
];

const ETIQUETA_ROL = {
  ADMIN: 'Administrador',
  ABOGADO: 'Abogado',
  SECRETARIA: 'Secretaría',
  LECTURA: 'Solo lectura',
};

/** Iniciales para el avatar: "Dr. Luis Tagliapietra" -> "LT". */
function iniciales(nombre) {
  if (!nombre) return '·';
  return nombre
    .replace(/^(Dr|Dra|Sr|Sra)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function Layout() {
  const usuario = useAuth((s) => s.usuario);
  const puede = useAuth((s) => s.puede);
  const logout = useAuth((s) => s.logout);
  const navegar = useNavigate();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [navAbierto, setNavAbierto] = useState(false);
  const [cambiandoPass, setCambiandoPass] = useState(false);

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => get('/config'),
    staleTime: 5 * 60 * 1000,
  });

  // Alertas globales: se refrescan solas cada dos minutos.
  const tablero = useQuery({
    queryKey: ['dashboard', 'alertas'],
    queryFn: () => get('/dashboard'),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const vencidos = tablero.data ? tablero.data.alertas.vencidos : 0;
  const nombreEstudio = config.data ? config.data.nombreEstudio : 'TAGS Group';
  const titular = config.data ? config.data.titular : '';

  async function salir() {
    await logout();
    navegar('/login');
  }

  return (
    <div className="app">
      {navAbierto ? (
        <div className="sidebar-fondo" onClick={() => setNavAbierto(false)} />
      ) : null}

      <aside className={'sidebar' + (navAbierto ? ' abierto' : '')}>
        <div className="sidebar-marca">
          <div className="logo">{nombreEstudio}</div>
          <div className="bajada">Estudio jurídico integral</div>
          {titular ? <div className="titular">{titular}</div> : null}
        </div>

        <nav>
          {GRUPOS.map((grupo) => {
            const visibles = grupo.items.filter((i) => !i.permiso || puede(i.permiso));
            if (visibles.length === 0) return null;

            return (
              <div key={grupo.titulo}>
                <div className="sidebar-seccion">{grupo.titulo}</div>
                {visibles.map((s) => (
                  <NavLink
                    key={s.a}
                    to={s.a}
                    end={s.exacto}
                    onClick={() => setNavAbierto(false)}
                    className={({ isActive }) => 'nav-item' + (isActive ? ' activo' : '')}
                  >
                    <span className="icono">{s.icono}</span>
                    <span>{s.texto}</span>
                    {s.a === '/puntuales' && vencidos > 0 ? (
                      <span className="nav-badge" title={vencidos + ' vencimiento(s) atrasado(s)'}>
                        {vencidos}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-usuario">
          <button
            type="button"
            className="usuario-tarjeta"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
          >
            <span className="avatar">{iniciales(usuario ? usuario.nombre : '')}</span>
            <span className="datos-usuario">
              <span className="nombre">{usuario ? usuario.nombre : ''}</span>
              <span className="rol">{usuario ? ETIQUETA_ROL[usuario.rol] || usuario.rol : ''}</span>
            </span>
          </button>

          {menuAbierto ? (
            <div className="menu-usuario">
              <button
                type="button"
                className="btn btn-sutil btn-chico"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => {
                  setCambiandoPass(true);
                  setMenuAbierto(false);
                }}
              >
                Cambiar contraseña
              </button>
              <button
                type="button"
                className="btn btn-sutil btn-chico"
                style={{ justifyContent: 'flex-start' }}
                onClick={salir}
              >
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="contenido">
        <header className="topbar-movil">
          <button
            type="button"
            className="menu-movil-btn"
            onClick={() => setNavAbierto(true)}
            aria-label="Abrir menú"
            aria-expanded={navAbierto}
          >
            ☰
          </button>
          <span className="topbar-movil-marca">{nombreEstudio}</span>
        </header>

        <Outlet />
      </main>

      <CambiarPassword abierto={cambiandoPass} onCerrar={() => setCambiandoPass(false)} />
    </div>
  );
}

/** Cambio de contraseña propio. Al confirmarlo, el backend cierra la sesión. */
function CambiarPassword({ abierto, onCerrar }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cerrarLocal = useAuth((s) => s.cerrarLocal);

  async function enviar(e) {
    e.preventDefault();
    setError(null);

    if (nueva !== repetir) {
      setError({ mensaje: 'La contraseña nueva y su repetición no coinciden' });
      return;
    }

    setEnviando(true);
    try {
      await api.post('/auth/cambiar-password', { actual, nueva });
      // El backend revoca las sesiones: hay que volver a entrar.
      cerrarLocal();
    } catch (err) {
      setError(normalizarError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return null;

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar contraseña"
      onCerrar={onCerrar}
      chico
      pie={
        <>
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form="form-pass" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Cambiar'}
          </button>
        </>
      }
    >
      <form id="form-pass" onSubmit={enviar}>
        {error ? (
          <Aviso tipo="error">
            <span>⚠</span>
            <span>{error.mensaje}</span>
          </Aviso>
        ) : null}
        <Texto
          label="Contraseña actual"
          type="password"
          valor={actual}
          onChange={setActual}
          obligatorio
          autoComplete="current-password"
        />
        <Texto
          label="Contraseña nueva"
          type="password"
          valor={nueva}
          onChange={setNueva}
          obligatorio
          autoComplete="new-password"
          error={error && error.porCampo ? error.porCampo.nueva : null}
          ayuda="Mínimo 10 caracteres, con mayúscula, minúscula y número."
        />
        <Texto
          label="Repetir la nueva"
          type="password"
          valor={repetir}
          onChange={setRepetir}
          obligatorio
          autoComplete="new-password"
        />
        <p className="chico gris" style={{ marginBottom: 0 }}>
          Al cambiarla se cierran todas tus sesiones abiertas y tenés que volver a entrar.
        </p>
      </form>
    </Modal>
  );
}
