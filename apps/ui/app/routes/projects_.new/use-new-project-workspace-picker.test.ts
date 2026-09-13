// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useNewProjectWorkspacePicker } from '#routes/projects_.new/use-new-project-workspace-picker.js';

const workspaceTau = {
  workspaceId: 'wsp_tau',
  name: 'tau-workspace',
  isDefault: true,
  lastConnectedAt: 1,
};
const workspaceInner = {
  workspaceId: 'wsp_inner',
  name: 'inner',
  isDefault: false,
  lastConnectedAt: 2,
};

const makeHandle = (name: string) => ({ kind: 'directory', name }) as unknown as FileSystemDirectoryHandle;

type TestWorkspace = {
  workspaceId: string;
  name: string;
  isDefault: boolean;
  lastConnectedAt: number;
};

const { mockListWorkspaces, mockGetWorkspace, mockCheckHandlePermission } = vi.hoisted(() => ({
  mockListWorkspaces: vi.fn<() => Promise<TestWorkspace[]>>(),
  mockGetWorkspace: vi.fn(),
  mockCheckHandlePermission: vi.fn<(handle: FileSystemDirectoryHandle) => Promise<PermissionState>>(),
}));

vi.mock('#constants/browser.constants.js', () => ({
  isFileSystemAccessSupported: true,
}));

vi.mock('#filesystem/handle-store.js', () => ({
  listWorkspaces: async () => mockListWorkspaces(),
  getWorkspace: async (workspaceId: string) => mockGetWorkspace(workspaceId) as unknown,
  checkHandlePermission: async (handle: FileSystemDirectoryHandle) => mockCheckHandlePermission(handle),
}));

describe('useNewProjectWorkspacePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListWorkspaces.mockResolvedValue([workspaceTau, workspaceInner]);
    mockGetWorkspace.mockImplementation(async (id: string) => {
      const workspace = id === workspaceTau.workspaceId ? workspaceTau : workspaceInner;
      return { workspace, handle: makeHandle(workspace.name) };
    });
    mockCheckHandlePermission.mockResolvedValue('granted');
  });

  it('bootstrap selects the default workspace when none is selected yet', async () => {
    const { result } = renderHook(() => useNewProjectWorkspacePicker());

    await waitFor(() => {
      expect(result.current.selectedWorkspaceId).toBe('wsp_tau');
    });
    expect(result.current.workspaceStatus).toBe('connected');
  });

  it('keeps a non-default workspace after setSelectedWorkspaceId', async () => {
    const { result } = renderHook(() => useNewProjectWorkspacePicker());

    await waitFor(() => {
      expect(result.current.selectedWorkspaceId).toBe('wsp_tau');
    });

    act(() => {
      result.current.setSelectedWorkspaceId('wsp_inner');
    });

    await waitFor(() => {
      expect(result.current.selectedWorkspaceId).toBe('wsp_inner');
    });
    expect(mockGetWorkspace).toHaveBeenCalledWith('wsp_inner');
  });

  it('does not let a slow getWorkspace for a previous selection overwrite the new status', async () => {
    let resolveStale:
      | ((value: { workspace: typeof workspaceTau; handle: FileSystemDirectoryHandle }) => void)
      | undefined;
    const stalePromise = new Promise<{ workspace: typeof workspaceTau; handle: FileSystemDirectoryHandle }>(
      (resolve) => {
        resolveStale = resolve;
      },
    );

    mockGetWorkspace.mockImplementation(async (id: string) => {
      if (id === workspaceTau.workspaceId) {
        return stalePromise;
      }
      return { workspace: workspaceInner, handle: makeHandle('inner') };
    });

    const { result } = renderHook(() => useNewProjectWorkspacePicker());

    await waitFor(() => {
      expect(result.current.selectedWorkspaceId).toBe('wsp_tau');
    });

    act(() => {
      result.current.setSelectedWorkspaceId('wsp_inner');
    });

    await waitFor(() => {
      expect(result.current.selectedWorkspaceId).toBe('wsp_inner');
      expect(result.current.workspaceStatus).toBe('connected');
    });

    resolveStale?.({ workspace: workspaceTau, handle: makeHandle('tau-workspace') });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });

    expect(result.current.selectedWorkspaceId).toBe('wsp_inner');
    expect(result.current.workspaceStatus).toBe('connected');
  });

  it('preserves an early selection when bootstrap completes after the user picks', async () => {
    let resolveList: ((value: Array<typeof workspaceTau>) => void) | undefined;
    const listPromise = new Promise<Array<typeof workspaceTau>>((resolve) => {
      resolveList = resolve;
    });
    mockListWorkspaces.mockReturnValue(listPromise);

    const { result } = renderHook(() => useNewProjectWorkspacePicker());

    act(() => {
      result.current.setSelectedWorkspaceId('wsp_inner');
    });

    resolveList?.([workspaceTau, workspaceInner]);

    await waitFor(() => {
      expect(result.current.selectedWorkspaceId).toBe('wsp_inner');
    });
  });

  it('re-probes status when bumpPermissionRevision is called', async () => {
    const { result } = renderHook(() => useNewProjectWorkspacePicker());

    await waitFor(() => {
      expect(result.current.workspaceStatus).toBe('connected');
    });

    mockCheckHandlePermission.mockClear();
    mockCheckHandlePermission.mockResolvedValue('prompt');

    act(() => {
      result.current.bumpPermissionRevision();
    });

    await waitFor(() => {
      expect(result.current.workspaceStatus).toBe('permission');
    });
    expect(mockCheckHandlePermission).toHaveBeenCalled();
  });
});
