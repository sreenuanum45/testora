import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // noVNC's codec-support detection uses top-level await, which needs a newer target than
  // Vite's default (safari14/chrome87-ish) baseline supports.
  build: { target: 'esnext' },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
