import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxy so the browser can call the API on the same origin.
// Production serves the SPA and API behind a shared gateway; see README.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    // Pages serves everything under dist/, so shipped .map files would let
    // anyone reconstruct the full frontend source (Issue #42 L-1).
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split stable vendor code so it is cached across deploys and the
        // first-paint script stays smaller (評価・改善ラウンド).
        manualChunks: {
          'react-vendor': ['react', 'react-dom', '@tanstack/react-query'],
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
