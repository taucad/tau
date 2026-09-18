/**
 * `captureRevisionTree` — the one walk a revision is recorded from.
 *
 * These are the capture claims of the deleted `materialized-workspace.test.ts`,
 * moved with the function (W3d): what a vanished entry does to a walk, what the
 * caller reserves, what the concurrency and byte bounds hold, and what a
 * cancelled or failing stream leaves behind.
 */

import { describe, expect, it, vi } from 'vitest';
import { captureRevisionTree } from '#algorithms/revision-capture.js';
import type { RevisionCaptureFileSystem } from '#algorithms/revision-capture.js';
import type { DirectoryEntry, FileStat } from '@taucad/filesystem';

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

  /* eslint-disable @typescript-eslint/naming-convention -- Path-keyed fixtures use the empty string for the rooted filesystem root. */
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
  /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after the path-keyed fixtures */

  /* eslint-disable @typescript-eslint/naming-convention -- Path-keyed fixtures use the empty string for the rooted filesystem root. */
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

  it('bounds sibling stream reads at the default concurrency', async () => {
    const paths = Array.from({ length: 24 }, (_, index) => `file-${index}.bin`);
    const filesystem = vanishingFileSystem(
      { '': paths, ...Object.fromEntries(paths.map((path) => [path, 'x'])) },
      new Set(),
    );
    let active = 0;
    let maximumActive = 0;
    filesystem.readFileStream = () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 1);
          });
          controller.enqueue(new Uint8Array([1]));
          controller.close();
          active -= 1;
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
  /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after path-keyed fixtures. */
});
