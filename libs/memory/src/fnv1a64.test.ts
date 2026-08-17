import { describe, it, expect } from 'vitest';
import { fnv1a64 } from '#fnv1a64.js';

/** Reconstruct the full 64-bit value from the two returned lanes. */
const toU64 = ([hi, lo]: readonly [number, number]): bigint => BigInt(hi) * 2n ** 32n + BigInt(lo);

/**
 * Canonical FNV-1a 64-bit reference vectors (no trailing NUL), full 64-bit
 * value. Sourced from the FNV reference (http://www.isthe.com/chongo/tech/comp/fnv/)
 * and cross-checked with an independent BigInt implementation.
 */
const referenceVectors: ReadonlyArray<readonly [input: string, expected: bigint]> = [
  ['', BigInt('0xcbf29ce484222325')],
  ['a', BigInt('0xaf63dc4c8601ec8c')],
  ['b', BigInt('0xaf63df4c8601f1a5')],
  ['c', BigInt('0xaf63de4c8601eff2')],
  ['d', BigInt('0xaf63d94c8601e773')],
  ['foo', BigInt('0xdcb27518fed9d577')],
  ['foobar', BigInt('0x85944171f73967e8')],
  ['hello', BigInt('0xa430d84680aabd0b')],
  ['hello world', BigInt('0x779a65e7023cd2e7')],
];

describe('fnv1a64', () => {
  it('matches the canonical FNV-1a 64-bit reference vectors', () => {
    for (const [input, expected] of referenceVectors) {
      expect(toU64(fnv1a64(input))).toBe(expected);
    }
  });

  it('returns the offset basis unchanged for the empty string', () => {
    expect(fnv1a64('')).toEqual([0xcb_f2_9c_e4, 0x84_22_23_25]);
  });

  it('is deterministic across repeated calls', () => {
    const key = '/project/src/index.ts';
    expect(fnv1a64(key)).toEqual(fnv1a64(key));
  });

  it('changes BOTH lanes on a single-character edit (regression guard: the old impl barely mixed the high lane)', () => {
    const [hiA, loA] = fnv1a64('foobar');
    const [hiB, loB] = fnv1a64('foobas');
    expect(hiA).not.toBe(hiB);
    expect(loA).not.toBe(loB);
  });

  it('returns unsigned 32-bit integer lanes', () => {
    const inputs = ['', 'a', 'inline-1024', '/a/b/c.ts', '/very/long/path/segment/'.repeat(50)];
    for (const input of inputs) {
      const [hi, lo] = fnv1a64(input);
      for (const lane of [hi, lo]) {
        expect(Number.isInteger(lane)).toBe(true);
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane).toBeLessThanOrEqual(0xff_ff_ff_ff);
      }
    }
  });

  it('hashes UTF-8 bytes, not UTF-16 low bytes', () => {
    // 'café' is UTF-8 [0x63, 0x61, 0x66, 0xc3, 0xa9]; the old `& 0xff` low-byte
    // path would have hashed [0x63, 0x61, 0x66, 0xe9] and produced a different value.
    expect(toU64(fnv1a64('café'))).toBe(BigInt('0x48e8823acfa40d89'));
  });
});
