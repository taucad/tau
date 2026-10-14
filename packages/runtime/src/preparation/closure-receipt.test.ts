/* oxlint-disable no-bitwise -- zip records are bit fields. */
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { crc32, gzipSync } from 'node:zlib';

import { gunzip, integrityMatches, readTarEntries, readWheel } from '@taucad/archive-core';
import type { ArchiveEntry } from '@taucad/archive-core';
import { writeArchiveEntries } from '@taucad/archive-core/node';
import type { WrittenFile } from '@taucad/archive-core/node';
import { afterEach, describe, expect, it } from 'vitest';

import { computeClosureIntegrity, computeTreeIntegrity, receiptRow } from '#preparation/closure-receipt.js';
import { parsePluginDeployment, wheelDataDestination } from '#preparation/plugin-deployment.js';
import type { DependencyPayload, DependencyVariant, ReceiptFile } from '#preparation/preparation.types.js';

// ============================================================================
// In-test payloads: a python-build-standalone-shaped archive, a wheel with a `data` scheme and a raw worker file.
// ============================================================================

const encoder = new TextEncoder();
const limits = { maximumUnpackedBytes: 16 * 1024 * 1024, maximumEntries: 10_000 };
const sri = (bytes: Uint8Array<ArrayBuffer>): DependencyPayload['integrity'] =>
  `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

type TarMember = { readonly name: string; readonly data?: string; readonly mode?: number; readonly linkname?: string };

const tarGz = (...members: readonly TarMember[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const member of members) {
    const data = Buffer.from(member.data ?? '');
    const header = Buffer.alloc(512);
    header.write(member.name, 0);
    header.write(`${(member.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write(member.linkname === undefined ? '0' : '2', 156);
    header.write(member.linkname ?? '', 157);
    header.write('ustar\u000000', 257);
    header.fill(0x20, 148, 156);
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
    );
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])));
};

const storedZip = (files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> => {
  const locals: Array<Uint8Array<ArrayBuffer>> = [];
  const central: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = Buffer.from(text);
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
    record.writeUInt32LE(crc32(data), 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE((0o10_0644 << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(record, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
};

const demoWheel = (): Uint8Array<ArrayBuffer> => {
  const files: Record<string, string> = {
    'demo/__init__.py': 'VALUE = 1\n',
    'demo-1.0.data/data/share/man/man1/demo.1': '.TH DEMO 1\n',
    'demo-1.0.dist-info/WHEEL': 'Wheel-Version: 1.0\n',
  };
  const rows = Object.entries(files).map(
    ([path, text]) =>
      `${path},sha256=${createHash('sha256').update(text).digest('base64url')},${Buffer.byteLength(text)}`,
  );
  return storedZip({
    ...files,
    'demo-1.0.dist-info/RECORD': `${[...rows, 'demo-1.0.dist-info/RECORD,,'].join('\n')}\n`,
  });
};

const sitePackages = 'python/lib/python3.13/site-packages';
const payloadBytes: Readonly<Record<string, Uint8Array<ArrayBuffer>>> = {
  python: tarGz(
    { name: 'python/bin/python3.13', data: 'interpreter', mode: 0o755 },
    { name: 'python/bin/python3', linkname: 'python3.13', mode: 0o777 },
    { name: 'python/lib/python3.13/os.py', data: 'import abc\n' },
    { name: 'python/share/terminfo/h/hp2621', data: 'terminfo' },
    { name: 'python/share/terminfo/2/2621', linkname: '../h/hp2621', mode: 0o777 },
  ),
  demo: demoWheel(),
  'worker.py': encoder.encode('print("ready")\n'),
};

const manifest = {
  schemaVersion: 1,
  kernels: { build123d: { requires: ['engine'], extensions: ['py'] } },
  dependencies: {
    engine: [
      {
        target: { runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '12.0' },
        payloads: [
          { name: 'python', format: 'tar.gz', destination: 'python', stripComponents: 1 },
          { name: 'demo', format: 'wheel', destination: sitePackages },
          { name: 'worker.py', format: 'raw', destination: 'tau-worker' },
        ].map((payload) => ({
          ...payload,
          integrity: sri(payloadBytes[payload.name]!),
          byteLength: payloadBytes[payload.name]!.byteLength,
          origin: { kind: 'url', urls: [`https://payloads.example.test/${payload.name}`] },
        })),
      },
    ],
  },
};

// The closure assembly the preparation host performs, reduced to the contract: verify, unpack, write.
const unpackVariant = async (
  variant: DependencyVariant,
  root: string,
  links: 'symlink' | 'copy',
): Promise<WrittenFile[]> => {
  const write = async (destination: string, entries: readonly ArchiveEntry[]): Promise<WrittenFile[]> =>
    writeArchiveEntries({ root, destination, entries, links });
  const unpack = async (payload: DependencyPayload): Promise<WrittenFile[]> => {
    const bytes = payloadBytes[payload.name]!;
    expect(await integrityMatches(bytes, payload.integrity)).toBe(true);
    if (payload.format === 'tar.gz') {
      const { entries } = readTarEntries(await gunzip(bytes, limits), {
        ...limits,
        stripComponents: payload.stripComponents ?? 0,
      });
      return write(payload.destination, entries);
    }
    if (payload.format === 'wheel') {
      const contents = await readWheel(bytes, limits);
      const [installed, data] = await Promise.all([
        write(payload.destination, contents.entries),
        write(wheelDataDestination(payload.destination), contents.data),
      ]);
      return [...installed, ...data];
    }
    return write(payload.destination, [{ path: payload.name, bytes, mode: 0o644 }]);
  };
  const rows = await Promise.all(variant.payloads.map(async (payload) => unpack(payload)));
  return rows.flat();
};

describe('closure receipt', () => {
  const roots: string[] = [];
  const freshRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'closure-'));
    roots.push(root);
    return root;
  };

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  it('should keep every closure file a descendant of the kernel runtime root', async () => {
    const variant = parsePluginDeployment(manifest).dependencies['engine']![0];
    const root = await freshRoot();

    const rows = await unpackVariant(variant, root, 'symlink');
    const realRoot = await realpath(root);
    const resolved = await Promise.all(
      rows.map(async ({ path }) => relative(realRoot, await realpath(join(root, path)))),
    );

    expect(rows.map(({ path }) => path).toSorted()).toEqual([
      'python/bin/python3',
      'python/bin/python3.13',
      'python/lib/python3.13/os.py',
      'python/lib/python3.13/site-packages/demo-1.0.dist-info/RECORD',
      'python/lib/python3.13/site-packages/demo-1.0.dist-info/WHEEL',
      'python/lib/python3.13/site-packages/demo/__init__.py',
      'python/share/man/man1/demo.1',
      'python/share/terminfo/2/2621',
      'python/share/terminfo/h/hp2621',
      'tau-worker/worker.py',
    ]);
    expect(resolved.filter((path) => path === '' || path.startsWith('..') || isAbsolute(path))).toEqual([]);
  });

  it('should give the same treeIntegrity whether links are kept (POSIX) or copied (Windows)', async () => {
    const variant = parsePluginDeployment(manifest).dependencies['engine']![0];

    const posix = await computeTreeIntegrity(await unpackVariant(variant, await freshRoot(), 'symlink'));
    const windows = await computeTreeIntegrity(await unpackVariant(variant, await freshRoot(), 'copy'));

    expect(windows).toBe(posix);
    expect(posix).toMatch(/^sha256-[A-Za-z\d+/]{43}=$/u);
  });

  it('should change treeIntegrity when one file changes and not when the rows are reordered', async () => {
    const files: ReceiptFile[] = [
      { path: 'python/bin/python3.13', byteLength: 11, sha256: 'a'.repeat(64), mode: 0o755 },
      { path: 'python/bin/python3', byteLength: 11, sha256: 'a'.repeat(64), mode: 0o755, symlinkTarget: 'python3.13' },
    ];

    const baseline = await computeTreeIntegrity(files);

    expect(await computeTreeIntegrity(files.toReversed())).toBe(baseline);
    expect(await computeTreeIntegrity([{ ...files[0]!, mode: 0o644 }, files[1]!])).not.toBe(baseline);
    expect(await computeTreeIntegrity([files[0]!, { ...files[1]!, symlinkTarget: undefined }])).not.toBe(baseline);
  });

  it('should spell each file as one canonical row', () => {
    expect(
      receiptRow({ path: 'bin/python3', byteLength: 11, sha256: 'ab', mode: 0o755, symlinkTarget: 'python3.13' }),
    ).toBe('bin/python3\u000011\u0000ab\u0000755\u0000python3.13');
  });

  it('should derive closureIntegrity from the pins in manifest order', async () => {
    const variant = parsePluginDeployment(manifest).dependencies['engine']![0];
    const expected = `sha256-${createHash('sha256')
      .update(variant.payloads.map(({ name, integrity }) => `${name}\t${integrity}`).join('\n'))
      .digest('base64')}`;

    expect(await computeClosureIntegrity(variant.payloads)).toBe(expected);
    expect(await computeClosureIntegrity(variant.payloads.toReversed())).not.toBe(expected);
  });
});
