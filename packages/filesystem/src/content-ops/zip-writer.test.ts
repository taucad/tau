/* oxlint-disable no-bitwise -- The noise generator is a linear congruential step. */
import { describe, expect, it, vi } from 'vitest';
import { centralHeader, crc32, dataDescriptor, endRecords, localHeader, zipStream } from '#content-ops/zip-writer.js';
import type { WrittenEntry, ZipSource } from '#content-ops/zip-writer.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A stream of `bytes` in chunks of `chunk` bytes. */
const chunked = (
  bytes: Uint8Array<ArrayBuffer>,
  chunk = bytes.byteLength || 1,
): ReadableStream<Uint8Array<ArrayBuffer>> => {
  let offset = 0;
  return new ReadableStream({
    pull: (controller) => {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
};

const source = (name: string, bytes: Uint8Array<ArrayBuffer>, chunk?: number): ZipSource => ({
  name,
  open: async () => chunked(bytes, chunk),
});

async function* each<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

const bytesOf = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await new Response(stream).arrayBuffer());

/** Every file the archive holds, read back by JSZip from its central directory. */
const unzipped = async (archive: Uint8Array<ArrayBuffer>): Promise<Record<string, Uint8Array<ArrayBuffer>>> => {
  const { default: jszip } = await import('jszip');
  // eslint-disable-next-line @typescript-eslint/naming-convention -- JSZip's option name.
  const zip = await jszip.loadAsync(archive, { checkCRC32: true });
  const rows = await Promise.all(
    Object.values(zip.files).map(
      async (file): Promise<[string, Uint8Array<ArrayBuffer>]> => [
        file.name,
        new Uint8Array(await file.async('arraybuffer')),
      ],
    ),
  );
  return Object.fromEntries(rows);
};

const view = (bytes: Uint8Array<ArrayBuffer>): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Pseudo-random bytes, so deflate cannot shrink them to nothing. */
const noise = (length: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(length);
  let state = 0x12_34_56_78;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
};

describe('crc32', () => {
  it('should answer the standard check value, in one pass or continued', () => {
    const check = encoder.encode('123456789');

    expect(crc32(0, check)).toBe(0xcb_f4_39_26);
    expect(crc32(crc32(0, check.subarray(0, 4)), check.subarray(4))).toBe(0xcb_f4_39_26);
    expect(crc32(0, new Uint8Array())).toBe(0);
  });
});

describe('zipStream', () => {
  it('should archive every entry so a reader gets its bytes back', async () => {
    const large = noise(300 * 1024);
    const archive = await bytesOf(
      zipStream(
        each([
          source('main.ts', encoder.encode('export const part = 1;')),
          source('empty.txt', new Uint8Array()),
          source('src/größe ✓.ts', encoder.encode('unicode')),
          source('assets/noise.bin', large, 16 * 1024),
        ]),
      ),
    );

    const files = await unzipped(archive);

    expect(Object.keys(files).sort()).toEqual(['assets/noise.bin', 'empty.txt', 'main.ts', 'src/größe ✓.ts']);
    expect(decoder.decode(files['main.ts'])).toBe('export const part = 1;');
    expect(files['empty.txt']).toEqual(new Uint8Array());
    expect(decoder.decode(files['src/größe ✓.ts'])).toBe('unicode');
    expect(files['assets/noise.bin']).toEqual(large);
  });

  it('should write the descriptor layout: UTF-8 names, sizes after the data, the DOS epoch', async () => {
    const content = encoder.encode('hello hello hello');
    const archive = await bytesOf(zipStream(each([source('a.txt', content)])));
    const local = view(archive);

    expect(local.getUint32(0, true)).toBe(0x04_03_4b_50);
    expect(local.getUint16(6, true)).toBe(0x08_08);
    expect(local.getUint16(8, true)).toBe(8);
    expect(local.getUint16(10, true)).toBe(0);
    expect(local.getUint16(12, true)).toBe(0x21);
    expect(local.getUint32(14, true)).toBe(0);

    const end = view(archive.subarray(archive.byteLength - 22));
    expect(end.getUint32(0, true)).toBe(0x06_05_4b_50);
    expect(end.getUint16(10, true)).toBe(1);
    const directoryOffset = end.getUint32(16, true);
    const central = view(archive.subarray(directoryOffset));
    expect(central.getUint32(0, true)).toBe(0x02_01_4b_50);
    expect(central.getUint32(16, true)).toBe(crc32(0, content));
    expect(central.getUint32(24, true)).toBe(content.byteLength);

    /* The descriptor sits just before the directory and repeats what it holds. */
    const descriptor = view(archive.subarray(directoryOffset - 16, directoryOffset));
    expect(descriptor.getUint32(0, true)).toBe(0x08_07_4b_50);
    expect(descriptor.getUint32(4, true)).toBe(crc32(0, content));
    expect(descriptor.getUint32(8, true)).toBe(central.getUint32(20, true));
    expect(descriptor.getUint32(12, true)).toBe(content.byteLength);
  });

  it('should archive the same entries to the same bytes', async () => {
    const entries = (): ZipSource[] => [source('a.txt', encoder.encode('one')), source('b/c.txt', noise(4096))];

    expect(await bytesOf(zipStream(each(entries())))).toEqual(await bytesOf(zipStream(each(entries()))));
  });

  it('should archive an empty iterable to a bare end record', async () => {
    const archive = await bytesOf(zipStream(each([])));

    expect(archive.byteLength).toBe(22);
    expect(await unzipped(archive)).toEqual({});
  });

  it('should open an entry only once the reader has taken everything before it', async () => {
    const opened: string[] = [];
    const tracked = (name: string, bytes: Uint8Array<ArrayBuffer>): ZipSource => ({
      name,
      open: async () => {
        opened.push(name);
        return chunked(bytes, 1024);
      },
    });
    const reader = zipStream(
      each([tracked('first.bin', noise(64 * 1024)), tracked('second.bin', noise(16))]),
    ).getReader();

    await reader.read();
    await reader.read();

    expect(opened).toEqual(['first.bin']);
    // oxlint-disable-next-line no-await-in-loop -- Drained in order.
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      // Drain.
    }
    expect(opened).toEqual(['first.bin', 'second.bin']);
  });

  it('should error with an entry read failure, and let go of the walk', async () => {
    const failure = new Error('read failed');
    const finished = vi.fn();
    async function* sources(): AsyncGenerator<ZipSource> {
      try {
        yield source('ok.txt', encoder.encode('fine'));
        yield {
          name: 'broken.txt',
          open: async () =>
            new ReadableStream({
              pull: (controller) => {
                controller.error(failure);
              },
            }),
        };
        yield source('never.txt', encoder.encode('unreached'));
      } finally {
        finished();
      }
    }

    await expect(bytesOf(zipStream(sources()))).rejects.toBe(failure);
    expect(finished).toHaveBeenCalledOnce();
  });

  it('should error with a walk failure', async () => {
    const failure = new Error('walk failed');
    // oxlint-disable-next-line require-yield -- A walk that fails before its first entry.
    async function* sources(): AsyncGenerator<ZipSource> {
      throw failure;
    }

    await expect(bytesOf(zipStream(sources()))).rejects.toBe(failure);
  });

  it('should cancel the open entry and return the walk when the reader cancels', async () => {
    const cancelled = vi.fn();
    const finished = vi.fn();
    async function* sources(): AsyncGenerator<ZipSource> {
      try {
        yield {
          name: 'endless.bin',
          open: async () =>
            new ReadableStream<Uint8Array<ArrayBuffer>>({
              pull: (controller) => {
                controller.enqueue(noise(1024));
              },
              cancel: cancelled,
            }),
        };
      } finally {
        finished();
      }
    }
    const reader = zipStream(sources()).getReader();
    await reader.read();
    await reader.read();

    await reader.cancel(new Error('stop'));

    expect(finished).toHaveBeenCalledOnce();
    /* The cancel reaches the entry's source back through its pipes, a task or two later. */
    await vi.waitFor(() => {
      expect(cancelled).toHaveBeenCalledOnce();
    });
  });

  it('should error with the signal reason once it aborts', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled by the user');
    const reader = zipStream(each([source('a.bin', noise(64 * 1024), 1024)]), controller.signal).getReader();
    await reader.read();

    controller.abort(reason);

    await expect(
      (async () => {
        // oxlint-disable-next-line no-await-in-loop -- Drained in order.
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          // Drain until the abort lands.
        }
      })(),
    ).rejects.toBe(reason);
  });

  it('should write ZIP64 from the local header on for an entry declared near 4 GiB', async () => {
    const content = encoder.encode('small, but declared huge');
    const archive = await bytesOf(zipStream(each([{ ...source('big.bin', content), size: 0xf0_00_00_00 }])));
    const local = view(archive);

    expect(local.getUint32(18, true)).toBe(0xff_ff_ff_ff);
    expect(local.getUint32(22, true)).toBe(0xff_ff_ff_ff);
    expect(local.getUint16(28, true)).toBe(20);
    expect(local.getUint16(30 + 'big.bin'.length, true)).toBe(0x00_01);

    const directoryOffset = view(archive.subarray(archive.byteLength - 22)).getUint32(16, true);
    const descriptor = view(archive.subarray(directoryOffset - 24, directoryOffset));
    expect(descriptor.getUint32(0, true)).toBe(0x08_07_4b_50);
    expect(descriptor.getBigUint64(16, true)).toBe(BigInt(content.byteLength));
    const files = await unzipped(archive);
    expect(decoder.decode(files['big.bin'])).toBe('small, but declared huge');
  });
});

describe('ZIP64 records', () => {
  const entry = (overrides: Partial<WrittenEntry>): WrittenEntry => ({
    name: encoder.encode('a.bin'),
    crc: 0x12_34_56_78,
    compressed: 10,
    size: 20,
    offset: 0,
    zip64: false,
    ...overrides,
  });

  it('should write a 32-bit descriptor until a size reaches 4 GiB, then a 64-bit one', () => {
    expect(dataDescriptor(entry({})).byteLength).toBe(16);

    const wide = view(dataDescriptor(entry({ compressed: 2 ** 32 + 5, size: 2 ** 33 })));
    expect(wide.byteLength).toBe(24);
    expect(wide.getBigUint64(8, true)).toBe(BigInt(2 ** 32 + 5));
    expect(wide.getBigUint64(16, true)).toBe(BigInt(2 ** 33));
  });

  it('should put only the overflowing fields in the central ZIP64 extra, in order', () => {
    const narrow = centralHeader(entry({}));
    expect(view(narrow).getUint16(30, true)).toBe(0);

    const header = centralHeader(entry({ size: 2 ** 32, offset: 2 ** 32 + 7 }));
    const fields = view(header);
    expect(fields.getUint32(20, true)).toBe(10);
    expect(fields.getUint32(24, true)).toBe(0xff_ff_ff_ff);
    expect(fields.getUint32(42, true)).toBe(0xff_ff_ff_ff);
    expect(fields.getUint16(30, true)).toBe(20);
    const extra = view(header.subarray(46 + 'a.bin'.length));
    expect(extra.getUint16(0, true)).toBe(0x00_01);
    expect(extra.getUint16(2, true)).toBe(16);
    expect(extra.getBigUint64(4, true)).toBe(BigInt(2 ** 32));
    expect(extra.getBigUint64(12, true)).toBe(BigInt(2 ** 32 + 7));
  });

  it('should add the ZIP64 end record and locator once the count or directory overflows', () => {
    expect(endRecords(3, 100, 50).byteLength).toBe(22);

    const records = endRecords(70_000, 2 ** 32 + 1, 64);
    expect(records.byteLength).toBe(98);
    const zip64End = view(records.subarray(0, 56));
    expect(zip64End.getUint32(0, true)).toBe(0x06_06_4b_50);
    expect(zip64End.getBigUint64(32, true)).toBe(70_000n);
    expect(zip64End.getBigUint64(48, true)).toBe(BigInt(2 ** 32 + 1));
    const locator = view(records.subarray(56, 76));
    expect(locator.getUint32(0, true)).toBe(0x07_06_4b_50);
    expect(locator.getBigUint64(8, true)).toBe(BigInt(2 ** 32 + 1 + 64));
    const end = view(records.subarray(76));
    expect(end.getUint16(10, true)).toBe(0xff_ff);
    expect(end.getUint32(16, true)).toBe(0xff_ff_ff_ff);
  });

  it('should mark a local header ZIP64 only when asked', () => {
    const name = encoder.encode('a.bin');

    expect(localHeader(name, false).byteLength).toBe(30 + name.byteLength);
    expect(localHeader(name, true).byteLength).toBe(30 + name.byteLength + 20);
  });
});
