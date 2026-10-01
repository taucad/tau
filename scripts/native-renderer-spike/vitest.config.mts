import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['scripts/native-renderer-spike/*.test.mts'], environment: 'node', testTimeout: 15000 },
});
