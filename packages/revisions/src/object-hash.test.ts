/**
 * The repository hashers against `node:crypto`: one-shot and incremental,
 * at every block boundary, split anywhere, and over a view into a larger
 * buffer.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { bytesToHex, createDigest, digest } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';

const lengths = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096, 65_535, 65_536, 1_000_003];
const formats: readonly ObjectFormat[] = ['sha1', 'sha256'];

/* Deterministic bytes, so a failure names the same input every run. */
const bytesOf = (length: number, seed = 0): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  let state = (seed + 1) * 2_654_435_761;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    bytes[index] = state % 256;
  }
  return bytes;
};

/* Split points drawn from the same generator: every piece is non-empty but the last may be. */
const splitsOf = (length: number, seed: number): number[] => {
  const cuts = new Set<number>();
  const draws = bytesOf(8, seed);
  for (const draw of draws) {
    cuts.add(length === 0 ? 0 : (draw * 7919) % (length + 1));
  }
  return [...cuts].toSorted((left, right) => left - right);
};

const expected = (format: ObjectFormat, bytes: Uint8Array<ArrayBuffer>): string =>
  createHash(format).update(bytes).digest('hex');

describe('the repository hashers', () => {
  for (const format of formats) {
    for (const length of lengths) {
      it(`should answer ${format} of ${String(length)} bytes as node:crypto does, whole and split`, () => {
        const bytes = bytesOf(length, length);
        const want = expected(format, bytes);
        expect(bytesToHex(digest(format, bytes))).toBe(want);
        for (let seed = 0; seed < 4; seed += 1) {
          const hasher = createDigest(format);
          let from = 0;
          for (const cut of splitsOf(length, seed)) {
            hasher.update(bytes.subarray(from, cut));
            from = cut;
          }
          hasher.update(bytes.subarray(from));
          /* An empty last update changes nothing. */
          hasher.update(new Uint8Array(new ArrayBuffer(0)));
          expect(bytesToHex(hasher.finish())).toBe(want);
        }
      });
    }

    it(`should hash a view into a larger buffer (${format}), never the bytes around it`, () => {
      const backing = bytesOf(5000, 7);
      const view = backing.subarray(3, 4099);
      const hasher = createDigest(format);
      hasher.update(view.subarray(0, 61));
      hasher.update(view.subarray(61));
      const want = expected(format, view);
      expect(bytesToHex(hasher.finish())).toBe(want);
      expect(bytesToHex(digest(format, view))).toBe(want);
    });

    it(`should refuse more input or a second answer once finished (${format})`, () => {
      const hasher = createDigest(format);
      hasher.update(bytesOf(10));
      hasher.finish();
      expect(() => {
        hasher.update(bytesOf(1));
      }).toThrow(TypeError);
      expect(() => hasher.finish()).toThrow(TypeError);
    });
  }
});
