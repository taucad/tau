import { MemoryProvider } from '@taucad/filesystem/backend';
import { describe, expect, it } from 'vitest';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { digestHex } from '#object-hash.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import { buildPack, indexBuiltPack } from '#object-store/pack-writer.js';
import type { PackObject } from '#object-store/pack-writer.js';
import { coalesceRanges, maximumRangeBytes, openRemotePack } from '#object-store/remote-pack.js';
import { encodePackIndex } from '#pack-reader/pack-index.js';

const encoder = new TextEncoder();
const inline = createInlineCompute();

const blob = (text: string): PackObject => {
  const data = encoder.encode(text);
  return {
    oid: digestHex('sha1', new Uint8Array([...encoder.encode(`blob ${String(data.byteLength)}\0`), ...data])),
    type: 'blob',
    data,
  };
};

/* Distinct blobs that do not delta against each other. */
const blobs = (count: number): PackObject[] =>
  Array.from({ length: count }, (_value, at) => blob(`part(${String(at)}); // ${String(at * 7919)}\n`));

const sha1Hex = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => inline.sha1(bytes);

describe('coalesceRanges', () => {
  it('cuts one entry longer than the segment ceiling into reads of at most the ceiling', () => {
    const end = maximumRangeBytes * 2 + 100;
    const cut = coalesceRanges([[10, end]]);
    expect(cut).toEqual([
      [10, 10 + maximumRangeBytes],
      [10 + maximumRangeBytes, 10 + 2 * maximumRangeBytes],
      [10 + 2 * maximumRangeBytes, end],
    ]);
  });
});

describe('openRemotePack', () => {
  it('sends at most 32 Range reads at once in a wave', async () => {
    const objects = blobs(100);
    const built = await buildPack(objects, inline);
    const index = await indexBuiltPack(built, inline);
    let inFlight = 0;
    let most = 0;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index,
      compute: inline,
      fetchRange: async (offset, length) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        inFlight -= 1;
        return built.pack.slice(offset, offset + length);
      },
    });
    /* Every other object: no two touch, so each is its own read. */
    const wanted = built.entries
      .toSorted((left, right) => left.offset - right.offset)
      .filter((_entry, at) => at % 2 === 0)
      .map((entry) => entry.oid);
    const read = await pack.readMany(wanted);
    expect(read.size).toBe(50);
    expect(pack.counters.rangeRequests).toBeGreaterThan(32);
    expect(most).toBe(32);
  });

  it('asks for the trailer again after a read that failed on the way', async () => {
    const objects = blobs(3);
    const built = await buildPack(objects, inline);
    let failing = true;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => {
        if (failing) {
          throw new Error('The connection was reset.');
        }
        return built.pack.slice(offset, offset + length);
      },
    });
    await expect(pack.readMany([objects[0]!.oid])).rejects.toThrow('reset');
    failing = false;
    const read = await pack.readMany([objects[0]!.oid]);
    expect(read.get(objects[0]!.oid)?.data).toStrictEqual(objects[0]!.data);
  });

  it('runs calls side by side under one Range pool, and fetches the trailer once for both', async () => {
    const objects = blobs(200);
    const built = await buildPack(objects, inline);
    const trailerAt = built.pack.byteLength - 20;
    let inFlight = 0;
    let most = 0;
    let trailerReads = 0;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        if (offset + length > trailerAt) {
          trailerReads += 1;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        inFlight -= 1;
        return built.pack.slice(offset, offset + length);
      },
    });
    /* Every other object, split between two calls: no two touch, so each is a read of its own. */
    const sorted = built.entries.toSorted((left, right) => left.offset - right.offset);
    const even = sorted.filter((_entry, at) => at % 4 === 0).map((entry) => entry.oid);
    const odd = sorted.filter((_entry, at) => at % 4 === 2).map((entry) => entry.oid);
    const [left, right] = await Promise.all([pack.readMany(even), pack.readMany(odd)]);
    expect(left.size).toBe(50);
    expect(right.size).toBe(50);
    /* Both calls overlapped (more than one call's 32), and their reads together never passed the pool. */
    expect(most).toBe(32);
    expect(trailerReads).toBe(1);
    for (const object of objects.filter((candidate) => left.has(candidate.oid) || right.has(candidate.oid))) {
      expect((left.get(object.oid) ?? right.get(object.oid))?.data).toStrictEqual(object.data);
    }
  });

  it('answers a whole entry with the deflated body it inflated from', async () => {
    const objects = blobs(3);
    const built = await buildPack(objects, inline);
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => built.pack.slice(offset, offset + length),
    });
    const read = await pack.readMany(objects.map((object) => object.oid));
    const inflated = await Promise.all(
      objects.map(async (object) => inline.inflate(new Uint8Array(read.get(object.oid)!.compressed!))),
    );
    expect(inflated).toStrictEqual(objects.map((object) => object.data));
    /* Each body is its own bytes: none pins the Range read it was cut from. */
    for (const object of objects) {
      const { compressed } = read.get(object.oid)!;
      expect(compressed!.buffer.byteLength).toBe(compressed!.byteLength);
    }
  });

  it('starts no queued Range read once its call has failed', async () => {
    const objects = blobs(100);
    const built = await buildPack(objects, inline);
    let reads = 0;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => {
        reads += 1;
        const ordinal = reads;
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        if (ordinal === 1) {
          throw new Error('The connection was reset.');
        }
        return built.pack.slice(offset, offset + length);
      },
    });
    const wanted = built.entries
      .toSorted((left, right) => left.offset - right.offset)
      .filter((_entry, at) => at % 2 === 0)
      .map((entry) => entry.oid);
    await expect(pack.readMany(wanted)).rejects.toThrow('reset');
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    /* The first 32 were in flight; the 19 queued behind them never started. */
    expect(reads).toBe(32);
  });

  it("refuses an object whose bytes are another object's", async () => {
    const objects = blobs(2);
    const built = await buildPack(objects, inline);
    /* An index whose checksums are whole but which places each object at the other's entry. */
    const [first, second] = built.entries;
    const swapped = [
      { ...first!, offset: second!.offset },
      { ...second!, offset: first!.offset },
    ];
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await encodePackIndex(swapped, built.checksum, sha1Hex),
      compute: inline,
      fetchRange: async (offset, length) => built.pack.slice(offset, offset + length),
    });
    await expect(pack.readMany([first!.oid])).rejects.toBeInstanceOf(TypeError);
  });
});

describe('openBlob', () => {
  const storeHolding = async (pack: Uint8Array<ArrayBuffer>, index: Uint8Array<ArrayBuffer>, checksum: string) => {
    const provider = new MemoryProvider();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    await provider.writeFile(`.git/objects/pack/pack-${checksum}.pack`, pack);
    await provider.writeFile(`.git/objects/pack/pack-${checksum}.idx`, index);
    return createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute: inline,
      fenceName: `open-blob-${checksum}`,
    });
  };

  it('stops a stream that inflates past the size its entry declares', async () => {
    const object = blob('0123456789');
    const built = await buildPack([object], inline);
    /* The entry's one-byte header: a blob of 10 bytes, rewritten to declare 5. */
    const entryAt = built.entries[0]!.offset;
    const pack = new Uint8Array(built.pack);
    expect(pack[entryAt]).toBe(0x3a);
    pack[entryAt] = 0x35;
    const checksum = await sha1Hex(pack.slice(0, -20));
    pack.set(
      Uint8Array.from(checksum.match(/../gu)!, (pair) => Number.parseInt(pair, 16)),
      pack.byteLength - 20,
    );
    const store = await storeHolding(pack, await encodePackIndex(built.entries, checksum, sha1Hex), checksum);
    const stream = await store.openBlob(object.oid);
    await expect(new Response(stream).arrayBuffer()).rejects.toBeInstanceOf(TypeError);
  });

  it('answers what the pack says is wrong rather than fall back', async () => {
    const object = blob('cube(1);\n');
    const built = await buildPack([object], inline);
    const pack = new Uint8Array(built.pack);
    pack[pack.byteLength - 1] = 255 - pack[pack.byteLength - 1]!;
    const store = await storeHolding(pack, await indexBuiltPack(built, inline), built.checksum);
    await expect(store.openBlob(object.oid)).rejects.toBeInstanceOf(TypeError);
  });
});
