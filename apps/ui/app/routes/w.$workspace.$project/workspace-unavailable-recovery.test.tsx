// @vitest-environment jsdom
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WorkspaceUnavailableRecovery } from '#routes/w.$workspace.$project/workspace-unavailable-recovery.js';

const {
  mockBindProjectToWorkspace,
  mockConnectWorkspace,
  mockRefreshWorkspaceCatalog,
  mockReplaceWorkspaceHandle,
  mockSend,
  mockToastError,
  mockToastSuccess,
  mockWorkspaceConnected,
  mockWorkspaceOpenFailed,
} = vi.hoisted(() => ({
  mockBindProjectToWorkspace: vi.fn(),
  mockConnectWorkspace: vi.fn(),
  mockRefreshWorkspaceCatalog: vi.fn(),
  mockReplaceWorkspaceHandle: vi.fn(),
  mockSend: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockWorkspaceConnected: vi.fn(),
  mockWorkspaceOpenFailed: vi.fn(),
}));

vi.mock('#components/ui/floating-panel.js', () => {
  const PassThrough = ({ children }: { children: ReactNode }): JSX.Element => <div>{children}</div>;
  return {
    FloatingPanel: PassThrough,
    FloatingPanelContent: PassThrough,
    FloatingPanelContentBody: PassThrough,
    FloatingPanelContentHeader: PassThrough,
    FloatingPanelContentTitle: PassThrough,
  };
});

vi.mock('#components/filesystem/workspace-directory-panel.js', () => ({
  WorkspaceDirectoryPanel: ({ onConnect }: { onConnect?: () => void }) => (
    <button type='button' onClick={onConnect}>
      Reconnect
    </button>
  ),
}));

vi.mock('#filesystem/handle-store.js', () => ({
  getWorkspace: vi.fn(),
  listWorkspaces: vi.fn(async () => []),
  requestHandlePermission: vi.fn(),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    bindProjectToWorkspace: mockBindProjectToWorkspace,
    fileManagerRef: { send: mockSend },
    workspace: { replaceWorkspaceHandle: mockReplaceWorkspaceHandle },
  }),
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    connectWorkspace: mockConnectWorkspace,
    refreshWorkspaceCatalog: mockRefreshWorkspaceCatalog,
  }),
}));

vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({
    workspaceConnected: mockWorkspaceConnected,
    workspaceCreated: vi.fn(),
    workspaceOpenFailed: mockWorkspaceOpenFailed,
  }),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
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

describe('WorkspaceUnavailableRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reconnects a disconnected workspace by exact id without rebinding the project', async () => {
    const handle = mock<FileSystemDirectoryHandle>({ name: 'Replacement' });
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn(async () => handle),
    });

    render(
      <WorkspaceUnavailableRecovery
        reason='disconnected'
        workspaceId='wsp_existing'
        workspaceName='Existing Workspace'
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(mockReplaceWorkspaceHandle).toHaveBeenCalledExactlyOnceWith('wsp_existing', handle);
    });
    expect(globalThis.window.showDirectoryPicker).toHaveBeenCalledExactlyOnceWith({
      id: 'tau-workspace-wsp_existing',
      mode: 'readwrite',
    });
    expect(mockSend).toHaveBeenCalledExactlyOnceWith({ type: 'reloadWorkspace' });
    expect(mockRefreshWorkspaceCatalog).toHaveBeenCalledOnce();
    expect(mockWorkspaceConnected).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'wsp_existing' });
    expect(mockBindProjectToWorkspace).not.toHaveBeenCalled();
    expect(mockConnectWorkspace).not.toHaveBeenCalled();
  });

  it('leaves the workspace disconnected when the picker is cancelled', async () => {
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn(async () => {
        throw new DOMException('Cancelled', 'AbortError');
      }),
    });

    render(<WorkspaceUnavailableRecovery reason='disconnected' workspaceId='wsp_existing' workspaceName='Existing' />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(mockWorkspaceOpenFailed).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'wsp_existing',
        reason: 'aborted',
      });
    });
    expect(mockReplaceWorkspaceHandle).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
