/* eslint-disable @typescript-eslint/naming-convention -- Test fixtures use React component names and literal workspace file paths. */
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver, useQuery } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { createElement, useEffect, useState } from 'react';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type {
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  ProjectLocator,
  WatchEvent,
  WatchRequest,
} from '@taucad/filesystem';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { rootedPathOf } from '@taucad/fs-client/rooted-content-client';
import type { useFileManager } from '#hooks/use-file-manager.js';
import { consumableBytes } from '@taucad/fs-bridge';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import { defaultPanelState } from '#constants/editor.constants.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { PendingProjectOperation, PendingProjectStorage } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import type { ConnectedWorkspace, CreateProjectOptions, ProjectListing } from '#hooks/use-project-manager.js';
import type { ProjectNameInput } from '#chat-clients/use-project-name-client.js';
import { sha256Bytes } from '@taucad/utils/hash';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { storedRef } from '#utils/attachment.test-utils.js';

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
/**
 * Attachment bytes, keyed by absolute path: the Home record's draft-stage
 * directory and each chat's own. Content-addressed, so a Map is the whole store.
 */
const attachmentFiles = new Map<string, Uint8Array<ArrayBuffer>>();
const isAttachmentPath = (path: string): boolean => path.includes('/attachments/');
const mockWriteAttachment = vi.fn(async (path: string, bytes: Uint8Array<ArrayBuffer>) => {
  attachmentFiles.set(path, bytes);
});
const readAttachment = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = attachmentFiles.get(path);
  if (bytes === undefined) {
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  }
  return bytes;
};
const mockWriteFile = vi.fn(async (_path: string, bytes: Uint8Array<ArrayBuffer>) => {
  phaseOrder.push('manifest');
  manifestBytes = bytes;
});
/** Contents of `<project>/.tau/library.json`; `undefined` means the file is absent. */
let libraryFileContent: string | undefined;
const libraryFilePath = `/projects/${fakeProject.id}/.tau/library.json`;
const mockReadFile = vi.fn(async (path: string, _encoding?: 'utf8') => {
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
const mockAdoptProjectDirectory = vi.fn<FileManagerProxy['adoptProjectDirectory']>(async () => fakeProject);

/** Worker change-channel double: one live subscription per event channel. */
type WorkerChangeSubscription = {
  readonly interestedIn: (path: string) => boolean;
  readonly handler: (event: { readonly path: string }) => void;
};
const workerChangeSubscriptions = new Map<string, WorkerChangeSubscription>();
const subscribeWorkerChannel = (channel: string) =>
  vi.fn((subscription: WorkerChangeSubscription) => {
    workerChangeSubscriptions.set(channel, subscription);
    return () => workerChangeSubscriptions.delete(channel);
  });
const nativeWatches = new Set<(event: WatchEvent) => void>();
const mockWorkerChangeChannel = {
  watchReady: (_request: WatchRequest, listener: (event: WatchEvent) => void) => {
    nativeWatches.add(listener);
    return {
      ready: Promise.resolve(),
      closed: new Promise<void>(() => {
        /* This watch stays open until fixture disposal. */
      }),
      dispose: () => {
        nativeWatches.delete(listener);
      },
    };
  },
  onFileWritten: subscribeWorkerChannel('fileWritten'),
  onFileDeleted: subscribeWorkerChannel('fileDeleted'),
  onFileRenamed: subscribeWorkerChannel('fileRenamed'),
  onDirectoryCreated: subscribeWorkerChannel('directoryCreated'),
  onDirectoryDeleted: subscribeWorkerChannel('directoryDeleted'),
  onDirectoryRenamed: subscribeWorkerChannel('directoryRenamed'),
  onDirectoryChanged: subscribeWorkerChannel('directoryChanged'),
};
const emitWorkerChange = (channel: string, path: string): void => {
  for (const listener of nativeWatches) {
    listener({ type: channel.includes('Deleted') ? 'delete' : 'change', path });
  }
  const subscription = workerChangeSubscriptions.get(channel);
  if (subscription?.interestedIn(path)) {
    subscription.handler({ path });
  }
};

/**
 * The Home workspace's composer records, keyed by absolute path (blueprint
 * D11). A Map is enough: only deletion reads them here, and what it must never
 * do is take a path it was not asked for.
 */
const composerFiles = new Map<string, string>();
const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
const mockRmdir = vi.fn(async (path: string, options?: { recursive?: boolean }) => {
  const contained = [...composerFiles.keys()].filter((entry) => entry.startsWith(`${path}/`));
  if (contained.length === 0) {
    throw notFound(path);
  }
  if (options?.recursive !== true) {
    throw Object.assign(new Error(`ENOTEMPTY: ${path}`), { code: 'ENOTEMPTY' });
  }
  for (const entry of contained) {
    composerFiles.delete(entry);
  }
});

const recordWatch: ReturnType<typeof useFileManager>['watchRecordFile'] = (absolute, listener) => {
  const { root } = rootedPathOf(absolute);
  return mockWorkerChangeChannel.watchReady({ paths: [absolute], recursive: true }, (event) => {
    if (event.type === 'reset') {
      listener(event);
    } else if (event.type !== 'rename' && event.path.startsWith(`${root}/`)) {
      listener({ ...event, path: event.path.slice(root.length + 1) });
    }
  });
};
const mockWatchRecordFile = vi.fn(recordWatch);
const mockFileManager = {
  workerChangeChannel: mockWorkerChangeChannel,
  watchRecordFile: mockWatchRecordFile,
  /* Content reaches the root that owns the path (W12); the authority-global
   * surface below it is topology only (charter D5). */
  recordFiles: {
    writeFiles: mockWriteFiles,
    writeFile: async (path: string, bytes: Uint8Array<ArrayBuffer>) =>
      isAttachmentPath(path) ? mockWriteAttachment(path, bytes) : mockWriteFile(path, bytes),
    readFile: async (path: string, encoding?: 'utf8') =>
      isAttachmentPath(path) ? readAttachment(path) : mockReadFile(path, encoding),
    stat: mockStat,
    exists: vi.fn(async (path: string) => attachmentFiles.has(path)),
    rmdir: mockRmdir,
  },
  client: {
    listProjectManifests: mockListProjectManifests,
    adoptProjectDirectory: mockAdoptProjectDirectory,
    permanentlyDeleteProjectDirectory: mockPermanentlyDeleteProjectDirectory,
    commitPendingProjectDirectory: mockCommitPendingProjectDirectory,
  },
  workspace: { syncProjectRoots: mockSyncProjectRoots },
};
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => mockFileManager }));

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
const mockListWorkspaces = vi.fn<
  () => Promise<Array<{ workspaceId: string; name?: string; slug?: string; path?: string }>>
>(async () => []);
const mockPinHomeStorageBackend = vi.fn(async (backend: 'indexeddb' | 'opfs') => backend);
const mockCreateWorkspaceConnection = vi.fn(async (handle: FileSystemDirectoryHandle) => ({
  workspaceId: 'wsp_live',
  name: handle.name,
  slug: 'workshop',
  lastConnectedAt: 1,
  minted: true,
}));
const nodeWorkspacePath = '/Users/tester/Projects/Workshop';
const mockCreateNodeWorkspace = vi.fn(async (path: string) => ({
  workspaceId: 'wsp_node',
  name: 'Workshop',
  slug: 'workshop',
  lastConnectedAt: 1,
  path,
  minted: true,
}));
const mockGetWorkspaceMetadata = vi.fn(async (_workspaceId: string) => undefined as unknown);
const mockRepairWorkspaceBindings = vi.fn(async () => ({
  repairedProjectCount: 1,
  removedWorkspaceIds: ['wsp_disconnected'],
  skipped: [],
}));

vi.mock('#filesystem/handle-store.js', () => ({
  createWorkspace: mockCreateWorkspaceConnection,
  createNodeWorkspace: mockCreateNodeWorkspace,
  getWorkspaceMetadata: mockGetWorkspaceMetadata,
  isNodeWorkspace: (workspace: { path?: string }) => workspace.path !== undefined,
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
      return { backend: 'webaccess', handle };
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
    fileSidebars: {},
    graphicsBackendPreferences: {},
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
  readonly attachmentSource?: string;
  readonly chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'>;
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
const mockResumeResources = vi.fn(async (): Promise<readonly Chat[]> => {
  phaseOrder.push('resources');
  return [];
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
const mockGenerateProjectName = vi.fn<(input: ProjectNameInput) => Promise<string>>(async (_input) => {
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
};
const mockTouchChatRecency = vi.fn<(chatId: string, activityAt: number) => Promise<Chat | undefined>>(
  async () => activityChat,
);
const mockPatchChat = vi.fn(async () => ({ ...activityChat, name: 'Patched' }));
const mockTouchProjectActivity = vi.fn(async (projectId: string, activityAt?: number) => ({
  projectId,
  lastActivityAt: activityAt ?? 10,
}));

/* A chat is files, not an object-store row (W17): the chat half of the manager
 * talks to `createChatFileStore`, so the doubles that used to sit on the worker
 * sit on the store. */
const mockPutChatRecord = vi.fn<(chat: Chat) => Promise<void>>(async () => undefined);
const mockInvalidateChatLog = vi.fn();
const mockReadChatRecords = vi.fn<(resourceId: string) => Promise<ChatRecord[]>>(async () => []);
vi.mock('#db/chat-file-storage.js', () => ({
  createChatFileStore: () => ({
    invalidateLog: mockInvalidateChatLog,
    touchChatRecency: mockTouchChatRecency,
    patchChat: mockPatchChat,
    putChatRecord: mockPutChatRecord,
    getChatsForResource: vi.fn(async () => []),
    getAllChats: vi.fn(async () => []),
    getChatRecordsForResource: mockReadChatRecords,
    getAllChatRecords: vi.fn(async () => []),
    getChat: vi.fn(async () => undefined),
    createChat: vi.fn(async () => activityChat),
    createNavigationRepairChat: vi.fn(async () => activityChat),
    updateChat: vi.fn(async () => undefined),
    applyGeneratedChatName: vi.fn(async () => undefined),
    consumeChatStartupRequest: vi.fn(async () => undefined),
    commitCancelledDraftRestore: vi.fn(async () => undefined),
    softDeleteChat: vi.fn(async () => undefined),
    deleteChat: vi.fn(async () => undefined),
  }),
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

const { ProjectManagerProvider, useProjectManager } = await import('#hooks/use-project-manager.js');
const { useChatRecords } = await import('#hooks/use-chat-records.js');
const { tauCloudIntent } = await import('#hooks/use-cloud-projects.js');

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

/** Store bytes where the Home composer would have, and return the draft's reference to them. */
const seedHomeAttachment = async (bytes: Uint8Array<ArrayBuffer>, mediaType: string, filename?: string) => {
  const hash = await sha256Bytes(bytes);
  const extension = mediaType === 'application/pdf' ? 'pdf' : 'png';
  attachmentFiles.set(`/.tau/composers/new-project/attachments/${hash}.${extension}`, bytes);
  return storedRef({ hash, mediaType, ...(filename === undefined ? {} : { filename }) });
};

describe('useProjectManager.createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    attachmentFiles.clear();
    phaseOrder.length = 0;
    manifestBytes = serializeProjectManifest(projectToManifest(fakeProject));
    mockIsFileSystemAccessSupported = false;
    mockPickerBackend = 'webaccess';
    mockGetWorkspaceMetadata.mockResolvedValue(undefined);
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
      mockReadFile,
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
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.tau/library.json')) {
        if (libraryFileContent === undefined) {
          throw new Error(`ENOENT: ${path}`);
        }
        return libraryFileContent;
      }
      return manifestBytes;
    });
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

  it.each(['acknowledged', 'rejected'] as const)(
    'should expose discovery and metadata watch failures through a %s retry registration',
    async (outcome) => {
      const first = Promise.withResolvers<void>();
      const second = Promise.withResolvers<void>();
      const retryReady = Promise.withResolvers<void>();
      const watch = vi.spyOn(mockWorkerChangeChannel, 'watchReady');
      watch
        .mockReturnValueOnce({ ready: Promise.resolve(), closed: first.promise, dispose: vi.fn() })
        .mockReturnValueOnce({ ready: Promise.resolve(), closed: second.promise, dispose: vi.fn() })
        .mockReturnValueOnce({
          ready: retryReady.promise,
          closed: new Promise<void>(() => {
            /* Keep the acknowledged watch open until disposal. */
          }),
          dispose: vi.fn(),
        })
        .mockReturnValueOnce({
          ready: retryReady.promise,
          closed: new Promise<void>(() => {
            /* Keep the acknowledged watch open until disposal. */
          }),
          dispose: vi.fn(),
        });
      const view = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
      await act(async () => {
        first.reject(new Error('Discovery disconnected'));
        second.reject(new Error('Metadata disconnected'));
      });
      await waitFor(() => {
        expect(view.result.current.discoveryObservationError).toBe('Observation connection closed.');
        expect(view.result.current.metadataObservationError).toBe('Observation connection closed.');
      });
      const registrations = watch.mock.calls.length;
      act(() => {
        view.result.current.refreshFilesystemObservations();
      });
      await waitFor(() => {
        expect(watch.mock.calls.length).toBe(registrations + 2);
      });
      expect(view.result.current.discoveryObservationError).toBe('Observation connection closed.');
      expect(view.result.current.metadataObservationError).toBe('Observation connection closed.');
      await act(async () => {
        if (outcome === 'acknowledged') {
          retryReady.resolve();
        } else {
          retryReady.reject(new Error('Retry acknowledgement refused'));
        }
      });
      await waitFor(() => {
        if (outcome === 'acknowledged') {
          expect(view.result.current.discoveryObservationError).toBeUndefined();
          expect(view.result.current.metadataObservationError).toBeUndefined();
        } else {
          expect(view.result.current.discoveryObservationError).toBe('Error: Retry acknowledgement refused');
          expect(view.result.current.metadataObservationError).toBe('Error: Retry acknowledgement refused');
        }
      });
      view.unmount();
      watch.mockRestore();
    },
  );

  it('publishes connected-workspace projects into the one listing key before resolving', async () => {
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
    expect(queryClient.getQueryData<ProjectListing>(['projects'])?.projects).toEqual([
      expect.objectContaining({
        manifest: fakeProject,
        slugs: { workspaceSlug: 'workshop', projectSlug: 'test-project' },
      }),
    ]);
    expect(result.current.workspaceConnection).toMatchObject({ phase: 'ready', projectCount: 1 });
  });

  it('connects a folder picked as an absolute host path', async () => {
    mockIsFileSystemAccessSupported = true;
    mockPickerBackend = 'node';
    const nodeLocator: ProjectLocator = {
      backend: 'node',
      storageRootKey: `node:${nodeWorkspacePath}`,
      relativeDirectory: 'test-project',
      path: nodeWorkspacePath,
    };
    mockListProjectManifests.mockResolvedValue({
      roots: [{ status: 'complete', root: { backend: 'node', path: nodeWorkspacePath } }],
      entries: [{ status: 'valid', manifest: fakeProject, locator: nodeLocator }],
    });
    mockListWorkspaces.mockResolvedValue([
      { workspaceId: 'wsp_node', name: 'Workshop', slug: 'workshop', path: nodeWorkspacePath },
    ]);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    let connected: ConnectedWorkspace | undefined;
    await act(async () => {
      connected = await result.current.connectWorkspace();
    });

    expect(mockCreateNodeWorkspace).toHaveBeenCalledWith(nodeWorkspacePath);
    // A folder handed over by the native dialog has no permission to probe.
    expect(mockCheckHandlePermission).not.toHaveBeenCalled();
    expect(connected).toMatchObject({
      workspace: { workspaceId: 'wsp_node', name: 'Workshop', path: nodeWorkspacePath },
      projectCount: 1,
      minted: true,
    });
    expect(result.current.workspaceConnection).toMatchObject({ phase: 'ready', projectCount: 1 });
    // The discovered project is routed at the picked root, not at Home.
    expect(mockApplyProjectFileSystemConfigChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        upserts: [
          {
            projectId: fakeProject.id,
            backend: 'node',
            path: nodeWorkspacePath,
            providerBasePath: 'test-project',
          },
        ],
      }),
    );
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

  it('reuses bootstrap discovery for route access and refreshes after a manifest change', async () => {
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
      status: 'ready',
      project: fakeProject,
    });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'ready' });
    expect(mockListProjectManifests).toHaveBeenCalledOnce();

    mockListProjectManifests.mockResolvedValue({ roots: [], entries: [] });
    emitWorkerChange('fileDeleted', '/test-project/tau.json');
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'missing' });

    expect(mockGetPendingProjectOperations).toHaveBeenCalledOnce();
    expect(mockListProjectManifests).toHaveBeenCalledTimes(2);
  });

  it('waits for a journaled project route before reading its manifest', async () => {
    let resolveCommit!: () => void;
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    mockCommitPendingProjectDirectory.mockImplementationOnce(
      async () =>
        new Promise<{ status: 'committed' }>((resolve) => {
          resolveCommit = () => {
            resolve({ status: 'committed' });
          };
        }),
    );
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/tau.json') && !phaseOrder.includes('roots')) {
        throw new Error('ROOT_UNAVAILABLE');
      }
      return manifestBytes;
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const project = result.current.getProject(fakeProject.id);
    await vi.waitFor(() => {
      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledOnce();
    });
    resolveCommit();

    await expect(project).resolves.toEqual(fakeProject);
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

  describe('tau.json failure recovery', () => {
    const copyLocator: ProjectLocator = { ...fakeLocator, relativeDirectory: 'test-project-copy' };
    const boundToOriginal: ProjectFileSystemConfig = {
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: fakeLocator.relativeDirectory,
    };
    const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

    /* A Finder copy must not brick the original: the route binding names it (R7). */
    it('keeps the directory its route binds open when a copy of it appears', async () => {
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([boundToOriginal]);
      mockListProjectManifests.mockResolvedValue({
        roots: [{ status: 'complete', root: { backend: 'opfs' } }],
        entries: [
          { status: 'duplicate-id', manifest: fakeProject, locator: fakeLocator },
          { status: 'duplicate-id', manifest: fakeProject, locator: copyLocator },
        ],
      });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'ready' });
      const listing = await result.current.getProjectListing();
      expect(listing.conflicts).toEqual([{ status: 'duplicate-id', manifest: fakeProject, locator: copyLocator }]);
    });

    it('rebinds a duplicated id to the folder a person chooses and writes no project file', async () => {
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([boundToOriginal]);
      mockListProjectManifests.mockResolvedValue({
        roots: [{ status: 'complete', root: { backend: 'opfs' } }],
        entries: [
          { status: 'duplicate-id', manifest: fakeProject, locator: fakeLocator },
          { status: 'duplicate-id', manifest: fakeProject, locator: copyLocator },
        ],
      });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await result.current.chooseProjectDirectory(copyLocator, fakeProject.id);

      expect(mockSetProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith({
        projectId: fakeProject.id,
        backend: 'opfs',
        providerBasePath: copyLocator.relativeDirectory,
      });
      expect(mockSyncProjectRoots).toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      await expect(
        result.current.chooseProjectDirectory({ ...fakeLocator, relativeDirectory: 'elsewhere' }, fakeProject.id),
      ).rejects.toThrow('This folder no longer holds that project.');
    });

    it('restores the id a route last bound when adopting its identity-less directory', async () => {
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([boundToOriginal]);
      mockListProjectManifests.mockResolvedValue({
        roots: [{ status: 'complete', root: { backend: 'opfs' } }],
        entries: [
          {
            status: 'adoption-required',
            manifest: {
              $schema: fakeProject.$schema,
              name: 'test-project',
              description: '',
              tags: [],
              assets: fakeProject.assets,
            },
            locator: fakeLocator,
            issue: { code: 'manifest-missing' },
          },
        ],
      });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await result.current.adoptProject(fakeLocator);

      expect(mockAdoptProjectDirectory).toHaveBeenCalledExactlyOnceWith(fakeLocator, { id: fakeProject.id });
    });

    it('mints a fresh id on adoption when another directory now claims the remembered one', async () => {
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([boundToOriginal]);
      mockListProjectManifests.mockResolvedValue({
        roots: [{ status: 'complete', root: { backend: 'opfs' } }],
        entries: [
          {
            status: 'adoption-required',
            manifest: {
              $schema: fakeProject.$schema,
              name: 'test-project',
              description: '',
              tags: [],
              assets: fakeProject.assets,
            },
            locator: fakeLocator,
            issue: { code: 'manifest-missing' },
          },
          { status: 'valid', manifest: fakeProject, locator: copyLocator },
        ],
      });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await result.current.adoptProject(fakeLocator);

      expect(mockAdoptProjectDirectory).toHaveBeenCalledExactlyOnceWith(fakeLocator, undefined);
    });

    /* The incident bytes: an extra asset key beside an intact identity. */
    it('refuses to write over a degraded manifest until an explicit Repair canonicalizes it', async () => {
      mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
      manifestBytes = encode({ ...fakeProject, assets: { ...fakeProject.assets, second: { entryPath: 'second.cs' } } });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(result.current.getProject(fakeProject.id)).resolves.toEqual(fakeProject);
      await expect(result.current.updateProject(fakeProject.id, { name: 'Renamed' })).rejects.toThrow(
        'tau.json needs repair',
      );
      expect(mockWriteFile).not.toHaveBeenCalled();

      await expect(result.current.repairProject(fakeProject.id)).resolves.toEqual(fakeProject);
      expect(mockWriteFile).toHaveBeenCalledExactlyOnceWith(
        `/projects/${fakeProject.id}/tau.json`,
        serializeProjectManifest(fakeProject),
      );
    });

    it('offers no Repair for a JSON syntax error, whose defaults would erase recoverable text', async () => {
      mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
      manifestBytes = new TextEncoder().encode(
        `{"$schema": "${fakeProject.$schema}", "id": "${fakeProject.id}", "name": "Test",`,
      );
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(result.current.repairProject(fakeProject.id)).rejects.toThrow('not valid JSON');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
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

  it('bounds actual metadata I/O across Query cancellation and drains one latest trailing read', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const { result } = renderHook(() => useProjectManager(), { wrapper });
    const replies: Array<ReturnType<typeof Promise.withResolvers<ChatRecord[]>>> = [];
    let active = 0;
    let maxActive = 0;
    mockReadChatRecords.mockImplementation(async () => {
      const reply = Promise.withResolvers<ChatRecord[]>();
      replies.push(reply);
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await reply.promise;
      } finally {
        active--;
      }
    });
    const key = ['chats', 'p', 'records', 'held-owner'];
    const query = new QueryObserver(queryClient, {
      queryKey: key,
      queryFn: async ({ signal }) => {
        const records = await result.current.getChatRecordsForResource('p');
        signal.throwIfAborted();
        return records;
      },
    });
    const values: Array<ChatRecord[] | undefined> = [];
    const unsubscribe = query.subscribe((snapshot) => {
      values.push(snapshot.data);
    });
    const record = (name: string): ChatRecord => ({ id: 'c', resourceId: 'p', name, createdAt: 1, updatedAt: 2 });
    try {
      await waitFor(() => {
        expect(replies).toHaveLength(1);
      });
      await act(async () => {
        replies[0]!.resolve([record('Seed')]);
      });
      await waitFor(() => {
        expect(queryClient.getQueryData<ChatRecord[]>(key)?.[0]?.name).toBe('Seed');
      });
      act(() => {
        emitWorkerChange('fileWritten', '/projects/p/.tau/chats/c/chat.json');
      });
      await waitFor(() => {
        expect(replies).toHaveLength(2);
      });
      for (let tick = 0; tick < 5; tick++) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Separate event turns reproduce cancellation before non-abortable metadata bytes settle.
        await act(async () => {
          emitWorkerChange('fileWritten', '/projects/p/.tau/chats/c/chat.json');
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        });
      }
      expect(replies).toHaveLength(2);
      expect(active).toBe(1);
      expect(maxActive).toBe(1);
      expect(queryClient.getQueryData<ChatRecord[]>(key)?.[0]?.name).toBe('Seed');
      await act(async () => {
        replies[1]!.resolve([record('Canceled stale bytes')]);
      });
      await waitFor(() => {
        expect(replies).toHaveLength(3);
      });
      expect(values.some((records) => records?.[0]?.name === 'Canceled stale bytes')).toBe(false);
      await act(async () => {
        replies[2]!.resolve([record('Latest')]);
      });
      await waitFor(() => {
        expect(queryClient.getQueryData<ChatRecord[]>(key)?.[0]?.name).toBe('Latest');
      });
      expect(maxActive).toBe(1);
      expect(mockReadChatRecords).toHaveBeenCalledTimes(3);
    } finally {
      for (const reply of replies) {
        reply.resolve([]);
      }
      unsubscribe();
      queryClient.clear();
      mockReadChatRecords.mockImplementation(async () => []);
    }
  });

  it('awaits held discovery refetch work and drains one trailing burst', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const held = Promise.withResolvers<void>();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async (filter) => {
      if (filter?.queryKey?.[0] === 'projects') {
        await held.promise;
      }
    });
    renderHook(() => useProjectManager(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      emitWorkerChange('fileWritten', '/first/tau.json');
    });
    await waitFor(() => {
      expect(invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'projects')).toHaveLength(1);
    });
    for (let index = 0; index < 8; index++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Distinct event turns must occur while the real refetch remains held.
      await act(async () => {
        emitWorkerChange('fileWritten', `/later-${index}/tau.json`);
        await Promise.resolve();
      });
    }
    expect(invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'projects')).toHaveLength(1);
    await act(async () => {
      held.resolve();
    });
    await waitFor(() => {
      expect(invalidate.mock.calls.filter(([filter]) => filter?.queryKey?.[0] === 'projects')).toHaveLength(2);
    });
  });

  it('invalidates chat metadata precisely while keeping local and foreign logs separate', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useProjectManager(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      emitWorkerChange('fileWritten', '/projects/p/.tau/chats/c/chat.json');
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chat', 'c'] }, { cancelRefetch: false });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chats', 'p'] }, { cancelRefetch: false });
    invalidate.mockClear();
    await act(async () => {
      emitWorkerChange('fileWritten', '/projects/p/.tau/chats/c/events/local.jsonl');
      emitWorkerChange('fileWritten', '/projects/p/.tau/chats/c/events/foreign.jsonl');
      await Promise.resolve();
    });
    expect(invalidate).not.toHaveBeenCalled();
    act(() => {
      for (const listener of nativeWatches) {
        listener({ type: 'reset' });
      }
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chats'] }, { cancelRefetch: false });
    });
  });

  it('should observe project chat metadata through its actual captured mount while Home remains isolated', async () => {
    const registry = new ProviderRegistry();
    const scope = { backend: 'memory', storageRootKey: 'memory:project-metadata-observation' } as const;
    const provider = await registry.getProvider(scope);
    const mounts = new MountTable();
    mounts.mount('/', provider, { class: 'authored', ...scope });
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable: mounts,
    });
    await service.configureProjectRoots({
      projects: [{ projectId: fakeProject.id, ...scope, providerBasePath: 'physical-metadata-project' }],
      roots: [],
    });
    const home = service.createRootedFileSystem('/');
    const project = service.createRootedFileSystem(`/projects/${fakeProject.id}`);
    const homeEvents: WatchEvent[] = [];
    const projectEvents: WatchEvent[] = [];
    const stopHome = home.watch({ paths: [''], recursive: true }, (event) => homeEvents.push(event));
    const stopProject = project.watch({ paths: [''], recursive: true }, (event) => projectEvents.push(event));
    const closed = new Promise<void>(() => {
      /* The fixture keeps the acknowledged watch open. */
    });
    const rootWatch = vi.spyOn(mockWorkerChangeChannel, 'watchReady').mockImplementation((request, listener) => ({
      ready: Promise.resolve(),
      closed,
      dispose: home.watch(request, listener),
    }));
    mockWatchRecordFile.mockImplementation((absolute, listener, options) => {
      const { root, path } = rootedPathOf(absolute);
      return {
        ready: Promise.resolve(),
        closed,
        dispose: service.createRootedFileSystem(root).watch({ paths: [path], ...options }, listener),
      };
    });
    const { wrapper, queryClient } = createInspectableWrapper();
    queryClient.setQueryData<ProjectListing>(['projects'], {
      projects: [
        { manifest: fakeProject, library: { projectId: fakeProject.id, lastActivityAt: 1 }, locator: fakeLocator },
      ],
      conflicts: [],
      recoveries: [],
      workspaceBindingRepairs: [],
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const view = renderHook(() => useProjectManager(), { wrapper });
    try {
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await project.writeFile('.tau/chats/c/chat.json', '{"name":"Current metadata"}');
      });
      await waitFor(() => {
        expect(projectEvents).toContainEqual({ type: 'change', path: '.tau/chats/c/chat.json' });
      });
      expect(homeEvents).toEqual([]);
      expect(
        new TextDecoder().decode(await provider.readFile('physical-metadata-project/.tau/chats/c/chat.json')),
      ).toBe('{"name":"Current metadata"}');
      await waitFor(() => {
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chat', 'c'] }, { cancelRefetch: false });
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chats', fakeProject.id] }, { cancelRefetch: false });
    } finally {
      view.unmount();
      stopHome();
      stopProject();
      rootWatch.mockRestore();
      mockWatchRecordFile.mockImplementation(recordWatch);
      queryClient.clear();
      service.dispose();
    }
  });

  it.each(['initial', 'added'] as const)(
    'should hold metadata reads until the %s project watch acknowledges registration',
    async (membership) => {
      const ready = Promise.withResolvers<void>();
      mockWatchRecordFile.mockReturnValue({
        ready: ready.promise,
        closed: new Promise<void>(() => {
          /* The fixture keeps the acknowledged watch open. */
        }),
        dispose: vi.fn(),
      });
      const { wrapper, queryClient } = createInspectableWrapper();
      const listing: ProjectListing = {
        projects: [
          { manifest: fakeProject, library: { projectId: fakeProject.id, lastActivityAt: 1 }, locator: fakeLocator },
        ],
        conflicts: [],
        recoveries: [],
        workspaceBindingRepairs: [],
      };
      queryClient.setQueryData<ProjectListing>(
        ['projects'],
        membership === 'initial' ? listing : { ...listing, projects: [] },
      );
      const view = renderHook(() => useProjectManager(), { wrapper });
      let pending: Promise<ChatRecord[]> | undefined;
      try {
        if (membership === 'added') {
          await act(async () => {
            await Promise.resolve();
          });
          expect(mockWatchRecordFile).not.toHaveBeenCalled();
          act(() => {
            queryClient.setQueryData<ProjectListing>(['projects'], listing);
          });
        }
        await waitFor(() => {
          expect(mockWatchRecordFile).toHaveBeenCalled();
        });
        act(() => {
          pending = view.result.current.getChatRecordsForResource(fakeProject.id);
        });
        await act(async () => {
          await Promise.resolve();
        });
        expect(mockReadChatRecords).not.toHaveBeenCalled();
        await act(async () => {
          ready.resolve();
          await pending;
        });
        expect(mockReadChatRecords).toHaveBeenCalledOnce();
      } finally {
        ready.resolve();
        await pending;
        view.unmount();
        queryClient.clear();
        mockWatchRecordFile.mockImplementation(recordWatch);
      }
    },
  );

  it.each(['held', 'failed'] as const)(
    'should keep healthy project metadata independent of a %s sibling watch',
    async (failure) => {
      const siblingReady = Promise.withResolvers<void>();
      let healthyListener: ((event: WatchEvent) => void) | undefined;
      mockWatchRecordFile.mockImplementation((path, listener) => {
        if (path.includes(fakeProject.id)) {
          healthyListener = listener;
        }
        return {
          ready: path.includes(unrelatedProject.id) ? siblingReady.promise : Promise.resolve(),
          closed: new Promise<void>(() => {
            /* The fixture keeps the acknowledged watch open. */
          }),
          dispose: vi.fn(),
        };
      });
      const { wrapper, queryClient } = createInspectableWrapper();
      queryClient.setQueryData<ProjectListing>(['projects'], {
        projects: [
          { manifest: fakeProject, library: { projectId: fakeProject.id, lastActivityAt: 1 }, locator: fakeLocator },
          {
            manifest: unrelatedProject,
            library: { projectId: unrelatedProject.id, lastActivityAt: 1 },
            locator: unrelatedLocator,
          },
        ],
        conflicts: [],
        recoveries: [],
        workspaceBindingRepairs: [],
      });
      const view = renderHook(() => useProjectManager(), { wrapper });
      let pending: Promise<ChatRecord[]> | undefined;
      try {
        await waitFor(() => {
          expect(mockWatchRecordFile).toHaveBeenCalledTimes(2);
        });
        if (failure === 'failed') {
          await act(async () => {
            siblingReady.reject(new Error('Sibling watch refused'));
          });
        }
        act(() => {
          pending = view.result.current.getChatRecordsForResource(fakeProject.id);
        });
        const settled = Promise.allSettled(pending ? [pending] : []);
        await waitFor(() => {
          expect(mockReadChatRecords).toHaveBeenCalledOnce();
        });
        await expect(pending).resolves.toEqual([]);
        await settled;
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        act(() => {
          healthyListener?.({ type: 'change', path: '.tau/chats/c/chat.json' });
        });
        await waitFor(() => {
          expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chats', fakeProject.id] }, { cancelRefetch: false });
        });
      } finally {
        siblingReady.resolve();
        view.unmount();
        await Promise.allSettled(pending ? [pending] : []);
        queryClient.clear();
        mockWatchRecordFile.mockImplementation(recordWatch);
      }
    },
  );

  it('keeps scoped chat health independent and retains its own fault through acknowledged retry', async () => {
    const siblingReady = Promise.withResolvers<void>();
    const healthyClosed = Promise.withResolvers<void>();
    const retryReady = Promise.withResolvers<void>();
    const open = new Promise<void>(() => {
      /* The remaining watches stay open until disposal. */
    });
    let healthyRegistrations = 0;
    mockWatchRecordFile.mockImplementation((path) => {
      if (path.includes(unrelatedProject.id)) {
        return { ready: siblingReady.promise, closed: open, dispose: vi.fn() };
      }
      healthyRegistrations++;
      return {
        ready: healthyRegistrations === 1 ? Promise.resolve() : retryReady.promise,
        closed: healthyRegistrations === 1 ? healthyClosed.promise : open,
        dispose: vi.fn(),
      };
    });
    const record: ChatRecord = {
      id: 'c',
      resourceId: fakeProject.id,
      name: 'Retained metadata',
      createdAt: 1,
      updatedAt: 2,
    };
    mockReadChatRecords.mockResolvedValue([record]);
    const { wrapper, queryClient } = createInspectableWrapper();
    queryClient.setQueryData<ProjectListing>(['projects'], {
      projects: [
        { manifest: fakeProject, library: { projectId: fakeProject.id, lastActivityAt: 1 }, locator: fakeLocator },
        {
          manifest: unrelatedProject,
          library: { projectId: unrelatedProject.id, lastActivityAt: 1 },
          locator: unrelatedLocator,
        },
      ],
      conflicts: [],
      recoveries: [],
      workspaceBindingRepairs: [],
    });
    const view = renderHook(
      () => ({
        manager: useProjectManager(),
        records: useChatRecords(fakeProject.id),
      }),
      { wrapper },
    );
    let pendingRetry: Promise<unknown> | undefined;
    try {
      await waitFor(() => {
        expect(view.result.current.records.chats).toEqual([record]);
      });
      await act(async () => {
        siblingReady.reject(new Error('Sibling watch refused'));
      });
      await waitFor(() => {
        expect(view.result.current.manager.metadataObservationError).toContain('Sibling watch refused');
      });
      expect(view.result.current.records.error).toBeUndefined();
      await act(async () => {
        healthyClosed.resolve();
      });
      await waitFor(() => {
        expect(view.result.current.records.error).toBe('Observation connection closed.');
      });
      expect(view.result.current.records.chats).toEqual([record]);
      act(() => {
        pendingRetry = view.result.current.records.retry();
      });
      await waitFor(() => {
        expect(healthyRegistrations).toBe(2);
      });
      expect(view.result.current.records.error).toBe('Observation connection closed.');
      await act(async () => {
        retryReady.resolve();
        await pendingRetry;
      });
      await waitFor(() => {
        expect(view.result.current.records.error).toBeUndefined();
      });
      expect(view.result.current.records.chats).toEqual([record]);
      expect(view.result.current.manager.metadataObservationError).toContain('Sibling watch refused');
    } finally {
      siblingReady.resolve();
      retryReady.resolve();
      view.unmount();
      await Promise.allSettled(pendingRetry ? [pendingRetry] : []);
      queryClient.clear();
      mockWatchRecordFile.mockImplementation(recordWatch);
      mockReadChatRecords.mockImplementation(async () => []);
    }
  });

  it('should observe an explicit project before the project inventory is populated', async () => {
    const ready = Promise.withResolvers<void>();
    mockWatchRecordFile.mockReturnValue({
      ready: ready.promise,
      closed: new Promise<void>(() => {
        /* The fixture keeps the acknowledged watch open. */
      }),
      dispose: vi.fn(),
    });
    const { wrapper, queryClient } = createInspectableWrapper();
    const view = renderHook(() => useProjectManager(), { wrapper });
    let pending: Promise<ChatRecord[]> | undefined;
    try {
      act(() => {
        pending = view.result.current.getChatRecordsForResource(fakeProject.id);
      });
      await waitFor(() => {
        expect(mockWatchRecordFile).toHaveBeenCalledWith(
          `/projects/${fakeProject.id}/.tau/chats`,
          expect.any(Function),
          { recursive: true },
        );
      });
      expect(mockReadChatRecords).not.toHaveBeenCalled();
      await act(async () => {
        ready.resolve();
        await pending;
      });
      expect(mockReadChatRecords).toHaveBeenCalledOnce();
    } finally {
      ready.resolve();
      view.unmount();
      await Promise.allSettled(pending ? [pending] : []);
      queryClient.clear();
      mockWatchRecordFile.mockImplementation(recordWatch);
    }
  });

  it('should reject a held metadata read when its provider unmounts', async () => {
    const ready = Promise.withResolvers<void>();
    mockWatchRecordFile.mockReturnValue({
      ready: ready.promise,
      closed: new Promise<void>(() => {
        /* The fixture keeps the acknowledged watch open. */
      }),
      dispose: vi.fn(),
    });
    const { wrapper, queryClient } = createInspectableWrapper();
    queryClient.setQueryData<ProjectListing>(['projects'], {
      projects: [
        { manifest: fakeProject, library: { projectId: fakeProject.id, lastActivityAt: 1 }, locator: fakeLocator },
      ],
      conflicts: [],
      recoveries: [],
      workspaceBindingRepairs: [],
    });
    const view = renderHook(() => useProjectManager(), { wrapper });
    try {
      await waitFor(() => {
        expect(mockWatchRecordFile).toHaveBeenCalled();
      });
      const pending = view.result.current.getChatRecordsForResource(fakeProject.id);
      const refused = expect(pending).rejects.toThrow('Chat observation was disposed.');
      view.unmount();
      await refused;
      expect(mockReadChatRecords).not.toHaveBeenCalled();
    } finally {
      ready.resolve();
      view.unmount();
      queryClient.clear();
      mockWatchRecordFile.mockImplementation(recordWatch);
    }
  });

  it('should forget a removed project whose old watch rejects after membership changes', async () => {
    const ready = Promise.withResolvers<void>();
    const dispose = vi.fn();
    mockWatchRecordFile.mockReturnValue({
      ready: ready.promise,
      closed: new Promise<void>(() => {
        /* The fixture keeps the acknowledged watch open. */
      }),
      dispose,
    });
    const { wrapper, queryClient } = createInspectableWrapper();
    queryClient.setQueryData<ProjectListing>(['projects'], {
      projects: [
        { manifest: fakeProject, library: { projectId: fakeProject.id, lastActivityAt: 1 }, locator: fakeLocator },
      ],
      conflicts: [],
      recoveries: [],
      workspaceBindingRepairs: [],
    });
    const view = renderHook(() => useProjectManager(), { wrapper });
    try {
      await waitFor(() => {
        expect(mockWatchRecordFile).toHaveBeenCalled();
      });
      await act(async () => {
        queryClient.setQueryData<ProjectListing>(['projects'], {
          projects: [],
          conflicts: [],
          recoveries: [],
          workspaceBindingRepairs: [],
        });
        ready.reject(new Error('Removed project registration refused'));
      });
      await waitFor(() => {
        expect(dispose).toHaveBeenCalledOnce();
      });
      expect(view.result.current.metadataObservationError).toBeUndefined();
    } finally {
      ready.resolve();
      view.unmount();
      queryClient.clear();
      mockWatchRecordFile.mockImplementation(recordWatch);
    }
  });

  it('ignores unrelated app-state writes and refreshes a project manifest change', async () => {
    const { wrapper, projectsInvalidations } = createCountingWrapper();
    renderHook(() => useProjectManager(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      emitWorkerChange('fileWritten', '/.tau/workspace.json');
      emitWorkerChange('fileWritten', '/test-project/.tau/library.json');
      emitWorkerChange('fileWritten', '/test-project/main.ts');
    });
    expect(projectsInvalidations()).toBe(0);
    act(() => {
      emitWorkerChange('fileWritten', '/test-project/tau.json');
    });
    await waitFor(() => {
      expect(projectsInvalidations()).toBeGreaterThan(0);
    });
  });

  it('leaves foreign log observation to the retained chat store', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useProjectManager(), { wrapper });

    act(() => {
      emitWorkerChange('fileWritten', `/projects/${fakeProject.id}/.tau/chats/chat_remote/events/device-b.jsonl`);
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(mockInvalidateChatLog).not.toHaveBeenCalled();
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

  it('applies cross-tab route changes and coalesces their refetch', async () => {
    const { wrapper, projectsInvalidations } = createCountingWrapper();
    renderHook(() => useProjectManager(), { wrapper });

    await act(async () => {
      projectRootConfigurationListener?.();
      await Promise.resolve();
    });
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();

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

  it('uses an explicit listing refresh to revoke a formerly valid route', async () => {
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'ready' });

    mockListProjectManifests.mockResolvedValue({ roots: [], entries: [] });
    await result.current.getProjectListing();
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'missing' });
    expect(mockListProjectManifests).toHaveBeenCalledTimes(2);
  });

  it.each([
    { change: 'fileDeleted', path: '/test-project/tau.json', next: { roots: [], entries: [] }, status: 'missing' },
    {
      change: 'fileWritten',
      path: '/test-project-copy/tau.json',
      next: {
        roots: validProjectDiscovery.roots,
        entries: [
          { status: 'duplicate-id', manifest: fakeProject, locator: fakeLocator },
          {
            status: 'duplicate-id',
            manifest: fakeProject,
            locator: { ...fakeLocator, relativeDirectory: 'test-project-copy' },
          },
        ],
      },
      status: 'conflict',
    },
  ] as const)('does not admit a stale in-flight route after $change', async ({ change, path, next, status }) => {
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'ready' });

    const staleScan = Promise.withResolvers<void>();
    const scanStarted = Promise.withResolvers<void>();
    mockListProjectManifests
      .mockImplementationOnce(async () => {
        scanStarted.resolve();
        await staleScan.promise;
        return validProjectDiscovery;
      })
      .mockResolvedValue(next);
    const listing = result.current.getProjectListing();
    await scanStarted.promise;
    act(() => {
      emitWorkerChange(change, path);
    });
    const route = result.current.getProjectRouteAccess(fakeProject.id);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    staleScan.resolve();

    await listing;
    await expect(route).resolves.toMatchObject({ status });
    expect(mockListProjectManifests).toHaveBeenCalledTimes(3);
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

  /*
   * P66: the route gate re-reads access whenever the manager's value moves
   * (`project-route.tsx` deps its access effect on `projectManager`), so a
   * recovery that settles after the first render has to move that value — by
   * being carried in it, never by a revision counter in a dependency array the
   * React Compiler erases.
   */
  it('re-reads route access when a recovery settles after the first render', async () => {
    let failCommit!: () => void;
    mockGetPendingProjectOperations.mockResolvedValue([pendingCreate]);
    mockCommitPendingProjectDirectory.mockImplementationOnce(
      async () =>
        new Promise<{ status: 'committed' }>((_resolve, reject) => {
          failCommit = () => {
            reject(new Error('write failed'));
          };
        }),
    );
    const seen: Array<string | undefined> = [];
    const published: string[][] = [];
    function Gate(): ReactNode {
      const projectManager = useProjectManager();
      const [status, setStatus] = useState<string>();
      useEffect(() => {
        let cancelled = false;
        const loadAccess = async (): Promise<void> => {
          const access = await projectManager.getProjectRouteAccess(fakeProject.id);
          if (!cancelled) {
            setStatus(access.status);
          }
        };
        // async-iife: bootstrap -- the route gate reads access exactly this way.
        void loadAccess();
        return () => {
          cancelled = true;
        };
      }, [projectManager]);
      seen.push(status);
      published.push(projectManager.recoveries.map((recovery) => recovery.status));
      return null;
    }

    await act(async () => {
      render(createElement(createWrapper(), undefined, createElement(Gate)));
    });

    await waitFor(() => {
      expect(seen.at(-1)).toBe('recovering');
    });
    expect(published.at(-1)).toEqual(['recovering']);
    await act(async () => {
      failCommit();
    });
    await waitFor(() => {
      expect(seen.at(-1)).toBe('recovery-failed');
    });
    expect(published.at(-1)).toEqual(['failed']);
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
      /* The attempt hands its bytes over: the bridge transfers them instead of copying the import. */
      [consumableBytes]: true,
    });
    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: pendingCreate.providerBasePath,
    });
    expect(phaseOrder).toEqual(['pending', 'commit', 'locator', 'roots', 'resources', 'complete', 'preference']);
    expect(mockGetProjectCreationLocation).not.toHaveBeenCalled();
    expect(mockSetProjectCreationLocation).toHaveBeenCalledWith({ kind: 'home' });
  });

  it('waits for pre-commit discovery before publishing a new project to an immediate route', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const { result } = renderHook(
      () => {
        const projectManager = useProjectManager();
        const listing = useQuery({
          queryKey: ['projects', { includeDeleted: true }],
          queryFn: async () => projectManager.getProjectListing({ includeDeleted: true }),
        });
        return { projectManager, listing };
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.listing.data?.projects).toEqual([]);
    });
    mockListProjectManifests.mockClear();

    let startCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      startCommit = resolve;
    });
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    let committed = false;
    mockCommitPendingProjectDirectory.mockImplementationOnce(async () => {
      startCommit();
      await commitGate;
      phaseOrder.push('commit');
      committed = true;
      return { status: 'committed' } as const;
    });
    let startPreCommitDiscovery!: () => void;
    const preCommitDiscoveryStarted = new Promise<void>((resolve) => {
      startPreCommitDiscovery = resolve;
    });
    let releasePreCommitDiscovery!: () => void;
    const preCommitDiscoveryGate = new Promise<void>((resolve) => {
      releasePreCommitDiscovery = resolve;
    });
    let holdPreCommitDiscovery = false;
    mockListProjectManifests.mockImplementation(async () => {
      const entries = committed ? validProjectDiscovery.entries : [];
      if (holdPreCommitDiscovery && !committed) {
        startPreCommitDiscovery();
        await preCommitDiscoveryGate;
      }
      return { roots: validProjectDiscovery.roots, entries };
    });
    let created: Awaited<ReturnType<typeof result.current.projectManager.createProject>> | undefined;
    const creation = result.current.projectManager.createProject({
      project: fakeProject,
      files: pendingCreate.files,
      location: { kind: 'home' },
    });
    await commitStarted;
    holdPreCommitDiscovery = true;
    const preCommitListing = result.current.projectManager.getProjectListing({ includeDeleted: true });
    await preCommitDiscoveryStarted;
    releaseCommit();
    await waitFor(() => {
      expect(committed).toBe(true);
    });
    releasePreCommitDiscovery();
    await act(async () => {
      [created] = await Promise.all([creation, preCommitListing]);
    });

    expect(created?.slugs).toEqual({ workspaceSlug: 'home', projectSlug: 'test-project' });
    expect(mockListProjectManifests).toHaveBeenCalledTimes(3);
    const published = queryClient.getQueryData<ProjectListing>(['projects', { includeDeleted: true }])?.projects;
    expect(published).toHaveLength(1);
    expect(published?.[0]?.manifest.id).toBe(created?.id);
    expect(published?.[0]?.slugs).toEqual({ workspaceSlug: 'home', projectSlug: 'test-project' });
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

  // Rewritten (W6): the startup message carries stored references; naming
  // still receives image bytes, resolved from the Home draft directory.
  it('resolves a semantic multimodal name before allocating durable project work', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const image = await seedHomeAttachment(png, 'image/png');
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        kernel: 'openscad',
        initialMessage: { content: '', attachments: [image] },
        location: { kind: 'home' },
      }),
    );

    const generatedRequest = mockGenerateProjectName.mock.calls.at(-1)?.[0];
    expect(typeof generatedRequest?.projectId).toBe('string');
    expect(generatedRequest).toMatchObject({
      text: '',
      imageUrls: [`data:image/png;base64,${uint8ArrayToBase64(png)}`],
    });
    const prepared = mockPrepareProjectCreation.mock.calls.at(-1)?.[0];
    expect(prepared?.manifest.name).toBe('Tall Birdhouse');
    expect(phaseOrder.indexOf('name')).toBeLessThan(phaseOrder.indexOf('pending'));
  });

  describe('Home draft attachment promotion', () => {
    const chatAttachments = `/projects/${fakeProject.id}/.tau/chats/cht_create/attachments`;

    /** The worker double, but keeping the chat the caller asked for — messages included. */
    const prepareWithChat = async (input: PrepareProjectCreationInput) => {
      phaseOrder.push('pending');
      const operation = { ...pendingCreate, chat: { ...pendingCreate.chat!, ...input.chat } };
      mockResumeResources.mockResolvedValueOnce([operation.chat]);
      return operation;
    };

    it.each(['commit', 'attachment', 'chat'] as const)(
      'should hold project creation until durable startup input settles at %s',
      async (phase) => {
        const bytes = new Uint8Array([1, 2, 3]);
        const image = await seedHomeAttachment(bytes, 'image/png');
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const hold = async (): Promise<void> => {
          entered.resolve();
          await release.promise;
        };
        mockPrepareProjectCreation.mockImplementationOnce(prepareWithChat);
        if (phase === 'commit') {
          mockCommitPendingProjectDirectory.mockImplementationOnce(async () => {
            await hold();
            return { status: 'committed' };
          });
        } else if (phase === 'attachment') {
          mockWriteAttachment.mockImplementationOnce(async (path, content) => {
            await hold();
            attachmentFiles.set(path, content);
          });
        } else {
          mockPutChatRecord.mockImplementationOnce(hold);
        }
        const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
        let completed = false;
        let creation: Promise<unknown> = Promise.resolve();
        await act(async () => {
          creation = result.current.createProject({
            kernel: 'openscad',
            initialMessage: { content: 'Build it', attachments: [image] },
            location: { kind: 'home' },
          });
          await entered.promise;
        });
        const completion = async (): Promise<void> => {
          await creation;
          completed = true;
        };
        const finished = completion();
        expect(completed).toBe(false);
        expect(mockCompletePending).not.toHaveBeenCalled();
        const startup = mockPrepareProjectCreation.mock.calls.at(-1)?.[0].chat.startupRequest;
        if (startup?.message === undefined) {
          throw new Error('Expected the prepared startup request to retain its durable message.');
        }
        expect(startup.messageId).toBe(startup.message.id);
        expect(startup.message.parts).toContainEqual({
          type: 'file',
          url: `attachments/${image.hash}.png`,
          mediaType: 'image/png',
        });
        if (phase === 'commit') {
          expect(mockResumeResources).not.toHaveBeenCalled();
        }
        if (phase !== 'chat') {
          expect(mockPutChatRecord).not.toHaveBeenCalled();
        }
        await act(async () => {
          release.resolve();
          await finished;
        });
        expect(completed).toBe(true);
        expect(mockCompletePending).toHaveBeenCalledWith(operationId);
        expect(attachmentFiles.get(`${chatAttachments}/${image.hash}.png`)).toEqual(bytes);
        expect(mockPutChatRecord.mock.calls.at(-1)?.[0]).toMatchObject({ startupRequest: startup });
      },
    );

    it('should recover a failed startup chat write without minting a second startup request', async () => {
      const image = await seedHomeAttachment(new Uint8Array([4, 5, 6]), 'image/png');
      let persisted = pendingCreate;
      mockPrepareProjectCreation.mockImplementationOnce(async (input) => {
        persisted = await prepareWithChat(input);
        return persisted;
      });
      mockPutChatRecord.mockRejectedValueOnce(new Error('chat storage unavailable'));
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
      await expect(
        act(async () =>
          result.current.createProject({
            kernel: 'openscad',
            initialMessage: { content: 'Build it', attachments: [image] },
            location: { kind: 'home' },
          }),
        ),
      ).rejects.toMatchObject({ name: 'PendingProjectRecoveryError', reason: 'local-state-error' });
      const startup = persisted.chat?.startupRequest;
      expect(startup).toBeDefined();
      expect(mockCompletePending).not.toHaveBeenCalled();
      mockGetPendingProjectOperations.mockResolvedValue([persisted]);
      mockResumeResources.mockResolvedValueOnce([persisted.chat!]);
      await act(async () => {
        await result.current.getProjectListing();
      });
      await vi.waitFor(() => {
        expect(mockCompletePending).toHaveBeenCalledWith(operationId);
      });
      expect(mockPrepareProjectCreation).toHaveBeenCalledOnce();
      expect(mockPutChatRecord).toHaveBeenCalledTimes(2);
      expect(mockPutChatRecord.mock.calls.map(([chat]) => chat.startupRequest?.id)).toEqual([startup?.id, startup?.id]);
    });

    it('copies every draft attachment into the new chat before its startup record is written', async () => {
      const image = await seedHomeAttachment(new Uint8Array([1, 2, 3]), 'image/png');
      const pdf = await seedHomeAttachment(new Uint8Array([37, 80, 68, 70]), 'application/pdf', 'spec.pdf');
      mockPrepareProjectCreation.mockImplementationOnce(prepareWithChat);
      const presentAtRecordWrite: string[] = [];
      mockPutChatRecord.mockImplementationOnce(async () => {
        presentAtRecordWrite.push(...[...attachmentFiles.keys()].filter((path) => path.startsWith(chatAttachments)));
      });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () =>
        result.current.createProject({
          kernel: 'openscad',
          initialMessage: { content: 'Build it', attachments: [image, pdf] },
          location: { kind: 'home' },
        }),
      );

      const startup = mockPrepareProjectCreation.mock.calls.at(-1)?.[0].chat.messages[0];
      const startupRequest = mockPrepareProjectCreation.mock.calls.at(-1)?.[0].chat.startupRequest;
      expect(startupRequest?.message).toEqual(startup);
      expect(startupRequest?.messageId).toBe(startup?.id);
      expect(startup?.parts).toEqual([
        { type: 'file', url: `attachments/${image.hash}.png`, mediaType: 'image/png' },
        { type: 'file', url: `attachments/${pdf.hash}.pdf`, mediaType: 'application/pdf', filename: 'spec.pdf' },
        { type: 'text', text: 'Build it' },
      ]);
      expect(JSON.stringify(startup)).not.toContain('data:');
      expect(presentAtRecordWrite.toSorted()).toEqual(
        [`${chatAttachments}/${image.hash}.png`, `${chatAttachments}/${pdf.hash}.pdf`].toSorted(),
      );
      expect(mockCompletePending).toHaveBeenCalledWith(operationId);
    });

    it('completes the copy when an operation persisted before it is resumed', async () => {
      const image = await seedHomeAttachment(new Uint8Array([4, 5, 6]), 'image/png');
      const startup: MyUIMessage = {
        id: 'msg_startup',
        role: 'user',
        parts: [{ type: 'file', url: `attachments/${image.hash}.png`, mediaType: 'image/png' }],
      };
      const persisted = {
        ...pendingCreate,
        chat: {
          ...pendingCreate.chat!,
          messages: [startup],
        },
      };
      mockGetPendingProjectOperations.mockResolvedValue([persisted]);
      mockResumeResources.mockResolvedValueOnce([persisted.chat]);
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
      await result.current.getProjectListing();

      await vi.waitFor(() => {
        expect(mockCompletePending).toHaveBeenCalledWith(operationId);
      });
      expect(attachmentFiles.has(`${chatAttachments}/${image.hash}.png`)).toBe(true);
      expect(mockPutChatRecord).toHaveBeenCalledWith(persisted.chat);
    });

    // New (W6, P39): the operation names its source, and resume copies from that directory only.
    it('records a surface source on the operation and copies from it', async () => {
      const bytes = new Uint8Array([10, 11]);
      const hash = await sha256Bytes(bytes);
      const source = '/.tau/composers/marketing/attachments';
      attachmentFiles.set(`${source}/${hash}.png`, bytes);
      mockPrepareProjectCreation.mockImplementationOnce(async (input) => {
        const operation = await prepareWithChat(input);
        return { ...operation, attachmentSource: input.attachmentSource };
      });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () =>
        result.current.createProject({
          kernel: 'openscad',
          initialMessage: {
            content: 'Build it',
            attachments: [storedRef({ hash, mediaType: 'image/png' })],
            attachmentSource: source,
          },
          location: { kind: 'home' },
        }),
      );

      expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0]).toMatchObject({ attachmentSource: source });
      expect(attachmentFiles.get(`${chatAttachments}/${hash}.png`)).toEqual(bytes);
      expect(mockGenerateProjectName.mock.calls.at(-1)?.[0].imageUrls).toEqual([
        `data:image/png;base64,${uint8ArrayToBase64(bytes)}`,
      ]);
    });

    it('leaves the operation pending and the Home bytes intact when the copy fails', async () => {
      const image = await seedHomeAttachment(new Uint8Array([7, 8, 9]), 'image/png');
      const homePath = [...attachmentFiles.keys()][0]!;
      mockPrepareProjectCreation.mockImplementationOnce(prepareWithChat);
      mockWriteAttachment.mockRejectedValueOnce(new Error('disk full'));
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(
        act(async () =>
          result.current.createProject({
            kernel: 'openscad',
            initialMessage: { content: 'Build it', attachments: [image] },
            location: { kind: 'home' },
          }),
        ),
      ).rejects.toMatchObject({ name: 'PendingProjectRecoveryError', reason: 'local-state-error' });

      expect(mockPutChatRecord).not.toHaveBeenCalled();
      expect(mockCompletePending).not.toHaveBeenCalled();
      expect(attachmentFiles.get(homePath)).toEqual(new Uint8Array([7, 8, 9]));
    });
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

  /**
   * W18 DEF-2 red pin (b): a second device must reuse the remote's project id.
   *
   * The id *is* the repository path on the Tau Hosted Remote, so a device
   * opening a project it has never held cannot mint a new one — and it must not
   * be able to mint an arbitrary string either, because the same id names a
   * directory here and a repository there.
   */
  it('creates a project under an id the caller supplies', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        id: 'proj_ccccccccccccccccccccc',
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      }),
    );

    expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0].manifest.id).toBe('proj_ccccccccccccccccccccc');
  });

  /* D19 (W11 a2): a project born with no remote backs up by default; one
     adopting an identity with a remote of its own does not. */
  const remotelessCreations: ReadonlyArray<readonly [string, CreateProjectOptions]> = [
    ['a fork', { project: { ...fakeProject, name: 'Fork of Test Project' }, files: {} }],
    ['a file or zip import', { project: fakeProject, files: { 'main.ts': { content: new Uint8Array([1]) } } }],
    ['a template', { kernel: 'openscad', projectName: 'Bracket' }],
  ];
  it.each(remotelessCreations)('should mark %s for backup by default', async (_label, options) => {
    globalThis.localStorage.clear();
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => result.current.createProject({ ...options, location: { kind: 'home' } }));

    const createdId = mockPrepareProjectCreation.mock.calls.at(-1)?.[0].manifest.id ?? '';
    expect(tauCloudIntent.get(createdId)).toBe('default');
  });

  it('should not mark a project whose id the caller supplies (Tau Cloud open, linked GitHub import)', async () => {
    globalThis.localStorage.clear();
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        id: 'proj_ccccccccccccccccccccc',
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      }),
    );

    expect(tauCloudIntent.get('proj_ccccccccccccccccccccc')).toBeUndefined();
  });

  /* Review R4: *Open* is offered from a 30 s cache against an asynchronous
     discovery pass, so the same row can be clicked twice. Two local projects
     under one id is a `duplicate-id` conflict neither of them recovers from, so
     the refusal belongs at the owner rather than in the one caller. */
  it('refuses an id this device already holds', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: 'proj_ccccccccccccccccccccc',
      backend: 'opfs',
      providerBasePath: 'already-here',
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      result.current.createProject({
        id: 'proj_ccccccccccccccccccccc',
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      }),
    ).rejects.toThrow(/already on this device/iu);
    expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
  });

  /* RV-W11 3: an *Open* racing materialize on sign-in (or a second tab) checks
     the same id before either has written it; the per-id lock orders them. */
  it('creates one project when two creations of the same id race, refusing the second', async () => {
    const id = 'proj_ccccccccccccccccccccc';
    /* The route config exists once a creation of that id has been prepared. */
    mockGetProjectFileSystemConfig.mockImplementation(async (projectId: string) =>
      mockPrepareProjectCreation.mock.calls.some(([input]) => input.manifest.id === projectId)
        ? { projectId, backend: 'opfs', providerBasePath: 'already-here' }
        : undefined,
    );
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    const create = async () =>
      result.current.createProject({ id, project: fakeProject, files: {}, location: { kind: 'home' } });

    const outcomes = await act(async () => Promise.allSettled([create(), create()]));

    expect(outcomes.map((outcome) => outcome.status).toSorted()).toEqual(['fulfilled', 'rejected']);
    const refused = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(refused?.reason).toEqual(new Error(`That project is already on this device: ${id}`));
    expect(mockPrepareProjectCreation.mock.calls.filter(([input]) => input.manifest.id === id)).toHaveLength(1);
  });

  /* Defect R2: a reload mid-creation leaves the id's directory committed and its
     journal row pending. The new page's recovery resumes it while its
     materialize pass asks for the same id again; that must finish the one
     creation, never allocate `<slug>-1` beside it. */
  describe('an interrupted creation of a supplied id', () => {
    const interrupted = { ...pendingCreate, files: {} };
    const configured = async (projectId: string) =>
      mockSetProjectFileSystemConfig.mock.calls.some(([config]) => config.projectId === projectId)
        ? { projectId, backend: 'opfs', providerBasePath: interrupted.providerBasePath }
        : undefined;
    const createAgain = async (result: { readonly current: ReturnType<typeof useProjectManager> }) =>
      result.current.createProject({
        id: fakeProject.id,
        chat: false,
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      });

    beforeEach(() => {
      mockGetProjectFileSystemConfig.mockImplementation(configured);
      mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    });

    it('should finish the reloaded page’s recovery instead of creating a second directory', async () => {
      let resolveCommit!: () => void;
      mockGetPendingProjectOperations.mockResolvedValueOnce([interrupted]);
      mockCommitPendingProjectDirectory.mockImplementationOnce(
        async () =>
          new Promise<{ status: 'already-committed' }>((resolve) => {
            resolveCommit = () => {
              resolve({ status: 'already-committed' });
            };
          }),
      );
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
      await result.current.getProjectListing();

      const again = createAgain(result);
      resolveCommit();

      await expect(again).rejects.toThrow(`That project is already on this device: ${fakeProject.id}`);
      expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
      expect(mockCommitPendingProjectDirectory.mock.calls.map(([input]) => input.providerBasePath)).toEqual([
        'test-project',
      ]);
    });

    it('should finish a creation another tab left unfinished instead of creating a second directory', async () => {
      mockListProjectManifests.mockResolvedValue({ roots: [], entries: [] });
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
      await result.current.getProjectListing();
      /* Written after this page read the journal, by a tab closed mid-creation. */
      mockGetPendingProjectOperations.mockResolvedValueOnce([interrupted]);
      mockListProjectManifests.mockResolvedValue(validProjectDiscovery);

      await expect(createAgain(result)).rejects.toThrow(`That project is already on this device: ${fakeProject.id}`);
      expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
      expect(mockCommitPendingProjectDirectory.mock.calls.map(([input]) => input.providerBasePath)).toEqual([
        'test-project',
      ]);
      expect(mockCompletePending).toHaveBeenCalledWith(interrupted.operationId);
    });
  });

  /* Review R5: opening someone's project from Tau Cloud must not invent a chat
     for them. `.tau/chats` is unversioned, so the open pull cannot take one
     away, and chats ship on their own record refs — an empty *Initial chat*
     minted here would be offered back to the account on the next push. */
  it('creates without a chat when the caller asks for none', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () =>
      result.current.createProject({
        chat: false,
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      }),
    );

    expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0].chat).toBeUndefined();
    expect(mockPutChatRecord).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a project id, before anything is allocated', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      result.current.createProject({
        id: '../escape',
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      }),
    ).rejects.toThrow(/not a project id/iu);
    expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
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

  it('roots a project created in a picked node folder at that folder', async () => {
    mockIsFileSystemAccessSupported = true;
    mockPickerBackend = 'node';
    mockListWorkspaces.mockResolvedValue([
      { workspaceId: 'wsp_node', name: 'Workshop', slug: 'workshop', path: nodeWorkspacePath },
    ]);
    mockGetWorkspaceMetadata.mockResolvedValue({
      workspaceId: 'wsp_node',
      name: 'Workshop',
      slug: 'workshop',
      lastConnectedAt: 1,
      path: nodeWorkspacePath,
    });
    mockPrepareProjectCreation.mockResolvedValueOnce({
      ...pendingCreate,
      backend: 'node',
      path: nodeWorkspacePath,
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    const created = await act(async () =>
      result.current.createProject({
        project: {
          name: fakeProject.name,
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        },
        files: {},
        location: { kind: 'workspace', workspaceId: 'wsp_node' },
      }),
    );

    expect(mockPrepareProjectCreation.mock.calls.at(-1)?.[0]?.storage).toMatchObject({
      backend: 'node',
      path: nodeWorkspacePath,
    });
    // The commit writes into the picked folder, never into `userData/home`.
    expect(mockCommitPendingProjectDirectory.mock.calls.at(-1)?.[0]?.scope).toEqual({
      backend: 'node',
      path: nodeWorkspacePath,
    });
    expect(created.slugs).toMatchObject({ workspaceSlug: 'workshop' });
    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith(
      expect.objectContaining({ backend: 'node', path: nodeWorkspacePath }),
    );
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

  it('reclaims the permanently deleted project’s composer records and leaves a sibling project untouched', async () => {
    composerFiles.clear();
    const seed = (projectId: string, chatId: string): void => {
      composerFiles.set(`/.tau/composers/chats/${projectId}/${chatId}.json`, 'record');
      composerFiles.set(`/.tau/composers/chats/${projectId}/${chatId}/attachments/${'a'.repeat(64)}.png`, 'bytes');
    };
    seed(fakeProject.id, 'cht_deleted');
    seed(fakeProject.id, 'cht_deleted_too');
    seed(unrelatedProject.id, 'cht_kept');
    mockGetProjectLibraryState.mockResolvedValueOnce({
      projectId: fakeProject.id,
      lastActivityAt: 10,
      deletedAt: 11,
    });
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: pendingPermanentDelete.storage.providerBasePath,
    });
    mockGetPendingProjectOperations.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingPermanentDelete]);
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => result.current.permanentlyDeleteProject(fakeProject.id));

    expect(mockRmdir).toHaveBeenCalledWith(`/.tau/composers/chats/${fakeProject.id}`, { recursive: true });
    expect([...composerFiles.keys()]).toEqual([
      `/.tau/composers/chats/${unrelatedProject.id}/cht_kept.json`,
      `/.tau/composers/chats/${unrelatedProject.id}/cht_kept/attachments/${'a'.repeat(64)}.png`,
    ]);
  });

  it('permanently deletes a project that never held a composer record', async () => {
    composerFiles.clear();
    mockGetProjectLibraryState.mockResolvedValueOnce({
      projectId: fakeProject.id,
      lastActivityAt: 10,
      deletedAt: 11,
    });
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeProject.id,
      backend: 'opfs',
      providerBasePath: pendingPermanentDelete.storage.providerBasePath,
    });
    mockGetPendingProjectOperations.mockResolvedValueOnce([]).mockResolvedValueOnce([pendingPermanentDelete]);
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => result.current.permanentlyDeleteProject(fakeProject.id));

    // An absent composer directory is not a failed deletion: the operation completes.
    expect(mockCompletePending).toHaveBeenCalledWith(pendingPermanentDelete.operationId);
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

  /* W8: unread, message edits and the draft are this device's composer
   * records (D3, D9); the manager no longer offers a chat-row writer for any
   * of them, so nothing can write them back into a chat. */
  it('offers no composer writer on the chat surface', () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createInspectableWrapper().wrapper });

    for (const removed of ['setChatUnreadState', 'setMessageEdit', 'clearMessageEdit']) {
      expect(result.current).not.toHaveProperty(removed);
    }
  });

  it('leaves no-op recency silent', async () => {
    const { wrapper, queryClient } = createInspectableWrapper();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useProjectManager(), { wrapper });
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
