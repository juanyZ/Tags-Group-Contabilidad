import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: true,
      pwaAssets: {
        image: 'public/logo.svg',
        // El preset por defecto rellena el margen de maskable/apple con
        // blanco: se nota como un marco claro sobre el navy de marca. Se
        // pisa ese fondo para que el relleno sea el mismo navy del logo.
        preset: {
          transparent: {
            sizes: [64, 192, 512],
            favicons: [[48, 'favicon.ico']],
          },
          maskable: {
            sizes: [512],
            resizeOptions: { background: '#0a1019' },
          },
          apple: {
            sizes: [180],
            padding: 0,
            resizeOptions: { background: '#0a1019' },
          },
        },
      },
      manifest: {
        name: 'TAGS Group — Gestión del estudio',
        short_name: 'TAGS Group',
        description:
          'Clientes, expedientes, vencimientos, honorarios y gastos del estudio jurídico.',
        theme_color: '#0a1019',
        background_color: '#0a1019',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'es-AR',
      },
      workbox: {
        // El service worker no debe cachear la API: los datos del estudio
        // (clientes, honorarios, vencimientos) tienen que salir siempre de
        // la red, nunca de una copia vieja guardada en el dispositivo.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    port: 5173,
    // El proxy evita CORS en desarrollo: el navegador ve todo en el mismo
    // origen y la cookie del refresh token viaja sin configuracion extra.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // no exponer el codigo original en produccion
    chunkSizeWarningLimit: 900,
  },
});
