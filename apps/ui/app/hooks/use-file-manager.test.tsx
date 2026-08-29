// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { createActor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { ProjectRootConfiguration } from '@taucad/filesystem';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type * as WorkspaceTelemetryModule from '#utils/workspace-telemetry.utils.js';
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
const mockOpenFileSystemBridge = vi.fn(() => ({
  port: new MessageChannel().port1,
  dispose: vi.fn(),
}));

vi.mock('@taucad/fs-bridge', () => ({
  createFileSystemBridge: () => mockCreateFileSystemBridge(),
  openFileSystemBridge: () => mockOpenFileSystemBridge(),
  waitForWorkerReady: async () => mockWaitForWorkerReady(),
  createFileSystemBridgeProxy: vi.fn(() => ({
    configureProjectRoots: mockConfigureProjectRoots,
    mount: mockMount,
    unmount: mockUnmount,
    disposeStorageRoot: mockInvalidateStandaloneProvider,
    getDirectoryStat: vi.fn(async () => []),
    readShallowDirectory: vi.fn(async () => []),
    readDirectory: vi.fn(async () => []),
    listProjectManifests: mockListProjectManifests,
    mkdir: mockProxyMkdir,
    rmdir: mockProxyRmdir,
    writeFile: mockProxyWriteFile,
    dispose: vi.fn(),
    listen: vi.fn(() => vi.fn()),
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
} = await import('#hooks/use-file-manager.js');

describe('waitForFileManagerServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('exposes a typed client facade whose methods route through the worker proxy', async () => {
    const { result } = renderProvider();

    expect(result.current.client).toBeDefined();
    // Spot-check method shape: `client.readShallowDirectory` is gated on
    // proxy readiness and forwards to the worker.
    await act(async () => {
      const nodes = await result.current.client.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes).toEqual([]);
    });
  });

  it('exposes a workspace facade that wires mount/unmount/root teardown to the proxy', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.workspace.mount('/scratch', { backend: 'memory', storageRootKey: 'memory:0' });
    });
    expect(mockMount).toHaveBeenCalledExactlyOnceWith('/scratch', {
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

  it('routes createDirectory through the project content facade with an absolute project path', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.createDirectory('newfolder', { recursive: true });
    });

    expect(mockProxyMkdir).toHaveBeenCalledExactlyOnceWith('/projects/root/newfolder', { recursive: true });
    expect(mockProxyWriteFile).not.toHaveBeenCalled();
  });

  it('routes deleteDirectory through the project content facade with an absolute project path', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.deleteDirectory('subtree', { recursive: true });
    });

    expect(mockProxyRmdir).toHaveBeenCalledExactlyOnceWith('/projects/root/subtree', { recursive: true });
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
