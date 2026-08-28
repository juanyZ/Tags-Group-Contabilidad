import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
