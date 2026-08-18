import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
};

const readPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')) as PackageJson;

describe('geospec package metadata', () => {
  it('depends only on the runtime-owned substrate surface', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['@taucad/runtime']).toBe('workspace:*');
    expect(packageJson.dependencies?.['@taucad/types']).toBeUndefined();
    expect(packageJson.dependencies?.['@taucad/vm']).toBeUndefined();
    expect(packageJson.devDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/runtime']).toBeUndefined();
  });

  it('declares no geometry-engine runtime dependencies', async () => {
    const packageJson = await readPackageJson();

    // Kernel adapters live in @taucad/geospec-engine (DL8): the Apache-2.0
    // substrate must stay free of them so it can be consumed on its own.
    for (const dependency of ['manifold-3d', '@gltf-transform/core', '@taucad/geospec-engine']) {
      expect(packageJson.dependencies?.[dependency]).toBeUndefined();
    }
  });

  it('does not expose source kernels as optional production peers', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.peerDependencies?.['@taucad/openrscad']).toBeUndefined();
    expect(packageJson.peerDependencies?.['replicad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/openrscad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['replicad']).toBeUndefined();
  });
});
