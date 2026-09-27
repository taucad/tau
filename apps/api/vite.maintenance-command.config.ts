import { defineConfig } from 'vite';
import { oxcRuntimeEsm } from '@taucad/vite/oxc-runtime-esm';

/** Ship the singleton lifecycle command beside the API in its existing image (charter D21). */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [oxcRuntimeEsm()],
  build: {
    ssr: 'app/maintenance-command.ts',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'maintenance-command.js' } },
  },
});
