/**
 * Pantalla de ingreso.
 *
 * Layout partido: a la izquierda el panel de marca, a la derecha el formulario.
 * No es adorno — es la única pantalla que ve alguien de afuera si mira la
 * computadora del estudio, y un formulario suelto en el medio de la nada no
 * comunica que esto es el sistema de un estudio jurídico.
 */
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { Aviso, Cargando } from '../components/Comunes.jsx';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  const login = useAuth((s) => s.login);
  const error = useAuth((s) => s.error);
  const usuario = useAuth((s) => s.usuario);
  const cargando = useAuth((s) => s.cargando);

  const navegar = useNavigate();
  const ubicacion = useLocation();
  const destino = ubicacion.state && ubicacion.state.desde ? ubicacion.state.desde : '/';

  if (cargando) return <Cargando texto="Verificando la sesión..." />;
  if (usuario) return <Navigate to={destino} replace />;

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    const ok = await login(email, password);
    setEnviando(false);
    if (ok) navegar(destino, { replace: true });
  }

  const anio = new Date().getFullYear();

  return (
    <div className="login-pantalla">
      <aside className="login-marca">
        <div className="wordmark">TAGS Group</div>
        <div className="tagline">Estudio jurídico integral</div>
        <div className="regla" />
        <p className="claim">
          Clientes, expedientes, vencimientos y honorarios del estudio, en un solo lugar.
        </p>
        <div className="pie-marca">Mar del Plata · {anio}</div>
      </aside>

      <main className="login-formulario">
        <form className="login-caja" onSubmit={enviar}>
          <h1>Ingresar</h1>
          <p className="intro">Sistema de gestión interno del estudio.</p>

          {error ? <Aviso tipo="error"><span>⚠</span><span>{error}</span></Aviso> : null}

          <div className="campo">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              placeholder="tu@tagsgroup.com.ar"
            />
          </div>

          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>

          <p className="nota">
            Si olvidaste tu contraseña, pedile al administrador del estudio que te la
            restablezca. Por seguridad, la sesión se cierra sola tras un período de
            inactividad.
          </p>
        </form>
      </main>
    </div>
  );
}
