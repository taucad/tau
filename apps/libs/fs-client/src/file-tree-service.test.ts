import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { FileTreeService } from '#file-tree-service.js';
import type { ExternalPollTelemetry } from '#file-tree-service.js';
import type { FileTreeNode, HeadFileStat, WatchEvent } from '@taucad/filesystem';
import type { ChangeEvent, FileEntry, FileProvenance, FileStat } from '@taucad/types';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import type { WorkerChangeChannelTransport } from '#worker-change-channel.js';
import { DirectoryListingErrorCode, DirectoryListingFailedError } from '#directory-listing.js';
import { WorkspacePathResolver } from '#workspace-path-resolver.js';
import { createComposedViewClient } from '#composed-view-client.js';
import type { ComposedViewClient, ComposedViewProxy } from '#composed-view-client.js';
import type { WorkspaceAuthorityClient } from '#file-system-client.js';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { headlessVisibilityProvider } from '#visibility-provider.js';
import type { VisibilityProvider } from '#visibility-provider.js';
import type { FileContentService, ContentChangeEvent } from '#file-content-service.js';

const workspaceRoot = '/projects/abc';

const skillContents = '---\nname: cad-replicad\n---\n';
const skillBytes = new TextEncoder().encode(skillContents);
const skillsRoot = '.agents/skills';
const skillIdentity = 'skill:cad-replicad@1.0.0#fingerprint';

/** The system skill bundle overlay, shaped as `libs/agent-tools` produces it. */
const skillOverlay = (): ComposedViewOverlay => {
  const nodes = new Map<string, { type: 'dir'; children: readonly string[] } | { type: 'file' }>([
    ['', { type: 'dir', children: ['.agents'] }],
    ['.agents', { type: 'dir', children: ['skills'] }],
    [skillsRoot, { type: 'dir', children: ['cad-replicad'] }],
    [`${skillsRoot}/cad-replicad`, { type: 'dir', children: ['SKILL.md'] }],
    [`${skillsRoot}/cad-replicad/SKILL.md`, { type: 'file' }],
  ]);
  return {
    root: skillsRoot,
    source: 'system-skills',
    unit: (path) =>
      path.startsWith(`${skillsRoot}/`) && path.slice(skillsRoot.length + 1).split('/')[0] === 'cad-replicad'
        ? { root: `${skillsRoot}/cad-replicad`, identity: skillIdentity }
        : undefined,
    node: (path) => {
      const node = nodes.get(path);
      if (node === undefined) {
        return undefined;
      }
      return node.type === 'dir'
        ? { type: 'dir', children: node.children }
        : { type: 'file', size: skillBytes.byteLength, contentKind: 'text', lineCount: 3 };
    },
    read: async () => skillBytes,
  };
};

/**
 * The production client: in-root reads through one composed view, the
 * dependency mount through its own (W11), and topology on the authority.
 */
const createComposedProxy = async (dependencies?: ComposedViewProxy): Promise<ComposedViewClient> => {
  const provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export {};\n');
  return createComposedViewClient({
    workspace: mock<WorkspaceAuthorityClient>(),
    dependencies:
      dependencies ??
      mock<ComposedViewProxy>({
        readdirWithStats: vi.fn().mockResolvedValue([]),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
      }),
    /* The rooted connection also archives a subtree (charter D2) and serves the
     * mutation pipeline's porcelain (D4); this harness reads rows. */
    view: Object.assign(
      composeView({ filesystem: provider }, { consumer: 'user', overlays: [skillOverlay()], policy: tauPathPolicy }),
      {
        archive: vi.fn<ComposedViewProxy['archive']>(),
        search: vi.fn<ComposedViewProxy['search']>().mockResolvedValue([]),
        statTree: vi.fn<ComposedViewProxy['statTree']>().mockResolvedValue([]),
      },
    ) as unknown as ComposedViewProxy,
    paths: new WorkspacePathResolver(workspaceRoot),
  });
};

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

/** A project row's provenance, with only `versioned` moving. */
const provenanceOf = (versioned: boolean): FileProvenance => ({
  source: 'project',
  versioned,
  agentAccess: 'read-write',
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
  proxy?: ComposedViewClient;
  workspaceRoot?: string;
  initialEntries?: FileEntry[];
  visibility?: VisibilityProvider;
  watchReady?: WorkerChangeChannelTransport['watchReady'];
  onExternalPollTelemetry?: ConstructorParameters<typeof FileTreeService>[0]['onExternalPollTelemetry'];
}): {
  tree: FileTreeService;
  proxy: ComposedViewClient;
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
  const channel = new WorkerChangeChannel({ transport: { listen, watchReady: overrides?.watchReady } });
  const proxy =
    overrides?.proxy ??
    mock<ComposedViewClient>({
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

describe('terminal selected observation ownership', () => {
  it.each(['reset', 'dispose'] as const)('keeps a preselected tree shell inert after domain %s', async (operation) => {
    const watchReady = vi.fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>().mockImplementation(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      unsubscribe: vi.fn(),
    }));
    const owned = createTreeHarness({ watchReady });
    vi.mocked(owned.proxy.readDirectory).mockResolvedValue([textNode('replacement.ts')]);
    const selected = owned.tree.observeDirectory('');
    if (operation === 'reset') {
      owned.tree.reset('/projects/replacement');
    } else {
      owned.tree.dispose();
    }
    const late = selected.acquire();
    try {
      expect.soft(watchReady).not.toHaveBeenCalled();
      expect.soft(late.getSnapshot()).toEqual({ status: 'closed' });
      expect.soft(selected.activeLeaseCount).toBe(0);
      if (operation === 'reset') {
        const current = owned.tree.observeDirectory('');
        const lease = current.acquire();
        try {
          await vi.waitFor(() => {
            expect(current.getSnapshot().status).toBe('ready');
          });
          expect.soft(current).not.toBe(selected);
          expect.soft(watchReady).toHaveBeenCalledOnce();
          expect.soft(owned.proxy.readDirectory).toHaveBeenCalledWith('/projects/replacement');
          expect
            .soft(current.getSnapshot())
            .toMatchObject({ status: 'ready', value: { kind: 'ready', entries: [{ name: 'replacement.ts' }] } });
          const readsBeforeStaleCallbacks = vi.mocked(owned.proxy.readDirectory).mock.calls.length;
          const currentBeforeStaleCallbacks = current.getSnapshot();
          const invalidationsBeforeStaleCallbacks = current.diagnostics.invalidations;
          late.refresh();
          late.release();
          late.release();
          await Promise.resolve();
          expect.soft(owned.proxy.readDirectory).toHaveBeenCalledTimes(readsBeforeStaleCallbacks);
          expect.soft(current.getSnapshot()).toBe(currentBeforeStaleCallbacks);
          expect.soft(current.diagnostics.invalidations).toBe(invalidationsBeforeStaleCallbacks);
          expect.soft(current.activeLeaseCount).toBe(1);
          expect.soft(current.getSnapshot().status).toBe('ready');
          expect.soft(selected.getSnapshot()).toEqual({ status: 'closed' });
        } finally {
          lease.release();
        }
      }
    } finally {
      late.release();
      owned.tree.dispose();
      owned.disposeChannel();
    }
  });
});

describe('FileTreeService composed-view provenance (north star W2)', () => {
  /*
   * North-star W2 pin (execution-queue ruling P2). The Files pane and the
   * agent's tools read one composed view (charter D1, architecture L4), so a
   * system skill bundle is a row in the tree with `source: 'system-skills'`
   * and read-only access — data, never a label on the wire (blueprint S14).
   */
  it('should stamp a system skill entry with system-skills provenance', async () => {
    const harness = createTreeHarness({ proxy: await createComposedProxy() });
    try {
      const entries = await harness.tree.listDirectory('.agents/skills/cad-replicad');

      expect(entries.map(({ name }) => name)).toStrictEqual(['SKILL.md']);
      expect(harness.tree.getTreeSnapshot().get('.agents/skills/cad-replicad/SKILL.md')?.provenance).toMatchObject({
        source: 'system-skills',
        agentAccess: 'read-only',
        versioned: false,
      });
    } finally {
      harness.disposeChannel();
    }
  });

  it('should stamp the project rows of the same listing as project entries', async () => {
    const harness = createTreeHarness({ proxy: await createComposedProxy() });
    try {
      await harness.tree.listDirectory('');

      expect(harness.tree.getTreeSnapshot().get('main.ts')?.provenance).toMatchObject({
        source: 'project',
        agentAccess: 'read-write',
        versioned: true,
      });
    } finally {
      harness.disposeChannel();
    }
  });
});

/**
 * The dependency mount's own rooted view: it lives outside every checkout, so
 * the checkout's view has never heard of it, and since W11 it is its own root
 * rather than an authority-global read. Its paths are mount-relative.
 */
const dependencyMountView = (): ComposedViewProxy => {
  const rows = new Map<string, Array<{ name: string } & FileStat>>([
    ['', [{ name: 'three', type: 'dir', size: 0, mtimeMs: 0 }]],
    ['three', [{ name: 'index.d.ts', ...textStat() }]],
  ]);
  function readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>>;
  function readdirWithStats(
    path: string,
    options: { readonly content: 'head' },
  ): Promise<Array<{ name: string } & HeadFileStat>>;
  async function readdirWithStats(path: string, options?: { readonly content: 'head' }) {
    const entries = rows.get(path) ?? [];
    return options === undefined
      ? entries
      : entries.map((row) =>
          row.type === 'file' && row.contentKind === 'text'
            ? { name: row.name, type: row.type, size: row.size, mtimeMs: row.mtimeMs, contentKind: row.contentKind }
            : row,
        );
  }
  const view = mock<ComposedViewProxy>({
    readdirWithStats,
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ type: 'dir', size: 0, mtimeMs: 0 }),
  });
  vi.spyOn(view, 'readdirWithStats');
  return view;
};

/*
 * Finding 4: a root listing is authoritative over the root's children, so the
 * dependency mount has to be in it or every re-list deletes the row — and with
 * the row goes the subtree the eager listing loaded.
 */
describe('FileTreeService dependency mount row (close-out W3)', () => {
  it('should keep the dependency mount and its loaded children across a root refresh', async () => {
    vi.useFakeTimers();
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: await createComposedProxy(dependencyMountView()),
    });
    try {
      const root = await tree.listDirectory('');
      expect(root.map(({ name }) => name)).toContain('node_modules');
      await tree.listDirectory('node_modules');
      expect(tree.getTreeSnapshot().get('node_modules')?.provenance).toMatchObject({ source: 'dependencies' });

      emitFileChanged({ type: 'fileWritten', path: 'added.ts', backend: 'indexeddb' });
      await vi.advanceTimersByTimeAsync(200);

      expect(tree.getTreeSnapshot().has('node_modules')).toBe(true);
      expect(tree.getTreeSnapshot().has('node_modules/three')).toBe(true);
    } finally {
      tree.dispose();
      disposeChannel();
      vi.useRealTimers();
    }
  });

  it('should keep the dependency mount and its loaded children across a backend resync', async () => {
    const dependencies = dependencyMountView();
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: await createComposedProxy(dependencies),
    });
    try {
      await tree.listDirectory('');
      await tree.listDirectory('node_modules');
      vi.mocked(dependencies.readdirWithStats).mockClear();

      emitFileChanged({ type: 'backendChanged', backend: 'indexeddb' });
      /* The resync walks resolved directories root-first, so the mount's own arm
       * runs only while the row survived the root's merge. */
      await vi.waitFor(() => {
        expect(dependencies.readdirWithStats).toHaveBeenCalledWith('', { content: 'head' });
      });

      expect(tree.getTreeSnapshot().has('node_modules')).toBe(true);
      expect(tree.getTreeSnapshot().has('node_modules/three')).toBe(true);
    } finally {
      tree.dispose();
      disposeChannel();
    }
  });
});

describe('FileTreeService workspace path canonicalization', () => {
  let harness: ReturnType<typeof createTreeHarness>;

  beforeEach(() => {
    harness = createTreeHarness();
  });

  afterEach(() => {
    harness.disposeChannel();
  });

  describe('listDirectory path canonicalization', () => {
    it('should call readDirectory with the workspace root for the canonical root', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('');
      expect(harness.proxy.readDirectory).toHaveBeenCalledWith('/projects/abc');
    });

    it('should resolve canonical nested paths under the root', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('src');
      expect(harness.proxy.readDirectory).toHaveBeenLastCalledWith('/projects/abc/src');
    });

    it('should reject non-canonical aliases before calling the proxy', async () => {
      for (const alias of ['.', '/', './', '/src', '/projects/abc']) {
        vi.mocked(harness.proxy.readDirectory).mockClear();
        // oxlint-disable-next-line no-await-in-loop -- each invalid boundary value is verified independently
        await expect(harness.tree.listDirectory(alias)).rejects.toBeInstanceOf(DirectoryListingFailedError);
        expect(harness.proxy.readDirectory).not.toHaveBeenCalled();
      }
    });

    it('should reject before calling the proxy when the path escapes the workspace', async () => {
      vi.mocked(harness.proxy.readDirectory).mockClear();
      await expect(harness.tree.listDirectory('/projects/other/deep')).rejects.toBeInstanceOf(
        DirectoryListingFailedError,
      );
      expect(harness.proxy.readDirectory).not.toHaveBeenCalled();
    });
  });

  describe('listDirectory (root vs nested)', () => {
    it('should call readDirectory with the workspace root for the empty root path', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('');
      expect(harness.proxy.readDirectory).toHaveBeenCalledWith('/projects/abc');
    });

    it('should resolve src under the workspace root', async () => {
      vi.mocked(harness.proxy.readDirectory).mockResolvedValue([]);
      await harness.tree.listDirectory('src');
      expect(harness.proxy.readDirectory).toHaveBeenCalledWith('/projects/abc/src');
    });
  });

  describe('stat', () => {
    it('should call stat with the resolved authority path for src', async () => {
      await harness.tree.stat('src');
      expect(harness.proxy.stat).toHaveBeenCalledWith('/projects/abc/src');
    });
  });

  describe('getDirectoryStat', () => {
    it('should call getDirectoryStat with the workspace root for the empty root path', async () => {
      await harness.tree.getDirectoryStat('');
      expect(harness.proxy.getDirectoryStat).toHaveBeenCalledWith('/projects/abc');
    });
  });

  describe('exists', () => {
    it('should stat the workspace root when checking the empty root path', async () => {
      await harness.tree.exists('');
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
    const proxy = mock<ComposedViewClient>({
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
    tree.startPolling();
    expect(unsubscribe).not.toHaveBeenCalled();
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
    const proxy = mock<ComposedViewClient>({ pollExternalChanges: poll });
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

  it('drops to the safety-net cadence while the worker reports native observation', async () => {
    vi.useFakeTimers();
    const pollExternalChanges = vi.fn().mockResolvedValue(true);
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ pollExternalChanges }),
    });

    tree.startPolling();
    await vi.advanceTimersByTimeAsync(2000);
    expect(pollExternalChanges).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(pollExternalChanges).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(pollExternalChanges).toHaveBeenCalledTimes(2);

    tree.stopPolling();
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('restores the fast cadence as soon as native observation stops', async () => {
    vi.useFakeTimers();
    const pollExternalChanges = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ pollExternalChanges }),
    });

    tree.startPolling();
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pollExternalChanges).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(pollExternalChanges).toHaveBeenCalledTimes(3);

    tree.stopPolling();
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('polls the newly reset root on the fast cadence after a native-observed root', async () => {
    vi.useFakeTimers();
    const pollExternalChanges = vi.fn().mockResolvedValue(true);
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ pollExternalChanges }),
    });

    tree.startPolling();
    await vi.advanceTimersByTimeAsync(2000);
    expect(pollExternalChanges).toHaveBeenCalledOnce();

    tree.reset('/projects/def');
    await vi.advanceTimersByTimeAsync(2000);
    expect(pollExternalChanges).toHaveBeenCalledTimes(2);
    expect(pollExternalChanges).toHaveBeenNthCalledWith(2, '/projects/def');

    tree.stopPolling();
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('adds one global reconciliation after every five completed rooted polls', async () => {
    vi.useFakeTimers();
    const pollExternalChanges = vi.fn().mockResolvedValue(undefined);
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ pollExternalChanges }),
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
    const proxy = mock<ComposedViewClient>({ pollExternalChanges: vi.fn().mockReturnValue(pending.promise) });
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

  it('keeps agent exact listings independent of resolved UI tree rows', async () => {
    const { tree, proxy, disposeChannel } = createTreeHarness();
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([textNode('deleted.ts')]);
    await tree.listDirectory('');
    vi.mocked(proxy.readDirectoryExact).mockResolvedValueOnce([
      { name: 'added.ts', type: 'file', size: 5, mtimeMs: 100, contentKind: 'text', lineCount: 2 },
    ]);

    await expect(tree.listDirectoryExact('')).resolves.toEqual([
      { name: 'added.ts', type: 'file', size: 5, mtimeMs: 100, contentKind: 'text', lineCount: 2 },
    ]);
    expect(tree.getTreeSnapshot().has('deleted.ts')).toBe(true);
    expect(proxy.readDirectoryExact).toHaveBeenCalledWith(workspaceRoot);
    tree.dispose();
    disposeChannel();
  });

  it('clears an exact count when a shallow refresh cannot prove it is still current', async () => {
    vi.useFakeTimers();
    const { tree, proxy, disposeChannel } = createTreeHarness();
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([textNode('a.ts', { size: 5, mtimeMs: 100, lineCount: 2 })]);
    await tree.listDirectory('');
    vi.mocked(proxy.readDirectory).mockResolvedValueOnce([
      { id: 'a.ts', name: 'a.ts', size: 5, mtimeMs: 100, contentKind: 'text' },
    ]);

    tree.scheduleRefresh('');
    await vi.advanceTimersByTimeAsync(200);

    expect('lineCount' in (tree.getTreeSnapshot().get('a.ts') ?? {})).toBe(false);
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  it('should preserve FileEntry object identity when disk listing is unchanged', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listen = vi.fn().mockReturnValue(vi.fn());
    const paths = new WorkspacePathResolver(workspaceRoot);
    const channel = new WorkerChangeChannel({ transport: { listen } });
    const proxy = mock<ComposedViewClient>({
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

  /*
   * W4 sweep (W14): a row is stale when *any* provenance field moved, not only
   * `source` and `agentAccess` — an `exports/**` file becoming versioned, or a
   * project file taking over an overlay unit (`overrides`), changes what the
   * pane draws while size and mtime stand still.
   */
  it.each([
    {
      row: 'file',
      node: (versioned: boolean): FileTreeNode => ({
        ...textNode('a.ts', { size: 1 }),
        provenance: provenanceOf(versioned),
      }),
    },
    {
      row: 'directory',
      node: (versioned: boolean): FileTreeNode => ({
        ...directoryNode('exports'),
        provenance: provenanceOf(versioned),
      }),
    },
  ])('should refresh a $row row whose provenance alone changed', async ({ node }) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { tree, proxy, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({
        readDirectory: vi.fn().mockResolvedValue([node(false)]),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
    });
    try {
      await tree.listDirectory('');
      const listed = [...tree.getTreeSnapshot().keys()];
      vi.mocked(proxy.readDirectory).mockResolvedValue([node(true)]);
      tree.scheduleRefresh('');
      await vi.advanceTimersByTimeAsync(200);

      expect(tree.getTreeSnapshot().get(listed[0] ?? '')?.provenance).toMatchObject({ versioned: true });
    } finally {
      tree.dispose();
      disposeChannel();
      vi.useRealTimers();
    }
  });

  it("should keep a pending root refresh and re-read the narrower write's directory in the same window", async () => {
    vi.useFakeTimers();
    const { tree, proxy, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({
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
    emitFileChanged({ type: 'fileWritten', path: 'src/main.ts', backend: 'indexeddb' });
    await vi.advanceTimersByTimeAsync(100);

    /* The narrower write keeps the root re-read and adds its own directory:
     * a root re-read lists only the root's children (W2d F2). */
    expect(proxy.readDirectory).toHaveBeenCalledTimes(2);
    expect(proxy.readDirectory).toHaveBeenCalledWith('/projects/abc');
    expect(proxy.readDirectory).toHaveBeenCalledWith('/projects/abc/src');
    tree.dispose();
    disposeChannel();
    vi.useRealTimers();
  });

  /* A rooted watch spells topology loss as `{ type: 'reset' }`; the same loss
   * reaches the tree's file-change channel as `backendChanged`. */
  it('should re-list every loaded directory after a rooted topology reset', async () => {
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
      proxy: mock<ComposedViewClient>({
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
    await vi.waitFor(() => {
      expect(tree.getTreeSnapshot().has('src/nested/new.ts')).toBe(true);
    });

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
      proxy: mock<ComposedViewClient>({
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
      proxy: mock<ComposedViewClient>({
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
      proxy: mock<ComposedViewClient>({
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
    const channel = new WorkerChangeChannel({ transport: { listen } });
    const tree = new FileTreeService({
      proxy: mock<ComposedViewClient>(),
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
    const channel = new WorkerChangeChannel({ transport: { listen } });
    const tree = new FileTreeService({
      proxy: mock<ComposedViewClient>(),
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

  it('should process duplicate directory notifications without traversing the retained tree', () => {
    const { tree, proxy, emitFileChanged, disposeChannel } = createTreeHarness({
      initialEntries: [
        directoryEntry('existing'),
        ...Array.from({ length: 2048 }, (_, index) => textEntry(`file-${index}.ts`)),
      ],
    });
    const snapshot = tree.getTreeSnapshot();
    const existing = snapshot.get('existing');
    const iterate = vi.spyOn(snapshot, Symbol.iterator);
    const changed = vi.fn();
    const unsubscribe = tree.subscribeTree(changed);
    try {
      for (let index = 0; index < 32; index++) {
        emitFileChanged({ type: 'directoryCreated', path: 'existing', backend: 'indexeddb' });
      }
      expect(tree.getTreeSnapshot()).toBe(snapshot);
      expect(tree.getTreeSnapshot().get('existing')).toBe(existing);
      expect(changed).not.toHaveBeenCalled();
      expect(proxy.readDirectory).not.toHaveBeenCalled();
      // Work budget: redundant provider notifications cannot enumerate unrelated retained entries.
      expect(iterate).not.toHaveBeenCalled();
      iterate.mockRestore();
      emitFileChanged({ type: 'directoryCreated', path: 'new-directory', backend: 'indexeddb' });
      expect(tree.getTreeSnapshot().get('new-directory')).toMatchObject({ type: 'dir', path: 'new-directory' });
      expect(changed).toHaveBeenCalledOnce();
    } finally {
      iterate.mockRestore();
      unsubscribe();
      tree.dispose();
      disposeChannel();
    }
  });

  it('should invalidate a pending parent listing on an already retained directory notification', async () => {
    const pending = Promise.withResolvers<FileTreeNode[]>();
    const readDirectory = vi
      .fn<ComposedViewClient['readDirectory']>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue([directoryNode('existing'), textNode('current.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
      initialEntries: [directoryEntry('source'), directoryEntry('source/existing')],
    });
    const listing = tree.listDirectory('source');
    try {
      expect(readDirectory).toHaveBeenCalledOnce();
      emitFileChanged({ type: 'directoryCreated', path: 'source/existing', backend: 'indexeddb' });
      pending.resolve([directoryNode('existing'), textNode('stale.ts')]);
      const entries = await listing;
      expect(entries.map(({ name }) => name).toSorted()).toEqual(['current.ts', 'existing']);
      expect(tree.getTreeSnapshot().has('source/stale.ts')).toBe(false);
      expect(readDirectory).toHaveBeenCalledTimes(2);
    } finally {
      pending.resolve([]);
      await listing;
      tree.dispose();
      disposeChannel();
    }
  });

  /* A thumbnail capture rewrites `thumbnail.webp` on every render; dropping the
   * stamp until the parent re-read redrew every file-tree row twice per commit. */
  it.each(['machine', 'user', 'editor'] as const)(
    "should keep a listed file's provenance when the %s writes its content",
    (source) => {
      const provenance = provenanceOf(false);
      const { tree, disposeChannel } = createTreeHarness({
        initialEntries: [{ ...textEntry('thumbnail.webp'), provenance }],
      });
      const emit = connectContentService(tree);

      emit({ type: 'written', path: 'thumbnail.webp', data: new Uint8Array([1, 2, 3]), source });

      expect(tree.getTreeSnapshot().get('thumbnail.webp')).toMatchObject({ size: 3, provenance });
      tree.dispose();
      disposeChannel();
    },
  );

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

/*
 * A restore replaces a file by renaming it aside and a staged copy into place
 * (`packages/revisions/src/apply-tree.ts`). Each row is one way the tree lost
 * the replaced file for good while the kernel still read it (W2d F2, T9): the
 * swap's own events cannot re-add a path whose staged name the tree never
 * listed, so the parent's re-read is the only repair, and it must not be lost.
 */
describe('FileTreeService after a rename swap (W2d F2)', () => {
  const models = 'public/models';
  const staged = `${models}/.honeycomb.js.tau-staged.0.tmp`;
  const backup = `${models}/.honeycomb.js.tau-backup.0.tmp`;
  const final = [textNode('box-corner.js'), textNode('honeycomb.js')];

  const startSwapTree = (
    readModels: () => Promise<FileTreeNode[]>,
  ): ReturnType<typeof createTreeHarness> & { readDirectory: ReturnType<typeof vi.fn> } => {
    const readDirectory = vi.fn(async (path: string): Promise<FileTreeNode[]> => {
      if (path === `${workspaceRoot}/${models}`) {
        return readModels();
      }
      const listings: Record<string, FileTreeNode[]> = {
        [workspaceRoot]: [directoryNode('public'), directoryNode('src')],
        [`${workspaceRoot}/public`]: [directoryNode('models')],
        [`${workspaceRoot}/src`]: [textNode('main.ts')],
      };
      return listings[path] ?? [];
    });
    const harness = createTreeHarness({
      proxy: mock<ComposedViewClient>({
        readDirectory,
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue(textStat()),
        getDirectoryStat: vi.fn().mockResolvedValue([]),
      }),
      initialEntries: [
        { ...directoryEntry('public'), isDirectoryResolved: true },
        { ...directoryEntry(models), isDirectoryResolved: true },
        { ...textEntry(`${models}/box-corner.js`), name: 'box-corner.js' },
        { ...textEntry(`${models}/honeycomb.js`), name: 'honeycomb.js' },
        { ...directoryEntry('src'), isDirectoryResolved: true },
      ],
    });
    return { ...harness, readDirectory };
  };

  const swap = (emit: (event: ChangeEvent) => void): void => {
    emit({ type: 'fileRenamed', oldPath: `${models}/honeycomb.js`, newPath: backup, backend: 'indexeddb' });
    emit({ type: 'fileRenamed', oldPath: staged, newPath: `${models}/honeycomb.js`, backend: 'indexeddb' });
    emit({ type: 'fileDeleted', path: backup, backend: 'indexeddb' });
  };

  const modelsListing = (tree: FileTreeService): readonly string[] =>
    [...tree.getTreeSnapshot().keys()].filter((path) => path.startsWith(`${models}/`)).toSorted();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads the swapped directory when a write elsewhere lands in the same window', async () => {
    vi.useFakeTimers();
    const { tree, emitFileChanged, disposeChannel } = startSwapTree(async () => final);

    emitFileChanged({ type: 'fileWritten', path: staged, backend: 'indexeddb' });
    emitFileChanged({ type: 'fileWritten', path: 'src/main.ts', backend: 'indexeddb' });
    swap(emitFileChanged);
    await vi.advanceTimersByTimeAsync(500);

    expect(modelsListing(tree)).toEqual([`${models}/box-corner.js`, `${models}/honeycomb.js`]);
    tree.dispose();
    disposeChannel();
  });

  it("keeps a directory's re-read when another directory's refresh starts before it answers", async () => {
    vi.useFakeTimers();
    const slow = Promise.withResolvers<FileTreeNode[]>();
    const { tree, emitFileChanged, disposeChannel } = startSwapTree(async () => slow.promise);

    emitFileChanged({ type: 'fileWritten', path: staged, backend: 'indexeddb' });
    swap(emitFileChanged);
    await vi.advanceTimersByTimeAsync(500);
    emitFileChanged({ type: 'fileWritten', path: 'src/main.ts', backend: 'indexeddb' });
    await vi.advanceTimersByTimeAsync(500);
    slow.resolve(final);
    await vi.advanceTimersByTimeAsync(500);

    expect(modelsListing(tree)).toEqual([`${models}/box-corner.js`, `${models}/honeycomb.js`]);
    tree.dispose();
    disposeChannel();
  });

  it('re-reads after the swap when a listing taken mid-swap answers late', async () => {
    vi.useFakeTimers();
    const midSwap = Promise.withResolvers<FileTreeNode[]>();
    let reads = 0;
    const { tree, emitFileChanged, disposeChannel } = startSwapTree(async () => {
      reads++;
      return reads === 1 ? midSwap.promise : final;
    });

    emitFileChanged({ type: 'fileWritten', path: staged, backend: 'indexeddb' });
    await vi.advanceTimersByTimeAsync(500);
    swap(emitFileChanged);
    midSwap.resolve([
      textNode('box-corner.js'),
      textNode('.honeycomb.js.tau-backup.0.tmp'),
      textNode('.honeycomb.js.tau-staged.0.tmp'),
    ]);
    await vi.advanceTimersByTimeAsync(500);

    expect(modelsListing(tree)).toEqual([`${models}/box-corner.js`, `${models}/honeycomb.js`]);
    tree.dispose();
    disposeChannel();
  });
});

describe('FileTreeService listDirectory / subscribePath', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should reject with NotFound when readDirectory fails with ENOENT', async () => {
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({
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
      proxy: mock<ComposedViewClient>({
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
      proxy: mock<ComposedViewClient>({
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
      proxy: mock<ComposedViewClient>({
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
      proxy: mock<ComposedViewClient>({
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

describe('directory observation bootstrap and shared cancellation', () => {
  it('should preserve a selected directory owner until its delayed first acquisition after cache pressure', async () => {
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('initial.ts')]);
    const unsubscribe = vi.fn();
    let onWatch = (_event: WatchEvent): void => undefined;
    const watchReady = vi
      .fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>()
      .mockImplementation((_request, handler) => {
        onWatch = handler;
        return { ready: ready.promise, closed: closed.promise, unsubscribe };
      });
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
      watchReady,
    });
    try {
      const selected = tree.observeDirectory('source');
      for (let index = 0; index < 501; index++) {
        tree.observeDirectory(`unmounted-${index}`);
      }
      expect(watchReady).not.toHaveBeenCalled();
      expect(readDirectory).not.toHaveBeenCalled();
      const lease = selected.acquire();
      const peer = tree.observeDirectory('source').acquire();
      const notified = vi.fn();
      const off = lease.subscribe(notified);
      try {
        expect.soft(tree.observeDirectory('source')).toBe(selected);
        expect(watchReady).toHaveBeenCalledOnce();
        expect(lease.getSnapshot().status).toBe('registering');
        expect(readDirectory).not.toHaveBeenCalled();
        ready.resolve();
        await vi.waitFor(() => {
          expect(lease.getSnapshot()).toMatchObject({
            status: 'ready',
            value: { kind: 'ready', entries: [{ name: 'initial.ts' }] },
          });
        });
        expect(peer.getSnapshot()).toBe(lease.getSnapshot());
        expect(readDirectory).toHaveBeenCalledOnce();
        notified.mockClear();
        readDirectory.mockResolvedValue([textNode('current.ts')]);
        emitFileChanged({ type: 'directoryChanged', path: 'source', backend: 'indexeddb' });
        onWatch({ type: 'reset' });
        await vi.waitFor(() => {
          expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'current.ts' }] });
        });
        expect.soft(notified).toHaveBeenCalled();
        expect(peer.getSnapshot()).toBe(lease.getSnapshot());
        expect(readDirectory).toHaveBeenCalledTimes(2);
        peer.release();
        expect(unsubscribe).not.toHaveBeenCalled();
        closed.resolve();
        await vi.waitFor(() => {
          expect(lease.getSnapshot().status).toBe('closed');
        });
      } finally {
        off();
        peer.release();
        lease.release();
      }
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      ready.resolve();
      closed.resolve();
      tree.dispose();
      disposeChannel();
    }
  });

  it('should retain released directory identity while disposing active watches on root replacement and teardown', async () => {
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('initial.ts')]);
    const unsubscribe = vi.fn();
    const watchReady = vi.fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>().mockImplementation(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      unsubscribe,
    }));
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
      watchReady,
    });
    try {
      const selected = tree.observeDirectory('source');
      const first = selected.acquire();
      await vi.waitFor(() => {
        expect(first.getSnapshot().status).toBe('ready');
      });
      for (let index = 0; index < 501; index++) {
        tree.observeDirectory(`active-peer-${index}`);
      }
      expect(tree.observeDirectory('source')).toBe(selected);
      expect(watchReady).toHaveBeenCalledOnce();
      first.release();
      expect(unsubscribe).toHaveBeenCalledOnce();
      for (let index = 0; index < 501; index++) {
        tree.observeDirectory(`released-peer-${index}`);
      }
      expect(tree.observeDirectory('source')).toBe(selected);
      readDirectory.mockResolvedValue([textNode('fresh.ts')]);
      const second = selected.acquire();
      await vi.waitFor(() => {
        expect(second.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'fresh.ts' }] });
      });
      tree.reset('/projects/replacement');
      expect(unsubscribe).toHaveBeenCalledTimes(2);
      second.release();
      expect(unsubscribe).toHaveBeenCalledTimes(2);
      const replacement = tree.observeDirectory('source');
      expect(replacement).not.toBe(selected);
      const third = replacement.acquire();
      await vi.waitFor(() => {
        expect(third.getSnapshot().status).toBe('ready');
      });
      tree.dispose();
      expect(unsubscribe).toHaveBeenCalledTimes(3);
      third.release();
      expect(unsubscribe).toHaveBeenCalledTimes(3);
    } finally {
      tree.dispose();
      disposeChannel();
    }
  });

  it('should ignore stale finalized directory identity after root replacement', () => {
    const callbacks: Array<(held: unknown) => void> = [];
    const registrations: unknown[] = [];
    const nativeRegistry = globalThis.FinalizationRegistry;
    class ControlledRegistry extends nativeRegistry<unknown> {
      public constructor(callback: (held: unknown) => void) {
        super(callback);
        callbacks.push(callback);
      }

      public override register(...args: Parameters<FinalizationRegistry<unknown>['register']>): void {
        registrations.push(args[1]);
        super.register(...args);
      }
    }
    vi.stubGlobal('FinalizationRegistry', ControlledRegistry);
    const { tree, disposeChannel } = createTreeHarness({ proxy: mock<ComposedViewClient>() });
    try {
      const old = tree.observeDirectory('source');
      expect(registrations).toHaveLength(1);
      const stale = registrations[0];
      tree.reset('/projects/replacement');
      const current = tree.observeDirectory('source');
      expect(current).not.toBe(old);
      expect(registrations).toHaveLength(2);
      callbacks[0]!(stale);
      expect(tree.observeDirectory('source')).toBe(current);
      expect(current.getSnapshot().status).toBe('registering');
    } finally {
      tree.dispose();
      disposeChannel();
      vi.unstubAllGlobals();
    }
  });

  it('should read fresh rows after reacquisition acknowledges without background refresh', async () => {
    const ready = Promise.withResolvers<void>();
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('old.ts')]);
    const unsubscribe = vi.fn();
    const watchReady = vi
      .fn<NonNullable<WorkerChangeChannelTransport['watchReady']>>()
      .mockReturnValueOnce({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, unsubscribe })
      .mockReturnValue({ ready: ready.promise, closed: Promise.withResolvers<void>().promise, unsubscribe: vi.fn() });
    const { tree, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
      watchReady,
    });
    const observation = tree.observeDirectory('source');
    const first = observation.acquire();
    await vi.waitFor(() => {
      expect(first.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'old.ts' }] });
    });
    first.release();
    expect(unsubscribe).toHaveBeenCalledOnce();
    readDirectory.mockResolvedValue([textNode('fresh.ts')]);
    const second = observation.acquire();
    expect(watchReady).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(readDirectory).toHaveBeenCalledOnce();
    ready.resolve();
    await vi.waitFor(() => {
      expect(second.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'fresh.ts' }] });
    });
    expect(readDirectory).toHaveBeenCalledTimes(2);
    second.release();
    tree.dispose();
    disposeChannel();
  });

  it('should surface a current scheduled refresh failure and recover on explicit retry', async () => {
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('safe.ts')]);
    const { tree, disposeChannel } = createTreeHarness({ proxy: mock<ComposedViewClient>({ readDirectory }) });
    const lease = tree.observeDirectory('source').acquire();
    try {
      await vi.waitFor(() => {
        expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready' });
      });
      readDirectory.mockRejectedValueOnce(new Error('current scheduled failure'));
      tree.scheduleRefresh('source');
      await vi.waitFor(() => {
        expect(lease.getSnapshot().value).toMatchObject({ kind: 'error' });
      });
      readDirectory.mockResolvedValue([textNode('recovered.ts')]);
      lease.refresh();
      await vi.waitFor(() => {
        expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'recovered.ts' }] });
      });
      expect(readDirectory).toHaveBeenCalledTimes(3);
    } finally {
      lease.release();
      tree.dispose();
      disposeChannel();
    }
  });

  it('should ignore an older scheduled refresh failure after an observed listing publishes newer rows', async () => {
    const held = Promise.withResolvers<FileTreeNode[]>();
    const readDirectory = vi
      .fn<ComposedViewClient['readDirectory']>()
      .mockReturnValueOnce(held.promise)
      .mockResolvedValue([textNode('fresh.ts')]);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { tree, disposeChannel } = createTreeHarness({ proxy: mock<ComposedViewClient>({ readDirectory }) });
    tree.scheduleRefresh('source');
    await vi.waitFor(() => {
      expect(readDirectory).toHaveBeenCalledOnce();
    });
    const lease = tree.observeDirectory('source').acquire();
    try {
      await vi.waitFor(() => {
        expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'fresh.ts' }] });
      });
      const fresh = lease.getSnapshot().value;
      const failure = new Error('obsolete scheduled refresh');
      held.reject(failure);
      await vi.waitFor(() => {
        expect(logged).toHaveBeenCalledWith('[FileTreeService] refresh failed:', failure);
      });
      for (let index = 0; index < 12; index++) {
        // oxlint-disable-next-line no-await-in-loop -- Drain the rejected refresh notification and its causal observation read.
        await Promise.resolve();
      }
      expect(lease.getSnapshot()).toEqual({ status: 'ready', value: fresh });
      expect(lease.getSnapshot().value).toBe(fresh);
      expect(readDirectory).toHaveBeenCalledTimes(2);
      await expect(tree.listDirectory('source')).resolves.toMatchObject([{ name: 'fresh.ts' }]);
    } finally {
      lease.release();
      tree.dispose();
      disposeChannel();
      logged.mockRestore();
    }
  });

  it('should preserve explicit scheduled refresh for an actively observed directory', async () => {
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('safe.ts')]);
    const { tree, disposeChannel } = createTreeHarness({ proxy: mock<ComposedViewClient>({ readDirectory }) });
    const lease = tree.observeDirectory('source').acquire();
    await vi.waitFor(() => {
      expect(lease.getSnapshot().status).toBe('ready');
    });
    readDirectory.mockClear();
    readDirectory.mockResolvedValue([textNode('fresh.ts')]);
    tree.scheduleRefresh('source');
    await vi.waitFor(() => {
      expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'fresh.ts' }] });
    });
    expect(readDirectory).toHaveBeenCalledOnce();
    lease.release();
    tree.dispose();
    disposeChannel();
  });

  it('should share one authoritative reset read across exact watch and root channel delivery', async () => {
    let onWatch = (_event: WatchEvent): void => undefined;
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('safe.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
      watchReady: (_request, handler) => {
        onWatch = handler;
        return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, unsubscribe: vi.fn() };
      },
    });
    const lease = tree.observeDirectory('source').acquire();
    await vi.waitFor(() => {
      expect(lease.getSnapshot().status).toBe('ready');
    });
    readDirectory.mockClear();
    emitFileChanged({ type: 'backendChanged', backend: 'indexeddb' });
    onWatch({ type: 'reset' });
    await vi.waitFor(() => {
      expect(lease.getSnapshot().status).toBe('ready');
    });
    expect(readDirectory).toHaveBeenCalledOnce();
    lease.release();
    tree.dispose();
    disposeChannel();
  });

  it('should bound sustained directory invalidations and refuse stale rows until quiescence', async () => {
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('safe.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
    });
    const owner = tree.observeDirectory('source');
    const first = owner.acquire();
    const second = owner.acquire();
    await vi.waitFor(() => {
      expect(first.getSnapshot().status).toBe('ready');
    });
    const safe = first.getSnapshot().value;
    const pending: Array<PromiseWithResolvers<FileTreeNode[]>> = [];
    readDirectory.mockImplementation(async () => {
      const read = Promise.withResolvers<FileTreeNode[]>();
      pending.push(read);
      return read.promise;
    });
    for (let round = 0; round < 3; round++) {
      for (let index = 0; index < 20; index++) {
        emitFileChanged({ type: 'directoryChanged', path: 'source', backend: 'indexeddb' });
      }
      expect(pending).toHaveLength(round + 1);
      expect(first.getSnapshot()).toMatchObject({ status: 'pending', value: safe });
      if (round === 0) {
        first.release();
      }
      pending[round]!.resolve([textNode('stale.ts')]);
      // oxlint-disable-next-line no-await-in-loop -- Each held generation must finish before its single trailing read starts.
      await vi.waitFor(() => {
        expect(pending).toHaveLength(round + 2);
      });
      expect(tree.listDirectorySync('source')).toMatchObject([{ name: 'safe.ts' }]);
    }
    pending[3]!.resolve([textNode('current.ts')]);
    await vi.waitFor(() => {
      expect(second.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'current.ts' }] });
    });
    expect(readDirectory).toHaveBeenCalledTimes(5);
    expect(owner.diagnostics.activeWatches).toBe(1);
    second.release();
    expect(owner.diagnostics.activeWatches).toBe(0);
    tree.dispose();
    disposeChannel();
  });

  it('should refresh an observed shallow directory on child changes without refreshing unrelated directories', async () => {
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('alpha.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
    });
    const lease = tree.observeDirectory('source').acquire();
    await vi.waitFor(() => {
      expect(lease.getSnapshot().status).toBe('ready');
    });
    readDirectory.mockClear();
    readDirectory.mockResolvedValue([textNode('beta.ts')]);
    emitFileChanged({ type: 'fileWritten', path: 'other/file.ts', backend: 'indexeddb' });
    expect(readDirectory).not.toHaveBeenCalled();
    emitFileChanged({ type: 'fileWritten', path: 'source/beta.ts', backend: 'indexeddb' });
    await vi.waitFor(() => {
      expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'beta.ts' }] });
    });
    expect(readDirectory).toHaveBeenCalledOnce();
    lease.release();
    tree.dispose();
    disposeChannel();
  });

  it('should expose a failed authoritative update and retry fresh rows without revisiting', async () => {
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockResolvedValue([textNode('alpha.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
    });
    const lease = tree.observeDirectory('').acquire();
    await vi.waitFor(() => {
      expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'alpha.ts' }] });
    });
    readDirectory.mockRejectedValueOnce(new Error('provider unavailable'));
    emitFileChanged({ type: 'directoryChanged', path: '', backend: 'indexeddb' });
    await vi.waitFor(() => {
      expect(lease.getSnapshot().value).toMatchObject({ kind: 'error' });
    });
    readDirectory.mockResolvedValue([textNode('beta.ts')]);
    const reads = readDirectory.mock.calls.length;
    lease.refresh();
    await vi.waitFor(() => {
      expect(lease.getSnapshot().value).toMatchObject({ kind: 'ready', entries: [{ name: 'beta.ts' }] });
    });
    expect(readDirectory.mock.calls.length).toBeGreaterThan(reads);
    lease.release();
    tree.dispose();
    disposeChannel();
  });

  it('should catch up once after a burst invalidates a held bootstrap read', async () => {
    const first = Promise.withResolvers<FileTreeNode[]>();
    const readDirectory = vi
      .fn<ComposedViewClient['readDirectory']>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([textNode('latest.ts')]);
    const { tree, emitFileChanged, disposeChannel } = createTreeHarness({
      proxy: mock<ComposedViewClient>({ readDirectory }),
    });
    const listing = tree.listDirectory('');
    for (let index = 0; index < 100; index++) {
      emitFileChanged({ type: 'fileWritten', path: 'latest.ts', backend: 'indexeddb' });
    }
    expect(readDirectory).toHaveBeenCalledOnce();
    first.resolve([]);
    await expect(listing).resolves.toMatchObject([{ name: 'latest.ts' }]);
    expect(readDirectory).toHaveBeenCalledTimes(2);
    tree.dispose();
    disposeChannel();
  });

  it('should not let the first caller cancellation cancel a shared directory read', async () => {
    const pending = Promise.withResolvers<FileTreeNode[]>();
    const readDirectory = vi.fn<ComposedViewClient['readDirectory']>().mockReturnValue(pending.promise);
    const { tree, disposeChannel } = createTreeHarness({ proxy: mock<ComposedViewClient>({ readDirectory }) });
    const controller = new AbortController();
    const first = tree.listDirectory('', { signal: controller.signal });
    const second = tree.listDirectory('');
    controller.abort();
    pending.resolve([textNode('current.ts')]);
    await expect(first).rejects.toMatchObject({ listing: { code: DirectoryListingErrorCode.Aborted } });
    await expect(second).resolves.toMatchObject([{ name: 'current.ts' }]);
    expect(readDirectory).toHaveBeenCalledOnce();
    tree.dispose();
    disposeChannel();
  });
});

describe('directory capability replacement', () => {
  it('should fence a held old-root listing without deleting the new root read', async () => {
    const oldRead = Promise.withResolvers<FileTreeNode[]>();
    const newRead = Promise.withResolvers<FileTreeNode[]>();
    const readDirectory = vi
      .fn<ComposedViewClient['readDirectory']>()
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    const { tree, disposeChannel } = createTreeHarness({ proxy: mock<ComposedViewClient>({ readDirectory }) });
    const oldListing = (async (): Promise<unknown> => {
      try {
        return await tree.listDirectory('');
      } catch (error) {
        return error;
      }
    })();
    tree.reset('/projects/new');
    const newListing = tree.listDirectory('');
    oldRead.resolve([textNode('old.ts')]);
    expect(await oldListing).toBeInstanceOf(DirectoryListingFailedError);
    expect(tree.listDirectorySync('')).toBeUndefined();
    newRead.resolve([textNode('new.ts')]);
    await expect(newListing).resolves.toMatchObject([{ name: 'new.ts' }]);
    expect(readDirectory).toHaveBeenCalledTimes(2);
    tree.dispose();
    disposeChannel();
  });
});
