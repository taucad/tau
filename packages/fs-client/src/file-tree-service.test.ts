import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { FileTreeService } from '#file-tree-service.js';
import type { FileSystemClient } from '#file-system-client.js';
import type { FileTreeNode } from '@taucad/filesystem';
import type { FileEntry, FileStat } from '@taucad/types';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import { DirectoryListingErrorCode, DirectoryListingFailedError } from '#directory-listing.js';
import { WorkspacePathResolver } from '#workspace-path-resolver.js';
import { headlessVisibilityProvider } from '#visibility-provider.js';
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
}): {
  tree: FileTreeService;
  proxy: FileSystemClient;
  disposeChannel: () => void;
} {
  const listen = vi.fn().mockReturnValue(vi.fn());
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
    visibility: headlessVisibilityProvider,
    initialEntries: overrides?.initialEntries,
  });
  return {
    tree,
    proxy,
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
