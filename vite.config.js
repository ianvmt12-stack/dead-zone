import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el juego funciona igual en la raíz del dominio
  // o en un subdirectorio (útil si algún día se sirve bajo /deadzone/).
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // three.js pesa; trocearlo evita el aviso de bundle grande.
    rollupOptions: {
      output: {
        // three.js pesa: en su propio chunk para que se cachee aparte.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});