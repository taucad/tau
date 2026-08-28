import { describe, expect, it } from 'vitest';

import * as bundlerCore from '#index.js';

describe('public surface', () => {
  it('exports only compiler-neutral implementation values', () => {
    expect(Object.keys(bundlerCore).sort()).toEqual([
      'PackageArtifactCache',
      'createBundlerSourceHost',
      'normalizeAssetImportAttributes',
      'resolveAssetIntent',
      'splitAssetSpecifier',
    ]);
  });
});
