import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, hashBytes, hashString, sha256Bytes, sha256String } from '@taucad/utils/hash';

const hex8 = /^[0-9a-f]{8}$/u;

describe('hash.utils', () => {
  describe('hashString', () => {
    it('is deterministic', () => {
      expect(hashString('cad')).toBe(hashString('cad'));
    });

    it('matches locked djb2 regression vectors', () => {
      // These pin the exact algorithm output. They are also the pre-migration
      // hashCode()/hashString() values, so this proves the consolidation kept
      // djb2 output byte-for-byte identical (colors, cache keys unaffected).
      expect(hashString('')).toBe('00001505');
      expect(hashString('test')).toBe('7c9e6865');
      expect(hashString('hello world')).toBe('3551c8c1');
      expect(hashString('🚀 emoji')).toBe('83e31999');
    });

    it('always returns an 8-character lowercase hex string', () => {
      for (const input of ['', 'a', 'The quick brown fox', '  ', '12345', '你好世界', '🚀🎉']) {
        expect(hashString(input)).toMatch(hex8);
      }
    });

    it('handles a very long string without overflow', () => {
      const result = hashString('x'.repeat(10_000));
      expect(result).toMatch(hex8);
      expect(result).not.toContain('NaN');
    });

    it('handles unicode and surrogate pairs deterministically', () => {
      for (const input of ['🚀', '👨‍👩‍👧‍👦', 'café', 'é', '日本語']) {
        expect(hashString(input)).toBe(hashString(input));
        expect(hashString(input)).toMatch(hex8);
      }
    });

    it('produces distinct outputs for distinct inputs (collision sanity)', () => {
      const inputs = ['a', 'b', 'c', 'ab', 'ba', 'cad', 'dac', 'skill', 'skills'];
      const outputs = new Set(inputs.map((input) => hashString(input)));
      expect(outputs.size).toBe(inputs.length);
    });
  });

  describe('hashBytes', () => {
    it('is deterministic', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(hashBytes(bytes)).toBe(hashBytes(bytes));
    });

    it('hashes empty input to the djb2 seed', () => {
      expect(hashBytes(new Uint8Array(0))).toBe('00001505');
    });

    it('always returns an 8-character lowercase hex string', () => {
      expect(hashBytes(new Uint8Array([255, 0, 128, 42]))).toMatch(hex8);
    });

    it('equals hashString for pure-ASCII content', () => {
      for (const ascii of ['test', 'hello world', 'kernel-worker']) {
        const bytes = new Uint8Array(new TextEncoder().encode(ascii));
        expect(hashBytes(bytes)).toBe(hashString(ascii));
      }
    });

    it('diverges from hashString for multi-byte content (byte vs code-point iteration)', () => {
      const multibyte = '🚀 emoji';
      const bytes = new Uint8Array(new TextEncoder().encode(multibyte));
      expect(hashBytes(bytes)).not.toBe(hashString(multibyte));
    });
  });
});

describe('canonical hashing', () => {
  it('canonicalizes nested object keys while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] })).toBe(
      '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2}],"z":1}',
    );
  });

  it('uses SHA-256 for strings and bytes', async () => {
    const expected = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    await expect(sha256String('test')).resolves.toBe(expected);
    await expect(sha256Bytes(new TextEncoder().encode('test'))).resolves.toBe(expected);
  });

  describe('without crypto.subtle (insecure browser context)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('falls back to the pure-JS SHA-256 and yields the same digest', async () => {
      const input = crypto.getRandomValues(new Uint8Array(777));
      const native = await sha256Bytes(input);
      const nativeString = await sha256String('tau');

      const { getRandomValues } = globalThis.crypto;
      vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });
      expect(globalThis.crypto.subtle).toBeUndefined();

      await expect(sha256Bytes(input)).resolves.toBe(native);
      await expect(sha256String('tau')).resolves.toBe(nativeString);
      await expect(sha256String('test')).resolves.toBe(
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      );
    });
  });
});
