import { defineConfig } from 'vitest/config';

/** The built viewer page in Chromium against a real `tau mcp` (`nx test:e2e agent-plugin`). */
export default defineConfig({
  // The package folder is the plugin root that hosts load or copy: keep Vite's cache out of it.
  cacheDir: '../../node_modules/.vite/packages/agent-plugin-hosts',
  test: {
    environment: 'node',
    include: ['e2e/**/*.hosts.test.ts'],
    reporters: ['verbose'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
