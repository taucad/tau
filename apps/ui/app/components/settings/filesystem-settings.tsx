/**
 * Filesystem settings pane.
 *
 * Surfaces the multi-workspace foundation introduced by the workspaces
 * audit (R4 + R12 + R13 + R19):
 *
 * - Lists every connected workspace; each row owns its own connect /
 *   grant-access / change / forget controls via `WorkspaceDirectoryPanel`.
 * - Creation destinations are selected where projects are created.
 * - Reports aggregate Home storage pressure without exposing its engine.
 */

import { useState, useCallback, useEffect } from 'react';
import { AlertCircle, HardDrive, Plus } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';
import {
  checkHandlePermission,
  createWorkspace,
  getWorkspace,
  listProjectsForWorkspace,
  listWorkspaces,
  requestHandlePermission,
} from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';
import { Loader } from '#components/ui/loader.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';

type WorkspaceRow = {
  workspace: Workspace;
  status: WorkspaceDirectoryStatus;
  projectCount: number;
};

export function FileSystemSettings(): React.JSX.Element {
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | undefined>(undefined);
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const telemetry = useWorkspaceTelemetry();
  const projectManager = useProjectManager();
  const { workspace } = useFileManager();

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
      // The store decides the default from durable rows, and only reports a
      // creation when it actually minted an identity (DF6 / DF19).
      const createdWorkspace = await createWorkspace(handle);
      await workspace.syncProjectRoots();
      if (createdWorkspace.minted) {
        telemetry.workspaceCreated({
          workspaceId: createdWorkspace.workspaceId,
        });
      }
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
  }, [reloadRows, telemetry, workspace]);

  const handleConnectChange = useCallback(
    async (workspaceId: string) => {
      if (!isFileSystemAccessSupported) {
        return;
      }
      setBusyWorkspaceId(workspaceId);
      try {
        await projectManager.assertWorkspaceMutationAllowed(workspaceId);
        const handle = await globalThis.window.showDirectoryPicker({
          id: `tau-workspace-${workspaceId}`,
          mode: 'readwrite',
        });
        await workspace.replaceWorkspaceHandle(workspaceId, handle);
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
    [projectManager, reloadRows, telemetry, workspace],
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
          await workspace.syncProjectRoots();
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
    [reloadRows, telemetry, workspace],
  );

  const handleForgetWorkspace = useCallback(
    async (workspaceId: string) => {
      setBusyWorkspaceId(workspaceId);
      try {
        await projectManager.assertWorkspaceMutationAllowed(workspaceId);
        const projects = await listProjectsForWorkspace(workspaceId);
        if (projects.length > 0) {
          toast.error(
            `Cannot forget workspace — ${projects.length} project${projects.length === 1 ? '' : 's'} still bound to it.`,
          );
          return;
        }
        await workspace.forgetWorkspace(workspaceId);
        await reloadRows();
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [projectManager, reloadRows, workspace],
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
      } catch (error) {
        // R6: a failed estimate used to vanish silently, hiding the one signal
        // we have that the origin is under storage pressure.
        console.warn('Storage estimate unavailable', error);
      }
    };

    void estimateStorage();
  }, []);

  // R6: above this share of quota the browser is close to refusing writes.
  const isStorageUnderPressure =
    storageUsage !== undefined && storageUsage.quota > 0 && storageUsage.used / storageUsage.quota > 0.8;

  return (
    <div className='flex flex-col gap-6 pb-6'>
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
              Connected workspaces are folders on your disk. Choose one from the new-project location picker when you do
              not want to use Home.
            </p>
            {isLoading ? (
              <Loader className='size-4' />
            ) : rows.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No connected workspaces yet. Add one to store projects in a folder on your disk.
              </p>
            ) : (
              <div className='flex flex-col gap-2'>
                {rows.map((row) => {
                  const isBusyRow = busyWorkspaceId === row.workspace.workspaceId;
                  const projectCountLabel = `${row.projectCount} project${row.projectCount === 1 ? '' : 's'}`;
                  const meta = (
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <span>{projectCountLabel}</span>
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
            {isStorageUnderPressure ? (
              <div className='border-amber-500/40 flex items-center gap-3 rounded-md border p-3'>
                <AlertCircle className='text-amber-600 size-4 shrink-0' />
                <p className='text-sm'>
                  Browser storage is nearly full. Free up space or move projects to a connected workspace — writes start
                  failing once the quota is reached.
                </p>
              </div>
            ) : undefined}
            <p className='text-xs text-muted-foreground'>
              Home uses browser-managed storage and can be cleared or evicted. Connected workspaces live on your disk
              and are not counted here.
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
