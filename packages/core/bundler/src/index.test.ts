import { describe, expect, it } from 'vitest';

import * as bundlerCore from '#index.js';

describe('public surface', () => {
  it('exports only compiler-neutral implementation values', () => {
    expect(Object.keys(bundlerCore).sort()).toEqual([
      'PackageArtifactCache',
      'createBundlerSourceHost',
      'createPackageManifestCommit',
      'installPackages',
      'lockMatchesManifest',
      'materializePackages',
      'normalizeAssetImportAttributes',
      'parsePackageLock',
      'readPackageLock',
      'resolveAssetIntent',
      'resolveDependencyTree',
      'serializePackageLock',
      'splitAssetSpecifier',
    ]);
  });
});
