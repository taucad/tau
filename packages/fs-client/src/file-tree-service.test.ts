import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { FileTreeService } from '#file-tree-service.js';
import type { ExternalPollTelemetry } from '#file-tree-service.js';
import type { FileSystemClient } from '#file-system-client.js';
import type { FileTreeNode } from '@taucad/filesystem';
import type { ChangeEvent, FileEntry, FileStat } from '@taucad/types';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import { DirectoryListingErrorCode, DirectoryListingFailedError } from '#directory-listing.js';
import { WorkspacePathResolver } from '#workspace-path-resolver.js';
import { headlessVisibilityProvider } from '#visibility-provider.js';
import type { VisibilityProvider } from '#visibility-provider.js';
import type { FileContentService, ContentChangeEvent } from '#file-content-service.js';

const workspaceRoot = '/projects/abc';

const textStat = (size = 0, mtimeMs = 0, lineCount = 1): FileStat => ({
  type: 'file',
  size,
  mtimeMs,
  contentKind: 'text',
  lineCount,
});

const textNode = (
  id: string,
  options?: { name?: string; size?: number; mtimeMs?: number; lineCount?: number },
): FileTreeNode => ({
  id,
  name: options?.name ?? id,
  size: options?.size ?? 0,
  mtimeMs: options?.mtimeMs ?? 0,
  contentKind: 'text',
  lineCount: options?.lineCount ?? 1,
});

const textEntry = (path: string): FileEntry => ({
  path,
  name: path,
  type: 'file',
  size: 0,
  mtimeMs: 1,
  isLoaded: false,
  contentKind: 'text',
  lineCount: 1,
});

const directoryNode = (name: string): FileTreeNode => ({
  id: name,
  name,
  size: 0,
  mtimeMs: 1,
  children: [],
});

const directoryEntry = (path: string): FileEntry => ({
  path,
  name: path.split('/').pop() ?? path,
  type: 'dir',
  size: 0,
  mtimeMs: 1,
  isLoaded: false,
});

function connectContentService(tree: FileTreeService): (event: ContentChangeEvent) => void {
  let listener: ((event: ContentChangeEvent) => void) | undefined;
  tree.connectToContentService({
    onDidContentChange(handler: (event: ContentChangeEvent) => void) {
      listener = handler;
      return vi.fn();
    },
  } as unknown as FileContentService);
  return (event) => {
    listener?.(event);
  };
}

function createTreeHarness(overrides?: {
  proxy?: FileSystemClient;
  workspaceRoot?: string;
  initialEntries?: FileEntry[];
  visibility?: VisibilityProvider;
  onExternalPollTelemetry?: ConstructorParameters<typeof FileTreeService>[0]['onExternalPollTelemetry'];
}): {
  tree: FileTreeService;
  proxy: FileSystemClient;
  emitFileChanged: (event: ChangeEvent) => void;
  disposeChannel: () => void;
} {
  let changeHandler: ((data: unknown) => void) | undefined;
  const listen = vi.fn((_event: string, handler: (data: unknown) => void) => {
    changeHandler = handler;
    return vi.fn();
  });
  const root = overrides?.workspaceRoot ?? workspaceRoot;
  const paths = new WorkspacePathResolver(root);
  const channel = new WorkerChangeChannel({ transport: { listen }, paths });
  const proxy =
    overrides?.proxy ??
    mock<FileSystemClient>({
      readDirectory: vi.fn().mockResolvedValue([]),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn().mockResolvedValue(textStat()),
      getDirectoryStat: vi.fn().mockResolvedValue([]),
    });
  const tree = new FileTreeService({
    proxy,
    paths,
    channel,
    visibility: overrides?.visibility ?? headlessVisibilityProvider,
    initialEntries: overrides?.initialEntries,
    onExternalPollTelemetry: overrides?.onExternalPollTelemetry,
  });
  return {
    tree,
    proxy,
    emitFileChanged: (event) => {
      changeHandler?.(event);
    },
    disposeChannel: () => {
      channel.dispose();
    },
  };
}

describe('FileTreeService workspace path canonicalization', () => {
  let harness: ReturnType<typeof createTreeHarness>;

  beforeEach(() => {
    harness = createTreeHarness();
  });

  afterEach(() => {
    harness.disposeChannel();
  });

  describe('listDirectory path canonicalization', () => {
    it('should call readDirectory with the workspace root for every root alias', async () => {
      const aliases = ['', '.', '/', './', '/projects/abc', '/projects/abc/'];
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      for (const alias of aliases) {
        vi.mocked(harness.proxy.readDirectory).mockClear();
        harness.tree.reset(workspaceRoot);
        vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
        // oxlint-disable-next-line no-await-in-loop -- sequential listDirectory avoids race on shared workspace root
        await harness.tree.listDirectory(alias);
        expect(harness.proxy.readDirectory).toHaveBeenCalledWith('/projects/abc');
      }
    });

    it('should resolve ./src and /src to the same absolute path under root', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('./src');
      expect(harness.proxy.readDirectory).toHaveBeenLastCalledWith('/projects/abc/src');
      harness.tree.reset(workspaceRoot);
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('/src');
      expect(harness.proxy.readDirectory).toHaveBeenLastCalledWith('/projects/abc/src');
    });

    it('should reject before calling the proxy when the path escapes the workspace', async () => {
      vi.mocked(harness.proxy.readDirectory).mockClear();
      await expect(harness.tree.listDirectory('/projects/other/deep')).rejects.toBeInstanceOf(
        DirectoryListingFailedError,
      );
      expect(harness.proxy.readDirectory).not.toHaveBeenCalled();
    });
  });

  describe('listDirectory (root aliases vs nested)', () => {
    it('should call readDirectory with the workspace root for root alias path', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('.');
      expect(harness.proxy.readDirectory).toHaveBeenCalledWith('/projects/abc');
    });

    it('should resolve /src under the workspace root', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('/src');
      expect(harness.proxy.readDirectory).toHaveBeenCalledWith('/projects/abc/src');
    });
  });

  describe('stat', () => {
    it('should call stat with the resolved absolute path for /src', async () => {
      await harness.tree.stat('/src');
      expect(harness.proxy.stat).toHaveBeenCalledWith('/projects/abc/src');
    });
  });

  describe('getDirectoryStat', () => {
    it('should call getDirectoryStat with the workspace root for "."', async () => {
      await harness.tree.getDirectoryStat('.');
      expect(harness.proxy.getDirectoryStat).toHaveBeenCalledWith('/projects/abc');
    });
  });

  describe('exists', () => {
    it('should stat the workspace root when checking "."', async () => {
      await harness.tree.exists('.');
      expect(harness.proxy.stat).toHaveBeenCalledWith('/projects/abc');
    });
  });
});

describe('FileTreeService rooted search and external polling', () => {
  it('forwards the current workspace root on every search after reset', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness();
    vi.mocked(proxy.searchFiles).mockResolvedValue([]);

    await tree.searchFiles('first');
    tree.reset('/projects/def');
    await tree.searchFiles('second', { maxResults: 2 });

    expect(proxy.searchFiles).toHaveBeenNthCalledWith(1, '/projects/abc', 'first', undefined);
    expect(proxy.searchFiles).toHaveBeenNthCalledWith(2, '/projects/def', 'second', { maxResults: 2 });
    disposeChannel();
  });

  it('serializes polls and keeps one visibility subscription across interval changes', async () => {
    vi.useFakeTimers();
    let visible = true;
    let onVisibilityChange: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const firstPoll = Promise.withResolvers<void>();
    const report = vi.fn<(aggregate: ExternalPollTelemetry) => void>();
    const proxy = mock<FileSystemClient>({
      pollExternalChanges: vi.fn().mockReturnValueOnce(firstPoll.promise).mockResolvedValue(undefined),
    });
    const { tree, disposeChannel } = createTreeHarness({
      proxy,
      visibility: {
        isVisible: () => visible,
        onVisibilityChange(callback) {
          onVisibilityChange = callback;
          return unsubscribe;
        },
      },
      onExternalPollTelemetry: report,
    });

    tree.startPolling();
    await vi.advanceTimersByTimeAsync(2000);
    expect(proxy.pollExternalChanges).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(proxy.pollExternalChanges).toHaveBeenCalledOnce();

    firstPoll.resolve();
    await vi.advanceTimersByTimeAsync(0);
    visible = false;
    onVisibilityChange?.();
    await vi.advanceTimersByTimeAsync(9999);
    expect(proxy.pollExternalChanges).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(proxy.pollExternalChanges).toHaveBeenCalledTimes(2);

    tree.reset('/projects/def');
    visible = true;
    onVisibilityChange?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(proxy.pollExternalChanges).toHaveBeenCalledTimes(3);
    expect(proxy.pollExternalChanges).toHaveBeenNthCalledWith(1, '/projects/abc');
    expect(proxy.pollExternalChanges).toHaveBeenNthCalledWith(2, '/projects/abc');
    expect(proxy.pollExternalChanges).toHaveBeenNthCalledWith(3, '/projects/def');
    expect(unsubscribe).not.toHaveBeenCalled();

    tree.stopPolling();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({
      count: 3,
      successes: 3,
      failures: 0,
      visible: 2,
      hidden: 1,
      p50: 0,
      p95: 10_000,
    });
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('emits one bounded minute aggregate without adding a telemetry timer', async () => {
    vi.useFakeTimers();
    const report = vi.fn<(aggregate: ExternalPollTelemetry) => void>();
    const poll = vi.fn().mockRejectedValueOnce(new Error('first poll failed')).mockResolvedValue(undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const proxy = mock<FileSystemClient>({ pollExternalChanges: poll });
    const { tree, disposeChannel } = createTreeHarness({ proxy, onExternalPollTelemetry: report });

    tree.startPolling();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(poll).toHaveBeenCalledTimes(35);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({
      count: 30,
      successes: 29,
      failures: 1,
      visible: 30,
      hidden: 0,
      p50: 0,
      p95: 0,
    });
    expect(Object.keys(report.mock.calls[0]![0]).sort()).toEqual([
      'count',
      'failures',
      'hidden',
      'p50',
      'p95',
      'successes',
      'visible',
    ]);
    expect(vi.getTimerCount()).toBe(1);

    report.mockImplementationOnce(() => {
      throw new Error('analytics unavailable');
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(71);
    expect(report).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);

    tree.stopPolling();
    expect(vi.getTimerCount()).toBe(0);
    tree.dispose();
    disposeChannel();
    consoleError.mockRestore();
    vi.useRealTimers();
  });

  it('adds one global reconciliation after every five completed rooted polls', async () => {
    vi.useFakeTimers();
    const pollExternalChanges = vi.fn().mockResolvedValue(undefined);
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({ pollExternalChanges }),
    });

    tree.startPolling();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(pollExternalChanges).toHaveBeenCalledTimes(6);
    expect(pollExternalChanges.mock.calls.slice(0, 5)).toEqual([
      ['/projects/abc'],
      ['/projects/abc'],
      ['/projects/abc'],
      ['/projects/abc'],
      ['/projects/abc'],
    ]);
    expect(pollExternalChanges.mock.calls[5]).toEqual([]);
    tree.stopPolling();
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('includes a poll that finishes after stop in the final aggregate', async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<void>();
    const report = vi.fn<(aggregate: ExternalPollTelemetry) => void>();
    const proxy = mock<FileSystemClient>({ pollExternalChanges: vi.fn().mockReturnValue(pending.promise) });
    const { tree, disposeChannel } = createTreeHarness({ proxy, onExternalPollTelemetry: report });

    tree.startPolling();
    await vi.advanceTimersByTimeAsync(2000);
    tree.stopPolling();
    expect(report).not.toHaveBeenCalled();

    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledWith({
      count: 1,
      successes: 1,
      failures: 0,
      visible: 1,
      hidden: 0,
      p50: 0,
      p95: 0,
    });
    expect(vi.getTimerCount()).toBe(0);

    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });
});

describe('FileTreeService mergeChildren / isDirectoryResolved', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve FileEntry object identity when disk listing is unchanged', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listen = vi.fn().mockReturnValue(vi.fn());
    const paths = new WorkspacePathResolver(workspaceRoot);
    const channel = new WorkerChangeChannel({ transport: { listen }, paths });
    const proxy = mock<FileSystemClient>({
      readDirectory: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn().mockResolvedValue(textStat()),
      getDirectoryStat: vi.fn().mockResolvedValue([]),
    });
    const tree = new FileTreeService({
      proxy,
      paths,
      channel,
      visibility: headlessVisibilityProvider,
      refreshDebounce: 10,
    });
    vi.mocked(proxy.readDirectory).mockResolvedValue([textNode('a.ts', { size: 1 })]);
    await tree.listDirectory('');
    const ref1 = tree.getTreeSnapshot().get('a.ts');
    expect(ref1).toBeDefined();
    vi.mocked(proxy.readDirectory).mockResolvedValue([textNode('a.ts', { size: 1 })]);
    tree.scheduleRefresh('');
    await vi.advanceTimersByTimeAsync(50);
    const ref2 = tree.getTreeSnapshot().get('a.ts');
    expect(ref2).toBe(ref1);
    tree.dispose();
    vi.useRealTimers();
  });

  it('should keep a pending root refresh when a narrower write arrives inside the debounce window', async () => {
    vi.useFakeTimers();
    const { tree, proxy, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi.fn().mockResolvedValue([]),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
      initialEntries: [
        {
          ...directoryEntry('src'),
          isDirectoryResolved: true,
        },
      ],
    });
    vi.mocked(proxy.readDirectory).mockClear();

    tree.scheduleRefresh('');
    emitFileChanged({ type: 'fileWritten', path: '/projects/abc/src/main.ts', backend: 'indexeddb' });
    await vi.advanceTimersByTimeAsync(100);

    expect(proxy.readDirectory).toHaveBeenCalledOnce();
    expect(proxy.readDirectory).toHaveBeenCalledWith('/projects/abc');
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('should deeply resync every still-resolved directory after backendChanged under traffic', async () => {
    vi.useFakeTimers();
    let updated = false;
    const readDirectory = vi.fn(async (path: string): Promise<FileTreeNode[]> => {
      if (path === '/projects/abc') {
        return [directoryNode('src')];
      }
      if (path === '/projects/abc/src') {
        return [directoryNode('nested')];
      }
      if (path === '/projects/abc/src/nested') {
        return [textNode(updated ? 'new.ts' : 'old.ts')];
      }
      return [];
    });
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory,
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    await tree.listDirectory('');
    await tree.listDirectory('src');
    await tree.listDirectory('src/nested');
    expect(tree.getTreeSnapshot().has('src/nested/old.ts')).toBe(true);
    updated = true;
    readDirectory.mockClear();

    emitFileChanged({ type: 'backendChanged', backend: 'indexeddb' });
    emitFileChanged({ type: 'fileWritten', path: '/projects/abc/src/other.ts', backend: 'indexeddb' });
    await vi.waitFor(() => {
      expect(tree.getTreeSnapshot().has('src/nested/new.ts')).toBe(true);
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(tree.getTreeSnapshot().has('src/nested/old.ts')).toBe(false);
    expect(readDirectory).toHaveBeenCalledWith('/projects/abc');
    expect(readDirectory).toHaveBeenCalledWith('/projects/abc/src');
    expect(readDirectory).toHaveBeenCalledWith('/projects/abc/src/nested');
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('should discard a refresh parked behind a backend resync after reset', async () => {
    vi.useFakeTimers();
    const resync = Promise.withResolvers<FileTreeNode[]>();
    const readDirectory = vi
      .fn()
      .mockReturnValueOnce(resync.promise)
      .mockResolvedValue([textNode('leak.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory,
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
      initialEntries: [textEntry('old.ts')],
    });

    emitFileChanged({ type: 'backendChanged', backend: 'indexeddb' });
    tree.scheduleRefresh('stale');
    await vi.advanceTimersByTimeAsync(100);
    expect(readDirectory).toHaveBeenCalledOnce();
    expect(readDirectory).toHaveBeenCalledWith('/projects/abc');

    tree.reset('/new/root');
    resync.resolve([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(readDirectory).not.toHaveBeenCalledWith('/new/root/stale');
    expect(tree.getTreeSnapshot().has('stale/leak.ts')).toBe(false);
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('should remove every cached descendant when a refreshed child directory vanishes', async () => {
    vi.useFakeTimers();
    const readDirectory = vi
      .fn()
      .mockResolvedValueOnce([directoryNode('old')])
      .mockResolvedValueOnce([directoryNode('nested')])
      .mockResolvedValueOnce([textNode('file.ts')])
      .mockResolvedValueOnce([]);
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory,
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    await tree.listDirectory('');
    await tree.listDirectory('old');
    await tree.listDirectory('old/nested');
    expect(tree.getCachedFileItems().map(({ path }) => path)).toContain('old/nested/file.ts');

    tree.scheduleRefresh('');
    await vi.advanceTimersByTimeAsync(100);

    expect([...tree.getTreeSnapshot().keys()].filter((path) => path.startsWith('old'))).toEqual([]);
    expect(tree.getCachedFileItems().map(({ path }) => path)).not.toContain('old/nested/file.ts');
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('should remove tree entries when disk children disappear', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi.fn(),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([textNode('gone.ts'), textNode('stay.ts')]);
    await tree.listDirectory('');
    expect(tree.getTreeSnapshot().has('gone.ts')).toBe(true);
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([textNode('stay.ts')]);
    tree.reset(workspaceRoot);
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([textNode('stay.ts')]);
    await tree.listDirectory('');
    const snap = tree.getTreeSnapshot();
    expect(snap.has('gone.ts')).toBe(false);
    expect(snap.has('stay.ts')).toBe(true);
    disposeChannel();
  });

  it('should set isDirectoryResolved on root when initialEntries bootstrap runs', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const paths = new WorkspacePathResolver(workspaceRoot);
    const channel = new WorkerChangeChannel({ transport: { listen }, paths });
    const tree = new FileTreeService({
      proxy: mock<FileSystemClient>(),
      paths,
      channel,
      visibility: headlessVisibilityProvider,
      initialEntries: [textEntry('x')],
    });
    expect(tree.hasChildrenLoaded('')).toBe(true);
    const root = tree.getTreeSnapshot().get('');
    expect(root?.type).toBe('dir');
    expect(root?.isDirectoryResolved).toBe(true);
    channel.dispose();
  });

  it('should not mark root resolved when initialEntries is empty', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const paths = new WorkspacePathResolver(workspaceRoot);
    const channel = new WorkerChangeChannel({ transport: { listen }, paths });
    const tree = new FileTreeService({
      proxy: mock<FileSystemClient>(),
      paths,
      channel,
      visibility: headlessVisibilityProvider,
      initialEntries: [],
    });
    expect(tree.hasChildrenLoaded('')).toBe(false);
    channel.dispose();
  });

  it('should apply directoryCreated content events to resolved parents', () => {
    const { tree, disposeChannel } = createTreeHarness({ initialEntries: [textEntry('main.ts')] });
    const emit = connectContentService(tree);

    emit({ type: 'directoryCreated', path: 'newdir' });

    const entry = tree.getTreeSnapshot().get('newdir');
    expect(entry?.type).toBe('dir');
    disposeChannel();
  });

  it('should drop directory descendants on directoryDeleted content events', () => {
    const { tree, disposeChannel } = createTreeHarness({
      initialEntries: [directoryEntry('old'), textEntry('old/file.ts')],
    });
    const emit = connectContentService(tree);

    emit({ type: 'directoryDeleted', path: 'old' });

    expect(tree.getTreeSnapshot().has('old')).toBe(false);
    expect(tree.getTreeSnapshot().has('old/file.ts')).toBe(false);
    disposeChannel();
  });

  it('should rekey directory descendants on directoryRenamed content events', () => {
    const { tree, disposeChannel } = createTreeHarness({
      initialEntries: [directoryEntry('old'), textEntry('old/file.ts')],
    });
    const emit = connectContentService(tree);

    emit({ type: 'directoryRenamed', oldPath: 'old', newPath: 'new' });

    expect(tree.getTreeSnapshot().has('old')).toBe(false);
    expect(tree.getTreeSnapshot().has('old/file.ts')).toBe(false);
    expect(tree.getTreeSnapshot().has('new')).toBe(true);
    expect(tree.getTreeSnapshot().has('new/file.ts')).toBe(true);
    disposeChannel();
  });
});

describe('FileTreeService listDirectory / subscribePath', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should reject with NotFound when readDirectory fails with ENOENT', async () => {
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi.fn().mockRejectedValue(Object.assign(new Error('enoent'), { code: 'ENOENT' })),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    await expect(tree.listDirectory('missing')).rejects.toMatchObject({
      listing: { code: DirectoryListingErrorCode.NotFound },
    });
    disposeChannel();
  });

  it('should return sync entries after cold load without empty array on success', async () => {
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi
          .fn()
          .mockResolvedValueOnce([textNode('a.ts', { size: 1 })])
          .mockResolvedValue([]),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    const rows = await tree.listDirectory('');
    expect(rows.map((r) => r.name)).toContain('a.ts');
    const sync = tree.listDirectorySync('');
    expect(sync?.every((r) => rows.some((x) => x.path === r.path))).toBe(true);
    disposeChannel();
  });

  it('should propagate size and mtimeMs from readDirectory into listed rows', async () => {
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi
          .fn()
          .mockResolvedValueOnce([
            textNode('doc.ts', { size: 42, mtimeMs: 1_700_000_000_000, lineCount: 3 }),
            { id: 'sub', name: 'sub', size: 0, mtimeMs: 2, children: [] },
          ])
          .mockResolvedValue([]),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    const rows = await tree.listDirectory('');
    const fileRow = rows.find((r) => r.name === 'doc.ts');
    expect(fileRow?.size).toBe(42);
    expect(fileRow?.mtimeMs).toBe(1_700_000_000_000);
    const directoryRow = rows.find((r) => r.name === 'sub');
    expect(directoryRow?.isFolder).toBe(true);
    expect(directoryRow?.size).toBe(0);
    expect(directoryRow?.mtimeMs).toBe(2);
    disposeChannel();
  });

  it('should dedupe concurrent listDirectory for the same path', async () => {
    let resolveRead!: (v: FileTreeNode[]) => void;
    const readPromise = new Promise<FileTreeNode[]>((resolve) => {
      resolveRead = resolve;
    });
    const { tree, proxy, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi.fn().mockReturnValue(readPromise),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    const first = tree.listDirectory('');
    const second = tree.listDirectory('');
    resolveRead([textNode('x')]);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(vi.mocked(proxy.readDirectory)).toHaveBeenCalledTimes(1);
    disposeChannel();
  });

  it('should notify subscribePath when mergeChildren updates that directory', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness({
      proxy: mock<FileSystemClient>({
        readDirectory: vi.fn(),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    const callback = vi.fn();
    tree.subscribePath('', callback);
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([textNode('n.ts')]);
    await tree.listDirectory('');
    expect(callback).toHaveBeenCalled();
    disposeChannel();
  });
});
