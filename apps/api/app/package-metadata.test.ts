import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const readPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')) as PackageJson;

/**
 * The API orchestrates geometry verification; it never computes it. GeoSpec runs
 * on the client (browser worker for the UI, Node for the CLI), so no geometry or
 * kernel package may be a production dependency here.
 *
 * A production edge on any of these also drags browser-worker code and
 * dependency-owned runtime assets into a service that renders nothing. A
 * development edge ships nothing, but Nx still counts it: it puts every kernel
 * in the API's project graph, so a kernel or CLI change selects the API lane
 * (PostgreSQL, MinIO and the image smoke build). The publication kernel table's
 * parity with the CLI runtime is pinned from `apps/api-contracts` instead.
 *
 * See docs/research/api-server-side-geometry-prune.md.
 */
describe('@taucad/api package metadata', () => {
  it.each(['@taucad/runtime', '@taucad/openrscad', 'geospec', '@taucad/cli', '@taucad/tau-examples'])(
    'does not depend on %s in production',
    async (name) => {
      const packageJson = await readPackageJson();

      expect(packageJson.dependencies?.[name]).toBeUndefined();
    },
  );

  it.each(['@taucad/runtime', '@taucad/cli', '@taucad/api-extractor'])(
    'does not depend on %s at all, even for tests',
    async (name) => {
      const packageJson = await readPackageJson();

      expect(packageJson.dependencies?.[name]).toBeUndefined();
      expect(packageJson.devDependencies?.[name]).toBeUndefined();
    },
  );

  it('keeps the GeoSpec substrate available to tests only', async () => {
    const packageJson = await readPackageJson();

    // `app/testing/tau-geospec-harness.ts` runs GeoSpec headlessly against an
    // in-memory filesystem. `geospec` is published from taucad/geospec and comes
    // from its catalog pin.
    expect(packageJson.devDependencies?.['geospec']).toBe('catalog:');
  });

  it('has no reference to the dissolved @taucad/testing package', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['@taucad/testing']).toBeUndefined();
    expect(packageJson.devDependencies?.['@taucad/testing']).toBeUndefined();
  });
});
