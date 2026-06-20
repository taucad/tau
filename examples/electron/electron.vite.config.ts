import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { runtime } from '@taucad/runtime/vite';

/* `electron-vite` orchestrates three coordinated build pipelines (main /
 * preload / renderer); each pipeline is a regular Vite config underneath. We
 * keep dependencies external in main + preload so Electron resolves them at
 * runtime from `node_modules`, and bundle the renderer into a single ESM tree
 * because the renderer is loaded via `loadFile`. */
export default defineConfig({
  main: {
    /* `@taucad/openscad` resolves through the workspace exports map to
     * raw `.ts` files; the utility process (Node) cannot dynamic-import
     * those. We bundle openscad + runtime worker primitives into the
     * main pipeline so `kernel-host.js` is a self-contained Node
     * module. The rest of the deps (electron, etc.) stay external.
     *
     * `@taucad/runtime/vite` teaches Rollup to emit `.ts` files referenced
     * via `new URL('./x.js', import.meta.url)` as full module chunks
     * (transpile → bundle), instead of copying them verbatim as raw assets
     * with the `.ts` extension. Without this,
     * `dist/main/assets/openscad.kernel-XXX.ts` gets shipped where Node's
     * ESM loader rejects it. */
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
      /* Topology C multi-entry main pipeline: `index` is the Electron main
       * entry; `kernel-host` is the utility-process bootstrap that hosts
       * `KernelRuntimeWorker` directly (no separate worker_threads spawn —
       * the kernel runs in-process inside the utility process). Forked by
       * `electronUtilityTransport` via `utilityProcess.fork(kernelHostUrl)`. */
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          'kernel-host': resolve(import.meta.dirname, 'src/main/kernel-host.ts'),
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
    /* Runtime Vite invariants cover COI headers, WASM asset handling, and
     * TypeScript files referenced via `new URL(..., import.meta.url)`. */
    plugins: [...runtime()],
    build: {
      outDir: resolve(import.meta.dirname, 'dist/renderer'),
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
});
