import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{ts,mts,js,mjs}',
      'bindings/node/conformance.vitest.mjs',
      'bindings/wasm/conformance.vitest.mjs',
    ],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/geospec-engine-native',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
