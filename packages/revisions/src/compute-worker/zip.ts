/**
 * Zip decode for the compute worker: the central directory read, each entry
 * inflated with the platform's `deflate-raw` and checked against its CRC-32
 * and declared size. Bytes in, entries out; nothing here touches storage.
 *
 * Refused, with a `TypeError`: a zip64 archive, an encrypted entry, a method
 * other than stored or deflate, a path that is absolute, has a `..` segment,
 * a backslash or a NUL, an entry whose bytes do not match its CRC or size,
 * and an archive past any of its limits. Directory entries are skipped.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- zip records and CRC-32 are bit fields. */

/** Bounds of one decode. */
export type ZipLimits = Readonly<{
  /** Entries, directories excluded. */
  maxEntries: number;
  /** Bytes of one entry, inflated. */
  maxEntryBytes: number;
  /** Bytes of every entry, inflated. */
  maxTotalBytes: number;
}>;

/** One file of an archive. */
export type ZipEntry = Readonly<{ path: string; data: Uint8Array<ArrayBuffer> }>;

/** The defaults: the project limits (2,000 files, 100 MiB a file, 500 MiB in all). */
export const defaultZipLimits: ZipLimits = {
  maxEntries: 10_000,
  maxEntryBytes: 100 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
};

const endOfDirectory = 0x06_05_4b_50;
const directoryHeader = 0x02_01_4b_50;
const localHeader = 0x04_03_4b_50;

const crcTable = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 0 ? value >>> 1 : 0xed_b8_83_20 ^ (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/**
 * CRC-32 (IEEE), as zip records it.
 *
 * @param bytes - The bytes to check.
 * @returns The checksum, unsigned.
 */
export const crc32 = (bytes: Uint8Array<ArrayBuffer>): number => {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

const inflateRaw = async (compressed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const safePath = (name: string): boolean =>
  name !== '' &&
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !name.includes('\0') &&
  !/^[A-Za-z]:/u.test(name) &&
  name.split('/').every((segment) => segment !== '..');

const viewOf = (bytes: Uint8Array<ArrayBuffer>): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** One central directory record, as {@link unzip} reads it. */
type DirectoryRecord = Readonly<{
  path: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  local: number;
  /** Where the next record starts. */
  next: number;
}>;

/* The central directory record at `at`, or `undefined` when none starts there. */
const directoryRecordAt = (
  archive: Uint8Array<ArrayBuffer>,
  at: number,
  decoder: TextDecoder,
): DirectoryRecord | undefined => {
  const view = viewOf(archive);
  if (at + 46 > archive.byteLength || view.getUint32(at, true) !== directoryHeader) {
    return undefined;
  }
  const nameLength = view.getUint16(at + 28, true);
  return {
    path: decoder.decode(archive.subarray(at + 46, at + 46 + nameLength)),
    flags: view.getUint16(at + 8, true),
    method: view.getUint16(at + 10, true),
    crc: view.getUint32(at + 16, true),
    compressedSize: view.getUint32(at + 20, true),
    size: view.getUint32(at + 24, true),
    local: view.getUint32(at + 42, true),
    next: at + 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true),
  };
};

/* The stored bytes of the entry a record names, or `undefined` when its local header or bytes are missing. */
const storedBytesOf = (
  archive: Uint8Array<ArrayBuffer>,
  record: DirectoryRecord,
): Uint8Array<ArrayBuffer> | undefined => {
  const view = viewOf(archive);
  const { local, compressedSize } = record;
  if (local + 30 > archive.byteLength || view.getUint32(local, true) !== localHeader) {
    return undefined;
  }
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  return start + compressedSize > archive.byteLength ? undefined : archive.subarray(start, start + compressedSize);
};

/* Where the central directory ends, or -1. */
const endOfDirectoryIn = (archive: Uint8Array<ArrayBuffer>): number => {
  const view = viewOf(archive);
  for (let at = archive.byteLength - 22; at >= Math.max(0, archive.byteLength - 22 - 0xff_ff); at -= 1) {
    if (view.getUint32(at, true) === endOfDirectory) {
      return at;
    }
  }
  return -1;
};

/**
 * Every file of one zip archive.
 *
 * @param archive - The whole archive.
 * @param limits - Its bounds; {@link defaultZipLimits} by default.
 * @returns Its files, in directory order.
 * @throws TypeError when the archive is not one this reader accepts.
 */
export const unzip = async (
  archive: Uint8Array<ArrayBuffer>,
  limits: ZipLimits = defaultZipLimits,
): Promise<ZipEntry[]> => {
  const view = viewOf(archive);
  const fail = (why: string): never => {
    throw new TypeError(`The archive ${why}.`);
  };
  const end = endOfDirectoryIn(archive);
  if (end === -1) {
    fail('has no central directory');
  }
  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xff_ff || directoryOffset === 0xff_ff_ff_ff) {
    fail('is zip64, which is not read');
  }
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries: ZipEntry[] = [];
  let total = 0;
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    const record = directoryRecordAt(archive, at, decoder);
    if (record === undefined) {
      return fail('has a central directory that is cut short');
    }
    const { path, flags, method, crc, size } = record;
    at = record.next;
    if (path.endsWith('/')) {
      continue;
    }
    if (!safePath(path)) {
      fail(`names an unsafe path ${JSON.stringify(path)}`);
    }
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8)) {
      fail(`entry ${path} is encrypted or compressed with method ${String(method)}`);
    }
    total += size;
    if (entries.length >= limits.maxEntries || size > limits.maxEntryBytes || total > limits.maxTotalBytes) {
      fail('is past its limits');
    }
    const stored = storedBytesOf(archive, record) ?? fail(`entry ${path} has no local header or is cut short`);
    let data: Uint8Array<ArrayBuffer>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one entry inflated at a time, so the limits bound what is held.
      data = method === 0 ? new Uint8Array(stored) : await inflateRaw(stored);
    } catch (error) {
      throw new TypeError(`The archive entry ${path} does not inflate.`, { cause: error });
    }
    if (data.byteLength !== size || crc32(data) !== crc) {
      fail(`entry ${path} does not match its recorded size or CRC`);
    }
    entries.push({ path, data });
  }
  return entries;
};
