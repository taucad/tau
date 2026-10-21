import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'www',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/**/*.browser.test.ts'],
  },
});
