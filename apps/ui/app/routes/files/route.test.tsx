// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Workspace, WorkspaceEntry } from '#filesystem/handle-store.js';
import type { WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';
import FilesRoute from '#routes/files/route.js';
import { TooltipProvider } from '#components/ui/tooltip.js';

type ToastSuccessOptions = {
  readonly action: { readonly label: string; readonly onClick: () => void | Promise<void> };
};

const {
  connectionState,
  mockAssertWorkspaceMutationAllowed,
  mockDisconnectWorkspace,
  mockGetWorkspace,
  mockRefreshWorkspaceCatalog,
  mockRestoreWorkspaceHandle,
  mockToastSuccess,
  mockWorkspaceConnected,
  workspaceConnectionState,
} = vi.hoisted(() => {
  const workspaceConnectionState: { current: WorkspaceConnectionState } = { current: { phase: 'idle' } };
  return {
    connectionState: { connected: true },
    mockAssertWorkspaceMutationAllowed: vi.fn(),
    mockDisconnectWorkspace: vi.fn<(workspaceId: string) => Promise<WorkspaceEntry | undefined>>(),
    mockGetWorkspace: vi.fn<(workspaceId: string) => Promise<WorkspaceEntry | undefined>>(),
    mockRefreshWorkspaceCatalog: vi.fn(),
    mockRestoreWorkspaceHandle: vi.fn<(workspaceId: string, handle: FileSystemDirectoryHandle) => Promise<boolean>>(),
    mockToastSuccess: vi.fn<(message: string, options?: ToastSuccessOptions) => void>(),
    mockWorkspaceConnected: vi.fn(),
    workspaceConnectionState,
  };
});

const workspace: Workspace = {
  workspaceId: 'wsp_connected',
  name: 'Workshop',
  lastConnectedAt: 1,
  slug: 'workshop',
};
const handle = mock<FileSystemDirectoryHandle>({ name: 'Workshop' });
const entry: WorkspaceEntry = { workspace, handle };

vi.mock('#hooks/use-file-manager.js', () => {
  const value = {
    client: {
      getZippedDirectory: vi.fn(),
      readFile: vi.fn(),
      readShallowDirectory: vi.fn(async () => []),
    },
    workspace: {
      disconnectWorkspace: mockDisconnectWorkspace,
      restoreWorkspaceHandle: mockRestoreWorkspaceHandle,
    },
  };
  return {
    useFileManager: () => value,
    useHomeStorageBackend: () => 'indexeddb',
  };
});

vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: [] }) }));
vi.mock('#hooks/use-project-slug-route.js', () => ({ useProjectUrl: () => '/projects/test' }));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    assertWorkspaceMutationAllowed: mockAssertWorkspaceMutationAllowed,
    connectWorkspace: vi.fn(),
    refreshWorkspaceCatalog: mockRefreshWorkspaceCatalog,
    retryWorkspaceConnection: vi.fn(),
    workspaceConnection: workspaceConnectionState.current,
  }),
}));

vi.mock('#filesystem/handle-store.js', () => ({
  checkHandlePermission: vi.fn(async () => 'granted'),
  getWorkspace: mockGetWorkspace,
  listWorkspaces: vi.fn(async () => [workspace]),
}));

vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({
    workspaceConnected: mockWorkspaceConnected,
    workspaceCreated: vi.fn(),
    workspaceOpenFailed: vi.fn(),
  }),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: mockToastSuccess },
}));

vi.mock('#constants/browser.constants.js', () => ({ isFileSystemAccessSupported: true }));

describe('FilesRoute workspace disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionState.connected = true;
    workspaceConnectionState.current = { phase: 'idle' };
    mockGetWorkspace.mockImplementation(async () => (connectionState.connected ? entry : undefined));
    mockDisconnectWorkspace.mockImplementation(async () => {
      if (!connectionState.connected) {
        return undefined;
      }
      connectionState.connected = false;
      return entry;
    });
    mockRestoreWorkspaceHandle.mockImplementation(async () => {
      if (connectionState.connected) {
        return false;
      }
      connectionState.connected = true;
      return true;
    });
  });

  it('removes the column immediately and restores it through toast Undo', async () => {
    render(
      <TooltipProvider>
        <FilesRoute />
      </TooltipProvider>,
    );

    expect(await screen.findByText('Workshop')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect workspace' }));

    await waitFor(() => {
      expect(screen.queryByText('Workshop')).not.toBeInTheDocument();
    });
    expect(mockAssertWorkspaceMutationAllowed).not.toHaveBeenCalled();
    expect(mockToastSuccess.mock.calls.at(-1)?.[0]).toBe('Disconnected workspace "Workshop"');

    const options = mockToastSuccess.mock.calls.at(-1)?.[1];
    if (!options) {
      throw new Error('Expected Undo toast options');
    }
    expect(options.action.label).toBe('Undo');
    await act(async () => options.action.onClick());

    expect(await screen.findByText('Workshop')).toBeInTheDocument();
    expect(mockRestoreWorkspaceHandle).toHaveBeenCalledExactlyOnceWith(workspace.workspaceId, handle);
    expect(mockRefreshWorkspaceCatalog).toHaveBeenCalledOnce();
    expect(mockWorkspaceConnected).toHaveBeenCalledExactlyOnceWith({ workspaceId: workspace.workspaceId });
  });

  it('shows selected-workspace conflicts instead of unrelated Home projects as ready', async () => {
    workspaceConnectionState.current = {
      phase: 'ready',
      operationId: 'req_connection',
      workspace,
      projectCount: 0,
      candidateCount: 47,
      conflictCount: 47,
      observation: 'starting',
    };

    render(
      <TooltipProvider>
        <FilesRoute />
      </TooltipProvider>,
    );

    expect(await screen.findByText('0 projects ready')).toBeInTheDocument();
    expect(screen.getByText('47 projects need attention')).toBeInTheDocument();
    expect(screen.queryByText('2 projects ready')).not.toBeInTheDocument();
  });
});
