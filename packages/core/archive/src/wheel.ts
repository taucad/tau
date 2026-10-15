import { entrySegments } from '#archive-entry.js';
import type { ArchiveContents, ArchiveEntry } from '#archive-entry.js';
import { ArchiveError } from '#archive-error.js';
import type { ArchiveLimits } from '#bounded-stream.js';
import { mapConcurrent } from '#bounded-stream.js';
import {
  assertDirectoryWithinLimits,
  assertSupportedMember,
  inflateConcurrency,
  readZipDirectory,
  readZipMember,
} from '#zip.js';
import type { ZipMember } from '#zip.js';

/**
 * A wheel whose every member matched its `RECORD` row.
 * @public
 */
export type WheelContents = ArchiveContents & {
  /** Distribution name as the `.dist-info` directory spells it. */
  readonly distribution: string;
  readonly version: string;
  /** Files of the `data` scheme (`<name>.data/data/**`), relative to the interpreter prefix rather than site-packages. */
  readonly data: readonly ArchiveEntry[];
};

const decoder = new TextDecoder();
const recordAlgorithms = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' } as const;
const unhashedRecordFiles = new Set(['RECORD', 'RECORD.jws', 'RECORD.p7s']);

const recordMismatch = (message: string, path: string): ArchiveError =>
  new ArchiveError('INTEGRITY_MISMATCH', message, { reason: 'record', path });

const invalidWheel = (message: string, path?: string): ArchiveError =>
  new ArchiveError('EXTRACTION_REFUSED', message, { reason: 'malformed', path });

/**
 * Parse CSV per RFC 4180: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF rows.
 * @internal
 * @param text - CSV text.
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

const base64Url = (digest: ArrayBuffer): string =>
  // oxlint-disable-next-line no-restricted-globals -- archive-core has no base64 dependency; btoa exists in every host it targets
  btoa(String.fromCodePoint(...new Uint8Array(digest)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

type RecordRow = { readonly hash: string; readonly size: string };

const readRecord = (text: string, recordPath: string): Map<string, RecordRow> => {
  const rows = new Map<string, RecordRow>();
  for (const cells of parseCsv(text)) {
    const [path, hash = '', size = ''] = cells;
    if (path === undefined || path === '' || cells.length > 3) {
      throw invalidWheel(`${recordPath} has a malformed row: ${JSON.stringify(cells)}.`, recordPath);
    }
    if (rows.has(path)) {
      throw invalidWheel(`${recordPath} lists '${path}' twice.`, recordPath);
    }
    rows.set(path, { hash, size });
  }
  return rows;
};

const checkMember = async (input: {
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly row: RecordRow | undefined;
  readonly unhashed: boolean;
}): Promise<void> => {
  const { name, bytes, row, unhashed } = input;
  if (unhashed) {
    if (row !== undefined && row.hash !== '') {
      throw recordMismatch(`RECORD hashes '${name}', which must be listed without a hash.`, name);
    }
    return;
  }
  if (row === undefined || row.hash === '') {
    throw recordMismatch(`Wheel member '${name}' has no hashed RECORD row.`, name);
  }
  const separator = row.hash.indexOf('=');
  const algorithm = row.hash.slice(0, separator);
  const expected = row.hash.slice(separator + 1);
  if (!Object.hasOwn(recordAlgorithms, algorithm) || !/^[\w-]+$/u.test(expected)) {
    throw recordMismatch(
      `RECORD row for '${name}' has '${row.hash}', not a sha256/384/512 base64url hash without padding.`,
      name,
    );
  }
  const actual = base64Url(
    await crypto.subtle.digest(recordAlgorithms[algorithm as keyof typeof recordAlgorithms], bytes),
  );
  if (actual !== expected) {
    throw recordMismatch(`Wheel member '${name}' does not match its RECORD hash.`, name);
  }
  if (row.size !== '' && Number(row.size) !== bytes.byteLength) {
    throw recordMismatch(`Wheel member '${name}' does not match its RECORD size.`, name);
  }
};

// The one top-level `<name>-<version>.dist-info` directory names the distribution.
const distributionInfo = (files: readonly ZipMember[]): { stem: string; distribution: string; version: string } => {
  const directories = [
    ...new Set(files.map((file) => file.name.split('/')[0] ?? '').filter((top) => top.endsWith('.dist-info'))),
  ];
  const [directory] = directories;
  const stem = directory?.slice(0, -'.dist-info'.length) ?? '';
  const separator = stem.indexOf('-');
  if (directories.length !== 1 || separator <= 0) {
    throw invalidWheel(
      `Wheel must contain exactly one '<name>-<version>.dist-info' directory; found ${directories.length}.`,
    );
  }
  return { stem, distribution: stem.slice(0, separator), version: stem.slice(separator + 1) };
};

/**
 * Read a wheel as an installer would, without running anything: every member is checked against `RECORD`
 * (RFC 4180 rows, unpadded base64url sha256/384/512 hashes, sizes); `RECORD` itself and `RECORD.jws`/`RECORD.p7s`
 * are listed unhashed. One wrong, missing or extra row refuses the whole wheel. `<name>.data/data/**` is returned
 * in `data`, relative to the interpreter prefix; every other `.data/` scheme (`scripts`, `headers`, `purelib`,
 * `platlib`) is refused.
 * @param bytes - The wheel.
 * @param limits - Entry and unpacked-byte caps.
 * @returns Site-packages-relative entries, the `data` scheme files and the distribution name and version.
 * @throws {ArchiveError} `INTEGRITY_MISMATCH` (`record`) when a member disagrees with `RECORD`;
 * `UNSUPPORTED_FEATURE` (`data-scheme`) for a `.data/` scheme other than `data`; `EXTRACTION_REFUSED` for an
 * unsafe path, an exceeded cap or a malformed wheel.
 * @public
 */
export const readWheel = async (bytes: Uint8Array<ArrayBuffer>, limits: ArchiveLimits): Promise<WheelContents> => {
  const members = readZipDirectory(bytes, limits.maximumEntries);
  assertDirectoryWithinLimits(members, limits.maximumUnpackedBytes);
  for (const member of members) {
    entrySegments(member.name);
    assertSupportedMember(member);
  }
  const files = members.filter((member) => !member.directory);
  const { stem, distribution, version } = distributionInfo(files);
  const recordPath = `${stem}.dist-info/RECORD`;
  const dataPrefix = `${stem}.data/`;
  for (const file of files) {
    const scheme = file.name.startsWith(dataPrefix) ? file.name.slice(dataPrefix.length).split('/')[0] : undefined;
    if (scheme !== undefined && scheme !== 'data') {
      throw new ArchiveError(
        'UNSUPPORTED_FEATURE',
        `Wheel member '${file.name}' uses the '${scheme}' .data scheme; only 'data' is installed.`,
        { reason: 'data-scheme', path: file.name },
      );
    }
  }
  const recordMember = files.find((file) => file.name === recordPath);
  if (recordMember === undefined) {
    throw invalidWheel(`Wheel has no ${recordPath}.`, recordPath);
  }
  const rows = readRecord(decoder.decode(await readZipMember(bytes, recordMember)), recordPath);
  const isUnhashed = (name: string): boolean => {
    const slash = name.lastIndexOf('/');
    return name.slice(0, slash) === `${stem}.dist-info` && unhashedRecordFiles.has(name.slice(slash + 1));
  };
  // Hashed members skip the CRC-32: their RECORD digest is the stronger check, and the wheel itself is pinned.
  const verified = await mapConcurrent(files, inflateConcurrency, async (file) => {
    const unhashed = isUnhashed(file.name);
    const contents = await readZipMember(bytes, file, unhashed);
    await checkMember({ name: file.name, bytes: contents, row: rows.get(file.name), unhashed });
    return { file, contents };
  });
  const entries: ArchiveEntry[] = [];
  const data: ArchiveEntry[] = [];
  for (const { file, contents } of verified) {
    rows.delete(file.name);
    const mode = file.mode === undefined ? {} : { mode: file.mode };
    if (file.name.startsWith(`${dataPrefix}data/`)) {
      const path = file.name.slice(`${dataPrefix}data/`.length);
      if (path.length === 0) {
        throw invalidWheel(`Wheel member '${file.name}' has no path inside the data scheme.`, file.name);
      }
      data.push({ path, bytes: contents, ...mode });
    } else {
      entries.push({ path: file.name, bytes: contents, ...mode });
    }
  }
  const [extra] = rows.keys();
  if (extra !== undefined) {
    throw recordMismatch(`RECORD lists '${extra}', which the wheel does not contain.`, extra);
  }
  return { distribution, version, entries, data, skipped: [] };
};
