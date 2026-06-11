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
  it('declares @taucad/runtime as a direct dependency', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['@taucad/runtime']).toBe('workspace:*');
    expect(packageJson.peerDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/runtime']).toBeUndefined();
  });

  it('does not expose source kernels as optional production peers', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.peerDependencies?.['@taucad/openscad']).toBeUndefined();
    expect(packageJson.peerDependencies?.['replicad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/openscad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['replicad']).toBeUndefined();
  });
});
