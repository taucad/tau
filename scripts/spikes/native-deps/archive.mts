/**
 * Purpose: Minimal tar and zip (wheel) readers for the S13 unpack prototype, over in-memory bytes.
 * Why: Spike S13 times a Node-only unpack of the registry-native closures before `@taucad/archive-core`
 *   exists (charter W1); nothing here executes archive content.
 * Environment: Node 24+; imported by the sibling spike scripts only.
 * Usage: import { readTarEntries, readZipEntries } from './archive.mts';
 * Exit codes: none (library module).
 */

import { inflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const inflateRawAsync = promisify(inflateRaw);

/**
 * View Node's pooled-or-owned output bytes as a plain `Uint8Array<ArrayBuffer>` without copying.
 *
 * @param bytes - Bytes returned by a `node:zlib` call (never backed by a SharedArrayBuffer).
 * @returns The same bytes.
 */
export const asArrayBufferView = (bytes: ArrayBufferView): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);

/** One tar member. `data` is a view into the decompressed archive. */
export type TarEntry = {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink' | 'hardlink' | 'other';
  readonly mode: number;
  readonly linkTarget: string;
  readonly data: Uint8Array<ArrayBuffer>;
};

const text = (bytes: Uint8Array<ArrayBuffer>, start: number, length: number): string => {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return Buffer.from(end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
};

const octal = (bytes: Uint8Array<ArrayBuffer>, start: number, length: number): number => {
  if (bytes[start]! >= 0x80) {
    // GNU base-256 encoding for large values.
    let value = 0;
    for (let index = start + 1; index < start + length; index += 1) {
      value = value * 256 + bytes[index]!;
    }
    return value;
  }
  const raw = text(bytes, start, length).trim();
  return raw === '' ? 0 : Number.parseInt(raw, 8);
};

const parsePax = (data: Uint8Array<ArrayBuffer>): Map<string, string> => {
  const records = new Map<string, string>();
  let offset = 0;
  const body = Buffer.from(data);
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    if (space === -1) {
      break;
    }
    const length = Number(body.subarray(offset, space).toString('utf8'));
    const record = body.subarray(space + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    records.set(record.slice(0, equals), record.slice(equals + 1));
    offset += length;
  }
  return records;
};

/**
 * List the members of an uncompressed tar archive (ustar, pax and GNU long names).
 *
 * @param bytes - The whole decompressed archive.
 * @returns Members in archive order.
 */
export const readTarEntries = (bytes: Uint8Array<ArrayBuffer>): TarEntry[] => {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pax = new Map<string, string>();
  let longName: string | undefined;
  let longLink: string | undefined;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const size = octal(header, 124, 12);
    const typeflag = String.fromCodePoint(header[156] === 0 ? 0x30 : header[156]!);
    const dataStart = offset + 512;
    const data = bytes.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (typeflag === 'x') {
      pax = parsePax(data);
      continue;
    }
    if (typeflag === 'g') {
      continue;
    }
    if (typeflag === 'L') {
      longName = text(data, 0, data.length);
      continue;
    }
    if (typeflag === 'K') {
      longLink = text(data, 0, data.length);
      continue;
    }
    const magic = text(header, 257, 6);
    const prefix = magic.startsWith('ustar') ? text(header, 345, 155) : '';
    const name = text(header, 0, 100);
    const path = pax.get('path') ?? longName ?? (prefix === '' ? name : `${prefix}/${name}`);
    const linkTarget = pax.get('linkpath') ?? longLink ?? text(header, 157, 100);
    const type =
      typeflag === '0' || typeflag === '7'
        ? 'file'
        : typeflag === '5'
          ? 'directory'
          : typeflag === '2'
            ? 'symlink'
            : typeflag === '1'
              ? 'hardlink'
              : 'other';
    entries.push({ path, type, mode: octal(header, 100, 8) % 0o1_0000, linkTarget, data });
    pax = new Map();
    longName = undefined;
    longLink = undefined;
  }
  return entries;
};

/** One zip member, not yet inflated. */
export type ZipEntry = {
  readonly path: string;
  readonly mode: number;
  readonly uncompressedSize: number;
  readonly inflate: () => Promise<Uint8Array<ArrayBuffer>>;
};

/**
 * List the members of a zip archive (wheels use stored and deflate only).
 *
 * @param bytes - The whole archive.
 * @returns Members in central-directory order; `inflate` decompresses one on the libuv pool.
 */
export const readZipEntries = (bytes: Uint8Array<ArrayBuffer>): ZipEntry[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06_05_4b_50) {
    end -= 1;
  }
  if (end < 0) {
    throw new Error('zip end of central directory not found');
  }
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02_01_4b_50) {
      throw new Error('bad zip central directory entry');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localOffset = view.getUint32(offset + 42, true);
    const path = Buffer.from(bytes.subarray(offset + 46, offset + 46 + nameLength)).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0 && method !== 8) {
      throw new Error(`unsupported zip method ${String(method)} for ${path}`);
    }
    entries.push({
      path,
      mode: Math.floor(externalAttributes / 65_536) % 0o1_0000,
      uncompressedSize,
      inflate: async () => (method === 0 ? compressed : asArrayBufferView(await inflateRawAsync(compressed))),
    });
  }
  return entries;
};
