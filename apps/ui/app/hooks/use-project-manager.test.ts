/* eslint-disable @typescript-eslint/naming-convention -- Test fixtures use React component names and literal workspace file paths. */
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Chat } from '@taucad/chat';
import type { ProjectDiscoveryEntry, ProjectDiscoveryResult, ProjectLocator } from '@taucad/filesystem';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import { defaultPanelState } from '#constants/editor.constants.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { PendingProjectOperation, PendingProjectStorage } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryState } from '#types/project.types.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import type { ConnectedWorkspace, ProjectListing } from '#hooks/use-project-manager.js';

const fakeProject: ProjectManifest = projectToManifest({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Test Project',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const fakeLocator: ProjectLocator = {
  backend: 'opfs',
  storageRootKey: 'opfs:origin',
  relativeDirectory: 'test-project',
};
const unrelatedProject: ProjectManifest = projectToManifest({
  id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
  name: 'Unrelated Project',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const unrelatedLocator: ProjectLocator = {
  backend: 'opfs',
  storageRootKey: 'opfs:origin',
  relativeDirectory: 'unrelated-project',
};
const validProjectDiscovery: ProjectDiscoveryResult = {
  roots: [{ status: 'complete', root: { backend: 'opfs' } }],
  entries: [
    {
      status: 'valid',
      manifest: fakeProject,
      locator: fakeLocator,
    },
  ],
};
const liveWorkspaceRoot = {
  backend: 'webaccess',
  workspaceId: 'wsp_live',
  directoryHandle: { kind: 'directory', name: 'tau-workspace' } as unknown as FileSystemDirectoryHandle,
} as const;
const liveWorkspaceLocator: ProjectLocator = {
  backend: 'webaccess',
  storageRootKey: 'webaccess:wsp_live',
  relativeDirectory: 'test-project',
  workspaceId: 'wsp_live',
};
const liveWorkspaceDiscovery: ProjectDiscoveryResult = {
  roots: [{ status: 'complete', root: liveWorkspaceRoot }],
  entries: [{ status: 'valid', manifest: fakeProject, locator: liveWorkspaceLocator }],
};
const operationId = 'req_aaaaaaaaaaaaaaaaaaaaa';
const phaseOrder: string[] = [];
let manifestBytes = serializeProjectManifest(projectToManifest(fakeProject));

const mockWriteFiles = vi.fn(async () => {
  phaseOrder.push('files');
});
const mockWriteFile = vi.fn(async (_path: string, bytes: Uint8Array<ArrayBuffer>) => {
  phaseOrder.push('manifest');
  manifestBytes = bytes;
});
/** Contents of `<project>/.tau/library.json`; `undefined` means the file is absent. */
let libraryFileContent: string | undefined;
const libraryFilePath = `/projects/${fakeProject.id}/.tau/library.json`;
const mockReadFile = vi.fn(async (path: string) => {
  if (path.endsWith('/.tau/library.json')) {
    if (libraryFileContent === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return libraryFileContent;
  }
  return manifestBytes;
});
const mockStat = vi.fn(async () => ({ type: 'file', size: 12, mtimeMs: 1_700_000_000_000 }) as const);
const mockSyncProjectRoots = vi.fn(async () => {
  phaseOrder.push('roots');
});
const mockPermanentlyDeleteProjectDirectory = vi.fn<FileManagerProxy['permanentlyDeleteProjectDirectory']>(
  async (): Promise<{ status: 'deleted' }> => ({
    status: 'deleted',
  }),
);
const mockCommitPendingProjectDirectory = vi.fn<FileManagerProxy['commitPendingProjectDirectory']>(async () => {
  phaseOrder.push('commit');
  return { status: 'committed' } as const;
});
const mockListProjectManifests = vi.fn<() => Promise<ProjectDiscoveryResult>>(async () => ({ roots: [], entries: [] }));

/** Worker change-channel double: one live subscription per event channel. */
type WorkerChangeSubscription = { readonly interestedIn: (path: string) => boolean; readonly handler: () => void };
const workerChangeSubscriptions = new Map<string, WorkerChangeSubscription>();
const subscribeWorkerChannel = (channel: string) =>
  vi.fn((subscription: WorkerChangeSubscription) => {
    workerChangeSubscriptions.set(channel, subscription);
    return () => workerChangeSubscriptions.delete(channel);
  });
const mockWorkerChangeChannel = {
  onFileWritten: subscribeWorkerChannel('fileWritten'),
  onFileDeleted: subscribeWorkerChannel('fileDeleted'),
  onFileRenamed: subscribeWorkerChannel('fileRenamed'),
  onDirectoryCreated: subscribeWorkerChannel('directoryCreated'),
  onDirectoryDeleted: subscribeWorkerChannel('directoryDeleted'),
  onDirectoryRenamed: subscribeWorkerChannel('directoryRenamed'),
  onDirectoryChanged: subscribeWorkerChannel('directoryChanged'),
};
const emitWorkerChange = (channel: string, path: string): void => {
  const subscription = workerChangeSubscriptions.get(channel);
  if (subscription?.interestedIn(path)) {
    subscription.handler();
  }
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    workerChangeChannel: mockWorkerChangeChannel,
    client: {
      writeFiles: mockWriteFiles,
      writeFile: mockWriteFile,
      readFile: mockReadFile,
      stat: mockStat,
      exists: vi.fn(async () => false),
      rmdir: vi.fn(async () => undefined),
      getDirectoryContents: vi.fn(async () => ({})),
      listProjectManifests: mockListProjectManifests,
      permanentlyDeleteProjectDirectory: mockPermanentlyDeleteProjectDirectory,
      commitPendingProjectDirectory: mockCommitPendingProjectDirectory,
    },
    workspace: { syncProjectRoots: mockSyncProjectRoots },
  }),
}));

const recordConfigWrite = async (_config: ProjectFileSystemConfig): Promise<void> => {
  phaseOrder.push('locator');
};
const mockSetProjectFileSystemConfig = vi.fn(recordConfigWrite);
const mockApplyProjectFileSystemConfigChanges = vi.fn(
  async ({ upserts, deletes }: { upserts: readonly ProjectFileSystemConfig[]; deletes: readonly string[] }) => {
    await Promise.all(upserts.map(async (config) => mockSetProjectFileSystemConfig(config)));
    await Promise.all(deletes.map(async (projectId) => mockDeleteProjectFileSystemConfig(projectId)));
  },
);
const mockGetProjectFileSystemConfig = vi.fn();
const mockDeleteProjectFileSystemConfig = vi.fn(async (_projectId: string) => {
  phaseOrder.push('locator-cleanup');
});
const mockGetWorkspace = vi.fn();
const mockCheckHandlePermission = vi.fn(async () => 'granted');
const mockRequestHandlePermission = vi.fn(async () => true);
const mockGetHomeStorageBackend = vi.fn(async (): Promise<'indexeddb' | 'opfs'> => 'opfs');
const mockGetProjectCreationLocation = vi.fn<() => Promise<{ location: ProjectCreationLocation; repaired: undefined }>>(
  async () => ({
    location: { kind: 'home' } as const,
    repaired: undefined,
  }),
);
const mockSetProjectCreationLocation = vi.fn(async () => {
  phaseOrder.push('preference');
});
let projectRootConfigurationListener: (() => void) | undefined;
const mockSubscribeProjectRootConfigurationChanges = vi.fn((listener: () => void) => {
  projectRootConfigurationListener = listener;
  return vi.fn();
});
const mockGetAllProjectFileSystemConfigs = vi.fn<() => Promise<ProjectFileSystemConfig[]>>(async () => []);
const mockListWorkspaces = vi.fn<() => Promise<Array<{ workspaceId: string; name?: string; slug?: string }>>>(
  async () => [],
);
const mockPinHomeStorageBackend = vi.fn(async (backend: 'indexeddb' | 'opfs') => backend);
const mockCreateWorkspaceConnection = vi.fn(async (handle: FileSystemDirectoryHandle) => ({
  workspaceId: 'wsp_live',
  name: handle.name,
  slug: 'workshop',
  lastConnectedAt: 1,
  minted: true,
}));
const mockRepairWorkspaceBindings = vi.fn(async () => ({
  repairedProjectCount: 1,
  removedWorkspaceIds: ['wsp_disconnected'],
  skipped: [],
}));

vi.mock('#filesystem/handle-store.js', () => ({
  createWorkspace: mockCreateWorkspaceConnection,
  listWorkspaces: mockListWorkspaces,
  setProjectFileSystemConfig: mockSetProjectFileSystemConfig,
  getProjectFileSystemConfig: mockGetProjectFileSystemConfig,
  getHomeStorageBackend: mockGetHomeStorageBackend,
  getProjectCreationLocation: mockGetProjectCreationLocation,
  setProjectCreationLocation: mockSetProjectCreationLocation,
  getWorkspace: mockGetWorkspace,
  checkHandlePermission: mockCheckHandlePermission,
  requestHandlePermission: mockRequestHandlePermission,
  deleteProjectFileSystemConfig: mockDeleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs: mockGetAllProjectFileSystemConfigs,
  pinHomeStorageBackend: mockPinHomeStorageBackend,
  subscribeProjectRootConfigurationChanges: mockSubscribeProjectRootConfigurationChanges,
  applyProjectFileSystemConfigChanges: mockApplyProjectFileSystemConfigChanges,
  repairWorkspaceBindings: mockRepairWorkspaceBindings,
}));

vi.mock('#filesystem/desktop-bridge.js', () => ({
  isDesktopTarget: false,
  desktopBridge: () => undefined,
  hostPathName: (path: string) => /[^/\\]+(?=[/\\]*$)/.exec(path)?.[0] ?? path,
  nodeHomeRoot: () => '/Users/tester/Library/Application Support/Tau/home',
}));

let mockIsFileSystemAccessSupported = false;
/** Which pick the host's directory picker produces; `node` is the desktop dialog. */
let mockPickerBackend: 'webaccess' | 'node' = 'webaccess';
vi.mock('#constants/browser.constants.js', () => ({
  get isFileSystemAccessSupported() {
    return mockIsFileSystemAccessSupported;
  },
  directoryPicker: () => ({
    available: mockIsFileSystemAccessSupported,
    backend: mockPickerBackend,
    pick: async (options?: { id?: string; mode?: 'read' | 'readwrite' }) => {
      if (mockPickerBackend === 'node') {
        return { backend: 'node', path: nodeWorkspacePath } as const;
      }
      const handle = await globalThis.window.showDirectoryPicker({
        id: options?.id,
        mode: options?.mode ?? 'readwrite',
      });
      return { backend: 'webaccess' as const, handle };
    },
  }),
  webAccessDirectoryPicker: () =>
    mockIsFileSystemAccessSupported
      ? {
          pick: async (options?: { id?: string; mode?: 'read' | 'readwrite' }) =>
            globalThis.window.showDirectoryPicker({ id: options?.id, mode: options?.mode ?? 'readwrite' }),
        }
      : undefined,
}));

let mockBuildSuperseded = false;
vi.mock('#filesystem/build-skew.js', () => ({
  buildId: 1,
  isBuildSuperseded: () => mockBuildSuperseded,
  subscribeBuildSkew: () => () => undefined,
}));

const pendingCreate: Extract<PendingProjectOperation, { kind: 'create' }> = {
  operationId,
  kind: 'create',
  backend: 'opfs',
  providerBasePath: 'test-project',
  manifest: fakeProject,
  library: { projectId: fakeProject.id, lastActivityAt: 10 },
  files: { 'main.ts': { content: new Uint8Array([1, 2, 3]) } },
  chat: {
    id: 'cht_create',
    resourceId: fakeProject.id,
    name: 'Initial chat',
    messages: [],
    createdAt: 10,
    updatedAt: 10,
  },
  editorState: {
    projectId: fakeProject.id,
    openFiles: [],
    activePaneId: undefined,
    focusedChatId: 'cht_create',
    panelState: defaultPanelState,
    workbenchLayout: undefined,
    viewerLayout: undefined,
    viewSettings: {},
    updatedAt: 10,
  },
};
const pendingPermanentDelete: Extract<PendingProjectOperation, { kind: 'permanent-delete' }> = {
  operationId: 'req_bbbbbbbbbbbbbbbbbbbbb',
  kind: 'permanent-delete',
  projectId: fakeProject.id,
  storage: {
    backend: 'opfs',
    providerBasePath: 'test-project',
  },
};

type PrepareProjectCreationInput = {
  readonly manifest: ProjectManifest;
  readonly chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt' | 'hasUnreadTurn'>;
  readonly editorState?: unknown;
  readonly files: Record<string, { readonly content: Uint8Array<ArrayBuffer> }>;
  readonly storage: PendingProjectStorage;
};

const mockPrepareProjectCreation = vi.fn<
  (input: PrepareProjectCreationInput) => Promise<Extract<PendingProjectOperation, { kind: 'create' }>>
>(async () => {
  phaseOrder.push('pending');
  return pendingCreate;
});
const mockResumeResources = vi.fn(async () => {
  phaseOrder.push('resources');
});
const mockCompletePending = vi.fn(async () => {
  phaseOrder.push('complete');
});
const mockGetPendingProjectOperations = vi.fn(async (): Promise<PendingProjectOperation[]> => []);
const mockBeginPermanentDeleteProject = vi.fn(async () => pendingPermanentDelete.operationId);
const mockDeleteProjectResources = vi.fn(async () => {
  phaseOrder.push('resources-cleanup');
});
const mockSetProjectDisclosure = vi.fn(async () => {
  phaseOrder.push('disclosure-cleanup');
  return true;
});
const mockGenerateProjectName = vi.fn(async () => {
  phaseOrder.push('name');
  return 'Tall Birdhouse';
});
const mockGetProjectLibraryState = vi.fn<(projectId: string) => Promise<ProjectLibraryState | undefined>>(
  async (projectId) => ({
    projectId,
    lastActivityAt: 10,
  }),
);
const mockCreateProjectLibraryState = vi.fn(async (state: ProjectLibraryState) => state);
const mockGetProjectLibraryStates = vi.fn(async (projectIds: readonly string[]): Promise<ProjectLibraryState[]> => {
  const states = await Promise.all(projectIds.map(async (projectId) => mockGetProjectLibraryState(projectId)));
  return states.filter((state): state is ProjectLibraryState => state !== undefined);
});
const mockCreateProjectLibraryStates = vi.fn(async (states: readonly ProjectLibraryState[]) => [...states]);
const mockTrashProject = vi.fn<(projectId: string) => Promise<ProjectLibraryState | undefined>>(
  async (projectId: string) => ({ projectId, lastActivityAt: 10, deletedAt: 55 }),
);
const mockRestoreProject = vi.fn<(projectId: string) => Promise<ProjectLibraryState | undefined>>(
  async (projectId: string) => ({ projectId, lastActivityAt: 10 }),
);
const activityChat: Chat = {
  id: 'chat_activity',
  resourceId: fakeProject.id,
  name: 'Activity',
  messages: [],
  createdAt: 1,
  updatedAt: 2,
  recencyAt: 2,
  hasUnreadTurn: false,
};
const mockTouchChatRecency = vi.fn<(chatId: string, activityAt: number) => Promise<Chat | undefined>>(
  async () => activityChat,
);
const mockSetChatUnreadState = vi.fn<(chatId: string, hasUnreadTurn: boolean) => Promise<Chat | undefined>>(
  async (_chatId, hasUnreadTurn) => ({ ...activityChat, hasUnreadTurn }),
);
const mockPatchChat = vi.fn(async () => ({ ...activityChat, name: 'Patched' }));
const mockTouchProjectActivity = vi.fn(async (projectId: string, activityAt?: number) => ({
  projectId,
  lastActivityAt: activityAt ?? 10,
}));

vi.mock('#chat-clients/use-project-name-client.js', () => ({
  useProjectNameClient: () => ({ generate: mockGenerateProjectName }),
}));

vi.mock('#hooks/project-manager.machine.js', async () => {
  const xstate = await import('xstate');
  return {
    projectManagerMachine: xstate.setup({}).createMachine({
      id: 'projectManager',
      initial: 'ready',
      context: { worker: undefined, wrappedWorker: undefined, error: undefined },
      states: { ready: {} },
    }),
  };
});

vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    waitFor: vi.fn(async () => ({
      matches: (state: string) => state === 'ready',
      context: {
        wrappedWorker: {
          prepareProjectCreation: mockPrepareProjectCreation,
          resumePendingProjectOperationResources: mockResumeResources,
          completePendingProjectOperation: mockCompletePending,
          getPendingProjectOperations: mockGetPendingProjectOperations,
          getProjectLibraryState: mockGetProjectLibraryState,
          getProjectLibraryStates: mockGetProjectLibraryStates,
          createProjectLibraryState: mockCreateProjectLibraryState,
          createProjectLibraryStates: mockCreateProjectLibraryStates,
          trashProject: mockTrashProject,
          restoreProject: mockRestoreProject,
          touchProjectActivity: mockTouchProjectActivity,
          touchChatRecency: mockTouchChatRecency,
          setChatUnreadState: mockSetChatUnreadState,
          patchChat: mockPatchChat,
          beginPermanentDeleteProject: mockBeginPermanentDeleteProject,
          deleteProjectResources: mockDeleteProjectResources,
          setProjectDisclosure: mockSetProjectDisclosure,
        },
      },
    })),
  };
});

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: string) => [defaultValue, vi.fn()],
}));
vi.mock('#utils/chat.utils.js', () => ({
  createMessage: (options: Record<string, unknown>) => ({ id: 'msg-1', ...options }),
}));

const { ProjectManagerProvider, useProjectManager } = await import('#hooks/use-project-manager.js');

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, undefined, children),
    );
  };
};

/** Same wrapper, plus a per-instance count of `['projects']` invalidations. */
const createCountingWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  const projectsInvalidations = (): number =>
    invalidateQueries.mock.calls.filter(([filters]) => filters?.queryKey?.[0] === 'projects').length;
  const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, undefined, children),
    );
  };
  return { wrapper, projectsInvalidations };
};

const createInspectableWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, undefined, children),
    );
  };
  return { wrapper, queryClient };
};

describe('useProjectManager.createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    phaseOrder.length = 0;
    manifestBytes = serializeProjectManifest(projectToManifest(fakeProject));
    mockIsFileSystemAccessSupported = false;
    mockBuildSuperseded = false;
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetPendingProjectOperations.mockResolvedValue([]);
    mockGetProjectLibraryState.mockImplementation(async (projectId) => ({
      projectId,
      lastActivityAt: 10,
      deletedAt: undefined,
    }));
    // `mockClear` leaves queued one-shot values behind; reset so a test never
    // inherits an unconsumed `mockResolvedValueOnce` from the previous one.
    for (const mock of [
      mockListProjectManifests,
      mockGetPendingProjectOperations,
      mockGetProjectLibraryState,
      mockCommitPendingProjectDirectory,
      mockPermanentlyDeleteProjectDirectory,
      mockPrepareProjectCreation,
      mockGenerateProjectName,
      mockSyncProjectRoots,
      mockTrashProject,
      mockStat,
      mockWriteFile,
      mockGetHomeStorageBackend,
      mockGetProjectCreationLocation,
      mockSetProjectCreationLocation,
      mockSetProjectDisclosure,
      mockGetWorkspace,
      mockCheckHandlePermission,
      mockRequestHandlePermission,
      mockRepairWorkspaceBindings,
    ]) {
      mock.mockReset();
    }
    mockListProjectManifests.mockResolvedValue({ roots: [], entries: [] });
    mockCommitPendingProjectDirectory.mockImplementation(async () => {
      phaseOrder.push('commit');
      return { status: 'committed' };
    });
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([]);
    mockSetProjectFileSystemConfig.mockImplementation(recordConfigWrite);
    mockListWorkspaces.mockResolvedValue([]);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCheckHandlePermission.mockResolvedValue('granted');
    mockRequestHandlePermission.mockResolvedValue(true);
    mockRepairWorkspaceBindings.mockResolvedValue({
      repairedProjectCount: 1,
      removedWorkspaceIds: ['wsp_disconnected'],
      skipped: [],
    });
    mockGetHomeStorageBackend.mockResolvedValue('opfs');
    mockGetProjectCreationLocation.mockResolvedValue({ location: { kind: 'home' }, repaired: undefined });
    mockSetProjectCreationLocation.mockImplementation(async () => {
      phaseOrder.push('preference');
    });
    mockSetProjectDisclosure.mockImplementation(async () => {
      phaseOrder.push('disclosure-cleanup');
      return true;
    });
    libraryFileContent = undefined;
    projectRootConfigurationListener = undefined;
    workerChangeSubscriptions.clear();
  });

  it('publishes connected-workspace projects into both same-tab query variants before resolving', async () => {
    mockIsFileSystemAccessSupported = true;
    mockListProjectManifests.mockResolvedValue(liveWorkspaceDiscovery);
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live', name: 'Workshop', slug: 'workshop' }]);
    const { directoryHandle: handle } = liveWorkspaceRoot;
    const { wrapper, queryClient } = createInspectableWrapper();
    const { result } = renderHook(() => useProjectManager(), { wrapper });

    let connected: ConnectedWorkspace | undefined;
    await act(async () => {
      connected = await result.current.connectWorkspace(handle);
    });

    expect(connected).toMatchObject({
      workspace: { workspaceId: 'wsp_live', name: 'tau-workspace' },
      projectCount: 1,
      minted: true,
    });
    expect(queryClient.getQueryData<ProjectListing>(['projects', { includeDeleted: false }])?.projects).toEqual([
      expect.objectContaining({
        manifest: fakeProject,
        slugs: { workspaceSlug: 'workshop', projectSlug: 'test-project' },
      }),
    ]);
    expect(queryClient.getQueryData<ProjectListing>(['projects', { includeDeleted: true }])?.projects).toHaveLength(1);
    expect(result.current.workspaceConnection).toMatchObject({ phase: 'ready', projectCount: 1 });
  });

  it('reports catalog counts for the selected workspace instead of Home', async () => {
    mockIsFileSystemAccessSupported = true;
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }, ...liveWorkspaceDiscovery.roots],
      entries: [
        { status: 'valid', manifest: fakeProject, locator: fakeLocator },
        { status: 'valid', manifest: unrelatedProject, locator: liveWorkspaceLocator },
      ],
    });
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live', name: 'Workshop', slug: 'workshop' }]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    let connected: ConnectedWorkspace | undefined;
    await act(async () => {
      connected = await result.current.connectWorkspace(liveWorkspaceRoot.directoryHandle);
    });

    expect(connected?.projectCount).toBe(1);
    expect(result.current.workspaceConnection).toMatchObject({
      phase: 'ready',
      projectCount: 1,
      candidateCount: 1,
      conflictCount: 0,
    });
  });

  it('reports selected-workspace conflicts instead of a false Home-ready result', async () => {
    mockIsFileSystemAccessSupported = true;
    const staleConfig = {
      projectId: unrelatedProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_disconnected',
      providerBasePath: liveWorkspaceLocator.relativeDirectory,
    } as const;
    mockListWorkspaces.mockResolvedValue([
      { workspaceId: 'wsp_disconnected', name: 'Old Workshop', slug: 'old-workshop' },
      { workspaceId: 'wsp_live', name: 'Workshop', slug: 'workshop' },
    ]);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([staleConfig]);
    mockGetProjectFileSystemConfig.mockImplementation(async (projectId: string) =>
      projectId === unrelatedProject.id ? staleConfig : undefined,
    );
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }, ...liveWorkspaceDiscovery.roots],
      entries: [
        { status: 'valid', manifest: fakeProject, locator: fakeLocator },
        { status: 'valid', manifest: unrelatedProject, locator: liveWorkspaceLocator },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.connectWorkspace(liveWorkspaceRoot.directoryHandle);
    });

    expect(result.current.workspaceConnection).toMatchObject({
      phase: 'ready',
      projectCount: 0,
      candidateCount: 1,
      conflictCount: 1,
    });
  });

  it('repairs only fresh unique blocked routes and refreshes roots once', async () => {
    const staleConfig = {
      projectId: fakeProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_disconnected',
      providerBasePath: liveWorkspaceLocator.relativeDirectory,
    } as const;
    mockListWorkspaces.mockResolvedValue([
      { workspaceId: 'wsp_disconnected', name: 'Old Workshop', slug: 'old-workshop' },
      { workspaceId: 'wsp_live', name: 'Workshop', slug: 'workshop' },
    ]);
    mockGetWorkspace.mockImplementation(async (workspaceId: string) =>
      workspaceId === 'wsp_live'
        ? { workspace: { workspaceId: 'wsp_live' }, handle: liveWorkspaceRoot.directoryHandle }
        : undefined,
    );
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([staleConfig]);
    mockGetProjectFileSystemConfig.mockResolvedValue(staleConfig);
    mockListProjectManifests.mockResolvedValue(liveWorkspaceDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    mockSyncProjectRoots.mockClear();

    const repaired = await result.current.repairWorkspaceBindings('wsp_live');

    expect(mockRepairWorkspaceBindings).toHaveBeenCalledExactlyOnceWith({
      canonicalWorkspaceId: 'wsp_live',
      repairs: [
        {
          projectId: fakeProject.id,
          sourceWorkspaceId: 'wsp_disconnected',
          providerBasePath: liveWorkspaceLocator.relativeDirectory,
        },
      ],
    });
    expect(repaired.repairedProjectCount).toBe(1);
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent connection callers into one workspace operation', async () => {
    mockIsFileSystemAccessSupported = true;
    mockListProjectManifests.mockResolvedValue(liveWorkspaceDiscovery);
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live', name: 'Workshop', slug: 'workshop' }]);
    const { directoryHandle: handle } = liveWorkspaceRoot;
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    let connections: Array<ConnectedWorkspace | undefined> = [];
    await act(async () => {
      connections = await Promise.all([
        result.current.connectWorkspace(handle),
        result.current.connectWorkspace(handle),
      ]);
    });

    expect(mockCreateWorkspaceConnection).toHaveBeenCalledOnce();
    expect(connections[0]).toEqual(connections[1]);
  });

  it('synchronizes worker roots when another browser context changes project root configuration', async () => {
    renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });

    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
  });

  it('replays journaled storage without consulting or changing creation preference', async () => {
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await result.current.getProjectListing();

    await vi.waitFor(() => {
      expect(mockCompletePending).toHaveBeenCalledWith(operationId);
    });
    expect(mockGetProjectCreationLocation).not.toHaveBeenCalled();
    expect(mockSetProjectCreationLocation).not.toHaveBeenCalled();
  });

  it('uses fresh discovery for route access after bootstrap completes', async () => {
    mockListProjectManifests.mockResolvedValueOnce({ roots: [], entries: [] }).mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
      status: 'ready',
      project: fakeProject,
    });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'ready' });

    expect(mockGetPendingProjectOperations).toHaveBeenCalledOnce();
    expect(mockListProjectManifests).toHaveBeenCalledTimes(3);
  });

  it('classifies duplicate project identities as conflicts', async () => {
    const duplicateLocator: ProjectLocator = {
      ...fakeLocator,
      relativeDirectory: 'test-project-copy',
    };
    mockListProjectManifests.mockResolvedValue({
      roots: [],
      entries: [
        {
          status: 'duplicate-id',
          manifest: fakeProject,
          locator: fakeLocator,
        },
        {
          status: 'duplicate-id',
          manifest: fakeProject,
          locator: duplicateLocator,
        },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'conflict' });
  });

  it('classifies a configured project on an inaccessible root as unavailable', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: 'test-project',
    });
    mockListProjectManifests.mockResolvedValue({
      entries: [],
      roots: [
        {
          status: 'inaccessible',
          root: { backend: 'opfs' },
          reason: 'permission denied',
        },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'unavailable' });
  });

  it('blocks an alternate occurrence when the configured root of a known workspace was omitted from discovery', async () => {
    const configured = {
      projectId: fakeProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_unavailable',
      providerBasePath: 'original',
    } as const;
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_unavailable' }]);
    mockGetProjectFileSystemConfig.mockResolvedValue(configured);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([configured]);
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [],
      conflicts: [{ status: 'route-blocked', manifest: fakeProject, locator: fakeLocator }],
    });
    expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('blocks re-pointing a project whose known workspace root is inaccessible', async () => {
    const configured = {
      projectId: fakeProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_live',
      providerBasePath: 'original',
    } as const;
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live' }]);
    mockGetProjectFileSystemConfig.mockResolvedValue(configured);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([configured]);
    mockListProjectManifests.mockResolvedValue({
      roots: [
        { status: 'inaccessible', root: liveWorkspaceRoot, reason: 'permission denied' },
        ...validProjectDiscovery.roots,
      ],
      entries: validProjectDiscovery.entries,
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [],
      conflicts: [{ status: 'route-blocked', manifest: fakeProject }],
    });
    expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('restores a library whose configs cite a workspace that no longer exists (eviction incident repro)', async () => {
    const dangling = {
      projectId: fakeProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_evicted',
      providerBasePath: liveWorkspaceLocator.relativeDirectory,
    } as const;
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live' }]);
    mockGetProjectFileSystemConfig.mockResolvedValue(dangling);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([dangling]);
    mockListProjectManifests.mockResolvedValue(liveWorkspaceDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [{ manifest: fakeProject }],
      conflicts: [],
    });
    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith({
      projectId: fakeProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_live',
      providerBasePath: liveWorkspaceLocator.relativeDirectory,
    });
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('carries the workspace display name into project listings', async () => {
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live', name: 'Workshop', slug: 'workshop' }]);
    mockListProjectManifests.mockResolvedValue(liveWorkspaceDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [
        {
          manifest: fakeProject,
          workspaceName: 'Workshop',
          slugs: { workspaceSlug: 'workshop', projectSlug: 'test-project' },
        },
      ],
    });
  });

  it('keeps duplicate-id for genuinely duplicated identities while a blocked route stays route-blocked', async () => {
    const configured = {
      projectId: unrelatedProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_unavailable',
      providerBasePath: 'original-1',
    } as const;
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_unavailable' }]);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([configured]);
    mockGetProjectFileSystemConfig.mockImplementation(async (projectId: string) =>
      projectId === unrelatedProject.id ? configured : undefined,
    );
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [
        { status: 'valid', manifest: fakeProject, locator: fakeLocator },
        {
          status: 'valid',
          manifest: fakeProject,
          locator: { ...fakeLocator, relativeDirectory: 'copy' },
        },
        { status: 'valid', manifest: unrelatedProject, locator: unrelatedLocator },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const listing = await result.current.getProjectListing();
    expect(listing.conflicts.map((conflict) => conflict.status)).toEqual([
      'duplicate-id',
      'duplicate-id',
      'route-blocked',
    ]);
  });

  it('keeps a config whose directory is discovered but unreadable', async () => {
    const configured = {
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    } as const;
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([configured]);
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [
        { status: 'invalid', locator: fakeLocator, issue: { code: 'manifest-unreadable', message: 'storage error' } },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.getProjectListing();
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockDeleteProjectResources).not.toHaveBeenCalled();
  });

  it('deletes a config with no discovered directory under a complete root', async () => {
    const configured = {
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    } as const;
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([configured]);
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.getProjectListing();
    expect(mockDeleteProjectFileSystemConfig).toHaveBeenCalledWith(fakeProject.id);
    // Keyed rows (chats/editor/library) must not outlive the config they belong to.
    expect(mockDeleteProjectResources).toHaveBeenCalledWith(fakeProject.id);
  });

  it('coalesces a burst of worker filesystem events into one library invalidation', async () => {
    const { wrapper, projectsInvalidations } = createCountingWrapper();
    renderHook(() => useProjectManager(), { wrapper });
    vi.useFakeTimers();
    try {
      act(() => {
        for (let index = 0; index < 12; index++) {
          emitWorkerChange('fileWritten', `/project-${index}/tau.json`);
        }
        emitWorkerChange('directoryCreated', '/test-project');
      });
      expect(projectsInvalidations()).toBe(0);

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(projectsInvalidations()).toBe(1);

      // A later burst is a separate write, not the tail of the first one.
      act(() => {
        emitWorkerChange('fileDeleted', '/test-project/tau.json');
        vi.advanceTimersByTime(300);
      });
      expect(projectsInvalidations()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores workspace and project app-state writes so `.tau/**` cannot storm discovery', async () => {
    const { wrapper, projectsInvalidations } = createCountingWrapper();
    renderHook(() => useProjectManager(), { wrapper });
    vi.useFakeTimers();
    try {
      act(() => {
        emitWorkerChange('fileWritten', '/.tau/workspace.json');
        emitWorkerChange('fileWritten', '/.tau/cache/blobs/abc');
        emitWorkerChange('fileWritten', '/test-project/.tau/library.json');
        emitWorkerChange('fileWritten', `/projects/${fakeProject.id}/.tau/transcripts/1.json`);
        emitWorkerChange('fileWritten', '/test-project/main.ts');
        vi.advanceTimersByTime(300);
      });
      expect(projectsInvalidations()).toBe(0);

      // …but a project directory appearing at the workspace root does.
      act(() => {
        emitWorkerChange('directoryCreated', '/externally-added-project');
        vi.advanceTimersByTime(300);
      });
      expect(projectsInvalidations()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending library invalidation when the provider unmounts', async () => {
    const { wrapper, projectsInvalidations } = createCountingWrapper();
    const { unmount } = renderHook(() => useProjectManager(), { wrapper });
    vi.useFakeTimers();
    try {
      act(() => {
        emitWorkerChange('fileWritten', '/test-project/tau.json');
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(projectsInvalidations()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies cross-tab route changes immediately and debounces only the refetch', async () => {
    const { wrapper, projectsInvalidations } = createCountingWrapper();
    renderHook(() => useProjectManager(), { wrapper });

    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
    expect(projectsInvalidations()).toBe(0);

    await act(async () => {
      await vi.waitFor(() => {
        expect(projectsInvalidations()).toBe(1);
      });
    });
  });

  it('reads every project route config with one cursor pass per discovery', async () => {
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [
        { status: 'valid', manifest: fakeProject, locator: fakeLocator },
        { status: 'valid', manifest: unrelatedProject, locator: unrelatedLocator },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.getProjectListing();

    expect(mockGetProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockGetAllProjectFileSystemConfigs.mock.calls.length).toBe(mockListProjectManifests.mock.calls.length);
  });

  it('reconciles 500 cold projects with one config transaction, topology sync, and library read', async () => {
    const configs = new Map<string, ProjectFileSystemConfig>();
    const entries: Array<Extract<ProjectDiscoveryEntry, { status: 'valid' }>> = Array.from(
      { length: 500 },
      (_, index) => {
        const projectId = `proj_${String(index).padStart(21, '0')}`;
        return {
          status: 'valid',
          manifest: { ...fakeProject, id: projectId, name: `Project ${index}` },
          locator: {
            backend: 'opfs',
            storageRootKey: 'opfs:origin',
            relativeDirectory: `project-${index}`,
          },
        };
      },
    );
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries,
    });
    mockGetAllProjectFileSystemConfigs.mockImplementation(async () => [...configs.values()]);
    mockApplyProjectFileSystemConfigChanges.mockImplementationOnce(async ({ upserts }) => {
      for (const config of upserts) {
        configs.set(config.projectId, config);
      }
    });
    mockGetProjectLibraryStates.mockResolvedValueOnce(
      entries.map(({ manifest }) => ({ projectId: manifest.id, lastActivityAt: 10 })),
    );
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const listing = await result.current.getProjectListing();

    expect(listing.projects).toHaveLength(500);
    expect(mockApplyProjectFileSystemConfigChanges).toHaveBeenCalledOnce();
    const [changes] = mockApplyProjectFileSystemConfigChanges.mock.calls[0]!;
    expect(changes.deletes).toEqual([]);
    expect(changes.upserts.some(({ projectId }) => projectId === entries[0]!.manifest.id)).toBe(true);
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
    expect(mockGetProjectLibraryStates).toHaveBeenCalledOnce();
    expect(mockCreateProjectLibraryStates).not.toHaveBeenCalled();
  });

  it('collects orphans against the configs written earlier in the same pass', async () => {
    // The project moved from OPFS to a live workspace: the pass re-points the
    // config, and the sweep must judge the new route, not the pre-pass one.
    const configs = new Map<string, ProjectFileSystemConfig>([
      [fakeProject.id, { projectId: fakeProject.id, backend: 'opfs', providerBasePath: fakeLocator.relativeDirectory }],
    ]);
    mockGetAllProjectFileSystemConfigs.mockImplementation(async () => [...configs.values()]);
    mockSetProjectFileSystemConfig.mockImplementation(async (config: ProjectFileSystemConfig) => {
      configs.set(config.projectId, config);
    });
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_live' }]);
    mockListProjectManifests.mockResolvedValue({
      roots: [
        { status: 'complete', root: { backend: 'opfs' } },
        { status: 'complete', root: liveWorkspaceRoot },
      ],
      entries: [{ status: 'valid', manifest: fakeProject, locator: liveWorkspaceLocator }],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.getProjectListing();

    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: fakeProject.id, backend: 'webaccess', workspaceId: 'wsp_live' }),
    );
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockDeleteProjectResources).not.toHaveBeenCalled();
  });

  it('shares one discovery pass between concurrent callers', async () => {
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await result.current.getProjectLibraryState(fakeProject.id);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockListProjectManifests.mockClear();
    mockListProjectManifests.mockImplementation(async () => {
      await gate;
      return validProjectDiscovery;
    });
    const listing = result.current.getProjectListing();
    const access = result.current.getProjectRouteAccess(fakeProject.id);
    // Let both callers reach the discovery join point before the pass settles.
    for (let index = 0; index < 50; index++) {
      // oxlint-disable-next-line no-await-in-loop -- draining the microtask queue is inherently sequential
      await Promise.resolve();
    }
    release();
    await Promise.all([listing, access]);

    expect(mockListProjectManifests).toHaveBeenCalledOnce();
  });

  it('skips orphan collection when the durable route configuration changed mid-pass', async () => {
    const configured = {
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    } as const;
    mockGetAllProjectFileSystemConfigs.mockImplementation(async () => {
      projectRootConfigurationListener?.();
      return [configured];
    });
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.getProjectListing();
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockDeleteProjectResources).not.toHaveBeenCalled();
  });

  it('classifies discovered projects using library trash state', async () => {
    mockGetProjectLibraryState.mockResolvedValue({
      projectId: fakeProject.id,
      lastActivityAt: 10,
      deletedAt: 11,
    });
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
      status: 'trashed',
      project: fakeProject,
    });
  });

  it('keeps an evicted library row trashed by reading the disk tombstone (eviction resurrection repro)', async () => {
    mockGetProjectLibraryState.mockResolvedValue(undefined);
    libraryFileContent = JSON.stringify({ deletedAt: 55 });
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({ projects: [], conflicts: [] });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'trashed' });
    expect(mockReadFile).toHaveBeenCalledWith(libraryFilePath, 'utf8');
    expect(mockCreateProjectLibraryState).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: fakeProject.id, deletedAt: 55 }),
    );
  });

  it('ignores a malformed disk tombstone instead of casting user-edited library metadata', async () => {
    mockGetProjectLibraryState.mockResolvedValue(undefined);
    libraryFileContent = JSON.stringify({ deletedAt: 'yesterday' });
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const listing = await result.current.getProjectListing();
    expect(listing).toMatchObject({ projects: [{ library: { projectId: fakeProject.id } }], conflicts: [] });
    expect(listing.projects[0]?.library).not.toHaveProperty('deletedAt');
    expect(mockCreateProjectLibraryStates).toHaveBeenCalledWith([
      expect.objectContaining({ projectId: fakeProject.id }),
    ]);
    expect(mockCreateProjectLibraryStates.mock.calls[0]?.[0][0]).not.toHaveProperty('deletedAt');
  });

  it('seeds re-minted activity from the manifest mtime instead of the current time', async () => {
    mockGetProjectLibraryState.mockResolvedValue(undefined);
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [{ library: { projectId: fakeProject.id, lastActivityAt: 1_700_000_000_000 } }],
    });
    expect(mockStat).toHaveBeenCalledWith(`/projects/${fakeProject.id}/tau.json`);
    expect(mockCreateProjectLibraryStates).toHaveBeenCalledWith([
      {
        projectId: fakeProject.id,
        lastActivityAt: 1_700_000_000_000,
      },
    ]);
  });

  it('falls back to the current time when the manifest cannot be stat-ed', async () => {
    const before = Date.now();
    mockGetProjectLibraryState.mockResolvedValue(undefined);
    mockStat.mockRejectedValueOnce(new Error('ENOENT'));
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const listing = await result.current.getProjectListing();
    expect(listing.projects[0]?.library.lastActivityAt).toBeGreaterThanOrEqual(before);
  });

  it('writes a disk tombstone when a project is trashed', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.deleteProject(fakeProject.id);

    expect(mockTrashProject).toHaveBeenCalledWith(fakeProject.id);
    expect(mockWriteFile).toHaveBeenCalledWith(libraryFilePath, JSON.stringify({ deletedAt: 55 }));
  });

  it('clears the disk tombstone when a project is restored', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.restoreProject(fakeProject.id);

    expect(mockRestoreProject).toHaveBeenCalledWith(fakeProject.id);
    expect(mockWriteFile).toHaveBeenCalledWith(libraryFilePath, '{}');
  });

  it('keeps trashing when the tombstone cannot be written', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('workspace disconnected'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    // The tombstone is best-effort; the library row is what the toast reports.
    await expect(result.current.deleteProject(fakeProject.id)).resolves.toBe(true);
  });

  it('classifies an undiscovered and unconfigured project as missing', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'missing' });
  });

  it('uses one discovery authority for listings and route access', async () => {
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [{ manifest: fakeProject }],
      conflicts: [],
    });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
      status: 'ready',
      project: fakeProject,
    });
  });

  it('does not replay bootstrap work after project root configuration changes', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await result.current.getProjectRouteAccess(fakeProject.id);

    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });
    await result.current.getProjectRouteAccess(fakeProject.id);

    expect(mockGetPendingProjectOperations).toHaveBeenCalledOnce();
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
  });

  it('publishes discovery while a quarantined pending project is still recovering', async () => {
    let resolveCommit!: () => void;
    mockGetPendingProjectOperations.mockResolvedValue([
      {
        ...pendingCreate,
        files: {
          ...pendingCreate.files,
          'tau.json': { content: serializeProjectManifest(fakeProject) },
        },
      },
    ]);
    mockListProjectManifests.mockResolvedValue({
      roots: [],
      entries: [
        ...validProjectDiscovery.entries,
        {
          status: 'valid',
          manifest: unrelatedProject,
          locator: unrelatedLocator,
        },
      ],
    });
    mockCommitPendingProjectDirectory.mockImplementationOnce(
      async () =>
        new Promise<{ status: 'committed' }>((resolve) => {
          resolveCommit = () => {
            resolve({ status: 'committed' });
          };
        }),
    );
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [{ manifest: unrelatedProject }],
      conflicts: [],
      recoveries: [{ projectId: fakeProject.id, status: 'recovering' }],
    });
    await expect(result.current.getProjectRouteAccess(unrelatedProject.id)).resolves.toMatchObject({
      status: 'ready',
      project: unrelatedProject,
    });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
      status: 'recovering',
    });
    expect(mockCommitPendingProjectDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ files: pendingCreate.files }),
    );

    resolveCommit();
    await vi.waitFor(() => {
      expect(mockCompletePending).toHaveBeenCalledWith(operationId);
    });
  });

  it('classifies one failed recovery without rejecting unrelated discovery', async () => {
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    mockCommitPendingProjectDirectory.mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [],
      conflicts: [],
    });
    await vi.waitFor(async () => {
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
        status: 'recovery-failed',
        recovery: { reason: 'filesystem-error' },
      });
    });
    expect(mockCompletePending).not.toHaveBeenCalled();
  });

  it('propagates systemic discovery failure instead of presenting an empty library', async () => {
    mockListProjectManifests.mockRejectedValue(new Error('discovery failed'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).rejects.toThrow('discovery failed');
  });

  it('uses the filesystem authority commit before restoring local resources and clearing the journal', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await act(async () =>
      result.current.createProject({
        project: {
          name: fakeProject.name,
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        },
        files: pendingCreate.files,
        location: { kind: 'home' },
      }),
    );

    const prepared = mockPrepareProjectCreation.mock.calls.at(-1)?.[0];
    expect(prepared?.files).toBe(pendingCreate.files);
    expect(prepared?.storage).toMatchObject({ backend: 'opfs' });
    expect(mockPinHomeStorageBackend).toHaveBeenCalledWith('opfs');
    expect(mockCommitPendingProjectDirectory).toHaveBeenCalledWith({
      providerBasePath: pendingCreate.providerBasePath,
      scope: { backend: 'opfs' },
      files: pendingCreate.files,
      manifest: serializeProjectManifest(fakeProject),
    });
    expect(phaseOrder).toEqual(['pending', 'commit', 'locator', 'roots', 'resources', 'complete', 'preference']);
    expect(mockGetProjectCreationLocation).not.toHaveBeenCalled();
    expect(mockSetProjectCreationLocation).toHaveBeenCalledWith({ kind: 'home' });
  });

  it('resolves an omitted location from durable preference immediately before allocation', async () => {
    mockIsFileSystemAccessSupported = true;
    mockGetProjectCreationLocation.mockResolvedValue({
      location: { kind: 'workspace', workspaceId: 'wsp_preferred' },
      repaired: undefined,
    });
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_preferred' }]);
    const handle = { kind: 'directory', name: 'Preferred' };
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_preferred', name: 'Preferred', slug: 'preferred' },
      handle,
    });
    mockPrepareProjectCreation.mockResolvedValueOnce({
      ...pendingCreate,
      backend: 'webaccess',
      workspaceId: 'wsp_preferred',
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        project: fakeProject,
        files: pendingCreate.files,
      }),
    );

    expect(mockGetProjectCreationLocation).toHaveBeenCalledWith({ webAccessSupported: true });
    expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0].storage).toMatchObject({
      backend: 'webaccess',
      workspaceId: 'wsp_preferred',
    });
    expect(mockSetProjectCreationLocation).toHaveBeenCalledWith({
      kind: 'workspace',
      workspaceId: 'wsp_preferred',
    });
  });

  it('uses repaired Home for an omitted location without folder capability', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        project: fakeProject,
        files: pendingCreate.files,
      }),
    );

    expect(mockGetProjectCreationLocation).toHaveBeenCalledWith({ webAccessSupported: false });
    expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0].storage).toMatchObject({ backend: 'opfs' });
    expect(mockSetProjectCreationLocation).toHaveBeenCalledWith({ kind: 'home' });
  });

  it('never falls back when an explicit workspace is unsupported', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      result.current.createProject({
        project: fakeProject,
        files: pendingCreate.files,
        location: { kind: 'workspace', workspaceId: 'wsp_exact' },
      }),
    ).rejects.toMatchObject({ code: 'unsupported', workspaceId: 'wsp_exact' });
    expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
    expect(mockGetHomeStorageBackend).not.toHaveBeenCalled();
    expect(mockSetProjectCreationLocation).not.toHaveBeenCalled();
  });

  it('allocates a slug-only directory at the workspace root, incrementing past what discovery already sees', async () => {
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [
        { status: 'valid', manifest: fakeProject, locator: { ...fakeLocator, relativeDirectory: 'Test-Project' } },
        {
          status: 'valid',
          manifest: unrelatedProject,
          locator: { ...fakeLocator, relativeDirectory: 'test-project-1' },
        },
        // A directory in another storage root cannot collide.
        {
          status: 'valid',
          manifest: fakeProject,
          locator: { ...liveWorkspaceLocator, relativeDirectory: 'test-project-2' },
        },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        project: {
          name: 'Test Project',
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        },
        files: pendingCreate.files,
        location: { kind: 'home' },
      }),
    );

    expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0].storage).toMatchObject({
      backend: 'opfs',
      providerBasePath: 'test-project-2',
    });
  });

  it('resolves a semantic multimodal name before allocating durable project work', async () => {
    const imageUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        kernel: 'openscad',
        initialMessage: { content: '', imageUrls: [imageUrl] },
        location: { kind: 'home' },
      }),
    );

    expect(mockGenerateProjectName).toHaveBeenCalledWith({ text: '', imageUrls: [imageUrl] });
    const prepared = mockPrepareProjectCreation.mock.calls.at(-1)?.[0];
    expect(prepared?.manifest.name).toBe('Tall Birdhouse');
    expect(phaseOrder.indexOf('name')).toBeLessThan(phaseOrder.indexOf('pending'));
  });

  it.each([
    { generatedName: 'New Project', expectedName: 'New Project', outputKind: 'generic output' },
    { generatedName: '   ', expectedName: 'New Project', outputKind: 'blank output' },
  ])('should create with $expectedName when naming returns $outputKind', async ({ generatedName, expectedName }) => {
    mockGenerateProjectName.mockResolvedValueOnce(generatedName);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        kernel: 'openscad',
        initialMessage: { content: 'Make a cube' },
        location: { kind: 'home' },
      }),
    );

    const prepared = mockPrepareProjectCreation.mock.calls.at(-1)?.[0];
    expect(prepared?.manifest.name).toBe(expectedName);
  });

  it('falls back to the default name when the project naming request fails', async () => {
    /* Naming is a courtesy from the API, not a prerequisite: a daemon-served
     * page or a desktop app with the API unreachable still creates the project. */
    mockGenerateProjectName.mockRejectedValueOnce(new Error('naming unavailable'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        kernel: 'openscad',
        initialMessage: { content: 'Please make the object in this image' },
        location: { kind: 'home' },
      }),
    );

    const prepared = mockPrepareProjectCreation.mock.calls.at(-1)?.[0];
    expect(prepared?.manifest.name).toBe('New Project');
    expect(mockCommitPendingProjectDirectory).toHaveBeenCalledOnce();
  });

  it('leaves the pending row intact when the manifest commit fails', async () => {
    mockCommitPendingProjectDirectory.mockRejectedValueOnce(new Error('manifest write failed'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      act(async () =>
        result.current.createProject({
          project: {
            name: fakeProject.name,
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          },
          files: pendingCreate.files,
          location: { kind: 'home' },
        }),
      ),
    ).rejects.toMatchObject({ name: 'PendingProjectRecoveryError', reason: 'filesystem-error' });

    expect(mockResumeResources).not.toHaveBeenCalled();
    expect(mockCompletePending).not.toHaveBeenCalled();
    expect(mockSetProjectCreationLocation).not.toHaveBeenCalled();
  });

  it('returns a committed project when preference persistence fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const preferenceError = new Error('preference write failed');
    mockSetProjectCreationLocation.mockRejectedValueOnce(preferenceError);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const created = await result.current.createProject({
      project: fakeProject,
      files: pendingCreate.files,
      location: { kind: 'home' },
    });

    expect(created.id).toBe(fakeProject.id);
    expect(mockCompletePending).toHaveBeenCalledWith(operationId);
    expect(warning).toHaveBeenCalledWith(
      '[ProjectManager] failed to persist project creation location',
      preferenceError,
    );
  });

  it('persists the location whose concurrent creation completes last', async () => {
    mockIsFileSystemAccessSupported = true;
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_race' }]);
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_race', name: 'Race', slug: 'race' },
      handle: { kind: 'directory', name: 'Race' },
    });
    mockPrepareProjectCreation.mockImplementation(async (input) => ({
      ...pendingCreate,
      operationId: input.storage.backend === 'webaccess' ? 'req_disk' : 'req_home',
      ...input.storage,
    }));

    let completeHome!: () => void;
    let completeDisk!: () => void;
    mockCommitPendingProjectDirectory.mockImplementation(
      async ({ scope }) =>
        new Promise<{ readonly status: 'committed' }>((resolve) => {
          const complete = () => {
            resolve({ status: 'committed' });
          };
          if (scope.backend === 'webaccess') {
            completeDisk = complete;
          } else {
            completeHome = complete;
          }
        }),
    );

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    const homeCreation = result.current.createProject({
      project: fakeProject,
      files: pendingCreate.files,
      location: { kind: 'home' },
    });
    const diskCreation = result.current.createProject({
      project: fakeProject,
      files: pendingCreate.files,
      location: { kind: 'workspace', workspaceId: 'wsp_race' },
    });
    await vi.waitFor(() => {
      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledTimes(2);
    });

    completeDisk();
    await diskCreation;
    completeHome();
    await homeCreation;

    expect(mockSetProjectCreationLocation.mock.calls).toEqual([
      [{ kind: 'workspace', workspaceId: 'wsp_race' }],
      [{ kind: 'home' }],
    ]);
  });

  it('persists the resolved webaccess workspace identity in the pending operation', async () => {
    mockIsFileSystemAccessSupported = true;
    const handle = { kind: 'directory', name: 'Workspace' };
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_default' }]);
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_default', name: 'Workspace', slug: 'workspace' },
      handle,
    });

    const webaccessPending: Extract<PendingProjectOperation, { kind: 'create'; backend: 'webaccess' }> = {
      ...pendingCreate,
      backend: 'webaccess',
      workspaceId: 'wsp_default',
    };
    mockPrepareProjectCreation.mockResolvedValueOnce(webaccessPending);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await act(async () =>
      result.current.createProject({
        project: {
          name: fakeProject.name,
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        },
        files: {},
        location: { kind: 'workspace', workspaceId: 'wsp_default' },
      }),
    );

    const prepared = mockPrepareProjectCreation.mock.calls.at(-1)?.[0];
    expect(prepared?.storage).toMatchObject({
      backend: 'webaccess',
      workspaceId: 'wsp_default',
    });
    expect(mockSetProjectCreationLocation).toHaveBeenCalledWith({
      kind: 'workspace',
      workspaceId: 'wsp_default',
    });
  });

  it('journals permanent deletion before deleting the exact observed directory and local records', async () => {
    mockGetProjectLibraryState.mockResolvedValueOnce({
      projectId: fakeProject.id,
      lastActivityAt: 10,
      deletedAt: 11,
    });
    const configured = {
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: pendingPermanentDelete.storage.providerBasePath,
    } as const;
    mockGetProjectFileSystemConfig.mockResolvedValue(configured);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([configured]);
    mockGetPendingProjectOperations.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingPermanentDelete]);
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => result.current.permanentlyDeleteProject(fakeProject.id));

    expect(mockBeginPermanentDeleteProject).toHaveBeenCalledWith(fakeProject.id, pendingPermanentDelete.storage);
    expect(mockPermanentlyDeleteProjectDirectory).toHaveBeenCalledWith({
      projectId: fakeProject.id,
      providerBasePath: pendingPermanentDelete.storage.providerBasePath,
      scope: { backend: 'opfs' },
    });
    expect(mockSetProjectDisclosure).toHaveBeenCalledWith(fakeProject.id, undefined);
    expect(phaseOrder).toEqual(['resources-cleanup', 'disclosure-cleanup', 'locator-cleanup', 'roots', 'complete']);
  });

  it('journals the freshly discovered locator instead of stale persisted configuration', async () => {
    const movedLocator: ProjectLocator = {
      ...fakeLocator,
      relativeDirectory: 'moved-project',
    };
    const movedStorage: PendingProjectStorage = {
      backend: 'opfs',
      providerBasePath: movedLocator.relativeDirectory,
    };
    const movedPending: Extract<PendingProjectOperation, { kind: 'permanent-delete' }> = {
      ...pendingPermanentDelete,
      storage: movedStorage,
    };
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: 'stale-location',
    });
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [{ status: 'valid', manifest: fakeProject, locator: movedLocator }],
    });
    mockGetPendingProjectOperations.mockResolvedValueOnce([]).mockResolvedValueOnce([movedPending]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => result.current.permanentlyDeleteProject(fakeProject.id));

    expect(mockBeginPermanentDeleteProject).toHaveBeenCalledWith(fakeProject.id, movedStorage);
    expect(mockPermanentlyDeleteProjectDirectory).toHaveBeenCalledWith({
      projectId: fakeProject.id,
      providerBasePath: movedLocator.relativeDirectory,
      scope: { backend: 'opfs' },
    });
  });

  it('refuses permanent-delete admission while discovery is incomplete', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    });
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'inaccessible', root: { backend: 'opfs' }, reason: 'permission denied' }],
      entries: [],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.permanentlyDeleteProject(fakeProject.id)).rejects.toThrow(
      'Project storage is not completely observable',
    );
    expect(mockBeginPermanentDeleteProject).not.toHaveBeenCalled();
  });

  it('refuses permanent-delete admission when the project identity is duplicated', async () => {
    const duplicateLocator: ProjectLocator = {
      ...fakeLocator,
      relativeDirectory: 'duplicate',
    };
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    });
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [
        { status: 'valid', manifest: fakeProject, locator: fakeLocator },
        { status: 'duplicate-id', manifest: fakeProject, locator: duplicateLocator },
      ],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.permanentlyDeleteProject(fakeProject.id)).rejects.toThrow(
      'Project must have exactly one current occurrence',
    );
    expect(mockBeginPermanentDeleteProject).not.toHaveBeenCalled();
  });

  it('retains local state and the journal when an absent result reveals a moved occurrence', async () => {
    const movedLocator: ProjectLocator = {
      ...fakeLocator,
      relativeDirectory: 'reappeared',
    };
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    });
    mockListProjectManifests
      .mockResolvedValueOnce(validProjectDiscovery)
      .mockResolvedValueOnce(validProjectDiscovery)
      .mockResolvedValueOnce({
        roots: [{ status: 'complete', root: { backend: 'opfs' } }],
        entries: [{ status: 'valid', manifest: fakeProject, locator: movedLocator }],
      });
    mockPermanentlyDeleteProjectDirectory.mockResolvedValueOnce({ status: 'absent' });
    mockGetPendingProjectOperations.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingPermanentDelete]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.permanentlyDeleteProject(fakeProject.id)).rejects.toThrow('identity-conflict');
    expect(mockDeleteProjectResources).not.toHaveBeenCalled();
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockCompletePending).not.toHaveBeenCalled();
  });
  // =========================================================================
  // Phase 4 — hardening (DF3, DF4, DF10–DF12, DF20)
  // =========================================================================

  it('suspends durable reconciliation while a newer build is running', async () => {
    mockBuildSuperseded = true;
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([
      { projectId: 'proj_ccccccccccccccccccccc', backend: 'opfs', providerBasePath: 'gone' },
    ]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [{ manifest: fakeProject }],
    });

    expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
    expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('reconciles and garbage-collects normally when this build is current', async () => {
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([
      { projectId: 'proj_ccccccccccccccccccccc', backend: 'opfs', providerBasePath: 'gone' },
    ]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await result.current.getProjectListing();

    expect(mockSetProjectFileSystemConfig).toHaveBeenCalled();
    expect(mockDeleteProjectFileSystemConfig).toHaveBeenCalledWith('proj_ccccccccccccccccccccc');
  });

  it('logs a failed cross-tab root sync instead of leaking a rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSyncProjectRoots.mockRejectedValueOnce(new Error('sync failed'));
    renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
  });

  it('keeps a live different project visible at a quarantined locator', async () => {
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    mockCommitPendingProjectDirectory.mockImplementationOnce(
      async () =>
        new Promise(() => {
          // Never settles: the operation stays pending for the whole test.
        }),
    );
    // The pending operation's directory already holds a different project.
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'opfs' } }],
      entries: [{ status: 'valid', manifest: unrelatedProject, locator: { ...fakeLocator } }],
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectListing()).resolves.toMatchObject({
      projects: [{ manifest: unrelatedProject }],
    });
  });

  it('does not retry a terminally failed recovery when routes change', async () => {
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    mockCommitPendingProjectDirectory.mockRejectedValue(new Error('write failed'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await result.current.getProjectListing();
    await vi.waitFor(async () => {
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
        status: 'recovery-failed',
      });
    });
    const attempts = mockCommitPendingProjectDirectory.mock.calls.length;

    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });

    expect(mockCommitPendingProjectDirectory).toHaveBeenCalledTimes(attempts);
  });

  it('settles a recovery once its workspace is reconnected', async () => {
    mockIsFileSystemAccessSupported = true;
    const deadWorkspaceOperation: PendingProjectOperation = {
      ...pendingCreate,
      backend: 'webaccess',
      workspaceId: 'wsp_dead',
    };
    mockGetPendingProjectOperations.mockResolvedValue([deadWorkspaceOperation]);
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_dead' }]);
    mockGetWorkspace.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await result.current.getProjectListing();
    await vi.waitFor(async () => {
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
        status: 'recovery-failed',
        recovery: { reason: 'workspace-unavailable' },
      });
    });

    // Re-picking the marked folder resurrects the same workspace id.
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_dead', name: 'Workspace' },
      handle: { kind: 'directory', name: 'tau-workspace' },
    });
    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(mockCompletePending).toHaveBeenCalledWith(operationId);
    });
  });

  it('discards a failed recovery on request', async () => {
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    mockCommitPendingProjectDirectory.mockRejectedValue(new Error('write failed'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await result.current.getProjectListing();
    await vi.waitFor(async () => {
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
        status: 'recovery-failed',
      });
    });

    await act(async () => result.current.discardRecovery(operationId));

    expect(mockCompletePending).toHaveBeenCalledWith(operationId);
    await expect(result.current.getProjectListing()).resolves.toMatchObject({ recoveries: [] });
  });

  it('reports whether the trash mutation actually happened', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.deleteProject(fakeProject.id)).resolves.toBe(true);

    mockTrashProject.mockResolvedValue(undefined);
    await expect(result.current.deleteProject(fakeProject.id)).resolves.toBe(false);
  });

  it('distinguishes a disconnected workspace from having none at all', async () => {
    mockIsFileSystemAccessSupported = true;
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_stale' }]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    const create = async () =>
      result.current.createProject({
        project: { name: fakeProject.name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } },
        files: {},
        location: { kind: 'workspace', workspaceId: 'wsp_stale' },
      });

    await expect(create()).rejects.toMatchObject({ code: 'disconnected', workspaceId: 'wsp_stale' });

    mockListWorkspaces.mockResolvedValue([]);
    await expect(create()).rejects.toMatchObject({ code: 'missing', workspaceId: 'wsp_stale' });

    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_stale' }]);
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_stale', name: 'Stale', slug: 'stale' },
      handle: { kind: 'directory', name: 'Stale' },
    });
    mockCheckHandlePermission.mockResolvedValueOnce('prompt');
    await expect(create()).rejects.toMatchObject({ code: 'permission', workspaceId: 'wsp_stale' });
  });

  it('uses committed chat recency for project activity and invalidates both query families', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectManager(), { wrapper });
    invalidateQueries.mockClear();
    mockTouchChatRecency.mockResolvedValueOnce({ ...activityChat, recencyAt: 124 });

    await act(async () => result.current.touchChatRecency(activityChat.id, 123));

    expect(mockTouchChatRecency).toHaveBeenCalledWith(activityChat.id, 123);
    expect(mockTouchProjectActivity).toHaveBeenCalledWith(fakeProject.id, 124);
    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
      expect.arrayContaining([['chats', fakeProject.id], ['all-chats'], ['chat', activityChat.id], ['projects']]),
    );
  });

  it('sets unread state with chat invalidation only and leaves no-op recency silent', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectManager(), { wrapper });
    invalidateQueries.mockClear();
    mockSetChatUnreadState.mockResolvedValueOnce({ ...activityChat, hasUnreadTurn: true });

    await act(async () => result.current.setChatUnreadState(activityChat.id, true));

    expect(mockTouchProjectActivity).not.toHaveBeenCalled();
    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['chats', fakeProject.id],
      ['all-chats'],
      ['chat', activityChat.id],
    ]);

    invalidateQueries.mockClear();
    mockTouchChatRecency.mockResolvedValueOnce(undefined);
    await act(async () => result.current.touchChatRecency(activityChat.id, 2));
    expect(mockTouchProjectActivity).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refreshes chat projections after row persistence without changing project recency', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectManager(), { wrapper });
    invalidateQueries.mockClear();

    await act(async () => result.current.patchChat(activityChat.id, 'name', 'Patched'));

    expect(mockPatchChat).toHaveBeenCalledWith(activityChat.id, 'name', 'Patched');
    expect(mockTouchProjectActivity).not.toHaveBeenCalled();
    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['chats', fakeProject.id],
      ['all-chats'],
      ['chat', activityChat.id],
    ]);
  });
});
