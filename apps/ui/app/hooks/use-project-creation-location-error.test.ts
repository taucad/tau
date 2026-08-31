import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDirectoryRequiredError } from '#filesystem/workspace-errors.js';

type TestHandle = { readonly name: string };
type ToastAction = { readonly label: string; readonly onClick: () => void | Promise<void> };
type ToastOptions = { readonly action?: ToastAction };

const mockGetWorkspace =
  vi.fn<
    (
      workspaceId: string,
    ) => Promise<{ readonly workspace: { readonly workspaceId: string }; readonly handle: TestHandle } | undefined>
  >();
const mockRequestPermission = vi.fn<(handle: TestHandle) => Promise<boolean>>(async () => true);
const mockSyncProjectRoots = vi.fn(async () => undefined);
const mockRefreshWorkspaceCatalog = vi.fn(async () => undefined);
const mockBlocked = vi.fn();
const mockToastError = vi.fn<(message: string, options?: ToastOptions) => void>();
const mockToastSuccess = vi.fn();

vi.mock('#filesystem/handle-store.js', () => ({
  getWorkspace: mockGetWorkspace,
  requestHandlePermission: mockRequestPermission,
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ workspace: { syncProjectRoots: mockSyncProjectRoots } }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ refreshWorkspaceCatalog: mockRefreshWorkspaceCatalog }),
}));
vi.mock('#utils/workspace-telemetry.utils.js', () => ({
  useWorkspaceTelemetry: () => ({ projectCreateWebaccessBlocked: mockBlocked }),
}));
vi.mock('#components/ui/sonner.js', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

const { useProjectCreationLocationError } = await import('#hooks/use-project-creation-location-error.js');

describe('useProjectCreationLocationError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for unrelated errors', () => {
    const { result } = renderHook(() => useProjectCreationLocationError());
    expect(result.current(new Error('ordinary'))).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('grants the exact selected folder from the toast gesture and asks for explicit retry', async () => {
    const handle = { name: 'Workshop' };
    mockGetWorkspace.mockResolvedValue({ workspace: { workspaceId: 'wsp_workshop' }, handle });
    const { result } = renderHook(() => useProjectCreationLocationError());

    expect(result.current(new WorkspaceDirectoryRequiredError('permission', { workspaceId: 'wsp_workshop' }))).toBe(
      true,
    );
    expect(mockBlocked).toHaveBeenCalledWith({ reason: 'permission' });
    const action = mockToastError.mock.calls[0]?.[1]?.action;
    expect(action?.label).toBe('Grant access');
    await act(async () => {
      await action?.onClick();
    });
    expect(mockRequestPermission).toHaveBeenCalledWith(handle);
    expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
    expect(mockRefreshWorkspaceCatalog).toHaveBeenCalledOnce();
    expect(mockToastSuccess).toHaveBeenCalledWith('Folder access restored. Try creating the project again.');
  });

  it('opens location management separately so the source surface remains mounted', async () => {
    const open = vi.spyOn(globalThis.window, 'open').mockImplementation(() => null);
    const { result } = renderHook(() => useProjectCreationLocationError());
    expect(result.current(new WorkspaceDirectoryRequiredError('disconnected', { workspaceId: 'wsp_workshop' }))).toBe(
      true,
    );
    const action = mockToastError.mock.calls[0]?.[1]?.action;
    expect(action?.label).toBe('Manage locations');
    await action?.onClick();
    expect(open).toHaveBeenCalledWith('/files', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('explains unsupported capability without offering an invalid action', () => {
    const { result } = renderHook(() => useProjectCreationLocationError());
    expect(result.current(new WorkspaceDirectoryRequiredError('unsupported', { workspaceId: 'wsp_workshop' }))).toBe(
      true,
    );
    expect(mockToastError).toHaveBeenCalledWith('Home is the only project location available in this browser.');
  });
});
