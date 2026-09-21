import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { oxcRuntimeEsm } from '@taucad/vite/oxc-runtime-esm';

/** Ship the DB-only administration command beside the API in its existing image. */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [
    oxcRuntimeEsm(),
    nxViteTsPaths(),
    /* `migrate` is this command's own job (it is the Fly release_command and `pnpm db:migrate`), so
     * it ships its own migrations folder rather than borrowing the one `api:build` happens to leave
     * in `dist/`. `runMigrationJob` resolves it from `import.meta.dirname`, i.e. `dist/migrations`. */
    viteStaticCopy({
      environment: 'ssr',
      targets: [{ src: 'app/database/migrations/**/*', dest: 'migrations', rename: { stripBase: 3 } }],
    }),
  ],
  build: {
    ssr: 'app/billing-command.ts',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'billing-command.js' } },
  },
});
