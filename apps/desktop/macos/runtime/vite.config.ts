import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { tauRuntime } from '@taucad/runtime/vite';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: './',
  cacheDir: resolve(root, '../../../../node_modules/.vite/apps/desktop-quick-look'),
  plugins: [tauRuntime(), nxViteTsPaths()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: resolve(root, '../generated/runtime'),
    emptyOutDir: true,
    sourcemap: true,
  },
});
