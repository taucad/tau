import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import type { RootedFileSystem } from '#workspace-file-service.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import { captureRevisionTree, MaterializedWorkspaceAuthority } from '#materialized-workspace.js';
import { materializedWorkspaceId } from '#workspace-identity.js';
import type { FileStat, WatchEvent } from '#types.js';

type Harness = {
  authority: MaterializedWorkspaceAuthority;
  dispose: () => void;
};

const createHarness = (options?: {
  legacyAppend?: boolean;
  wrap?: (filesystem: RootedFileSystem) => RootedFileSystem;
}): Harness => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount('/project', provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:materialized-workspace-test',
  });
  const eventBus = new ChangeEventBus();
  const resourceQueue = new ResourceQueue();
  const crossTabCoordinator = new CrossTabCoordinator();
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue,
    eventBus,
    crossTabCoordinator,
    mountTable,
  });
  const filesystem = service.createRootedFileSystem('/project');
  if (options?.legacyAppend === true) {
    Object.defineProperty(filesystem, 'appendFile', { value: undefined });
  }
  return {
    authority: new MaterializedWorkspaceAuthority({
      filesystem: options?.wrap ? options.wrap(filesystem) : filesystem,
      resourceQueue,
    }),
    dispose: () => {
      service.dispose();
      provider.dispose();
      eventBus.dispose();
      crossTabCoordinator.dispose();
    },
  };
};

const live: Harness[] = [];
afterEach(() => {
  for (const harness of live) {
    harness.dispose();
  }
  live.length = 0;
});

const harness = (options?: Parameters<typeof createHarness>[0]): Harness => {
  const created = createHarness(options);
  live.push(created);
  return created;
};

const baseTree = (): ImmutableRevisionTree =>
  new ImmutableRevisionTree([
    ['main.ts', 'base'],
    ['delete-me.txt', 'delete base'],
    ['nested/rename-me.txt', 'rename base'],
  ]);

/**
 * A real filesystem can drop an entry between `readdir` and the `stat` that
 * follows it — an atomic write's temp file is renamed away, a sweep removes a
 * workspace directory. `vanishing` reproduces that: every listed name in
 * `missing` is gone by the time the walker asks about it.
 */
const vanishingFileSystem = (
  entries: Readonly<Record<string, readonly string[] | string>>,
  missing: ReadonlySet<string>,
): RootedFileSystem => {
  const enoent = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const encoder = new TextEncoder();
  return {
    id: 'vanishing',
    capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
    readFile: (async (path: string) => {
      if (missing.has(path)) {
        throw enoent(path);
      }
      const value = entries[path];
      if (typeof value !== 'string') {
        throw enoent(path);
      }
      return encoder.encode(value);
    }) as RootedFileSystem['readFile'],
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
  } as unknown as RootedFileSystem;
};

describe('MaterializedWorkspaceAuthority', () => {
  it('isolates concurrent reads, edits, deletes, and renames from one immutable base', async () => {
    const { authority } = harness();
    const tree = baseTree();
    const baseRevisionId = revisionId('rev-base');
    const [first, second] = await Promise.all([
      authority.materialize({ workspaceId: materializedWorkspaceId('workspace-a'), baseRevisionId, tree }),
      authority.materialize({ workspaceId: materializedWorkspaceId('workspace-b'), baseRevisionId, tree }),
    ]);

    await Promise.all([
      first.filesystem.writeFile('main.ts', 'first edit'),
      first.filesystem.unlink('delete-me.txt'),
      second.filesystem.writeFile('main.ts', 'second edit'),
      second.filesystem.rename('nested/rename-me.txt', 'nested/renamed.txt'),
    ]);

    await expect(first.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('first edit');
    await expect(second.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('second edit');
    await expect(first.filesystem.exists('delete-me.txt')).resolves.toBe(false);
    await expect(second.filesystem.readFile('delete-me.txt', 'utf8')).resolves.toBe('delete base');
    await expect(first.filesystem.readFile('nested/rename-me.txt', 'utf8')).resolves.toBe('rename base');
    await expect(second.filesystem.exists('nested/rename-me.txt')).resolves.toBe(false);
    await expect(second.filesystem.readFile('nested/renamed.txt', 'utf8')).resolves.toBe('rename base');
    expect(new TextDecoder().decode(tree.get('main.ts'))).toBe('base');
    expect(new TextDecoder().decode(tree.get('delete-me.txt'))).toBe('delete base');
  });

  it('serializes fallback appends when the source lacks appendFile', async () => {
    const { authority } = harness({ legacyAppend: true });
    const workspace = await authority.materialize({
      workspaceId: materializedWorkspaceId('legacy-append'),
      baseRevisionId: revisionId('rev-legacy-append'),
      tree: new ImmutableRevisionTree([['events.log', 'head']]),
    });

    await Promise.all([
      workspace.filesystem.appendFile!('events.log', '-one'),
      workspace.filesystem.appendFile!('events.log', '-two'),
    ]);

    await expect(workspace.filesystem.readFile('events.log', 'utf8')).resolves.toBe('head-one-two');
  });

  it('keeps rooted watcher streams branch-local', async () => {
    const { authority } = harness();
    const tree = baseTree();
    const baseRevisionId = revisionId('rev-base');
    const [first, second] = await Promise.all([
      authority.materialize({ workspaceId: materializedWorkspaceId('watch-a'), baseRevisionId, tree }),
      authority.materialize({ workspaceId: materializedWorkspaceId('watch-b'), baseRevisionId, tree }),
    ]);
    const firstEvents: WatchEvent[] = [];
    const secondEvents: WatchEvent[] = [];
    const stopFirst = first.filesystem.watch({ paths: [''], recursive: true }, (event) => firstEvents.push(event));
    const stopSecond = second.filesystem.watch({ paths: [''], recursive: true }, (event) => secondEvents.push(event));

    await Promise.all([
      first.filesystem.writeFile('only-first.txt', 'first'),
      first.filesystem.unlink('delete-me.txt'),
      first.filesystem.rename('nested/rename-me.txt', 'nested/renamed-first.txt'),
      second.filesystem.writeFile('only-second.txt', 'second'),
    ]);
    await expect
      .poll(
        () =>
          firstEvents.some((event) => event.type === 'change' && event.path === 'only-first.txt') &&
          firstEvents.some((event) => event.type === 'delete' && event.path === 'delete-me.txt') &&
          firstEvents.some(
            (event) =>
              event.type === 'rename' &&
              event.oldPath === 'nested/rename-me.txt' &&
              event.newPath === 'nested/renamed-first.txt',
          ),
      )
      .toBe(true);
    await expect.poll(() => secondEvents.length).toBeGreaterThan(0);

    expect(firstEvents).toContainEqual({ type: 'change', path: 'only-first.txt' });
    expect(firstEvents).toContainEqual({ type: 'delete', path: 'delete-me.txt' });
    expect(firstEvents).toContainEqual({
      type: 'rename',
      oldPath: 'nested/rename-me.txt',
      newPath: 'nested/renamed-first.txt',
    });
    expect(firstEvents).not.toContainEqual({ type: 'change', path: 'only-second.txt' });
    expect(secondEvents).toContainEqual({ type: 'change', path: 'only-second.txt' });
    expect(secondEvents).not.toContainEqual({ type: 'change', path: 'only-first.txt' });
    expect(secondEvents).not.toContainEqual({ type: 'delete', path: 'delete-me.txt' });
    expect(secondEvents).not.toContainEqual(
      expect.objectContaining({ type: 'rename', oldPath: 'nested/rename-me.txt' }),
    );
    stopFirst();
    stopSecond();
  });

  it.each([2, 8, 32, 100])('materializes %i concurrently isolated roots with exact fixture metrics', async (count) => {
    const { authority } = harness();
    const tree = baseTree();
    const baseRevisionId = revisionId('rev-fixture');
    const workspaces = await Promise.all(
      Array.from({ length: count }, async (_, index) =>
        authority.materialize({
          workspaceId: materializedWorkspaceId(`fanout-${count}-${index}`),
          baseRevisionId,
          tree,
        }),
      ),
    );

    await Promise.all(
      workspaces.map(async ({ filesystem }, index) => filesystem.writeFile('branch.txt', `branch-${index}`)),
    );
    const branchValues = await Promise.all(
      workspaces.map(async ({ filesystem }) => filesystem.readFile('branch.txt', 'utf8')),
    );

    expect(branchValues).toEqual(Array.from({ length: count }, (_, index) => `branch-${index}`));
    for (const workspace of workspaces) {
      expect(workspace.metrics).toMatchObject({ files: tree.size, bytes: tree.byteLength });
      expect(workspace.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(workspace.identity.baseRevisionId).toBe(baseRevisionId);
    }
  });

  it('captures a modified isolated root back into a defensive immutable tree', async () => {
    const { authority } = harness();
    const workspace = await authority.materialize({
      workspaceId: materializedWorkspaceId('capture'),
      baseRevisionId: revisionId('rev-base'),
      tree: baseTree(),
    });
    await workspace.filesystem.writeFile('nested/result.ts', 'result');

    const captured = await captureRevisionTree(workspace.filesystem);
    const returned = captured.get('nested/result.ts')!;
    returned[0] = 0;

    expect(captured.entries().map(({ path }) => path)).toEqual([
      'delete-me.txt',
      'main.ts',
      'nested/rename-me.txt',
      'nested/result.ts',
    ]);
    expect(new TextDecoder().decode(captured.get('nested/result.ts'))).toBe('result');
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
    const racing: RootedFileSystem = {
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
    const filesystem: RootedFileSystem = {
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
  /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after path-keyed fixtures. */

  it('rejects duplicate identities, traversal, and use after destruction', async () => {
    const { authority } = harness();
    const workspaceId = materializedWorkspaceId('lifecycle');
    const input = { workspaceId, baseRevisionId: revisionId('rev-base'), tree: baseTree() };
    const workspace = await authority.materialize(input);

    await expect(authority.materialize(input)).rejects.toMatchObject({ code: 'WORKSPACE_EXISTS' });
    await expect(workspace.filesystem.writeFile('../escape.txt', 'escape')).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    await expect(authority.destroy(workspaceId)).resolves.toBe(true);
    await expect(workspace.filesystem.readFile('main.ts')).rejects.toMatchObject({ code: 'WORKSPACE_DISPOSED' });
    await expect(authority.destroy(workspaceId)).resolves.toBe(false);
  });

  it('cancels live streams and refuses reads after capability disposal', async () => {
    const cancelled = vi.fn();
    const { authority } = harness({
      wrap: (filesystem) => ({
        ...filesystem,
        readFileStream: () =>
          new ReadableStream<Uint8Array<ArrayBuffer>>({
            pull(controller) {
              controller.enqueue(new Uint8Array([1]));
            },
            cancel() {
              cancelled();
            },
          }),
      }),
    });
    const workspace = await authority.materialize({
      workspaceId: materializedWorkspaceId('stream-lifecycle'),
      baseRevisionId: revisionId('rev-stream'),
      tree: baseTree(),
    });
    const stream = workspace.filesystem.readFileStream?.('main.ts');
    expect(stream).toBeDefined();

    workspace.filesystem.dispose();
    await vi.waitFor(() => {
      expect(cancelled).toHaveBeenCalledOnce();
    });
    await expect(stream!.getReader().read()).rejects.toMatchObject({ code: 'WORKSPACE_DISPOSED' });
  });

  it('keeps stream cleanup tracked until destroy finishes cancellation', async () => {
    let releaseCancellation: (() => void) | undefined;
    const cancellationGate = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const { authority } = harness({
      wrap: (filesystem) => ({
        ...filesystem,
        readFileStream: () =>
          new ReadableStream<Uint8Array<ArrayBuffer>>({
            cancel: async () => cancellationGate,
          }),
      }),
    });
    const workspaceId = materializedWorkspaceId('stream-destroy-race');
    const workspace = await authority.materialize({
      workspaceId,
      baseRevisionId: revisionId('rev-stream-race'),
      tree: baseTree(),
    });
    workspace.filesystem.readFileStream?.('main.ts');
    workspace.filesystem.dispose();
    let destroyed = false;
    const destroyWorkspace = async (): Promise<void> => {
      destroyed = await authority.destroy(workspaceId);
    };
    const destroy = destroyWorkspace();
    await Promise.resolve();
    expect(destroyed).toBe(false);
    releaseCancellation?.();
    await destroy;
    expect(destroyed).toBe(true);
  });

  it('preserves a source read failure when stream cleanup also rejects', async () => {
    const { authority } = harness({
      wrap: (filesystem) => ({
        ...filesystem,
        readFileStream: () =>
          new ReadableStream<Uint8Array<ArrayBuffer>>({
            pull() {
              throw new Error('source read failed');
            },
            cancel() {
              throw new Error('source cancel failed');
            },
          }),
      }),
    });
    const workspace = await authority.materialize({
      workspaceId: materializedWorkspaceId('stream-read-failure'),
      baseRevisionId: revisionId('rev-stream-failure'),
      tree: baseTree(),
    });
    const reader = workspace.filesystem.readFileStream?.('main.ts').getReader();
    await expect(reader?.read()).rejects.toThrow('source read failed');
  });

  it('refuses destructive removal when stream cancellation fails', async () => {
    const { authority } = harness({
      wrap: (filesystem) => ({
        ...filesystem,
        readFileStream: () =>
          new ReadableStream<Uint8Array<ArrayBuffer>>({
            cancel() {
              throw new Error('descriptor cleanup failed');
            },
          }),
      }),
    });
    const workspaceId = materializedWorkspaceId('stream-cancel-failure');
    const workspace = await authority.materialize({
      workspaceId,
      baseRevisionId: revisionId('rev-stream-cancel-failure'),
      tree: baseTree(),
    });
    workspace.filesystem.readFileStream?.('main.ts');
    workspace.filesystem.dispose();

    await expect(authority.destroy(workspaceId)).rejects.toThrow(
      'Cannot destroy a workspace before every stream is closed.',
    );
    await expect(authority.destroy(workspaceId)).rejects.toThrow('Cannot destroy a workspace');
  });

  it('destroys a workspace whose tree gains a late child between listing and removal', async () => {
    const cacheDirectory = '.tau/workspaces/late-writer/tree/.tau/cache/geometry';
    let lateWrites = 0;
    const { authority } = harness({
      wrap: (filesystem) => ({
        ...filesystem,
        readdir: async (path) => {
          const children = await filesystem.readdir(path);
          if (path === cacheDirectory && lateWrites < 2) {
            lateWrites += 1;
            // The kernel is still writing geometry cache entries into the tree
            // that is being torn down, so this listing is stale before it returns.
            await filesystem.writeFile(`${cacheDirectory}/late-${String(lateWrites)}.bin`, 'late');
          }
          return children;
        },
      }),
    });
    const workspaceId = materializedWorkspaceId('late-writer');
    const workspace = await authority.materialize({
      workspaceId,
      baseRevisionId: revisionId('rev-late-writer'),
      tree: new ImmutableRevisionTree([['main.ts', 'base']]),
    });
    await workspace.filesystem.mkdir('.tau/cache/geometry', { recursive: true });
    await workspace.filesystem.writeFile('.tau/cache/geometry/warm.bin', 'warm');

    await expect(authority.destroy(workspaceId)).resolves.toBe(true);

    expect(lateWrites).toBe(2);
    await expect(authority.reopen(workspaceId)).rejects.toMatchObject({ code: 'WORKSPACE_DISPOSED' });
  });

  it('reopens the exact mutable tree and private metadata after authority replacement', async () => {
    const { authority } = harness();
    const workspaceId = materializedWorkspaceId('reopen-after-crash');
    const original = await authority.materialize({
      workspaceId,
      baseRevisionId: revisionId('rev-reopen-base'),
      tree: baseTree(),
    });
    await original.filesystem.writeFile('main.ts', 'mutation before crash');
    await original.metadata.mkdir('rpc-responses', { recursive: true });
    await original.metadata.writeFile('rpc-responses/request-1.json', '{"durable":true}');
    original.filesystem.dispose();

    const reopened = await authority.reopen(workspaceId);

    expect(reopened.identity).toEqual(original.identity);
    expect(new TextDecoder().decode(reopened.baseTree.get('main.ts'))).toBe('base');
    await expect(reopened.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('mutation before crash');
    await expect(reopened.metadata.readFile('rpc-responses/request-1.json', 'utf8')).resolves.toBe('{"durable":true}');
    await expect(authority.reopen(workspaceId)).rejects.toMatchObject({ code: 'WORKSPACE_EXISTS' });
  });
});
