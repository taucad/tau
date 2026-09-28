import { describe, expect, it } from 'vitest';
import { loadKernelStaticTypesFromMount } from '#lib/typescript-family-shared.js';

type ReadFile = NonNullable<Parameters<typeof loadKernelStaticTypesFromMount>[0]>['readFile'];
const unusedReadFile = (async () => new Uint8Array()) as unknown as ReadFile;

describe('kernel static type loading', () => {
  it('keeps the unavailable dependency mount optional', async () => {
    await expect(loadKernelStaticTypesFromMount(undefined)).resolves.toEqual([]);
    await expect(
      loadKernelStaticTypesFromMount({
        readdir: async () => {
          throw Object.assign(new Error('no dependency mount'), { code: 'ROOT_UNAVAILABLE' });
        },
        readFile: unusedReadFile,
      }),
    ).resolves.toEqual([]);
  });

  it('does not turn an installation failure into empty typings', async () => {
    await expect(
      loadKernelStaticTypesFromMount({
        readdir: async () => {
          throw new Error('OPFS installation failed');
        },
        readFile: unusedReadFile,
      }),
    ).rejects.toThrow('OPFS installation failed');
  });
});
