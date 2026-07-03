import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import { runtime } from '@taucad/runtime/vite';

export default defineConfig({
  main: {
    /* Bundle selected Tau packages so the utility host can import workspace
     * TypeScript kernels as ordinary Node ESM. */
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@taucad/openscad',
          '@taucad/openscad/kernel',
          '@taucad/runtime',
          '@taucad/runtime/worker',
          '@taucad/runtime/worker/web',
          '@taucad/runtime/worker/node',
          '@taucad/runtime/electron/main',
          '@taucad/runtime/electron/preload',
          '@taucad/runtime/electron/renderer',
          '@taucad/runtime/electron/utility',
          '@taucad/runtime/filesystem',
          '@taucad/runtime/filesystem/node',
          '@taucad/rpc',
        ],
      }),
      ...runtime({ crossOriginIsolation: false }),
    ],
    build: {
      outDir: 'dist/main',
      /* `kernel-host` is the utility-process runtime entry forked by main. */
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          'kernel-host': resolve(import.meta.dirname, 'src/tau/kernel-host.ts'),
        },
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
        },
        external: ['electron'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: resolve(import.meta.dirname, 'src/preload/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: { external: ['electron'] },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    /* Runtime Vite invariants cover COI headers, WASM assets, and module workers. */
    plugins: [...runtime(), tailwindcss()],
    build: {
      outDir: resolve(import.meta.dirname, 'dist/renderer'),
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
});
