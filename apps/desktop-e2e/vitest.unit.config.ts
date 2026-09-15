import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** Pure desktop harness checks that must never boot the API or Electron. */
export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      {
        find: /^#support\/(.*)\.js$/u,
        replacement: `${resolve(import.meta.dirname, 'src/support')}/$1.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: [
      'src/support/config.test.ts',
      'src/support/gateway-fixture.test.ts',
      'src/support/tau-account.test.ts',
      'src/support/acp-evidence.test.ts',
    ],
  },
});
