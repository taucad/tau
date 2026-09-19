import { describe, expect, it } from 'vitest';

import { encodeBinaryAsOwnedCopy } from '#transport/_internal/owned-transfer-bytes.js';

describe('owned copy delivery', () => {
  it('copies binary output without transferables or source aliasing', () => {
    const source = new Uint8Array([1, 2, 3]);
    const encoded = encodeBinaryAsOwnedCopy('export', source);

    expect(encoded).toMatchObject({ tier: 'copy', transferables: [], value: { delivery: 'inline' } });
    if (encoded.value.delivery !== 'inline') {
      throw new Error('Expected inline copy delivery.');
    }
    expect(encoded.value.bytes).toEqual(source);
    expect(encoded.value.bytes).not.toBe(source);
  });
});
