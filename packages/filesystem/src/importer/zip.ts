/* oxlint-disable no-bitwise -- zip records are bit fields. */
/**
 * Reading a zip by range: the central directory from the end of a `Blob`, and
 * each entry's data range from its local header (charter D12).
 *
 * Nothing here decodes: the directory gives every entry's name, method, sizes,
 * CRC and Unix mode, so the limits and path policies judge the whole archive
 * before a byte is inflated, and the decode reads only the one range it needs.
 * ZIP64 sizes and offsets are read; encryption and methods other than stored
 * and deflate are refused, and so is a directory that does not fit the file.
 *
 * @module
 */

import { ImportRefusedError } from '#importer/limits.js';
import type { FileMode } from '#types.js';

/**
 * Bytes at a range of something larger than memory should hold: a `Blob`
 * (a dropped zip, a spooled download) answers it by slicing.
 *
 * @public
 */
export type RangeSource = Readonly<{
  size: number;
  read: (start: number, end: number) => Promise<Uint8Array<ArrayBuffer>>;
}>;

/**
 * A `Blob` as a {@link RangeSource}.
 *
 * @param blob - The archive.
 * @returns Its ranges.
 * @public
 */
export const blobRangeSource = (blob: Blob): RangeSource => ({
  size: blob.size,
  read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
});

/**
 * One central-directory entry.
 *
 * @public
 */
export type ZipEntry = Readonly<{
  /** The name as stored, decoded as UTF-8. */
  name: string;
  method: 'stored' | 'deflate';
  compressedSize: number;
  size: number;
  crc32: number;
  localHeaderOffset: number;
  directory: boolean;
  /** A Unix symbolic link: an import never follows or writes one. */
  symlink: boolean;
  /** The Unix executable bit, as a Git mode, when the archive recorded one. */
  mode?: FileMode;
}>;

const endOfDirectorySignature = 0x06_05_4b_50;
const zip64LocatorSignature = 0x07_06_4b_50;
const zip64EndSignature = 0x06_06_4b_50;
const centralSignature = 0x02_01_4b_50;
const localSignature = 0x04_03_4b_50;
const endOfDirectoryBytes = 22;
const maximumCommentBytes = 0xff_ff;
const centralHeaderBytes = 46;
const localHeaderBytes = 30;
const zip64ExtraId = 0x00_01;
const unixHost = 3;
const fileTypeMask = 0o17_0000;
const symlinkType = 0o12_0000;
const directoryType = 0o04_0000;

const view = (bytes: Uint8Array<ArrayBuffer>): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const corrupt = (message: string): ImportRefusedError => new ImportRefusedError('corrupt', { message });

/* A 64-bit little-endian integer that must still be a safe JavaScript number. */
const uint64 = (data: DataView, at: number): number => {
  const value = data.getBigUint64(at, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw corrupt('The archive declares a size no import can hold.');
  }
  return Number(value);
};

type Directory = Readonly<{ entries: number; size: number; offset: number }>;

/* The end-of-central-directory record, and its ZIP64 twin when the archive needs one. */
const readDirectoryLocation = async (source: RangeSource): Promise<Directory> => {
  const tailStart = Math.max(0, source.size - endOfDirectoryBytes - maximumCommentBytes);
  const tail = await source.read(tailStart, source.size);
  const data = view(tail);
  let at = tail.byteLength - endOfDirectoryBytes;
  while (at >= 0 && data.getUint32(at, true) !== endOfDirectorySignature) {
    at -= 1;
  }
  if (at < 0) {
    throw corrupt('The file is not a zip archive.');
  }
  const disk = data.getUint16(at + 4, true);
  let entries = data.getUint16(at + 10, true);
  let size = data.getUint32(at + 12, true);
  let offset = data.getUint32(at + 16, true);
  if (disk !== 0) {
    throw new ImportRefusedError('unsupported', { message: 'Split zip archives are not imported.' });
  }
  if (entries === 0xff_ff || size === 0xff_ff_ff_ff || offset === 0xff_ff_ff_ff) {
    const locatorAt = at - 20;
    if (locatorAt < 0 || data.getUint32(locatorAt, true) !== zip64LocatorSignature) {
      throw corrupt('The archive is missing its ZIP64 directory.');
    }
    const recordOffset = uint64(data, locatorAt + 8);
    const record = view(await source.read(recordOffset, Math.min(source.size, recordOffset + 56)));
    if (record.byteLength < 56 || record.getUint32(0, true) !== zip64EndSignature) {
      throw corrupt('The archive is missing its ZIP64 directory.');
    }
    entries = uint64(record, 32);
    size = uint64(record, 40);
    offset = uint64(record, 48);
  }
  if (offset + size > source.size) {
    throw corrupt('The archive directory runs past the end of the file.');
  }
  return { entries, size, offset };
};

/* The ZIP64 extra field's replacements, in their fixed order, for the fields that overflowed. */
const zip64Values = (
  data: DataView,
  extra: Readonly<{ start: number; end: number }>,
  wanted: Readonly<{ uncompressed: boolean; compressed: boolean; offset: boolean }>,
): { size?: number; compressed?: number; offset?: number } => {
  let at = extra.start;
  const extraEnd = extra.end;
  while (at + 4 <= extraEnd) {
    const id = data.getUint16(at, true);
    const length = data.getUint16(at + 2, true);
    if (id === zip64ExtraId) {
      let field = at + 4;
      const result: { size?: number; compressed?: number; offset?: number } = {};
      if (wanted.uncompressed) {
        result.size = uint64(data, field);
        field += 8;
      }
      if (wanted.compressed) {
        result.compressed = uint64(data, field);
        field += 8;
      }
      if (wanted.offset) {
        result.offset = uint64(data, field);
      }
      return result;
    }
    at += 4 + length;
  }
  throw corrupt('The archive is missing a ZIP64 size.');
};

/**
 * Read an archive's central directory: every entry, before any is decoded.
 *
 * @param source - The archive's ranges.
 * @param options - `maximumEntries`, past which the directory is refused before it is read.
 * @returns The entries, in directory order.
 * @throws ImportRefusedError `corrupt`, `encrypted`, `unsupported` or `tooManyEntries`.
 * @public
 */
export const readZipDirectory = async (
  source: RangeSource,
  options: Readonly<{ maximumEntries?: number }> = {},
): Promise<ZipEntry[]> => {
  const directory = await readDirectoryLocation(source);
  if (options.maximumEntries !== undefined && directory.entries > options.maximumEntries) {
    throw new ImportRefusedError('tooManyEntries', {
      message: `The archive has more than ${String(options.maximumEntries)} entries.`,
    });
  }
  /* The smallest a header can be bounds how many the directory can hold, so a
   * count that lies cannot make the read run on. */
  if (directory.entries * centralHeaderBytes > directory.size) {
    throw corrupt('The archive directory is shorter than its entry count.');
  }
  const bytes = await source.read(directory.offset, directory.offset + directory.size);
  const data = view(bytes);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let index = 0; index < directory.entries; index += 1) {
    if (at + centralHeaderBytes > bytes.byteLength || data.getUint32(at, true) !== centralSignature) {
      throw corrupt('The archive directory is damaged.');
    }
    const madeBy = data.getUint16(at + 4, true);
    const flags = data.getUint16(at + 8, true);
    const methodCode = data.getUint16(at + 10, true);
    const crc32 = data.getUint32(at + 16, true);
    let compressedSize = data.getUint32(at + 20, true);
    let size = data.getUint32(at + 24, true);
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const externalAttributes = data.getUint32(at + 38, true);
    let localHeaderOffset = data.getUint32(at + 42, true);
    const nameStart = at + centralHeaderBytes;
    const extraStart = nameStart + nameLength;
    const next = extraStart + extraLength + commentLength;
    if (next > bytes.byteLength) {
      throw corrupt('The archive directory is damaged.');
    }
    const name = decoder.decode(bytes.subarray(nameStart, extraStart));
    if (size === 0xff_ff_ff_ff || compressedSize === 0xff_ff_ff_ff || localHeaderOffset === 0xff_ff_ff_ff) {
      const wide = zip64Values(
        data,
        { start: extraStart, end: extraStart + extraLength },
        {
          uncompressed: size === 0xff_ff_ff_ff,
          compressed: compressedSize === 0xff_ff_ff_ff,
          offset: localHeaderOffset === 0xff_ff_ff_ff,
        },
      );
      size = wide.size ?? size;
      compressedSize = wide.compressed ?? compressedSize;
      localHeaderOffset = wide.offset ?? localHeaderOffset;
    }
    const unixMode = madeBy >> 8 === unixHost ? externalAttributes >>> 16 : 0;
    const directoryEntry = name.endsWith('/') || name.endsWith('\\') || (unixMode & fileTypeMask) === directoryType;
    const symlink = (unixMode & fileTypeMask) === symlinkType;
    if (!directoryEntry && !symlink) {
      if ((flags & 0x1) !== 0) {
        throw new ImportRefusedError('encrypted', { path: name });
      }
      if (methodCode !== 0 && methodCode !== 8) {
        throw new ImportRefusedError('unsupported', { path: name });
      }
      if (localHeaderOffset + localHeaderBytes + compressedSize > source.size) {
        throw corrupt('An archive entry runs past the end of the file.');
      }
    }
    entries.push({
      name,
      method: methodCode === 8 ? 'deflate' : 'stored',
      compressedSize,
      size,
      crc32,
      localHeaderOffset,
      directory: directoryEntry,
      symlink,
      ...(unixMode === 0 || directoryEntry || symlink
        ? {}
        : { mode: (unixMode & 0o111) === 0 ? '100644' : ('100755' as FileMode) }),
    });
    at = next;
  }
  return entries;
};

/**
 * Where one entry's stored bytes begin, from its local header (whose name and
 * extra field may differ in length from the directory's).
 *
 * @param header - At least the first 30 bytes of the local header.
 * @param entry - The entry the directory listed.
 * @returns The byte offset, in the archive, of the entry's data.
 * @throws ImportRefusedError `corrupt` when the header is not one.
 * @public
 */
export const zipEntryDataOffset = (header: Uint8Array<ArrayBuffer>, entry: ZipEntry): number => {
  const data = view(header);
  if (header.byteLength < localHeaderBytes || data.getUint32(0, true) !== localSignature) {
    throw corrupt('An archive entry is damaged.');
  }
  return entry.localHeaderOffset + localHeaderBytes + data.getUint16(26, true) + data.getUint16(28, true);
};

/** Bytes of a local header before its variable fields. @public */
export const zipLocalHeaderBytes = localHeaderBytes;
