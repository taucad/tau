import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';

const outputRoot = resolve(import.meta.dirname, 'dist');

export default defineConfig(
  electronRuntimeConfig({
    main: {
      build: {
        outDir: resolve(outputRoot, 'main'),
        /* One graph for main and the utility it starts; `src/main/main.ts`
         * resolves `kernel-host.js` beside `index.js`. */
        rollupOptions: {
          input: {
            index: resolve(import.meta.dirname, 'src/main/index.ts'),
            'kernel-host': resolve(import.meta.dirname, 'src/main/kernel-host.ts'),
          },
        },
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
