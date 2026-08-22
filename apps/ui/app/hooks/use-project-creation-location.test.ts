import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectCreationLocationRead, Workspace, WorkspaceConnection } from '#filesystem/handle-store.js';
import type { ProjectCreationLocationState } from '#hooks/use-project-creation-location.js';

type TestHandle = { readonly name: string };
type TestWorkspaceEntry = { readonly workspace: Workspace; readonly handle: TestHandle };
type CapableReadyState = Extract<ProjectCreationLocationState, { phase: 'ready'; hasWebAccessCapability: true }>;

let supported = true;
const mockListWorkspaces = vi.fn<() => Promise<Workspace[]>>(async () => []);
const mockGetWorkspace = vi.fn<(workspaceId: string) => Promise<TestWorkspaceEntry | undefined>>(async () => undefined);
const mockCheckPermission = vi.fn<(handle: TestHandle) => Promise<PermissionState>>(async () => 'granted');
const mockRequestPermission = vi.fn<(handle: TestHandle) => Promise<boolean>>(async () => true);
const mockCreateWorkspace = vi.fn<(handle: TestHandle) => Promise<WorkspaceConnection>>();
const mockGetPreference = vi.fn<() => Promise<ProjectCreationLocationRead>>(async () => ({
  location: { kind: 'home' },
  repaired: undefined,
}));
const mockSyncProjectRoots = vi.fn(async () => undefined);
const mockReplaceWorkspaceHandle = vi.fn(async () => undefined);
const mockWorkspaceCreated = vi.fn();
const mockWorkspaceConnected = vi.fn();
const mockWorkspaceOpenFailed = vi.fn();
const mockToastError = vi.fn();

vi.mock('#constants/browser.constants.js', () => ({
  get isFileSystemAccessSupported() {
    return supported;
  },
}));

vi.mock('#filesystem/handle-store.js', () => ({
  listWorkspaces: mockListWorkspaces,
  getWorkspace: mockGetWorkspace,
  checkHandlePermission: mockCheckPermission,
  requestHandlePermission: mockRequestPermission,
  createWorkspace: mockCreateWorkspace,
  getProjectCreationLocation: mockGetPreference,
}));

vi.mock('#hooks/use-file-manager.js', () => {
  const workspaceManager = {
    syncProjectRoots: mockSyncProjectRoots,
    replaceWorkspaceHandle: mockReplaceWorkspaceHandle,
  };
  return { useFileManager: () => ({ workspace: workspaceManager }) };
});

vi.mock('#utils/workspace-telemetry.utils.js', () => {
  const telemetry = {
    workspaceCreated: mockWorkspaceCreated,
    workspaceConnected: mockWorkspaceConnected,
    workspaceOpenFailed: mockWorkspaceOpenFailed,
  };
  return { useWorkspaceTelemetry: () => telemetry };
});

vi.mock('#components/ui/sonner.js', () => ({ toast: { error: mockToastError } }));

const { useProjectCreationLocation } = await import('#hooks/use-project-creation-location.js');

const workspace = (workspaceId: string, name: string, lastConnectedAt: number): Workspace => ({
  workspaceId,
  name,
  lastConnectedAt,
  slug: name.toLowerCase(),
});

const capableReady = (state: ProjectCreationLocationState): CapableReadyState => {
  if (state.phase !== 'ready' || !state.hasWebAccessCapability) {
    throw new Error('Expected capable ready state');
  }
  return state;
};

const waitForReady = async (result: { readonly current: ProjectCreationLocationState }): Promise<void> => {
  await waitFor(() => {
    expect(result.current.phase).toBe('ready');
  });
};

describe('useProjectCreationLocation', () => {
  beforeEach(() => {
    supported = true;
    vi.clearAllMocks();
    mockListWorkspaces.mockResolvedValue([]);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCheckPermission.mockResolvedValue('granted');
    mockRequestPermission.mockResolvedValue(true);
    mockGetPreference.mockResolvedValue({ location: { kind: 'home' }, repaired: undefined });
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('is synchronously Home-only and exposes no picker without folder capability', async () => {
    supported = false;
    const { result } = renderHook(() => useProjectCreationLocation());

    expect(result.current).toMatchObject({
      phase: 'ready',
      hasWebAccessCapability: false,
      shouldShowPicker: false,
      value: { kind: 'home' },
      options: [{ label: 'Home', detail: 'in this browser' }],
      canCreate: true,
    });
    await waitFor(() => {
      expect(mockGetPreference).toHaveBeenCalledWith({ webAccessSupported: false });
    });
  });

  it('loads a capable zero-folder state with Home and the connect action', async () => {
    const { result } = renderHook(() => useProjectCreationLocation());
    expect(result.current).toMatchObject({ phase: 'loading', shouldShowPicker: true, canCreate: false });

    await waitForReady(result);
    expect(result.current).toMatchObject({
      hasWebAccessCapability: true,
      shouldShowPicker: true,
      value: { kind: 'home' },
      options: [{ label: 'Home' }],
      canCreate: true,
    });
  });

  it('restores the exact preference and models connected, permission, and disconnected rows', async () => {
    const rows = [workspace('wsp_old', 'Old', 1), workspace('wsp_new', 'New', 3), workspace('wsp_locked', 'Locked', 2)];
    mockListWorkspaces.mockResolvedValue(rows);
    mockGetPreference.mockResolvedValue({
      location: { kind: 'workspace', workspaceId: 'wsp_locked' },
      repaired: undefined,
    });
    mockGetWorkspace.mockImplementation(async (id: string) =>
      id === 'wsp_old'
        ? undefined
        : {
            workspace: rows.find((row) => row.workspaceId === id)!,
            handle: { name: id },
          },
    );
    mockCheckPermission.mockImplementation(async (handle) => (handle.name === 'wsp_locked' ? 'denied' : 'granted'));

    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    if (result.current.phase !== 'ready' || !result.current.hasWebAccessCapability) {
      throw new Error('Expected capable ready state');
    }
    expect(result.current.options.map((option) => [option.label, option.status])).toEqual([
      ['Home', 'ready'],
      ['New', 'connected'],
      ['Locked', 'permission'],
      ['Old', 'disconnected'],
    ]);
    expect(result.current.value).toEqual({ kind: 'workspace', workspaceId: 'wsp_locked' });
    expect(result.current.canCreate).toBe(false);
    expect(result.current.selectedWorkspaceRecovery?.kind).toBe('grant');
  });

  it('selects an unavailable row before granting it and refreshes after the gesture', async () => {
    const locked = workspace('wsp_locked', 'Locked', 1);
    const handle = { name: 'Locked' };
    mockListWorkspaces.mockResolvedValue([locked]);
    mockGetWorkspace.mockResolvedValue({ workspace: locked, handle });
    mockCheckPermission.mockResolvedValueOnce('denied').mockResolvedValue('granted');

    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    const selectedState = capableReady(result.current);
    act(() => {
      selectedState.select({ kind: 'workspace', workspaceId: locked.workspaceId });
    });
    expect(result.current.canCreate).toBe(false);
    const recovery = capableReady(result.current).selectedWorkspaceRecovery;
    expect(recovery?.kind).toBe('grant');

    await act(async () => {
      await recovery?.run();
    });
    expect(mockRequestPermission).toHaveBeenCalledWith(handle);
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
    expect(mockWorkspaceConnected).toHaveBeenCalledWith({ workspaceId: locked.workspaceId });
    expect(result.current.canCreate).toBe(true);
  });

  it('opens the picker before any asynchronous connect work and selects the connected folder', async () => {
    let resolvePicker!: (handle: TestHandle) => void;
    const pickedHandle = { name: 'Workshop' };
    const showDirectoryPicker = vi.fn(
      async () =>
        new Promise<TestHandle>((resolve) => {
          resolvePicker = resolve;
        }),
    );
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', { configurable: true, value: showDirectoryPicker });
    const connected = workspace('wsp_workshop', 'Workshop', 1);
    mockCreateWorkspace.mockResolvedValue({ ...connected, minted: true });
    mockListWorkspaces.mockResolvedValueOnce([]).mockResolvedValue([connected]);
    mockGetWorkspace.mockResolvedValue({ workspace: connected, handle: pickedHandle });

    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    const readyState = capableReady(result.current);
    let connecting!: Promise<void>;
    act(() => {
      connecting = readyState.connectWorkspace();
    });
    expect(showDirectoryPicker).toHaveBeenCalledOnce();
    expect(mockCreateWorkspace).not.toHaveBeenCalled();

    await act(async () => {
      resolvePicker(pickedHandle);
      await connecting;
    });
    expect(mockCreateWorkspace).toHaveBeenCalledWith(pickedHandle);
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
    expect(mockWorkspaceCreated).toHaveBeenCalledWith({ workspaceId: connected.workspaceId });
    expect(capableReady(result.current).value).toEqual({ kind: 'workspace', workspaceId: connected.workspaceId });
  });

  it('reports a cancelled connect once without showing an error', async () => {
    vi.mocked(globalThis.window.showDirectoryPicker).mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    const readyState = capableReady(result.current);
    await act(async () => {
      await readyState.connectWorkspace();
    });
    expect(mockWorkspaceOpenFailed).toHaveBeenCalledExactlyOnceWith({ workspaceId: undefined, reason: 'aborted' });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(capableReady(result.current).value).toEqual({ kind: 'home' });
  });

  it('reconnects a known workspace without changing the selected location', async () => {
    const disconnected = workspace('wsp_disconnected', 'Disconnected', 1);
    const replacementHandle = { name: 'Reconnected' };
    mockListWorkspaces.mockResolvedValue([disconnected]);
    mockGetPreference.mockResolvedValue({
      location: { kind: 'workspace', workspaceId: disconnected.workspaceId },
      repaired: undefined,
    });
    mockGetWorkspace
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ workspace: disconnected, handle: replacementHandle });
    vi.mocked(globalThis.window.showDirectoryPicker).mockResolvedValue(
      replacementHandle as unknown as FileSystemDirectoryHandle,
    );

    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    const recovery = capableReady(result.current).selectedWorkspaceRecovery;
    expect(recovery?.kind).toBe('reconnect');

    await act(async () => {
      await recovery?.run();
    });

    expect(globalThis.window.showDirectoryPicker).toHaveBeenCalledOnce();
    expect(mockReplaceWorkspaceHandle).toHaveBeenCalledWith(disconnected.workspaceId, replacementHandle);
    expect(mockWorkspaceConnected).toHaveBeenCalledWith({ workspaceId: disconnected.workspaceId });
    expect(capableReady(result.current).value).toEqual({
      kind: 'workspace',
      workspaceId: disconnected.workspaceId,
    });
    expect(result.current.canCreate).toBe(true);
  });

  it('retains a disconnected selection when reconnect is cancelled', async () => {
    const disconnected = workspace('wsp_disconnected', 'Disconnected', 1);
    mockListWorkspaces.mockResolvedValue([disconnected]);
    mockGetPreference.mockResolvedValue({
      location: { kind: 'workspace', workspaceId: disconnected.workspaceId },
      repaired: undefined,
    });
    mockGetWorkspace.mockResolvedValue(undefined);
    vi.mocked(globalThis.window.showDirectoryPicker).mockRejectedValue(new DOMException('Cancelled', 'AbortError'));

    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    const recovery = capableReady(result.current).selectedWorkspaceRecovery;
    await act(async () => {
      await recovery?.run();
    });

    expect(mockWorkspaceOpenFailed).toHaveBeenCalledExactlyOnceWith({
      workspaceId: disconnected.workspaceId,
      reason: 'aborted',
    });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(capableReady(result.current).value).toEqual({
      kind: 'workspace',
      workspaceId: disconnected.workspaceId,
    });
    expect(result.current.canCreate).toBe(false);
  });

  it('keeps action identities stable across ready-state refreshes', async () => {
    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    const initial = capableReady(result.current);

    await act(async () => {
      await initial.refresh();
    });

    const refreshed = capableReady(result.current);
    expect(refreshed.select).toBe(initial.select);
    expect(refreshed.connectWorkspace).toBe(initial.connectWorkspace);
    expect(refreshed.refresh).toBe(initial.refresh);
  });

  it('ignores a stale refresh that resolves after a newer one', async () => {
    const oldWorkspace = workspace('wsp_old', 'Old', 1);
    const newWorkspace = workspace('wsp_new', 'New', 2);
    const { result } = renderHook(() => useProjectCreationLocation());
    await waitForReady(result);
    let resolveOld!: (workspaces: Workspace[]) => void;
    let resolveNew!: (workspaces: Workspace[]) => void;
    mockListWorkspaces
      .mockImplementationOnce(
        async () =>
          new Promise<Workspace[]>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        async () =>
          new Promise<Workspace[]>((resolve) => {
            resolveNew = resolve;
          }),
      );
    mockGetWorkspace.mockImplementation(async (workspaceId) => {
      const row = workspaceId === newWorkspace.workspaceId ? newWorkspace : oldWorkspace;
      return { workspace: row, handle: { name: row.name } };
    });

    const firstRefresh = capableReady(result.current).refresh();
    const secondRefresh = capableReady(result.current).refresh();
    await act(async () => {
      resolveNew([newWorkspace]);
      await secondRefresh;
      resolveOld([oldWorkspace]);
      await firstRefresh;
    });

    expect(capableReady(result.current).options.map(({ label }) => label)).toEqual(['Home', 'New']);
  });

  it('ignores a pending load after unmount', async () => {
    let resolveWorkspaces!: (workspaces: Workspace[]) => void;
    mockListWorkspaces.mockImplementation(
      async () =>
        new Promise<Workspace[]>((resolve) => {
          resolveWorkspaces = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useProjectCreationLocation());
    expect(result.current.phase).toBe('loading');

    unmount();
    resolveWorkspaces([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.phase).toBe('loading');
  });
});
