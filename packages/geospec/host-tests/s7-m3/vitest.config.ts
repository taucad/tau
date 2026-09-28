import { fileURLToPath } from 'node:url';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: fileURLToPath(
    new URL('../../../../node_modules/.cache/geospec-engine-native/m3-geometry-a1/s7/vitest', import.meta.url),
  ),
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    include: ['host-tests/s7-m3/*.fixture.ts'],
  },
});
