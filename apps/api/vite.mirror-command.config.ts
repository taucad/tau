import { defineConfig } from 'vite';
import { oxcRuntimeEsm } from '@taucad/vite/oxc-runtime-esm';

/** Ship the B2 second-copy copier in the API image, run by the private `tau-mirror` app (W13 DM1, B3a). */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [oxcRuntimeEsm()],
  build: {
    ssr: 'app/mirror-command.ts',
    outDir: 'dist',
    sourcemap: 'hidden',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'mirror-command.js' } },
  },
});
