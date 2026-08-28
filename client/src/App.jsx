/**
 * Rutas de la aplicacion.
 *
 * Todo lo que no sea /login exige sesion. El guard es solo de navegacion: la
 * autorizacion real la aplica el backend en cada endpoint.
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import { Layout } from './components/Layout.jsx';
import { Cargando } from './components/Comunes.jsx';

import { Login } from './pages/Login.jsx';
import { Tablero } from './pages/Tablero.jsx';
import { Clientes } from './pages/Clientes.jsx';
import { Expedientes } from './pages/Expedientes.jsx';
import { Puntuales } from './pages/Puntuales.jsx';
import { Recurrentes } from './pages/Recurrentes.jsx';
import { Calendario } from './pages/Calendario.jsx';
import { Agenda } from './pages/Agenda.jsx';
import { Honorarios } from './pages/Honorarios.jsx';
import { Gastos } from './pages/Gastos.jsx';
import { CuentaCorriente } from './pages/CuentaCorriente.jsx';
import { Ficha } from './pages/Ficha.jsx';
import { Configuracion } from './pages/Configuracion.jsx';

function Protegida({ children }) {
  const usuario = useAuth((s) => s.usuario);
  const cargando = useAuth((s) => s.cargando);
  const ubicacion = useLocation();

  if (cargando) return <Cargando texto="Verificando la sesión..." />;

  if (!usuario) {
    // Se recuerda a donde queria ir, para volver ahi despues del login.
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }

  return children;
}

export function App() {
  const iniciar = useAuth((s) => s.iniciar);

  // Al arrancar se intenta rehidratar la sesion con la cookie del refresh.
  useEffect(() => {
    iniciar();
  }, [iniciar]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <Protegida>
            <Layout />
          </Protegida>
        }
      >
        <Route path="/" element={<Tablero />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/expedientes" element={<Expedientes />} />
        <Route path="/puntuales" element={<Puntuales />} />
        <Route path="/recurrentes" element={<Recurrentes />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/honorarios" element={<Honorarios />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/cuenta-corriente" element={<CuentaCorriente />} />
        <Route path="/cuenta-corriente/:id" element={<CuentaCorriente />} />
        <Route path="/ficha" element={<Ficha />} />
        <Route path="/ficha/:id" element={<Ficha />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
