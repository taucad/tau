import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Build-config unit test exercises the adjacent config seam.
import { runtimeCopyTargets } from '../tsdown.config.ts';

describe('runtime package copy targets', () => {
  it('places converter assets beside the emitted converter modules', () => {
    const copies = runtimeCopyTargets('dist');
    const converterAssets = copies.find((copy) => copy.from === '../../libs/converter/src/assets');

    expect(converterAssets?.to).toBe('dist/libs/converter/src');
  });
});
