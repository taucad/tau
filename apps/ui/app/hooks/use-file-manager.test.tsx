import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import type { WatchRequest, WatchEvent, ProjectRootConfiguration } from '@taucad/filesystem';
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type * as HandleStore from '#filesystem/handle-store.js';
import type { ReactNode } from 'react';
import { StrictMode, useEffect } from 'react';
import { renderHook, render, screen, act, waitFor, configure, getConfig } from '@testing-library/react';
import { createActor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type * as WorkspaceTelemetryModule from '#utils/workspace-telemetry.utils.js';
import type * as RuntimeFileSystemModule from '@taucad/runtime/filesystem';
import type { WorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { WorkspaceEntry } from '#filesystem/handle-store.js';

const workerTestState = vi.hoisted(() => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- recursive type cannot be expressed inline
  const instances: Array<{
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    dispatchEvent: (event: Event) => void;
  }> = [];
  return { instances };
});

vi.mock('#machines/file-manager.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
    public postMessage = vi.fn();
    public addEventListener = vi.fn((type: string, handler: (event: Event) => void) => {
      const handlers = this.listeners.get(type) ?? new Set<(event: Event) => void>();
      handlers.add(handler);
      this.listeners.set(type, handlers);
    });
    public removeEventListener = vi.fn((type: string, handler: (event: Event) => void) => {
      this.listeners.get(type)?.delete(handler);
    });
    private readonly listeners = new Map<string, Set<(event: Event) => void>>();
    public constructor() {
      workerTestState.instances.push(this);
    }
    public dispatchEvent(event: Event): boolean {
      for (const handler of this.listeners.get(event.type) ?? []) {
        handler(event);
      }
      return true;
    }
  },
}));

const mockMount = vi.fn<(prefix: string, config: unknown) => Promise<void>>();
const mockUnmount = vi.fn<(prefix: string) => void>();
const mockConfigureProjectRoots = vi.fn<(configuration: ProjectRootConfiguration) => Promise<void>>();
const mockInvalidateStandaloneProvider = vi.fn<(backend: string, workspaceId?: string) => void>();
const mockProxyMkdir = vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(async () => undefined);
const mockProxyRmdir = vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(async () => undefined);
const mockProxyWriteFile = vi.fn<(path: string, data: unknown, options?: unknown) => Promise<void>>(
  async () => undefined,
);
const mockProxyCanDelete = vi.fn<(path: string) => Promise<unknown>>(async () => true);
const mockProxyMove = vi.fn<(source: string, target: string) => Promise<unknown>>(async () => ({
  type: 'file',
  size: 0,
  mtimeMs: 0,
}));
const mockProxyContents =
  vi.fn<(path: string, filter?: { versionedOnly?: boolean }) => Promise<Record<string, Uint8Array<ArrayBuffer>>>>();
const mockProxyExists = vi.fn<(path: string) => Promise<boolean>>();
const mockProxyReadFile = vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>();
const mockReadMachineSettings = vi.fn(
  async (_bridge: { worker?: unknown }, _typeId: string): Promise<{ status: 'absent' }> => ({
    status: 'absent',
  }),
);
const mockProxyDispose = vi.fn();
const bridgeProxyDisposals = new Map<unknown, () => void>();
const disposedBridges = new Map<unknown, boolean>();
const bridgeEventListeners = new Map<unknown, Set<(data: unknown) => void>>();
let readFileForBridge: ((bridge: { worker?: unknown }, path: string) => Promise<Uint8Array<ArrayBuffer>>) | undefined;
const mockWaitForWorkerReady = vi.fn<() => Promise<void>>();
const mockListProjectManifests = vi.fn<() => Promise<{ roots: readonly unknown[]; entries: readonly unknown[] }>>();
const mockCreateFileSystemBridge = vi.fn(() => ({
  port: {
    postMessage: vi.fn(),
    onMessage: vi.fn((_handler: (data: unknown) => void) => vi.fn()),
    close: vi.fn(),
  },
  dispose: vi.fn(),
}));
const mockOpenFileSystemBridge = vi.fn((_worker: unknown, _options: unknown) => ({
  port: new MessageChannel().port1,
  dispose: vi.fn(),
  worker: _worker,
}));

/* Observe the connection the opaque runtime filesystem opens, without changing
 * it: the thunk is only called when a runtime binds, so the pin calls it. */
const runtimeBridgeOpens = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock('@taucad/runtime/filesystem', async (importOriginal) => {
  const original = await importOriginal<typeof RuntimeFileSystemModule>();
  return {
    ...original,
    fromFileSystemBridge: (open: Parameters<(typeof RuntimeFileSystemModule)['fromFileSystemBridge']>[0]) => {
      runtimeBridgeOpens.push(open);
      return original.fromFileSystemBridge(open);
    },
  };
});

vi.mock('@taucad/fs-bridge', () => ({
  createFileSystemBridge: () => mockCreateFileSystemBridge(),
  openFileSystemBridge: (worker: unknown, options: unknown) => mockOpenFileSystemBridge(worker, options),
  waitForWorkerReady: async () => mockWaitForWorkerReady(),
  createFileSystemBridgeProxy: vi.fn((bridge: { worker?: unknown }) => ({
    /* A live worker never settles it; `ready` fails over when it does (G2c-2). A case kills one with `proxyDeaths`. */
    closed: new Promise<void>((resolve) => {
      proxyDeaths.push(resolve);
    }),
    ready: Promise.resolve(),
    hello: { payload: { state: 'ready' } },
    configureProjectRoots: mockConfigureProjectRoots,
    mount: mockMount,
    unmount: mockUnmount,
    disposeStorageRoot: mockInvalidateStandaloneProvider,
    getDirectoryStat: vi.fn(async () => []),
    /* The authority's wire spells its three scoped reads for the scope they
     * require; a routed read has a root that owns it (W11). */
    readScopedShallowDirectory: vi.fn(async () => []),
    readScopedFile: vi.fn(async () => new Uint8Array()),
    getScopedZippedDirectory: vi.fn(async () => new Blob()),
    readDirectory: vi.fn(async () => []),
    readdirWithStats: vi.fn(async () => []),
    canDelete: mockProxyCanDelete,
    move: mockProxyMove,
    contents: mockProxyContents,
    exists: async (path: string): Promise<boolean> => {
      if (disposedBridges.get(bridge)) {
        throw new Error('Bridge port was closed.');
      }
      const exists = await mockProxyExists(path);
      if (disposedBridges.get(bridge)) {
        throw new Error('Bridge port was closed.');
      }
      return exists;
    },
    readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      if (disposedBridges.get(bridge)) {
        throw new Error('Bridge port was closed.');
      }
      const bytes = readFileForBridge ? await readFileForBridge(bridge, path) : await mockProxyReadFile(path);
      if (disposedBridges.get(bridge)) {
        throw new Error('Bridge port was closed.');
      }
      return bytes;
    },
    readMachineSettings: async (typeId: string) => mockReadMachineSettings(bridge, typeId),
    /* The rooted half of the same proxy: the file services read the project
       through its composed view, and a mutation asks it who owns the path. */
    provenance: vi.fn(async (path: string) =>
      path.startsWith('.agents/skills/')
        ? { source: 'system-skills', versioned: false, agentAccess: 'read-only', identity: 'skill:demo@1.0.0#f' }
        : { source: 'project', versioned: true, agentAccess: 'read-write' },
    ),
    listProjectManifests: mockListProjectManifests,
    mkdir: mockProxyMkdir,
    rmdir: mockProxyRmdir,
    writeFile: mockProxyWriteFile,
    dispose: (() => {
      const dispose = vi.fn((): void => {
        disposedBridges.set(bridge, true);
        mockProxyDispose();
      });
      bridgeProxyDisposals.set(bridge, dispose);
      return dispose;
    })(),
    watchReady: (request: WatchRequest, handler: (event: WatchEvent) => void) => {
      const channel = new WorkerChangeChannel({
        transport: {
          listen: (_event, listener) => {
            const listeners = bridgeEventListeners.get(bridge) ?? new Set<(data: unknown) => void>();
            listeners.add(listener);
            bridgeEventListeners.set(bridge, listeners);
            return () => listeners.delete(listener);
          },
        },
      });
      const watch = channel.watchReady(request, handler);
      return {
        ready: watch.ready,
        closed: watch.closed,
        unsubscribe: () => {
          watch.dispose();
          channel.dispose();
        },
      };
    },
    listen: vi.fn((_event: string, handler: (data: unknown) => void) => {
      const listeners = bridgeEventListeners.get(bridge) ?? new Set<(data: unknown) => void>();
      listeners.add(handler);
      bridgeEventListeners.set(bridge, listeners);
      return () => {
        listeners.delete(handler);
      };
    }),
  })),
}));

const mockGetProjectFileSystemConfig =
  vi.fn<
    () => Promise<
      | { projectId: string; backend: 'indexeddb' | 'opfs' | 'memory' }
      | { projectId: string; backend: 'webaccess'; workspaceId: string }
      | undefined
    >
  >();

const mockSetProjectFileSystemConfig =
  vi.fn<(config: { projectId: string; backend: 'webaccess'; workspaceId: string }) => Promise<void>>();
const mockGetProjectRootConfigs = vi.fn<() => Promise<ProjectRootConfiguration>>();
const mockGetHomeStorageBackend = vi.fn<() => Promise<'indexeddb' | 'opfs'>>();
const handleStoreTestState = vi.hoisted(() => ({
  updateWorkspaceHandle: vi.fn(async () => undefined),
  disconnectWorkspace: vi.fn<(workspaceId: string) => Promise<WorkspaceEntry | undefined>>(async () => undefined),
  restoreWorkspaceHandle: vi.fn(async () => false),
}));

vi.mock('#filesystem/handle-store.js', () => ({
  getHomeStorageBackend: async () => mockGetHomeStorageBackend(),
  getProjectRootConfigs: async () => mockGetProjectRootConfigs(),
  getWorkspace: vi.fn(async () => undefined),
  getWorkspaceMetadata: vi.fn(async () => undefined),
  getProjectFileSystemConfig: async () => mockGetProjectFileSystemConfig(),
  checkHandlePermission: vi.fn(async () => 'granted'),
  createWorkspace: vi.fn(),
  setProjectFileSystemConfig: async (config: { projectId: string; backend: 'webaccess'; workspaceId: string }) =>
    mockSetProjectFileSystemConfig(config),
  requestHandlePermission: vi.fn(async () => true),
  updateWorkspaceHandle: handleStoreTestState.updateWorkspaceHandle,
  disconnectWorkspace: handleStoreTestState.disconnectWorkspace,
  restoreWorkspaceHandle: handleStoreTestState.restoreWorkspaceHandle,
}));

/* W6 RV1-F1: the agent host re-broker the root provider fires when its worker is replaced. */
const mockReprovideAgentHostProjects = vi.hoisted(() => vi.fn(async () => undefined));
/* One `closed` settler per proxy the file manager opened, newest last: settling it is that worker's death. */
const proxyDeaths = vi.hoisted(() => [] as Array<() => void>);
vi.mock('#services/agent-host-client.js', () => ({
  reprovideAgentHostProjects: mockReprovideAgentHostProjects,
}));

// Stub the workspace-telemetry hook so the provider doesn't pull in
// PostHog. The returned object is a typed mock so individual emitters can
// be asserted with `toHaveBeenCalled*`.
const workspaceTelemetryMock = mock<WorkspaceTelemetry>();

vi.mock('#utils/workspace-telemetry.utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceTelemetryModule>();
  return {
    ...actual,
    useWorkspaceTelemetry: () => workspaceTelemetryMock,
  };
});

const {
  waitForFileManagerServices,
  FileManagerProvider,
  HomeFileManagerProvider,
  useFileManager,
  useHomeStorageBackend,
  SharedWorkerGate,
} = await import('#hooks/use-file-manager.js');

describe('waitForFileManagerServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileForBridge = undefined;
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockWaitForWorkerReady.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetHomeStorageBackend.mockResolvedValue('opfs');
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
    mockConfigureProjectRoots.mockResolvedValue(undefined);
  });

  it('should resolve immediately when both services are already bound', async () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: true,
      },
    });
    actor.start();

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('ready');
    });

    const result = await waitForFileManagerServices(actor);
    expect(result.contentService).toBe(actor.getSnapshot().context.contentService);
    expect(result.treeService).toBe(actor.getSnapshot().context.treeService);

    actor.stop();
  });

  it('should wait until services become bound when initialization is gated', async () => {
    let resolveReady!: () => void;
    mockWaitForWorkerReady.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
    );

    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test-gate',
        shouldInitializeOnStart: true,
      },
    });
    actor.start();

    await vi.waitFor(() => {
      expect(mockWaitForWorkerReady).toHaveBeenCalledOnce();
    });

    const servicesPromise = waitForFileManagerServices(actor);

    resolveReady();

    const resolved = await servicesPromise;
    expect(resolved.contentService).toBeDefined();
    expect(resolved.treeService).toBeDefined();

    actor.stop();
  });

  it('should reject with FileManagerNotReadyError(machine-error) when the actor enters error', async () => {
    mockWaitForWorkerReady.mockReturnValue(
      new Promise<void>(() => {
        /* Never resolves — see file-manager.machine.test worker error diagnostics. */
      }),
    );

    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test-err',
        shouldInitializeOnStart: true,
      },
    });
    actor.start();

    await vi.waitFor(() => {
      expect(workerTestState.instances).toHaveLength(1);
    });
    const worker = workerTestState.instances[0]!;
    worker.dispatchEvent(new Event('error'));

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('error');
    });

    const { error } = actor.getSnapshot().context;
    expect(error).toBeInstanceOf(Error);

    // Audit R10 / Finding 8: the wait helper wraps machine-error states in a
    // structured `FileManagerNotReadyError` so callers can branch on
    // `code === 'machine-error'`. The original cause is preserved on `.cause`.
    await expect(waitForFileManagerServices(actor)).rejects.toMatchObject({
      name: 'FileManagerNotReadyError',
      code: 'machine-error',
      cause: error,
    });

    actor.stop();
  });
});

describe('HomeFileManagerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHomeStorageBackend.mockResolvedValue('opfs');
  });

  it('resolves Home once and shares the selected engine with nested mounts', async () => {
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <HomeFileManagerProvider rootDirectory='/' shouldInitializeOnStart={false}>
        <HomeFileManagerProvider rootDirectory='/nested' shouldInitializeOnStart={false}>
          {children}
        </HomeFileManagerProvider>
      </HomeFileManagerProvider>
    );
    const { result } = renderHook(() => useHomeStorageBackend(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current).toBe('opfs');
    });
    expect(mockGetHomeStorageBackend).toHaveBeenCalledOnce();
  });
});

describe('SharedWorkerGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetHomeStorageBackend.mockResolvedValue('opfs');
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
  });

  /* R7: a machine that gave up used to leave the gate's whole subtree blank. */
  it('explains a failed worker connection instead of rendering nothing', async () => {
    mockWaitForWorkerReady.mockRejectedValue(new Error('worker never became ready'));

    render(
      <HomeFileManagerProvider rootDirectory='/'>
        <SharedWorkerGate>
          <div>subtree</div>
        </SharedWorkerGate>
      </HomeFileManagerProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { name: "Couldn't start the file service" })).toBeInTheDocument();
    });
    expect(screen.queryByText('subtree')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  /* The app-wide gate sits above the shell, where nothing sizes it; its notice
   * collapsed to the top of its icon until it took the window. */
  it('lets the notice of a gate above the shell take the window', async () => {
    mockWaitForWorkerReady.mockRejectedValue(new Error('worker never became ready'));

    render(
      <HomeFileManagerProvider rootDirectory='/'>
        <SharedWorkerGate withShellFrame>
          <div>subtree</div>
        </SharedWorkerGate>
      </HomeFileManagerProvider>,
    );

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveClass('h-dvh', 'w-full');
  });

  /* Connecting is progress, and a route that knows what it is opening says so instead of a blank. */
  it('shows the caller\u2019s placeholder while the worker connects', async () => {
    /* `Once`, so the pending promise does not leak into the suites below (`clearAllMocks` keeps implementations). */
    mockWaitForWorkerReady.mockReturnValueOnce(Promise.withResolvers<undefined>().promise);

    render(
      <HomeFileManagerProvider rootDirectory='/'>
        <SharedWorkerGate placeholder={<div>opening</div>}>
          <div>subtree</div>
        </SharedWorkerGate>
      </HomeFileManagerProvider>,
    );

    expect(await screen.findByText('opening')).toBeInTheDocument();
    expect(screen.queryByText('subtree')).not.toBeInTheDocument();
  });

  /* Home's own wait gates the whole app, so it takes the same placeholder. */
  it('shows the placeholder while Home\u2019s storage engine resolves', async () => {
    mockGetHomeStorageBackend.mockReturnValueOnce(Promise.withResolvers<'indexeddb' | 'opfs'>().promise);

    render(
      <HomeFileManagerProvider rootDirectory='/' placeholder={<div>opening</div>}>
        <div>subtree</div>
      </HomeFileManagerProvider>,
    );

    expect(await screen.findByText('opening')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Opening Home' })).not.toBeInTheDocument();
    expect(screen.queryByText('subtree')).not.toBeInTheDocument();
  });
});

describe('FileManagerProvider — bindProjectToWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockWaitForWorkerReady.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockListProjectManifests.mockResolvedValue({ roots: [], entries: [] });
  });

  const setDiscoveredProject = (projectId: string, workspaceId: string): void => {
    mockListProjectManifests.mockResolvedValue({
      roots: [],
      entries: [
        {
          status: 'valid',
          manifest: { id: projectId },
          locator: {
            backend: 'webaccess',
            workspaceId,
            storageRootKey: `webaccess:${workspaceId}`,
            relativeDirectory: `/${projectId}`,
          },
        },
      ],
    });
  };

  const renderProvider = (projectId: string | undefined) => {
    // Audit R4 / R15: `FileManagerProvider` requires an explicit
    // `initialBackend`. The discriminated-union props compile-time-reject
    // `webaccess` without `projectId`, so we mirror the production default
    // (`indexeddb`) in tests.
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element =>
      projectId === undefined ? (
        <FileManagerProvider initialBackend='indexeddb' rootDirectory='/projects/root'>
          {children}
        </FileManagerProvider>
      ) : (
        <FileManagerProvider initialBackend='indexeddb' projectId={projectId} rootDirectory={`/projects/${projectId}`}>
          {children}
        </FileManagerProvider>
      );
    return renderHook(() => useFileManager(), { wrapper });
  };

  /* Finding 7: a provider's first worker replaced no host's bridges, so mounting one (the share page's among them)
   * never re-brokers the agent host. */
  it('should not re-broker agent project hosts when a provider mounts its first worker', async () => {
    const { result } = renderProvider('proj-first');

    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });

    expect(mockReprovideAgentHostProjects).not.toHaveBeenCalled();
  });

  /* RV1-F1 (W6.r1 round 3): a restart replaces the root mount's worker, so each open agent project host is re-brokered
   * onto the new one, once. */
  it('should re-broker agent project hosts when the file manager restarts its worker', async () => {
    const { result } = renderProvider('proj-restart');
    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });
    const firstContentService = result.current.contentService;
    const workers = workerTestState.instances.length;
    mockReprovideAgentHostProjects.mockClear();

    /* The root mount's worker dies, so every proxy over it closes; the file manager restarts it once, unasked (RV1-F1). */
    act(() => {
      for (const die of proxyDeaths.splice(0)) {
        die();
      }
    });

    await vi.waitFor(() => {
      expect(workerTestState.instances.length).toBe(workers + 1);
      expect(result.current.contentService).toBeDefined();
      expect(result.current.contentService).not.toBe(firstContentService);
      expect(mockReprovideAgentHostProjects).toHaveBeenCalledTimes(1);
    });
  });

  it('should persist ProjectFileSystemConfig before dispatching reloadWorkspace', async () => {
    const { result } = renderProvider('proj-bind');
    setDiscoveredProject('proj-bind', 'wsp_target');

    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });

    await act(async () => {
      await result.current.bindProjectToWorkspace('wsp_target');
    });

    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith({
      projectId: 'proj-bind',
      backend: 'webaccess',
      workspaceId: 'wsp_target',
      providerBasePath: '/proj-bind',
    });
    // The IDB write completes before the event reaches the actor — call
    // order is the binding-transaction contract.
    const persistCallIndex = mockSetProjectFileSystemConfig.mock.invocationCallOrder[0];
    expect(persistCallIndex).toBeDefined();
  });

  it('should dispatch reloadWorkspace so the FM machine re-reads the persistent record', async () => {
    mockGetProjectFileSystemConfig.mockImplementation(async () => ({
      projectId: 'proj-reload',
      backend: 'webaccess',
      workspaceId: 'wsp_initial',
    }));

    const { result } = renderProvider('proj-reload');
    setDiscoveredProject('proj-reload', 'wsp_next');

    await vi.waitFor(() => {
      expect(mockGetProjectFileSystemConfig).toHaveBeenCalled();
    });
    mockGetProjectFileSystemConfig.mockClear();

    mockGetProjectFileSystemConfig.mockImplementation(async () => ({
      projectId: 'proj-reload',
      backend: 'webaccess',
      workspaceId: 'wsp_next',
    }));

    await act(async () => {
      await result.current.bindProjectToWorkspace('wsp_next');
    });

    // After dispatch, the actor's `initializeServicesActor` re-runs and
    // reads the persistent record again — proves the binding transaction
    // round-trips through IDB rather than through actor context.
    await vi.waitFor(() => {
      expect(mockGetProjectFileSystemConfig).toHaveBeenCalled();
    });
  });

  it('should emit workspaceSwap telemetry with the prior workspaceId on bind', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: 'proj-tele',
      backend: 'webaccess',
      workspaceId: 'wsp_prev',
    });

    const { result } = renderProvider('proj-tele');
    setDiscoveredProject('proj-tele', 'wsp_new');

    // Wait for the initial init so `activeWorkspaceId` is populated.
    await vi.waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe('wsp_prev');
    });

    await act(async () => {
      await result.current.bindProjectToWorkspace('wsp_new');
    });

    expect(workspaceTelemetryMock.workspaceSwap).toHaveBeenCalledExactlyOnceWith({
      previousWorkspaceId: 'wsp_prev',
      nextWorkspaceId: 'wsp_new',
    });
  });

  it('should reject when called without a project scope', async () => {
    const { result } = renderProvider(undefined);

    await expect(result.current.bindProjectToWorkspace('wsp_any')).rejects.toThrow(/requires a project scope/);
    expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
  });
});

describe('FileManagerProvider — client + workspace facades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeEventListeners.clear();
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockWaitForWorkerReady.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
  });

  const renderProvider = () => {
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <FileManagerProvider initialBackend='indexeddb' rootDirectory='/projects/root'>
        {children}
      </FileManagerProvider>
    );
    return renderHook(() => useFileManager(), { wrapper });
  };

  it('watches live workbench records through their own root while the selected code root is a checkout', async () => {
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <StrictMode>
        <FileManagerProvider initialBackend='indexeddb' projectId='p' rootDirectory='/checkouts/c'>
          {children}
        </FileManagerProvider>
      </StrictMode>
    );
    const { result, unmount } = renderHook(() => useFileManager(), { wrapper });
    const liveBridges = (): unknown[] =>
      mockOpenFileSystemBridge.mock.calls.flatMap(([, options], index) => {
        const bridge: unknown = mockOpenFileSystemBridge.mock.results[index]?.value;
        return typeof options === 'object' &&
          options !== null &&
          'root' in options &&
          options.root === '/projects/p' &&
          'consumer' in options &&
          options.consumer === 'working-copy'
          ? [bridge]
          : [];
      });
    const changed = vi.fn();
    const path = '.tau/workbench/layout.json';
    const watch = result.current.watchRecordFile(`/projects/p/${path}`, changed);
    await watch.ready;
    const firstBridge = liveBridges()[0];
    act(() => {
      for (const handler of bridgeEventListeners.get(firstBridge) ?? []) {
        handler({ type: 'fileWritten', path, backend: 'opfs' });
        handler({ type: 'fileWritten', path: 'src/model.ts', backend: 'opfs' });
      }
    });
    expect(changed).toHaveBeenCalledOnce();
    act(() => {
      for (const handler of bridgeEventListeners.get(firstBridge) ?? []) {
        handler({ type: 'directoryRenamed', oldPath: '.tau/workbench', newPath: '.tau/other', backend: 'opfs' });
        handler({ type: 'directoryCopied', sourcePath: 'src/records', targetPath: '.tau/workbench', backend: 'opfs' });
      }
    });
    expect(changed).toHaveBeenCalledTimes(3);
    watch.dispose();
    act(() => {
      for (const handler of bridgeEventListeners.get(firstBridge) ?? []) {
        handler({ type: 'fileDeleted', path, backend: 'opfs' });
      }
    });
    expect(changed).toHaveBeenCalledTimes(3);
    const firstService = result.current.contentService;
    act(() => {
      result.current.fileManagerRef.send({ type: 'setRoot', path: '/checkouts/other', projectId: 'p' });
    });
    await vi.waitFor(() => {
      expect(result.current.contentService).not.toBe(firstService);
    });
    expect(bridgeEventListeners.get(firstBridge)?.size).toBe(0);
    const secondWatch = result.current.watchRecordFile(`/projects/p/${path}`, changed);
    await secondWatch.ready;
    const secondBridge = liveBridges()[1];
    act(() => {
      for (const handler of bridgeEventListeners.get(secondBridge) ?? []) {
        handler({ type: 'fileWritten', path, backend: 'opfs' });
      }
    });
    expect(changed).toHaveBeenCalledTimes(4);
    expect(bridgeProxyDisposals.get(firstBridge)).toHaveBeenCalledOnce();
    secondWatch.dispose();
    unmount();
    expect(bridgeProxyDisposals.get(secondBridge)).toHaveBeenCalledOnce();
  });

  it('should complete a rooted record read begun before the worker connects', async () => {
    const ready = Promise.withResolvers<void>();
    mockWaitForWorkerReady.mockReturnValueOnce(ready.promise);
    mockProxyExists.mockResolvedValue(true);
    const { result } = renderProvider();

    const read = result.current.recordFiles.exists('/projects/root/.tau/workbench/layout.json');
    await act(async () => {
      ready.resolve();
    });

    await expect(read).resolves.toBe(true);
    expect(mockProxyExists).toHaveBeenCalledExactlyOnceWith('.tau/workbench/layout.json');
  });

  it('should reopen a held rooted record client after the worker changes', async () => {
    mockProxyExists.mockResolvedValue(true);
    const { result } = renderProvider();
    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });
    const files = result.current.recordFiles;
    const path = '/projects/root/.tau/workbench/layout.json';
    await expect(files.exists(path)).resolves.toBe(true);
    const firstService = result.current.contentService;

    act(() => {
      result.current.fileManagerRef.send({ type: 'setRoot', path: '/projects/root', projectId: 'other' });
    });
    await vi.waitFor(() => {
      expect(result.current.contentService).not.toBe(firstService);
    });
    await expect(files.exists(path)).resolves.toBe(true);

    const opens = mockOpenFileSystemBridge.mock.calls.filter(
      ([, options]) =>
        typeof options === 'object' && options !== null && 'consumer' in options && options.consumer === 'working-copy',
    );
    expect(opens).toHaveLength(2);
    expect(mockProxyExists).toHaveBeenCalledTimes(2);
  });

  it('fences a delayed machine-settings read on its original worker after root rotation', async () => {
    const { result } = renderProvider();
    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });
    const firstWorker = workerTestState.instances[0];
    const oldSettings = result.current.machineSettings;
    let releaseRead!: () => void;
    const heldRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    mockReadMachineSettings.mockImplementationOnce(async () => {
      await heldRead;
      return { status: 'absent' };
    });
    const oldRead = oldSettings.refresh('bambu.x1c');
    const oldReadClosed = expect(oldRead).rejects.toThrow('Settings observation closed');
    await vi.waitFor(() => {
      expect(mockReadMachineSettings).toHaveBeenCalledOnce();
    });
    act(() => {
      result.current.fileManagerRef.send({ type: 'setRoot', path: '/checkouts/next', projectId: 'p' });
    });
    await vi.waitFor(() => {
      expect(result.current.machineSettings).not.toBe(oldSettings);
      expect(workerTestState.instances).toHaveLength(2);
    });
    const currentSettings = result.current.machineSettings;
    await oldReadClosed;
    const retiredProjection = oldSettings.get('bambu.x1c');
    releaseRead();
    await currentSettings.refresh('bambu.x1c');
    expect(oldSettings.get('bambu.x1c')).toBe(retiredProjection);

    const settingsWorkers = mockReadMachineSettings.mock.calls.map(([bridge]) => bridge.worker);
    expect(settingsWorkers).toHaveLength(2);
    expect(settingsWorkers[0]).toBe(firstWorker);
    expect(settingsWorkers[1]).toBe(workerTestState.instances[1]);
    const oldBridge = mockReadMachineSettings.mock.calls[0]?.[0];
    await vi.waitFor(() => {
      expect(bridgeProxyDisposals.get(oldBridge)).toHaveBeenCalledOnce();
    });
    expect(currentSettings.get('bambu.x1c').file.status).toBe('absent');
  });

  it('reads replacement-worker bytes from a child effect before the provider effects run', async () => {
    const path = '/projects/root/.tau/workbench/layout.json';
    mockProxyExists.mockResolvedValue(true);
    const reads: Array<{ service: unknown; bytes: Promise<Uint8Array<ArrayBuffer> | Error> }> = [];
    let replaceWorker = (): void => {
      throw new Error('Child has not rendered.');
    };
    readFileForBridge = async (bridge) => new Uint8Array([bridge.worker === workerTestState.instances[0] ? 1 : 2]);

    const Child = (): React.JSX.Element => {
      const { contentService, fileManagerRef, recordFiles } = useFileManager();
      replaceWorker = () => {
        fileManagerRef.send({ type: 'setRoot', path: '/projects/root', projectId: 'other' });
      };
      useEffect(() => {
        const bytes = (async (): Promise<Uint8Array<ArrayBuffer> | Error> => {
          try {
            if (!(await recordFiles.exists(path))) {
              throw new Error('Record missing.');
            }
            return await recordFiles.readFile(path);
          } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
          }
        })();
        reads.push({ service: contentService, bytes });
      }, [contentService, recordFiles]);
      return <span hidden />;
    };

    render(
      <FileManagerProvider initialBackend='indexeddb' rootDirectory='/projects/root'>
        <Child />
      </FileManagerProvider>,
    );
    await vi.waitFor(() => {
      expect(reads.some((read) => read.service !== undefined)).toBe(true);
    });
    const initialReadyRead = reads.find((read) => read.service !== undefined);
    await expect(initialReadyRead?.bytes).resolves.toEqual(new Uint8Array([1]));
    const firstBridgeIndex = mockOpenFileSystemBridge.mock.calls.findIndex(
      ([, options]) =>
        typeof options === 'object' && options !== null && 'consumer' in options && options.consumer === 'working-copy',
    );
    const firstBridge: unknown = mockOpenFileSystemBridge.mock.results[firstBridgeIndex]?.value;
    expect(firstBridge).toBeDefined();

    const readCountBeforeReplacement = reads.length;
    act(() => {
      replaceWorker();
    });
    await vi.waitFor(() => {
      expect(reads.slice(readCountBeforeReplacement).some((read) => read.service !== undefined)).toBe(true);
    });
    const replacementReads = reads.slice(readCountBeforeReplacement);
    await expect(Promise.all(replacementReads.map(async (read) => read.bytes))).resolves.toEqual(
      replacementReads.map(() => new Uint8Array([2])),
    );
    expect(bridgeProxyDisposals.get(firstBridge)).toHaveBeenCalledOnce();
  });

  it('reads versioned files and only registry-selected writable record subtrees for duplication', async () => {
    mockProxyExists.mockResolvedValue(true);
    mockProxyContents.mockImplementation(
      async (path): Promise<Record<string, Uint8Array<ArrayBuffer>>> =>
        path === ''
          ? { 'main.ts': new Uint8Array([1]), 'tau.json': new Uint8Array([2]) }
          : {
              'layout.json': new Uint8Array([3]),
              'views/v-abc12345.json': new Uint8Array([4]),
              'entries.json': new Uint8Array([5]),
            },
    );
    const { result } = renderProvider();
    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });

    const files = await result.current.readDuplicateProjectFiles('/projects/source');

    expect(files).toEqual({
      'main.ts': new Uint8Array([1]),
      'tau.json': new Uint8Array([2]),
      '.tau/workbench/layout.json': new Uint8Array([3]),
      '.tau/workbench/views/v-abc12345.json': new Uint8Array([4]),
      '.tau/workbench/entries.json': new Uint8Array([5]),
    });
    expect(mockOpenFileSystemBridge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ root: '/projects/source', consumer: 'user' }),
    );
    expect(mockProxyContents.mock.calls).toEqual([['', { versionedOnly: true }], ['.tau/workbench']]);
    expect(mockProxyExists.mock.calls).toEqual([['.tau/workbench']]);
    expect(mockProxyReadFile).not.toHaveBeenCalled();
    expect(mockProxyDispose).toHaveBeenCalledOnce();
  });

  it('skips absent writable records without reading chats, control plane or cache', async () => {
    mockProxyExists.mockResolvedValue(false);
    mockProxyContents.mockResolvedValue({ 'main.ts': new Uint8Array([1]) });
    const { result } = renderProvider();
    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });

    await expect(result.current.readDuplicateProjectFiles('/projects/source')).resolves.toEqual({
      'main.ts': new Uint8Array([1]),
    });
    expect(mockProxyContents.mock.calls).toEqual([['', { versionedOnly: true }]]);
    expect(mockProxyExists.mock.calls).toEqual([['.tau/workbench']]);
    expect(mockProxyReadFile).not.toHaveBeenCalled();
    expect(mockProxyDispose).toHaveBeenCalledOnce();
  });

  it('exposes a scope-required storage facade whose reads route through the worker proxy', async () => {
    const { result } = renderProvider();

    expect(result.current.client).toBeDefined();
    // Spot-check method shape: a physical scope the mount table does not route
    // is gated on proxy readiness and forwards to the authority (charter D5).
    await act(async () => {
      const nodes = await result.current.scopedStorage.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes).toEqual([]);
    });
  });

  it('exposes a workspace facade that wires mount/unmount/root teardown to the proxy', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.workspace.mount('/scratch', {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:0',
      });
    });
    expect(mockMount).toHaveBeenCalledExactlyOnceWith('/scratch', {
      class: 'authored',
      backend: 'memory',
      storageRootKey: 'memory:0',
    });

    await act(async () => {
      result.current.workspace.unmount('/scratch');
    });
    await vi.waitFor(() => {
      expect(mockUnmount).toHaveBeenCalledExactlyOnceWith('/scratch');
    });

    await act(async () => {
      await result.current.workspace.disposeStorageRoot('webaccess:wsp_x');
    });
    expect(mockInvalidateStandaloneProvider).toHaveBeenCalledExactlyOnceWith('webaccess:wsp_x');
  });

  it('synchronizes the initiating tab after replacing, disconnecting, or restoring a workspace handle', async () => {
    const { result } = renderProvider();
    const handle = mock<FileSystemDirectoryHandle>();

    await act(async () => {
      await result.current.workspace.replaceWorkspaceHandle('wsp_x', handle);
    });
    expect(handleStoreTestState.updateWorkspaceHandle).toHaveBeenCalledExactlyOnceWith('wsp_x', handle);
    expect(mockInvalidateStandaloneProvider).toHaveBeenCalledExactlyOnceWith('webaccess:wsp_x');
    expect(mockConfigureProjectRoots).toHaveBeenCalledWith(await mockGetProjectRootConfigs());

    vi.clearAllMocks();
    handleStoreTestState.disconnectWorkspace.mockResolvedValue({
      workspace: {
        workspaceId: 'wsp_x',
        name: 'Workspace',
        slug: 'workspace',
        lastConnectedAt: 1,
      },
      handle,
    });
    await act(async () => {
      await result.current.workspace.disconnectWorkspace('wsp_x');
    });
    expect(handleStoreTestState.disconnectWorkspace).toHaveBeenCalledExactlyOnceWith('wsp_x');
    expect(mockInvalidateStandaloneProvider).toHaveBeenCalledExactlyOnceWith('webaccess:wsp_x');
    expect(mockConfigureProjectRoots).toHaveBeenCalledWith(await mockGetProjectRootConfigs());

    vi.clearAllMocks();
    handleStoreTestState.restoreWorkspaceHandle.mockResolvedValue(true);
    await act(async () => {
      await result.current.workspace.restoreWorkspaceHandle('wsp_x', handle);
    });
    expect(handleStoreTestState.restoreWorkspaceHandle).toHaveBeenCalledExactlyOnceWith('wsp_x', handle);
    expect(mockInvalidateStandaloneProvider).toHaveBeenCalledExactlyOnceWith('webaccess:wsp_x');
    expect(mockConfigureProjectRoots).toHaveBeenCalledWith(await mockGetProjectRootConfigs());
  });

  it('keeps root sync usable from a passive effect after StrictMode layout replay', async () => {
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
    const priorStrictMode = getConfig().reactStrictMode;
    configure({ reactStrictMode: true });
    const started = vi.fn();
    const completed = vi.fn();
    const failed = vi.fn();
    const effects: Array<Promise<void>> = [];
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <FileManagerProvider initialBackend='indexeddb' rootDirectory='/projects/root'>
        {children}
      </FileManagerProvider>
    );
    const { result, unmount } = renderHook(
      () => {
        const manager = useFileManager();
        const { workspace } = manager;
        useEffect(() => {
          const controller = new AbortController();
          started();
          effects.push(
            (async () => {
              try {
                await workspace.syncProjectRoots();
                if (!controller.signal.aborted) {
                  completed();
                }
              } catch (error) {
                if (!controller.signal.aborted) {
                  failed(error);
                }
              }
            })(),
          );
          return () => {
            controller.abort();
          };
        }, [workspace]);
        return manager;
      },
      { wrapper },
    );
    try {
      await waitFor(() => {
        expect(completed).toHaveBeenCalledOnce();
      });
      expect(started).toHaveBeenCalledTimes(2);
      expect(failed).not.toHaveBeenCalled();
      const configured = mockConfigureProjectRoots.mock.calls.length;
      await act(async () => {
        await result.current.workspace.syncProjectRoots();
      });
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(configured + 1);
    } finally {
      unmount();
      await Promise.allSettled(effects);
      configure({ reactStrictMode: priorStrictMode });
    }
  });

  it('bounds overlapping root sync to a fresh trailing reconcile', async () => {
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
    const { result, unmount } = renderProvider();
    await waitFor(() => {
      expect(result.current.treeService).toBeDefined();
    });
    mockGetProjectRootConfigs.mockClear();
    mockConfigureProjectRoots.mockClear();
    const held = Promise.withResolvers<void>();
    mockConfigureProjectRoots.mockImplementationOnce(async () => held.promise);
    const first = result.current.workspace.syncProjectRoots();
    await waitFor(() => {
      expect(mockConfigureProjectRoots).toHaveBeenCalledOnce();
    });
    const settled = vi.fn();
    const second = (async () => {
      await result.current.workspace.syncProjectRoots();
      settled();
    })();
    const third = (async () => {
      await result.current.workspace.syncProjectRoots();
      settled();
    })();
    const fourth = (async () => {
      await result.current.workspace.syncProjectRoots();
      settled();
    })();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect.soft(settled).not.toHaveBeenCalled();
      expect.soft(mockConfigureProjectRoots).toHaveBeenCalledOnce();
      held.resolve();
      await act(async () => {
        await Promise.all([first, second, third, fourth]);
      });
      expect(mockGetProjectRootConfigs).toHaveBeenCalledTimes(2);
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(2);
      expect(settled).toHaveBeenCalledTimes(3);
    } finally {
      held.resolve();
      await Promise.allSettled([first, second, third, fourth]);
      unmount();
    }
  });

  it('runs another fresh root sync for calls arriving during the trailing pass', async () => {
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
    const { result, unmount } = renderProvider();
    await waitFor(() => {
      expect(result.current.treeService).toBeDefined();
    });
    mockConfigureProjectRoots.mockClear();
    const head = Promise.withResolvers<void>();
    const trailing = Promise.withResolvers<void>();
    mockConfigureProjectRoots
      .mockImplementationOnce(async () => head.promise)
      .mockImplementationOnce(async () => trailing.promise);
    const first = result.current.workspace.syncProjectRoots();
    await waitFor(() => {
      expect(mockConfigureProjectRoots).toHaveBeenCalledOnce();
    });
    const second = result.current.workspace.syncProjectRoots();
    await act(async () => {
      head.resolve();
      await first;
    });
    await waitFor(() => {
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(2);
    });
    const settled = vi.fn();
    const third = (async () => {
      await result.current.workspace.syncProjectRoots();
      settled();
    })();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect.soft(settled).not.toHaveBeenCalled();
      expect.soft(mockConfigureProjectRoots).toHaveBeenCalledTimes(2);
      trailing.resolve();
      await act(async () => {
        await Promise.all([first, second, third]);
      });
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(3);
      expect(settled).toHaveBeenCalledOnce();
    } finally {
      head.resolve();
      trailing.resolve();
      await Promise.allSettled([first, second, third]);
      unmount();
    }
  });

  it('rejects only the failed root sync pass and still reconciles queued callers and retries', async () => {
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
    const { result, unmount } = renderProvider();
    await waitFor(() => {
      expect(result.current.treeService).toBeDefined();
    });
    mockConfigureProjectRoots.mockClear();
    const held = Promise.withResolvers<void>();
    mockConfigureProjectRoots.mockImplementationOnce(async () => held.promise);
    const first = result.current.workspace.syncProjectRoots();
    const firstResult = (async () => {
      try {
        await first;
        return 'unexpected-success';
      } catch (error) {
        return error;
      }
    })();
    await waitFor(() => {
      expect(mockConfigureProjectRoots).toHaveBeenCalledOnce();
    });
    const settled = vi.fn();
    const second = (async () => {
      await result.current.workspace.syncProjectRoots();
      settled();
    })();
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect.soft(settled).not.toHaveBeenCalled();
      const failure = new Error('first root configuration refused');
      await act(async () => {
        held.reject(failure);
        await firstResult;
      });
      expect(await firstResult).toBe(failure);
      await act(async () => {
        await second;
      });
      await act(async () => {
        await result.current.workspace.syncProjectRoots();
      });
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(3);
      expect(settled).toHaveBeenCalledOnce();
    } finally {
      held.resolve();
      await Promise.allSettled([first, second]);
      unmount();
    }
  });

  it('keeps a recreated workspace root sync independent of a disposed provider pending pass', async () => {
    mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
    const old = renderProvider();
    await waitFor(() => {
      expect(old.result.current.treeService).toBeDefined();
    });
    mockConfigureProjectRoots.mockClear();
    const held = Promise.withResolvers<void>();
    mockConfigureProjectRoots.mockImplementationOnce(async () => held.promise);
    const pending = old.result.current.workspace.syncProjectRoots();
    const pendingResult = (async () => {
      try {
        await pending;
        return 'unexpected-success';
      } catch (error) {
        return error;
      }
    })();
    await waitFor(() => {
      expect(mockConfigureProjectRoots).toHaveBeenCalledOnce();
    });
    const oldWorkspace = old.result.current.workspace;
    const queued = [oldWorkspace.syncProjectRoots(), oldWorkspace.syncProjectRoots()];
    const queuedResults = Promise.allSettled(queued);
    old.unmount();
    const current = renderProvider();
    try {
      await waitFor(() => {
        expect(current.result.current.treeService).toBeDefined();
      });
      const polling = vi.spyOn(current.result.current.treeService!, 'stopPolling');
      await act(async () => {
        await current.result.current.workspace.syncProjectRoots();
      });
      const configured = mockConfigureProjectRoots.mock.calls.length;
      const sourceReads = mockGetProjectRootConfigs.mock.calls.length;
      const pollingCalls = polling.mock.calls.length;
      await act(async () => {
        held.resolve();
        await pendingResult;
      });
      expect(await queuedResults).toEqual([
        expect.objectContaining({ status: 'rejected' }),
        expect.objectContaining({ status: 'rejected' }),
      ]);
      await expect(oldWorkspace.syncProjectRoots()).rejects.toThrow('disposed');
      expect(mockGetProjectRootConfigs).toHaveBeenCalledTimes(sourceReads);
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(configured);
      expect(polling).toHaveBeenCalledTimes(pollingCalls);
      await act(async () => {
        await current.result.current.workspace.syncProjectRoots();
      });
      expect(mockConfigureProjectRoots).toHaveBeenCalledTimes(configured + 1);
    } finally {
      held.resolve();
      await Promise.all([pendingResult, queuedResults]);
      current.unmount();
    }
  });

  it('freshly reconciles an invocation after a completed durable config mutation while its predecessor is held', async () => {
    const priorIndexedDb = globalThis.indexedDB;
    const priorStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
    globalThis.indexedDB = new IDBFactory();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
    const store = await vi.importActual<typeof HandleStore>('#filesystem/handle-store.js');
    const projectId = 'proj_000000000000000000009';
    await store.setProjectFileSystemConfig({ projectId, backend: 'indexeddb', providerBasePath: 'before' });
    mockGetProjectRootConfigs.mockImplementation(store.getProjectRootConfigs);
    const { result, unmount } = renderProvider();
    const held = Promise.withResolvers<void>();
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    try {
      await waitFor(() => {
        expect(result.current.treeService).toBeDefined();
      });
      mockConfigureProjectRoots.mockClear();
      mockConfigureProjectRoots.mockImplementationOnce(async () => held.promise);
      first = result.current.workspace.syncProjectRoots();
      await waitFor(() => {
        expect(mockConfigureProjectRoots).toHaveBeenCalledOnce();
      });
      expect(mockConfigureProjectRoots.mock.calls[0]?.[0].projects).toEqual(
        expect.arrayContaining([expect.objectContaining({ projectId, providerBasePath: 'before' })]),
      );
      await store.setProjectFileSystemConfig({ projectId, backend: 'indexeddb', providerBasePath: 'after' });
      await expect(store.getProjectFileSystemConfig(projectId)).resolves.toMatchObject({ providerBasePath: 'after' });
      second = result.current.workspace.syncProjectRoots();
      held.resolve();
      await act(async () => {
        await Promise.all([first, second]);
      });
      expect(mockConfigureProjectRoots.mock.calls.at(-1)?.[0].projects).toEqual(
        expect.arrayContaining([expect.objectContaining({ projectId, providerBasePath: 'after' })]),
      );
    } finally {
      held.resolve();
      await Promise.allSettled([first, second]);
      unmount();
      mockGetProjectRootConfigs.mockResolvedValue({ projects: [], roots: [] });
      globalThis.indexedDB = priorIndexedDb;
      if (priorStorage === undefined) {
        Reflect.deleteProperty(navigator, 'storage');
      } else {
        Object.defineProperty(navigator, 'storage', priorStorage);
      }
    }
  });

  it('starts external polling when a webaccess root is connected after provider boot', async () => {
    const { result } = renderProvider();
    await vi.waitFor(() => {
      expect(result.current.treeService).toBeDefined();
    });
    const startPolling = vi.spyOn(result.current.treeService!, 'startPolling');
    mockGetProjectRootConfigs.mockResolvedValue({
      projects: [],
      roots: [
        {
          backend: 'webaccess',
          workspaceId: 'wsp_late',
          directoryHandle: mock<FileSystemDirectoryHandle>(),
        },
      ],
    });

    await act(async () => {
      await result.current.workspace.syncProjectRoots();
    });

    expect(startPolling).toHaveBeenCalledOnce();
  });

  /* Charter D12: the project content facade writes on the project's own rooted
   * connection, so the call arrives in the view's namespace, not the
   * authority's. */
  it('routes createDirectory through the project content facade in the view namespace', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.createDirectory('newfolder', { recursive: true });
    });

    expect(mockProxyMkdir).toHaveBeenCalledExactlyOnceWith('newfolder', { recursive: true });
    expect(mockProxyWriteFile).not.toHaveBeenCalled();
  });

  it('routes deleteDirectory through the project content facade in the view namespace', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.deleteDirectory('subtree', { recursive: true });
    });

    /* `{ recursive: true }` has to survive the view too, or a folder delete from
     * the Files pane answers ENOTEMPTY. */
    expect(mockProxyRmdir).toHaveBeenCalledExactlyOnceWith('subtree', { recursive: true });
  });

  /*
   * A1 review R1: the Files pane's own facade must get the view's answer. The
   * authority has never heard of an overlay path, so asking it yields
   * `NOT_FOUND` where the row is really read-only, and a move onto a bundle
   * silently shadows the whole unit (V8).
   */
  it('refuses a Files-pane delete of a system skill file as read-only, without asking the authority', async () => {
    const { result } = renderProvider();

    await expect(result.current.canDelete('.agents/skills/demo/SKILL.md')).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
    expect(mockProxyCanDelete).not.toHaveBeenCalled();
  });

  it('refuses a Files-pane move of a project file onto a system skill path', async () => {
    const { result } = renderProvider();

    await expect(result.current.moveFile('main.ts', '.agents/skills/demo/SKILL.md')).rejects.toMatchObject({
      code: 'EROFS',
    });
    expect(mockProxyMove).not.toHaveBeenCalled();
  });

  /* Quick Look and the RPC handlers run project code the agent wrote through this
   * runtime, so it opens the agent's view and not the working copy (CI1, W14). */
  it('should open the runtime filesystem as the agent consumer', async () => {
    const { result } = renderProvider();

    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });

    const open = runtimeBridgeOpens.at(-1);
    if (!open) {
      throw new TypeError('Expected the runtime filesystem to hold a bridge opener.');
    }
    mockOpenFileSystemBridge.mockClear();
    open();

    expect(mockOpenFileSystemBridge).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ consumer: 'agent' }),
    );
  });

  it('rotates the opaque runtime filesystem when replacement services become authoritative', async () => {
    const { result } = renderProvider();

    await vi.waitFor(() => {
      expect(result.current.contentService).toBeDefined();
    });

    const firstContentService = result.current.contentService;
    const firstRuntimeFileSystem = result.current.runtimeFileSystem;

    act(() => {
      result.current.fileManagerRef.send({ type: 'reloadWorkspace' });
    });

    await vi.waitFor(() => {
      expect(result.current.contentService).not.toBe(firstContentService);
    });

    expect(result.current.runtimeFileSystem).not.toBe(firstRuntimeFileSystem);
  });

  it('does not expose the deleted scoped suffix or top-level admin callbacks on the context value', () => {
    const { result } = renderProvider();
    const value = result.current as unknown as Record<string, unknown>;

    expect(value).not.toHaveProperty('readFileScoped');
    expect(value).not.toHaveProperty('deleteFileScoped');
    expect(value).not.toHaveProperty('deleteDirectoryScoped');
    expect(value).not.toHaveProperty('getZippedDirectoryScoped');
    expect(value).not.toHaveProperty('mkdir');
    expect(value).not.toHaveProperty('rmdir');
    expect(value).not.toHaveProperty('mount');
    expect(value).not.toHaveProperty('unmount');
    expect(value).not.toHaveProperty('invalidateStandaloneProvider');
  });
});
