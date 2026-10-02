import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Project } from '@taucad/types';

/**
 * Duplicate-project tests for {@link useProjectManager} covering Audit R8 /
 * Finding 5 (same-workspace, same-backend duplication).
 *
 * The duplicate path:
 *   1. Reads the source project's `ProjectFileSystemConfig` from IDB.
 *   2. Creates the duplicate via the object-store worker.
 *   3. For `webaccess` sources, re-validates the workspace handle and
 *      permission, persists the duplicate's binding, mounts the
 *      workspace `/projects` parent ONCE with the resolved
 *      `(directoryHandle, workspaceId)`, copies through the facade,
 *      and unmounts in `finally`.
 *   4. For `memory` sources, raises `WorkspaceDirectoryRequiredError('unsupported')`.
 *   5. For `indexeddb` / `opfs` sources, copies via the existing root
 *      mount (no per-call mount).
 *
 * These behaviours are the contract of "no ambient workspace state
 * survives between calls".
 */

const mockMount = vi.fn<(prefix: string, config: unknown) => Promise<void>>();
const mockUnmount = vi.fn<(prefix: string) => void>();
const mockCopyDirectory = vi.fn<(source: string, destination: string) => Promise<void>>();

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    backendType: 'indexeddb',
    writeFiles: vi.fn(),
    workspace: {
      mount: mockMount,
      unmount: mockUnmount,
      invalidateStandaloneProvider: vi.fn(async () => undefined),
    },
    copyDirectory: mockCopyDirectory,
    fileManagerRef: { getSnapshot: () => ({ matches: () => true }) },
  }),
}));

type ProjectFsConfigInput =
  | { projectId: string; backend: 'indexeddb' | 'opfs' | 'memory' }
  | { projectId: string; backend: 'webaccess'; workspaceId: string };

const mockSetProjectFileSystemConfig = vi.fn<(config: ProjectFsConfigInput) => Promise<void>>();
const mockGetProjectFileSystemConfig = vi.fn<(projectId: string) => Promise<ProjectFsConfigInput | undefined>>();
const mockGetWorkspace =
  vi.fn<
    (
      workspaceId: string,
    ) => Promise<{ workspace: { workspaceId: string; name: string }; handle: FileSystemDirectoryHandle } | undefined>
  >();
const mockCheckHandlePermission = vi.fn<() => Promise<string>>();

vi.mock('#filesystem/handle-store.js', () => ({
  setProjectFileSystemConfig: async (...args: unknown[]) =>
    mockSetProjectFileSystemConfig(...(args as [ProjectFsConfigInput])),
  getProjectFileSystemConfig: async (...args: unknown[]) => mockGetProjectFileSystemConfig(...(args as [string])),
  getDefaultWorkspace: vi.fn(async () => undefined),
  getWorkspace: async (...args: unknown[]) => mockGetWorkspace(...(args as [string])),
  checkHandlePermission: async () => mockCheckHandlePermission(),
}));

vi.mock('#constants/browser.constants.js', () => ({
  isFileSystemAccessSupported: true,
}));

const fakeSourceProjectId = 'src-proj-id';
const fakeDuplicate: Project = {
  id: 'dup-proj-id',
  name: 'Duplicate',
  description: '',
  author: { name: '', avatar: '' },
  tags: [],
  thumbnail: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  assets: {},
};

const mockDuplicateProject = vi.fn(async () => fakeDuplicate);

vi.mock('#hooks/project-manager.machine.js', async () => {
  const xstate = await import('xstate');
  const machine = xstate.setup({}).createMachine({
    id: 'projectManager',
    initial: 'ready',
    context: {
      worker: undefined as Worker | undefined,
      wrappedWorker: undefined as unknown,
      error: undefined as Error | undefined,
    },
    states: { ready: {} },
  });
  return { projectManagerMachine: machine };
});

vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    waitFor: vi.fn().mockResolvedValue({
      matches: (state: string) => state === 'ready',
      context: {
        wrappedWorker: {
          duplicateProject: mockDuplicateProject,
          createProjectWithResources: vi.fn(),
        },
      },
    }),
  };
});

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: string) => [defaultValue, vi.fn()],
}));

vi.mock('#constants/project.constants.js', () => ({
  createInitialProject: () => ({ projectData: {}, files: {} }),
}));

vi.mock('#utils/kernel.utils.js', () => ({
  getMainFile: () => 'main.ts',
  getEmptyCode: () => 'export default {};',
}));

vi.mock('#utils/filesystem.utils.js', () => ({
  encodeTextFile: (text: string) => new TextEncoder().encode(text),
}));

vi.mock('#utils/chat.utils.js', () => ({
  createMessage: (options: Record<string, unknown>) => ({ id: 'msg-1', ...options }),
}));

vi.mock('#constants/project-names.js', () => ({
  defaultProjectName: 'Untitled Project',
}));

// eslint-disable-next-line @typescript-eslint/naming-convention -- React component export
const { ProjectManagerProvider, useProjectManager } = await import('#hooks/use-project-manager.js');

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- React component export
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, undefined, children),
    );
  };
}

describe('useProjectManager.duplicateProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMount.mockResolvedValue(undefined);
    mockUnmount.mockReturnValue(undefined);
    mockCopyDirectory.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCheckHandlePermission.mockResolvedValue('granted');
  });

  it('mounts webaccess workspace ONCE with explicit handle + workspaceId, then unmounts', async () => {
    const handle = { kind: 'directory', name: 'WS' } as unknown as FileSystemDirectoryHandle;
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeSourceProjectId,
      backend: 'webaccess',
      workspaceId: 'wsp_alpha',
    });
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_alpha', name: 'Alpha' },
      handle,
    });

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.duplicateProject(fakeSourceProjectId);
    });

    // Audit R8: a single mount of `/projects` carries (directoryHandle,
    // workspaceId) atomically — both source and destination resolve
    // through it via `preservePath: true`.
    expect(mockMount).toHaveBeenCalledExactlyOnceWith('/projects', {
      backend: 'webaccess',
      directoryHandle: handle,
      workspaceId: 'wsp_alpha',
      preservePath: true,
    });
    expect(mockSetProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith({
      projectId: fakeDuplicate.id,
      backend: 'webaccess',
      workspaceId: 'wsp_alpha',
    });
    expect(mockCopyDirectory).toHaveBeenCalledExactlyOnceWith(
      `/projects/${fakeSourceProjectId}`,
      `/projects/${fakeDuplicate.id}`,
    );
    // `finally` block must always unmount even on success.
    expect(mockUnmount).toHaveBeenCalledExactlyOnceWith('/projects');
  });

  it('unmounts even when the underlying copy fails', async () => {
    const handle = { kind: 'directory', name: 'WS' } as unknown as FileSystemDirectoryHandle;
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeSourceProjectId,
      backend: 'webaccess',
      workspaceId: 'wsp_alpha',
    });
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_alpha', name: 'Alpha' },
      handle,
    });
    mockCopyDirectory.mockRejectedValueOnce(new Error('copy boom'));

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.duplicateProject(fakeSourceProjectId);
      }),
    ).rejects.toThrow('copy boom');

    expect(mockUnmount).toHaveBeenCalledExactlyOnceWith('/projects');
  });

  it('rejects with WorkspaceDirectoryRequiredError(missing) when the workspace row is gone', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeSourceProjectId,
      backend: 'webaccess',
      workspaceId: 'wsp_gone',
    });
    mockGetWorkspace.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.duplicateProject(fakeSourceProjectId);
      }),
    ).rejects.toMatchObject({
      name: 'WorkspaceDirectoryRequiredError',
      code: 'missing',
    });

    expect(mockMount).not.toHaveBeenCalled();
    expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('rejects with WorkspaceDirectoryRequiredError(permission) when permission is revoked', async () => {
    const handle = { kind: 'directory', name: 'WS' } as unknown as FileSystemDirectoryHandle;
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeSourceProjectId,
      backend: 'webaccess',
      workspaceId: 'wsp_revoked',
    });
    mockGetWorkspace.mockResolvedValue({
      workspace: { workspaceId: 'wsp_revoked', name: 'Revoked' },
      handle,
    });
    mockCheckHandlePermission.mockResolvedValue('prompt');

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.duplicateProject(fakeSourceProjectId);
      }),
    ).rejects.toMatchObject({
      name: 'WorkspaceDirectoryRequiredError',
      code: 'permission',
    });

    expect(mockMount).not.toHaveBeenCalled();
    expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('does not mount per-call for non-webaccess sources', async () => {
    mockGetProjectFileSystemConfig.mockResolvedValue({
      projectId: fakeSourceProjectId,
      backend: 'indexeddb',
    });

    const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.duplicateProject(fakeSourceProjectId);
    });

    // Non-webaccess sources reuse the existing root mount; no
    // per-duplicate mount round-trip.
    expect(mockMount).not.toHaveBeenCalled();
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(mockCopyDirectory).toHaveBeenCalledExactlyOnceWith(
      `/projects/${fakeSourceProjectId}`,
      `/projects/${fakeDuplicate.id}`,
    );
  });
});
