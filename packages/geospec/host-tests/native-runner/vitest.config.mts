import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: { include: ['installed.test.ts', 'model-installed.test.ts'], fileParallelism: false, testTimeout: 60_000 },
});
