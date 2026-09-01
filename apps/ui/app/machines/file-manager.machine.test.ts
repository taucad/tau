import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor } from 'xstate';
import { SharedPool } from '@taucad/memory';
import type * as TransportInternals from '@taucad/runtime/transport-internals';
import { fileManagerMachine } from '#machines/file-manager.machine.js';

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

const mockMount = vi.fn<(prefix: string, backend: string, options?: unknown) => Promise<void>>();
const mockUnmount = vi.fn<(prefix: string) => void>();
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
    getDirectoryStat: vi.fn(async () => []),
    readShallowDirectory: vi.fn(async () => []),
    readDirectory: vi.fn(async () => []),
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

const mockGetWorkspace =
  vi.fn<
    (
      workspaceId: string,
    ) => Promise<{ workspace: { workspaceId: string; name: string }; handle: FileSystemDirectoryHandle } | undefined>
  >();
const mockCheckHandlePermission = vi.fn<() => Promise<string>>();
const mockSetProjectFileSystemConfig =
  vi.fn<(config: { projectId: string; backend: 'webaccess'; workspaceId: string }) => Promise<void>>();

vi.mock('#filesystem/handle-store.js', () => ({
  getDefaultWorkspace: vi.fn(async () => undefined),
  getWorkspace: async (...args: unknown[]) => mockGetWorkspace(...(args as [string])),
  getProjectFileSystemConfig: async () => mockGetProjectFileSystemConfig(),
  checkHandlePermission: async () => mockCheckHandlePermission(),
  createWorkspace: vi.fn(),
  setProjectFileSystemConfig: async (config: { projectId: string; backend: 'webaccess'; workspaceId: string }) =>
    mockSetProjectFileSystemConfig(config),
  requestHandlePermission: vi.fn(async () => true),
}));

describe('fileManagerMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerTestState.instances.length = 0;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockWaitForWorkerReady.mockResolvedValue(undefined);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCheckHandlePermission.mockResolvedValue('granted');
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
  });

  it('should start in initializing state when shouldInitializeOnStart is false', () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: false,
      },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe('initializing');
    actor.stop();
  });

  it('should transition to connectingWorker when shouldInitializeOnStart is true', () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: true,
      },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe('connectingWorker');
    actor.stop();
  });

  it('should initialize context without fileCache or fileTree', () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: false,
      },
    });
    actor.start();

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.rootDirectory).toBe('/test');
    expect(snapshot.context.backendType).toBe('indexeddb');
    expect(snapshot.context.contentService).toBeUndefined();
    expect(snapshot.context.treeService).toBeUndefined();

    actor.stop();
  });

  it('should accept setRoot event and reset context', () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: false,
      },
    });
    actor.start();

    actor.send({ type: 'initialize' });
    actor.send({ type: 'setRoot', path: '/new-root' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.rootDirectory).toBe('/new-root');

    actor.stop();
  });

  it('should use custom initial backend', () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: false,
        initialBackend: 'webaccess',
      },
    });
    actor.start();

    expect(actor.getSnapshot().context.backendType).toBe('webaccess');
    actor.stop();
  });

  it('should respond to initialize event from initializing state', () => {
    const actor = createActor(fileManagerMachine, {
      input: {
        rootDirectory: '/test',
        shouldInitializeOnStart: false,
      },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe('initializing');
    actor.send({ type: 'initialize' });
    expect(actor.getSnapshot().value).toBe('connectingWorker');

    actor.stop();
  });

  it('should handle setBackendType event in ready state', async () => {
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

    actor.send({ type: 'setBackendType', backendType: 'webaccess' });
    expect(actor.getSnapshot().context.backendType).toBe('webaccess');

    actor.stop();
  });

  it('should create contentService and treeService on init', async () => {
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

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.contentService).toBeDefined();
    expect(snapshot.context.treeService).toBeDefined();

    actor.stop();
  });

  it('should clean up on stop', async () => {
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

    actor.stop();
    expect(actor.getSnapshot().status).toBe('stopped');
  });

  // ── worker readiness gating ─────────────────────────────────────────────

  describe('worker readiness gating', () => {
    it('should not create bridge before worker signals ready', async () => {
      let resolveReady!: () => void;
      mockWaitForWorkerReady.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
      );

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/test',
          shouldInitializeOnStart: true,
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(mockWaitForWorkerReady).toHaveBeenCalledOnce();
      });

      expect(mockCreateFileSystemBridge).not.toHaveBeenCalled();

      resolveReady();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockCreateFileSystemBridge).toHaveBeenCalledOnce();
      actor.stop();
    });

    it('should create bridge and reach ready after worker signals ready', async () => {
      mockWaitForWorkerReady.mockResolvedValue(undefined);

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

      expect(mockWaitForWorkerReady).toHaveBeenCalledOnce();
      expect(mockCreateFileSystemBridge).toHaveBeenCalledOnce();
      actor.stop();
    });
  });

  // ── shared worker (project-scoped FM) ────────────────────────────────────

  describe('shared worker initialization', () => {
    it('should skip waitForWorkerReady and reach ready when sharedWorker is provided', async () => {
      mockWaitForWorkerReady.mockReturnValue(
        new Promise<void>(() => {
          /* Never resolves: simulates pending worker readiness */
        }),
      );

      const sharedWorker = {
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        postMessage: vi.fn(),
      } as unknown as Worker;

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/shared-proj',
          shouldInitializeOnStart: true,
          projectId: 'shared-proj',
          sharedWorker,
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockWaitForWorkerReady).not.toHaveBeenCalled();
      expect(mockCreateFileSystemBridge).toHaveBeenCalledOnce();
      actor.stop();
    });

    it('should still call waitForWorkerReady when no sharedWorker (fresh worker)', async () => {
      mockWaitForWorkerReady.mockResolvedValue(undefined);

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/fresh-proj',
          shouldInitializeOnStart: true,
          projectId: 'fresh-proj',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockWaitForWorkerReady).toHaveBeenCalledOnce();
      actor.stop();
    });
  });

  // ── projectId-based backend resolution ────────────────────────────────────

  describe('projectId backend resolution', () => {
    it('should call mount with opfs when project config stores opfs', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue({ projectId: 'test-id', backend: 'opfs' });

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/test-id',
          shouldInitializeOnStart: true,
          projectId: 'test-id',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockGetProjectFileSystemConfig).toHaveBeenCalled();
      expect(mockMount).toHaveBeenCalledWith('/projects/test-id', { backend: 'opfs', preservePath: true });
      actor.stop();
    });

    it('should call mount with indexeddb when project config returns undefined', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue(undefined);

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/test-id',
          shouldInitializeOnStart: true,
          projectId: 'test-id',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockGetProjectFileSystemConfig).toHaveBeenCalled();
      expect(mockMount).toHaveBeenCalledWith('/projects/test-id', { backend: 'indexeddb', preservePath: true });
      actor.stop();
    });

    it('should not query project config when projectId is absent', async () => {
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

      expect(mockGetProjectFileSystemConfig).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should call mount with memory when project config stores memory', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue({ projectId: 'mem-id', backend: 'memory' });

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/mem-id',
          shouldInitializeOnStart: true,
          projectId: 'mem-id',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockMount).toHaveBeenCalledWith('/projects/mem-id', { backend: 'memory', preservePath: true });
      actor.stop();
    });

    it('should not mount when no projectId (root FM uses stable root mount)', async () => {
      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/test',
          shouldInitializeOnStart: true,
          initialBackend: 'opfs',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockMount).not.toHaveBeenCalled();
      actor.stop();
    });
  });

  // ── webaccess workspace resolution + recovery (Audit R2, R15, F15) ─────

  describe('webaccess workspace resolution', () => {
    const makeHandle = (name: string) => ({ kind: 'directory', name }) as unknown as FileSystemDirectoryHandle;

    it('resolves bound workspaceId from project config and mounts webaccess', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-1',
        backend: 'webaccess',
        workspaceId: 'wsp_bound',
      });
      mockGetWorkspace.mockResolvedValue({
        workspace: { workspaceId: 'wsp_bound', name: 'Bound Workspace' },
        handle: makeHandle('Bound'),
      });
      mockCheckHandlePermission.mockResolvedValue('granted');

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-1',
          shouldInitializeOnStart: true,
          projectId: 'proj-1',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockGetWorkspace).toHaveBeenCalledWith('wsp_bound');
      // Audit R2: webaccess mount carries the resolved handle + workspaceId
      // atomically through a single discriminated MountConfig — no
      // ambient `setDirectoryHandle` round-trip.
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest's `expect.objectContaining` returns `any`; the matcher is typed correctly at runtime.
      const handleMatcher = expect.objectContaining({ name: 'Bound' }) as FileSystemDirectoryHandle;
      expect(mockMount).toHaveBeenCalledWith('/projects/proj-1', {
        backend: 'webaccess',
        directoryHandle: handleMatcher,
        workspaceId: 'wsp_bound',
        preservePath: true,
      });
      const snapshot = actor.getSnapshot();
      expect(snapshot.context.activeWorkspaceId).toBe('wsp_bound');
      expect(snapshot.context.activeWorkspaceName).toBe('Bound Workspace');
      expect(snapshot.context.unavailableReason).toBeUndefined();
      actor.stop();
    });

    it('ignores the default workspace when project is bound to a different one', async () => {
      // Audit F15 regression: even if a different workspace was chosen as
      // the default in Settings, a project bound to wsp_A must still
      // resolve wsp_A (workspace identity is per-project, immutable).
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-pinned',
        backend: 'webaccess',
        workspaceId: 'wsp_pinned',
      });
      mockGetWorkspace.mockImplementation(async (id: string) => {
        if (id === 'wsp_pinned') {
          return {
            workspace: { workspaceId: 'wsp_pinned', name: 'Pinned' },
            handle: makeHandle('Pinned'),
          };
        }
        return undefined;
      });
      mockCheckHandlePermission.mockResolvedValue('granted');

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-pinned',
          shouldInitializeOnStart: true,
          projectId: 'proj-pinned',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(mockGetWorkspace).toHaveBeenCalledWith('wsp_pinned');
      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      actor.stop();
    });

    it('transitions to webAccessUnavailable with reason="missing" when legacy config lacks workspaceId', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-legacy',
        backend: 'webaccess',
      } as { projectId: string; backend: 'webaccess'; workspaceId: string });

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-legacy',
          shouldInitializeOnStart: true,
          projectId: 'proj-legacy',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('webAccessUnavailable');
      });

      expect(actor.getSnapshot().context.unavailableReason).toBe('missing');
      expect(mockMount).not.toHaveBeenCalled();
      actor.stop();
    });

    it('transitions to webAccessUnavailable with reason="missing" when bound workspace is gone', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-gone',
        backend: 'webaccess',
        workspaceId: 'wsp_gone',
      });
      mockGetWorkspace.mockResolvedValue(undefined);

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-gone',
          shouldInitializeOnStart: true,
          projectId: 'proj-gone',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('webAccessUnavailable');
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.unavailableReason).toBe('missing');
      expect(snapshot.context.activeWorkspaceId).toBe('wsp_gone');
      expect(mockMount).not.toHaveBeenCalled();
      actor.stop();
    });

    it('transitions to webAccessUnavailable with reason="permission" when handle access is revoked', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-revoked',
        backend: 'webaccess',
        workspaceId: 'wsp_revoked',
      });
      mockGetWorkspace.mockResolvedValue({
        workspace: { workspaceId: 'wsp_revoked', name: 'Revoked Workspace' },
        handle: makeHandle('Revoked'),
      });
      mockCheckHandlePermission.mockResolvedValue('prompt');

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-revoked',
          shouldInitializeOnStart: true,
          projectId: 'proj-revoked',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('webAccessUnavailable');
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.unavailableReason).toBe('permission');
      expect(snapshot.context.activeWorkspaceId).toBe('wsp_revoked');
      expect(snapshot.context.activeWorkspaceName).toBe('Revoked Workspace');
      expect(mockMount).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should re-resolve the workspace from persistent config when reloadWorkspace is dispatched', async () => {
      // Boot in `webAccessUnavailable` because the bound workspace is gone,
      // then simulate the binding transaction: persistent record gains a
      // valid workspace, `reloadWorkspace` re-runs the actor, machine
      // reaches `ready`.
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-recover',
        backend: 'webaccess',
        workspaceId: 'wsp_initial',
      });
      mockGetWorkspace.mockResolvedValue(undefined);
      mockCheckHandlePermission.mockResolvedValue('granted');

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-recover',
          shouldInitializeOnStart: true,
          projectId: 'proj-recover',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('webAccessUnavailable');
      });
      expect(actor.getSnapshot().context.unavailableReason).toBe('missing');

      // Simulate the binding-transaction effect: caller updated the
      // persistent record before dispatching `reloadWorkspace`.
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-recover',
        backend: 'webaccess',
        workspaceId: 'wsp_recovered',
      });
      mockGetWorkspace.mockResolvedValue({
        workspace: { workspaceId: 'wsp_recovered', name: 'Recovered Workspace' },
        handle: makeHandle('Recovered'),
      });

      actor.send({ type: 'reloadWorkspace' });

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.activeWorkspaceId).toBe('wsp_recovered');
      expect(snapshot.context.activeWorkspaceName).toBe('Recovered Workspace');
      expect(snapshot.context.unavailableReason).toBeUndefined();
      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest's `expect.objectContaining` returns `any`; the matcher is typed correctly at runtime.
      const recoveredHandleMatcher = expect.objectContaining({ name: 'Recovered' }) as FileSystemDirectoryHandle;
      expect(mockMount).toHaveBeenCalledWith('/projects/proj-recover', {
        backend: 'webaccess',
        directoryHandle: recoveredHandleMatcher,
        workspaceId: 'wsp_recovered',
        preservePath: true,
      });
      actor.stop();
    });

    it('should never mutate ProjectFileSystemConfig across indexeddb -> webaccess -> indexeddb navigation', async () => {
      // Repro for the user-reported smoking-gun bug
      // (`docs/research/fm-workspace-binding-scope.md` Findings 1-3): an
      // indexeddb project must remain indexeddb after navigating away to a
      // webaccess project and returning.
      mockGetProjectFileSystemConfig.mockImplementation(async () => ({
        projectId: 'proj-A',
        backend: 'indexeddb',
      }));
      mockGetWorkspace.mockImplementation(async (id: string) => {
        if (id === 'wsp_B') {
          return {
            workspace: { workspaceId: 'wsp_B', name: 'B Workspace' },
            handle: makeHandle('B'),
          };
        }
        return undefined;
      });
      mockCheckHandlePermission.mockResolvedValue('granted');

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-A',
          shouldInitializeOnStart: true,
          projectId: 'proj-A',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });
      expect(actor.getSnapshot().context.backendType).toBe('indexeddb');

      // Navigate to project B (webaccess).
      mockGetProjectFileSystemConfig.mockImplementation(async () => ({
        projectId: 'proj-B',
        backend: 'webaccess',
        workspaceId: 'wsp_B',
      }));
      actor.send({ type: 'setRoot', path: '/projects/proj-B', projectId: 'proj-B' });

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });
      expect(actor.getSnapshot().context.backendType).toBe('webaccess');
      expect(actor.getSnapshot().context.activeWorkspaceId).toBe('wsp_B');

      // Navigate back to project A (indexeddb).
      mockGetProjectFileSystemConfig.mockImplementation(async () => ({
        projectId: 'proj-A',
        backend: 'indexeddb',
      }));
      actor.send({ type: 'setRoot', path: '/projects/proj-A', projectId: 'proj-A' });

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.backendType).toBe('indexeddb');
      expect(snapshot.context.activeWorkspaceId).toBeUndefined();
      expect(snapshot.context.activeWorkspaceName).toBeUndefined();
      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should clear activeWorkspace fields immediately when setRoot changes projectId', async () => {
      // Defence-in-depth check for Finding 3: even before the new actor
      // run settles for project A, the synchronous `updateRootAndReset`
      // action must wipe workspace identity so the actor can never read
      // a stale value (closes the entire bug class by construction).
      mockGetProjectFileSystemConfig.mockResolvedValue({
        projectId: 'proj-B',
        backend: 'webaccess',
        workspaceId: 'wsp_B',
      });
      mockGetWorkspace.mockResolvedValue({
        workspace: { workspaceId: 'wsp_B', name: 'B Workspace' },
        handle: makeHandle('B'),
      });
      mockCheckHandlePermission.mockResolvedValue('granted');

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-B',
          shouldInitializeOnStart: true,
          projectId: 'proj-B',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });
      expect(actor.getSnapshot().context.activeWorkspaceId).toBe('wsp_B');
      expect(actor.getSnapshot().context.activeWorkspaceName).toBe('B Workspace');

      actor.send({ type: 'setRoot', path: '/projects/proj-A', projectId: 'proj-A' });

      // Inspect context BEFORE the new actor run settles. The reset
      // must be visible synchronously after `setRoot` is processed.
      const transitional = actor.getSnapshot();
      expect(transitional.context.projectId).toBe('proj-A');
      expect(transitional.context.activeWorkspaceId).toBeUndefined();
      expect(transitional.context.activeWorkspaceName).toBeUndefined();
      expect(transitional.context.unavailableReason).toBeUndefined();

      actor.stop();
    });
  });

  // ── two-phase init ──────────────────────────────────────────────────

  describe('two-phase init', () => {
    it('should transition to connectingWorker when initialize is sent', () => {
      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/test',
          shouldInitializeOnStart: false,
        },
      });
      actor.start();

      expect(actor.getSnapshot().value).toBe('initializing');
      actor.send({ type: 'initialize' });
      expect(actor.getSnapshot().value).toBe('connectingWorker');

      actor.stop();
    });

    it('should set context.worker after connectingWorker completes but before services are ready', async () => {
      let resolveServices!: () => void;
      const servicesGate = new Promise<void>((resolve) => {
        resolveServices = resolve;
      });

      mockGetProjectFileSystemConfig.mockImplementation(async () => {
        await servicesGate;
        return undefined;
      });

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/test-id',
          shouldInitializeOnStart: true,
          projectId: 'test-id',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('initializingServices');
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.worker).toBeDefined();
      expect(snapshot.context.proxy).toBeDefined();
      expect(snapshot.context.contentService).toBeUndefined();
      expect(snapshot.context.treeService).toBeUndefined();

      resolveServices();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      actor.stop();
    });

    it('should transition through connectingWorker then initializingServices then ready', async () => {
      const states: string[] = [];
      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/test',
          shouldInitializeOnStart: true,
        },
      });
      actor.subscribe((snapshot) => {
        const value = snapshot.value as string;
        if (states.at(-1) !== value) {
          states.push(value);
        }
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      expect(states).toEqual(['initializing', 'connectingWorker', 'initializingServices', 'ready']);
      actor.stop();
    });

    it('should set services only after initializingServices completes', async () => {
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

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.contentService).toBeDefined();
      expect(snapshot.context.treeService).toBeDefined();
      expect(snapshot.context.worker).toBeDefined();
      expect(snapshot.context.proxy).toBeDefined();

      actor.stop();
    });

    it('should handle setRoot in initializingServices state', async () => {
      let resolveServices!: () => void;
      const servicesGate = new Promise<void>((resolve) => {
        resolveServices = resolve;
      });

      mockGetProjectFileSystemConfig.mockImplementation(async () => {
        await servicesGate;
        return undefined;
      });

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-a',
          shouldInitializeOnStart: true,
          projectId: 'proj-a',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('initializingServices');
      });

      resolveServices();
      mockGetProjectFileSystemConfig.mockResolvedValue(undefined);

      actor.send({ type: 'setRoot', path: '/projects/proj-b', projectId: 'proj-b' });
      expect(actor.getSnapshot().context.rootDirectory).toBe('/projects/proj-b');

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      actor.stop();
    });
  });

  // ── project mount lifecycle cleanup ────────────────────────────────────

  describe('project mount lifecycle', () => {
    it('should unmount project prefix on root change when projectId is set', async () => {
      mockGetProjectFileSystemConfig.mockResolvedValue(undefined);

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/proj-1',
          shouldInitializeOnStart: true,
          projectId: 'proj-1',
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      actor.send({ type: 'setRoot', path: '/projects/proj-2', projectId: 'proj-2' });

      expect(mockUnmount).toHaveBeenCalledWith('/projects/proj-1');
      actor.stop();
    });

    it('should not call unmount on root change when no projectId', async () => {
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

      actor.send({ type: 'setRoot', path: '/other' });

      expect(mockUnmount).not.toHaveBeenCalled();
      actor.stop();
    });
  });

  describe('shared file pool', () => {
    it('should post filePool message to worker after ready', async () => {
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

      const { worker: fmWorker } = actor.getSnapshot().context;
      expect(fmWorker).toBeDefined();
      const postMessage = vi.mocked(fmWorker!.postMessage);
      const filePoolCall = postMessage.mock.calls.find(
        ([message]) => (message as { type?: string }).type === 'filePool',
      );
      expect(filePoolCall).toBeDefined();
      expect((filePoolCall![0] as { buffer: SharedArrayBuffer }).buffer).toBeInstanceOf(SharedArrayBuffer);

      actor.stop();
    });

    it('should store filePoolBuffer on context after worker connect', async () => {
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

      expect(actor.getSnapshot().context.filePoolBuffer).toBeInstanceOf(SharedArrayBuffer);

      actor.stop();
    });

    it('should reach ready state when SharedArrayBuffer is unavailable', async () => {
      const original = globalThis.SharedArrayBuffer;
      (globalThis as Record<string, unknown>)['SharedArrayBuffer'] = undefined;

      try {
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

        expect(actor.getSnapshot().context.filePoolBuffer).toBeUndefined();

        actor.stop();
      } finally {
        (globalThis as Record<string, unknown>)['SharedArrayBuffer'] = original;
      }
    });

    it('should not post filePool message to worker when SharedArrayBuffer is unavailable', async () => {
      const original = globalThis.SharedArrayBuffer;
      (globalThis as Record<string, unknown>)['SharedArrayBuffer'] = undefined;

      try {
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

        const { worker: fmWorker } = actor.getSnapshot().context;
        expect(fmWorker).toBeDefined();
        const postMessage = vi.mocked(fmWorker!.postMessage);
        const filePoolCall = postMessage.mock.calls.find(
          ([message]) => (message as { type?: string }).type === 'filePool',
        );
        expect(filePoolCall).toBeUndefined();

        actor.stop();
      } finally {
        (globalThis as Record<string, unknown>)['SharedArrayBuffer'] = original;
      }
    });

    // ── nested FM reuses parent SAB instead of allocating a new one ──────
    it('should reuse parent sharedFilePoolBuffer instead of allocating a new SAB', async () => {
      const sharedWorker = {
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        postMessage: vi.fn(),
      } as unknown as Worker;

      // Match the production filePoolBytes size (50 MiB) so SharedPool init succeeds.
      const parentBuffer = new SharedArrayBuffer(50 * 1024 * 1024);

      const actor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/nested',
          shouldInitializeOnStart: true,
          projectId: 'nested',
          sharedWorker,
          sharedFilePoolBuffer: parentBuffer,
        },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('ready');
      });

      // The nested machine inherits the parent's SAB by reference.
      expect(actor.getSnapshot().context.filePoolBuffer).toBe(parentBuffer);

      // It must not re-post `filePool` to the shared worker — the parent FM
      // already did that for this worker instance.
      const sharedPostMessage = vi.mocked(sharedWorker.postMessage);
      const filePoolCall = sharedPostMessage.mock.calls.find(
        ([message]) => (message as { type?: string }).type === 'filePool',
      );
      expect(filePoolCall).toBeUndefined();

      actor.stop();
    });

    it('should allocate exactly one SAB per machine when no sharedFilePoolBuffer provided', async () => {
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

      const { worker: fmWorker, filePoolBuffer } = actor.getSnapshot().context;
      expect(filePoolBuffer).toBeInstanceOf(SharedArrayBuffer);

      const postMessage = vi.mocked(fmWorker!.postMessage);
      const filePoolCalls = postMessage.mock.calls.filter(
        ([message]) => (message as { type?: string }).type === 'filePool',
      );
      expect(filePoolCalls).toHaveLength(1);
      expect((filePoolCalls[0]![0] as { buffer: SharedArrayBuffer }).buffer).toBe(filePoolBuffer);

      actor.stop();
    });

    // ── SAB-sharing end-to-end topology ────────────────────────────────────
    // Locks down the producer/consumer invariant the SAB-sharing change
    // depends on:
    //   root FM allocates SAB
    //     → posts to FM worker (writer)
    //     → seeds nested FM context (reader-side FileContentService)
    //     → flows into every cad.machine kernel runtime worker (reader)
    //
    // Each cad.machine spins up its own kernel runtime worker, which in turn
    // constructs `new SharedPool(filePoolBuffer)` (kernel-worker.ts:495). This
    // test simulates that fan-out by manually constructing reader pools over
    // the SAB extracted from the root machine's `postMessage`. A bug that
    // re-allocates the SAB anywhere along the chain would break either the
    // identity assertion or the cross-instance read assertion.
    it('should propagate one SAB end-to-end so writer stores are visible to nested FM and every kernel runtime reader', async () => {
      const rootActor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/test',
          shouldInitializeOnStart: true,
        },
      });
      rootActor.start();

      await vi.waitFor(() => {
        expect(rootActor.getSnapshot().value).toBe('ready');
      });

      const { worker: rootWorker, filePoolBuffer: rootBuffer } = rootActor.getSnapshot().context;
      expect(rootBuffer).toBeInstanceOf(SharedArrayBuffer);

      const filePoolMessage = vi
        .mocked(rootWorker!.postMessage)
        .mock.calls.find(([message]) => (message as { type?: string }).type === 'filePool');
      expect(filePoolMessage).toBeDefined();
      const postedBuffer = (filePoolMessage![0] as { buffer: SharedArrayBuffer }).buffer;
      expect(postedBuffer).toBe(rootBuffer);

      const writerPool = new SharedPool(postedBuffer);

      const nestedActor = createActor(fileManagerMachine, {
        input: {
          rootDirectory: '/projects/nested',
          shouldInitializeOnStart: true,
          projectId: 'nested',
          sharedWorker: rootWorker,
          sharedFilePoolBuffer: rootBuffer,
        },
      });
      nestedActor.start();

      await vi.waitFor(() => {
        expect(nestedActor.getSnapshot().value).toBe('ready');
      });

      expect(nestedActor.getSnapshot().context.filePoolBuffer).toBe(rootBuffer);

      const cadKernelReaderA = new SharedPool(nestedActor.getSnapshot().context.filePoolBuffer!);
      const cadKernelReaderB = new SharedPool(nestedActor.getSnapshot().context.filePoolBuffer!);

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      writerPool.store('/projects/nested/main.scad', encoder.encode('cube([1,2,3]);'));
      writerPool.store('/projects/nested/util.scad', encoder.encode('module noop() {}'));

      expect(decoder.decode(cadKernelReaderA.resolveCopy('/projects/nested/main.scad'))).toBe('cube([1,2,3]);');
      expect(decoder.decode(cadKernelReaderB.resolveCopy('/projects/nested/main.scad'))).toBe('cube([1,2,3]);');
      expect(decoder.decode(cadKernelReaderA.resolveCopy('/projects/nested/util.scad'))).toBe('module noop() {}');
      expect(decoder.decode(cadKernelReaderB.resolveCopy('/projects/nested/util.scad'))).toBe('module noop() {}');

      writerPool.invalidate('/projects/nested/main.scad');

      expect(cadKernelReaderA.resolve('/projects/nested/main.scad')).toBeUndefined();
      expect(cadKernelReaderB.resolve('/projects/nested/main.scad')).toBeUndefined();
      expect(decoder.decode(cadKernelReaderA.resolveCopy('/projects/nested/util.scad'))).toBe('module noop() {}');

      nestedActor.stop();
      rootActor.stop();
    });
  });

  // ── worker error diagnostics ────────────────────────────────────────────
  // (named fields on structured worker errors, not `undefined` concatenation)
  describe('worker error diagnostics', () => {
    const startActorAndGrabWorker = async (): Promise<{
      actor: ReturnType<typeof createActor<typeof fileManagerMachine>>;
      worker: (typeof workerTestState.instances)[number];
    }> => {
      // Block worker readiness so we can dispatch the error before resolution.
      mockWaitForWorkerReady.mockReturnValue(
        new Promise<void>(() => {
          /* Never resolves — tests dispatch worker error events synchronously to win the race. */
        }),
      );

      const actor = createActor(fileManagerMachine, {
        input: { rootDirectory: '/test', shouldInitializeOnStart: true },
      });
      actor.start();

      await vi.waitFor(() => {
        expect(workerTestState.instances).toHaveLength(1);
      });
      return { actor, worker: workerTestState.instances[0]! };
    };

    it('routes a plain `error` Event (load failure) into the FM error state with actionable guidance', async () => {
      const { actor, worker } = await startActorAndGrabWorker();

      worker.dispatchEvent(new Event('error'));

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('error');
      });

      const { error } = actor.getSnapshot().context;
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toMatch(/Worker script failed to load/);
      expect(error?.message).toMatch(/Network tab/);
      expect(worker.terminate).toHaveBeenCalledTimes(1);

      actor.stop();
    });

    it('routes an `ErrorEvent` with `error.stack` into the FM error state preserving the stack', async () => {
      const { actor, worker } = await startActorAndGrabWorker();

      const cause = new Error('boom inside worker');
      cause.stack = 'Error: boom inside worker\n    at file-manager.worker.ts:42:7';
      worker.dispatchEvent(
        new ErrorEvent('error', {
          message: 'Uncaught Error: boom inside worker',
          filename: 'http://localhost:3000/assets/file-manager.worker-XXX.js',
          lineno: 42,
          colno: 7,
          error: cause,
        }),
      );

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('error');
      });

      const { error } = actor.getSnapshot().context;
      expect(error?.message).toContain('Uncaught Error: boom inside worker');
      expect(error?.message).toContain('file-manager.worker-XXX.js:42:7');
      expect(error?.stack).toBe(cause.stack);

      actor.stop();
    });

    it('routes a `messageerror` Event into the FM error state with a structured-clone explanation', async () => {
      const { actor, worker } = await startActorAndGrabWorker();

      worker.dispatchEvent(new Event('messageerror'));

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('error');
      });

      expect(actor.getSnapshot().context.error?.message).toMatch(/messageerror/);
      expect(actor.getSnapshot().context.error?.message).toMatch(/structured-clone/);

      actor.stop();
    });

    it('routes a `__worker_init_error__` envelope into the FM error state with the originating phase', async () => {
      const { actor, worker } = await startActorAndGrabWorker();

      const envelope = {
        type: '__worker_init_error__',
        phase: "mount('/', 'indexeddb')",
        message: 'IndexedDB unavailable',
        stack: 'Error: IndexedDB unavailable\n    at file-manager.worker.ts:56',
      };
      worker.dispatchEvent(new MessageEvent('message', { data: envelope }));

      await vi.waitFor(() => {
        expect(actor.getSnapshot().value).toBe('error');
      });

      const { error } = actor.getSnapshot().context;
      expect(error?.message).toContain("Worker mount('/', 'indexeddb') failed: IndexedDB unavailable");

      actor.stop();
    });

    it('ignores unrelated worker `message` events', async () => {
      const { actor, worker } = await startActorAndGrabWorker();

      worker.dispatchEvent(new MessageEvent('message', { data: { type: 'something-else' } }));

      // Still waiting on `waitForWorkerReady` (which never resolves) — must
      // not have fallen into the error state from an unrelated message.
      expect(actor.getSnapshot().value).toBe('connectingWorker');

      actor.stop();
    });
  });

  /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Vitest importActual resolves to loosely typed loader output */
  describe('createFileSystemBridge + createBridgeProxy (actual transport-internals)', () => {
    it('initializes bridge proxy synchronously without `Port.onMessage` TypeError', async () => {
      const unsafeModule = await vi.importActual('@taucad/runtime/transport-internals');
      /* oxlint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- tsgo vs ESLint inference skew for Vitest stub typing */
      const actualModule = unsafeModule as typeof TransportInternals;
      const fakeWorker = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        terminate: vi.fn(),
      } as unknown as Worker;

      const bridge = actualModule.createFileSystemBridge(fakeWorker);

      expect(() => {
        actualModule.createBridgeProxy<Record<string, never>>(bridge.port);
      }).not.toThrow();
    });
  });
  /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
});
