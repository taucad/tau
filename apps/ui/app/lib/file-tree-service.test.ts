import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { ChangeEvent, FileEntry, FileStatEntry } from '@taucad/types';
import type { FileTreeNode } from '@taucad/filesystem';
import { parametersDirectory } from '#utils/parameter-config.utils.js';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { headlessVisibilityProvider } from '@taucad/fs-client/visibility-provider';
import type { VisibilityProvider } from '@taucad/fs-client/visibility-provider';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';

function createTreeHarness(
  init?: Partial<Omit<ConstructorParameters<typeof FileTreeService>[0], 'paths' | 'channel' | 'visibility'>> & {
    workspaceRoot?: string;
    paths?: WorkspacePathResolver;
    visibility?: VisibilityProvider;
  },
): { service: FileTreeService; proxy: FileSystemClient; emitWorker: (event: ChangeEvent) => void } {
  const listen = vi.fn().mockReturnValue(vi.fn());
  const workspaceRoot = init?.workspaceRoot ?? '/project';
  const paths = init?.paths ?? new WorkspacePathResolver(workspaceRoot);
  const channel = new WorkerChangeChannel({ transport: { listen }, paths });
  const visibility = init?.visibility ?? headlessVisibilityProvider;
  const {
    workspaceRoot: _workspaceRoot,
    paths: _pathsIn,
    visibility: _visibilityIn,
    proxy: inputProxy,
    ...rest
  } = init ?? {};
  const proxyInstance = inputProxy ?? createMockProxy();
  const service = new FileTreeService({
    ...rest,
    proxy: proxyInstance,
    paths,
    channel,
    visibility,
  });
  const emitWorker = (event: ChangeEvent): void => {
    (listen.mock.calls[0]![1] as (data: unknown) => void)(event);
  };
  return { service, proxy: proxyInstance, emitWorker };
}

function createContentServiceForTree(proxyInstance: FileSystemClient): FileContentService {
  const listen = vi.fn().mockReturnValue(vi.fn());
  const paths = new WorkspacePathResolver('/project');
  const channel = new WorkerChangeChannel({ transport: { listen }, paths });
  const refreshGuard = new RefreshGenerationGuard();
  return new FileContentService({
    proxy: proxyInstance,
    paths,
    channel,
    refreshGuard,
  });
}

function createMockProxy(overrides?: Partial<FileManagerProxy>): FileManagerProxy {
  return {
    readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writeFiles: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    unlink: vi.fn().mockResolvedValue(undefined),
    copyDirectory: vi.fn().mockResolvedValue(undefined),
    getZippedDirectory: vi.fn().mockResolvedValue(new Blob()),
    duplicateFile: vi.fn().mockResolvedValue(undefined),
    getDirectoryStat: vi.fn().mockResolvedValue([]),
    readDirectory: vi.fn().mockResolvedValue([]),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    rmdir: vi.fn().mockResolvedValue(undefined),
    readShallowDirectory: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as FileManagerProxy;
}

function createEntry(path: string, type: 'file' | 'dir' = 'file', size = 100): FileEntry {
  const parts = path.split('/');
  return { path, name: parts.at(-1) ?? path, type, size, mtimeMs: 0, isLoaded: false };
}

describe('FileTreeService', () => {
  let proxy: FileSystemClient;
  let service: FileTreeService;
  let emitWorker: (event: ChangeEvent) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    const harness = createTreeHarness({
      proxy: createMockProxy(),
      initialEntries: [createEntry('main.ts'), createEntry('lib/utils.ts'), createEntry('lib/helpers.ts')],
    });
    proxy = harness.proxy;
    service = harness.service;
    emitWorker = harness.emitWorker;
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  it('should return tree snapshot with stable reference when unchanged', () => {
    const snap1 = service.getTreeSnapshot();
    const snap2 = service.getTreeSnapshot();
    expect(snap1).toBe(snap2);
  });

  it('should return true from exists() for known paths', async () => {
    expect(await service.exists('main.ts')).toBe(true);
    expect(await service.exists('lib/utils.ts')).toBe(true);
  });

  it('should return child names from listDirectory for a path', async () => {
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([
      { id: 'utils.ts', name: 'utils.ts', size: 1, mtimeMs: 0 },
      { id: 'helpers.ts', name: 'helpers.ts', size: 2, mtimeMs: 0 },
    ]);
    const entries = await service.listDirectory('lib');
    const names = entries.map((entry) => entry.name);
    expect(names).toContain('utils.ts');
    expect(names).toContain('helpers.ts');
    expect(names).not.toContain('main.ts');
  });

  it('should debounce refresh when rapid mutations occur', async () => {
    service.scheduleRefresh('lib');
    service.scheduleRefresh('lib');
    service.scheduleRefresh('lib');

    await vi.advanceTimersByTimeAsync(50);
    expect(proxy.readDirectory).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    expect(proxy.readDirectory).toHaveBeenCalledOnce();
  });

  it('should refresh only the changed files parent directory', async () => {
    vi.useRealTimers();

    const readDirectoryNodes: FileTreeNode[] = [
      { id: 'utils.ts', name: 'utils.ts', size: 1, mtimeMs: 0 },
      { id: 'helpers.ts', name: 'helpers.ts', size: 1, mtimeMs: 0 },
      { id: 'new-file.ts', name: 'new-file.ts', size: 1, mtimeMs: 0 },
    ];
    const localProxy = createMockProxy({
      readDirectory: vi.fn().mockResolvedValue(readDirectoryNodes),
    });
    const { service: localService } = createTreeHarness({
      proxy: localProxy,
      initialEntries: [createEntry('main.ts'), createEntry('lib/utils.ts'), createEntry('lib/helpers.ts')],
      refreshDebounce: 10,
    });

    localService.scheduleRefresh('lib');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(localProxy.readDirectory).toHaveBeenCalledWith('/project/lib');
    expect(await localService.exists('lib/new-file.ts')).toBe(true);
    expect(await localService.exists('main.ts')).toBe(true);

    localService.dispose();
    vi.useFakeTimers();
  });

  it('should skip tree refresh for source=editor content changes', () => {
    const contentProxy = createMockProxy();
    const contentService = createContentServiceForTree(contentProxy);

    service.connectToContentService(contentService);

    vi.mocked(contentProxy.writeFile).mockResolvedValue(undefined);
    void contentService.write('main.ts', new Uint8Array([1]), 'editor');

    expect((service as unknown as { refreshTimer: unknown }).refreshTimer).toBeUndefined();

    contentService.dispose();
  });

  it('should apply optimistic tree update on content written event', async () => {
    const contentProxy = createMockProxy();
    const contentService = createContentServiceForTree(contentProxy);
    service.connectToContentService(contentService);

    vi.mocked(contentProxy.writeFile).mockResolvedValue(undefined);
    await contentService.write('newfile.ts', new Uint8Array([1, 2, 3]), 'machine');

    expect(await service.exists('newfile.ts')).toBe(true);
    const entry = await service.getEntry('newfile.ts');
    expect(entry?.type).toBe('file');
    expect(entry?.size).toBe(3);

    contentService.dispose();
  });

  it('should apply optimistic tree update on content deleted event', async () => {
    const contentProxy = createMockProxy();
    const contentService = createContentServiceForTree(contentProxy);
    service.connectToContentService(contentService);

    expect(await service.exists('main.ts')).toBe(true);

    vi.mocked(contentProxy.unlink).mockResolvedValue(undefined);
    await contentService.delete('main.ts', 'user');

    expect(service.getTreeSnapshot().has('main.ts')).toBe(false);

    contentService.dispose();
  });

  it('should apply optimistic tree update on content renamed event', async () => {
    const contentProxy = createMockProxy();
    const contentService = createContentServiceForTree(contentProxy);
    service.connectToContentService(contentService);

    vi.mocked(contentProxy.rename).mockResolvedValue(undefined);
    await contentService.rename('main.ts', 'app.ts');

    expect(service.getTreeSnapshot().has('main.ts')).toBe(false);
    expect(service.getTreeSnapshot().has('app.ts')).toBe(true);

    contentService.dispose();
  });

  it('should notify subscribers when tree changes', async () => {
    const subscriber = vi.fn();
    service.subscribeTree(subscriber);

    const contentProxy = createMockProxy();
    const contentService = createContentServiceForTree(contentProxy);
    service.connectToContentService(contentService);

    vi.mocked(contentProxy.writeFile).mockResolvedValue(undefined);
    await contentService.write('new.ts', new Uint8Array([1]), 'user');

    expect(subscriber).toHaveBeenCalled();

    contentService.dispose();
  });

  // ── hasChildrenLoaded ──

  describe('hasChildrenLoaded', () => {
    it('should return false for root when no initialEntries are provided', () => {
      const { service: emptyService } = createTreeHarness({
        proxy: createMockProxy(),
      });

      expect(emptyService.hasChildrenLoaded('')).toBe(false);

      emptyService.dispose();
    });

    it('should return true for root when direct root children exist', () => {
      expect(service.hasChildrenLoaded('')).toBe(true);
    });
  });

  // ── Directory resolution tracking (VS Code _isDirectoryResolved pattern) ──

  describe('directory resolution tracking', () => {
    it('should return false from hasChildrenLoaded for directory not yet loaded via listDirectory', () => {
      const { service: localService } = createTreeHarness({
        proxy: createMockProxy(),
        initialEntries: [createEntry('.tau', 'dir'), createEntry('main.ts')],
      });

      expect(localService.hasChildrenLoaded('.tau')).toBe(false);

      localService.dispose();
    });

    it('should return true from hasChildrenLoaded after listDirectory resolves', async () => {
      vi.useRealTimers();
      const localProxy = createMockProxy({
        readDirectory: vi.fn().mockResolvedValue([
          {
            id: 'parameters',
            name: 'parameters',
            size: 0,
            mtimeMs: 0,
            children: [{ id: 'main.ts.json', name: 'main.ts.json', size: 0, mtimeMs: 0 }],
          },
          { id: 'cache', name: 'cache', size: 0, mtimeMs: 0, children: [] },
        ]),
      });
      const { service: localService } = createTreeHarness({
        proxy: localProxy,
        initialEntries: [createEntry('.tau', 'dir')],
      });

      await localService.listDirectory('.tau');

      expect(localService.hasChildrenLoaded('.tau')).toBe(true);
      expect(localService.getTreeSnapshot().has(parametersDirectory)).toBe(true);
      expect(localService.getTreeSnapshot().has('.tau/cache')).toBe(true);

      localService.dispose();
      vi.useFakeTimers();
    });

    it('should return false from hasChildrenLoaded after reset clears resolution state', async () => {
      vi.useRealTimers();
      const localProxy = createMockProxy({
        readDirectory: vi.fn().mockResolvedValue([
          {
            id: 'parameters',
            name: 'parameters',
            size: 0,
            mtimeMs: 0,
            children: [{ id: 'main.ts.json', name: 'main.ts.json', size: 0, mtimeMs: 0 }],
          },
        ]),
      });
      const { service: localService } = createTreeHarness({
        proxy: localProxy,
        initialEntries: [createEntry('.tau', 'dir')],
      });

      await localService.listDirectory('.tau');
      expect(localService.hasChildrenLoaded('.tau')).toBe(true);

      localService.reset('/project', [createEntry('.tau', 'dir')]);

      expect(localService.hasChildrenLoaded('.tau')).toBe(false);

      localService.dispose();
      vi.useFakeTimers();
    });

    it('should not mark directory as resolved from optimistic content read events', async () => {
      vi.useRealTimers();
      const localProxy = createMockProxy({
        readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        readDirectory: vi.fn().mockResolvedValue([
          {
            id: 'parameters',
            name: 'parameters',
            size: 0,
            mtimeMs: 0,
            children: [{ id: 'main.ts.json', name: 'main.ts.json', size: 0, mtimeMs: 0 }],
          },
          { id: 'cache', name: 'cache', size: 0, mtimeMs: 0, children: [] },
          { id: 'artifacts', name: 'artifacts', size: 0, mtimeMs: 0, children: [] },
        ]),
      });
      const { service: localService } = createTreeHarness({
        proxy: localProxy,
        initialEntries: [createEntry('.tau', 'dir')],
      });
      const contentService = createContentServiceForTree(localProxy);
      localService.connectToContentService(contentService);

      await contentService.resolve(`${parametersDirectory}/main.ts.json`);

      expect(localService.hasChildrenLoaded('.tau')).toBe(false);

      await localService.listDirectory('.tau');

      expect(localService.hasChildrenLoaded('.tau')).toBe(true);
      expect(localService.getTreeSnapshot().has(parametersDirectory)).toBe(true);
      expect(localService.getTreeSnapshot().has('.tau/cache')).toBe(true);
      expect(localService.getTreeSnapshot().has('.tau/artifacts')).toBe(true);

      contentService.dispose();
      localService.dispose();
      vi.useFakeTimers();
    });

    it('should not mark directory as resolved from optimistic content write events', async () => {
      vi.useRealTimers();
      const localProxy = createMockProxy({
        readDirectory: vi.fn().mockResolvedValue([
          {
            id: 'parameters',
            name: 'parameters',
            size: 0,
            mtimeMs: 0,
            children: [{ id: 'main.ts.json', name: 'main.ts.json', size: 0, mtimeMs: 0 }],
          },
          { id: 'cache', name: 'cache', size: 0, mtimeMs: 0, children: [] },
        ]),
      });
      const { service: localService } = createTreeHarness({
        proxy: localProxy,
        initialEntries: [createEntry('.tau', 'dir')],
      });
      const contentService = createContentServiceForTree(localProxy);
      localService.connectToContentService(contentService);

      vi.mocked(localProxy.writeFile).mockResolvedValue(undefined);
      await contentService.write(`${parametersDirectory}/main.ts.json`, new Uint8Array([1, 2, 3]), 'machine');

      expect(localService.getTreeSnapshot().has(`${parametersDirectory}/main.ts.json`)).toBe(true);
      expect(localService.hasChildrenLoaded('.tau')).toBe(false);

      await localService.listDirectory('.tau');

      expect(localService.hasChildrenLoaded('.tau')).toBe(true);
      expect(localService.getTreeSnapshot().has('.tau/cache')).toBe(true);

      contentService.dispose();
      localService.dispose();
      vi.useFakeTimers();
    });

    it('should mark directory as resolved after executeRefresh patches entries', async () => {
      const localProxy = createMockProxy({
        readDirectory: vi.fn().mockResolvedValue([
          {
            id: 'parameters',
            name: 'parameters',
            size: 0,
            mtimeMs: 0,
            children: [{ id: 'main.ts.json', name: 'main.ts.json', size: 0, mtimeMs: 0 }],
          },
          { id: 'cache', name: 'cache', size: 0, mtimeMs: 0, children: [] },
        ]),
      });
      const { service: localService } = createTreeHarness({
        proxy: localProxy,
        initialEntries: [createEntry('.tau', 'dir')],
        refreshDebounce: 10,
      });

      expect(localService.hasChildrenLoaded('.tau')).toBe(false);

      localService.scheduleRefresh('.tau');
      await vi.advanceTimersByTimeAsync(50);

      expect(localService.hasChildrenLoaded('.tau')).toBe(true);
      expect(localService.getTreeSnapshot().has(parametersDirectory)).toBe(true);
      expect(localService.getTreeSnapshot().has('.tau/cache')).toBe(true);

      localService.dispose();
    });
  });

  // ── exists() async two-tier ──

  describe('exists (async two-tier)', () => {
    it('should return true for paths in the local tree without proxy call', async () => {
      expect(await service.exists('main.ts')).toBe(true);
      expect(proxy.stat).not.toHaveBeenCalled();
    });

    it('should return true for paths not in local tree but found via proxy.stat', async () => {
      vi.mocked(proxy.stat).mockResolvedValueOnce({ type: 'file', size: 42, mtimeMs: 1000 });

      expect(await service.exists('deep/nested/file.ts')).toBe(true);
      expect(proxy.stat).toHaveBeenCalledWith('/project/deep/nested/file.ts');
    });

    it('should return false when both local tree and proxy.stat miss', async () => {
      vi.mocked(proxy.stat).mockRejectedValueOnce(new Error('ENOENT'));

      expect(await service.exists('nonexistent.ts')).toBe(false);
    });
  });

  // ── getEntry() async two-tier ──

  describe('getEntry (async two-tier)', () => {
    it('should return cached entry for paths in local tree', async () => {
      const entry = await service.getEntry('main.ts');
      expect(entry).toBeDefined();
      expect(entry?.path).toBe('main.ts');
      expect(entry?.type).toBe('file');
      expect(proxy.stat).not.toHaveBeenCalled();
    });

    it('should return entry from proxy.stat for paths not in local tree', async () => {
      vi.mocked(proxy.stat).mockResolvedValueOnce({ type: 'file', size: 42, mtimeMs: 1000 });

      const entry = await service.getEntry('deep/file.ts');

      expect(entry).toBeDefined();
      expect(entry?.path).toBe('deep/file.ts');
      expect(entry?.name).toBe('file.ts');
      expect(entry?.type).toBe('file');
      expect(entry?.size).toBe(42);
    });

    it('should return undefined when both tree and proxy miss', async () => {
      vi.mocked(proxy.stat).mockRejectedValueOnce(new Error('ENOENT'));

      const entry = await service.getEntry('nonexistent.ts');

      expect(entry).toBeUndefined();
    });
  });

  // ── handleContentChange 'read' events ──

  describe('content read events', () => {
    it('should not add file to tree when content service emits a read event', async () => {
      const contentProxy = createMockProxy();
      const contentService = createContentServiceForTree(contentProxy);
      service.connectToContentService(contentService);

      expect(service.getTreeSnapshot().has('newfile.ts')).toBe(false);

      vi.mocked(contentProxy.readFile).mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]));
      await contentService.resolve('newfile.ts');

      expect(service.getTreeSnapshot().has('newfile.ts')).toBe(false);

      contentService.dispose();
    });
  });

  // ── getCachedFileItems (tree-derived, sync, no worker RPC) ──

  describe('getCachedFileItems', () => {
    it('should return file items derived from the tree without calling getDirectoryStat', () => {
      const items = service.getCachedFileItems();

      expect(items).toHaveLength(3);
      expect(items).toEqual(
        expect.arrayContaining([
          { path: 'main.ts', size: 100 },
          { path: 'lib/utils.ts', size: 100 },
          { path: 'lib/helpers.ts', size: 100 },
        ]),
      );
      expect(proxy.getDirectoryStat).not.toHaveBeenCalled();
    });

    it('should return only file entries and exclude directories', () => {
      const { service: localService } = createTreeHarness({
        proxy: createMockProxy(),
        initialEntries: [createEntry('main.ts'), createEntry('lib', 'dir'), createEntry('lib/utils.ts')],
      });

      const items = localService.getCachedFileItems();
      expect(items).toHaveLength(2);
      expect(items.every((item) => !item.path.endsWith('lib') || item.path.includes('/'))).toBe(true);
      expect(items.find((item) => item.path === 'lib')).toBeUndefined();

      localService.dispose();
    });

    it('should return same reference on consecutive calls without tree changes', () => {
      const first = service.getCachedFileItems();
      const second = service.getCachedFileItems();

      expect(first).toBe(second);
    });

    it('should invalidate cache when optimistic add occurs', async () => {
      const contentProxy = createMockProxy();
      const contentService = createContentServiceForTree(contentProxy);
      service.connectToContentService(contentService);

      const before = service.getCachedFileItems();
      expect(before).toHaveLength(3);

      vi.mocked(contentProxy.writeFile).mockResolvedValue(undefined);
      await contentService.write('new.ts', new Uint8Array([1, 2, 3]), 'user');

      const after = service.getCachedFileItems();
      expect(after).not.toBe(before);
      expect(after).toHaveLength(4);
      expect(after.find((item) => item.path === 'new.ts')).toEqual({ path: 'new.ts', size: 3 });

      contentService.dispose();
    });

    it('should invalidate cache when optimistic delete occurs', async () => {
      const contentProxy = createMockProxy();
      const contentService = createContentServiceForTree(contentProxy);
      service.connectToContentService(contentService);

      const before = service.getCachedFileItems();
      expect(before).toHaveLength(3);

      vi.mocked(contentProxy.unlink).mockResolvedValue(undefined);
      await contentService.delete('main.ts', 'user');

      const after = service.getCachedFileItems();
      expect(after).toHaveLength(2);
      expect(after.find((item) => item.path === 'main.ts')).toBeUndefined();

      contentService.dispose();
    });

    it('should reflect newly loaded directories after listDirectory', async () => {
      vi.useRealTimers();
      const localProxy = createMockProxy({
        readDirectory: vi.fn().mockResolvedValue([
          { id: 'cache', name: 'cache', size: 0, mtimeMs: 0, children: [] },
          { id: 'params.json', name: 'params.json', size: 10, mtimeMs: 0 },
        ]),
      });
      const { service: localService } = createTreeHarness({
        proxy: localProxy,
        initialEntries: [createEntry('main.ts'), createEntry('.tau', 'dir')],
      });

      const before = localService.getCachedFileItems();
      expect(before).toHaveLength(1);

      await localService.listDirectory('.tau');

      const after = localService.getCachedFileItems();
      expect(after).toHaveLength(2);
      expect(after.find((item) => item.path === '.tau/params.json')).toBeDefined();

      localService.dispose();
      vi.useFakeTimers();
    });

    it('should return empty array when tree has no file entries', () => {
      const { service: emptyService } = createTreeHarness({
        proxy: createMockProxy(),
        initialEntries: [createEntry('lib', 'dir'), createEntry('src', 'dir')],
      });

      const items = emptyService.getCachedFileItems();
      expect(items).toHaveLength(0);

      emptyService.dispose();
    });

    it('should invalidate cache after reset', () => {
      const first = service.getCachedFileItems();
      expect(first).toHaveLength(3);

      service.reset('/project', [createEntry('x.ts', 'file', 42)]);

      const after = service.getCachedFileItems();
      expect(after).toHaveLength(1);
      expect(after[0]).toEqual({ path: 'x.ts', size: 42 });
    });

    it('should expose completeTreeVersion that increments on change', async () => {
      const contentProxy = createMockProxy();
      const contentService = createContentServiceForTree(contentProxy);
      service.connectToContentService(contentService);

      const v1 = service.completeTreeVersion;

      vi.mocked(contentProxy.writeFile).mockResolvedValue(undefined);
      await contentService.write('z.ts', new Uint8Array([1]), 'user');

      const v2 = service.completeTreeVersion;
      expect(v2).toBeGreaterThan(v1);

      contentService.dispose();
    });
  });

  describe('searchFiles', () => {
    it('should delegate to proxy.searchFiles with correct root path', async () => {
      const mockResults: FileStatEntry[] = [
        { path: 'src/main.ts', name: 'main.ts', type: 'file', size: 100, mtimeMs: 1000 },
      ];
      const searchProxy = createMockProxy({
        searchFiles: vi.fn().mockReturnValue(mockResults) as unknown as FileSystemClient['searchFiles'],
      });
      const searchService = createTreeHarness({ proxy: searchProxy }).service;

      const results = await searchService.searchFiles('main');
      expect(searchProxy.searchFiles).toHaveBeenCalledWith('/project', 'main', undefined);
      expect(results).toEqual(mockResults);

      searchService.dispose();
    });

    it('should forward query and options', async () => {
      const searchProxy = createMockProxy({
        searchFiles: vi.fn().mockReturnValue([]) as unknown as FileSystemClient['searchFiles'],
      });
      const searchService = createTreeHarness({ proxy: searchProxy }).service;

      await searchService.searchFiles('utils', { maxResults: 50, includeDirectories: true });
      expect(searchProxy.searchFiles).toHaveBeenCalledWith('/project', 'utils', {
        maxResults: 50,
        includeDirectories: true,
      });

      searchService.dispose();
    });

    it('should return FileStatEntry[] from proxy', async () => {
      const expected: FileStatEntry[] = [
        { path: 'a.ts', name: 'a.ts', type: 'file', size: 10, mtimeMs: 100 },
        { path: 'b.ts', name: 'b.ts', type: 'file', size: 20, mtimeMs: 200 },
      ];
      const searchProxy = createMockProxy({
        searchFiles: vi.fn().mockReturnValue(expected) as unknown as FileSystemClient['searchFiles'],
      });
      const searchService = createTreeHarness({ proxy: searchProxy }).service;

      const results = await searchService.searchFiles('.ts');
      expect(results).toHaveLength(2);
      expect(results[0]!.path).toBe('a.ts');

      searchService.dispose();
    });

    it('should warm the worker search index via getDirectoryStat on first call', async () => {
      const warmProxy = createMockProxy({
        getDirectoryStat: vi.fn().mockResolvedValue([]),
        searchFiles: vi.fn().mockReturnValue([]) as unknown as FileSystemClient['searchFiles'],
      });
      const warmService = createTreeHarness({ proxy: warmProxy }).service;

      await warmService.searchFiles('main');
      expect(warmProxy.getDirectoryStat).toHaveBeenCalledWith('/project');

      await warmService.searchFiles('utils');
      expect(warmProxy.getDirectoryStat).toHaveBeenCalledOnce();

      warmService.dispose();
    });

    it('should re-warm the search index after reset()', async () => {
      const resetProxy = createMockProxy({
        getDirectoryStat: vi.fn().mockResolvedValue([]),
        searchFiles: vi.fn().mockReturnValue([]) as unknown as FileSystemClient['searchFiles'],
      });
      const resetService = createTreeHarness({ proxy: resetProxy }).service;

      await resetService.searchFiles('main');
      expect(resetProxy.getDirectoryStat).toHaveBeenCalledOnce();

      resetService.reset('/new-project');

      await resetService.searchFiles('main');
      expect(resetProxy.getDirectoryStat).toHaveBeenCalledTimes(2);
      expect(resetProxy.getDirectoryStat).toHaveBeenLastCalledWith('/new-project');

      resetService.dispose();
    });
  });

  // === handleWorkerFileChanged (structured incremental tree events) ===

  describe('handleWorkerFileChanged', () => {
    // ── fileWritten — optimistic add when parent loaded, skip when not ──

    it('should optimistically add file to tree on fileWritten when parent is loaded', () => {
      const event: ChangeEvent = {
        type: 'fileWritten',
        path: '/project/newfile.ts',
        backend: 'indexeddb',
      };

      emitWorker(event);

      expect(service.getTreeSnapshot().has('newfile.ts')).toBe(true);
      expect(service.getTreeSnapshot().get('newfile.ts')?.type).toBe('file');
      expect(proxy.readDirectory).not.toHaveBeenCalled();
    });

    it('should skip fileWritten when parent directory is not loaded', async () => {
      const { service: localService, emitWorker: emitLocal } = createTreeHarness({
        proxy,
        initialEntries: [createEntry('main.ts'), createEntry('.tau', 'dir')],
      });

      const event: ChangeEvent = {
        type: 'fileWritten',
        path: '/project/.tau/cache/params.json',
        backend: 'indexeddb',
      };

      const snapshotBefore = localService.getTreeSnapshot();
      emitLocal(event);
      await vi.advanceTimersByTimeAsync(200);

      expect(localService.getTreeSnapshot()).toBe(snapshotBefore);
      expect(proxy.readDirectory).not.toHaveBeenCalled();

      localService.dispose();
    });

    it('should notify subscribers on fileWritten optimistic add', () => {
      const subscriber = vi.fn();
      service.subscribeTree(subscriber);

      const event: ChangeEvent = {
        type: 'fileWritten',
        path: '/project/added.ts',
        backend: 'indexeddb',
      };
      emitWorker(event);

      expect(subscriber).toHaveBeenCalledOnce();
    });

    // ── fileDeleted — optimistic delete ──

    it('should optimistically remove file from tree on fileDeleted', () => {
      expect(service.getTreeSnapshot().has('main.ts')).toBe(true);

      const event: ChangeEvent = {
        type: 'fileDeleted',
        path: '/project/main.ts',
        backend: 'indexeddb',
      };

      emitWorker(event);

      expect(service.getTreeSnapshot().has('main.ts')).toBe(false);
      expect(proxy.readDirectory).not.toHaveBeenCalled();
    });

    it('should not call readDirectory on fileDeleted for unknown path', async () => {
      const event: ChangeEvent = {
        type: 'fileDeleted',
        path: '/project/nonexistent.ts',
        backend: 'indexeddb',
      };

      emitWorker(event);
      await vi.advanceTimersByTimeAsync(200);

      expect(proxy.readDirectory).not.toHaveBeenCalled();
    });

    // ── fileRenamed — optimistic rename ──

    it('should optimistically rename file in tree on fileRenamed', () => {
      expect(service.getTreeSnapshot().has('main.ts')).toBe(true);

      const event: ChangeEvent = {
        type: 'fileRenamed',
        oldPath: '/project/main.ts',
        newPath: '/project/app.ts',
        backend: 'indexeddb',
      };

      emitWorker(event);

      expect(service.getTreeSnapshot().has('main.ts')).toBe(false);
      expect(service.getTreeSnapshot().has('app.ts')).toBe(true);
      expect(service.getTreeSnapshot().get('app.ts')?.name).toBe('app.ts');
      expect(proxy.readDirectory).not.toHaveBeenCalled();
    });

    it('should handle cross-directory rename optimistically without readDirectory', () => {
      expect(service.getTreeSnapshot().has('main.ts')).toBe(true);

      const event: ChangeEvent = {
        type: 'fileRenamed',
        oldPath: '/project/main.ts',
        newPath: '/project/lib/main.ts',
        backend: 'indexeddb',
      };

      emitWorker(event);

      expect(service.getTreeSnapshot().has('main.ts')).toBe(false);
      expect(service.getTreeSnapshot().has('lib/main.ts')).toBe(true);
      expect(proxy.readDirectory).not.toHaveBeenCalled();
    });

    // ── directoryChanged — refresh only when loaded ──

    it('should refresh on directoryChanged when directory is loaded', async () => {
      const event: ChangeEvent = {
        type: 'directoryChanged',
        path: '/project',
        backend: 'indexeddb',
      };

      emitWorker(event);
      await vi.advanceTimersByTimeAsync(200);

      expect(proxy.readDirectory).toHaveBeenCalledWith('/project');
    });

    it('should skip refresh on directoryChanged when directory is not loaded', async () => {
      const { service: localService, emitWorker: emitLocal } = createTreeHarness({
        proxy,
        initialEntries: [createEntry('main.ts'), createEntry('.tau', 'dir')],
      });

      const event: ChangeEvent = {
        type: 'directoryChanged',
        path: '/project/.tau',
        backend: 'indexeddb',
      };

      emitLocal(event);
      await vi.advanceTimersByTimeAsync(200);

      expect(proxy.readDirectory).not.toHaveBeenCalled();

      localService.dispose();
    });

    // ── backendChanged — full refresh (unchanged behavior) ──

    it('should fall back to root refresh for backendChanged events', async () => {
      const event: ChangeEvent = {
        type: 'backendChanged',
        backend: 'opfs',
      };

      emitWorker(event);
      await vi.advanceTimersByTimeAsync(200);

      expect(proxy.readDirectory).toHaveBeenCalledWith('/project');
    });

    // ── Scope filtering (unchanged behavior) ──

    it('should ignore events outside rootDirectory scope', async () => {
      const event: ChangeEvent = {
        type: 'fileWritten',
        path: '/other-project/file.ts',
        backend: 'indexeddb',
      };

      emitWorker(event);
      await vi.advanceTimersByTimeAsync(200);

      expect(proxy.readDirectory).not.toHaveBeenCalled();
      expect(service.getTreeSnapshot().size).toBe(4);
    });
  });
});
