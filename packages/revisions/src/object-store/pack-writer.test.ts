/* oxlint-disable no-bitwise -- the reference CRC is a bit field. */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { frameObject } from '#git-objects.js';
import { buildPack, crc32, indexBuiltPack } from '#object-store/pack-writer.js';
import type { PackObject } from '#object-store/pack-writer.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

/* The byte-at-a-time table CRC this one replaced: the reference it must equal. */
const referenceTable = Uint32Array.from({ length: 256 }, (_value, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 0 ? value >>> 1 : 0xed_b8_83_20 ^ (value >>> 1);
  }
  return value >>> 0;
});
const referenceCrc32 = (...parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): number => {
  let crc = 0xff_ff_ff_ff;
  for (const part of parts) {
    for (const byte of part) {
      crc = referenceTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

describe('crc32', () => {
  it('answers the published check values', () => {
    expect(crc32()).toBe(0);
    expect(crc32(bytes(''))).toBe(0);
    expect(crc32(bytes('a'))).toBe(0xe8_b7_be_43);
    expect(crc32(bytes('123456789'))).toBe(0xcb_f4_39_26);
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x41_4f_a3_39);
    expect(crc32(new Uint8Array(32))).toBe(0x19_0a_55_ad);
    expect(crc32(new Uint8Array(32).fill(0xff))).toBe(0xff_6c_ab_0b);
  });

  it('equals the byte-at-a-time CRC and zlib for every length, offset and split', () => {
    const source = new Uint8Array(randomBytes(4096));
    for (let length = 0; length <= 70; length += 1) {
      for (const offset of [0, 1, 3, 7]) {
        const run = source.subarray(offset, offset + length);
        expect(crc32(run)).toBe(referenceCrc32(run));
        expect(crc32(run)).toBe(zlibCrc32(run));
        for (const cut of [0, 1, 5, 8, 9, length]) {
          const at = Math.min(cut, length);
          expect(crc32(run.subarray(0, at), run.subarray(at))).toBe(referenceCrc32(run));
        }
      }
    }
    expect(crc32(source)).toBe(referenceCrc32(source));
    expect(crc32(source.subarray(13, 4001))).toBe(zlibCrc32(source.subarray(13, 4001)));
  });
});

describe.runIf(gitToolchainOnPath)('a pack and index written here', () => {
  it('index byte for byte as git indexes the same pack, and pass git verify-pack', async () => {
    const compute = createInlineCompute();
    const bodies: Array<Uint8Array<ArrayBuffer>> = [
      new Uint8Array(randomBytes(70_001)),
      bytes('cube(10);\n'.repeat(5000)),
      new Uint8Array(0),
      bytes('x'),
      ...Array.from({ length: 40 }, (_value, index) => new Uint8Array(randomBytes((index + 1) * 37))),
    ];
    const objects: PackObject[] = await Promise.all(
      bodies.map(async (data) => ({ type: 'blob', data, oid: await compute.sha1(frameObject('blob', data)) })),
    );
    const built = await buildPack(objects, compute);
    const index = await indexBuiltPack(built, compute);
    const directory = await mkdtemp(join(tmpdir(), 'tau-pack-writer-'));
    try {
      const packPath = join(directory, `pack-${built.checksum}.pack`);
      await writeFile(packPath, built.pack);
      execFileSync('git', ['index-pack', '-o', join(directory, 'git.idx'), packPath], { cwd: directory });
      expect(new Uint8Array(await readFile(join(directory, 'git.idx')))).toEqual(index);
      await writeFile(join(directory, `pack-${built.checksum}.idx`), index);
      const verified = execFileSync('git', ['verify-pack', '-v', join(directory, `pack-${built.checksum}.idx`)], {
        cwd: directory,
        encoding: 'utf8',
      });
      expect(verified).toContain(`pack-${built.checksum}.pack: ok`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
