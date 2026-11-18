// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Workspace, WorkspaceEntry } from '@taucad/files-ui/filesystem/handle-store';
import type { WorkspaceConnectionState } from '@taucad/files-ui/machines/workspace-connection.machine';
import FilesRoute from '#routes/files/route.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { RootStatus } from '@taucad/filesystem';

type ToastSuccessOptions = {
  readonly action: { readonly label: string; readonly onClick: () => void | Promise<void> };
};

const {
  desktop,
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
    desktop: {
      grants: [] as string[],
      rootStatuses: [] as RootStatus[],
      workspaces: undefined as Workspace[] | undefined,
    },
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
  const fileManagerRef = {
    getSnapshot: () => ({
      status: 'active',
      matches: () => false,
      context: { rootStatuses: desktop.rootStatuses },
    }),
    subscribe: () => ({ unsubscribe: () => undefined }),
    send: vi.fn(),
  };
  const value = {
    fileManagerRef,
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
  listWorkspaces: vi.fn(async () => desktop.workspaces ?? [workspace, ...catalogState.extraWorkspaces]),
  listProjectsForWorkspace: vi.fn(async () => []),
  removeWorkspace: vi.fn(async () => true),
  requestHandlePermission: vi.fn(async () => true),
  subscribeProjectRootConfigurationChanges: () => () => undefined,
}));

vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({
  desktopBridge: () => ({ directories: { list: async () => desktop.grants, disconnect: vi.fn() } }),
  nodeHomeRoot: () => '/Users/tester/Library/Application Support/Tau/home',
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

describe('FilesRoute folders that are not found', () => {
  const nodeWorkspace = (name: string): Workspace => ({
    workspaceId: `wsp_${name.toLowerCase()}`,
    name,
    slug: name.toLowerCase(),
    lastConnectedAt: 1,
    path: `/Users/tester/${name}`,
  });
  const connected = nodeWorkspace('Workshop');
  const lostA = nodeWorkspace('Scratch');
  const lostB = nodeWorkspace('Archive');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TAU_TARGET', 'desktop');
    workspaceConnectionState.current = { phase: 'idle' };
    desktop.workspaces = [lostA, connected, lostB];
    desktop.grants = [connected.path!, lostA.path!, lostB.path!];
    desktop.rootStatuses = [
      { storageRootKey: `node:${connected.path!}`, backend: 'node', state: 'available' },
      { storageRootKey: `node:${lostA.path!}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
      { storageRootKey: `node:${lostB.path!}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    desktop.workspaces = undefined;
  });

  it('should collapse the not-found rows into one group with Remove all below the working rows', async () => {
    render(
      <TooltipProvider>
        <FilesRoute />
      </TooltipProvider>,
    );

    const group = await screen.findByRole('button', { name: 'Folders not found (2)' });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Remove all' })).toBeEnabled();
    const ordered = [...document.body.querySelectorAll('span, button')];
    expect(ordered.indexOf(screen.getByText('Workshop'))).toBeLessThan(ordered.indexOf(group));
    expect(screen.queryByText('Scratch')).not.toBeInTheDocument();
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();

    fireEvent.click(group);

    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Scratch')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });
});
