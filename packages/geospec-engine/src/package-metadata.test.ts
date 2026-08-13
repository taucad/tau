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
};

const readPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')) as PackageJson;

describe('@taucad/geospec-engine package metadata', () => {
  it('depends on the substrate it registers into', async () => {
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

    expect(packageJson.peerDependencies?.['@taucad/openscad']).toBeUndefined();
    expect(packageJson.peerDependencies?.['replicad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['@taucad/openscad']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['replicad']).toBeUndefined();
  });

  it('ships its fair-source licence in the tarball', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.license).toBe('FSL-1.1-Apache-2.0');
    expect(packageJson.files).toContain('LICENSE');
  });
});
