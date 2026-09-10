import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public billing surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './hooks/billing-session': './src/hooks/billing-session.tsx',
      './hooks/use-entitlements': './src/hooks/use-entitlements.ts',
      './hooks/use-credits': './src/hooks/use-credits.ts',
      './usage': './src/usage.ts',
    });
  });
});
