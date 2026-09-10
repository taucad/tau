import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { oxcRuntimeEsm } from '@taucad/vite/oxc-runtime-esm';

/** Ship the DB-only administration command beside the API in its existing image. */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [oxcRuntimeEsm(), nxViteTsPaths()],
  build: {
    ssr: 'app/billing-command.ts',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'billing-command.js' } },
  },
});
