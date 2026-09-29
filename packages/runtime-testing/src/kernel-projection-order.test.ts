import { describe, expect, it } from 'vitest';

import { expectKernelProjectionOrder } from '#kernel-testing.utils.js';

describe('expectKernelProjectionOrder', () => {
  it('checks A after B and write after both projections', async () => {
    let selected = 'A';
    const calls: string[] = [];
    const result = await expectKernelProjectionOrder({
      renderA: () => {
        calls.push('A');
        selected = 'A';
        return new Uint8Array([1]);
      },
      renderB: () => {
        calls.push('B');
        selected = 'B';
        return new Uint8Array([2]);
      },
      freshB: () => {
        calls.push('fresh B');
        return new Uint8Array([2]);
      },
      write: () => {
        calls.push('write');
        return new Uint8Array([3]);
      },
    });
    expect(result.intervening).toEqual(new Uint8Array([2]));
    expect(result.repeated).toEqual(result.first);
    expect(selected).toBe('A');
    expect(calls).toEqual(['A', 'write', 'B', 'fresh B', 'A', 'write']);
  });

  it('rejects a projection that mutates its retained input', async () => {
    let source = 1;
    await expect(
      expectKernelProjectionOrder({
        renderA: () => source,
        renderB: () => ++source,
      }),
    ).rejects.toThrow();
  });
});
