import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/packages/render',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/wasm/**/*'],
    },
  },
});
