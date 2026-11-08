import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the demo and a gallery of every hut and room of the real game.
export default defineConfig({
  // The model worker loads ONNX Runtime on demand, which needs an ES module worker.
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
      },
    },
  },
});
