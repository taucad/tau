import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the private @taucad/telemetry surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './client': './src/client.ts',
      './node': './src/node.ts',
      './node-host': './src/node-host.ts',
      // Test-only audience: `scripts/src/telemetry-runtime-vocabulary.test.ts` (T30) reads the generated module as a
      // namespace and compares it with the plugin-registry derivation. No production code imports this subpath.
      './runtime-vocabulary': './src/runtime-vocabulary.ts',
    });
  });
});
