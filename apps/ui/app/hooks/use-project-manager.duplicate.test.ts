/* eslint-disable @typescript-eslint/naming-convention -- Test fixtures use React component names and literal workspace file paths. */
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import type { PendingProjectOperation, PendingProjectStorage } from '#types/pending-project-operation.types.js';

const sourceProject: ProjectManifest = projectToManifest({
  id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
  name: 'Source',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const duplicateProject: ProjectManifest = projectToManifest({
  ...sourceProject,
  id: 'proj_ccccccccccccccccccccc',
  name: 'Source (Copy)',
});
const operationId = 'req_bbbbbbbbbbbbbbbbbbbbb';
let lastManifest = serializeProjectManifest(projectToManifest(sourceProject));
const phases: string[] = [];

const mockGetDirectoryContents = vi.fn(async () => ({
  'main.ts': new Uint8Array([1]),
  'tau.json': serializeProjectManifest(projectToManifest(sourceProject)),
}));
const mockSyncProjectRoots = vi.fn(async () => {
  phases.push('roots');
});
const mockCommitPendingProjectDirectory = vi.fn(async () => {
  phases.push('commit');
  return { status: 'committed' } as const;
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    client: {
      readFile: vi.fn(async () => lastManifest),
      writeFiles: vi.fn(async () => {
        phases.push('files');
      }),
      writeFile: vi.fn(async (_path: string, bytes: Uint8Array<ArrayBuffer>) => {
        phases.push('manifest');
        lastManifest = bytes;
      }),
      getDirectoryContents: mockGetDirectoryContents,
      exists: vi.fn(async () => false),
      rmdir: vi.fn(async () => undefined),
      listProjectManifests: vi.fn(async () => ({ roots: [], entries: [] })),
      commitPendingProjectDirectory: mockCommitPendingProjectDirectory,
    },
    workspace: { syncProjectRoots: mockSyncProjectRoots },
  }),
}));

const mockGetProjectFileSystemConfig = vi.fn();
const mockGetWorkspace = vi.fn();
const mockListWorkspaces = vi.fn(async (): Promise<Array<{ workspaceId: string }>> => []);
const mockCheckHandlePermission = vi.fn(async () => 'granted');
const mockSetProjectFileSystemConfig = vi.fn(async () => {
  phases.push('locator');
});
const mockPinHomeStorageBackend = vi.fn(async (backend: 'indexeddb' | 'opfs') => backend);
const mockGetProjectCreationLocation = vi.fn();
const mockSetProjectCreationLocation = vi.fn();
vi.mock('#filesystem/handle-store.js', () => ({
  pinHomeStorageBackend: mockPinHomeStorageBackend,
  getHomeStorageBackend: vi.fn(async () => 'opfs'),
  getProjectCreationLocation: mockGetProjectCreationLocation,
  setProjectCreationLocation: mockSetProjectCreationLocation,
  getProjectFileSystemConfig: mockGetProjectFileSystemConfig,
  getWorkspace: mockGetWorkspace,
  checkHandlePermission: mockCheckHandlePermission,
  setProjectFileSystemConfig: mockSetProjectFileSystemConfig,
  deleteProjectFileSystemConfig: vi.fn(async () => undefined),
  getAllProjectFileSystemConfigs: vi.fn(async () => []),
  listWorkspaces: mockListWorkspaces,
  subscribeProjectRootConfigurationChanges: vi.fn(() => vi.fn()),
}));

vi.mock('#constants/browser.constants.js', () => ({
  isFileSystemAccessSupported: true,
  directoryPicker: () => ({
    available: true,
    backend: 'webaccess' as const,
    pick: async (options?: { id?: string; mode?: 'read' | 'readwrite' }) => {
      const handle = await globalThis.window.showDirectoryPicker({
        id: options?.id,
        mode: options?.mode ?? 'readwrite',
      });
      return { backend: 'webaccess' as const, handle };
    },
  }),
  webAccessDirectoryPicker: () =>
    true
      ? {
          pick: async (options?: { id?: string; mode?: 'read' | 'readwrite' }) =>
            globalThis.window.showDirectoryPicker({ id: options?.id, mode: options?.mode ?? 'readwrite' }),
        }
      : undefined,
}));
vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: string) => [defaultValue, vi.fn()],
}));
vi.mock('#utils/chat.utils.js', () => ({
  createMessage: (options: Record<string, unknown>) => ({ id: 'msg-1', ...options }),
}));

const pendingDuplicate: Extract<PendingProjectOperation, { kind: 'duplicate' }> = {
  operationId,
  kind: 'duplicate',
  backend: 'indexeddb',
  providerBasePath: '/source-copy',
  sourceProjectId: sourceProject.id,
  manifest: duplicateProject,
  library: { projectId: duplicateProject.id, lastActivityAt: 3 },
  files: { 'main.ts': { content: new Uint8Array([1]) } },
  chats: [],
};
type PrepareDuplicateInput = {
  readonly sourceManifest: ProjectManifest;
  readonly targetManifest: ProjectManifest;
  readonly files: Record<string, { readonly content: Uint8Array<ArrayBuffer> }>;
  readonly storage: PendingProjectStorage;
};
const mockDuplicate = vi.fn<
  (input: PrepareDuplicateInput) => Promise<Extract<PendingProjectOperation, { kind: 'duplicate' }>>
>(async () => {
  phases.push('pending');
  return pendingDuplicate;
});

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
          getPendingProjectOperations: vi.fn(async () => []),
          prepareProjectDuplicate: mockDuplicate,
          resumePendingProjectOperationResources: vi.fn(async () => {
            phases.push('resources');
          }),
          completePendingProjectOperation: vi.fn(async () => {
            phases.push('complete');
          }),
        },
      },
    })),
  };
});

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

describe('useProjectManager.duplicateProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    phases.length = 0;
    lastManifest = serializeProjectManifest(projectToManifest(sourceProject));
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: sourceProject.id,
      backend: 'indexeddb',
      providerBasePath: '/source',
    });
    mockListWorkspaces.mockResolvedValue([]);
  });

  it('copies source files without tau.json and writes the fresh manifest last', async () => {
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await act(async () => result.current.duplicateProject(sourceProject.id));

    const duplicateInput = mockDuplicate.mock.calls[0]?.[0];
    expect(duplicateInput?.sourceManifest).toEqual(sourceProject);
    expect(duplicateInput?.targetManifest.name).toBe('Source (Copy)');
    expect(duplicateInput?.files).toEqual({ 'main.ts': { content: new Uint8Array([1]) } });
    expect(duplicateInput?.storage).toMatchObject({ backend: 'indexeddb' });
    expect(mockPinHomeStorageBackend).toHaveBeenCalledWith('indexeddb');
    expect(mockCommitPendingProjectDirectory).toHaveBeenCalledWith({
      providerBasePath: pendingDuplicate.providerBasePath,
      scope: { backend: 'indexeddb' },
      files: pendingDuplicate.files,
      manifest: serializeProjectManifest(duplicateProject),
    });
    expect(phases).toEqual(['pending', 'commit', 'locator', 'roots', 'resources', 'complete']);
    expect(mockGetDirectoryContents).toHaveBeenCalledWith(`/projects/${sourceProject.id}`);
  });

  it('records the same webaccess workspace on the duplicate', async () => {
    const handle = { kind: 'directory', name: 'Workspace' };
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: sourceProject.id,
      backend: 'webaccess',
      workspaceId: 'wsp_alpha',
      providerBasePath: '/source',
    });
    mockGetWorkspace.mockResolvedValue({ workspace: { workspaceId: 'wsp_alpha', name: 'Workspace' }, handle });
    mockListWorkspaces.mockResolvedValue([{ workspaceId: 'wsp_alpha' }]);
    mockDuplicate.mockResolvedValueOnce({
      ...pendingDuplicate,
      backend: 'webaccess',
      workspaceId: 'wsp_alpha',
    });

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await act(async () => result.current.duplicateProject(sourceProject.id));
    const duplicateInput = mockDuplicate.mock.calls[0]?.[0];
    expect(duplicateInput?.sourceManifest).toEqual(sourceProject);
    expect(duplicateInput?.targetManifest.name).toBe('Source (Copy)');
    expect(duplicateInput?.files).toEqual({ 'main.ts': { content: new Uint8Array([1]) } });
    expect(duplicateInput?.storage).toMatchObject({
      backend: 'webaccess',
      workspaceId: 'wsp_alpha',
    });
    expect(mockPinHomeStorageBackend).not.toHaveBeenCalled();
    expect(mockGetProjectCreationLocation).not.toHaveBeenCalled();
    expect(mockSetProjectCreationLocation).not.toHaveBeenCalled();
  });

  it('leaves the duplicate pending when source-file copying fails', async () => {
    mockGetDirectoryContents.mockRejectedValueOnce(new Error('copy failed'));
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(act(async () => result.current.duplicateProject(sourceProject.id))).rejects.toThrow('copy failed');
    expect(phases).toEqual([]);
  });

  it('rejects memory-backed sources before preparing a duplicate', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: sourceProject.id,
      backend: 'memory',
      storageRootKey: 'memory:test',
      providerBasePath: '/source',
    });
    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });
    await expect(act(async () => result.current.duplicateProject(sourceProject.id))).rejects.toMatchObject({
      name: 'WorkspaceDirectoryRequiredError',
      code: 'unsupported',
    });
    expect(mockDuplicate).not.toHaveBeenCalled();
  });
});
