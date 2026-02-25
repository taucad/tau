import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import swc from 'unplugin-swc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/api-integration',
  plugins: [nxViteTsPaths(), swc.vite()],
  test: {
    environment: 'node',
    include: ['app/testing/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    reporter: ['verbose'],
    env: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      NODE_ENV: 'test',
    },
    envFile: '.env',
  },
});
