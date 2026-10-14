/* oxlint-disable no-bitwise -- zip records and CRC-32 are bit fields. */
import { assertEntryCount, entrySegments } from '#archive-entry.js';
import type { ArchiveContents, ArchiveEntry, ReadArchiveOptions } from '#archive-entry.js';
import { ArchiveError } from '#archive-error.js';
import { decompress, mapConcurrent } from '#bounded-stream.js';

/** One central-directory record, before its data is read. @internal */
export type ZipMember = {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
  /** POSIX mode from the external attributes when the creator was Unix. */
  readonly mode: number | undefined;
  readonly symlink: boolean;
  readonly directory: boolean;
};

const decoder = new TextDecoder();
const endOfCentralDirectorySignature = 0x06_05_4b_50;
const zip64LocatorSignature = 0x07_06_4b_50;
const zip64EndSignature = 0x06_06_4b_50;
const centralSignature = 0x02_01_4b_50;
const localSignature = 0x04_03_4b_50;
const unixCreator = 3;
const typeMask = 0o17_0000;
const symlinkType = 0o12_0000;

const malformed = (message: string, path?: string, cause?: unknown): ArchiveError =>
  new ArchiveError('EXTRACTION_REFUSED', message, { reason: 'malformed', path, cause });

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

/**
 * CRC-32 (IEEE 802.3), as zip records it.
 * @internal
 * @param bytes - Input bytes.
 * @returns The unsigned checksum.
 */
export const crc32 = (bytes: Uint8Array<ArrayBuffer>): number => {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

type EndOfCentralDirectory = { readonly entries: number; readonly start: number };

const view = (bytes: Uint8Array<ArrayBuffer>): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const findEnd = (bytes: Uint8Array<ArrayBuffer>, data: DataView): EndOfCentralDirectory => {
  const floor = Math.max(0, bytes.byteLength - 22 - 0xff_ff);
  for (let offset = bytes.byteLength - 22; offset >= floor; offset -= 1) {
    if (data.getUint32(offset, true) !== endOfCentralDirectorySignature) {
      continue;
    }
    if (offset >= 20 && data.getUint32(offset - 20, true) === zip64LocatorSignature) {
      const record = Number(data.getBigUint64(offset - 12, true));
      if (record + 56 > bytes.byteLength || data.getUint32(record, true) !== zip64EndSignature) {
        throw malformed('Zip64 end of central directory is missing.');
      }
      return {
        entries: Number(data.getBigUint64(record + 32, true)),
        start: Number(data.getBigUint64(record + 48, true)),
      };
    }
    return { entries: data.getUint16(offset + 10, true), start: data.getUint32(offset + 16, true) };
  }
  throw malformed('Zip end of central directory not found.');
};

/**
 * Parse the central directory: every member's name, method, sizes, CRC, mode and kind, with ZIP64 extras applied.
 * Data is not read and no path is validated here.
 * @internal
 * @param bytes - The whole archive.
 * @param maximumEntries - Caller's entry cap, checked before the directory is walked.
 * @returns One record per member, in directory order.
 */
export const readZipDirectory = (bytes: Uint8Array<ArrayBuffer>, maximumEntries: number): ZipMember[] => {
  const data = view(bytes);
  const end = findEnd(bytes, data);
  assertEntryCount(end.entries, maximumEntries, 'Zip archive');
  const members: ZipMember[] = [];
  let offset = end.start;
  for (let index = 0; index < end.entries; index += 1) {
    if (offset + 46 > bytes.byteLength || data.getUint32(offset, true) !== centralSignature) {
      throw malformed(`Zip central directory record ${index} is corrupt.`);
    }
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const creator = data.getUint16(offset + 4, true) >> 8;
    const external = data.getUint32(offset + 38, true) >>> 16;
    const sizes = {
      size: data.getUint32(offset + 24, true),
      compressedSize: data.getUint32(offset + 20, true),
      localOffset: data.getUint32(offset + 42, true),
    };
    // ZIP64 extended information: the saturated fields follow in the order size, compressed size, offset.
    let extra = offset + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      if (data.getUint16(extra, true) === 0x00_01) {
        let fieldOffset = extra + 4;
        for (const key of ['size', 'compressedSize', 'localOffset'] as const) {
          if (sizes[key] === 0xff_ff_ff_ff) {
            sizes[key] = Number(data.getBigUint64(fieldOffset, true));
            fieldOffset += 8;
          }
        }
      }
      extra += 4 + data.getUint16(extra + 2, true);
    }
    members.push({
      name,
      flags: data.getUint16(offset + 8, true),
      method: data.getUint16(offset + 10, true),
      crc: data.getUint32(offset + 16, true),
      ...sizes,
      mode: creator === unixCreator && external !== 0 ? external & 0o7777 : undefined,
      symlink: creator === unixCreator && (external & typeMask) === symlinkType,
      directory: name.endsWith('/'),
    });
    offset = extraEnd + commentLength;
  }
  return members;
};

/** Members inflated at once; the platform inflates off the main thread, so a few in flight hide its latency. @internal */
export const inflateConcurrency = 8;

/**
 * Read and check one member's bytes: stored or deflated, exact declared size and, unless the caller verifies the
 * bytes by a stronger digest, a matching CRC-32.
 * @internal
 * @param bytes - The whole archive.
 * @param member - The member's central record.
 * @param checksum - Whether to check the CRC-32; default `true`.
 * @returns The member's uncompressed bytes.
 */
export const readZipMember = async (
  bytes: Uint8Array<ArrayBuffer>,
  member: ZipMember,
  checksum = true,
): Promise<Uint8Array<ArrayBuffer>> => {
  const data = view(bytes);
  const local = member.localOffset;
  if (local + 30 > bytes.byteLength || data.getUint32(local, true) !== localSignature) {
    throw malformed(`Zip member '${member.name}' has no local header.`, member.name);
  }
  const start = local + 30 + data.getUint16(local + 26, true) + data.getUint16(local + 28, true);
  if (start + member.compressedSize > bytes.byteLength) {
    throw malformed(`Zip member '${member.name}' is truncated.`, member.name);
  }
  const raw = bytes.subarray(start, start + member.compressedSize);
  const contents =
    member.method === 0
      ? new Uint8Array(raw)
      : await decompress(raw, 'deflate-raw', member.size).catch((error: unknown) => {
          throw malformed(`Zip member '${member.name}' does not inflate to its declared size.`, member.name, error);
        });
  if (contents.byteLength !== member.size || (checksum && crc32(contents) !== member.crc)) {
    throw malformed(`Zip member '${member.name}' does not match its recorded size and CRC-32.`, member.name);
  }
  return contents;
};

/**
 * Refuse a member this reader does not extract, before any data is read.
 * @internal
 * @param member - The member's central record.
 */
export const assertSupportedMember = (member: ZipMember): void => {
  if ((member.flags & 0x1) !== 0) {
    throw new ArchiveError('UNSUPPORTED_FEATURE', `Zip member '${member.name}' is encrypted.`, {
      reason: 'encryption',
      path: member.name,
    });
  }
  if (member.symlink) {
    throw new ArchiveError('UNSUPPORTED_FEATURE', `Zip member '${member.name}' is a symlink.`, {
      reason: 'zip-symlink',
      path: member.name,
    });
  }
  if (!member.directory && member.method !== 0 && member.method !== 8) {
    throw new ArchiveError(
      'UNSUPPORTED_FEATURE',
      `Zip member '${member.name}' uses compression method ${member.method}; only stored and deflate are read.`,
      { reason: 'compression-method', path: member.name },
    );
  }
};

/**
 * Refuse duplicate names and a declared total above the cap, before any member is inflated.
 * @internal
 * @param members - Central records.
 * @param maximumUnpackedBytes - Caller's cap.
 */
export const assertDirectoryWithinLimits = (members: readonly ZipMember[], maximumUnpackedBytes: number): void => {
  const names = new Set<string>();
  let total = 0;
  for (const member of members) {
    if (names.has(member.name)) {
      throw new ArchiveError('EXTRACTION_REFUSED', `Zip member '${member.name}' appears twice.`, {
        reason: 'duplicate-path',
        path: member.name,
      });
    }
    names.add(member.name);
    total += member.size;
  }
  if (total > maximumUnpackedBytes) {
    throw new ArchiveError('EXTRACTION_REFUSED', `Zip archive unpacks to more than ${maximumUnpackedBytes} bytes.`, {
      reason: 'limit',
    });
  }
};

/**
 * Read a zip archive: central directory (ZIP64 included), stored and deflated members through the platform
 * `DecompressionStream('deflate-raw')`, every member's size and CRC-32 checked. Directory entries are implied by
 * file paths. Encrypted members, symlinks and other compression methods are refused.
 * @param bytes - The archive.
 * @param options - Caps and `stripComponents`; zip archives carry no links to keep, so `links` has no effect.
 * @returns Root-relative entries, with POSIX modes when the archive was made on Unix.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` for an unsafe or duplicate path, an exceeded cap or a corrupt
 * member; `UNSUPPORTED_FEATURE` for encryption, a symlink or another compression method.
 * @public
 */
export const readZipEntries = async (
  bytes: Uint8Array<ArrayBuffer>,
  options: ReadArchiveOptions,
): Promise<ArchiveContents> => {
  const { stripComponents = 0 } = options;
  const members = readZipDirectory(bytes, options.maximumEntries);
  assertDirectoryWithinLimits(members, options.maximumUnpackedBytes);
  const skipped: string[] = [];
  const extracted: Array<{ readonly member: ZipMember; readonly path: string }> = [];
  for (const member of members) {
    const segments = entrySegments(member.name).slice(stripComponents);
    assertSupportedMember(member);
    if (member.directory) {
      continue;
    }
    if (segments.length === 0) {
      skipped.push(member.name);
      continue;
    }
    extracted.push({ member, path: segments.join('/') });
  }
  const entries = await mapConcurrent(
    extracted,
    inflateConcurrency,
    async ({ member, path }): Promise<ArchiveEntry> => ({
      path,
      bytes: await readZipMember(bytes, member),
      ...(member.mode === undefined ? {} : { mode: member.mode }),
    }),
  );
  return { entries, skipped };
};
