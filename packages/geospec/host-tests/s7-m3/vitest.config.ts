import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: fileURLToPath(
    new URL('../../../../node_modules/.cache/geospec-engine-native/m3-geometry-a1/s7/vitest', import.meta.url),
  ),
  test: {
    environment: 'node',
    include: ['host-tests/s7-m3/*.fixture.ts'],
  },
});
