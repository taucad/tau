import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [nxViteTsPaths()],
  test: { include: ['installed.test.ts', 'model-installed.test.ts'], fileParallelism: false, testTimeout: 60_000 },
});
