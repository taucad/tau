import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';

const outputRoot = resolve(import.meta.dirname, 'dist');

export default defineConfig(
  electronRuntimeConfig({
    main: {
      build: {
        outDir: resolve(outputRoot, 'main'),
      },
    },
    preload: {
      build: {
        outDir: resolve(outputRoot, 'preload'),
        lib: {
          entry: resolve(import.meta.dirname, 'src/preload/preload.ts'),
          formats: ['es'],
        },
      },
    },
    renderer: {
      root: resolve(import.meta.dirname, 'src/renderer'),
      build: {
        outDir: resolve(outputRoot, 'renderer'),
      },
    },
  }),
);
