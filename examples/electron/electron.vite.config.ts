import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';

export default defineConfig(
  electronRuntimeConfig({
    main: {
      build: {
        outDir: 'dist/main',
        /* Main and the utility process it starts build as one graph, so the
         * runtime modules both import are emitted once. Each input becomes
         * `<name>.js` in `dist/main`, where `src/main/main.ts` resolves it. */
        rolldownOptions: {
          input: {
            index: resolve(import.meta.dirname, 'src/main/index.ts'),
            'kernel-host': resolve(import.meta.dirname, 'src/tau/kernel-host.ts'),
          },
        },
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
