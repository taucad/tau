/**
 * Corrupt input to Tau's pack reader raises an error and never answers bytes
 * (W2 review p1): delta instructions, index tables, pack trailers, entry
 * sizes and delta chains are all checked.
 */
/* oxlint-disable no-bitwise -- pack entry headers are bit fields. */
import { describe, expect, it } from 'vitest';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { bytesToHex, digest } from '#object-hash.js';
import { encodePackIndex, readPackIndex } from '#pack-reader/pack-index.js';
import type { PackIndexEntry } from '#pack-reader/pack-index.js';
import { applyDelta } from '#pack-reader/delta.js';
import { createBaseCache, createPackReader, emptyReadCounters } from '#pack-reader/pack-reader.js';

const compute = createInlineCompute();
const encoder = new TextEncoder();
const oidA = 'aa'.repeat(20);
const oidB = 'bb'.repeat(20);

/* An entry header: type and size, little-endian groups of seven bits after the first four. */
const header = (type: number, size: number): number[] => {
  const bytes: number[] = [];
  let byte = (type << 4) | (size & 0x0f);
  let rest = Math.floor(size / 16);
  while (rest > 0) {
    bytes.push(byte | 0x80);
    byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
  }
  bytes.push(byte);
  return bytes;
};

/* A pack of these entries, with its real trailer, and the index of it. */
const packOf = async (
  entries: ReadonlyArray<readonly [oid: string, bytes: Uint8Array<ArrayBuffer>]>,
): Promise<Readonly<{ pack: Uint8Array<ArrayBuffer>; stored: Uint8Array<ArrayBuffer>; offsets: number[] }>> => {
  const parts: number[] = [0x50, 0x41, 0x43, 0x4b, 0, 0, 0, 2, 0, 0, 0, entries.length];
  const indexed: PackIndexEntry[] = [];
  const offsets: number[] = [];
  for (const [oid, bytes] of entries) {
    offsets.push(parts.length);
    indexed.push({ oid, offset: parts.length, crc32: 0 });
    parts.push(...bytes);
  }
  const body = Uint8Array.from(parts);
  const checksum = bytesToHex(digest('sha1', body));
  const pack = new Uint8Array(body.byteLength + 20);
  pack.set(body);
  pack.set(digest('sha1', body), body.byteLength);
  return { pack, stored: await encodePackIndex(indexed, checksum, compute.sha1), offsets };
};

const readerOver = (pack: Uint8Array<ArrayBuffer>, stored: Uint8Array<ArrayBuffer>, size = pack.byteLength) => {
  const counters = emptyReadCounters();
  let reads = 0;
  const reader = createPackReader({
    path: 'pack-test.pack',
    size,
    index: readPackIndex(stored),
    readRange: async (_path, offset, length) => {
      reads += 1;
      return pack.slice(offset, offset + length);
    },
    compute,
    cache: createBaseCache(1 << 20),
    counters,
    readBase: async () => undefined,
  });
  return { reader, counters, reads: () => reads };
};

/* Re-sign an index whose tables were changed, so only the check under test can refuse it. */
const resigned = (stored: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(stored);
  copy.set(digest('sha1', copy.subarray(0, copy.byteLength - 20)), copy.byteLength - 20);
  return copy;
};

describe('applyDelta', () => {
  const base = encoder.encode('0123456789');

  it('applies copies and inserts within bounds', () => {
    /* Target 7: copy 3 bytes from offset 2, then insert "xyzw". */
    const delta = Uint8Array.from([10, 7, 0x91, 2, 3, 4, ...encoder.encode('xyzw')]);
    expect(new TextDecoder().decode(applyDelta(delta, base))).toBe('234xyzw');
  });

  it.each([
    ['a copy past the end of its base', [10, 10, 0x91, 5, 10]],
    ['an insert past the end of the delta', [10, 5, 0x05, 65, 66]],
    ['a copy past the target size', [10, 2, 0x91, 0, 5]],
    ['an insert past the target size', [10, 1, 0x02, 65, 66]],
    ['a truncated size', [0x8a]],
    ['a truncated copy', [10, 10, 0x91, 5]],
    ['a reserved instruction', [10, 1, 0x00]],
    ['a short target', [10, 5, 0x91, 0, 2]],
  ])('refuses %s', (_, bytes) => {
    expect(() => applyDelta(Uint8Array.from(bytes), base)).toThrow(TypeError);
  });
});

describe('readPackIndex', () => {
  it('reads large offsets', async () => {
    const large = 3 * 2 ** 31 + 7;
    const stored = await encodePackIndex(
      [
        { oid: oidA, offset: 12, crc32: 0 },
        { oid: oidB, offset: large, crc32: 0 },
      ],
      'cc'.repeat(20),
      compute.sha1,
    );
    const index = readPackIndex(stored);
    expect(index.offsetOf(oidB)).toBe(large);
    expect(index.offsetOf(oidA)).toBe(12);
    expect(index.endOf(12, 10 ** 12)).toBe(large);
    expect(index.offsetRange).toStrictEqual([12, large]);
  });

  it('refuses an index whose own checksum does not match', async () => {
    const stored = await encodePackIndex([{ oid: oidA, offset: 12, crc32: 0 }], 'cc'.repeat(20), compute.sha1);
    const bad = new Uint8Array(stored);
    bad[bad.byteLength - 1]! ^= 0xff;
    expect(() => readPackIndex(bad)).toThrow(/checksum/u);
  });

  it('refuses an index that is not the size its object count gives', async () => {
    const stored = await encodePackIndex([{ oid: oidA, offset: 12, crc32: 0 }], 'cc'.repeat(20), compute.sha1);
    const longer = new Uint8Array(stored.byteLength + 100);
    longer.set(stored.subarray(0, stored.byteLength - 40));
    longer.set(stored.subarray(stored.byteLength - 40), stored.byteLength + 60);
    expect(() => readPackIndex(resigned(longer))).toThrow(/size/u);
    expect(() => readPackIndex(resigned(stored.slice(0, stored.byteLength - 8)))).toThrow(/size/u);
  });

  it('refuses a fanout that decreases and ids out of order', async () => {
    const stored = await encodePackIndex(
      [
        { oid: oidA, offset: 12, crc32: 0 },
        { oid: oidB, offset: 40, crc32: 0 },
      ],
      'cc'.repeat(20),
      compute.sha1,
    );
    const decreasing = new Uint8Array(stored);
    new DataView(decreasing.buffer).setUint32(8 + 0xaa * 4, 5);
    expect(() => readPackIndex(resigned(decreasing))).toThrow(/fanout/u);

    const swapped = new Uint8Array(stored);
    const ids = 8 + 256 * 4;
    swapped.set(stored.subarray(ids + 20, ids + 40), ids);
    swapped.set(stored.subarray(ids, ids + 20), ids + 20);
    expect(() => readPackIndex(resigned(swapped))).toThrow(/order/u);
  });

  it('refuses a large offset the index does not hold', async () => {
    const stored = await encodePackIndex([{ oid: oidA, offset: 12, crc32: 0 }], 'cc'.repeat(20), compute.sha1);
    const flagged = new Uint8Array(stored);
    new DataView(flagged.buffer).setUint32(8 + 256 * 4 + 20 + 4, 0x80_00_00_00);
    expect(() => readPackIndex(resigned(flagged))).toThrow(/large offset/u);
  });
});

describe('the pack reader on corrupt packs', () => {
  it('reads a whole entry it can check', async () => {
    const body = encoder.encode('hello');
    const { pack, stored } = await packOf([
      [oidA, Uint8Array.from([...header(3, 5), ...(await compute.deflate(body))])],
    ]);
    const { reader, counters } = readerOver(pack, stored);
    await expect(reader.read(oidA)).resolves.toStrictEqual({ type: 'blob', data: body });
    expect(counters.packChecks).toBe(1);
  });

  it('refuses a pack shorter than its index says', async () => {
    const { pack, stored } = await packOf([
      [oidA, Uint8Array.from([...header(3, 5), ...(await compute.deflate(encoder.encode('hello')))])],
    ]);
    expect(() => readerOver(pack, stored, 20)).toThrow(/shorter/u);
  });

  it('refuses a pack whose trailer is not the checksum its index records', async () => {
    const { pack, stored } = await packOf([
      [oidA, Uint8Array.from([...header(3, 5), ...(await compute.deflate(encoder.encode('hello')))])],
    ]);
    const other = new Uint8Array(pack);
    other[other.byteLength - 1]! ^= 0xff;
    await expect(readerOver(other, stored).reader.read(oidA)).rejects.toThrow(/checksum/u);
  });

  it('refuses an entry that inflates to a size other than the one it declares', async () => {
    const { pack, stored } = await packOf([
      [oidA, Uint8Array.from([...header(3, 99), ...(await compute.deflate(encoder.encode('hello')))])],
    ]);
    await expect(readerOver(pack, stored).reader.read(oidA)).rejects.toThrow(/declares/u);
  });

  it('refuses an offset delta that names itself or a base before the pack', async () => {
    const delta = await compute.deflate(Uint8Array.from([1, 1, 0x01, 0x41]));
    const selfBase = await packOf([[oidA, Uint8Array.from([...header(6, 4), 0x00, ...delta])]]);
    const reading = readerOver(selfBase.pack, selfBase.stored);
    await expect(reading.reader.read(oidA)).rejects.toThrow(/not before it/u);
    expect(reading.reads()).toBeLessThan(3);

    const beforePack = await packOf([[oidA, Uint8Array.from([...header(6, 4), 0x20, ...delta])]]);
    await expect(readerOver(beforePack.pack, beforePack.stored).reader.read(oidA)).rejects.toThrow(/not before it/u);
  });

  it('stops a delta chain that never reaches a whole object', async () => {
    /* Two ref deltas whose bases are each other: a cycle no depth resolves. */
    const delta = await compute.deflate(Uint8Array.from([1, 1, 0x01, 0x41]));
    const refTo = (oid: string): Uint8Array<ArrayBuffer> =>
      Uint8Array.from([
        ...header(7, 4),
        ...Array.from({ length: 20 }, (_, index) => Number.parseInt(oid.slice(index * 2, index * 2 + 2), 16)),
        ...delta,
      ]);
    const { pack, stored } = await packOf([
      [oidA, refTo(oidB)],
      [oidB, refTo(oidA)],
    ]);
    const reading = readerOver(pack, stored);
    await expect(reading.reader.read(oidA)).rejects.toThrow(/longer than 10000/u);
    expect(reading.reads()).toBeLessThanOrEqual(10_003);
  });
});
