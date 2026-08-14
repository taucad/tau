import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';

export default defineConfig(
  electronRuntimeConfig({
    main: {
      build: {
        outDir: 'dist/main',
      },
    },
    preload: {
      build: {
        outDir: 'dist/preload',
        lib: {
          entry: resolve(import.meta.dirname, 'src/preload/preload.ts'),
          formats: ['es'],
        },
      },
    },
    renderer: {
      root: resolve(import.meta.dirname, 'src/renderer'),
      plugins: [tailwindcss()],
      build: {
        outDir: resolve(import.meta.dirname, 'dist/renderer'),
      },
    },
  }),
);
