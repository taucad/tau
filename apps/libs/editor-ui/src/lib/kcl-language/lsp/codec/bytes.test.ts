import { describe, it, expect } from 'vitest';
import { encodeBytes, decodeBytes, appendBytes } from '#lib/kcl-language/lsp/codec/bytes.js';

describe('bytes', () => {
  describe('encodeBytes', () => {
    it('should encode ASCII string to Uint8Array', () => {
      const result = encodeBytes('hello');
      expect(result.length).toBe(5);
      expect([...result]).toEqual([104, 101, 108, 108, 111]);
    });

    it('should encode empty string', () => {
      const result = encodeBytes('');
      expect(result.length).toBe(0);
    });

    it('should encode multi-byte UTF-8 characters', () => {
      const result = encodeBytes('é');
      expect(result.length).toBe(2);
    });

    it('should encode emoji (4-byte UTF-8)', () => {
      const result = encodeBytes('🚀');
      expect(result.length).toBe(4);
    });
  });

  describe('decodeBytes', () => {
    it('should decode Uint8Array back to string', () => {
      const encoded = new Uint8Array([104, 101, 108, 108, 111]);
      expect(decodeBytes(encoded)).toBe('hello');
    });

    it('should decode empty array', () => {
      expect(decodeBytes(new Uint8Array())).toBe('');
    });

    it('should roundtrip multi-byte characters', () => {
      const original = 'héllo wörld 🚀';
      const encoded = encodeBytes(original);
      expect(decodeBytes(encoded)).toBe(original);
    });
  });

  describe('appendBytes', () => {
    it('should concatenate two Uint8Arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([4, 5]);
      const result = appendBytes(Uint8Array, a, b);
      expect([...result]).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty arrays', () => {
      const a = new Uint8Array();
      const b = new Uint8Array([1, 2]);
      const result = appendBytes(Uint8Array, a, b);
      expect([...result]).toEqual([1, 2]);
    });

    it('should concatenate multiple arrays', () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array([2]);
      const c = new Uint8Array([3]);
      const result = appendBytes(Uint8Array, a, b, c);
      expect([...result]).toEqual([1, 2, 3]);
    });

    it('should return empty array when no inputs', () => {
      const result = appendBytes(Uint8Array);
      expect(result.length).toBe(0);
    });
  });
});
