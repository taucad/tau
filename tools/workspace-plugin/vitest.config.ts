import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    coverage: {
      reportsDirectory: '../../out/reports/coverage/tools/workspace-plugin',
    },
    environment: 'node',
    reporters: ['verbose'],
  },
});
