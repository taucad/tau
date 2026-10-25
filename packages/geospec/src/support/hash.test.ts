// Ported from Tau's `libs/utils/src/hash.utils.test.ts` (the `sha256Bytes` cases).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '#support/hash.js';

describe('sha256Bytes', () => {
  it('uses SHA-256 for bytes', async () => {
    await expect(sha256Bytes(new TextEncoder().encode('test'))).resolves.toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );
  });

  describe('without crypto.subtle (insecure browser context)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('falls back to the pure-JS SHA-256 and yields the same digest', async () => {
      const input = crypto.getRandomValues(new Uint8Array(777));
      const native = await sha256Bytes(input);

      const { getRandomValues } = globalThis.crypto;
      vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });
      expect(globalThis.crypto.subtle).toBeUndefined();

      await expect(sha256Bytes(input)).resolves.toBe(native);
      await expect(sha256Bytes(new TextEncoder().encode('test'))).resolves.toBe(
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      );
    });
  });
});
