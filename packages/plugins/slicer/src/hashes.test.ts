import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { md5Hex, sha256Hex } from '#hashes.js';

const samples: Array<[string, Uint8Array<ArrayBuffer>]> = [
  ['empty', new Uint8Array(0)],
  ['abc', new TextEncoder().encode('abc')],
  ['55 bytes (one padding block boundary)', new Uint8Array(55).fill(0x61)],
  ['56 bytes (spills into a second block)', new Uint8Array(56).fill(0x62)],
  ['64 bytes (exact block)', new Uint8Array(64).fill(0x63)],
  ['1 MiB pseudo-random', Uint8Array.from({ length: 1024 * 1024 }, (_, index) => (index * 131 + 17) % 256)],
];

describe('digest', () => {
  it.each(samples)('should match Node SHA-256 for %s', (_name, bytes) => {
    expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it.each(samples)('should match Node MD5 for %s', (_name, bytes) => {
    expect(md5Hex(bytes)).toBe(createHash('md5').update(bytes).digest('hex'));
  });

  it('should hash the known RFC vectors', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(md5Hex(new TextEncoder().encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});
