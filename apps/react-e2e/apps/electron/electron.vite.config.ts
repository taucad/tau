import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { runtime } from '@taucad/runtime/vite';
import type { Plugin } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const replicadWasmRoot = resolve(repoRoot, 'packages/runtime/src/kernels/replicad/wasm');
const mainWasmOutput = resolve(import.meta.dirname, 'dist/main/wasm');

const copyReplicadWasmAssets = (): Plugin => ({
  name: 'tau-react-e2e:copy-replicad-wasm-assets',
  closeBundle() {
    mkdirSync(mainWasmOutput, { recursive: true });
    for (const fileName of ['replicad_single.js', 'replicad_single.wasm', 'replicad_multi.js', 'replicad_multi.wasm']) {
      copyFileSync(resolve(replicadWasmRoot, fileName), resolve(mainWasmOutput, fileName));
    }
  },
});

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@taucad/runtime',
          '@taucad/runtime/bundler/esbuild',
          '@taucad/runtime/electron/main',
          '@taucad/runtime/electron/preload',
          '@taucad/runtime/electron/renderer',
          '@taucad/runtime/electron/utility',
          '@taucad/runtime/filesystem/node',
          '@taucad/runtime/kernels/replicad',
          '@taucad/runtime/middleware/geometry-cache',
          '@taucad/runtime/middleware/parameter-cache',
          '@taucad/runtime/worker',
        ],
      }),
      ...runtime({ crossOriginIsolation: false }),
      copyReplicadWasmAssets(),
    ],
    build: {
      outDir: 'dist/main',
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
    plugins: [...runtime()],
    build: {
      outDir: resolve(import.meta.dirname, 'dist/renderer'),
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
});
