import { defineConfig } from 'vite';
import { oxcRuntimeEsm } from '@taucad/vite/oxc-runtime-esm';

/** The tau-storage entry (DC1): plain node:http over the git worker, built beside the API's bundles into the same image's `storage` target. */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [oxcRuntimeEsm()],
  build: {
    ssr: 'app/storage-worker.ts',
    outDir: 'dist',
    sourcemap: 'hidden',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'storage-worker.js' } },
  },
});
