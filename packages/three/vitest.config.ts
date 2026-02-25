import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vite type mismatch from pnpm duplicate @types/node resolutions
  plugins: [nxViteTsPaths() as any],
  test: {
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/packages/three',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
