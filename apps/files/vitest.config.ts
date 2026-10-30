import { defineConfig } from 'vitest/config';

/*
 * Plain Vitest in Node, with a fake R2 binding (`src/testing/fake-bucket.ts`), not the Workers runtime:
 * see README "Tests". The handler uses only WebCrypto, fetch's Request/Response/Headers and web streams,
 * which Node 24 implements; the bundle test checks the shipped module separately.
 */
export default defineConfig({
  cacheDir: '../../node_modules/.vite/apps/files',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/apps/files',
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
    },
  },
});
