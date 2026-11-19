// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceConnectionState } from '@taucad/files-ui/machines/workspace-connection.machine';
import type { Workspace } from '@taucad/files-ui/filesystem/handle-store';
import { WorkspaceConnections } from '#components/filesystem/workspace-connections.js';
import { toast } from '@taucad/ui/components/sonner';
import type { RootStatus } from '@taucad/filesystem';
import { WorkspaceRecoveryPendingError } from '@taucad/ui-core/filesystem/workspace-errors';

const homePath = vi.hoisted(() => '/Users/tester/Library/Application Support/Tau/home');
const state = vi.hoisted(() => ({
  paths: ['/Users/tester/Documents/Tau Workspace'],
  disconnect: vi.fn<(path: string) => Promise<void>>(),
  checkPending: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  sync: vi.fn(async () => undefined),
  refreshCatalog: vi.fn(async () => undefined),
  connect: vi.fn(),
  retry: vi.fn(),
  connection: vi.fn<() => WorkspaceConnectionState>(),
  listWorkspaces: vi.fn<() => Promise<Workspace[]>>(),
  homeRoot: vi.fn(() => homePath),
  changed: undefined as (() => void) | undefined,
  removeWorkspace: vi.fn<(workspaceId: string) => Promise<boolean>>(),
  rootStatuses: [] as RootStatus[],
  fileManagerState: 'ready' as 'ready' | 'error',
  sendToFileManager: vi.fn(),
  selectDirectory: vi.fn<(options?: { id?: string; defaultPath?: string }) => Promise<string | undefined>>(),
  relink: vi.fn(),
  readEvidence: vi.fn(async () => ({ marker: undefined, projects: [], subfolders: [] })),
  syncMarker: vi.fn(async () => 'written'),
  createNodeWorkspace: vi.fn(),
}));
/** The root file manager, as far as the rows read it: its published root statuses and whether it is in `error`. */
const fileManagerRef = {
  getSnapshot: () => ({
    status: 'active',
    matches: (value: string) => value === state.fileManagerState,
    context: { rootStatuses: state.rootStatuses },
  }),
  subscribe: () => ({ unsubscribe: () => undefined }),
  send: state.sendToFileManager,
};
const workspace = {
  workspaceId: 'wsp_tau',
  name: 'Tau Workspace',
  path: '/Users/tester/Documents/Tau Workspace',
  slug: 'tau-workspace',
  lastConnectedAt: 1,
};
const directories = { list: async () => [...state.paths], disconnect: state.disconnect };
vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({
  desktopBridge: () => ({ directories, dialog: { selectDirectory: state.selectDirectory } }),
  nodeHomeRoot: state.homeRoot,
}));
vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({
  listWorkspaces: state.listWorkspaces,
  getWorkspace: async () => undefined,
  listProjectsForWorkspace: async () => [],
  removeWorkspace: state.removeWorkspace,
  relinkWorkspace: state.relink,
  syncNodeWorkspaceMarker: state.syncMarker,
  createNodeWorkspace: state.createNodeWorkspace,
  createWorkspace: vi.fn(),
  subscribeProjectRootConfigurationChanges: (listener: () => void) => {
    state.changed = listener;
    return () => {
      state.changed = undefined;
    };
  },
}));
vi.mock('@taucad/files-ui/constants/browser.constants', () => ({
  directoryPicker: () => ({ available: true, backend: 'node' }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    fileManagerRef,
    workspace: {
      disposeStorageRoot: state.dispose,
      syncProjectRoots: state.sync,
      mount: vi.fn(async () => undefined),
      unmount: vi.fn(),
    },
    scopedStorage: { readFile: vi.fn(async () => undefined) },
    writeFiles: vi.fn(async () => undefined),
  }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    assertWorkspaceMutationAllowed: state.checkPending,
    refreshWorkspaceCatalog: state.refreshCatalog,
    connectWorkspace: state.connect,
    retryWorkspaceConnection: state.retry,
    readFolderEvidence: state.readEvidence,
    workspaceConnection: state.connection(),
  }),
}));
vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({
    workspaceConnected: vi.fn(),
    workspaceCreated: vi.fn(),
    workspaceOpenFailed: vi.fn(),
  }),
}));
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TAU_TARGET', 'desktop');
  state.paths = [workspace.path];
  state.listWorkspaces.mockResolvedValue([workspace]);
  state.connection.mockReturnValue({ phase: 'idle' });
  state.retry.mockReset();
  /* The file service has started and published Home's status; a folder it has not published keeps its grant's word. */
  state.rootStatuses = [{ storageRootKey: `node:${homePath}`, backend: 'node', state: 'available' }];
  state.fileManagerState = 'ready';
  state.removeWorkspace.mockResolvedValue(true);
  state.disconnect.mockImplementation(async (path) => {
    state.paths = state.paths.filter((candidate) => candidate !== path);
  });
  state.connect.mockImplementation(async () => {
    state.paths = [workspace.path];
    return { workspace, minted: false, projectCount: 0 };
  });
  state.selectDirectory.mockImplementation(async () => {
    state.paths = [...new Set([...state.paths, workspace.path])];
    return workspace.path;
  });
  state.relink.mockImplementation(async () => ({ status: 'relinked', workspace, matched: 0, unmatched: [] }));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('WorkspaceConnections', () => {
  it('should omit desktop Home from manageable workspaces and location options', async () => {
    const home = { ...workspace, workspaceId: 'wsp_home', name: 'Home', path: state.homeRoot() };
    state.listWorkspaces.mockResolvedValue([home, workspace]);
    const onWorkspacesChange = vi.fn();
    render(<WorkspaceConnections onWorkspacesChange={onWorkspacesChange} />);

    expect(await screen.findByRole('button', { name: 'Disconnect workspace' })).toBeEnabled();
    expect(screen.getByText('Tau Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Home', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(onWorkspacesChange).toHaveBeenLastCalledWith([workspace]);
  });

  it.each(['desktop', 'web'])('should retain a regular workspace named Home on %s', async (target) => {
    vi.stubEnv('TAU_TARGET', target);
    const namedHome = { ...workspace, name: 'Home', path: target === 'desktop' ? workspace.path : undefined };
    state.listWorkspaces.mockResolvedValue([namedHome]);
    const onWorkspacesChange = vi.fn();
    render(<WorkspaceConnections onWorkspacesChange={onWorkspacesChange} />);

    expect(await screen.findByText('Home', { exact: true })).toBeInTheDocument();
    expect(onWorkspacesChange).toHaveBeenLastCalledWith([namedHome]);
    if (target === 'web') {
      expect(state.homeRoot).not.toHaveBeenCalled();
    }
  });

  it('should clear the connection error and refresh the workspace after a successful retry', async () => {
    state.paths = [];
    state.connect.mockRejectedValueOnce(new Error('Could not load workspace projects.'));
    const { rerender } = render(<WorkspaceConnections />);
    await screen.findByRole('button', { name: 'Reconnect' });
    fireEvent.click(screen.getByRole('button', { name: 'Add workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load workspace projects.');
    state.connection.mockReturnValue({
      phase: 'failed',
      operationId: 'connect-workspace',
      workspace,
      failedPhase: 'discovering',
      message: 'Could not load workspace projects.',
      retry: 'resume',
    });
    rerender(<WorkspaceConnections />);
    state.retry.mockImplementation(async () => {
      state.paths = [workspace.path];
      state.connection.mockReturnValue({ phase: 'idle' });
      return { workspace, minted: false, projectCount: 0 };
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Disconnect workspace' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it.each(['cancelled', 'failed'] as const)(
    'should keep the workspace disconnected when a retry is %s',
    async (outcome) => {
      state.paths = [];
      state.connection.mockReturnValue({
        phase: 'failed',
        operationId: 'connect-workspace',
        workspace,
        failedPhase: 'registering',
        message: 'Could not save workspace access.',
        retry: 'pick-again',
      });
      if (outcome === 'failed') {
        state.retry.mockRejectedValueOnce(new Error('Folder is unavailable.'));
      }
      render(<WorkspaceConnections />);
      await screen.findByRole('button', { name: 'Reconnect' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Choose folder again' }));
      });

      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
      if (outcome === 'failed') {
        expect(screen.getByRole('alert')).toHaveTextContent('Folder is unavailable.');
      }
    },
  );

  it('should disconnect and reconnect the same named workspace through the shared controls', async () => {
    render(<WorkspaceConnections />);
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect workspace' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Disconnected "Tau Workspace". Your files are still in the folder.',
    );
    expect(screen.getByText('Tau Workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
    expect(state.checkPending).toHaveBeenCalledWith(workspace.workspaceId);
    expect(state.dispose).toHaveBeenCalledWith('node:/Users/tester/Documents/Tau Workspace');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(await screen.findByRole('button', { name: 'Disconnect workspace' })).toBeInTheDocument();
    /* Reconnect relinks this workspace (D2, U2): the picked folder is the same one, so the row comes back as it was. */
    expect(state.relink).toHaveBeenCalledOnce();
    expect(state.relink.mock.calls[0]![0]).toBe(workspace.workspaceId);
    expect(state.connect).not.toHaveBeenCalled();
    expect(screen.getAllByText('Tau Workspace')).toHaveLength(1);
  });

  it('should retain a workspace and explain why an open project prevents disconnect', async () => {
    state.disconnect.mockRejectedValue(new Error('Close projects in this folder before disconnecting.'));
    render(<WorkspaceConnections />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Close projects in this folder');
    expect(screen.getByRole('button', { name: 'Disconnect workspace' })).toBeEnabled();
    expect(state.dispose).not.toHaveBeenCalled();
  });

  it('should prevent another action until disconnect finishes', async () => {
    const pending = Promise.withResolvers<void>();
    state.disconnect.mockReturnValue(pending.promise);
    render(<WorkspaceConnections />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect workspace' }));
    await waitFor(() => {
      expect(state.disconnect).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole('button', { name: 'Disconnect workspace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add workspace' })).toBeDisabled();
    pending.resolve();
    await screen.findByRole('status');
  });

  it('should refresh connection state from another window and unsubscribe on unmount', async () => {
    const { unmount } = render(<WorkspaceConnections />);
    await screen.findByRole('button', { name: 'Disconnect workspace' });
    await act(async () => {
      state.paths = [];
      state.changed?.();
    });
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeEnabled();
    unmount();
    expect(state.changed).toBeUndefined();
  });
  it('should label a granted folder that is not found from its published status', async () => {
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    render(<WorkspaceConnections />);

    expect(await screen.findByText('Folder not found')).toBeInTheDocument();
    expect(screen.queryByText('Workspace connected')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove from Tau' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.sendToFileManager).toHaveBeenCalledWith({
      type: 'recheckRoots',
      storageRootKeys: [`node:${workspace.path}`],
    });
  });

  it('should show an unclassified root failure as an error with its code, Try again and Remove', async () => {
    state.rootStatuses = [{ storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'error', code: 'EBUSY' }];
    render(<WorkspaceConnections />);

    expect(await screen.findByText('Couldn’t open this folder')).toBeInTheDocument();
    expect(screen.getByText(/EBUSY/)).toBeInTheDocument();
    expect(screen.queryByText('Can’t use this folder')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove from Tau' })).toBeEnabled();
  });

  it('should keep conflict for a folder that overlaps Tau’s own data', async () => {
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'conflict', code: 'AUTHORITY_ROOT_OVERLAP' },
    ];
    render(<WorkspaceConnections />);

    expect(await screen.findByText('Can’t use this folder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('should offer Locate on a folder that is not found', async () => {
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    render(<WorkspaceConnections />);

    expect(await screen.findByRole('button', { name: 'Locate…' })).toBeEnabled();
  });

  it('should relink a lost folder to the place Locate picks, open at its old place, and re-check it', async () => {
    const moved = '/Volumes/Archive/Tau Workspace';
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    state.selectDirectory.mockImplementation(async () => {
      state.paths = [...state.paths, moved];
      return moved;
    });
    state.relink.mockImplementation(async () => {
      state.paths = [moved];
      state.listWorkspaces.mockResolvedValue([{ ...workspace, path: moved }]);
      return { status: 'relinked', workspace: { ...workspace, path: moved }, matched: 1, unmatched: [] };
    });
    render(<WorkspaceConnections />);

    fireEvent.click(await screen.findByRole('button', { name: 'Locate…' }));

    await waitFor(() => {
      expect(state.relink).toHaveBeenCalledOnce();
    });
    expect(state.selectDirectory).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: workspace.path }));
    const [workspaceId, target, ports] = state.relink.mock.calls[0]! as [string, unknown, { readEvidence: unknown }];
    expect(workspaceId).toBe(workspace.workspaceId);
    expect(target).toEqual({ backend: 'node', path: moved, wasGranted: false });
    expect(ports.readEvidence).toBe(state.readEvidence);
    expect(await screen.findByText(moved)).toBeInTheDocument();
    expect(state.dispose).toHaveBeenCalledWith(`node:${workspace.path}`);
    expect(state.sync).toHaveBeenCalled();
    expect(state.createNodeWorkspace).not.toHaveBeenCalled();
  });

  it('should ask before relinking on weak evidence and release the pick when cancelled', async () => {
    const moved = '/Volumes/Archive/Tau Workspace';
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    state.selectDirectory.mockResolvedValue(moved);
    state.relink.mockResolvedValue({ status: 'confirm', matched: 3, total: 5 });
    render(<WorkspaceConnections />);

    fireEvent.click(await screen.findByRole('button', { name: 'Locate…' }));

    expect(await screen.findByText(/contains 3 of the 5 projects/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(state.disconnect).toHaveBeenCalledWith(moved);
    });
    expect(state.relink).toHaveBeenCalledOnce();
  });

  it('should relink this workspace when Reconnect picks another folder, adding no workspace (T-U2.1)', async () => {
    const elsewhere = '/Users/tester/Elsewhere/Tau Workspace';
    state.paths = [];
    state.selectDirectory.mockResolvedValue(elsewhere);
    render(<WorkspaceConnections />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(state.relink).toHaveBeenCalledOnce();
    });
    expect(state.relink.mock.calls[0]![0]).toBe(workspace.workspaceId);
    expect(state.relink.mock.calls[0]![1]).toMatchObject({ backend: 'node', path: elsewhere });
    expect(state.connect).not.toHaveBeenCalled();
    expect(state.createNodeWorkspace).not.toHaveBeenCalled();
  });

  it('should remove a lost folder from Tau while the file service is in error and restart it', async () => {
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    state.fileManagerState = 'error';
    state.dispose.mockRejectedValueOnce(new Error('The file manager is in error.'));
    state.removeWorkspace.mockImplementation(async () => {
      state.listWorkspaces.mockResolvedValue([]);
      return true;
    });
    render(<WorkspaceConnections />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from Tau' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Your files are still on disk');
    await waitFor(() => {
      expect(screen.queryByText('Tau Workspace')).not.toBeInTheDocument();
    });
    expect(state.disconnect).toHaveBeenCalledWith(workspace.path);
    expect(state.removeWorkspace).toHaveBeenCalledWith(workspace.workspaceId);
    expect(state.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      state.removeWorkspace.mock.invocationCallOrder[0]!,
    );
    await waitFor(() => {
      expect(state.sendToFileManager).toHaveBeenCalledWith({ type: 'initialize' });
    });
    expect(screen.queryByText(/Restart Tau/)).not.toBeInTheDocument();
  });

  it('should keep the row and say the change could not be saved when the grant cannot be revoked', async () => {
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    state.disconnect.mockRejectedValue(new Error('ENOSPC: no space left on device'));
    render(<WorkspaceConnections />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from Tau' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/^Couldn.t save/);
    expect(screen.getByText('Tau Workspace')).toBeInTheDocument();
    expect(state.removeWorkspace).not.toHaveBeenCalled();
  });

  it('should act on the folder each command was invoked on when two folders share a name (T-R3.2)', async () => {
    const name = 'tau-desktop-workspace';
    const kept = { ...workspace, workspaceId: 'wsp_kept', name, path: `/tmp/a/${name}`, lastConnectedAt: 1 };
    const missing = { ...workspace, workspaceId: 'wsp_missing', name, path: `/tmp/b/${name}`, lastConnectedAt: 2 };
    state.paths = [kept.path, missing.path];
    state.listWorkspaces.mockResolvedValue([missing, kept]);
    /* The page has just loaded: the rows are read, but the file service has not published a root status yet. */
    state.rootStatuses = [];
    const { rerender } = render(<WorkspaceConnections shouldGroupNotFound />);
    await waitFor(() => {
      expect(screen.getAllByText('tau-desktop-workspace')).toHaveLength(2);
    });

    /* A granted folder is not called Connected before its status is known, so no command can reach the wrong row. */
    expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
    expect(screen.queryByText('Connected', { exact: true })).not.toBeInTheDocument();
    state.rootStatuses = [
      { storageRootKey: `node:${kept.path}`, backend: 'node', state: 'available' },
      { storageRootKey: `node:${missing.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    rerender(<WorkspaceConnections shouldGroupNotFound />);
    /* Only the working folder reads Connected (D2); the lost one is in the not-found group. */
    expect(await screen.findAllByText('Connected', { exact: true })).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect workspace' }));
    await waitFor(() => {
      expect(state.disconnect).toHaveBeenCalledWith(kept.path);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove from Tau' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Tau' }));

    await waitFor(() => {
      expect(state.removeWorkspace).toHaveBeenCalledWith(kept.workspaceId);
    });
    expect(state.disconnect).not.toHaveBeenCalledWith(missing.path);
    expect(state.removeWorkspace).not.toHaveBeenCalledWith(missing.workspaceId);
  });

  it('should name the unfinished operation and link to its recovery when Remove is refused', async () => {
    state.rootStatuses = [
      { storageRootKey: `node:${workspace.path}`, backend: 'node', state: 'notFound', code: 'ENOENT' },
    ];
    state.checkPending.mockRejectedValueOnce(new WorkspaceRecoveryPendingError());
    render(
      <MemoryRouter>
        <WorkspaceConnections />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Remove from Tau' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('unfinished project operation');
    expect(screen.getByRole('link', { name: /unfinished project operation|project recovery/i })).toHaveAttribute(
      'href',
      '/projects#project-recovery',
    );
    expect(state.disconnect).not.toHaveBeenCalled();
    expect(state.removeWorkspace).not.toHaveBeenCalled();
  });
});
