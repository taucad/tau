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
  it('declares the runtime and VM substrate surfaces directly', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['@taucad/runtime']).toBe('workspace:*');
    expect(packageJson.dependencies?.['@taucad/types']).toBeUndefined();
    // The VM is `@taucad/esbuild`'s own source, published under its `./vm` subpath.
    expect(packageJson.dependencies?.['@taucad/esbuild']).toBe('workspace:*');
    expect(packageJson.devDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/runtime']).toBeUndefined();
  });

  it('depends on the compiled engine and on no kernel', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['geospec-engine']).toBe('catalog:');
    // Kernels reach a run through an exporter, Tau's being `tauExporter` in @taucad/cli (DL8): the
    // Apache-2.0 substrate must stay free of them so it can be consumed on its own.
    for (const dependency of [
      'manifold-3d',
      '@gltf-transform/core',
      '@taucad/cli',
      '@taucad/assimp',
      '@taucad/brep',
      '@taucad/build123d',
      '@taucad/gltf',
      '@taucad/image',
      '@taucad/jscad',
      '@taucad/manifold',
      '@taucad/middleware',
      '@taucad/opencascade',
      '@taucad/openrscad',
      '@taucad/picogk',
      '@taucad/picovoxel',
      '@taucad/replicad',
      '@taucad/rhino',
      '@taucad/smlib',
      '@taucad/smlibpy',
      '@taucad/tscircuit',
    ]) {
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
