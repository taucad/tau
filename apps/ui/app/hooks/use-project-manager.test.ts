import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Project } from '@taucad/types';

// ── Mock fns ──────────────────────────────────────────────────────────────────

const mockWriteFiles = vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>>();
const mockClientWriteFiles = vi.fn<(files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>>();
const mockMount = vi.fn<(prefix: string, backend: string, options?: unknown) => Promise<void>>();
const mockUnmount = vi.fn<(prefix: string) => void>();
let mockBackendType = 'indexeddb';

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    backendType: mockBackendType,
    writeFiles: mockWriteFiles,
    client: {
      writeFiles: mockClientWriteFiles,
    },
    workspace: {
      mount: mockMount,
      unmount: mockUnmount,
      invalidateStandaloneProvider: vi.fn(async () => undefined),
    },
    copyDirectory: vi.fn(),
    fileManagerRef: { getSnapshot: () => ({ matches: () => true }) },
  }),
}));

type ProjectFsConfigInput =
  | { projectId: string; backend: 'indexeddb' | 'opfs' | 'memory' }
  | { projectId: string; backend: 'webaccess'; workspaceId: string };

const mockSetProjectFileSystemConfig = vi.fn<(config: ProjectFsConfigInput) => Promise<void>>();
const mockGetDefaultWorkspace =
  vi.fn<
    () => Promise<{ workspace: { workspaceId: string; name: string }; handle: FileSystemDirectoryHandle } | undefined>
  >();
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
  getDefaultWorkspace: async () => mockGetDefaultWorkspace(),
  getWorkspace: async (...args: unknown[]) => mockGetWorkspace(...(args as [string])),
  checkHandlePermission: async () => mockCheckHandlePermission(),
}));

let mockIsFileSystemAccessSupported = false;
vi.mock('#constants/browser.constants.js', () => ({
  get isFileSystemAccessSupported() {
    return mockIsFileSystemAccessSupported;
  },
}));

const mainFile = 'main.ts';

const stubProjectData = {
  name: 'Test',
  description: '',
  author: { name: '', avatar: '' },
  tags: [] as string[],
  thumbnail: '',
  assets: {},
} as const;

const fakeProject: Project = {
  id: 'test-project-id',
  name: 'Test Project',
  description: '',
  author: { name: '', avatar: '' },
  tags: [],
  thumbnail: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  assets: {},
};

const mockCreateProjectWithResources = vi.fn().mockResolvedValue({ project: fakeProject });

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
    states: {
      ready: {},
    },
  });

  return {
    projectManagerMachine: machine,
  };
});

vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    waitFor: vi.fn().mockResolvedValue({
      matches: (state: string) => state === 'ready',
      context: {
        wrappedWorker: {
          createProjectWithResources: mockCreateProjectWithResources,
        },
      },
    }),
  };
});

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: string) => [defaultValue, vi.fn()],
}));

vi.mock('#constants/project.constants.js', () => ({
  createInitialProject: () => ({
    projectData: { name: 'Test Project' },
    files: { [mainFile]: { content: new Uint8Array([1, 2, 3]) } },
  }),
}));

vi.mock('#utils/kernel.utils.js', () => ({
  getMainFile: () => mainFile,
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

// ── Test wrapper ──────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- React component export
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, undefined, children),
    );
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFiles(entries: Record<string, number[]>): Record<string, { content: Uint8Array<ArrayBuffer> }> {
  const result: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  for (const [key, bytes] of Object.entries(entries)) {
    result[key] = { content: new Uint8Array(bytes) };
  }
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProjectManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackendType = 'indexeddb';
    mockWriteFiles.mockResolvedValue(undefined);
    mockClientWriteFiles.mockResolvedValue(undefined);
    mockMount.mockResolvedValue(undefined);
    mockUnmount.mockReturnValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetDefaultWorkspace.mockResolvedValue(undefined);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCheckHandlePermission.mockResolvedValue('granted');
    mockIsFileSystemAccessSupported = false;
  });

  describe('createProject mount-based backend wiring', () => {
    it('should call mount with resolvedBackend and project prefix', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'opfs',
        });
      });

      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'opfs',
        preservePath: true,
      });
    });

    it('should call unmount in finally block after writeFiles', async () => {
      const callOrder: string[] = [];

      mockMount.mockImplementation(async () => {
        callOrder.push('mount');
      });
      mockClientWriteFiles.mockImplementation(async () => {
        callOrder.push('writeFiles');
      });
      mockUnmount.mockImplementation(() => {
        callOrder.push('unmount');
      });

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'opfs',
        });
      });

      expect(callOrder).toEqual(['mount', 'writeFiles', 'unmount']);
    });

    it('should call unmount even when writeFiles throws', async () => {
      mockClientWriteFiles.mockRejectedValueOnce(new Error('write failed'));

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.createProject({
            project: stubProjectData,
            files: makeFiles({ [mainFile]: [1] }),
            backend: 'opfs',
          });
        }),
      ).rejects.toThrow('write failed');

      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'opfs',
        preservePath: true,
      });
      expect(mockUnmount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`);
    });

    it('should use mount for backend wiring during project creation', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'opfs',
        });
      });

      expect(mockMount).toHaveBeenCalledOnce();
    });

    it('should still call setProjectFileSystemConfig with resolvedBackend', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'opfs',
        });
      });

      expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith({ projectId: fakeProject.id, backend: 'opfs' });
    });

    it('should mount with default indexeddb when no backend specified', async () => {
      mockBackendType = 'indexeddb';

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
        });
      });

      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'indexeddb',
        preservePath: true,
      });
      expect(mockUnmount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`);
    });

    it('should throw WorkspaceDirectoryRequiredError when webaccess cannot resolve a workspace', async () => {
      // In jsdom `isFileSystemAccessSupported === false`, so this exercises
      // the `'unsupported'` branch. Either way `createProject` MUST refuse
      // to silently downgrade to indexeddb (Audit R3).
      mockGetDefaultWorkspace.mockResolvedValue(undefined);

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.createProject({
            project: stubProjectData,
            files: makeFiles({ [mainFile]: [1] }),
            backend: 'webaccess',
          });
        }),
      ).rejects.toMatchObject({ name: 'WorkspaceDirectoryRequiredError' });

      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      expect(mockMount).not.toHaveBeenCalled();
    });

    // Audit R15 happy-path regression: webaccess with a resolved + permitted
    // default workspace MUST bind the project to that workspaceId in
    // `configs[projectId]` and mount with `'webaccess'`. Silent downgrade
    // is forbidden (Rule 13a).
    it('should bind webaccess project to the default workspaceId and mount webaccess', async () => {
      mockIsFileSystemAccessSupported = true;
      const defaultEntry = {
        workspace: { workspaceId: 'wsp_default', name: 'Default Workspace' },
        handle: { kind: 'directory', name: 'Default' } as unknown as FileSystemDirectoryHandle,
      };
      mockGetDefaultWorkspace.mockResolvedValue(defaultEntry);
      mockCheckHandlePermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'webaccess',
        });
      });

      expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith({
        projectId: fakeProject.id,
        backend: 'webaccess',
        workspaceId: 'wsp_default',
      });
      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'webaccess',
        directoryHandle: defaultEntry.handle,
        workspaceId: 'wsp_default',
        preservePath: true,
      });
    });

    // Audit R15 explicit-workspace regression: when callers (e.g. the
    // `/projects/new` workspace picker) pass an explicit `workspaceId`, the
    // project must bind to that workspace, NOT the default. This is the
    // foundation for Finding 15 — projects are pinned to the workspace
    // chosen at creation time and never re-point to the current default.
    it('should bind webaccess project to the explicit workspaceId option, ignoring the default', async () => {
      mockIsFileSystemAccessSupported = true;
      const defaultEntry = {
        workspace: { workspaceId: 'wsp_default', name: 'Default Workspace' },
        handle: { kind: 'directory', name: 'Default' } as unknown as FileSystemDirectoryHandle,
      };
      const explicitEntry = {
        workspace: { workspaceId: 'wsp_explicit', name: 'Explicit Workspace' },
        handle: { kind: 'directory', name: 'Explicit' } as unknown as FileSystemDirectoryHandle,
      };
      mockGetDefaultWorkspace.mockResolvedValue(defaultEntry);
      mockGetWorkspace.mockResolvedValue(explicitEntry);
      mockCheckHandlePermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'webaccess',
          workspaceId: 'wsp_explicit',
        });
      });

      expect(mockGetWorkspace).toHaveBeenCalledWith('wsp_explicit');
      expect(mockGetDefaultWorkspace).not.toHaveBeenCalled();
      expect(mockSetProjectFileSystemConfig).toHaveBeenCalledWith({
        projectId: fakeProject.id,
        backend: 'webaccess',
        workspaceId: 'wsp_explicit',
      });
    });

    // Audit R15 permission-denied regression: a resolved workspace with
    // `permission !== 'granted'` must surface as a structured
    // `WorkspaceDirectoryRequiredError({ code: 'permission' })` and NOT
    // partially bind the project. The route layer translates this into
    // the inline `WorkspaceDirectoryPanel` recovery UX.
    it('should throw permission-coded error when webaccess workspace has revoked permission', async () => {
      mockIsFileSystemAccessSupported = true;
      mockGetDefaultWorkspace.mockResolvedValue({
        workspace: { workspaceId: 'wsp_revoked', name: 'Revoked' },
        handle: { kind: 'directory', name: 'Revoked' } as unknown as FileSystemDirectoryHandle,
      });
      mockCheckHandlePermission.mockResolvedValue('prompt');

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.createProject({
            project: stubProjectData,
            files: makeFiles({ [mainFile]: [1] }),
            backend: 'webaccess',
          });
        }),
      ).rejects.toMatchObject({ name: 'WorkspaceDirectoryRequiredError', code: 'permission' });

      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      expect(mockMount).not.toHaveBeenCalled();
    });

    // Audit R15 missing-workspace regression: an explicit `workspaceId`
    // that no longer exists in IDB must surface as
    // `code: 'missing'` so the UI can prompt the user to re-pick the
    // workspace (rather than silently falling back to the default).
    it('should throw missing-coded error when explicit workspaceId is not in the store', async () => {
      mockIsFileSystemAccessSupported = true;
      mockGetWorkspace.mockResolvedValue(undefined);

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await expect(
        act(async () => {
          await result.current.createProject({
            project: stubProjectData,
            files: makeFiles({ [mainFile]: [1] }),
            backend: 'webaccess',
            workspaceId: 'wsp_gone',
          });
        }),
      ).rejects.toMatchObject({ name: 'WorkspaceDirectoryRequiredError', code: 'missing' });

      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
    });

    it('should seed activeKernel from the kernel template and leave activeModel unset when not supplied', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          kernel: 'openscad',
          projectName: 'Seeded',
          initialMessage: { content: 'hello' },
        });
      });

      const callArgs = mockCreateProjectWithResources.mock.calls.at(-1)?.[0] as
        | { chat: { activeModel?: string; activeKernel?: string } }
        | undefined;
      expect(callArgs?.chat.activeModel).toBeUndefined();
      expect(callArgs?.chat.activeKernel).toBe('openscad');
    });

    it('should leave activeModel undefined when no initialMessage and no explicit override', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          kernel: 'openscad',
        });
      });

      const callArgs = mockCreateProjectWithResources.mock.calls.at(-1)?.[0] as
        | { chat: { activeModel?: string; activeKernel?: string } }
        | undefined;
      expect(callArgs?.chat.activeModel).toBeUndefined();
      expect(callArgs?.chat.activeKernel).toBe('openscad');
    });

    it('should honor explicit activeModel/activeKernel overrides over derived defaults', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          kernel: 'openscad',
          activeModel: 'override-model',
          activeKernel: 'manifold',
          initialMessage: { content: 'hello' },
        });
      });

      const callArgs = mockCreateProjectWithResources.mock.calls.at(-1)?.[0] as
        | { chat: { activeModel?: string; activeKernel?: string } }
        | undefined;
      expect(callArgs?.chat.activeModel).toBe('override-model');
      expect(callArgs?.chat.activeKernel).toBe('manifold');
    });

    // Wire-format invariant for the chat-metadata-first-class-architecture
    // refactor: the pending-user-message seeded onto a brand-new chat must
    // carry only `status: pending`. The per-request `agent` payload (kernel,
    // model, mode, toolChoice, testingEnabled, snapshot, contextPayload)
    // is composed by the chat-client at regenerate time, not stamped onto
    // the seed message. Regression coverage for the previous failure mode
    // where the seed message stamped kernel/model and the seed mode drifted
    // from the chat row's activeKernel.
    it('should seed the initial pending user message with only status: pending', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          kernel: 'openscad',
          initialMessage: { content: 'first turn' },
        });
      });

      const callArgs = mockCreateProjectWithResources.mock.calls.at(-1)?.[0] as
        | { chat: { messages: Array<{ metadata?: Record<string, unknown> }> } }
        | undefined;
      const seedMetadata = callArgs?.chat.messages[0]?.metadata;
      expect(seedMetadata?.['status']).toBe('pending');
      expect(seedMetadata?.['kernel']).toBeUndefined();
      expect(seedMetadata?.['model']).toBeUndefined();
      expect(seedMetadata?.['mode']).toBeUndefined();
      expect(seedMetadata?.['toolChoice']).toBeUndefined();
      expect(seedMetadata?.['testingEnabled']).toBeUndefined();
    });

    it('should write files with correct project paths', async () => {
      const sourceFile = 'src/main.ts';
      const packageFile = 'package.json';

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [sourceFile]: [1], [packageFile]: [2] }),
        });
      });

      const writtenFiles = mockClientWriteFiles.mock.calls[0]![0];
      const paths = Object.keys(writtenFiles);
      expect(paths).toContain(`/projects/${fakeProject.id}/${sourceFile}`);
      expect(paths).toContain(`/projects/${fakeProject.id}/${packageFile}`);
    });

    // Regression: project bootstrap writes /projects/<id>/... keys that are
    // foreign to the root FM's workspace ('/'). Going through
    // `fileManager.writeFiles` (the scoped FileContentService) used to spam
    // `WorkspacePathEscapeError` ~100 ms after every homepage submit because
    // `batchWritten` carried those foreign keys to the root FM's
    // FileTreeService. The cross-workspace bootstrap MUST route through
    // `fileManager.client.writeFiles` (worker namespace, no resolver,
    // dispatched by the mount table) for backend dispatch to land in the
    // correct provider without tripping the workspace contract.
    //
    // See also: `use-cad-preview.test.tsx` — the same cross-workspace
    // bootstrap pattern applies to `CadPreviewProvider` when its surrounding
    // FM doesn't already own the preview's `/projects/<id>` mount (root-FM
    // thumbnails on the homepage, import-route Review previews, cross-scope
    // previews). Both bootstrap sites are discoverable as one class.
    it('should route bootstrap writes through fileManager.client.writeFiles, not fileManager.writeFiles', async () => {
      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'opfs',
        });
      });

      expect(mockClientWriteFiles).toHaveBeenCalledOnce();
      expect(mockWriteFiles).not.toHaveBeenCalled();
    });

    it('should invoke client.writeFiles between workspace.mount and workspace.unmount for indexeddb', async () => {
      const callOrder: string[] = [];
      mockMount.mockImplementation(async () => {
        callOrder.push('mount');
      });
      mockClientWriteFiles.mockImplementation(async () => {
        callOrder.push('client.writeFiles');
      });
      mockUnmount.mockImplementation(() => {
        callOrder.push('unmount');
      });

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'indexeddb',
        });
      });

      expect(callOrder).toEqual(['mount', 'client.writeFiles', 'unmount']);
      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'indexeddb',
        preservePath: true,
      });
    });

    it('should invoke client.writeFiles between workspace.mount and workspace.unmount for opfs', async () => {
      const callOrder: string[] = [];
      mockMount.mockImplementation(async () => {
        callOrder.push('mount');
      });
      mockClientWriteFiles.mockImplementation(async () => {
        callOrder.push('client.writeFiles');
      });
      mockUnmount.mockImplementation(() => {
        callOrder.push('unmount');
      });

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'opfs',
        });
      });

      expect(callOrder).toEqual(['mount', 'client.writeFiles', 'unmount']);
      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'opfs',
        preservePath: true,
      });
    });

    it('should invoke client.writeFiles between workspace.mount and workspace.unmount for webaccess (with handle + workspaceId)', async () => {
      mockIsFileSystemAccessSupported = true;
      const entry = {
        workspace: { workspaceId: 'wsp_test', name: 'Test' },
        handle: { kind: 'directory', name: 'Test' } as unknown as FileSystemDirectoryHandle,
      };
      mockGetDefaultWorkspace.mockResolvedValue(entry);
      const callOrder: string[] = [];
      mockMount.mockImplementation(async () => {
        callOrder.push('mount');
      });
      mockClientWriteFiles.mockImplementation(async () => {
        callOrder.push('client.writeFiles');
      });
      mockUnmount.mockImplementation(() => {
        callOrder.push('unmount');
      });

      const { result } = renderHook(() => useProjectManager(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.createProject({
          project: stubProjectData,
          files: makeFiles({ [mainFile]: [1] }),
          backend: 'webaccess',
        });
      });

      expect(callOrder).toEqual(['mount', 'client.writeFiles', 'unmount']);
      expect(mockMount).toHaveBeenCalledWith(`/projects/${fakeProject.id}`, {
        backend: 'webaccess',
        directoryHandle: entry.handle,
        workspaceId: 'wsp_test',
        preservePath: true,
      });
    });
  });
});
