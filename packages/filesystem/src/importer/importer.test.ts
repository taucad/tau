/* oxlint-disable no-bitwise -- the tests flip zip flag and CRC bits. */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { applyBatchWithPrimitives } from '#backend/batch.js';
import type { BatchEntry } from '#changeset.js';
import { inHandBytes } from '#changeset.js';
import { tauPathPolicy } from '#path-registry.js';
import { ImportRefusedError, importLimits } from '#importer/limits.js';
import { readZipDirectory, blobRangeSource } from '#importer/zip.js';
import {
  createInlineImportDecoder,
  createInlineImportMeasurer,
  decodeImportEntry,
  importMeasureMaximumBytes,
  measureImportBytes,
  readImportEntry,
} from '#importer/decode.js';
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
  importOwnerPath,
  importStagingDirectory,
  importStagingStaleMilliseconds,
  ownsImportTarget,
  readStagedImport,
  releaseStagedImport,
  stageImport,
  sweepStagedImports,
  touchStagedImport,
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
  /** Declare this many extra-field bytes in the local header without writing them, so its data seems to start later. */
  localExtra?: number;
  /** The stored name's exact bytes, in place of `name` encoded as UTF-8. */
  nameBytes?: Uint8Array<ArrayBuffer>;
  /** General-purpose flags for the central record (bit 11: the name is UTF-8). */
  flags?: number;
  /** A central extra field, in place of the ZIP64 one. */
  extra?: Uint8Array<ArrayBuffer>;
}>;

/* A stored zip written field by field, for archives JSZip never writes: ZIP64 records, shared ranges, padded directories. */
const rawZip = (entries: readonly RawEntry[], options: Readonly<{ directoryPadding?: number }> = {}): Blob => {
  const encoder = new TextEncoder();
  const locals: Array<Uint8Array<ArrayBuffer>> = [];
  const offsets: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = entry.nameBytes ?? encoder.encode(entry.name);
    const local = new Uint8Array(30 + name.byteLength + entry.data.byteLength);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04_03_4b_50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(entry.data), true);
    view.setUint32(18, entry.data.byteLength, true);
    view.setUint32(22, entry.data.byteLength, true);
    view.setUint16(26, name.byteLength, true);
    view.setUint16(28, entry.localExtra ?? 0, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.byteLength);
    offsets.push(offset);
    locals.push(local);
    offset += local.byteLength;
  }
  const centrals: Array<Uint8Array<ArrayBuffer>> = [];
  for (const [index, entry] of entries.entries()) {
    const name = entry.nameBytes ?? encoder.encode(entry.name);
    const localOffset = offsets[entry.sameOffsetAs ?? index]!;
    const extra =
      entry.extra ?? (entry.zip64 === true ? new Uint8Array(entry.shortZip64 === true ? 12 : 28) : new Uint8Array(0));
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
    view.setUint16(8, entry.flags ?? 0, true);
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
          writtenBytes += inHandBytes(entry);
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

    /* A limit an import sets, not damage: the reason says so. */
    expect(await refusal(readZipDirectory({ size: blob.size, read }, { maximumPathBytes: 1024 }))).toBe(
      'archiveTooLarge',
    );
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

  it("should refuse an entry whose local header's name and extra field carry its data into the next entry", async () => {
    const blob = rawZip([
      { name: 'a.txt', data: text('kernel'), localExtra: 4 },
      { name: 'b.txt', data: text('other!') },
    ]);
    /* The directory alone sees no overlap: the fixed header and the data fit before the next entry. */
    const { entries } = await readZipDirectory(blobRangeSource(blob));
    const [first, second] = entries;

    expect(first!.extentEnd).toBe(second!.localHeaderOffset);
    await expect(decodeImportEntry({ blob, path: 'a.txt', size: first!.size, zip: first! })).rejects.toThrow(
      'overlaps the next one',
    );
  });

  it('should read an unflagged name as CP437 unless it is valid UTF-8, and a flagged one as UTF-8', async () => {
    const blob = rawZip([
      /* "Ärger.txt" as DOS wrote it: 0x8e is Ä in CP437 and no valid UTF-8. */
      { name: '', nameBytes: new Uint8Array([0x8e, ...text('rger.txt')]), data: text('a') },
      /* The macOS archiver: UTF-8 without the flag. */
      { name: 'café.txt', data: text('b') },
      { name: 'flagged-é.txt', data: text('c'), flags: 0x08_00 },
    ]);

    const { entries } = await readZipDirectory(blobRangeSource(blob));

    expect(entries.map(({ name }) => name)).toEqual(['Ärger.txt', 'café.txt', 'flagged-é.txt']);
  });

  it('should take an Info-ZIP Unicode Path field only when its CRC names the stored bytes', async () => {
    const stored = new Uint8Array([0x84, ...text('.txt')]);
    const unicodeField = (crc: number): Uint8Array<ArrayBuffer> => {
      const unicode = text('ü-unicode.txt');
      const field = new Uint8Array(4 + 5 + unicode.byteLength);
      const view = new DataView(field.buffer);
      view.setUint16(0, 0x70_75, true);
      view.setUint16(2, 5 + unicode.byteLength, true);
      view.setUint8(4, 1);
      view.setUint32(5, crc, true);
      field.set(unicode, 9);
      return field;
    };
    const blob = rawZip([
      { name: '', nameBytes: stored, data: text('a'), extra: unicodeField(crc32(stored)) },
      { name: '', nameBytes: new Uint8Array([0x84, ...text('2.txt')]), data: text('b'), extra: unicodeField(1) },
    ]);

    const { entries } = await readZipDirectory(blobRangeSource(blob));

    expect(entries.map(({ name }) => name)).toEqual(['ü-unicode.txt', 'ä2.txt']);
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
  it('should inflate a deflated entry, checked by its CRC, and hash nothing', async () => {
    const content = text('x'.repeat(10_000));
    const blob = await zipOf({ 'a.txt': content });
    const {
      entries: [entry],
    } = await readZipDirectory(blobRangeSource(blob));
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    const decoded = await decodeImportEntry({ blob, path: 'a.txt', size: entry!.size, zip: entry! });

    expect(decoded.data).toEqual(content);
    expect(Object.keys(decoded)).toStrictEqual(['data']);
    expect(digest).not.toHaveBeenCalled();
    digest.mockRestore();
  });

  it("should measure a read-back's blob id, SHA-256 and kind, one digest call each", async () => {
    const content = text('x'.repeat(10_000));
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    const facts = await measureImportBytes(content, content.byteLength);

    expect(facts.blobOid).toBe(gitBlobOid(content));
    expect(facts.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(facts.contentKind).toBe('text');
    expect(facts.size).toBe(content.byteLength);
    expect(digest).toHaveBeenCalledTimes(2);
    digest.mockRestore();
  });

  it('should refuse to measure more than one shot admits', async () => {
    /* A length past the limit, without allocating it. */
    const tooLarge = Object.defineProperty(new Uint8Array(1), 'byteLength', { value: importMeasureMaximumBytes + 1 });

    await expect(measureImportBytes(tooLarge, tooLarge.byteLength)).rejects.toThrow(RangeError);
  });

  it('should refuse to measure bytes lost on the way (a detached buffer), never answering the empty blob', async () => {
    const bytes = text('cube(1);');
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });

    expect(bytes.byteLength).toBe(0);
    await expect(measureImportBytes(bytes, 8)).rejects.toThrow(/lost on the way/u);
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

  it('should import only a chosen folder of an archive, as the project root, and pin it', async () => {
    const source = zipImportSource(
      await zipOf({
        'repo-abc/README.md': 'r',
        'repo-abc/parts/gear/main.scad': 'g',
        'repo-abc/parts/gear/lib/a.scad': 'a',
      }),
    );

    const judged = await planImport(source, { policy: tauPathPolicy, root: 'parts/gear' });

    expect(judged.entries.map(({ path }) => path).toSorted()).toEqual(['lib/a.scad', 'main.scad']);
    expect(judged.pin.root).toBe('parts/gear');
    expect(await refusal(planImport(source, { policy: tauPathPolicy, root: 'missing' }))).toBe('empty');
  });

  it('should find a root that is the only folder an archive holds', async () => {
    const source = zipImportSource(await zipOf({ 'repo-abc/gear/main.scad': 'g', 'repo-abc/gear/b.scad': 'b' }));

    const judged = await planImport(source, { policy: tauPathPolicy, root: 'gear' });

    expect(judged.entries.map(({ path }) => path).toSorted()).toEqual(['b.scad', 'main.scad']);
  });

  it('should resolve a root from the top folder, not from every shared folder', async () => {
    const source = zipImportSource(await zipOf({ 'repo-abc/a/a/x.scad': 'x', 'repo-abc/a/y.scad': 'y' }));

    const judged = await planImport(source, { policy: tauPathPolicy, root: 'a' });

    expect(judged.entries.map(({ path }) => path).toSorted()).toEqual(['a/x.scad', 'y.scad']);
  });

  it.each(['.', '', './'])('should import the whole repository for root %j', async (root) => {
    const source = zipImportSource(await zipOf({ 'repo-abc/main.scad': 'm', 'repo-abc/lib/b.scad': 'b' }));

    const judged = await planImport(source, { policy: tauPathPolicy, root });

    expect(judged.entries.map(({ path }) => path).toSorted()).toEqual(['lib/b.scad', 'main.scad']);
    expect(judged.pin.root).toBeUndefined();
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

  /* A store that lands other bytes than it was handed for `a.ts`: the same size, or one byte short. */
  const landing = (provider: MemoryProvider, landed: string): ImportStagingPort => ({
    provider,
    apply: async (entries: readonly BatchEntry[]) =>
      applyBatchWithPrimitives(
        provider,
        entries.map((entry) =>
          entry.op === 'write' && entry.path.endsWith('/tree/a.ts') ? { ...entry, data: text(landed) } : entry,
        ),
      ),
  });

  it('should record the facts of the bytes that landed, read back, not of those it decoded (EQ6)', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'right', 'p/b.ts': 'b' })));

    const staged = await stageImport({
      port: landing(provider, 'wrong'),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
    });

    expect(staged.entries[0]!.facts.blobOid).toBe(gitBlobOid(text('wrong')));
    expect(staged.entries[0]!.facts.blobOid).not.toBe(gitBlobOid(text('right')));
  });

  it('should refuse a measure that answers another size than the file was written at', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'right' })));
    const inline = createInlineImportMeasurer();

    const refused = stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      measure: async (bytes, expected) => ({ ...(await inline(bytes, expected)), size: 0 }),
    });

    await expect(refused).rejects.toThrow(/measured at 0 bytes/u);
  });

  it('should read a file again when the measurer died holding its bytes, and record the real facts', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'right' })));
    const inline = createInlineImportMeasurer();
    let calls = 0;

    const staged = await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      measure: async (bytes, expected) => {
        calls += 1;
        if (calls === 1) {
          /* As a worker that died after the bytes were transferred to it. */
          structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
          throw Object.assign(new Error('The compute worker stopped.'), { name: 'ComputeWorkerCrashedError' });
        }
        return inline(bytes, expected);
      },
    });

    expect(calls).toBe(2);
    expect(staged.entries[0]!.facts.blobOid).toBe(gitBlobOid(text('right')));
    expect(staged.entries[0]!.facts).not.toHaveProperty('size');
  });

  it('should keep reading a file again while a worker that never loads dies with its bytes, until one measures it', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'right' })));
    const inline = createInlineImportMeasurer();
    let calls = 0;

    const staged = await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      measure: async (bytes, expected) => {
        calls += 1;
        if (calls <= 4) {
          /* As a supervisor whose worker dies on every spawn until it gives up and measures inline. */
          structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
          throw Object.assign(new Error('The compute worker stopped.'), { name: 'ComputeWorkerCrashedError' });
        }
        return inline(bytes, expected);
      },
    });

    expect(calls).toBe(5);
    expect(staged.entries[0]!.facts.blobOid).toBe(gitBlobOid(text('right')));
  });

  it('should fail an import whose measurer keeps dying past its retries', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'right' })));
    let calls = 0;

    await expect(
      stageImport({
        port: port(provider),
        operationId,
        plan: judged,
        decode: createInlineImportDecoder(),
        measure: async () => {
          calls += 1;
          throw Object.assign(new Error('The compute worker stopped.'), { name: 'ComputeWorkerCrashedError' });
        },
      }),
    ).rejects.toThrow(/compute worker stopped/u);
    expect(calls).toBe(6);
  });

  it('should refuse a staged file that reads back at another size than it was written', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'right', 'p/b.ts': 'b' })));

    expect(
      await refusal(
        stageImport({
          port: landing(provider, 'righ'),
          operationId,
          plan: judged,
          decode: createInlineImportDecoder(),
        }),
      ),
    ).toBe('corrupt');
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
            live -= inHandBytes(entry);
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

  it('should stage under its own folder where a move is free, and take the next free name for an in-place folder', async () => {
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
    expect(staged.target).toBe('gear');
    expect(await moving.exists('gear')).toBe(false);

    /* Staged to move, the commit creates the folder: a name a plain folder holds is passed over too. */
    await moving.writeFile('gear/keep.txt', 'mine');
    const again = await stageImport({
      port: port(moving),
      operationId: 'op_moving',
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });

    expect(again.target).toBe('gear-2');

    const copying = new MemoryProvider();
    await copying.writeFile('gear/keep.txt', 'mine');

    const suffixed = await stageImport({
      port: port(copying),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });

    /* A folder someone else holds is never written into: the import takes `gear-2`. */
    expect(suffixed.inPlace).toBe('gear-2');
    expect(suffixed.target).toBe('gear-2');
    expect(await copying.readdir('gear')).toEqual(['keep.txt']);
    expect(new TextDecoder().decode(await copying.readFile('gear-2/a.ts'))).toBe('a');
    expect(await ownsImportTarget(copying, 'gear-2', operationId)).toBe(true);
  });

  it('should claim an in-place folder, and write every batch into it, under the directory lock', async () => {
    const provider = new MemoryProvider();
    const files = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`${String(index)}.txt`, 'x']));
    const judged = await plan(zipImportSource(await zipOf(files)));
    const locked: string[] = [];
    let holding = false;
    const base = port(provider);
    const staging: ImportStagingPort = {
      ...base,
      apply: async (entries) => {
        if (entries.some((entry) => entry.op === 'write' && entry.path.startsWith('gear/'))) {
          expect(holding).toBe(true);
        }
        return base.apply(entries);
      },
      exclusive: async (path, work) => {
        locked.push(path);
        holding = true;
        try {
          return await work();
        } finally {
          holding = false;
        }
      },
    };

    await stageImport({
      port: staging,
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });

    /* The claim, then each of the two batches. */
    expect(locked).toEqual(['gear', 'gear', 'gear']);
  });

  it('should stop writing into an in-place folder whose owner marker stops naming the import', async () => {
    const provider = new MemoryProvider();
    const files = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`${String(index)}.txt`, 'x']));
    const judged = await plan(zipImportSource(await zipOf(files)));
    const inline = createInlineImportDecoder();
    let decodes = 0;
    const decode: ImportDecoder = async (request, options) => {
      decodes += 1;
      if (decodes === 257) {
        /* Someone else takes the folder between the first batch and the second. */
        await provider.writeFile(`gear/${importOwnerPath}`, JSON.stringify({ operationId: 'someone_else' }));
      }
      return inline(request, options);
    };

    await expect(
      stageImport({ port: port(provider), operationId, plan: judged, decode, target: 'gear' }),
    ).rejects.toThrow('no longer belongs to this import');
    expect(await provider.exists('gear/299.txt')).toBe(false);
  });

  it('should discard only what its ledger wrote into the folder, and leave a file anyone else put there', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'p/a.ts': 'a', 'p/lib/b.ts': 'b' })));
    await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });
    await provider.writeFile('gear/lib/notes.txt', 'mine');

    await discardStagedImport(port(provider), operationId);

    expect(await provider.exists('gear/a.ts')).toBe(false);
    expect(await provider.exists('gear/lib/b.ts')).toBe(false);
    expect(await provider.exists(`gear/${importOwnerPath}`)).toBe(false);
    expect(new TextDecoder().decode(await provider.readFile('gear/lib/notes.txt'))).toBe('mine');
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should leave a folder whose owner marker names another operation whole', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'a.ts': 'a' })));
    await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });
    await provider.writeFile(`gear/${importOwnerPath}`, JSON.stringify({ operationId: 'someone_else' }));

    await discardStagedImport(port(provider), operationId);

    expect(await provider.exists('gear/a.ts')).toBe(true);
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should remove the files of a batch it announced but never recorded', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'a.ts': 'a' })));
    const base = port(provider);
    /* The batch lands, then the tab dies before its ledger record. */
    const crashing: ImportStagingPort = {
      ...base,
      apply: async (entries) => {
        if (entries.some((entry) => entry.op === 'write' && /ledger\/\d+\.json$/u.test(entry.path))) {
          throw new Error('closed');
        }
        return base.apply(entries);
      },
    };
    await expect(
      stageImport({ port: crashing, operationId, plan: judged, decode: createInlineImportDecoder(), target: 'gear' }),
    ).rejects.toThrow('closed');
    expect(await provider.exists('gear/a.ts')).toBe(true);

    await discardStagedImport(port(provider), operationId);

    expect(await provider.exists('gear')).toBe(false);
  });

  it('should let go of its folder on release, so no later discard touches the project', async () => {
    const provider = new MemoryProvider();
    const judged = await plan(zipImportSource(await zipOf({ 'a.ts': 'a' })));
    await stageImport({
      port: port(provider),
      operationId,
      plan: judged,
      decode: createInlineImportDecoder(),
      target: 'gear',
    });

    await releaseStagedImport(port(provider), operationId);

    const released = await readStagedImport(provider, operationId);
    expect(released?.inPlace).toBeUndefined();
    expect(await provider.exists(`gear/${importOwnerPath}`)).toBe(false);

    await discardStagedImport(port(provider), operationId);

    expect(await provider.exists('gear/a.ts')).toBe(true);
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

  it('should judge stillness by the times its records carry where the provider keeps no mtime', async () => {
    const provider = new MemoryProvider();
    /* IndexedDB answers a stat with an mtime of 0. */
    const stat = provider.stat.bind(provider);
    vi.spyOn(provider, 'stat').mockImplementation(async (path) => ({ ...(await stat(path)), mtimeMs: 0 }));
    await stageOne(provider, 'fresh');

    const now = await sweepStagedImports({ port: port(provider), owned: new Set() });

    expect(now).toEqual({ removed: [], kept: ['fresh'] });

    const after = await sweepStagedImports({ port: port(provider), owned: new Set(), now: later() });

    expect(after).toEqual({ removed: ['fresh'], kept: [] });
  });

  it('should keep a staging whose session still beats, where no lock can say it is live', async () => {
    const provider = new MemoryProvider();
    await stageOne(provider, 'beating');
    const at = later();
    await touchStagedImport(port(provider), 'beating', at);

    const swept = await sweepStagedImports({ port: port(provider), owned: new Set(), now: at + 1000 });

    expect(swept.kept).toEqual(['beating']);
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
