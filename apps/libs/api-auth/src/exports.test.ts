import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public @taucad/api-auth surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './config/auth-static': './src/config/auth-static.config.ts',
      './config/better-auth': './src/config/better-auth.config.ts',
      './module': './src/auth.module.ts',
      './testing': './src/testing.ts',
      './package.json': './package.json',
    });
  });
});
