/**
 * `captureRevisionTree` — the one walk a revision is recorded from.
 *
 * These are the capture claims of the deleted `materialized-workspace.test.ts`,
 * moved with the function (W3d): what a vanished entry does to a walk, what the
 * caller reserves, what the concurrency and byte bounds hold, and what a
 * cancelled or failing stream leaves behind.
 */

import { ImmutableRevisionTree } from '@taucad/revisions/algorithms';
import { describe, expect, it, vi } from 'vitest';
import { captureRevisionTree, createCaptureMemo } from '#algorithms/revision-capture.js';
import type { RevisionCaptureFileSystem } from '#algorithms/revision-capture.js';
import type { DirectoryEntry, FileStat, FileStatEntry } from '@taucad/filesystem';
import { createMemoryProvider } from '@taucad/filesystem/backend';

/**
 * A real filesystem can drop an entry between `readdir` and the `stat` that
 * follows it — an atomic write's temp file is renamed away, a sweep removes a
 * workspace directory. `vanishing` reproduces that: every listed name in
 * `missing` is gone by the time the walker asks about it.
 */
const vanishingFileSystem = (
  entries: Readonly<Record<string, readonly string[] | string>>,
  missing: ReadonlySet<string>,
): RevisionCaptureFileSystem => {
  const enoent = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const encoder = new TextEncoder();
  return {
    readFile: (async (path: string) => {
      if (missing.has(path)) {
        throw enoent(path);
      }
      const value = entries[path];
      if (typeof value !== 'string') {
        throw enoent(path);
      }
      return encoder.encode(value);
    }) as RevisionCaptureFileSystem['readFile'],
    readFileStream: (path: string) =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          if (missing.has(path)) {
            throw enoent(path);
          }
          const value = entries[path];
          if (typeof value !== 'string') {
            throw enoent(path);
          }
          controller.enqueue(encoder.encode(value));
          controller.close();
        },
      }),
    readdir: async (path: string): Promise<string[]> => {
      if (missing.has(path)) {
        throw enoent(path);
      }
      const value = entries[path];
      if (typeof value !== 'object') {
        throw enoent(path);
      }
      return [...value];
    },
    stat: async (path: string): Promise<FileStat> => {
      if (missing.has(path)) {
        throw enoent(path);
      }
      const value = entries[path];
      if (value === undefined) {
        throw enoent(path);
      }
      return typeof value === 'string'
        ? { type: 'file', size: value.length, mtimeMs: 0, contentKind: 'text', lineCount: 1 }
        : { type: 'dir', size: 0, mtimeMs: 0 };
    },
  };
};

describe('captureRevisionTree', () => {
  it('should exclude only reserved Tau staging and backup siblings from capture', async () => {
    const staged = '.main.ts.tau-staged.00000000-0000-0000-0000-000000000001.tmp';
    const backup = '.main.ts.tau-backup.00000000-0000-0000-0000-000000000001.tmp';
    const authored = '.main.ts.tau-staged.0.tmp';
    const filesystem = vanishingFileSystem(
      {
        '': ['main.ts', staged, backup, authored],
        'main.ts': 'kept',
        [staged]: 'staged',
        [backup]: 'backup',
        [authored]: 'authored',
      },
      new Set(),
    );
    const captured = await captureRevisionTree(filesystem);
    expect(captured.entries().map(({ path }) => path)).toEqual([authored, 'main.ts']);
    const incremental = await captureRevisionTree(filesystem, {
      changedSince: { tree: captured, paths: [staged, backup] },
    });
    expect(incremental.entries().map(({ path }) => path)).toEqual([authored, 'main.ts']);
    const older = new ImmutableRevisionTree([
      ['main.ts', 'old'],
      [staged, 'old staging'],
    ]);
    const cleaned = await captureRevisionTree(filesystem, { changedSince: { tree: older, paths: ['main.ts'] } });
    expect(cleaned.entries().map(({ path }) => path)).toEqual(['main.ts']);
  });

  it('skips entries that vanish between the listing and the read instead of failing the capture', async () => {
    /* eslint-disable @typescript-eslint/naming-convention -- Path-keyed object: keys are workspace paths and run ids, not identifiers */
    const filesystem = vanishingFileSystem(
      {
        '': ['main.ts', '.main.ts.json.4821.9f3a.tmp', 'gone', 'nested'],
        'main.ts': 'kept',
        nested: ['keep.txt'],
        'nested/keep.txt': 'nested kept',
      },
      new Set(['.main.ts.json.4821.9f3a.tmp', 'gone']),
    );

    const captured = await captureRevisionTree(filesystem);

    expect(captured.entries().map(({ path }) => path)).toEqual(['main.ts', 'nested/keep.txt']);
  });

  it('treats a directory that vanishes mid-walk as empty rather than aborting the capture', async () => {
    const filesystem = vanishingFileSystem(
      { '': ['main.ts', 'run_a'], 'main.ts': 'kept', run_a: ['tree'] },
      new Set(['run_a']),
    );

    // `stat` resolves before the sweep removes the directory, `readdir` does not.
    const racing: RevisionCaptureFileSystem = {
      ...filesystem,
      stat: async (path) => (path === 'run_a' ? { type: 'dir', size: 0, mtimeMs: 0 } : filesystem.stat(path)),
    };

    const captured = await captureRevisionTree(racing);

    expect(captured.entries().map(({ path }) => path)).toEqual(['main.ts']);
  });

  it('excludes the directories the caller reserves without walking into them', async () => {
    const filesystem = vanishingFileSystem(
      {
        '': ['main.ts', '.tau'],
        'main.ts': 'kept',
        '.tau': ['cache'],
        '.tau/cache': ['blob.bin'],
        '.tau/cache/blob.bin': 'cached',
      },
      new Set(),
    );
    /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after the path-keyed fixtures */

    const captured = await captureRevisionTree(filesystem, { exclude: (path) => path === '.tau/cache' });

    expect(captured.entries().map(({ path }) => path)).toEqual(['main.ts']);
  });

  it('captures a rooted view that has no streaming read by buffering each file', async () => {
    // The browser's `createClientRootedFileSystem` wraps a `FileSystemClient`
    // with no streaming read; requiring one failed every browser-placed chat.
    const filesystem: RevisionCaptureFileSystem = {
      ...vanishingFileSystem(
        { '': ['main.ts', 'nested'], 'main.ts': 'kept', nested: ['keep.txt'], 'nested/keep.txt': 'nested kept' },
        new Set(),
      ),
      readFileStream: undefined,
    };

    const captured = await captureRevisionTree(filesystem);

    expect(captured.entries().map(({ path, content }) => [path, new TextDecoder().decode(content)] as const)).toEqual([
      ['main.ts', 'kept'],
      ['nested/keep.txt', 'nested kept'],
    ]);
  });

  it('rejects required files that vanish, are excluded, or resolve as directories', async () => {
    const filesystem = vanishingFileSystem(
      { '': ['gone.txt', 'excluded.txt', 'directory'], 'excluded.txt': 'hidden', directory: [] },
      new Set(['gone.txt']),
    );

    await expect(captureRevisionTree(filesystem, { requiredPaths: ['gone.txt'] })).rejects.toThrow(
      'Required capture paths were not captured: gone.txt',
    );
    await expect(
      captureRevisionTree(filesystem, {
        exclude: (path) => path === 'excluded.txt',
        requiredPaths: ['excluded.txt'],
      }),
    ).rejects.toThrow('Required capture paths were not captured: excluded.txt');
    await expect(captureRevisionTree(filesystem, { requiredPaths: ['directory'] })).rejects.toThrow(
      'Required capture paths were not captured: directory',
    );
  });

  it('should bound sibling stream reads at the default concurrency', async () => {
    const paths = Array.from({ length: 24 }, (_, index) => `file-${index}.bin`);
    const filesystem = vanishingFileSystem(
      { '': paths, ...Object.fromEntries(paths.map((path) => [path, 'x'])) },
      new Set(),
    );
    let active = 0;
    let maximumActive = 0;
    let poolReached = false;
    const pending: Array<ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>> = [];
    filesystem.readFileStream = () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          if (poolReached) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
            active -= 1;
            return;
          }
          pending.push(controller);
          if (pending.length === 16) {
            poolReached = true;
            for (const waiting of pending.splice(0)) {
              waiting.enqueue(new Uint8Array([1]));
              waiting.close();
              active -= 1;
            }
          }
        },
      });

    const captured = await captureRevisionTree(filesystem);

    expect(captured.size).toBe(paths.length);
    expect(maximumActive).toBe(16);
  });

  it('enforces one aggregate byte budget across parallel growing streams', async () => {
    const filesystem = vanishingFileSystem({ '': ['a.bin', 'b.bin'], 'a.bin': 'aaa', 'b.bin': 'bbb' }, new Set());
    const bufferedRead = vi.spyOn(filesystem, 'readFile');
    filesystem.readFileStream = () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
          controller.enqueue(new Uint8Array(3));
          controller.close();
        },
      });

    await expect(captureRevisionTree(filesystem, { concurrency: 2, maximumTotalBytes: 5 })).rejects.toThrow(
      'Revision tree capture exceeds maximumTotalBytes (5)',
    );
    expect(bufferedRead).not.toHaveBeenCalled();
  });

  it('waits for the exact delayed stream cancellation before rejecting', async () => {
    const filesystem = vanishingFileSystem({ '': ['large.bin'], 'large.bin': 'large' }, new Set());
    let releaseCancellation: (() => void) | undefined;
    const cancellationGate = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    let cancellationStarted = false;
    filesystem.readFileStream = () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
        },
        async cancel() {
          cancellationStarted = true;
          await cancellationGate;
        },
      });
    let settled = false;
    const capture = captureRevisionTree(filesystem, { maximumTotalBytes: 5 });
    const observeCapture = async (): Promise<void> => {
      try {
        await capture;
      } catch {
        // The assertion below owns the expected capture rejection.
      } finally {
        settled = true;
      }
    };
    const observation = observeCapture();
    await vi.waitFor(() => {
      expect(cancellationStarted).toBe(true);
    });

    expect(settled).toBe(false);
    releaseCancellation?.();
    await expect(capture).rejects.toThrow('Revision tree capture exceeds maximumTotalBytes (5)');
    await observation;
    expect(settled).toBe(true);
  });

  it('contains rejecting cancellation and reports it with the capture failure', async () => {
    const filesystem = vanishingFileSystem({ '': ['large.bin'], 'large.bin': 'large' }, new Set());
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    filesystem.readFileStream = () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
        },
        cancel: async () => {
          throw new Error('stream cleanup failed');
        },
      });

    try {
      const failure = await captureRevisionTree(filesystem, { maximumTotalBytes: 5 }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        expect.objectContaining({ message: 'Revision tree capture exceeds maximumTotalBytes (5).' }),
        expect.objectContaining({ message: 'stream cleanup failed' }),
      ]);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('rejects when cleanup fails after an undeclared file vanishes during its read', async () => {
    const filesystem = vanishingFileSystem({ '': ['gone.bin'], 'gone.bin': 'gone' }, new Set());
    const reader = {
      read: vi.fn(async () => {
        throw Object.assign(new Error('gone while reading'), { code: 'ENOENT' });
      }),
      cancel: vi.fn(async () => {
        throw new Error('vanished stream cleanup failed');
      }),
      releaseLock: vi.fn(),
    };
    filesystem.readFileStream = () =>
      ({ getReader: () => reader }) as unknown as ReadableStream<Uint8Array<ArrayBuffer>>;

    await expect(captureRevisionTree(filesystem)).rejects.toThrow('vanished stream cleanup failed');
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  it('rejects a non-Error undefined stream failure instead of omitting the file', async () => {
    const filesystem = vanishingFileSystem({ '': ['broken.bin'], 'broken.bin': 'broken' }, new Set());
    const reader = {
      read: vi.fn().mockRejectedValue(undefined),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    filesystem.readFileStream = () =>
      ({ getReader: () => reader }) as unknown as ReadableStream<Uint8Array<ArrayBuffer>>;

    await expect(captureRevisionTree(filesystem)).rejects.toMatchObject({
      message: 'Revision capture failed: broken.bin',
      cause: undefined,
    });
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  it('aborts active streams, drains their cancellation, and returns no partial tree', async () => {
    const filesystem = vanishingFileSystem({ '': ['a.bin', 'b.bin'], 'a.bin': 'a', 'b.bin': 'b' }, new Set());
    const cancelled: string[] = [];
    const started: string[] = [];
    filesystem.readFileStream = (path) =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        async pull() {
          started.push(path);
          await new Promise<void>(() => {
            // Capture remains pending until the abort path cancels this stream.
          });
        },
        cancel: async () => {
          await Promise.resolve();
          cancelled.push(path);
        },
      });
    const abortController = new AbortController();
    const capture = captureRevisionTree(filesystem, { concurrency: 2, signal: abortController.signal });
    await vi.waitFor(() => {
      expect(started).toHaveLength(2);
    });
    abortController.abort(new Error('stop capture'));

    await expect(capture).rejects.toThrow('stop capture');
    expect(cancelled.sort()).toEqual(['a.bin', 'b.bin']);
  });

  it('validates capture limits before touching the filesystem', async () => {
    const filesystem = vanishingFileSystem({ '': [] }, new Set());
    const readdir = vi.spyOn(filesystem, 'readdir');

    await expect(captureRevisionTree(filesystem, { concurrency: 0 })).rejects.toThrow(RangeError);
    await expect(captureRevisionTree(filesystem, { maximumTotalBytes: Number.POSITIVE_INFINITY })).rejects.toThrow(
      RangeError,
    );
    expect(readdir).not.toHaveBeenCalled();
  });

  /*
   * On OPFS `stat` reads a text file whole to count its lines, so a walk that
   * stats each child to learn its kind reads every file twice per save.
   */
  it('takes entry kinds from readdirEntries and stats nothing when the view offers it', async () => {
    const tree: Record<string, readonly string[] | string> = {
      '': ['a.ts', 'nested', 'b.txt'],
      'a.ts': 'a',
      'b.txt': 'b',
      nested: ['c.ts', 'deeper'],
      'nested/c.ts': 'c',
      'nested/deeper': ['d.ts'],
      'nested/deeper/d.ts': 'd',
    };
    const fallback = vanishingFileSystem(tree, new Set());
    const fallbackStat = vi.spyOn(fallback, 'stat');
    const listing = vanishingFileSystem(tree, new Set());
    const listingStat = vi.spyOn(listing, 'stat');
    const withEntries = Object.assign(listing, {
      readdirEntries: async (path: string): Promise<DirectoryEntry[]> => {
        const names = await listing.readdir(path);
        return names.map((name) => ({
          name,
          kind: typeof tree[path === '' ? name : `${path}/${name}`] === 'string' ? 'file' : 'dir',
        }));
      },
    });

    const expected = await captureRevisionTree(fallback);
    const captured = await captureRevisionTree(withEntries);

    expect(listingStat).not.toHaveBeenCalled();
    expect(fallbackStat).toHaveBeenCalledTimes(6);
    expect(captured.entries()).toStrictEqual(expected.entries());
    expect(captured.entries().map(({ path }) => path)).toEqual(['a.ts', 'b.txt', 'nested/c.ts', 'nested/deeper/d.ts']);
  });

  it('treats a directory that vanishes before its kind listing as empty', async () => {
    const filesystem = vanishingFileSystem({ '': ['main.ts', 'run_a'], 'main.ts': 'kept' }, new Set(['run_a']));
    const withEntries = Object.assign(filesystem, {
      readdirEntries: async (path: string): Promise<DirectoryEntry[]> => {
        if (path === 'run_a') {
          throw Object.assign(new Error('gone'), { name: 'NotFoundError' });
        }
        return [
          { name: 'main.ts', kind: 'file' },
          { name: 'run_a', kind: 'dir' },
        ];
      },
    });

    const captured = await captureRevisionTree(withEntries);

    expect(captured.entries().map(({ path }) => path)).toEqual(['main.ts']);
  });
});

describe('createCaptureMemo', () => {
  const tree = { '': ['small.ts', 'mesh.stl'], 'small.ts': 'ab', 'mesh.stl': 'solid ' };
  const observedAt = 1_000_000;
  const mebibyte = 1024 * 1024;
  const statsOf = (files: Readonly<Record<string, string>>): FileStatEntry[] =>
    Object.entries(files).map(([path, value]) => ({
      path,
      name: path,
      type: 'file',
      size: value.length,
      /* Old enough to be outside the racy window, so the guard is not what this asserts. */
      mtimeMs: observedAt - 60_000,
      contentKind: 'text',
      lineCount: 1,
    }));

  it('should hold no more bytes than its budget over a tree larger than it', () => {
    const memo = createCaptureMemo({ maximumRetainedBytes: 3 });
    const stats = statsOf({ 'small.ts': 'ab', 'mesh.stl': 'solid ' });

    const first = memo.unchanged(stats, observedAt);
    first.onRead?.('small.ts', new TextEncoder().encode('ab'));
    first.onRead?.('mesh.stl', new TextEncoder().encode('solid '));

    const second = memo.unchanged(stats, observedAt);
    const reused = ['small.ts', 'mesh.stl'].map((path) => second.reuse?.(path)?.byteLength ?? 0);
    expect(reused).toEqual([2, 0]);
    expect(reused.reduce((total, bytes) => total + bytes, 0)).toBeLessThanOrEqual(3);
  });

  it('should retain at most 64 MiB by default and prune paths absent from the next stat set', () => {
    const memo = createCaptureMemo();
    const content = new Uint8Array(32 * mebibyte);
    const stats: FileStatEntry[] = ['first.bin', 'second.bin', 'third.bin'].map((path) => ({
      path,
      name: path,
      type: 'file',
      size: path === 'third.bin' ? 1 : content.byteLength,
      mtimeMs: observedAt - 60_000,
      contentKind: 'binary',
    }));
    const first = memo.unchanged(stats, observedAt);
    first.onRead?.('first.bin', content);
    first.onRead?.('second.bin', content);
    first.onRead?.('third.bin', new Uint8Array(1));

    const warm = memo.unchanged(stats, observedAt);
    expect(['first.bin', 'second.bin', 'third.bin'].filter((path) => warm.reuse?.(path) !== undefined)).toEqual([
      'first.bin',
      'second.bin',
    ]);
    expect((warm.reuse?.('first.bin')?.byteLength ?? 0) + (warm.reuse?.('second.bin')?.byteLength ?? 0)).toBe(
      64 * mebibyte,
    );

    const pruned = memo.unchanged(stats.slice(1), observedAt);
    expect(pruned.reuse?.('first.bin')).toBeUndefined();
    expect(pruned.reuse?.('second.bin')).toBeDefined();
  });

  it('should read the file it could not hold again and still read none of the ones it could', async () => {
    const filesystem = vanishingFileSystem(tree, new Set());
    /* Capture streams where it can, so the stream is what a read is counted at. */
    const read = vi.spyOn(filesystem, 'readFileStream');
    const memo = createCaptureMemo({ maximumRetainedBytes: 3 });
    const stats = statsOf({ 'small.ts': 'ab', 'mesh.stl': 'solid ' });

    await captureRevisionTree(filesystem, { ...memo.unchanged(stats, observedAt) });
    read.mockClear();
    const second = await captureRevisionTree(filesystem, { ...memo.unchanged(stats, observedAt) });

    expect(read.mock.calls.map(([path]) => path)).toEqual(['mesh.stl']);
    expect(second.get('small.ts')).toStrictEqual(new TextEncoder().encode('ab'));
    expect(second.get('mesh.stl')).toStrictEqual(new TextEncoder().encode('solid '));
  });

  it('should hold nothing for a file whose timestamp is inside the racy window, whatever the budget', () => {
    const memo = createCaptureMemo();
    const stats: FileStatEntry[] = [
      {
        path: 'small.ts',
        name: 'small.ts',
        type: 'file',
        size: 2,
        mtimeMs: observedAt,
        contentKind: 'text',
        lineCount: 1,
      },
    ];

    const first = memo.unchanged(stats, observedAt);
    first.onRead?.('small.ts', new TextEncoder().encode('ab'));

    expect(memo.unchanged(stats, observedAt).reuse?.('small.ts')).toBeUndefined();
  });

  it('should trust a timestamp only after the two-second racy window', async () => {
    const filesystem = vanishingFileSystem(tree, new Set());
    const reads = vi.spyOn(filesystem, 'readFileStream');
    const atBoundary = statsOf({ 'small.ts': 'ab', 'mesh.stl': 'solid ' }).map((stat) => ({
      ...stat,
      mtimeMs: observedAt - 2000,
    }));
    const boundaryMemo = createCaptureMemo();
    await captureRevisionTree(filesystem, { ...boundaryMemo.unchanged(atBoundary, observedAt) });
    await captureRevisionTree(filesystem, { ...boundaryMemo.unchanged(atBoundary, observedAt) });
    expect(reads).toHaveBeenCalledTimes(4);

    reads.mockClear();
    const oldEnough = atBoundary.map((stat) => ({ ...stat, mtimeMs: stat.mtimeMs - 1 }));
    const trustedMemo = createCaptureMemo();
    await captureRevisionTree(filesystem, { ...trustedMemo.unchanged(oldEnough, observedAt) });
    await captureRevisionTree(filesystem, { ...trustedMemo.unchanged(oldEnough, observedAt) });
    expect(reads).toHaveBeenCalledTimes(2);
  });
});

describe('captureRevisionTree changedSince (E1)', () => {
  const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
  const project = async () => {
    const filesystem = await createMemoryProvider();
    await Promise.all(
      Array.from({ length: 30 }, async (_, index) =>
        filesystem.writeFile(
          `src/${String(index % 3)}/file-${String(index)}.ts`,
          `export const x = ${String(index)};\n`,
        ),
      ),
    );
    await filesystem.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
    const reads = vi.spyOn(filesystem, 'readFile');
    return { filesystem, reads };
  };
  const exclude = (path: string): boolean => path === '.git';

  it('should read only the changed paths and equal a full capture', async () => {
    const { filesystem, reads } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    await filesystem.writeFile('src/1/file-4.ts', 'export const x = "edited";\n');
    await filesystem.writeFile('src/1/added.ts', 'export const added = true;\n');
    await filesystem.unlink('src/2/file-5.ts');
    reads.mockClear();

    const incremental = await captureRevisionTree(filesystem, {
      exclude,
      changedSince: { tree: previous, paths: ['src/1/file-4.ts', 'src/1/added.ts', 'src/2/file-5.ts'] },
    });

    expect(reads.mock.calls.map(([path]) => path).toSorted()).toEqual(['src/1/added.ts', 'src/1/file-4.ts']);
    const full = await captureRevisionTree(filesystem, { exclude });
    expect(incremental.entries()).toEqual(full.entries());
  });

  it('should list a changed directory whole and drop one that is gone', async () => {
    const { filesystem, reads } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    await filesystem.rename('src/0', 'lib/0');
    reads.mockClear();

    const incremental = await captureRevisionTree(filesystem, {
      exclude,
      changedSince: { tree: previous, paths: ['src/0', 'lib/0'] },
    });

    expect(reads).toHaveBeenCalledTimes(10);
    expect(incremental.has('src/0/file-0.ts')).toBe(false);
    const full = await captureRevisionTree(filesystem, { exclude });
    expect(incremental.entries()).toEqual(full.entries());
  });

  it('should not read a changed path the full walk would never reach', async () => {
    const { filesystem, reads } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    await filesystem.writeFile('.git/HEAD', 'ref: refs/heads/other\n');
    reads.mockClear();

    const incremental = await captureRevisionTree(filesystem, {
      exclude,
      changedSince: { tree: previous, paths: ['.git/HEAD'] },
    });

    expect(reads).not.toHaveBeenCalled();
    expect(incremental.has('.git/HEAD')).toBe(false);
    expect(incremental.size).toBe(previous.size);
  });

  it('should not read a changed path that is itself excluded, though it is still on disk', async () => {
    const { filesystem, reads } = await project();
    const staged = 'src/1/.file-4.ts.tau-staged.0.tmp';
    const excludeStaged = (path: string): boolean => exclude(path) || path.endsWith('.tmp');
    const previous = await captureRevisionTree(filesystem, { exclude: excludeStaged });
    await filesystem.writeFile(staged, 'half written\n');
    reads.mockClear();

    const incremental = await captureRevisionTree(filesystem, {
      exclude: excludeStaged,
      changedSince: { tree: previous, paths: [staged] },
    });

    expect(reads).not.toHaveBeenCalled();
    expect(incremental.has(staged)).toBe(false);
    expect(incremental.size).toBe(previous.size);
  });

  it('should walk everything when a changed path names the root', async () => {
    const { filesystem, reads } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    reads.mockClear();

    await captureRevisionTree(filesystem, { exclude, changedSince: { tree: previous, paths: [''] } });

    expect(reads).toHaveBeenCalledTimes(30);
  });

  it('should walk everything when the change set contradicts the previous tree', async () => {
    const { filesystem } = await project();
    await filesystem.writeFile('notes', 'a file\n');
    const previous = await captureRevisionTree(filesystem, { exclude });
    await filesystem.unlink('notes');
    await filesystem.writeFile('notes/today.md', 'a directory now\n');

    /* The deletion of `notes` was never reported, only the new file under it. */
    const incremental = await captureRevisionTree(filesystem, {
      exclude,
      changedSince: { tree: previous, paths: ['notes/today.md'] },
    });

    expect(incremental.has('notes')).toBe(false);
    const full = await captureRevisionTree(filesystem, { exclude });
    expect(incremental.entries()).toEqual(full.entries());
  });

  it('should still refuse a required path the changed paths removed', async () => {
    const { filesystem } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    await filesystem.unlink('src/0/file-0.ts');

    await expect(
      captureRevisionTree(filesystem, {
        exclude,
        requiredPaths: ['src/0/file-0.ts'],
        changedSince: { tree: previous, paths: ['src/0/file-0.ts'] },
      }),
    ).rejects.toThrow('Required capture paths were not captured: src/0/file-0.ts');
  });

  it('should read a changed path again when its read fails once, by walking everything', async () => {
    const { filesystem, reads } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    await filesystem.writeFile('src/1/file-4.ts', 'export const x = "edited";\n');
    /* The provider's own read, not the spy that wraps it. */
    const read = (Object.getPrototypeOf(filesystem) as typeof filesystem).readFile.bind(filesystem);
    let failures = 0;
    reads.mockImplementation((async (path: string) => {
      if (path === 'src/1/file-4.ts' && failures === 0) {
        failures += 1;
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      }
      return read(path);
    }) as typeof filesystem.readFile);

    const incremental = await captureRevisionTree(filesystem, {
      exclude,
      changedSince: { tree: previous, paths: ['src/1/file-4.ts'] },
    });

    reads.mockRestore();
    const full = await captureRevisionTree(filesystem, { exclude });
    expect(failures).toBe(1);
    expect(incremental.entries()).toEqual(full.entries());
  });

  it('should not fall back to a full walk when the caller aborted', async () => {
    const { filesystem, reads } = await project();
    const previous = await captureRevisionTree(filesystem, { exclude });
    reads.mockClear();

    await expect(
      captureRevisionTree(filesystem, {
        exclude,
        signal: AbortSignal.abort(new Error('closed')),
        changedSince: { tree: previous, paths: ['src/1/file-4.ts'] },
      }),
    ).rejects.toThrow('closed');
    expect(reads).not.toHaveBeenCalled();
  });

  it('should copy reused bytes it did not read itself, so their owner cannot rewrite the tree', async () => {
    const { filesystem } = await project();
    const foreign = text('export const x = 0;\n');

    const tree = await captureRevisionTree(filesystem, {
      exclude,
      reuse: (path) => (path === 'src/0/file-0.ts' ? foreign : undefined),
    });
    foreign.fill(0);

    expect(tree.get('src/0/file-0.ts')).toStrictEqual(text('export const x = 0;\n'));
  });
});

describe('createCaptureMemo invalidation', () => {
  const observedAt = 1_000_000;
  const tree = { '': ['part.ts'], 'part.ts': 'export const x = 1;\n' };
  const stat = (overrides: Readonly<{ size?: number; mtimeMs?: number }>): FileStatEntry[] => [
    {
      path: 'part.ts',
      name: 'part.ts',
      type: 'file',
      size: tree['part.ts'].length,
      mtimeMs: observedAt - 60_000,
      contentKind: 'text',
      lineCount: 1,
      ...overrides,
    },
  ];

  it.each([
    ['its size changes', { size: 99 }],
    ['its mtime changes', { mtimeMs: observedAt - 30_000 }],
  ])('should read a memoised file again when %s', async (_label, overrides) => {
    const filesystem = vanishingFileSystem(tree, new Set());
    const reads = vi.spyOn(filesystem, 'readFileStream');
    const memo = createCaptureMemo();
    await captureRevisionTree(filesystem, memo.unchanged(stat({}), observedAt));
    await captureRevisionTree(filesystem, memo.unchanged(stat({}), observedAt));
    expect(reads).toHaveBeenCalledOnce();

    await captureRevisionTree(filesystem, memo.unchanged(stat(overrides), observedAt));

    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('should read a file on every cut while its mtime is inside the racy window of the capture start', async () => {
    const filesystem = vanishingFileSystem(tree, new Set());
    const reads = vi.spyOn(filesystem, 'readFileStream');
    const memo = createCaptureMemo();
    const racy = stat({ mtimeMs: observedAt - 1000 });

    for (let cut = 0; cut < 3; cut += 1) {
      // oxlint-disable-next-line no-await-in-loop -- consecutive cuts of one checkout.
      await captureRevisionTree(filesystem, memo.unchanged(racy, observedAt));
    }

    expect(reads).toHaveBeenCalledTimes(3);
  });
});

/**
 * A case-insensitive, case-preserving disk (macOS, Windows): a name resolves
 * whatever its letter case, and keeps the spelling it was first created with.
 */
const caseInsensitiveFileSystem = () => {
  type Node =
    | { kind: 'dir'; name: string; children: Map<string, Node> }
    | { kind: 'file'; name: string; content: Uint8Array<ArrayBuffer> };
  const root: Node = { kind: 'dir', name: '', children: new Map() };
  const key = (name: string): string => name.normalize('NFC').toLowerCase();
  const enoent = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const lookup = (path: string): Node | undefined => {
    let node: Node | undefined = root;
    for (const segment of path === '' ? [] : path.split('/')) {
      node = node?.kind === 'dir' ? node.children.get(key(segment)) : undefined;
    }
    return node;
  };
  const directory = (path: string): Extract<Node, { kind: 'dir' }> => {
    const node = lookup(path);
    if (node?.kind !== 'dir') {
      throw enoent(path);
    }
    return node;
  };
  const write = (path: string, text: string): void => {
    const segments = path.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let next = node.children.get(key(segment));
      if (next === undefined) {
        next = { kind: 'dir', name: segment, children: new Map() };
        node.children.set(key(segment), next);
      }
      if (next.kind !== 'dir') {
        throw new Error(`ENOTDIR: ${segment}`);
      }
      node = next;
    }
    const leaf = segments.at(-1)!;
    const existing = node.children.get(key(leaf));
    const content = new TextEncoder().encode(text);
    if (existing?.kind === 'file') {
      existing.content = content;
    } else {
      node.children.set(key(leaf), { kind: 'file', name: leaf, content });
    }
  };
  const filesystem: RevisionCaptureFileSystem = {
    readdir: async (path) => [...directory(path).children.values()].map((child) => child.name),
    readdirEntries: async (path) =>
      [...directory(path).children.values()].map((child) => ({ name: child.name, kind: child.kind })),
    stat: (async (path: string) => {
      const node = lookup(path);
      if (node === undefined) {
        throw enoent(path);
      }
      return node.kind === 'dir'
        ? { type: 'dir', size: 0, mtimeMs: 0 }
        : { type: 'file', size: node.content.byteLength, mtimeMs: 0, contentKind: 'text', lineCount: 1 };
    }) as RevisionCaptureFileSystem['stat'],
    readFile: (async (path: string) => {
      const node = lookup(path);
      if (node?.kind !== 'file') {
        throw enoent(path);
      }
      return new Uint8Array(node.content);
    }) as RevisionCaptureFileSystem['readFile'],
  };
  return { filesystem, write };
};

describe('captureRevisionTree changedSince on a case-insensitive disk (review finding 1)', () => {
  it.each([
    ['a parent directory', ['Dir/x.txt', 'Dir/y.txt']],
    ['the file itself', ['dir/X.txt', 'dir/Y.txt']],
    ['an accent in NFD', ['dir/x.txt', 'dir/y.txt', 'dir/cafe\u0301.txt']],
  ])('should equal a full capture when the change bus spells %s differently from the disk', async (_label, spelled) => {
    const { filesystem, write } = caseInsensitiveFileSystem();
    write('dir/a.txt', 'a');
    write('dir/x.txt', 'x1');
    write('dir/caf\u00E9.txt', 'coffee');
    const previous = await captureRevisionTree(filesystem);
    for (const path of spelled) {
      write(path, `edited ${path}`);
    }

    const incremental = await captureRevisionTree(filesystem, { changedSince: { tree: previous, paths: spelled } });

    const full = await captureRevisionTree(filesystem);
    expect(incremental.entries()).toEqual(full.entries());
  });
});
