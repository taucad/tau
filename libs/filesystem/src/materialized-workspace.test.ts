import { afterEach, describe, expect, it } from 'vitest';
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

const createHarness = (options?: { legacyAppend?: boolean }): Harness => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount('/project', provider, {
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
      filesystem,
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
