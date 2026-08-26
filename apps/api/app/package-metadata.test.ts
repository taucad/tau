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
 * A production edge on any of these also drags `copy-assets` back into the API
 * build graph — staging kernel wasm and fetching Draco decoders over the network
 * for a service that renders nothing.
 *
 * See docs/research/api-server-side-geometry-prune.md.
 */
describe('@taucad/api package metadata', () => {
  it.each(['@taucad/runtime', '@taucad/openrscad', 'geospec', '@taucad/geospec-engine', '@taucad/tau-examples'])(
    'does not depend on %s in production',
    async (name) => {
      const packageJson = await readPackageJson();

      expect(packageJson.dependencies?.[name]).toBeUndefined();
    },
  );

  it('keeps the runtime, substrate and engine available to tests only', async () => {
    const packageJson = await readPackageJson();

    // `app/testing/**` boots headless GeoSpec against an in-memory filesystem,
    // and `main.ts` is bundled from source, so these must resolve at build and
    // test time without shipping.
    expect(packageJson.devDependencies?.['@taucad/runtime']).toBe('workspace:*');
    expect(packageJson.devDependencies?.['geospec']).toBe('workspace:*');
    expect(packageJson.devDependencies?.['@taucad/geospec-engine']).toBe('workspace:*');
  });

  it('has no reference to the dissolved @taucad/testing package', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.dependencies?.['@taucad/testing']).toBeUndefined();
    expect(packageJson.devDependencies?.['@taucad/testing']).toBeUndefined();
  });
});
