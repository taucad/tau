/**
 * Purpose: Build the Tau UI layer `tau serve` serves, and rewrite the CLI's pin from a published layer (charter W18,
 * Q51, ruling X2).
 * Why: The serve UI is too large for npm and is published by nothing else, so it ships as a Tau-authored layer that
 * the preparation host downloads by digest into the payload store. `build` turns `ui:build:serve`'s client directory
 * into a deterministic ustar `tar.gz` (sorted names, mtime 0, uid and gid 0, modes 0644 or 0755, no source maps) and
 * its record `tau-layer.json`, and refuses a layer over the size line. `pin` re-hashes a published archive against its
 * record and writes `packages/cli/serve-ui-layer.json` from it; `--check` compares instead of writing.
 * Environment: Node with the workspace install; run from the repository root.
 * Usage:
 *   node --import @oxc-node/core/register packages/cli/scripts/serve-ui-layer.mts build \
 *     --client apps/ui/serve/build/client --out out/serve-ui-layer [--max-bytes 150000000]
 *   node --import @oxc-node/core/register packages/cli/scripts/serve-ui-layer.mts pin \
 *     --layer out/serve-ui-layer/tau-layer.json --archive out/serve-ui-layer/tau-serve-ui.tar.gz \
 *     (--write <pin> | --check <pin>) [--outputs]
 * Exit codes: 0 built, pinned or matching; 1 refused (size, a source map, a link, a digest or a stale pin); 2 usage.
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createGzip } from 'node:zlib';

/** The archive's file name, on the release and in the record. */
export const layerAsset = 'tau-serve-ui.tar.gz';

/** The size line (S12, X2): the gzipped layer may not exceed 150 MB. Bytes. */
export const defaultMaximumBytes = 150_000_000;

const blockSize = 512;

/** What `build` records beside the archive; `pin` reads it back. */
export type LayerRecord = {
  readonly schemaVersion: 1;
  readonly asset: string;
  /** The immutable GitHub Release that carries the archive: `serve-ui-layer-<first 16 hex>`. */
  readonly tag: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly unpackedByteLength: number;
  readonly fileCount: number;
  /** Source maps left out of the layer (X2): never served, never shipped. */
  readonly excludedSourceMaps: { readonly fileCount: number; readonly byteLength: number };
};

/**
 * Whether a build file is a source map, which the layer never carries (X2).
 * @param path - A client-relative path.
 * @returns True for `*.map`.
 */
export const isSourceMap = (path: string): boolean => path.toLowerCase().endsWith('.map');

/**
 * Split a path into ustar's `prefix` and `name` fields.
 * @param path - A POSIX path.
 * @returns The two fields.
 * @throws {Error} When no split fits (prefix ≤ 155 bytes, name ≤ 100 bytes).
 */
export const ustarName = (path: string): { readonly prefix: string; readonly name: string } => {
  if (Buffer.byteLength(path) <= 100) {
    return { prefix: '', name: path };
  }
  for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100 && name !== '') {
      return { prefix, name };
    }
  }
  throw new Error(`${path} does not fit a ustar header (prefix 155 bytes, name 100 bytes).`);
};

/**
 * One ustar header: owner and group 0, mtime 0, mode 0644 or 0755.
 * @param path - The member's POSIX path.
 * @param size - Its size. Bytes.
 * @param executable - Whether the owner may execute it.
 * @returns The 512-byte header.
 */
export const ustarHeader = (path: string, size: number, executable: boolean): Uint8Array<ArrayBuffer> => {
  const header = Buffer.alloc(blockSize);
  const { prefix, name } = ustarName(path);
  header.write(name, 0);
  header.write(`${(executable ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.write('0', 156);
  header.write('ustar\u000000', 257);
  header.write(prefix, 345);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  return header;
};

type LayerFile = {
  readonly path: string;
  readonly absolute: string;
  readonly size: number;
  readonly executable: boolean;
};

/**
 * Every regular file under the client directory except source maps, sorted by path.
 * @param root - The client directory.
 * @returns The files to archive and the source maps left out.
 * @throws {Error} For a symbolic link or any other entry that is not a file or directory.
 */
export const layerFiles = async (
  root: string,
): Promise<{ readonly files: readonly LayerFile[]; readonly maps: { fileCount: number; byteLength: number } }> => {
  const files: LayerFile[] = [];
  const maps = { fileCount: 0, byteLength: 0 };
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- a depth-first walk; order is restored by the sort below.
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`${path} is not a regular file; the layer carries files only.`);
      }
      // oxlint-disable-next-line no-await-in-loop -- one stat per file, in walk order.
      const info = await lstat(absolute);
      if (isSourceMap(path)) {
        maps.fileCount += 1;
        maps.byteLength += info.size;
        continue;
      }
      files.push({ path, absolute, size: info.size, executable: Math.floor(info.mode / 0o100) % 2 === 1 });
    }
  };
  await walk(root);
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { files, maps };
};

/**
 * The tar stream of the files, in order, ending with the two zero blocks.
 * @param files - The files to archive.
 * @yields Headers, file bytes and padding.
 */
async function* tarStream(files: readonly LayerFile[]): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  for (const file of files) {
    yield ustarHeader(file.path, file.size, file.executable);
    let written = 0;
    // oxlint-disable-next-line no-await-in-loop -- tar members are written in order, one file after the next.
    for await (const chunk of createReadStream(file.absolute)) {
      const bytes = chunk as Uint8Array<ArrayBuffer>;
      written += bytes.byteLength;
      yield bytes;
    }
    if (written !== file.size) {
      throw new Error(`${file.path} changed while it was archived.`);
    }
    const padding = (blockSize - (file.size % blockSize)) % blockSize;
    if (padding > 0) {
      yield Buffer.alloc(padding);
    }
  }
  yield Buffer.alloc(blockSize * 2);
}

/**
 * Write the deterministic layer archive and its record.
 * @param options - The client directory, the output directory and the size line.
 * @returns The record.
 * @throws {Error} When the client has no `index.html`, a file is not regular, or the archive is over the size line.
 */
export const buildLayer = async (options: {
  readonly client: string;
  readonly out: string;
  readonly maximumBytes?: number;
}): Promise<LayerRecord> => {
  const client = resolve(options.client);
  const index = await lstat(join(client, 'index.html')).catch(() => undefined);
  if (!index?.isFile()) {
    throw new Error(`${client} has no index.html; build it with pnpm nx run ui:build:serve.`);
  }
  const { files, maps } = await layerFiles(client);
  await rm(options.out, { recursive: true, force: true });
  await mkdir(options.out, { recursive: true });
  const archivePath = join(options.out, layerAsset);
  const hash = createHash('sha256');
  let byteLength = 0;
  const measure = new Transform({
    transform(chunk: Uint8Array<ArrayBuffer>, _encoding, callback) {
      hash.update(chunk);
      byteLength += chunk.byteLength;
      callback(undefined, chunk);
    },
  });
  await pipeline(Readable.from(tarStream(files)), createGzip({ level: 9 }), measure, createWriteStream(archivePath));
  const sha256 = hash.digest('hex');
  const maximumBytes = options.maximumBytes ?? defaultMaximumBytes;
  if (byteLength > maximumBytes) {
    throw new Error(
      `The layer is ${String(byteLength)} bytes gzipped, over the ${String(maximumBytes)}-byte line (X2). Trim the serve build before publishing it.`,
    );
  }
  const record: LayerRecord = {
    schemaVersion: 1,
    asset: layerAsset,
    tag: `serve-ui-layer-${sha256.slice(0, 16)}`,
    sha256,
    byteLength,
    unpackedByteLength: files.reduce((sum, file) => sum + file.size, 0),
    fileCount: files.length,
    excludedSourceMaps: maps,
  };
  await writeFile(join(options.out, 'tau-layer.json'), `${JSON.stringify(record, undefined, 2)}\n`);
  return record;
};

/** The pin's comment once a layer is published. */
const pinnedComment =
  'Written by packages/cli/scripts/serve-ui-layer.mts pin from a serve-ui-layer release (release-build.yml); never edit by hand.';

/**
 * The pin a published layer gives `serve-ui-layer.json`.
 * @param record - The layer's record.
 * @returns The pin, CDN blob first, then the release asset.
 */
export const composePin = (record: LayerRecord): Record<string, unknown> => ({
  '//': pinnedComment,
  schemaVersion: 1,
  integrity: `sha256-${Buffer.from(record.sha256, 'hex').toString('base64')}`,
  byteLength: record.byteLength,
  unpackedByteLength: record.unpackedByteLength,
  urls: [
    `https://cdn.tau.new/blobs/sha256/${record.sha256}`,
    `https://github.com/taucad/tau/releases/download/${record.tag}/${record.asset}`,
  ],
});

const readRecord = async (path: string): Promise<LayerRecord> => {
  const record = JSON.parse(await readFile(path, 'utf8')) as Partial<LayerRecord>;
  if (
    record.schemaVersion !== 1 ||
    record.asset !== layerAsset ||
    typeof record.sha256 !== 'string' ||
    !/^[\da-f]{64}$/u.test(record.sha256) ||
    record.tag !== `serve-ui-layer-${record.sha256.slice(0, 16)}` ||
    !Number.isSafeInteger(record.byteLength) ||
    !Number.isSafeInteger(record.unpackedByteLength)
  ) {
    throw new Error(`${path} is not a serve UI layer record.`);
  }
  return record as LayerRecord;
};

const sha256Of = async (path: string): Promise<{ readonly sha256: string; readonly byteLength: number }> => {
  const hash = createHash('sha256');
  let byteLength = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Uint8Array<ArrayBuffer>;
    hash.update(bytes);
    byteLength += bytes.byteLength;
  }
  return { sha256: hash.digest('hex'), byteLength };
};

/**
 * Verify a published archive against its record, then write or check the pin.
 * @param options - The record, the archive, and the pin file to write or check.
 * @returns The record.
 * @throws {Error} When the archive differs from its record, or `check` finds the pin stale.
 */
export const pinLayer = async (options: {
  readonly layer: string;
  readonly archive: string;
  readonly write?: string;
  readonly check?: string;
}): Promise<LayerRecord> => {
  const record = await readRecord(options.layer);
  const actual = await sha256Of(options.archive);
  if (actual.sha256 !== record.sha256 || actual.byteLength !== record.byteLength) {
    throw new Error(
      `${options.archive} is ${String(actual.byteLength)} bytes with sha256 ${actual.sha256}; its record says ${String(record.byteLength)} and ${record.sha256}.`,
    );
  }
  const pin = composePin(record);
  if (options.write !== undefined) {
    await writeFile(options.write, `${JSON.stringify(pin, undefined, 2)}\n`);
  }
  if (options.check !== undefined) {
    const current = JSON.parse(await readFile(options.check, 'utf8')) as Record<string, unknown>;
    const { '//': _comment, ...expected } = pin;
    const { '//': _currentComment, ...found } = current;
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      throw new Error(`${options.check} does not pin ${record.tag}; run serve-ui-layer.mts pin --write.`);
    }
  }
  return record;
};

const main = async (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: [...rest],
    options: {
      client: { type: 'string' },
      out: { type: 'string' },
      'max-bytes': { type: 'string' },
      layer: { type: 'string' },
      archive: { type: 'string' },
      write: { type: 'string' },
      check: { type: 'string' },
      outputs: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (command === 'build' && values.client !== undefined && values.out !== undefined) {
    const record = await buildLayer({
      client: values.client,
      out: values.out,
      ...(values['max-bytes'] === undefined ? {} : { maximumBytes: Number(values['max-bytes']) }),
    });
    process.stdout.write(`${JSON.stringify(record, undefined, 2)}\n`);
    return 0;
  }
  if (
    command === 'pin' &&
    values.layer !== undefined &&
    values.archive !== undefined &&
    (values.write !== undefined || values.check !== undefined)
  ) {
    const record = await pinLayer({
      layer: values.layer,
      archive: values.archive,
      ...(values.write === undefined ? {} : { write: values.write }),
      ...(values.check === undefined ? {} : { check: values.check }),
    });
    if (values.outputs) {
      process.stdout.write(`tag=${record.tag}\nasset=${record.asset}\nsha256=${record.sha256}\n`);
    }
    return 0;
  }
  process.stderr.write(
    'Usage: serve-ui-layer.mts build --client <dir> --out <dir> [--max-bytes <n>]\n' +
      '       serve-ui-layer.mts pin --layer <tau-layer.json> --archive <tar.gz> (--write <pin> | --check <pin>) [--outputs]\n',
  );
  return 2;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
