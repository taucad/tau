import { describe, expect, it } from 'vitest';
import { selectThirdPartyPackages } from '#update-license-deps.mts';

const repositoryRoot = '/repo';

const scanned = [
  {
    name: '@taucad/json-schema',
    version: '0.1.0-beta.0',
    license: 'Apache-2.0',
    directory: '/repo/libs/json-schema',
  },
  { name: 'geospec', version: '0.1.0-beta.0', license: 'FSL-1.1-ALv2', directory: '/repo/packages/geospec' },
  {
    name: '@taucad/kcl-wasm-lib',
    version: '0.1.4',
    license: 'MIT',
    directory: '/repo/node_modules/.pnpm/@taucad+kcl-wasm-lib@0.1.4/node_modules/@taucad/kcl-wasm-lib',
  },
  {
    name: 'zod',
    version: '4.1.12',
    license: 'MIT',
    directory: '/repo/node_modules/.pnpm/zod@4.1.12/node_modules/zod',
  },
];

describe('selectThirdPartyPackages', () => {
  it('drops workspace projects and keeps registry packages, whatever the name', () => {
    expect(selectThirdPartyPackages(scanned, repositoryRoot).map(({ name }) => name)).toStrictEqual([
      '@taucad/kcl-wasm-lib',
      'zod',
    ]);
  });

  it('is unchanged by a workspace version bump (nx release rewrites those in the tagged commit)', () => {
    const bumped = scanned.map((packageInfo) =>
      packageInfo.directory.includes('node_modules') ? packageInfo : { ...packageInfo, version: '9.9.9' },
    );

    expect(selectThirdPartyPackages(bumped, repositoryRoot)).toStrictEqual(
      selectThirdPartyPackages(scanned, repositoryRoot),
    );
  });

  it('does not leak the resolved directory into the manifest entries', () => {
    expect(selectThirdPartyPackages(scanned, repositoryRoot)[0]).not.toHaveProperty('directory');
  });
});
