import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public @taucad/api-hosts surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './host-frame-relay': './src/host-frame-relay.ts',
      './package.json': './package.json',
    });
  });
});
