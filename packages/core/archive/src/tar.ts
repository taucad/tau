import { assertEntryCount, entrySegments, resolveLinkTarget } from '#archive-entry.js';
import type { ArchiveContents, ArchiveEntry, ReadArchiveOptions } from '#archive-entry.js';
import { ArchiveError } from '#archive-error.js';

const blockSize = 512;
const decoder = new TextDecoder();

const malformed = (message: string): ArchiveError =>
  new ArchiveError('EXTRACTION_REFUSED', message, { reason: 'malformed' });

const field = (header: Uint8Array<ArrayBuffer>, start: number, length: number): string => {
  const raw = header.subarray(start, start + length);
  const end = raw.indexOf(0);
  return decoder.decode(end === -1 ? raw : raw.subarray(0, end));
};

const octal = (header: Uint8Array<ArrayBuffer>, start: number, length: number): number => {
  if ((header[start] ?? 0) >= 0x80) {
    throw malformed('Tar entry uses a base-256 numeric field, which package tarballs never need.');
  }
  const value = field(header, start, length).trim();
  return value.length === 0 ? 0 : Number.parseInt(value, 8);
};

const checksumMatches = (header: Uint8Array<ArrayBuffer>): boolean => {
  let sum = 0;
  for (const [index, byte] of header.entries()) {
    // The checksum field itself counts as eight spaces.
    sum += index >= 148 && index < 156 ? 0x20 : byte;
  }
  return sum === octal(header, 148, 8);
};

type PaxRecords = { path?: string; linkpath?: string };

// Read the `path` and `linkpath` records of a pax extended header (`<length> <key>=<value>\n` records).
const paxRecords = (data: Uint8Array<ArrayBuffer>): PaxRecords => {
  const records: PaxRecords = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    const length = Number.parseInt(decoder.decode(data.subarray(offset, space)), 10);
    if (space === -1 || !Number.isInteger(length) || length <= 0) {
      throw malformed('Tar pax header is malformed.');
    }
    const record = decoder.decode(data.subarray(space + 1, offset + length - 1));
    const separator = record.indexOf('=');
    const key = record.slice(0, separator);
    if (key === 'path' || key === 'linkpath') {
      records[key] = record.slice(separator + 1);
    }
    offset += length;
  }
  return records;
};

// POSIX ustar splits long names into `prefix` + `name`; GNU tar uses that region for other fields.
const headerName = (header: Uint8Array<ArrayBuffer>): string => {
  const prefix = field(header, 257, 6) === 'ustar' ? field(header, 345, 155) : '';
  const name = field(header, 0, 100);
  return prefix.length > 0 ? `${prefix}/${name}` : name;
};

const regularTypes = new Set(['0', '\0', '7']);

/**
 * Read an uncompressed ustar/pax tarball (GNU long names included). Directories are implied by file paths.
 *
 * With `links: 'contained'` (the default) a symlink whose target resolves inside the extraction root is returned
 * with `symlinkTarget`; an escaping link, a hardlink, a device or a FIFO refuses the whole archive. With
 * `links: 'skip'` only regular files are returned and every other entry is listed in `skipped`. Modes are returned
 * as recorded; writing applies them.
 * @param bytes - Uncompressed tar bytes, for example from `gunzip`.
 * @param options - Caps, `stripComponents` and the link policy.
 * @returns Root-relative entries plus the skipped entry names.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` for an empty, absolute, backslashed or `..` path, an escaping link, a
 * special file, an exceeded cap or a malformed archive.
 * @public
 */
export const readTarEntries = (bytes: Uint8Array<ArrayBuffer>, options: ReadArchiveOptions): ArchiveContents => {
  const { maximumEntries, maximumUnpackedBytes, stripComponents = 0, links = 'contained' } = options;
  const entries: ArchiveEntry[] = [];
  const skipped: string[] = [];
  let unpackedBytes = 0;
  let longPath: string | undefined;
  let longLink: string | undefined;
  let offset = 0;
  while (offset + blockSize <= bytes.length) {
    const header = bytes.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    if (!checksumMatches(header)) {
      throw malformed(`Tar header at byte ${offset} has an invalid checksum.`);
    }
    assertEntryCount(entries.length + skipped.length + 1, maximumEntries, 'Tarball');
    const size = octal(header, 124, 12);
    const dataStart = offset + blockSize;
    if (dataStart + size > bytes.length) {
      throw malformed('Tarball is truncated.');
    }
    const data = bytes.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / blockSize) * blockSize;
    const type = String.fromCodePoint(header[156] ?? 0);
    if (type === 'x') {
      const records = paxRecords(data);
      longPath = records.path ?? longPath;
      longLink = records.linkpath ?? longLink;
      continue;
    }
    if (type === 'L') {
      longPath = field(data, 0, data.length);
      continue;
    }
    if (type === 'K') {
      longLink = field(data, 0, data.length);
      continue;
    }
    // Global pax headers carry nothing to extract.
    if (type === 'g') {
      continue;
    }
    const name = longPath ?? headerName(header);
    const linkName = longLink ?? field(header, 157, 100);
    longPath = undefined;
    longLink = undefined;
    if (type === '5') {
      continue;
    }
    const segments = entrySegments(name).slice(stripComponents);
    const path = segments.length === 0 ? undefined : segments.join('/');
    if (path === undefined) {
      skipped.push(name);
      continue;
    }
    if (regularTypes.has(type)) {
      unpackedBytes += size;
      if (unpackedBytes > maximumUnpackedBytes) {
        throw new ArchiveError('EXTRACTION_REFUSED', `Tarball unpacks to more than ${maximumUnpackedBytes} bytes.`, {
          reason: 'limit',
        });
      }
      entries.push({ path, bytes: new Uint8Array(data), mode: octal(header, 100, 8) });
      continue;
    }
    if (links === 'skip') {
      skipped.push(path);
      continue;
    }
    if (type !== '2') {
      throw new ArchiveError('EXTRACTION_REFUSED', `Tar entry '${name}' is a hardlink or special file.`, {
        reason: 'special-entry',
        path: name,
      });
    }
    if (resolveLinkTarget(path, linkName) === undefined) {
      throw new ArchiveError(
        'EXTRACTION_REFUSED',
        `Tar symlink '${name}' -> '${linkName}' escapes the extraction root.`,
        {
          reason: 'escaping-link',
          path: name,
        },
      );
    }
    entries.push({ path, bytes: new Uint8Array(0), mode: octal(header, 100, 8), symlinkTarget: linkName });
  }
  return { entries, skipped };
};
