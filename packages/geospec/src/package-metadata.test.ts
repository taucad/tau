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
  it('depends on no Tau package and bundles specs over plain esbuild', async () => {
    const packageJson = await readPackageJson();

    // D11: geospec is severed from Tau. A host injects Tau's VM through `createModuleVm` instead.
    for (const field of [packageJson.dependencies, packageJson.peerDependencies] as const) {
      expect(Object.keys(field ?? {}).filter((name) => name.startsWith('@taucad/'))).toEqual([]);
    }
    expect(packageJson.dependencies?.['esbuild']).toBe('catalog:');
    expect(packageJson.dependencies?.['esbuild-wasm']).toBeUndefined();
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
