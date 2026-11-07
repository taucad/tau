/* oxlint-disable no-bitwise -- the tests flip zip flag and CRC bits. */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { applyBatchWithPrimitives } from '#backend/batch.js';
import type { BatchEntry } from '#changeset.js';
import { tauPathPolicy } from '#path-registry.js';
import { ImportRefusedError, importLimits } from '#importer/limits.js';
import { readZipDirectory, blobRangeSource } from '#importer/zip.js';
import { createInlineImportDecoder, decodeImportEntry, readImportEntry } from '#importer/decode.js';
import { crc32 } from '#importer/crc32.js';
import type { ImportDecoder } from '#importer/decode.js';
import {
  directoryHandleImportSource,
  fileListImportSource,
  handleListImportSource,
  planImport,
  spoolImportArchive,
  zipImportSource,
} from '#importer/sources.js';
import {
  discardStagedImport,
  importStagingDirectory,
  importStagingStaleMilliseconds,
  readStagedImport,
  stageImport,
  sweepStagedImports,
} from '#importer/staging.js';
import type { ImportStagingPort } from '#importer/staging.js';

const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

const zipOf = async (
  files: Record<string, string | Uint8Array<ArrayBuffer> | { content: string; unixPermissions: number }>,
  compression: 'STORE' | 'DEFLATE' = 'DEFLATE',
): Promise<Blob> => {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) {
    if (typeof value === 'object' && 'unixPermissions' in value) {
      zip.file(name, value.content, { unixPermissions: value.unixPermissions });
    } else {
      zip.file(name, value);
    }
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression, platform: 'UNIX' });
  return new Blob([bytes as Uint8Array<ArrayBuffer>]);
};

type RawEntry = Readonly<{
  name: string;
  data: Uint8Array<ArrayBuffer>;
  /** Write the central sizes and offset as ZIP64, carried in the extra field. */
  zip64?: boolean;
  /** A ZIP64 extra field shorter than its values need. */
  shortZip64?: boolean;
  /** Point the central record at another entry's local header. */
  sameOffsetAs?: number;
}>;

/* A stored zip written field by field, for archives JSZip never writes: ZIP64 records, shared ranges, padded directories. */
const rawZip = (entries: readonly RawEntry[], options: Readonly<{ directoryPadding?: number }> = {}): Blob => {
  const encoder = new TextEncoder();
  const locals: Array<Uint8Array<ArrayBuffer>> = [];
  const offsets: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const local = new Uint8Array(30 + name.byteLength + entry.data.byteLength);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04_03_4b_50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(entry.data), true);
    view.setUint32(18, entry.data.byteLength, true);
    view.setUint32(22, entry.data.byteLength, true);
    view.setUint16(26, name.byteLength, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.byteLength);
    offsets.push(offset);
    locals.push(local);
    offset += local.byteLength;
  }
  const centrals: Array<Uint8Array<ArrayBuffer>> = [];
  for (const [index, entry] of entries.entries()) {
    const name = encoder.encode(entry.name);
    const localOffset = offsets[entry.sameOffsetAs ?? index]!;
    const extra = entry.zip64 === true ? new Uint8Array(entry.shortZip64 === true ? 12 : 28) : new Uint8Array(0);
    if (entry.zip64 === true) {
      const view = new DataView(extra.buffer);
      view.setUint16(0, 0x00_01, true);
      view.setUint16(2, extra.byteLength - 4, true);
      view.setBigUint64(4, BigInt(entry.data.byteLength), true);
      if (entry.shortZip64 !== true) {
        view.setBigUint64(12, BigInt(entry.data.byteLength), true);
        view.setBigUint64(20, BigInt(localOffset), true);
      }
    }
    const central = new Uint8Array(46 + name.byteLength + extra.byteLength);
    const view = new DataView(central.buffer);
    view.setUint32(0, 0x02_01_4b_50, true);
    view.setUint16(4, (3 << 8) | 20, true);
    view.setUint16(6, 20, true);
    view.setUint32(16, crc32(entry.data), true);
    const wide = entry.zip64 === true ? 0xff_ff_ff_ff : undefined;
    view.setUint32(20, wide ?? entry.data.byteLength, true);
    view.setUint32(24, wide ?? entry.data.byteLength, true);
    view.setUint16(28, name.byteLength, true);
    view.setUint16(30, extra.byteLength, true);
    view.setUint32(38, (0o10_0644 << 16) >>> 0, true);
    view.setUint32(42, wide ?? localOffset, true);
    central.set(name, 46);
    central.set(extra, 46 + name.byteLength);
    centrals.push(central);
  }
  const padding = new Uint8Array(options.directoryPadding ?? 0);
  const directorySize = centrals.reduce((sum, central) => sum + central.byteLength, 0) + padding.byteLength;
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06_05_4b_50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, padding, end] as BlobPart[]);
};

const gitBlobOid = (bytes: Uint8Array<ArrayBuffer>): string =>
  createHash('sha1')
    .update(`blob ${String(bytes.byteLength)}\0`)
    .update(bytes)
    .digest('hex');

const port = (provider: MemoryProvider): ImportStagingPort & { writes: () => number; writtenBytes: () => number } => {
  let writes = 0;
  let writtenBytes = 0;
  return {
    provider,
    apply: async (entries: readonly BatchEntry[]) => {
      for (const entry of entries) {
        if (entry.op === 'write' && entry.path.includes('/tree/')) {
          writes += 1;
          writtenBytes += entry.data instanceof Blob ? entry.data.size : entry.data.byteLength;
        }
      }
      return applyBatchWithPrimitives(provider, entries);
    },
    writes: () => writes,
    writtenBytes: () => writtenBytes,
  };
};

const plan = async (source: Parameters<typeof planImport>[0], limits = importLimits) =>
  planImport(source, { policy: tauPathPolicy, limits });

const refusal = async (work: Promise<unknown>): Promise<string | undefined> => {
  try {
    await work;
  } catch (error) {
    return error instanceof ImportRefusedError ? error.reason : `other: ${String(error)}`;
  }
  return undefined;
};

describe('readZipDirectory', () => {
  it('should list names, sizes, methods and the executable bit from the central directory alone', async () => {
    const blob = await zipOf({
      'p/a.txt': 'hello',
      'p/run.sh': { content: '#!/bin/sh', unixPermissions: 0o10_0755 },
    });
    const read = vi.fn(blobRangeSource(blob).read);

    const { entries } = await readZipDirectory({ size: blob.size, read });

    expect(entries.map(({ name, size, directory }) => [name, size, directory])).toEqual([
      ['p/', 0, true],
      ['p/a.txt', 5, false],
      ['p/run.sh', 9, false],
    ]);
    expect(entries.find(({ name }) => name === 'p/run.sh')?.mode).toBe('100755');
    expect(entries.find(({ name }) => name === 'p/a.txt')?.mode).toBe('100644');
    /* The tail, then the directory: two range reads, no entry data. */
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('should refuse a file that is not a zip', async () => {
    expect(await refusal(readZipDirectory(blobRangeSource(new Blob([text('not a zip')]))))).toBe('corrupt');
  });

  it('should refuse an archive past the entry limit before reading its directory', async () => {
    const blob = await zipOf({ a: '1', b: '2', c: '3' });

    expect(await refusal(readZipDirectory(blobRangeSource(blob), { maximumEntries: 2 }))).toBe('tooManyEntries');
  });

  it('should read ZIP64 sizes and offsets from the extra field, and decode the entry they name', async () => {
    const blob = rawZip([
      { name: 'a.txt', data: text('alpha') },
      { name: 'b.txt', data: text('bravo!'), zip64: true },
    ]);

    const { entries } = await readZipDirectory(blobRangeSource(blob));

    expect(entries.map(({ name, size, compressedSize }) => [name, size, compressedSize])).toEqual([
      ['a.txt', 5, 5],
      ['b.txt', 6, 6],
    ]);
    expect(new TextDecoder().decode(await readImportEntry({ blob, path: 'b.txt', size: 6, zip: entries[1]! }))).toBe(
      'bravo!',
    );
  });

  it('should refuse a ZIP64 extra field too short for the values it must carry', async () => {
    const blob = rawZip([{ name: 'a.txt', data: text('alpha'), zip64: true, shortZip64: true }]);

    expect(await refusal(readZipDirectory(blobRangeSource(blob)))).toBe('corrupt');
  });

  it('should refuse a directory larger than its entries can need, before reading it', async () => {
    const blob = rawZip([{ name: 'a.txt', data: text('alpha') }], { directoryPadding: 4096 });
    const read = vi.fn(blobRangeSource(blob).read);

    expect(await refusal(readZipDirectory({ size: blob.size, read }, { maximumPathBytes: 1024 }))).toBe('corrupt');
    /* The tail alone: the directory itself is never read. */
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('should refuse a name past the path limit as it parses', async () => {
    const blob = rawZip([{ name: `${'n'.repeat(150)}.txt`, data: text('x') }]);

    expect(await refusal(readZipDirectory(blobRangeSource(blob), { maximumPathBytes: 100 }))).toBe('pathTooLong');
  });

  it('should refuse two entries that share their bytes (an overlapping bomb)', async () => {
    const blob = rawZip([
      { name: 'a.txt', data: text('kernel') },
      { name: 'b.txt', data: text('kernel'), sameOffsetAs: 0 },
    ]);

    expect(await refusal(readZipDirectory(blobRangeSource(blob)))).toBe('corrupt');
  });

  it('should give a directory an identity its bytes decide', async () => {
    const one = await readZipDirectory(blobRangeSource(rawZip([{ name: 'a.txt', data: text('alpha') }])));
    const same = await readZipDirectory(blobRangeSource(rawZip([{ name: 'a.txt', data: text('alpha') }])));
    const other = await readZipDirectory(blobRangeSource(rawZip([{ name: 'a.txt', data: text('alphb') }])));

    expect(one.identity).toBe(same.identity);
    expect(one.identity).not.toBe(other.identity);
  });

  it('should refuse an encrypted entry', async () => {
    const stored = await zipOf({ a: 'secret' }, 'STORE');
    const bytes = new Uint8Array(await stored.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let at = 0; at < bytes.byteLength - 4; at += 1) {
      if (view.getUint32(at, true) === 0x02_01_4b_50) {
        view.setUint16(at + 8, view.getUint16(at + 8, true) | 1, true);
      }
    }

    expect(await refusal(readZipDirectory(blobRangeSource(new Blob([bytes]))))).toBe('encrypted');
  });
});

describe('decodeImportEntry', () => {
  it('should inflate a deflated entry and digest exactly its bytes in the same pass', async () => {
    const content = text('x'.repeat(10_000));
    const blob = await zipOf({ 'a.txt': content });
    const {
      entries: [entry],
    } = await readZipDirectory(blobRangeSource(blob));

    const decoded = await decodeImportEntry({ blob, path: 'a.txt', size: entry!.size, zip: entry! });

    expect(decoded.data).toEqual(content);
    expect(decoded.facts.blobOid).toBe(gitBlobOid(content));
    expect(decoded.facts.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(decoded.facts.contentKind).toBe('text');
  });

  it('should refuse an entry whose bytes inflate past the size its header declares (a lying bomb)', async () => {
    const blob = await zipOf({ 'a.txt': 'x'.repeat(10_000) });
    const {
      entries: [entry],
    } = await readZipDirectory(blobRangeSource(blob));

    expect(await refusal(decodeImportEntry({ blob, path: 'a.txt', size: 100, zip: entry! }))).toBe('corrupt');
  });

  it('should refuse an entry whose CRC does not match', async () => {
    const blob = await zipOf({ 'a.txt': 'hello' });
    const {
      entries: [entry],
    } = await readZipDirectory(blobRangeSource(blob));

    expect(
      await refusal(decodeImportEntry({ blob, path: 'a.txt', size: 5, zip: { ...entry!, crc32: entry!.crc32 ^ 1 } })),
    ).toBe('corrupt');
  });

  it('should refuse a file that changed size since it was listed', async () => {
    expect(await refusal(decodeImportEntry({ blob: new Blob([text('abc')]), path: 'a', size: 4 }))).toBe('corrupt');
  });

  it('should compute the zip CRC', () => {
    expect(crc32(text('123456789'))).toBe(0xcb_f4_39_26);
  });
});

describe('planImport', () => {
  it('should judge a zip from its directory: strip a shared top folder, skip repositories and caches', async () => {
    const blob = await zipOf({
      'repo/src/a.ts': 'a',
      'repo/.git/HEAD': 'ref',
      'repo/node_modules/x/i.js': 'x',
      'repo/tau.json': '{}',
      '__MACOSX/repo/._a.ts': 'fork',
    });

    const judged = await plan(zipImportSource(new File([blob], 'repo.zip')));

    expect(judged.name).toBe('repo');
    expect(judged.entries.map(({ path }) => path)).toEqual(['src/a.ts']);
    expect(judged.skipped).toEqual({ excluded: 2, reserved: 1, symlinks: 0 });
  });

  it('should skip a symbolic link and refuse a path that leaves the project', async () => {
    const linked = await zipOf({ 'a.txt': 'a', link: { content: '/etc/passwd', unixPermissions: 0o12_0777 } });

    const linkedPlan = await plan(zipImportSource(linked));

    expect(linkedPlan.skipped.symlinks).toBe(1);

    const slip = new JSZip();
    slip.file('../../evil.sh', 'boom');
    const bytes = await slip.generateAsync({ type: 'uint8array' });

    expect(await refusal(plan(zipImportSource(new Blob([bytes as Uint8Array<ArrayBuffer>]))))).toBe('unsafePath');
  });

  it('should refuse a ratio bomb and a size bomb by their declared sizes', async () => {
    const bomb = await zipOf({ 'zeros.bin': new Uint8Array(4 * 1024 * 1024) });

    expect(await refusal(plan(zipImportSource(bomb)))).toBe('ratioTooHigh');

    const large = await zipOf({ 'a.bin': new Uint8Array(2048) }, 'STORE');

    expect(await refusal(plan(zipImportSource(large), { ...importLimits, maximumFileBytes: 1024 }))).toBe(
      'fileTooLarge',
    );
    expect(await refusal(plan(zipImportSource(large), { ...importLimits, maximumArchiveBytes: 1024 }))).toBe(
      'archiveTooLarge',
    );
  });

  it('should refuse a source with too many entries, and one with nothing to import', async () => {
    const files = Array.from({ length: 4 }, (_, index) => ({ file: new Blob(['x']), path: `f${String(index)}` }));

    expect(await refusal(plan(fileListImportSource(files), { ...importLimits, maximumEntries: 3 }))).toBe(
      'tooManyEntries',
    );
    expect(await refusal(plan(fileListImportSource([{ file: new Blob(['x']), path: '.git/HEAD' }])))).toBe('empty');
  });

  it('should walk a directory handle without entering a pruned subtree', async () => {
    const entered: string[] = [];
    type FakeFile = { kind: 'file'; name: string; getFile: () => Promise<File> };
    type FakeDirectory = { kind: 'directory'; name: string; values: () => AsyncGenerator<FakeFile | FakeDirectory> };
    const directory = (name: string, children: Array<FakeDirectory | FakeFile>): FakeDirectory => ({
      kind: 'directory',
      name,
      async *values() {
        entered.push(name);
        yield* children;
      },
    });
    const file = (name: string, content: string): FakeFile => ({
      kind: 'file',
      name,
      getFile: async () => new File([content], name),
    });
    const root = directory('project', [
      file('main.ts', 'main'),
      directory('.git', [file('HEAD', 'ref')]),
      directory('src', [file('b.ts', 'b')]),
    ]);

    const judged = await plan(directoryHandleImportSource(root as unknown as FileSystemDirectoryHandle));

    expect(judged.name).toBe('project');
    expect(judged.entries.map(({ path }) => path)).toEqual(['main.ts', 'src/b.ts']);
    expect(entered).toEqual(['project', 'src']);
  });

  it('should never count what a picked folder holds under a left-behind folder', async () => {
    const files = [
      ...Array.from({ length: 5 }, (_, index) => ({
        file: new Blob(['x']),
        path: `gear/node_modules/dep/${String(index)}.js`,
      })),
      { file: new Blob(['a']), path: 'gear/a.ts' },
      { file: new Blob(['ref']), path: 'gear/.git/HEAD' },
    ];

    const judged = await plan(fileListImportSource(files), { ...importLimits, maximumEntries: 2 });

    expect(judged.entries.map(({ path }) => path)).toEqual(['a.ts']);
    expect(judged.pin.entries).toBe(1);
  });

  it('should walk dropped handles, files and folders side by side, without entering a pruned folder', async () => {
    const entered: string[] = [];
    const file = (name: string) => ({ kind: 'file', name, getFile: async () => new File([name], name) });
    const folder = (name: string, children: readonly unknown[]) => ({
      kind: 'directory',
      name,
      async *values() {
        entered.push(name);
        yield* children;
      },
    });
    const handles = [file('main.ts'), folder('lib', [file('b.ts')]), folder('node_modules', [file('x.js')])];

    const judged = await plan(handleListImportSource(handles as unknown as FileSystemHandle[]));

    expect(judged.entries.map(({ path }) => path)).toEqual(['main.ts', 'lib/b.ts']);
    expect(entered).toEqual(['lib']);
  });

  it('should pin a zip by its directory, so a same-named archive of other bytes is another source', async () => {
    const first = await plan(zipImportSource(await zipOf({ 'a.txt': 'one' }), { name: 'gear' }));
    const second = await plan(zipImportSource(await zipOf({ 'a.txt': 'two' }), { name: 'gear' }));

    expect(first.pin.identity).toBeDefined();
    expect(first.pin.identity).not.toBe(second.pin.identity);
  });

  it('should name a folder pick after its shared folder', async () => {
    const judged = await plan(
      fileListImportSource([
        { file: new Blob(['a']), path: 'gear/a.ts' },
        { file: new Blob(['b']), path: 'gear/lib/b.ts' },
      ]),
    );

    expect(judged.name).toBe('gear');
    expect(judged.entries.map(({ path }) => path)).toEqual(['a.ts', 'lib/b.ts']);
  });
});

describe('spoolImportArchive', () => {
  const streamOf = (chunks: Array<Uint8Array<ArrayBuffer>>) =>
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

  it('should refuse a declared size past the limit before reading, and bytes past it while streaming', async () => {
    const limits = { ...importLimits, maximumArchiveBytes: 4 };

    expect(await refusal(spoolImportArchive(streamOf([text('ab')]), { declaredSize: 5, limits }))).toBe(
      'archiveTooLarge',
    );
    expect(await refusal(spoolImportArchive(streamOf([text('abc'), text('de')]), { limits }))).toBe('archiveTooLarge');
  });

  it('should spool a download into a zip that reads by range', async () => {
    const archive = await zipOf({ 'a.txt': 'spooled' });
    const zip = new Uint8Array(await archive.arrayBuffer());

    const blob = await spoolImportArchive(streamOf([zip.subarray(0, 10), zip.subarray(10)]), {
      declaredSize: zip.byteLength,
    });

    const spooled = await plan(zipImportSource(blob, { kind: 'archive', name: 'r' }));

    expect(spooled.entries.map(({ path }) => path)).toEqual(['a.txt']);
  });

  it('should refuse a download that ends short of its declared size', async () => {
    expect(await refusal(spoolImportArchive(streamOf([text('ab')]), { declaredSize: 3 }))).toBe('corrupt');
  });
});

describe('stageImport', () => {
  const operationId = 'op_test';

  it('should write each file once under staging, record its facts, and hold no bytes in the ledger', async () => {
    const provider = new MemoryProvider();
    const staging = port(provider);
    const files = { 'p/a.ts': 'export const a = 1;\n', 'p/bin/b.bin': new Uint8Array([0, 1, 2, 3]) };
    const judged = await plan(zipImportSource(await zipOf(files)));

    const staged = await stageImport({ port: staging, operationId, plan: judged, decode: createInlineImportDecoder() });

    const directory = importStagingDirectory(operationId);

    expect(staged.entries.map(({ path, size }) => [path, size])).toEqual([
      ['a.ts', 20],
      ['bin/b.bin', 4],
    ]);
    expect(new TextDecoder().decode(await provider.readFile(`${directory}/tree/a.ts`))).toBe('export const a = 1;\n');
    expect(staged.entries[0]!.facts.blobOid).toBe(gitBlobOid(text('export const a = 1;\n')));
    expect(staged.entries[1]!.facts.contentKind).toBe('binary');
    /* Durable writes are the content once: one write per file, its bytes exactly. */
    expect(staging.writes()).toBe(2);
    expect(staging.writtenBytes()).toBe(24);
    const ledger = new TextDecoder().decode(await provider.readFile(`${directory}/ledger/000001.json`));

    expect(ledger).not.toContain('export const');
    expect(await readStagedImport(provider, operationId)).toMatchObject({ pin: judged.pin, bytes: 24 });
  });

  it('should batch by entry count and decode one batch ahead of the write', async () => {
    const provider = new MemoryProvider();
    const staging = port(provider);
    const files = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`f/${String(index)}.txt`, 'x']));
    const judged = await plan(zipImportSource(await zipOf(files)));

    await stageImport({ port: staging, operationId, plan: judged, decode: createInlineImportDecoder() });

    expect(await provider.readdir(`${importStagingDirectory(operationId)}/ledger`)).toEqual([
      '000001.json',
      '000002.json',
      '000003.json',
    ]);
  });

  it('should resume from staging after a crash, decoding only what no ledger record covers', async () => {
    const provider = new MemoryProvider();
    const files = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`f/${String(index)}.txt`, 'x']));
    const blob = await zipOf(files);
    const judged = await plan(zipImportSource(blob));
    const inline = createInlineImportDecoder();
    let decodes = 0;
    const crashing: ImportDecoder = async (request) => {
      decodes += 1;
      if (decodes > 280) {
        throw new Error('worker killed');
      }
      return inline(request);
    };

    await expect(stageImport({ port: port(provider), operationId, plan: judged, decode: crashing })).rejects.toThrow(
      'worker killed',
    );

    const counting = vi.fn(inline);
    const again = await plan(zipImportSource(blob));
    const staged = await stageImport({ port: port(provider), operationId, plan: again, decode: counting });

    expect(staged.entries).toHaveLength(300);
    expect(counting).toHaveBeenCalledTimes(300 - 256);
  });

  it('should start over when the source is not the one staged', async () => {
    const provider = new MemoryProvider();
    const first = await plan(zipImportSource(await zipOf({ 'a.txt': 'one' }), { name: 'one' }));
    await stageImport({ port: port(provider), operationId, plan: first, decode: createInlineImportDecoder() });

    const second = await plan(zipImportSource(await zipOf({ 'b.txt': 'two' }), { name: 'two' }));
    const staged = await stageImport({
      port: port(provider),
      operationId,
      plan: second,
      decode: createInlineImportDecoder(),
    });

    expect(staged.entries.map(({ path }) => path)).toEqual(['b.txt']);
    expect(await provider.exists(`${importStagingDirectory(operationId)}/tree/a.txt`)).toBe(false);
  });

  it('should restage an entry whose staged file lost its size', async () => {
    const provider = new MemoryProvider();
    const blob = await zipOf({ 'a.txt': 'hello' });
    await stageImport({
      port: port(provider),
      operationId,
      plan: await plan(zipImportSource(blob)),
      decode: createInlineImportDecoder(),
    });
    await provider.writeFile(`${importStagingDirectory(operationId)}/tree/a.txt`, 'he');
    const counting = vi.fn(createInlineImportDecoder());

    await stageImport({ port: port(provider), operationId, plan: await plan(zipImportSource(blob)), decode: counting });

    expect(counting).toHaveBeenCalledTimes(1);
  });

  it('should refuse as damaged what a worker judged corrupt, and discard staging on request', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'a.txt': 'hello' })));
    const corrupt: ImportDecoder = async () => {
      throw Object.assign(new Error('bad'), { name: 'CorruptBytesError' });
    };

    expect(await refusal(stageImport({ port: port(provider), operationId, plan: judged, decode: corrupt }))).toBe(
      'corrupt',
    );

    await discardStagedImport(port(provider), operationId);

    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should keep the reason a worker gave its refusal', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'a.txt': 'hello' })));
    const refusing: ImportDecoder = async () => {
      throw Object.assign(new Error('too big'), { workerErrorName: 'ImportRefusedError', reason: 'fileTooLarge' });
    };

    expect(await refusal(stageImport({ port: port(provider), operationId, plan: judged, decode: refusing }))).toBe(
      'fileTooLarge',
    );
  });

  it('should hold decoded bytes within its budget, or the one entry alone when it is larger', async () => {
    const provider = new MemoryProvider();
    const files = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`f/${String(index)}.bin`, 'x'.repeat(6)]),
    );
    const judged = await plan(zipImportSource(await zipOf(files)));
    const inline = createInlineImportDecoder();
    let live = 0;
    let peak = 0;
    const staging = port(provider);
    const decode: ImportDecoder = async (request, options) => {
      const decoded = await inline(request, options);
      live += decoded.data.byteLength;
      peak = Math.max(peak, live);
      return decoded;
    };
    const counted: ImportStagingPort = {
      provider,
      apply: async (entries) => {
        const receipts = await staging.apply(entries);
        for (const entry of entries) {
          if (entry.op === 'write' && entry.path.includes('/tree/')) {
            live -= entry.data instanceof Blob ? entry.data.size : entry.data.byteLength;
          }
        }
        return receipts;
      },
    };

    await stageImport({ port: counted, operationId, plan: judged, decode, residentBytes: 10 });

    expect(peak).toBe(6);
  });

  it('should stop every decode once one fails, and pass its signal to the decoder', async () => {
    const provider = new MemoryProvider();
    const files = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`f/${String(index)}.txt`, 'x']));
    const judged = await plan(zipImportSource(await zipOf(files)));
    const signals: AbortSignal[] = [];
    let started = 0;
    const decode: ImportDecoder = async (request, options) => {
      started += 1;
      signals.push(options!.signal!);
      if (request.path === '0.txt') {
        throw new Error('boom');
      }
      await new Promise<void>((resolve) => {
        options!.signal!.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      throw new Error('stopped');
    };

    await expect(
      stageImport({ port: port(provider), operationId, plan: judged, decode, concurrency: 4 }),
    ).rejects.toThrow('boom');

    expect(started).toBeLessThanOrEqual(4);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('should stop at an abort, and leave no decode running', async () => {
    const provider = new MemoryProvider();
    const files = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`f/${String(index)}.txt`, 'x']));
    const judged = await plan(zipImportSource(await zipOf(files)));
    const abort = new AbortController();
    const inline = createInlineImportDecoder();
    let decodes = 0;
    const decode: ImportDecoder = async (request, options) => {
      decodes += 1;
      if (decodes === 100) {
        abort.abort(new Error('cancelled'));
      }
      return inline(request, options);
    };

    await expect(
      stageImport({ port: port(provider), operationId, plan: judged, decode, signal: abort.signal }),
    ).rejects.toThrow('cancelled');
    const settled = decodes;
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(decodes).toBe(settled);
    expect(decodes).toBeLessThan(600);
  });

  it('should write straight into the project folder where a move would copy, and discard it with the staging', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'a', 'p/lib/b.ts': 'b' })));

    const staged = await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });

    expect(staged.inPlace).toBe('gear');
    expect(new TextDecoder().decode(await provider.readFile('gear/lib/b.ts'))).toBe('b');
    expect(await provider.exists(`${importStagingDirectory(operationId)}/tree`)).toBe(false);
    const reread = await readStagedImport(provider, operationId);
    expect(reread?.tree).toBe('gear');

    await discardStagedImport(port(provider), operationId);

    expect(await provider.exists('gear')).toBe(false);
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should stage under its own folder where a move is free, and refuse an in-place folder that exists', async () => {
    const moving = new MemoryProvider();
    Object.defineProperty(moving, 'capabilities', { value: { ...moving.capabilities, movesInPlace: true } });
    const judged = await plan(zipImportSource(await zipOf({ 'a.ts': 'a' })));

    const staged = await stageImport({
      port: port(moving),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });

    expect(staged.inPlace).toBeUndefined();
    expect(await moving.exists('gear')).toBe(false);

    const copying = new MemoryProvider();
    await copying.writeFile('gear/keep.txt', 'mine');

    await expect(
      stageImport({
        port: port(copying),
        operationId,
        plan: judged,
        decode: createInlineImportDecoder(),
        target: 'gear',
      }),
    ).rejects.toThrow('already exists');
    expect(new TextDecoder().decode(await copying.readFile('gear/keep.txt'))).toBe('mine');
  });

  it('should refuse an operation id that is not a plain token', () => {
    expect(() => importStagingDirectory('../x')).toThrow(TypeError);
  });
});

describe('sweepStagedImports', () => {
  const stageOne = async (provider: MemoryProvider, operationId: string, target?: string): Promise<void> => {
    const judged = await plan(zipImportSource(await zipOf({ [`${operationId}.ts`]: 'x' })));
    await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      ...(target === undefined ? {} : { target }),
    });
  };
  const later = (): number => Date.now() + importStagingStaleMilliseconds + 1000;

  it('should remove only the stagings nothing owns, holds or wrote lately', async () => {
    const provider = new MemoryProvider();
    for (const operationId of ['owned', 'held', 'orphan']) {
      // oxlint-disable-next-line no-await-in-loop -- three stagings, one after another.
      await stageOne(provider, operationId);
    }
    await provider.writeFile('.tau-staging/other-owner/x', 'not an import');

    const fresh = await sweepStagedImports({
      port: port(provider),
      owned: new Set(['owned']),
      held: new Set(['held']),
    });

    expect(fresh.removed).toEqual([]);

    const stale = await sweepStagedImports({
      port: port(provider),
      owned: new Set(['owned']),
      held: new Set(['held']),
      now: later(),
    });

    expect(stale).toEqual({ removed: ['orphan'], kept: ['held', 'owned'] });
    expect(await provider.exists(importStagingDirectory('orphan'))).toBe(false);
    expect(await provider.exists(importStagingDirectory('owned'))).toBe(true);
    expect(await provider.exists('.tau-staging/other-owner/x')).toBe(true);
  });

  it("should take an in-place staging's folder with it, unless the commit made that folder a project", async () => {
    const provider = new MemoryProvider();
    await stageOne(provider, 'abandoned', 'left');
    await stageOne(provider, 'committed', 'kept');
    await provider.writeFile('kept/tau.json', '{}');

    await sweepStagedImports({ port: port(provider), owned: new Set(), now: later() });

    expect(await provider.exists('left')).toBe(false);
    expect(await provider.exists('kept/committed.ts')).toBe(true);
    expect(await provider.exists(importStagingDirectory('committed'))).toBe(false);
  });
});
