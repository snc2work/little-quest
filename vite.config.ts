import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the game and a gallery of every hut and room.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
      },
    },
  },
});
