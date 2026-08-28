import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.jsx';
import './styles/global.css';

/**
 * Configuracion de React Query.
 *
 * refetchOnWindowFocus: es lo que hace que la app se sienta "en vivo" sin
 * WebSockets. Si dos personas del estudio trabajan a la vez, al volver a la
 * pestana se ven los datos actualizados del otro.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 30000,
      retry: (cantidad, error) => {
        // No reintentar errores del cliente: un 403 o un 422 no mejora
        // repitiendo la consulta.
        const status = error && error.status ? error.status : null;
        if (status && status >= 400 && status < 500) return false;
        return cantidad < 2;
      },
    },
    mutations: { retry: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
