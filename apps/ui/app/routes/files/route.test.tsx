// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Workspace, WorkspaceEntry } from '@taucad/files-ui/filesystem/handle-store';
import type { WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';
import FilesRoute from '#routes/files/route.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

type ToastSuccessOptions = {
  readonly action: { readonly label: string; readonly onClick: () => void | Promise<void> };
};

const {
  catalogState,
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
    catalogState: { extraWorkspaces: [] as Workspace[] },
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

vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({
  checkHandlePermission: vi.fn(async () => 'granted'),
  getWorkspace: mockGetWorkspace,
  listWorkspaces: vi.fn(async () => [workspace, ...catalogState.extraWorkspaces]),
}));

vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({
    workspaceConnected: mockWorkspaceConnected,
    workspaceCreated: vi.fn(),
    workspaceOpenFailed: vi.fn(),
  }),
}));

vi.mock('@taucad/ui/components/sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: mockToastSuccess },
}));

vi.mock('@taucad/files-ui/constants/browser.constants', () => ({
  isFileSystemAccessSupported: true,
  directoryPicker: () => ({
    available: true,
    backend: 'webaccess',
    pick: async (options?: { id?: string; mode?: 'read' | 'readwrite' }) => {
      const handle = await globalThis.window.showDirectoryPicker({
        id: options?.id,
        mode: options?.mode ?? 'readwrite',
      });
      return { backend: 'webaccess', handle };
    },
  }),
  webAccessDirectoryPicker: () => ({
    pick: async (options?: { id?: string; mode?: 'read' | 'readwrite' }) =>
      globalThis.window.showDirectoryPicker({ id: options?.id, mode: options?.mode ?? 'readwrite' }),
  }),
}));

describe('FilesRoute workspace disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogState.extraWorkspaces = [];
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

/* T-A3.1 (D4.4): Files is a document page. The columns flow and the shell scrolls; each column's tree keeps a bounded
 * height of its own, so a long workspace list always has a scroll owner. */
describe('FilesRoute layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionState.connected = true;
    workspaceConnectionState.current = { phase: 'idle' };
    catalogState.extraWorkspaces = Array.from({ length: 29 }, (_unused, index) => ({
      workspaceId: `wsp_extra_${index}`,
      name: `Extra ${index}`,
      lastConnectedAt: 1,
      slug: `extra-${index}`,
    }));
    const entries = new Map<string, WorkspaceEntry>(
      [workspace, ...catalogState.extraWorkspaces].map((item) => [
        item.workspaceId,
        { workspace: item, handle: mock<FileSystemDirectoryHandle>({ name: item.name }) },
      ]),
    );
    mockGetWorkspace.mockImplementation(async (workspaceId) => entries.get(workspaceId));
  });

  it('should lay 30 workspaces out as a document with a bounded tree per column', async () => {
    const { container } = render(
      <TooltipProvider>
        <FilesRoute />
      </TooltipProvider>,
    );

    expect(await screen.findByText('Extra 28')).toBeInTheDocument();
    const pageRoot = container.firstElementChild;
    expect(pageRoot).not.toHaveClass('h-full');
    expect(container.querySelector('.auto-rows-fr')).toBeNull();
    expect(container.querySelector('.h-full')).toBeNull();

    const trees = container.querySelectorAll('[data-slot=files-column-tree]');
    // Home plus 30 workspaces.
    expect(trees).toHaveLength(31);
    for (const tree of trees) {
      expect(tree.className).toMatch(/(?:^|\s)max-h-\S+/);
      expect(tree).toHaveClass('overflow-auto');
    }
  });
});
