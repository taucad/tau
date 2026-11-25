import { testReporters } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: '../../out/reports/coverage/tools/workspace-plugin',
    },
    environment: 'node',
    reporters: testReporters('verbose'),
  },
});
