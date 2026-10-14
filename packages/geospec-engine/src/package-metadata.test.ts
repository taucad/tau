import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
  files?: string[];
  exports?: Record<string, Record<string, string>>;
  publishConfig?: { exports?: Record<string, Record<string, string>> };
};

const readPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')) as PackageJson;

describe('@taucad/geospec-engine package metadata', () => {
  it('depends on the substrate whose specs it runs', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['geospec']).toBe('workspace:*');
  });

  it('keeps @taucad/runtime a direct dependency once it is declared', async () => {
    const packageJson = await readPackageJson();

    // PE2 adds the runtime as a value dependency (createNodeClient). Whenever it
    // is present it must be direct, never an optional peer.
    if (packageJson.dependencies?.['@taucad/runtime'] !== undefined) {
      expect(packageJson.dependencies['@taucad/runtime']).toBe('workspace:*');
    }
    expect(packageJson.peerDependencies?.['@taucad/runtime']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/runtime']).toBeUndefined();
  });

  it('does not expose source kernels as optional production peers', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.peerDependencies?.['@taucad/openrscad']).toBeUndefined();
    expect(packageJson.peerDependencies?.['replicad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/openrscad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['replicad']).toBeUndefined();
  });

  it('generates its gitignored provenance record before pkgcheck reads it', async () => {
    // F3: `provenance.json` is gitignored and written only by `prepack`, so in a
    // fresh checkout pkgcheck's files-entry assertion fails unless the target
    // chain regenerates it first.
    const packageJson = await readPackageJson();
    const projectJson = JSON.parse(await readFile(resolve(import.meta.dirname, '../project.json'), 'utf8')) as {
      targets: Record<string, { dependsOn?: string[] }>;
    };

    expect(packageJson.files).toContain('provenance.json');
    expect(projectJson.targets['generate-provenance']?.dependsOn).toContain('build');
    expect(projectJson.targets['pkgcheck']?.dependsOn).toContain('generate-provenance');
  });

  it('publishes only the CLI host subpaths, with identical source and publish maps', async () => {
    const packageJson = await readPackageJson();
    const subpaths = ['./native-pool/node', './node-filesystem', './package.json'];

    expect(Object.keys(packageJson.exports ?? {}).toSorted()).toStrictEqual(subpaths);
    expect(Object.keys(packageJson.publishConfig?.exports ?? {}).toSorted()).toStrictEqual(subpaths);
  });

  it('ships its Apache-2.0 licence in the tarball', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.license).toBe('Apache-2.0');
    expect(packageJson.files).toContain('LICENSE');
  });
});
