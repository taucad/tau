import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'www-download-browser',
    environment: 'node',
    include: ['tests/download-catalog.browser.test.ts'],
  },
});
