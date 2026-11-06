/**
 * The derived calls' own edges, below the transport: what the conformance
 * suite's real authority never produces — a directory row in the index, a file
 * gone between the index and the read, a handler set that answers a query
 * itself — and the long-call binding each derived call is handed.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ChangesetReceipt } from '@taucad/filesystem';
import type { BridgeServerLongCall, StringKeyedObject } from '@taucad/rpc/bridge';
import type { FileStatEntry } from '@taucad/types';
import { bindFileSystemLongCall, withHostContentCalls } from '#filesystem-bridge-host-calls.js';
import { prepareApplyCall, rangeStream, receiptFromWire } from '#filesystem-bridge-client-calls.js';
import type { GrepResult, IndexStats } from '#filesystem-bridge-protocol.js';
import { nodeGrepMatcherWorker } from '#filesystem-bridge-rooted.test-fixture.js';

const encoder = new TextEncoder();

const file = (path: string, size = 1): FileStatEntry => ({
  path,
  name: path.split('/').at(-1)!,
  type: 'file',
  size,
  mtimeMs: 0,
  contentKind: 'text',
  lineCount: 1,
});

type Derived = {
  glob(pattern: string, options?: Record<string, unknown>): Promise<FileStatEntry[]>;
  grep(pattern: string, options?: Record<string, unknown>): Promise<GrepResult>;
  indexStats(path: string): Promise<IndexStats>;
  apply(changeset: Record<string, unknown>): Promise<ChangesetReceipt>;
};

const served = (handlers: StringKeyedObject): Derived =>
  withHostContentCalls(handlers, { grepMatcherWorker: nodeGrepMatcherWorker }) as unknown as Derived;

const codedError = (code: string): Error => Object.assign(new Error(code), { code });

describe('derived index calls', () => {
  it('count and match file rows only, should the index answer a directory row', async () => {
    const handlers = served({
      readFile: async () => encoder.encode('x'),
      statTree: async () => [{ path: 'lib', name: 'lib', type: 'dir', size: 0, mtimeMs: 0 }, file('lib/a.ts')],
    });
    await expect(handlers.indexStats('')).resolves.toEqual({
      files: 1,
      bytes: 1,
      textFiles: 1,
      binaryFiles: 0,
      lines: 1,
    });
    const rows = await handlers.glob('*');
    expect(rows.map((row) => row.path)).toEqual(['lib/a.ts']);
  });

  it("serve a handler set's own glob, grep and indexStats instead of deriving them", async () => {
    const statTree = vi.fn();
    const own = { glob: vi.fn(async () => []), grep: vi.fn(async () => ({})), indexStats: vi.fn(async () => ({})) };
    const handlers = served({ readFile: vi.fn(), statTree, ...own });
    await handlers.glob('*.ts');
    await handlers.grep('x');
    await handlers.indexStats('');
    expect(own.glob).toHaveBeenCalledWith('*.ts');
    expect(own.grep).toHaveBeenCalledWith('x');
    expect(own.indexStats).toHaveBeenCalledWith('');
    expect(statTree).not.toHaveBeenCalled();
  });

  it('derive no index query where the handler set has no index', () => {
    const handlers = served({ readFile: vi.fn() }) as Partial<Derived>;
    expect(handlers.glob).toBeUndefined();
    expect(handlers.grep).toBeUndefined();
    expect(handlers.indexStats).toBeUndefined();
  });

  it('leave a handler set that reads nothing as it is', () => {
    const handlers = { statTree: vi.fn() };
    expect(withHostContentCalls(handlers)).toBe(handlers);
  });
});

describe('derived grep', () => {
  it('refuses a pattern with ENOTSUP where the host has no worker to bound it in, and still answers a literal', async () => {
    const handlers = withHostContentCalls({
      readFile: async () => encoder.encode('needle'),
      statTree: async () => [file('a.ts')],
    }) as unknown as Derived;
    await expect(handlers.grep('nee+dle')).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(handlers.grep('needle', { fixedStrings: true })).resolves.toMatchObject({
      matches: [{ path: 'a.ts' }],
    });
  });

  it('counts a file gone between the index and the read as skipped, not searched', async () => {
    const handlers = served({
      async readFile(path: string) {
        if (path === 'gone.ts') {
          throw codedError('ENOENT');
        }
        return encoder.encode('needle');
      },
      statTree: async () => [file('gone.ts'), file('here.ts')],
    });
    await expect(handlers.grep('needle')).resolves.toMatchObject({
      matches: [{ path: 'here.ts' }],
      filesSearched: 1,
      filesSkipped: 1,
      truncated: false,
    });
  });

  it('fails on a read error that is not an absence', async () => {
    const handlers = served({
      readFile: async () => {
        throw codedError('EIO');
      },
      statTree: async () => [file('a.ts')],
    });
    await expect(handlers.grep('x')).rejects.toMatchObject({ code: 'EIO' });
  });

  it('stops reading once the finished files hold the cap, and says the result is truncated', async () => {
    const readFile = vi.fn(async () => encoder.encode('needle'));
    const rows = Array.from({ length: 12 }, (_, index) => file(`f${String(index).padStart(2, '0')}.ts`));
    const handlers = served({ readFile, statTree: async () => rows });
    const result = await handlers.grep('needle', { maxResults: 1 });
    expect(result.matches).toEqual([{ path: 'f00.ts', line: 1, column: 1, text: 'needle' }]);
    expect(result.truncated).toBe(true);
    // Eight lanes start before any finishes; the four files after them are never read.
    expect(readFile).toHaveBeenCalledTimes(8);
    expect(result.filesSearched).toBe(8);
  });
});

describe('derived apply', () => {
  it('refuses with ENOTSUP where the handler set applies no changeset', async () => {
    await expect(served({ readFile: vi.fn() }).apply({ entries: [] })).rejects.toMatchObject({ code: 'ENOTSUP' });
  });

  it("carries an entry's error as data, whatever was thrown", async () => {
    const handlers = served({
      readFile: vi.fn(),
      apply: async (): Promise<ChangesetReceipt> => ({
        entries: [
          { index: 0, outcome: 'failed', error: 'refused' },
          { index: 1, outcome: 'failed', error: new TypeError('bad entry') },
          { index: 2, outcome: 'applied' },
        ],
        applied: 1,
        failed: 2,
        uncertain: 0,
        skipped: 0,
        state: 'partially-applied',
      }),
    });
    const receipt = await handlers.apply({ entries: [] });
    expect(receipt.entries).toEqual([
      { index: 0, outcome: 'failed', error: { name: 'Error', message: 'refused' } },
      { index: 1, outcome: 'failed', error: { name: 'TypeError', message: 'bad entry' } },
      { index: 2, outcome: 'applied' },
    ]);
  });
});

describe('long-call binding', () => {
  const longCall: BridgeServerLongCall = { signal: new AbortController().signal, onProgress: vi.fn() };

  it("merges the controls into a derived call's options, padding a missing one", () => {
    expect(bindFileSystemLongCall('glob', ['*.ts'], longCall)).toEqual(['*.ts', longCall]);
    expect(bindFileSystemLongCall('grep', ['x', { context: 2 }], longCall)).toEqual(['x', { context: 2, ...longCall }]);
    expect(bindFileSystemLongCall('readMany', [], longCall)).toEqual([undefined, longCall]);
  });

  it("puts apply's signal on the changeset and leaves other calls as they are", () => {
    expect(bindFileSystemLongCall('apply', [{ entries: [] }], longCall)).toEqual([
      { entries: [], signal: longCall.signal },
    ]);
    expect(bindFileSystemLongCall('stat', ['a.ts'], longCall)).toEqual(['a.ts']);
  });
});

describe('caller-side calls', () => {
  it("keeps a changeset's lifecycle and sends no controls when there is no signal", async () => {
    await expect(prepareApplyCall([{ entries: [], lifecycle: true }])).resolves.toEqual({
      args: [{ entries: [], lifecycle: true }],
    });
  });

  it('stands an entry error without a code back up as a plain Error', () => {
    const receipt = receiptFromWire({
      entries: [{ index: 0, outcome: 'failed', error: { name: 'TypeError', message: 'bad' } }],
      applied: 0,
      failed: 1,
      uncertain: 0,
      skipped: 0,
      state: 'known-not-applied',
    });
    const error = receipt.entries[0]?.error;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'TypeError', message: 'bad' });
    expect(error).not.toHaveProperty('code');
  });

  it('ends a zero-length stream without reading', async () => {
    const readRange = vi.fn();
    const reader = rangeStream(readRange, { length: 0 }).getReader();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(readRange).not.toHaveBeenCalled();
  });
});
