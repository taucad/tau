/**
 * Spike S8 (native-dependency-resolution charter, EQ8): a dependency-free `readWheel` prototype.
 *
 * Spike code only, not the W1 `@taucad/archive-core` reader. It parses a wheel's bytes as data
 * (never executes them): EOCD and ZIP64 EOCD, central directory with ZIP64 extras, stored and
 * deflated members with CRC checks, directory entries, path safety, RECORD per RFC 4180 with
 * base64url-unpadded hashes, RECORD's own unhashed row, tolerated RECORD.jws / RECORD.p7s, and a
 * typed refusal for `<name>.data/`.
 */

/* oxlint-disable no-bitwise -- zip records are bit fields. */

import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';

/** A typed reader failure: `code` is stable, `detail` names the feature or path. */
export class WheelError extends Error {
  public readonly code: string;
  public readonly detail: Readonly<Record<string, unknown>>;

  public constructor(code: string, detail: Readonly<Record<string, unknown>>) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.code = code;
    this.detail = detail;
  }
}

/** The (ZIP64) end-of-central-directory facts. */
export type EndOfCentralDirectory = { entries: number; size: number; start: number; zip64: boolean };

/** One central-directory record. */
export type CentralEntry = {
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  madeBy: number;
  mode: number;
  localOffset: number;
  name: string;
  zip64Extra: boolean;
};

type Member = CentralEntry & { directory: boolean; data?: Uint8Array<ArrayBuffer> };

/** A verified wheel. */
export type Wheel = {
  distributionInfo: string;
  files: Array<{ path: string; data: Uint8Array<ArrayBuffer>; mode: number }>;
  directories: number;
  record: { rows: number; unhashed: string[] };
  zip64: boolean;
  methods: Record<string, number>;
};

const viewOf = (bytes: Uint8Array<ArrayBuffer>): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const u32 = (view: DataView, offset: number): number => view.getUint32(offset, true);
const u64 = (view: DataView, offset: number): number => Number(view.getBigUint64(offset, true));

/**
 * Finds the (ZIP64) end of central directory in `bytes`, which may be a tail slice starting at `base`.
 *
 * @param bytes - The whole archive or its tail.
 * @param base - Absolute offset of `bytes[0]`.
 * @returns The directory location and entry count.
 */
export const findEndOfCentralDirectory = (bytes: Uint8Array<ArrayBuffer>, base = 0): EndOfCentralDirectory => {
  const view = viewOf(bytes);
  const floor = Math.max(0, bytes.byteLength - 22 - 0xff_ff);
  for (let offset = bytes.byteLength - 22; offset >= floor; offset -= 1) {
    if (u32(view, offset) !== 0x06_05_4b_50) {
      continue;
    }
    if (offset >= 20 && u32(view, offset - 20) === 0x07_06_4b_50) {
      const recordAt = u64(view, offset - 20 + 8) - base;
      if (recordAt < 0 || u32(view, recordAt) !== 0x06_06_4b_50) {
        throw new WheelError('ZIP_CORRUPT', { reason: 'zip64 end of central directory not found' });
      }
      return {
        entries: u64(view, recordAt + 32),
        size: u64(view, recordAt + 40),
        start: u64(view, recordAt + 48),
        zip64: true,
      };
    }
    return {
      entries: u16(view, offset + 10),
      size: u32(view, offset + 12),
      start: u32(view, offset + 16),
      zip64: false,
    };
  }
  throw new WheelError('ZIP_CORRUPT', { reason: 'end of central directory not found' });
};

/**
 * Parses central-directory records from `bytes` (absolute offset `base`).
 *
 * @param bytes - Bytes containing the whole central directory.
 * @param end - The end-of-central-directory facts.
 * @param base - Absolute offset of `bytes[0]`.
 * @returns One record per entry.
 */
export const parseCentralDirectory = (
  bytes: Uint8Array<ArrayBuffer>,
  end: EndOfCentralDirectory,
  base = 0,
): CentralEntry[] => {
  const view = viewOf(bytes);
  const entries: CentralEntry[] = [];
  let offset = end.start - base;
  for (let index = 0; index < end.entries; index += 1) {
    if (u32(view, offset) !== 0x02_01_4b_50) {
      throw new WheelError('ZIP_CORRUPT', { reason: 'bad central directory signature', index });
    }
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const entry: CentralEntry = {
      flags: u16(view, offset + 8),
      method: u16(view, offset + 10),
      crc: u32(view, offset + 16),
      compressedSize: u32(view, offset + 20),
      size: u32(view, offset + 24),
      madeBy: u16(view, offset + 4) >> 8,
      mode: u32(view, offset + 38) >>> 16,
      localOffset: u32(view, offset + 42),
      name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      zip64Extra: false,
    };
    // ZIP64 extended information: present fields follow the order size, compressed size, offset.
    let extra = offset + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      if (u16(view, extra) === 0x00_01) {
        entry.zip64Extra = true;
        let field = extra + 4;
        for (const key of ['size', 'compressedSize', 'localOffset'] as const) {
          if (entry[key] === 0xff_ff_ff_ff) {
            entry[key] = u64(view, field);
            field += 8;
          }
        }
      }
      extra += 4 + u16(view, extra + 2);
    }
    entries.push(entry);
    offset = extraEnd + commentLength;
  }
  return entries;
};

const safePath = (name: string): boolean =>
  name.length > 0 &&
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !/^[A-Za-z]:/u.test(name) &&
  !name.includes('\0') &&
  name
    .split('/')
    .every(
      (segment, index, all) => segment !== '..' && segment !== '.' && (segment !== '' || index === all.length - 1),
    );

/** Whether a central record describes a POSIX symlink. */
export const isSymlink = (entry: CentralEntry): boolean => entry.madeBy === 3 && (entry.mode & 0xf0_00) === 0xa0_00;

/**
 * Reads every member of a zip, checking path safety, methods and CRCs.
 *
 * @param bytes - The archive.
 * @returns The end record and the members with their data.
 */
export const readZip = (bytes: Uint8Array<ArrayBuffer>): { end: EndOfCentralDirectory; members: Member[] } => {
  const end = findEndOfCentralDirectory(bytes);
  const view = viewOf(bytes);
  const seen = new Map<string, string>();
  const members: Member[] = [];
  for (const entry of parseCentralDirectory(bytes, end)) {
    if (!safePath(entry.name)) {
      throw new WheelError('WHEEL_UNSAFE_PATH', { path: entry.name });
    }
    const folded = entry.name.toLowerCase();
    const other = seen.get(folded);
    if (other !== undefined) {
      throw new WheelError('WHEEL_DUPLICATE_PATH', { path: entry.name, other });
    }
    seen.set(folded, entry.name);
    if ((entry.flags & 0x1) !== 0) {
      throw new WheelError('WHEEL_UNSUPPORTED_FEATURE', { feature: 'encryption', path: entry.name });
    }
    if (isSymlink(entry)) {
      throw new WheelError('WHEEL_UNSUPPORTED_FEATURE', { feature: 'symlink', path: entry.name });
    }
    if (entry.name.endsWith('/')) {
      members.push({ ...entry, directory: true });
      continue;
    }
    if (u32(view, entry.localOffset) !== 0x04_03_4b_50) {
      throw new WheelError('ZIP_CORRUPT', { reason: 'bad local header', path: entry.name });
    }
    const dataStart = entry.localOffset + 30 + u16(view, entry.localOffset + 26) + u16(view, entry.localOffset + 28);
    const raw = bytes.slice(dataStart, dataStart + entry.compressedSize);
    let data: Uint8Array<ArrayBuffer>;
    if (entry.method === 0) {
      data = raw;
    } else if (entry.method === 8) {
      data = new Uint8Array(inflateRawSync(raw));
    } else {
      throw new WheelError('WHEEL_UNSUPPORTED_FEATURE', {
        feature: `compression-method-${String(entry.method)}`,
        path: entry.name,
      });
    }
    if (data.byteLength !== entry.size || crc32(data) !== entry.crc) {
      throw new WheelError('ZIP_CORRUPT', { reason: 'size or crc mismatch', path: entry.name });
    }
    members.push({ ...entry, directory: false, data });
  }
  return { end, members };
};

/**
 * Parses CSV per RFC 4180 (quoted fields, doubled quotes, CRLF or LF).
 *
 * @param text - The CSV text.
 * @returns Rows of fields, blank lines dropped.
 */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ''));
};

const signatureFile = /\/RECORD\.(?:jws|p7s)$/u;

/**
 * Reads and verifies a wheel; throws a typed `WheelError` otherwise.
 *
 * @param bytes - The wheel's bytes.
 * @returns The verified wheel.
 */
export const readWheel = (bytes: Uint8Array<ArrayBuffer>): Wheel => {
  const { end, members } = readZip(bytes);
  const files = members.filter((member) => !member.directory);
  const distributionInfos = [
    ...new Set(files.map((file) => file.name.split('/')[0] ?? '').filter((top) => top.endsWith('.dist-info'))),
  ];
  const [distributionInfo] = distributionInfos;
  if (distributionInfos.length !== 1 || distributionInfo === undefined) {
    throw new WheelError('WHEEL_INVALID', {
      reason: 'expected exactly one .dist-info directory',
      found: distributionInfos,
    });
  }
  const dataEntries = members
    .filter((member) => (member.name.split('/')[0] ?? '').endsWith('.data'))
    .map((member) => member.name);
  if (dataEntries.length > 0) {
    throw new WheelError('WHEEL_UNSUPPORTED_FEATURE', {
      feature: 'data-directory',
      entries: dataEntries.length,
      first: dataEntries.slice(0, 5),
    });
  }
  const recordPath = `${distributionInfo}/RECORD`;
  const recordMember = files.find((file) => file.name === recordPath);
  const wheelMember = files.find((file) => file.name === `${distributionInfo}/WHEEL`);
  if (!recordMember?.data || !wheelMember) {
    throw new WheelError('WHEEL_INVALID', { reason: 'missing RECORD or WHEEL', distributionInfo });
  }
  const rows = parseCsv(new TextDecoder().decode(recordMember.data));
  const byPath = new Map<string, { hash: string; size: string }>();
  const unhashed: string[] = [];
  for (const cells of rows) {
    const [path, hash = '', size = ''] = cells;
    if (path === undefined || cells.length > 3) {
      throw new WheelError('RECORD_INVALID', { row: cells });
    }
    if (byPath.has(path)) {
      throw new WheelError('RECORD_INVALID', { reason: 'duplicate row', path });
    }
    byPath.set(path, { hash, size });
    if (hash === '') {
      unhashed.push(path);
    }
  }
  for (const file of files) {
    const data = file.data ?? new Uint8Array();
    const row = byPath.get(file.name);
    if (file.name === recordPath || signatureFile.test(file.name)) {
      if (row !== undefined && row.hash !== '') {
        throw new WheelError('RECORD_INVALID', {
          reason: 'RECORD or its signature must not be hashed',
          path: file.name,
        });
      }
      continue;
    }
    if (row === undefined || row.hash === '') {
      throw new WheelError('RECORD_MISSING_ROW', { path: file.name });
    }
    const [algorithm = '', expected = ''] = row.hash.split('=', 2);
    if (!['sha256', 'sha384', 'sha512'].includes(algorithm) || expected === '' || /[+/=]/u.test(expected)) {
      throw new WheelError('RECORD_INVALID', {
        reason: 'unsupported hash or not base64url without padding',
        path: file.name,
        hash: row.hash,
      });
    }
    const actual = createHash(algorithm).update(data).digest('base64url');
    if (actual !== expected) {
      throw new WheelError('RECORD_HASH_MISMATCH', { path: file.name, expected, actual });
    }
    if (row.size !== '' && Number(row.size) !== data.byteLength) {
      throw new WheelError('RECORD_SIZE_MISMATCH', { path: file.name, expected: row.size, actual: data.byteLength });
    }
  }
  const present = new Set(files.map((file) => file.name));
  for (const path of byPath.keys()) {
    if (!present.has(path)) {
      throw new WheelError('RECORD_EXTRA_ROW', { path });
    }
  }
  const methods: Record<string, number> = {};
  for (const file of files) {
    const key = String(file.method);
    methods[key] = (methods[key] ?? 0) + 1;
  }
  return {
    distributionInfo,
    files: files.map((file) => ({
      path: file.name,
      data: file.data ?? new Uint8Array(),
      mode: file.madeBy === 3 ? file.mode & 0o777 : 0o644,
    })),
    directories: members.length - files.length,
    record: { rows: rows.length, unhashed },
    zip64: end.zip64 || members.some((member) => member.zip64Extra),
    methods,
  };
};
