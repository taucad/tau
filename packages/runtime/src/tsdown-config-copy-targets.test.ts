import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Build-config unit test exercises the adjacent config seam.
import { runtimeCopyTargets } from '../tsdown.config.ts';

describe('runtime package copy targets', () => {
  it('copies package support files', () => {
    expect(runtimeCopyTargets('dist')).toEqual([
      { from: '../../license', to: 'dist', rename: 'LICENSE' },
      { from: '../../license-deps', to: 'dist', rename: 'THIRD_PARTY_LICENSES.md' },
      { from: 'src/nextjs/package-assets-loader.mjs', to: 'dist/nextjs' },
    ]);
  });
});
