import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxy so the browser can call the API on the same origin.
// Production serves the SPA and API behind a shared gateway; see README.
// VITE_DEV_API_TARGET overrides the proxy target for local setups where the
// API runs on a non-default port (e.g. Playwright E2E with E2E_API_PORT).
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
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
