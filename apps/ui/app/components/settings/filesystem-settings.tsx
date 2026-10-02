/**
 * Filesystem settings pane.
 *
 * Surfaces the multi-workspace foundation introduced by the workspaces
 * audit (R4 + R12 + R13 + R19):
 *
 * - Lists every connected workspace; each row owns its own connect /
 *   grant-access / change / forget controls via `WorkspaceDirectoryPanel`.
 * - Lets the user toggle the default workspace used by new webaccess
 *   projects.
 * - Disables the webaccess option in the default-backend picker when no
 *   workspace is connected — clicking that option would otherwise leave
 *   `/projects/new` immediately blocked by a `WorkspaceDirectoryRequiredError`.
 * - Renames the bottom card to "Origin Storage Usage" so users understand
 *   IndexedDB + OPFS are the only buckets counted by `navigator.storage`
 *   (webaccess workspaces sit outside the browser origin).
 *
 * Cookie semantics: the `filesystem-backend` cookie controls which
 * backend the next "New Project" creation defaults to. It does NOT
 * retroactively change the backend of an existing project — that
 * binding is owned by `ProjectFileSystemConfig` in `handle-store`.
 */

import { useState, useCallback, useEffect } from 'react';
import { HardDrive, Plus } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { BackendSelector, coerceFilesystemBackendCookie } from '#components/filesystem/backend-selector.js';
import type { SelectableFilesystemBackend } from '#components/filesystem/backend-selector.js';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';
import {
  checkHandlePermission,
  createWorkspace,
  forgetWorkspace,
  getWorkspace,
  listProjectsForWorkspace,
  listWorkspaces,
  requestHandlePermission,
  setDefaultWorkspace,
  updateWorkspaceHandle,
} from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';
import { Loader } from '#components/ui/loader.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';

type WorkspaceRow = {
  workspace: Workspace;
  status: WorkspaceDirectoryStatus;
  projectCount: number;
};

export function FileSystemSettings(): React.JSX.Element {
  const [rawBackendCookie, setRawBackendCookie] = useCookie(cookieName.filesystemBackend, 'indexeddb');
  const backendCookie: SelectableFilesystemBackend = coerceFilesystemBackendCookie(rawBackendCookie);
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | undefined>(undefined);
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const telemetry = useWorkspaceTelemetry();

  const reloadRows = useCallback(async (): Promise<void> => {
    try {
      const workspaces = await listWorkspaces();
      const built = await Promise.all(
        workspaces.map(async (workspace): Promise<WorkspaceRow> => {
          const entry = await getWorkspace(workspace.workspaceId);
          let status: WorkspaceDirectoryStatus = 'missing';
          if (entry) {
            const permission = await checkHandlePermission(entry.handle);
            status = permission === 'granted' ? 'connected' : 'permission';
          }
          const projects = await listProjectsForWorkspace(workspace.workspaceId);
          return { workspace, status, projectCount: projects.length };
        }),
      );
      setRows(built);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadRows();
  }, [reloadRows]);

  const hasConnectedWorkspace = rows.some((row) => row.status === 'connected');

  // Audit R13: webaccess is disabled as a default when no workspace is
  // connected. Picking it would immediately fail at `/projects/new` with
  // `WorkspaceDirectoryRequiredError`. The selector still surfaces the
  // option so users can read the description, but it stays unselectable
  // until the user adds a workspace below.
  const handleBackendChange = useCallback(
    (value: string) => {
      const next = value as SelectableFilesystemBackend;
      if (next === 'webaccess' && !hasConnectedWorkspace) {
        toast.error('Connect a workspace folder first to set File System as the default backend.');
        return;
      }
      setRawBackendCookie(next);
    },
    [hasConnectedWorkspace, setRawBackendCookie],
  );

  const handleAddWorkspace = useCallback(async () => {
    if (!isFileSystemAccessSupported) {
      return;
    }
    setIsAddingWorkspace(true);
    try {
      const handle = await globalThis.window.showDirectoryPicker({
        id: 'tau-workspace',
        mode: 'readwrite',
      });
      const workspace = await createWorkspace(handle, { setDefault: rows.length === 0 });
      telemetry.workspaceCreated({ workspaceId: workspace.workspaceId, isDefault: rows.length === 0 });
      await reloadRows();
      toast.success(`Connected workspace "${handle.name}"`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'aborted' });
        return;
      }
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unknown' });
      toast.error('Failed to connect workspace.');
      throw error;
    } finally {
      setIsAddingWorkspace(false);
    }
  }, [reloadRows, rows.length, telemetry]);

  const handleConnectChange = useCallback(
    async (workspaceId: string) => {
      if (!isFileSystemAccessSupported) {
        return;
      }
      setBusyWorkspaceId(workspaceId);
      try {
        const handle = await globalThis.window.showDirectoryPicker({
          id: `tau-workspace-${workspaceId}`,
          mode: 'readwrite',
        });
        await updateWorkspaceHandle(workspaceId, handle);
        telemetry.workspaceConnected({ workspaceId });
        await reloadRows();
        toast.success(`Updated workspace folder to "${handle.name}"`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
          return;
        }
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
        toast.error('Failed to change workspace folder.');
        throw error;
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadRows, telemetry],
  );

  const handleGrantAccess = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        const entry = await getWorkspace(workspaceId);
        if (!entry) {
          return;
        }
        const granted = await requestHandlePermission(entry.handle);
        if (granted) {
          telemetry.workspaceConnected({ workspaceId });
        } else {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'permission' });
          toast.error('Permission was not granted.');
        }
        await reloadRows();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadRows, telemetry],
  );

  const handleForgetWorkspace = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        const projects = await listProjectsForWorkspace(workspaceId);
        if (projects.length > 0) {
          toast.error(
            `Cannot forget workspace — ${projects.length} project${projects.length === 1 ? '' : 's'} still bound to it.`,
          );
          return;
        }
        await forgetWorkspace(workspaceId);
        await reloadRows();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadRows],
  );

  const handleSetDefault = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        await setDefaultWorkspace(workspaceId);
        await reloadRows();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [reloadRows],
  );

  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | undefined>(undefined);

  useEffect(() => {
    const estimateStorage = async (): Promise<void> => {
      try {
        const estimate = await navigator.storage.estimate();
        setStorageUsage({
          used: estimate.usage ?? 0,
          quota: estimate.quota ?? 0,
        });
      } catch {
        // Storage estimation not available
      }
    };

    void estimateStorage();
  }, []);

  return (
    <div className='flex flex-col gap-6 pb-6'>
      <Card>
        <CardHeader>
          <CardTitle>Default Storage</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex flex-col gap-1'>
              <span className='font-medium'>Default Backend</span>
              <span className='text-sm text-muted-foreground'>
                Used for new projects. Existing projects keep the backend they were created with.
              </span>
            </div>
            <BackendSelector value={backendCookie} onSelect={handleBackendChange} />
          </div>
        </CardContent>
      </Card>

      {isFileSystemAccessSupported ? (
        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-2'>
            <CardTitle>Workspaces</CardTitle>
            <Button size='sm' variant='outline' disabled={isAddingWorkspace} onClick={handleAddWorkspace}>
              <Plus className='mr-1 size-3.5' />
              Add Workspace
            </Button>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <p className='text-sm text-muted-foreground'>
              A workspace is a folder on your computer. New File System projects go into the default workspace.
            </p>
            {isLoading ? (
              <Loader className='size-4' />
            ) : rows.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No workspaces yet. Add one to use the File System backend.
              </p>
            ) : (
              <div className='flex flex-col gap-2'>
                {rows.map((row) => {
                  const isBusyRow = busyWorkspaceId === row.workspace.workspaceId;
                  const projectCountLabel = `${row.projectCount} project${row.projectCount === 1 ? '' : 's'}`;
                  const meta = (
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <span>{projectCountLabel}</span>
                      {row.workspace.isDefault ? (
                        <span className='rounded-full border border-border bg-muted/60 px-2 py-0.5 font-medium text-foreground'>
                          Default
                        </span>
                      ) : (
                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-6 px-2 text-xs'
                          disabled={isBusyRow}
                          onClick={() => {
                            void handleSetDefault(row.workspace.workspaceId);
                          }}
                        >
                          Set as default
                        </Button>
                      )}
                    </div>
                  );
                  return (
                    <WorkspaceDirectoryPanel
                      key={row.workspace.workspaceId}
                      variant='row'
                      workspaceId={row.workspace.workspaceId}
                      workspaceName={row.workspace.name}
                      status={row.status}
                      isBusy={isBusyRow}
                      onConnect={async () => {
                        await handleConnectChange(row.workspace.workspaceId);
                      }}
                      onGrantAccess={async () => {
                        await handleGrantAccess(row.workspace.workspaceId);
                      }}
                      onForget={async () => {
                        await handleForgetWorkspace(row.workspace.workspaceId);
                      }}
                      meta={meta}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : undefined}

      {storageUsage ? (
        <Card>
          <CardHeader>
            <CardTitle>Browser Storage</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex items-center gap-3'>
              <HardDrive className='size-5 shrink-0 text-muted-foreground' />
              <div className='flex flex-1 flex-col gap-1.5'>
                <div className='flex items-center justify-between text-sm'>
                  <span>{formatBytes(storageUsage.used)} used</span>
                  <span className='text-muted-foreground'>{formatBytes(storageUsage.quota)} available</span>
                </div>
                <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full rounded-full bg-primary transition-all'
                    style={{
                      width: `${storageUsage.quota > 0 ? Math.min((storageUsage.used / storageUsage.quota) * 100, 100).toFixed(1) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              Browser-managed storage for IndexedDB + OPFS projects. File System workspaces live on your disk and are
              not counted here.
            </p>
          </CardContent>
        </Card>
      ) : undefined}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
