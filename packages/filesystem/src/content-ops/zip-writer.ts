/**
 * A streaming ZIP writer (S14): one entry's bytes in flight at a time.
 *
 * Each entry is deflated as it is read (`CompressionStream('deflate-raw')`),
 * its CRC-32 taken from the same pass, and its sizes written after it in a data
 * descriptor, so the writer never holds an entry, let alone the archive. ZIP64
 * records are written where a size, an offset or the entry count needs them.
 * Names are UTF-8 (general-purpose bit 11); every entry carries the DOS epoch,
 * so the same tree always archives to the same bytes.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- ZIP headers are little-endian integer fields and CRC-32 is bit arithmetic. */

/** One file the writer archives: its name inside the archive and a reader of its bytes. @public */
export type ZipSource = Readonly<{
  /** `/`-separated name inside the archive, without a leading slash. */
  name: string;
  /** Opens the entry's bytes; called once, when the writer reaches the entry. */
  open: () => Promise<ReadableStream<Uint8Array<ArrayBuffer>>>;
  /**
   * The entry's declared size, when known. An entry declared near 4 GiB or past
   * it is written ZIP64 from its local header on, so a reader that streams the
   * archive knows its descriptor holds 8-byte sizes.
   */
  size?: number;
}>;

const crcTable = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/**
 * Continue a CRC-32 over more bytes.
 *
 * @param crc - The running value (start from 0).
 * @param bytes - The next bytes.
 * @returns The updated value.
 * @public
 */
export const crc32 = (crc: number, bytes: Uint8Array<ArrayBuffer>): number => {
  let value = ~crc >>> 0;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return ~value >>> 0;
};

const encoder = new TextEncoder();
/** The largest value a 32-bit ZIP field holds; at or past it, the ZIP64 field is read instead. */
const zip32Maximum = 0xff_ff_ff_ff;
/**
 * A declared size at or past this is written ZIP64 from the local header on:
 * deflate can grow incompressible bytes slightly, so the margin keeps an entry
 * declared just under 4 GiB from overflowing a 32-bit descriptor.
 */
const zip64Declared = 0xf0_00_00_00;
/** DOS date 1980-01-01, 00:00:00. */
const dosDate = (0 << 9) | (1 << 5) | 1;
const dosTime = 0;
/** Bit 3 (sizes follow in a data descriptor) and bit 11 (UTF-8 names). */
const generalPurposeFlags = 0x08_08;
const deflateMethod = 8;

/** A little-endian record builder. */
class Record {
  public readonly bytes: Uint8Array<ArrayBuffer>;
  readonly #view: DataView;
  #offset = 0;

  public constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.#view = new DataView(this.bytes.buffer);
  }

  public u16(value: number): this {
    this.#view.setUint16(this.#offset, value, true);
    this.#offset += 2;
    return this;
  }

  public u32(value: number): this {
    this.#view.setUint32(this.#offset, value >>> 0, true);
    this.#offset += 4;
    return this;
  }

  public u64(value: number): this {
    this.#view.setBigUint64(this.#offset, BigInt(value), true);
    this.#offset += 8;
    return this;
  }

  public raw(bytes: Uint8Array<ArrayBuffer>): this {
    this.bytes.set(bytes, this.#offset);
    this.#offset += bytes.byteLength;
    return this;
  }
}

/** What the central directory needs of one written entry. @internal */
export type WrittenEntry = Readonly<{
  name: Uint8Array<ArrayBuffer>;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  /** Whether the local header announced ZIP64, which fixes the descriptor's width. */
  zip64: boolean;
}>;

/** @internal */
export const localHeader = (name: Uint8Array<ArrayBuffer>, zip64: boolean): Uint8Array<ArrayBuffer> => {
  /* CRC and sizes follow the data in its descriptor (bit 3). A ZIP64 entry marks
   * its sizes 0xffffffff and carries a zeroed ZIP64 extra, the sign that its
   * descriptor's sizes are 8 bytes wide. */
  const extraLength = zip64 ? 20 : 0;
  const sizes = zip64 ? zip32Maximum : 0;
  const record = new Record(30 + name.byteLength + extraLength)
    .u32(0x04_03_4b_50)
    .u16(45)
    .u16(generalPurposeFlags)
    .u16(deflateMethod)
    .u16(dosTime)
    .u16(dosDate)
    .u32(0)
    .u32(sizes)
    .u32(sizes)
    .u16(name.byteLength)
    .u16(extraLength)
    .raw(name);
  if (zip64) {
    record.u16(0x00_01).u16(16).u64(0).u64(0);
  }
  return record.bytes;
};

/** @internal */
export const dataDescriptor = (entry: WrittenEntry): Uint8Array<ArrayBuffer> => {
  /* The local header fixed the descriptor's width (APPNOTE 4.3.9.2): 8-byte
     sizes only after a ZIP64 extra there. An entry declared under the threshold
     that read 4 GiB or more cannot be described, so it is refused. */
  if (!entry.zip64 && (entry.compressed >= zip32Maximum || entry.size >= zip32Maximum)) {
    throw new Error(
      `'${new TextDecoder().decode(entry.name)}' read 4 GiB or more after it was declared smaller; archive it again.`,
    );
  }
  const record = new Record(entry.zip64 ? 24 : 16).u32(0x08_07_4b_50).u32(entry.crc);
  return (entry.zip64 ? record.u64(entry.compressed).u64(entry.size) : record.u32(entry.compressed).u32(entry.size))
    .bytes;
};

/** @internal */
export const centralHeader = (entry: WrittenEntry): Uint8Array<ArrayBuffer> => {
  const wideFields = [entry.size, entry.compressed, entry.offset].filter((value) => value >= zip32Maximum);
  const extraLength = wideFields.length === 0 ? 0 : 4 + 8 * wideFields.length;
  const record = new Record(46 + entry.name.byteLength + extraLength)
    .u32(0x02_01_4b_50)
    .u16(45)
    .u16(45)
    .u16(generalPurposeFlags)
    .u16(deflateMethod)
    .u16(dosTime)
    .u16(dosDate)
    .u32(entry.crc)
    .u32(Math.min(entry.compressed, zip32Maximum))
    .u32(Math.min(entry.size, zip32Maximum))
    .u16(entry.name.byteLength)
    .u16(extraLength)
    .u16(0)
    .u16(0)
    .u16(0)
    .u32(0)
    .u32(Math.min(entry.offset, zip32Maximum))
    .raw(entry.name);
  if (extraLength > 0) {
    /* The ZIP64 extra holds only the fields that overflowed, in this order. */
    record.u16(0x00_01).u16(extraLength - 4);
    for (const value of wideFields) {
      record.u64(value);
    }
  }
  return record.bytes;
};

/** @internal */
export const endRecords = (count: number, directoryOffset: number, directorySize: number): Uint8Array<ArrayBuffer> => {
  const wide = count >= 0xff_ff || directoryOffset >= zip32Maximum || directorySize >= zip32Maximum;
  const end = new Record(22)
    .u32(0x06_05_4b_50)
    .u16(0)
    .u16(0)
    .u16(Math.min(count, 0xff_ff))
    .u16(Math.min(count, 0xff_ff))
    .u32(Math.min(directorySize, zip32Maximum))
    .u32(Math.min(directoryOffset, zip32Maximum))
    .u16(0).bytes;
  if (!wide) {
    return end;
  }
  const zip64EndOffset = directoryOffset + directorySize;
  const zip64End = new Record(56)
    .u32(0x06_06_4b_50)
    .u64(44)
    .u16(45)
    .u16(45)
    .u32(0)
    .u32(0)
    .u64(count)
    .u64(count)
    .u64(directorySize)
    .u64(directoryOffset).bytes;
  const locator = new Record(20).u32(0x07_06_4b_50).u32(0).u64(zip64EndOffset).u32(1).bytes;
  return new Record(56 + 20 + 22).raw(zip64End).raw(locator).raw(end).bytes;
};

/**
 * Stream a ZIP archive of `sources`, in their order.
 *
 * The archive is pulled: an entry is opened only once the reader has taken
 * everything before it, so what is in memory at any time is one entry's
 * chunks in flight through the deflater, never a whole entry.
 *
 * @param sources - The entries, as an iterable the writer drains once.
 * @param signal - Cancels the archive; the stream errors with its reason.
 * @returns The archive's bytes.
 * @public
 */
export const zipStream = (
  sources: AsyncIterable<ZipSource>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const iterator = sources[Symbol.asyncIterator]();
  const written: WrittenEntry[] = [];
  let offset = 0;
  let current:
    | {
        reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
        name: Uint8Array<ArrayBuffer>;
        start: number;
        tally: { crc: number; size: number };
        compressed: number;
        zip64: boolean;
      }
    | undefined;
  let finished = false;

  const open = async (source: ZipSource): Promise<Uint8Array<ArrayBuffer>> => {
    const name = encoder.encode(source.name);
    /* A name's length is a 16-bit field. */
    if (name.byteLength > 0xff_ff) {
      throw new Error(
        `An archive entry name is ${String(name.byteLength)} UTF-8 bytes; a ZIP name holds at most 65535.`,
      );
    }
    const zip64 = (source.size ?? 0) >= zip64Declared;
    const header = localHeader(name, zip64);
    const tally = { crc: 0, size: 0 };
    const opened = await source.open();
    const counted = opened.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        transform: (chunk, controller) => {
          tally.crc = crc32(tally.crc, chunk);
          tally.size += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );
    const deflated = counted.pipeThrough(
      new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >,
    );
    current = { reader: deflated.getReader(), name, start: offset, tally, compressed: 0, zip64 };
    offset += header.byteLength;
    return header;
  };

  /* A failed entry or walk lets go of both, so neither is left suspended. */
  const release = async (reason: unknown): Promise<void> => {
    const reader = current?.reader;
    current = undefined;
    await reader?.cancel(reason).catch(() => undefined);
    await iterator.return?.();
  };

  const step = async (controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>): Promise<void> => {
    signal?.throwIfAborted();
    if (finished) {
      controller.close();
      return;
    }
    if (current !== undefined) {
      const { done, value } = await current.reader.read();
      if (!done) {
        current.compressed += value.byteLength;
        offset += value.byteLength;
        controller.enqueue(value);
        return;
      }
      const entry: WrittenEntry = {
        name: current.name,
        crc: current.tally.crc,
        compressed: current.compressed,
        size: current.tally.size,
        offset: current.start,
        zip64: current.zip64,
      };
      current = undefined;
      written.push(entry);
      const descriptor = dataDescriptor(entry);
      offset += descriptor.byteLength;
      controller.enqueue(descriptor);
      return;
    }
    const next = await iterator.next();
    if (!next.done) {
      controller.enqueue(await open(next.value));
      return;
    }
    const directoryOffset = offset;
    const headers = written.map((entry) => centralHeader(entry));
    const directorySize = headers.reduce((total, header) => total + header.byteLength, 0);
    for (const header of headers) {
      controller.enqueue(header);
    }
    controller.enqueue(endRecords(written.length, directoryOffset, directorySize));
    finished = true;
    controller.close();
  };

  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull: async (controller) => {
        try {
          await step(controller);
        } catch (error) {
          await release(error);
          throw error;
        }
      },
      cancel: release,
    },
    /* One chunk ahead: the reader's own pull paces the walk and the reads. */
    { highWaterMark: 1 },
  );
};
