/* oxlint-disable no-bitwise -- tar modes and zip records are bit fields. */
// In-test payload archives: the three shapes a native closure ships (a gzipped ustar tree, a stored zip and a wheel
// whose RECORD lists every member), built in memory so a test pins bytes it made itself and never downloads one.
import { createHash } from 'node:crypto';
import { crc32, gzipSync } from 'node:zlib';

const encoder = new TextEncoder();

/**
 * Text as UTF-8 bytes.
 * @param text - Text.
 * @returns The bytes.
 * @public
 */
export const utf8 = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

const bytesOf = (data: string | Uint8Array<ArrayBuffer> | undefined): Uint8Array<ArrayBuffer> =>
  typeof data === 'string' || data === undefined ? utf8(data ?? '') : data;

/**
 * One member of {@link tarGz}: a regular file, or a symbolic link when `linkname` is set.
 * @public
 */
export type TarMember = {
  /** Archive path, such as `python/bin/python3.13`. */
  readonly name: string;
  /** File content; empty when absent. Ignored for a link. */
  readonly data?: string | Uint8Array<ArrayBuffer>;
  /** POSIX mode bits; `0o644` when absent. */
  readonly mode?: number;
  /** Link target; makes the member a symbolic link. */
  readonly linkname?: string;
};

/**
 * A gzipped ustar archive, shaped like python-build-standalone's or Microsoft's runtime tarballs.
 * @param members - Files and symbolic links, in archive order.
 * @returns The `.tar.gz` bytes.
 * @public
 */
export const tarGz = (...members: readonly TarMember[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const member of members) {
    const data = member.linkname === undefined ? bytesOf(member.data) : new Uint8Array(0);
    const header = Buffer.alloc(512);
    header.write(member.name, 0);
    header.write(`${(member.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write(member.linkname === undefined ? '0' : '2', 156);
    header.write(member.linkname ?? '', 157);
    header.write('ustar\u000000', 257);
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])));
};

/**
 * A zip of stored (uncompressed) regular files with mode `0o644`.
 * @param files - Archive path to content, in archive order.
 * @returns The zip bytes.
 * @public
 */
export const storedZip = (
  files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>,
): Uint8Array<ArrayBuffer> => {
  const locals: Array<Uint8Array<ArrayBuffer>> = [];
  const central: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  let count = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = utf8(path);
    const data = bytesOf(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02_01_4b_50, 0);
    record.writeUInt16LE((3 << 8) | 20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc32(data), 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE((0o10_0644 << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(record, name);
    offset += 30 + name.length + data.length;
    count += 1;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
};

/**
 * A wheel of `<distribution>-<version>.dist-info` whose `RECORD` lists every member's sha256 and size, as installers
 * require. The `WHEEL` and `RECORD` files are generated.
 * @param distribution - Distribution name, such as `demo`.
 * @param files - Wheel-relative path to content.
 * @param version - Distribution version; `1.0` when absent.
 * @returns The `.whl` bytes.
 * @public
 */
export const wheel = (
  distribution: string,
  files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>,
  version = '1.0',
): Uint8Array<ArrayBuffer> => {
  const distributionInfo = `${distribution}-${version}.dist-info`;
  const all: Record<string, string | Uint8Array<ArrayBuffer>> = {
    ...files,
    [`${distributionInfo}/WHEEL`]: 'Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
  };
  const rows = Object.entries(all).map(([path, content]) => {
    const data = bytesOf(content);
    return `${path},sha256=${createHash('sha256').update(data).digest('base64url')},${String(data.length)}`;
  });
  return storedZip({
    ...all,
    [`${distributionInfo}/RECORD`]: `${[...rows, `${distributionInfo}/RECORD,,`].join('\n')}\n`,
  });
};
