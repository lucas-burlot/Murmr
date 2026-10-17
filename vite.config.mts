import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, 'src/renderer');

export default defineConfig({
  root,
  base: './', // pages are loaded with file:// in Electron
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'out/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        overlay: resolve(root, 'overlay.html'),
      },
    },
  },
});
