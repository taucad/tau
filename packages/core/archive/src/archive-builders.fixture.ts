/* oxlint-disable no-bitwise -- zip records are bit fields. */
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync, gzipSync } from 'node:zlib';

// In-test archive writers, so the readers are tested against the formats rather than against a library.

/** One tar member; `type` is the ustar typeflag. */
export type TarInput = {
  readonly name: string;
  readonly data?: string | Uint8Array<ArrayBuffer>;
  readonly type?: string;
  readonly mode?: number;
  readonly linkname?: string;
  readonly prefix?: string;
};

const encoder = new TextEncoder();

const bytesOf = (data: string | Uint8Array<ArrayBuffer> | undefined): Uint8Array<ArrayBuffer> =>
  typeof data === 'string' ? encoder.encode(data) : (data ?? new Uint8Array(0));

const concat = (parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const tarHeader = (entry: TarInput, size: number): Uint8Array<ArrayBuffer> => {
  const block = new Uint8Array(512);
  const put = (value: string, start: number): void => {
    block.set(encoder.encode(value), start);
  };
  put(entry.name.slice(0, 100), 0);
  put(`${(entry.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100);
  put(`${size.toString(8).padStart(11, '0')}\0`, 124);
  put(entry.type ?? '0', 156);
  put((entry.linkname ?? '').slice(0, 100), 157);
  put('ustar\u000000', 257);
  put(entry.prefix ?? '', 345);
  block.fill(0x20, 148, 156);
  put(
    `${block
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0')}\0 `,
    148,
  );
  return block;
};

/**
 * Build an uncompressed ustar archive.
 * @param entries - Members in order.
 * @returns Tar bytes.
 */
export const tar = (...entries: readonly TarInput[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const entry of entries) {
    const data = bytesOf(entry.data);
    blocks.push(tarHeader(entry, data.length), data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  return concat(blocks);
};

/**
 * A pax extended-header record.
 * @param key - Record key.
 * @param value - Record value.
 * @returns The `<length> <key>=<value>\n` record.
 */
export const paxRecord = (key: string, value: string): string => {
  const body = ` ${key}=${value}\n`;
  let { length } = body;
  while (`${length}${body}`.length !== length) {
    length = `${length}${body}`.length;
  }
  return `${length}${body}`;
};

/**
 * Gzip bytes.
 * @param bytes - Input.
 * @returns Gzip bytes.
 */
export const gzip = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(gzipSync(bytes));

/** One zip member; a name ending in `/` is a directory. */
export type ZipInput = {
  readonly name: string;
  readonly data?: string | Uint8Array<ArrayBuffer>;
  readonly method?: 0 | 8;
  /** A method number written over the member's real bytes (an unsupported-method fixture). */
  readonly labelMethod?: number;
  /** Full Unix `st_mode`, file type included. */
  readonly mode?: number;
  readonly flags?: number;
  /** A CRC-32 written instead of the real one (a corruption fixture). */
  readonly crc?: number;
};

/**
 * Build a zip archive with stored or deflated members, optionally with ZIP64 extras and end records.
 * @param entries - Members in order.
 * @param options - `zip64` forces ZIP64 extras on every member and the ZIP64 end records.
 * @returns Zip bytes.
 */
export const zip = (
  entries: readonly ZipInput[],
  options: { readonly zip64?: boolean } = {},
): Uint8Array<ArrayBuffer> => {
  const zip64 = options.zip64 === true;
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  const central: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = bytesOf(entry.data);
    const method = entry.name.endsWith('/') ? 0 : (entry.method ?? 8);
    const body = Buffer.from(method === 8 ? deflateRawSync(data) : data);
    const label = entry.labelMethod ?? method;
    const crc = entry.crc ?? crc32(data);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    const localExtra = Buffer.alloc(zip64 ? 20 : 0);
    if (zip64) {
      extra.writeUInt16LE(0x00_01, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(data.byteLength), 4);
      extra.writeBigUInt64LE(BigInt(body.byteLength), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
      localExtra.writeUInt16LE(0x00_01, 0);
      localExtra.writeUInt16LE(16, 2);
      localExtra.writeBigUInt64LE(BigInt(data.byteLength), 4);
      localExtra.writeBigUInt64LE(BigInt(body.byteLength), 12);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(zip64 ? 45 : 20, 4);
    local.writeUInt16LE(entry.flags ?? 0x08_00, 6);
    local.writeUInt16LE(label, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : body.byteLength, 18);
    local.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : data.byteLength, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    chunks.push(local, name, localExtra, body);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02_01_4b_50, 0);
    record.writeUInt16LE((3 << 8) | 45, 4);
    record.writeUInt16LE(zip64 ? 45 : 20, 6);
    record.writeUInt16LE(entry.flags ?? 0x08_00, 8);
    record.writeUInt16LE(label, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : body.byteLength, 20);
    record.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : data.byteLength, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(extra.length, 30);
    const mode = entry.mode ?? (entry.name.endsWith('/') ? 0o4_0755 : 0o10_0644);
    record.writeUInt32LE((mode << 16) >>> 0, 38);
    record.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : offset, 42);
    central.push(record, name, extra);
    offset += local.length + name.length + localExtra.length + body.length;
  }
  const centralBytes = Buffer.concat(central);
  const tail: Array<Uint8Array<ArrayBuffer>> = [];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06_06_4b_50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(entries.length), 24);
    record.writeBigUInt64LE(BigInt(entries.length), 32);
    record.writeBigUInt64LE(BigInt(centralBytes.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07_06_4b_50, 0);
    locator.writeBigUInt64LE(BigInt(offset + centralBytes.length), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(zip64 ? 0xff_ff : entries.length, 8);
  end.writeUInt16LE(zip64 ? 0xff_ff : entries.length, 10);
  end.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : centralBytes.length, 12);
  end.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, centralBytes, ...tail, end]));
};

/**
 * A RECORD hash as wheels write it: unpadded base64url.
 * @param data - File contents.
 * @returns `sha256=<base64url>`.
 */
export const recordHash = (data: string | Uint8Array<ArrayBuffer>): string =>
  `sha256=${createHash('sha256').update(bytesOf(data)).digest('base64url')}`;

const csvField = (value: string): string => (/[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/**
 * Build a wheel whose RECORD lists every file with its real hash, then lets the test edit the rows.
 * @param stem - `<name>-<version>`.
 * @param files - Path to contents, `.dist-info/WHEEL` and `RECORD` excluded.
 * @param editRecord - Rewrites the computed `[path, hash, size]` rows before they are written.
 * @returns Wheel bytes.
 */
export const wheel = (
  stem: string,
  files: Readonly<Record<string, string>>,
  editRecord: (rows: string[][]) => string[][] = (rows) => rows,
): Uint8Array<ArrayBuffer> => {
  const members: Record<string, string> = {
    ...files,
    [`${stem}.dist-info/WHEEL`]: 'Wheel-Version: 1.0\nRoot-Is-Purelib: true\n',
  };
  const rows = [
    ...Object.entries(members).map(([path, data]) => [path, recordHash(data), String(bytesOf(data).byteLength)]),
    [`${stem}.dist-info/RECORD`, '', ''],
  ];
  const record = `${editRecord(rows)
    .map((row) => row.map((field) => csvField(field)).join(','))
    .join('\r\n')}\r\n`;
  return zip([
    ...Object.entries(members).map(([name, data]) => ({ name, data })),
    { name: `${stem}.dist-info/RECORD`, data: record },
  ]);
};
