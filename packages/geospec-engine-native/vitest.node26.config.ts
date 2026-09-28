import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['bindings/browser-conformance/conformance.vitest.mjs'],
    reporters: ['verbose'],
  },
});
