// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceConnections } from '#components/filesystem/workspace-connections.js';

const state = vi.hoisted(() => ({
  paths: ['/Users/tester/Documents/Tau Workspace'],
  disconnect: vi.fn<(path: string) => Promise<void>>(),
  checkPending: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  sync: vi.fn(async () => undefined),
  refreshCatalog: vi.fn(async () => undefined),
  connect: vi.fn(),
  changed: undefined as (() => void) | undefined,
}));
const workspace = {
  workspaceId: 'wsp_tau',
  name: 'Tau Workspace',
  path: '/Users/tester/Documents/Tau Workspace',
  slug: 'tau-workspace',
  lastConnectedAt: 1,
};
const directories = { list: async () => [...state.paths], disconnect: state.disconnect };
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => ({ directories }) }));
vi.mock('#filesystem/handle-store.js', () => ({
  listWorkspaces: async () => [workspace],
  subscribeProjectRootConfigurationChanges: (listener: () => void) => {
    state.changed = listener;
    return () => {
      state.changed = undefined;
    };
  },
}));
vi.mock('#constants/browser.constants.js', () => ({ directoryPicker: () => ({ available: true, backend: 'node' }) }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ workspace: { disposeStorageRoot: state.dispose, syncProjectRoots: state.sync } }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    assertWorkspaceMutationAllowed: state.checkPending,
    refreshWorkspaceCatalog: state.refreshCatalog,
    connectWorkspace: state.connect,
    workspaceConnection: { phase: 'idle' },
  }),
}));
vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({
    workspaceConnected: vi.fn(),
    workspaceCreated: vi.fn(),
    workspaceOpenFailed: vi.fn(),
  }),
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TAU_TARGET', 'desktop');
  state.paths = [workspace.path];
  state.disconnect.mockImplementation(async (path) => {
    state.paths = state.paths.filter((candidate) => candidate !== path);
  });
  state.connect.mockImplementation(async () => {
    state.paths = [workspace.path];
    return { workspace, minted: false, projectCount: 0 };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('WorkspaceConnections on desktop', () => {
  it('should disconnect and reconnect the same named workspace through the shared controls', async () => {
    render(<WorkspaceConnections />);
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect workspace' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Disconnected workspace "Tau Workspace". Your files are still on disk.',
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
    expect(state.connect).toHaveBeenCalledOnce();
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
});
