import type { DirectoryListing, ListedDirectoryEntry } from '#directory-listing.js';
import { ObservationService } from '#observation-service.js';
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { FileTreeNode } from '@taucad/filesystem';
import { useDirectoryListing } from '#react/use-directory-listing.js';
import { FileTreeService } from '#file-tree-service.js';
import type { ComposedViewClient } from '#composed-view-client.js';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import { DirectoryListingErrorCode, DirectoryListingFailedError } from '#directory-listing.js';
import { WorkspacePathResolver } from '#workspace-path-resolver.js';
import { headlessVisibilityProvider } from '#visibility-provider.js';
import type { FileTreeService as FileTreeServiceType } from '#file-tree-service.js';

const workspaceRoot = '/projects/abc';

function createTreeHarness(overrides?: { proxy?: ComposedViewClient }): {
  tree: FileTreeService;
  proxy: ComposedViewClient;
  disposeChannel: () => void;
} {
  const listen = vi.fn().mockReturnValue(vi.fn());
  const paths = new WorkspacePathResolver(workspaceRoot);
  const channel = new WorkerChangeChannel({ transport: { listen } });
  const proxy =
    overrides?.proxy ??
    mock<ComposedViewClient>({
      readDirectory: vi.fn().mockResolvedValue([]),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
      getDirectoryStat: vi.fn().mockResolvedValue([]),
    });
  const tree = new FileTreeService({
    proxy,
    paths,
    channel,
    visibility: headlessVisibilityProvider,
  });
  return {
    tree,
    proxy,
    disposeChannel: () => {
      channel.dispose();
    },
  };
}

describe('useDirectoryListing', () => {
  it('should qualify retained rows as pending while an authoritative refresh is held', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness();
    const hook = renderHook(() => useDirectoryListing(tree, ''));
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('ready');
    });
    const held = Promise.withResolvers<FileTreeNode[]>();
    vi.mocked(proxy.readDirectory).mockReturnValueOnce(held.promise);
    act(() => {
      tree.observeDirectory('').refresh();
    });
    expect(hook.result.current).toMatchObject({ kind: 'ready', entries: [], pending: true });
    await act(async () => {
      held.resolve([]);
    });
    await waitFor(() => {
      expect(hook.result.current).not.toHaveProperty('pending');
    });
    hook.unmount();
    tree.dispose();
    disposeChannel();
  });

  it('should surface isolated observation closure and retry the same mounted directory', async () => {
    const closed = Promise.withResolvers<void>();
    const ready = Promise.withResolvers<void>();
    const watchReady = vi
      .fn()
      .mockReturnValueOnce({ ready: ready.promise, closed: closed.promise, unsubscribe: vi.fn() })
      .mockReturnValue({
        ready: Promise.resolve(),
        closed: Promise.withResolvers<void>().promise,
        unsubscribe: vi.fn(),
      });
    const channel = new WorkerChangeChannel({ transport: { listen: () => () => undefined, watchReady } });
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([]);
    const tree = new FileTreeService({
      proxy: mock<ComposedViewClient>({ readDirectory }),
      channel,
      paths: new WorkspacePathResolver(workspaceRoot),
      visibility: headlessVisibilityProvider,
    });
    const hook = renderHook(({ reloadToken }) => useDirectoryListing(tree, '', { reloadToken }), {
      initialProps: { reloadToken: 0 },
    });
    expect(readDirectory).not.toHaveBeenCalled();
    await act(async () => {
      ready.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('ready');
    });
    await act(async () => {
      closed.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('error');
    });
    hook.rerender({ reloadToken: 1 });
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('ready');
    });
    expect(watchReady).toHaveBeenCalledTimes(2);
    expect(readDirectory).toHaveBeenCalledTimes(2);
    hook.unmount();
    tree.dispose();
    channel.dispose();
  });

  it('should report unready when treeService is undefined', () => {
    const { result } = renderHook(() => useDirectoryListing(undefined, ''));
    expect(result.current).toEqual({ kind: 'unready' });
  });

  it('should transition unready → loading → ready for a cold directory listing', async () => {
    const phases: string[] = [];
    const { tree, proxy, disposeChannel } = createTreeHarness();
    let resolveRead!: (value: FileTreeNode[]) => void;
    vi.mocked(proxy.readDirectory).mockImplementation(async () => {
      return new Promise<FileTreeNode[]>((resolve) => {
        resolveRead = resolve;
      });
    });

    const { result } = renderHook(() => {
      const list = useDirectoryListing(tree, '');
      phases.push(list.kind);
      return list;
    });

    expect(result.current.kind).toBe('loading');
    await waitFor(() => {
      expect(proxy.readDirectory).toHaveBeenCalled();
    });
    resolveRead([]);
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current).toMatchObject({ kind: 'ready', path: '' });
    if (result.current.kind === 'ready') {
      expect(result.current.entries).toEqual([]);
    }
    expect(phases[0]).toBe('loading');
    expect(phases).toContain('ready');

    disposeChannel();
  });

  it('should stay ready synchronously when the directory is already resolved', async () => {
    const { tree, disposeChannel } = createTreeHarness();
    await tree.listDirectory('');

    const phases: string[] = [];
    const { result } = renderHook(() => {
      const list = useDirectoryListing(tree, '');
      phases.push(list.kind);
      return list;
    });

    expect(result.current.kind).toBe('ready');
    expect(phases.every((phase) => phase === 'ready')).toBe(true);

    disposeChannel();
  });

  it('should surface NotFound as kind error with DirectoryListingErrorCode.NotFound', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness();
    const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(proxy.readDirectory).mockRejectedValue(error);

    const { result } = renderHook(() => useDirectoryListing(tree, 'missing'));

    await waitFor(() => {
      expect(result.current.kind).toBe('error');
    });
    expect(result.current).toMatchObject({
      kind: 'error',
      path: 'missing',
      cause: { code: DirectoryListingErrorCode.NotFound },
    });

    disposeChannel();
  });

  it('should surface Aborted listing failures as error with cause.code Aborted', async () => {
    const aborted = new DirectoryListingFailedError({
      code: DirectoryListingErrorCode.Aborted,
      message: 'Aborted',
      path: '.',
    });
    const listDirectory = vi.fn<FileTreeServiceType['listDirectory']>().mockRejectedValue(aborted);
    const listDirectorySync = vi.fn<FileTreeServiceType['listDirectorySync']>().mockReturnValue(undefined);
    const subscribePath = vi.fn<FileTreeServiceType['subscribePath']>().mockReturnValue(() => undefined);

    const mockTree = mock<FileTreeServiceType>({
      listDirectory,
      listDirectorySync,
      subscribePath,
      observeDirectory: (path) =>
        new ObservationService<DirectoryListing>({
          resource: path,
          watch: (invalidate) => ({
            ready: Promise.resolve(),
            closed: Promise.withResolvers<void>().promise,
            dispose: subscribePath(path, invalidate),
          }),
          read: async () => {
            try {
              return { kind: 'ready', path, entries: await listDirectory(path) };
            } catch (error) {
              return {
                kind: 'error',
                path,
                cause:
                  error instanceof DirectoryListingFailedError
                    ? error.listing
                    : { code: DirectoryListingErrorCode.Unknown, message: String(error), path },
              };
            }
          },
        }),
    });

    const { result } = renderHook(() => useDirectoryListing(mockTree, '.'));

    await waitFor(() => {
      expect(result.current.kind).toBe('error');
    });
    if (result.current.kind === 'error') {
      expect(result.current.cause.code).toBe(DirectoryListingErrorCode.Aborted);
    }
  });

  it('should not re-render when subscribePath notifies a different directory path', async () => {
    const pathListeners = new Map<string, Set<() => void>>();

    const fixtureEntryOnlyA: ListedDirectoryEntry = {
      contentKind: 'text',
      name: 'only-a',
      path: 'dir-a/only-a',
      isFolder: false,
      size: 1,
      mtimeMs: 2,
    };

    const listDirectorySync = vi.fn((pathArgument: string) => {
      return pathArgument === 'dir-a' ? [fixtureEntryOnlyA] : undefined;
    });
    const listDirectory = vi.fn(async (pathArgument: string) => {
      if (pathArgument === 'dir-a') {
        return [fixtureEntryOnlyA];
      }
      return [];
    });
    const subscribePath = vi.fn((pathArgument: string, callback: () => void) => {
      let set = pathListeners.get(pathArgument);
      if (!set) {
        set = new Set();
        pathListeners.set(pathArgument, set);
      }
      set.add(callback);
      return () => {
        set.delete(callback);
      };
    });

    const mockTree = mock<FileTreeServiceType>({
      listDirectory,
      listDirectorySync,
      subscribePath,
      observeDirectory: (path) =>
        new ObservationService<DirectoryListing>({
          resource: path,
          watch: (invalidate) => ({
            ready: Promise.resolve(),
            closed: Promise.withResolvers<void>().promise,
            dispose: subscribePath(path, invalidate),
          }),
          read: async () => {
            try {
              return { kind: 'ready', path, entries: await listDirectory(path) };
            } catch (error) {
              return {
                kind: 'error',
                path,
                cause:
                  error instanceof DirectoryListingFailedError
                    ? error.listing
                    : { code: DirectoryListingErrorCode.Unknown, message: String(error), path },
              };
            }
          },
        }),
    });

    const { result } = renderHook(() => useDirectoryListing(mockTree, 'dir-a'));

    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });

    const snapshot = result.current;
    const listeners = pathListeners.get('dir-b');
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
    expect(result.current).toBe(snapshot);
    expect(subscribePath).toHaveBeenCalledWith('dir-a', expect.any(Function));
  });

  it('should ignore late async completions after teardown abort', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness();
    let resolveRead!: (value: FileTreeNode[]) => void;
    vi.mocked(proxy.readDirectory).mockImplementation(async () => {
      return new Promise<FileTreeNode[]>((resolve) => {
        resolveRead = resolve;
      });
    });

    const { result, unmount } = renderHook(() => useDirectoryListing(tree, 'late'));

    await waitFor(() => {
      expect(result.current.kind).toBe('loading');
    });

    unmount();
    resolveRead([]);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    disposeChannel();
  });
});
