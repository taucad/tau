// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { createActor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type * as WorkspaceTelemetryModule from '#utils/workspace-telemetry.utils.js';
import type { WorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';

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
const mockInvalidateStandaloneProvider = vi.fn<(backend: string, workspaceId?: string) => void>();
const mockProxyMkdir = vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(async () => {});
const mockProxyRmdir = vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(async () => {});
const mockProxyWriteFile = vi.fn<(path: string, data: unknown, options?: unknown) => Promise<void>>(async () => {});
const mockWaitForWorkerReady = vi.fn<() => Promise<void>>();
const mockCreateFileSystemBridge = vi.fn(() => ({
  port: {
    postMessage: vi.fn(),
    onMessage: vi.fn((_handler: (data: unknown) => void) => vi.fn()),
    close: vi.fn(),
  },
  dispose: vi.fn(),
}));

vi.mock('@taucad/runtime/transport-internals', () => ({
  createFileSystemBridge: () => mockCreateFileSystemBridge(),
  waitForWorkerReady: async () => mockWaitForWorkerReady(),
  createBridgeProxy: vi.fn(() => ({
    mount: mockMount,
    unmount: mockUnmount,
    invalidateStandaloneProvider: mockInvalidateStandaloneProvider,
    getDirectoryStat: vi.fn(async () => []),
    readShallowDirectory: vi.fn(async () => []),
    readDirectory: vi.fn(async () => []),
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

vi.mock('#filesystem/handle-store.js', () => ({
  getDefaultWorkspace: vi.fn(async () => undefined),
  getWorkspace: vi.fn(async () => undefined),
  getProjectFileSystemConfig: async () => mockGetProjectFileSystemConfig(),
  checkHandlePermission: vi.fn(async () => 'granted'),
  createWorkspace: vi.fn(),
  setProjectFileSystemConfig: async (config: { projectId: string; backend: 'webaccess'; workspaceId: string }) =>
    mockSetProjectFileSystemConfig(config),
  requestHandlePermission: vi.fn(async () => true),
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

const { waitForFileManagerServices, FileManagerProvider, useFileManager } = await import('#hooks/use-file-manager.js');

describe('waitForFileManagerServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockWaitForWorkerReady.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
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

describe('FileManagerProvider — bindProjectToWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockWaitForWorkerReady.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
  });

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

    await act(async () => {
      await result.current.bindProjectToWorkspace('wsp_target');
    });

    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith({
      projectId: 'proj-bind',
      backend: 'webaccess',
      workspaceId: 'wsp_target',
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

  it('exposes a workspace facade that wires mount/unmount/invalidateStandaloneProvider to the proxy', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.workspace.mount('/scratch', { backend: 'memory' });
    });
    expect(mockMount).toHaveBeenCalledExactlyOnceWith('/scratch', { backend: 'memory' });

    await act(async () => {
      result.current.workspace.unmount('/scratch');
    });
    await vi.waitFor(() => {
      expect(mockUnmount).toHaveBeenCalledExactlyOnceWith('/scratch');
    });

    await act(async () => {
      await result.current.workspace.invalidateStandaloneProvider('webaccess', 'wsp_x');
    });
    expect(mockInvalidateStandaloneProvider).toHaveBeenCalledExactlyOnceWith('webaccess', 'wsp_x');
  });

  it('routes mkdir through the worker proxy without writing any .gitkeep placeholder', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.mkdir('newfolder', { recursive: true });
    });

    expect(mockProxyMkdir).toHaveBeenCalledExactlyOnceWith('newfolder', { recursive: true });
    expect(mockProxyWriteFile).not.toHaveBeenCalled();
  });

  it('routes rmdir through the worker proxy with recursive: true and does not call unlink per file', async () => {
    const { result } = renderProvider();

    await act(async () => {
      await result.current.rmdir('subtree', { recursive: true });
    });

    expect(mockProxyRmdir).toHaveBeenCalledExactlyOnceWith('subtree', { recursive: true });
  });

  it('does not expose the deleted scoped suffix or top-level admin callbacks on the context value', () => {
    const { result } = renderProvider();
    const value = result.current as unknown as Record<string, unknown>;

    expect(value).not.toHaveProperty('readFileScoped');
    expect(value).not.toHaveProperty('deleteFileScoped');
    expect(value).not.toHaveProperty('deleteDirectoryScoped');
    expect(value).not.toHaveProperty('getZippedDirectoryScoped');
    expect(value).not.toHaveProperty('mount');
    expect(value).not.toHaveProperty('unmount');
    expect(value).not.toHaveProperty('invalidateStandaloneProvider');
  });
});
