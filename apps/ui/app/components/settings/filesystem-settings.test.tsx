import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ProjectFileSystemConfig, Workspace, WorkspaceConnection } from '#filesystem/handle-store.js';
import type { ConnectedWorkspace } from '#hooks/use-project-manager.js';
import { FileSystemSettings } from '#components/settings/filesystem-settings.js';

type ToastSuccessOptions = {
  readonly action: { readonly label: string; readonly onClick: () => void | Promise<void> };
};

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => ['indexeddb', vi.fn()],
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    assertWorkspaceMutationAllowed: mockAssertWorkspaceMutationAllowed,
    workspaceConnection: { phase: 'idle' },
    connectWorkspace: mockConnectWorkspace,
    refreshWorkspaceCatalog: mockRefreshWorkspaceCatalog,
  }),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    workspace: {
      syncProjectRoots: vi.fn(),
      replaceWorkspaceHandle: vi.fn(),
      disconnectWorkspace: mockDisconnectWorkspace,
      restoreWorkspaceHandle: mockRestoreWorkspaceHandle,
    },
  }),
}));

const {
  mockAssertWorkspaceMutationAllowed,
  mockCheckHandlePermission,
  mockConnectWorkspace,
  mockCreateWorkspace,
  mockDisconnectWorkspace,
  mockGetWorkspace,
  mockListProjectsForWorkspace,
  mockListWorkspaces,
  mockRefreshWorkspaceCatalog,
  mockRestoreWorkspaceHandle,
  mockToastError,
  mockToastInfo,
  mockToastSuccess,
  mockWorkspaceConnected,
  mockWorkspaceCreated,
} = vi.hoisted(() => ({
  mockAssertWorkspaceMutationAllowed: vi.fn(),
  mockCheckHandlePermission: vi.fn(),
  mockConnectWorkspace: vi.fn<() => Promise<ConnectedWorkspace | undefined>>(),
  mockCreateWorkspace: vi.fn<(handle: FileSystemDirectoryHandle) => Promise<WorkspaceConnection>>(),
  mockDisconnectWorkspace: vi.fn(),
  mockGetWorkspace: vi.fn(),
  mockListProjectsForWorkspace: vi.fn<() => Promise<ProjectFileSystemConfig[]>>(async () => []),
  mockListWorkspaces: vi.fn<() => Promise<Workspace[]>>(async () => []),
  mockRefreshWorkspaceCatalog: vi.fn(),
  mockRestoreWorkspaceHandle: vi.fn(async () => true),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
  mockToastSuccess: vi.fn<(message: string, options?: ToastSuccessOptions) => void>(),
  mockWorkspaceConnected: vi.fn(),
  mockWorkspaceCreated: vi.fn(),
}));

vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({
    workspaceCreated: mockWorkspaceCreated,
    workspaceConnected: mockWorkspaceConnected,
    workspaceOpenFailed: vi.fn(),
  }),
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

vi.mock('#filesystem/handle-store.js', () => ({
  checkHandlePermission: mockCheckHandlePermission,
  createWorkspace: mockCreateWorkspace,
  getWorkspace: mockGetWorkspace,
  listProjectsForWorkspace: mockListProjectsForWorkspace,
  listWorkspaces: mockListWorkspaces,
  requestHandlePermission: vi.fn(),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: mockToastError,
    info: mockToastInfo,
    success: mockToastSuccess,
  },
}));

const stubEstimate = (estimate: () => Promise<StorageEstimate>): void => {
  Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: { estimate } });
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mockListWorkspaces.mockResolvedValue([]);
  mockListProjectsForWorkspace.mockResolvedValue([]);
  mockRestoreWorkspaceHandle.mockResolvedValue(true);
  stubEstimate(async () => ({ usage: 0, quota: 100 }));
  mockConnectWorkspace.mockImplementation(async () => {
    const handle = await globalThis.window.showDirectoryPicker({ id: 'tau-workspace', mode: 'readwrite' });
    const workspace = await mockCreateWorkspace(handle);
    return { workspace, projectCount: 0, minted: workspace.minted };
  });
});

afterEach(() => {
  Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: undefined });
});

describe('FileSystemSettings storage usage', () => {
  it('warns when origin storage is above 80% of quota', async () => {
    stubEstimate(async () => ({ usage: 85, quota: 100 }));

    render(<FileSystemSettings />);

    expect(await screen.findByText(/storage is nearly full/i)).toBeInTheDocument();
  });

  it('does not warn below the pressure threshold', async () => {
    stubEstimate(async () => ({ usage: 10, quota: 100 }));

    render(<FileSystemSettings />);

    await screen.findByText(/available/i);
    expect(screen.queryByText(/storage is nearly full/i)).not.toBeInTheDocument();
  });

  it('logs instead of silently swallowing an estimate failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubEstimate(async () => {
      throw new Error('estimate unavailable');
    });

    render(<FileSystemSettings />);

    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
  });
});

describe('FileSystemSettings workspace creation', () => {
  const connect = async (): Promise<void> => {
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => ({ name: 'tau-workspace' }),
    });
    render(<FileSystemSettings />);
    const addButton = await screen.findByRole('button', { name: /add workspace/i });
    addButton.click();
  };

  it('reports the workspace identity once, and only for a minted workspace', async () => {
    mockCreateWorkspace.mockResolvedValue({
      workspaceId: 'wsp_new',
      name: 'tau-workspace',
      lastConnectedAt: 1,
      slug: 'tau-workspace',
      minted: true,
    });

    await connect();

    await waitFor(() => {
      expect(mockWorkspaceCreated).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'wsp_new' });
    });
    expect(mockCreateWorkspace).toHaveBeenCalledWith(expect.anything());
  });

  it('does not count a reconnect as a creation', async () => {
    mockCreateWorkspace.mockResolvedValue({
      workspaceId: 'wsp_existing',
      name: 'tau-workspace',
      lastConnectedAt: 1,
      slug: 'tau-workspace',
      minted: false,
    });

    await connect();

    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalled();
    });
    expect(mockWorkspaceCreated).not.toHaveBeenCalled();
  });
});

describe('FileSystemSettings workspace disconnect', () => {
  const workspace = {
    workspaceId: 'wsp_connected',
    name: 'Workshop',
    lastConnectedAt: 1,
    slug: 'workshop',
  };
  const handle = mock<FileSystemDirectoryHandle>({ name: 'Workshop' });

  beforeEach(() => {
    mockListWorkspaces.mockResolvedValue([workspace]);
    const projects: ProjectFileSystemConfig[] = Array.from({ length: 102 }, (_, index) => ({
      projectId: `proj_${index}`,
      backend: 'webaccess',
      workspaceId: workspace.workspaceId,
      providerBasePath: `project-${index}`,
    }));
    mockListProjectsForWorkspace.mockResolvedValue(projects);
    mockGetWorkspace.mockResolvedValue({ workspace, handle });
    mockCheckHandlePermission.mockResolvedValue('granted');
    mockDisconnectWorkspace.mockResolvedValue({ workspace, handle });
  });

  it('should disconnect immediately even when projects remain bound and expose Undo', async () => {
    render(<FileSystemSettings />);

    const disconnect = await screen.findByRole('button', { name: 'Disconnect workspace' });
    fireEvent.click(disconnect);

    await waitFor(() => {
      expect(mockDisconnectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.workspaceId);
    });
    expect(mockAssertWorkspaceMutationAllowed).not.toHaveBeenCalled();
    expect(mockToastSuccess.mock.calls.at(-1)?.[0]).toBe('Disconnected workspace "Workshop"');

    const options = mockToastSuccess.mock.calls.at(-1)?.[1];
    if (!options) {
      throw new Error('Expected Undo toast options');
    }
    expect(options.action.label).toBe('Undo');
    await act(async () => options.action.onClick());

    await waitFor(() => {
      expect(mockRestoreWorkspaceHandle).toHaveBeenCalledExactlyOnceWith(workspace.workspaceId, handle);
    });
    expect(mockRefreshWorkspaceCatalog).toHaveBeenCalledOnce();
    expect(mockWorkspaceConnected).toHaveBeenCalledWith({ workspaceId: workspace.workspaceId });
  });

  it('should render Reconnect instead of Disconnect when the handle is absent', async () => {
    mockGetWorkspace.mockResolvedValue(undefined);

    render(<FileSystemSettings />);

    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
  });

  it('should surface Undo failures without an unhandled rejection', async () => {
    mockRestoreWorkspaceHandle.mockRejectedValue(new Error('restore failed'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<FileSystemSettings />);
    const disconnect = await screen.findByRole('button', { name: 'Disconnect workspace' });
    fireEvent.click(disconnect);
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled();
    });

    const options = mockToastSuccess.mock.calls.at(-1)?.[1];
    if (!options) {
      throw new Error('Expected Undo toast options');
    }
    await act(async () => options.action.onClick());

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to reconnect workspace.');
    });
    expect(error).toHaveBeenCalled();
  });
});
