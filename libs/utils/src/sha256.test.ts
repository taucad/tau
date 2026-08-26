/**
 * Known-answer and cross-implementation tests for the pure-JS SHA-256 fallback.
 * Vectors ported from `@noble/hashes` v2.3.0 `test/hashes.test.ts` (MIT, Paul
 * Miller), which in turn are the RFC 6234 §8.5 / FIPS 180-2 vectors.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from '#sha256.js';

const hex = (bytes: Uint8Array<ArrayBuffer>): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const nodeSha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

describe('sha256', () => {
  describe('RFC 6234 known answers', () => {
    const vectors: ReadonlyArray<[name: string, input: Uint8Array<ArrayBuffer>, expected: string]> = [
      ['empty', utf8(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', utf8('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        '56-byte two-block message',
        utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      ],
      [
        '112-byte message',
        utf8(
          'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
        ),
        'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
      ],
      [
        'one million "a"',
        new Uint8Array(1_000_000).fill(0x61),
        'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
      ],
    ];

    it.each(vectors)('%s', (_name, input, expected) => {
      expect(hex(sha256(input))).toBe(expected);
    });
  });

  it('matches node:crypto across the padding-block boundaries', () => {
    // 55/56 and 119/120: where the 64-bit length field does / does not fit after 0x80.
    for (const length of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000]) {
      const input = Uint8Array.from({ length }, (_, index) => (index * 31 + 7) % 256);
      expect(hex(sha256(input)), `length ${length}`).toBe(nodeSha256(input));
    }
  });

  it('matches node:crypto for random inputs', () => {
    for (let iteration = 0; iteration < 50; iteration++) {
      const input = crypto.getRandomValues(new Uint8Array(Math.floor(Math.random() * 1025)));
      expect(hex(sha256(input))).toBe(nodeSha256(input));
    }
  });

  it('honours a non-zero byteOffset (subarray of a larger buffer)', () => {
    const backing = crypto.getRandomValues(new Uint8Array(300));
    for (const [start, end] of [
      [1, 2],
      [3, 67],
      [5, 200],
      [64, 128],
      [7, 300],
    ] as const) {
      const view = backing.subarray(start, end);
      expect(view.byteOffset).toBe(start);
      expect(hex(sha256(view))).toBe(nodeSha256(backing.slice(start, end)));
    }
  });

  it('returns a fresh digest each call', () => {
    const first = sha256(utf8('abc'));
    const second = sha256(utf8('abc'));
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
