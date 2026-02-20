import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'overlay.html'),
        settings: path.resolve(__dirname, 'settings.html'),
      },
    },
  },
});
