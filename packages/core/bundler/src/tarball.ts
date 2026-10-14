/** One regular file read from a package tarball, relative to the package root. @internal */
export type TarEntry = {
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mode?: number;
};

/** Regular files of a tarball plus the paths of entries that were not extracted. @internal */
export type TarContents = {
  readonly entries: readonly TarEntry[];
  /** Symlinks, hardlinks, devices and top-level entries outside the package folder. */
  readonly skipped: readonly string[];
};

const blockSize = 512;
/** Upper bound for one unpacked package; a larger tarball is refused rather than buffered. */
const maximumUnpackedBytes = 256 * 1024 * 1024;
const maximumTarEntries = 100_000;
const decoder = new TextDecoder();

/**
 * Read a byte stream into one buffer, cancelling it once it exceeds the budget.
 * @internal
 * @param stream - Source stream.
 * @param maximumBytes - Largest accepted total size.
 * @returns The concatenated bytes.
 */
export const readBoundedStream = async (
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = stream.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- streaming enforces the byte budget before buffering more
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      length += chunk.value.byteLength;
      if (length > maximumBytes) {
        // oxlint-disable-next-line no-await-in-loop -- cancel an oversized stream immediately
        await reader.cancel();
        throw new Error(`Stream exceeds ${maximumBytes} bytes.`);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

/**
 * Decompress gzip bytes with the platform `DecompressionStream`, bounded to 256 MiB of output.
 * @param bytes - Gzip-compressed bytes, such as an npm registry tarball.
 * @returns The decompressed bytes.
 * @throws {Error} When the data is not gzip or decompresses beyond the budget.
 * @internal
 */
export const gunzip = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  readBoundedStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), maximumUnpackedBytes);

const field = (header: Uint8Array<ArrayBuffer>, start: number, length: number): string => {
  const raw = header.subarray(start, start + length);
  const end = raw.indexOf(0);
  return decoder.decode(end === -1 ? raw : raw.subarray(0, end));
};

const octal = (header: Uint8Array<ArrayBuffer>, start: number, length: number): number => {
  if ((header[start] ?? 0) >= 0x80) {
    throw new Error('Tar entry uses a base-256 numeric field, which package tarballs never need.');
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

// Read the `path` record of a pax extended header (`<length> <key>=<value>\n` records).
const paxPath = (data: Uint8Array<ArrayBuffer>): string | undefined => {
  let path: string | undefined;
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    const length = Number.parseInt(decoder.decode(data.subarray(offset, space)), 10);
    if (space === -1 || !Number.isInteger(length) || length <= 0) {
      throw new Error('Tar pax header is malformed.');
    }
    const record = decoder.decode(data.subarray(space + 1, offset + length - 1));
    const separator = record.indexOf('=');
    if (record.slice(0, separator) === 'path') {
      path = record.slice(separator + 1);
    }
    offset += length;
  }
  return path;
};

// POSIX ustar splits long names into `prefix` + `name`; GNU tar uses that region for other fields.
const headerName = (header: Uint8Array<ArrayBuffer>): string => {
  const prefix = field(header, 257, 6) === 'ustar' ? field(header, 345, 155) : '';
  const name = field(header, 0, 100);
  return prefix.length > 0 ? `${prefix}/${name}` : name;
};

// Confine one entry name and strip its first folder, as npm does (`package/`, or a publisher's own folder name).
// Returns `undefined` for an entry that has no path inside that folder.
const packageRelativePath = (name: string): string | undefined => {
  const segments = name.split('/');
  if (name.length === 0 || name.startsWith('/') || name.includes('\\') || segments.includes('..')) {
    throw new Error(`Tar entry path '${name}' escapes the package folder.`);
  }
  const relative = segments.filter((segment) => segment.length > 0 && segment !== '.').slice(1);
  return relative.length === 0 ? undefined : relative.join('/');
};

/**
 * Read the regular files of an uncompressed ustar/pax tarball (GNU long names included).
 * Directories are implied by file paths. Symlinks, hardlinks and devices are never extracted.
 * @param bytes - Uncompressed tar bytes, for example from {@link gunzip}.
 * @returns Package-relative regular files plus the skipped entry paths.
 * @throws {Error} When an entry path is empty, absolute, contains a backslash or `..`, or the archive is malformed or too large.
 * @internal
 */
export const readTarEntries = (bytes: Uint8Array<ArrayBuffer>): TarContents => {
  const entries: TarEntry[] = [];
  const skipped: string[] = [];
  let longPath: string | undefined;
  let offset = 0;
  while (offset + blockSize <= bytes.length) {
    const header = bytes.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    if (!checksumMatches(header)) {
      throw new Error(`Tar header at byte ${offset} has an invalid checksum.`);
    }
    if (entries.length + skipped.length >= maximumTarEntries) {
      throw new Error(`Tarball has more than ${maximumTarEntries} entries.`);
    }
    const size = octal(header, 124, 12);
    const dataStart = offset + blockSize;
    if (dataStart + size > bytes.length) {
      throw new Error('Tarball is truncated.');
    }
    const data = bytes.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / blockSize) * blockSize;
    const type = String.fromCodePoint(header[156] ?? 0);
    if (type === 'x') {
      longPath = paxPath(data) ?? longPath;
      continue;
    }
    if (type === 'L') {
      longPath = field(data, 0, data.length);
      continue;
    }
    // Global pax headers and GNU long link names carry nothing to extract.
    if (type === 'g' || type === 'K') {
      continue;
    }
    if (type === '5') {
      longPath = undefined;
      continue;
    }
    const name = longPath ?? headerName(header);
    longPath = undefined;
    const path = packageRelativePath(name);
    if (path === undefined || (type !== '0' && type !== '\0' && type !== '7')) {
      skipped.push(path ?? name);
      continue;
    }
    entries.push({ path, bytes: new Uint8Array(data), mode: octal(header, 100, 8) });
  }
  return { entries, skipped };
};
