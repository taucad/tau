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
import { createInlineImportDecoder, crc32, decodeImportEntry } from '#importer/decode.js';
import type { ImportDecoder } from '#importer/decode.js';
import {
  directoryHandleImportSource,
  fileListImportSource,
  planImport,
  spoolImportArchive,
  zipImportSource,
} from '#importer/sources.js';
import { discardStagedImport, importStagingDirectory, readStagedImport, stageImport } from '#importer/staging.js';
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

    const entries = await readZipDirectory({ size: blob.size, read });

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
    const [entry] = await readZipDirectory(blobRangeSource(blob));

    const decoded = await decodeImportEntry({ blob, path: 'a.txt', size: entry!.size, zip: entry! });

    expect(decoded.data).toEqual(content);
    expect(decoded.facts.blobOid).toBe(gitBlobOid(content));
    expect(decoded.facts.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(decoded.facts.contentKind).toBe('text');
  });

  it('should refuse an entry whose bytes inflate past the size its header declares (a lying bomb)', async () => {
    const blob = await zipOf({ 'a.txt': 'x'.repeat(10_000) });
    const [entry] = await readZipDirectory(blobRangeSource(blob));

    expect(await refusal(decodeImportEntry({ blob, path: 'a.txt', size: 100, zip: entry! }))).toBe('corrupt');
  });

  it('should refuse an entry whose CRC does not match', async () => {
    const blob = await zipOf({ 'a.txt': 'hello' });
    const [entry] = await readZipDirectory(blobRangeSource(blob));

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

  it('should refuse an operation id that is not a plain token', () => {
    expect(() => importStagingDirectory('../x')).toThrow(TypeError);
  });
});
