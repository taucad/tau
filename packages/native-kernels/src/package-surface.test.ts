import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

type Manifest = {
  readonly exports: Readonly<Record<string, unknown>>;
  readonly publishConfig: { readonly exports: Readonly<Record<string, unknown>> };
};

describe('@taucad/native-kernels exports', () => {
  it('should publish the roster root, the bundled manifests and the Node composition as separate subpaths', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Manifest;

    expect(manifest.exports).toEqual({
      '.': './src/index.ts',
      './manifest': './src/manifest.ts',
      './node': './src/node.ts',
      './package.json': './package.json',
    });
    expect(Object.keys(manifest.publishConfig.exports)).toEqual(Object.keys(manifest.exports));
  });
});
