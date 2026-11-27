import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { describe, expect, it } from 'vitest';
import { createInlineCompute } from '#compute-worker/compute-worker.js';
import { digestHex } from '#object-hash.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import { buildPack, indexBuiltPack } from '#object-store/pack-writer.js';
import type { PackObject } from '#object-store/pack-writer.js';
import { aheadPieces, coalesceRanges, maximumRangeBytes, openRemotePack } from '#object-store/remote-pack.js';
import { encodePackIndex, readPackIndex } from '#pack-reader/pack-index.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

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

/* A blob of `bytes` random bytes: it does not compress. */
const randomBlob = (bytes: number): PackObject => {
  const data = new Uint8Array(randomBytes(bytes));
  return {
    oid: createHash('sha1')
      .update(`blob ${String(bytes)}\0`)
      .update(data)
      .digest('hex'),
    type: 'blob',
    data,
  };
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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

describe('aheadPieces', () => {
  it('cuts entries into pieces and names the part of each entry every piece fills', () => {
    const pieces = aheadPieces(
      [
        { start: 0, end: 10, rank: 2 },
        { start: 10, end: 25, rank: 0 },
        { start: 40, end: 45, rank: 1 },
      ],
      8,
    );
    expect(pieces.map(({ start, end, rank }) => [start, end, rank])).toEqual([
      [0, 8, 2],
      [8, 16, 0],
      [16, 24, 0],
      [24, 25, 0],
      [40, 45, 1],
    ]);
    expect(pieces.map((piece) => piece.fills)).toEqual([
      [[0, 0]],
      [
        [0, 1],
        [1, 0],
      ],
      [[1, 1]],
      [[1, 2]],
      [[2, 0]],
    ]);
  });

  it('stays linear in scattered entries', () => {
    /*
     * 200,000 entries none of which touches the next: one piece each. A sweep, not a scan per entry (SP6 review):
     * every read of an entry's bounds is counted, and a sweep reads each a few times, never once per piece.
     */
    let reads = 0;
    const entries = Array.from({ length: 200_000 }, (_value, at) => ({
      get start(): number {
        reads += 1;
        return at * 100;
      },
      get end(): number {
        reads += 1;
        return at * 100 + 50;
      },
      rank: at,
    }));
    const pieces = aheadPieces(entries, 1024 * 1024);
    expect(pieces).toHaveLength(entries.length);
    expect(pieces.at(-1)!.fills).toEqual([[entries.length - 1, 0]]);
    expect(reads).toBeLessThanOrEqual(entries.length * 8);
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

  it('checks a whole entry against its id in the one call that inflates it, and refuses one whose bytes are not it', async () => {
    // A whole entry was inflated in one compute call and hashed in another: its object crossed to the worker twice and
    // was framed on the caller's thread in between (SP6-import).
    const objects = blobs(20);
    const built = await buildPack(objects, inline);
    const calls: string[] = [];
    const counted = Object.fromEntries(
      Object.entries(inline).map(([name, call]) => [
        name,
        async (...args: unknown[]) => {
          calls.push(name);
          return (call as (...inner: unknown[]) => Promise<unknown>)(...args);
        },
      ]),
    ) as unknown as typeof inline;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: counted,
      fetchRange: async (offset, length) => built.pack.slice(offset, offset + length),
    });
    calls.length = 0;
    const read = await pack.readMany(objects.map((object) => object.oid));
    expect(read.size).toBe(objects.length);
    for (const object of objects) {
      expect(read.get(object.oid)?.data).toStrictEqual(object.data);
      expect(read.get(object.oid)).not.toHaveProperty('oid');
    }
    expect(calls.filter((name) => name === 'sha1' || name === 'inflate')).toEqual([]);
    expect(calls.filter((name) => name === 'inflateObject')).toHaveLength(objects.length);

    /* An index that names another object at an entry's offset: the read answers other bytes for it, refused. */
    const [first, second] = built.entries.toSorted((left, right) => left.offset - right.offset);
    const swapped = await encodePackIndex(
      built.entries.map((entry) =>
        entry.oid === first!.oid
          ? { ...entry, oid: second!.oid }
          : entry.oid === second!.oid
            ? { ...entry, oid: first!.oid }
            : entry,
      ),
      built.checksum,
      sha1Hex,
    );
    const lying = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: swapped,
      compute: inline,
      fetchRange: async (offset, length) => built.pack.slice(offset, offset + length),
    });
    await expect(lying.readMany([first!.oid])).rejects.toThrow(/answered other bytes/u);
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

  it('serves a call from what a read-ahead holds or is landing, and asks again once it is released', async () => {
    const objects = blobs(20);
    const built = await buildPack(objects, inline);
    let reads = 0;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => {
        reads += 1;
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        return built.pack.slice(offset, offset + length);
      },
    });
    const budget = { bytes: built.pack.byteLength };
    const ahead = pack.readAhead(
      objects.map((object) => object.oid),
      budget,
    );
    /* Asked while the read-ahead is still landing: it waits for it rather than ask again. */
    const read = await pack.readMany(objects.map((object) => object.oid));
    expect([...read.values()].map((object) => object.data)).toStrictEqual(objects.map((object) => object.data));
    /* The entries in one run, and the trailer beside them. */
    expect(reads).toBe(2);
    expect(pack.counters.waves).toBe(1);
    await ahead.release();
    await pack.readMany([objects[3]!.oid]);
    expect(reads).toBe(3);
  });

  it('spends its budget in the order asked, and stops at the first entry past it', async () => {
    const objects = blobs(10);
    const built = await buildPack(objects, inline);
    const asked: Array<readonly [number, number]> = [];
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => {
        asked.push([offset, offset + length]);
        return built.pack.slice(offset, offset + length);
      },
    });
    const sorted = built.entries.toSorted((left, right) => left.offset - right.offset);
    const firstTwo = pack.entryBytes(sorted[0]!.oid)! + pack.entryBytes(sorted[1]!.oid)!;
    const budget = { bytes: firstTwo + 1 };
    const ahead = pack.readAhead(
      sorted.map((entry) => entry.oid),
      budget,
    );
    await ahead.release();
    expect(budget.bytes).toBe(1);
    const trailerAt = built.pack.byteLength - 20;
    expect(asked.filter(([start]) => start < trailerAt)).toEqual([[sorted[0]!.offset, sorted[0]!.offset + firstTwo]]);
  });

  it('fails only the call waiting on a read-ahead that failed, and the next call asks again', async () => {
    const objects = blobs(4);
    const built = await buildPack(objects, inline);
    let failing = true;
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        if (failing) {
          throw new Error('The connection was reset.');
        }
        return built.pack.slice(offset, offset + length);
      },
    });
    const ahead = pack.readAhead([objects[0]!.oid], { bytes: built.pack.byteLength });
    await expect(pack.readMany([objects[0]!.oid])).rejects.toThrow('reset');
    await ahead.release();
    failing = false;
    const read = await pack.readMany([objects[0]!.oid]);
    expect(read.get(objects[0]!.oid)?.data).toStrictEqual(objects[0]!.data);
  });

  it('lets a call waiting on an entry a release dropped ask for it itself', async () => {
    /* More pieces than a read-ahead's 24 reads: some are still queued when it stops. */
    const objects = Array.from({ length: 30 }, () => randomBlob(1_153_434));
    const built = await buildPack(objects, inline);
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length, signal) => {
        await sleep(20);
        signal?.throwIfAborted();
        return built.pack.slice(offset, offset + length);
      },
    });
    const ahead = pack.readAhead(
      objects.map((object) => object.oid),
      { bytes: built.pack.byteLength },
    );
    const last = objects.at(-1)!;
    const reading = pack.readMany([last.oid]);
    await sleep(5);
    await ahead.release();
    const read = await reading;
    expect(Buffer.from(read.get(last.oid)!.data).equals(last.data)).toBe(true);
    expect(pack.counters.aheadHeldBytes).toBe(0);
  }, 30_000);

  it('fails a call waiting on a read that failed with its own cause, and not a call waiting on another', async () => {
    /* More pieces than a read-ahead's 24 reads: some are still queued when it stops. */
    const objects = Array.from({ length: 30 }, () => randomBlob(1_153_434));
    const built = await buildPack(objects, inline);
    const sorted = built.entries.toSorted((left, right) => left.offset - right.offset);
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length, signal) => {
        await sleep(offset === sorted[0]!.offset ? 2 : 20);
        signal?.throwIfAborted();
        if (offset === sorted[0]!.offset) {
          throw new Error('The connection was reset.');
        }
        return built.pack.slice(offset, offset + length);
      },
    });
    const ahead = pack.readAhead(
      sorted.map((entry) => entry.oid),
      { bytes: built.pack.byteLength },
    );
    const lastOid = sorted.at(-1)!.oid;
    const [first, last] = await Promise.allSettled([pack.readMany([sorted[0]!.oid]), pack.readMany([lastOid])]);
    await ahead.release();
    expect(first.status === 'rejected' && String(first.reason)).toContain('reset');
    const lastData = last.status === 'fulfilled' ? last.value.get(lastOid)?.data : undefined;
    expect(Buffer.from(lastData!).equals(objects.find((object) => object.oid === lastOid)!.data)).toBe(true);
  }, 30_000);

  it('drops each entry once a call has read it, and holds no more than its budget', async () => {
    const objects = blobs(20);
    const built = await buildPack(objects, inline);
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => built.pack.slice(offset, offset + length),
    });
    const oids = objects.map((object) => object.oid);
    const total = oids.reduce((sum, oid) => sum + pack.entryBytes(oid)!, 0);
    const ahead = pack.readAhead(oids, { bytes: total });
    await pack.readMany(oids.slice(0, 10));
    const rest = oids.slice(10).reduce((sum, oid) => sum + pack.entryBytes(oid)!, 0);
    expect(pack.counters.aheadHeldBytes).toBe(rest);
    expect(pack.counters.aheadPeakBytes).toBeLessThanOrEqual(total);
    await ahead.release();
    expect(pack.counters.aheadHeldBytes).toBe(0);
  });

  it('refuses a budget that is not a finite count of bytes', async () => {
    const objects = blobs(2);
    const built = await buildPack(objects, inline);
    const pack = await openRemotePack({
      name: `pack-${built.checksum}`,
      size: built.pack.byteLength,
      index: await indexBuiltPack(built, inline),
      compute: inline,
      fetchRange: async (offset, length) => built.pack.slice(offset, offset + length),
    });
    for (const bytes of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => pack.readAhead([objects[0]!.oid], { bytes })).toThrow(RangeError);
    }
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

/* A call's answer, or `undefined` when it has not settled after `ms`: a hang is a failed assertion, not a stuck run. */
const settledWithin = async <Result>(
  work: Promise<Result>,
  ms: number,
): Promise<PromiseSettledResult<Result> | undefined> =>
  Promise.race([
    (async () => {
      const [settled] = await Promise.allSettled([work]);
      return settled;
    })(),
    (async () => {
      await sleep(ms);
      return undefined;
    })(),
  ]);

describe.runIf(gitToolchainOnPath)('a read-ahead over offset deltas', () => {
  it('settles every base it asked for when a later header does not parse, so no call waits forever', async () => {
    /* Eight similar blobs: git stores one whole and the rest as offset deltas. */
    const directory = await mkdtemp(join(tmpdir(), 'tau-ahead-ofs-'));
    try {
      execFileSync('git', ['init', '-q', directory]);
      const base = Array.from({ length: 2000 }, (_value, line) => `line ${String(line)} ${String(line * 7919)}`);
      const oids: string[] = [];
      for (let version = 0; version < 8; version += 1) {
        const file = join(directory, `f${String(version)}`);
        const lines = base.with(version * 100, `changed ${String(version)}`);
        // oxlint-disable-next-line no-await-in-loop -- one blob at a time.
        await writeFile(file, `${lines.join('\n')}\ntail ${String(version)}\n`);
        oids.push(execFileSync('git', ['-C', directory, 'hash-object', '-w', file], { encoding: 'utf8' }).trim());
      }
      execFileSync(
        'git',
        [
          '-C',
          directory,
          'pack-objects',
          '-q',
          '--window=10',
          '--depth=50',
          '--delta-base-offset',
          join(directory, 'out'),
        ],
        { input: `${oids.join('\n')}\n` },
      );
      const written = await readdir(directory);
      const packFile = written.find((name) => name.startsWith('out-') && name.endsWith('.pack'))!;
      const packBytes = new Uint8Array(await readFile(join(directory, packFile)));
      const indexBytes = new Uint8Array(await readFile(join(directory, packFile.replace(/\.pack$/u, '.idx'))));
      const verified = execFileSync(
        'git',
        ['verify-pack', '-v', join(directory, packFile.replace(/\.pack$/u, '.idx'))],
        {
          encoding: 'utf8',
        },
      );
      const deltas = verified
        .split('\n')
        .map((line) => line.split(/\s+/u))
        .filter((fields) => /^[\da-f]{40}$/u.test(fields[0] ?? '') && fields.length >= 7)
        .map((fields) => fields[0]!);
      expect(deltas.length).toBeGreaterThanOrEqual(2);
      const index = readPackIndex(indexBytes);
      /* The second delta's base distance zeroed as served: its header names no base before it. */
      let corruptAt = index.offsetOf(deltas[1]!)!;
      /* Past the entry's size header: each byte below 0x80 ends it. */
      while (packBytes[corruptAt]! >= 0x80) {
        corruptAt += 1;
      }
      corruptAt += 1;
      const pack = await openRemotePack({
        name: `pack-${Buffer.from(packBytes.subarray(-20)).toString('hex')}`,
        size: packBytes.byteLength,
        index: indexBytes,
        compute: inline,
        fetchRange: async (offset, length) => {
          await sleep(3);
          const bytes = packBytes.slice(offset, offset + length);
          if (offset <= corruptAt && corruptAt < offset + length) {
            bytes[corruptAt - offset] = 0;
          }
          return bytes;
        },
      });
      const ahead = pack.readAhead([deltas[0]!, deltas[1]!], { bytes: 1024 * 1024 });
      await sleep(100);
      /* The first delta's base was asked for before the second header failed: a call reaching it still answers. */
      const first = await settledWithin(pack.readMany([deltas[0]!]), 3000);
      expect(first?.status).toBe('fulfilled');
      const second = await settledWithin(pack.readMany([deltas[1]!]), 3000);
      expect(second?.status).toBe('rejected');
      await ahead.release();
      expect(pack.counters.aheadHeldBytes).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
