import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public @taucad/api-billing surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './cli': './src/cli/billing-command.ts',
      './operations': './src/cli/billing-command.operations.ts',
      './testing/billing-payment.fixture': './src/testing/billing-payment.fixture.ts',
      './testing/billing-policy.fixture': './src/testing/billing-policy.fixture.ts',
      './testing/development-billing-account': './src/testing/development-billing-account.ts',
      './package.json': './package.json',
    });
  });
});
