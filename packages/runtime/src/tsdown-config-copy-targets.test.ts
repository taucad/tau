import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Build-config unit test exercises the adjacent config seam.
import { runtimeCopyTargets } from '../tsdown.config.ts';

describe('runtime package copy targets', () => {
  it('places converter assets beside the emitted converter modules', () => {
    const copies = runtimeCopyTargets('dist');
    const converterAssets = copies.find((copy) => copy.from === '../../libs/converter/src/assets');

    expect(converterAssets?.to).toBe('dist/libs/converter/src');
  });

  it('ships the replicad source map where the kernel resolves it', () => {
    const copies = runtimeCopyTargets('dist');
    const sourceMaps = copies.find((copy) => copy.from === 'src/kernels/replicad/sourcemaps');

    // `replicad.kernel.ts` reads `new URL('sourcemaps/replicad.js.map', import.meta.url)`
    // from `dist/kernels/replicad/`, so the copy destination directory is that folder.
    expect(sourceMaps?.to).toBe('dist/kernels/replicad');
  });
});
