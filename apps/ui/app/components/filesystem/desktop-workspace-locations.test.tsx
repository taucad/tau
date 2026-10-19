// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopWorkspaceLocations } from '#components/filesystem/desktop-workspace-locations.js';

const state = vi.hoisted(() => ({
  paths: ['/Users/tester/Downloads', '/Users/tester/Documents/Workshop'],
  disconnect: vi.fn<(path: string) => Promise<void>>(),
  checkPending: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  sync: vi.fn(async () => undefined),
  refreshCatalog: vi.fn(async () => undefined),
  connect: vi.fn(async () => undefined),
}));
const directories = {
  list: async () => [...state.paths],
  disconnect: state.disconnect,
  onChange: () => () => undefined,
};
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => ({ directories }),
  hostPathName: (path: string) => path.split('/').at(-1),
}));
vi.mock('#filesystem/handle-store.js', () => ({
  listWorkspaces: async () => [{ workspaceId: 'downloads', path: '/Users/tester/Downloads' }],
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ workspace: { disposeStorageRoot: state.dispose, syncProjectRoots: state.sync } }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    assertWorkspaceMutationAllowed: state.checkPending,
    refreshWorkspaceCatalog: state.refreshCatalog,
    connectWorkspace: state.connect,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.paths = ['/Users/tester/Downloads', '/Users/tester/Documents/Workshop'];
  state.disconnect.mockImplementation(async (path) => {
    state.paths = state.paths.filter((candidate) => candidate !== path);
  });
});

describe('DesktopWorkspaceLocations', () => {
  it('should remove the disconnected folder, keep other locations and explain that files remain', async () => {
    render(<DesktopWorkspaceLocations />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Downloads' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Disconnected Downloads. Your files are still on disk.',
    );
    expect(screen.queryByRole('button', { name: 'Disconnect Downloads' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect Workshop' })).toBeEnabled();
    expect(state.checkPending).toHaveBeenCalledWith('downloads');
    expect(state.dispose).toHaveBeenCalledWith('node:/Users/tester/Downloads');
    expect(state.sync).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(state.refreshCatalog).toHaveBeenCalledOnce();
    });
  });

  it('should preserve the connection and show recovery when a project is still open', async () => {
    state.disconnect.mockRejectedValue(new Error('Close projects in this folder before disconnecting.'));
    render(<DesktopWorkspaceLocations />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Downloads' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Close projects in this folder');
    expect(screen.getByRole('button', { name: 'Disconnect Downloads' })).toBeEnabled();
    expect(state.dispose).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should prevent duplicate disconnects while waiting for the host', async () => {
    const pending = Promise.withResolvers<void>();
    state.disconnect.mockReturnValue(pending.promise);
    render(<DesktopWorkspaceLocations />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Downloads' }));
    await waitFor(() => {
      expect(state.disconnect).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole('button', { name: 'Disconnect Downloads' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect a folder…' })).toBeDisabled();
    pending.resolve();
    await screen.findByRole('status');
  });
});
