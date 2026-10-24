import { useState, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Loader } from '@taucad/ui/components/loader';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';
import {
  checkHandlePermission,
  getWorkspace,
  listProjectsForWorkspace,
  listWorkspaces,
  requestHandlePermission,
  subscribeProjectRootConfigurationChanges,
} from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { desktopBridge, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { isWorkspaceIdentityConflictError, workspaceIdentityConflictCopy } from '#filesystem/workspace-errors.js';
import { directoryPicker, webAccessDirectoryPicker } from '#constants/browser.constants.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { isDesktopTarget } from '#lib/build-target.js';

type WorkspaceRow = {
  workspace: Workspace;
  status: WorkspaceDirectoryStatus;
  projectCount: number | undefined;
};

/** Workspace connections shared by Settings and desktop Manage locations. */
export function WorkspaceConnections({
  onWorkspacesChange,
}: {
  readonly onWorkspacesChange?: (workspaces: Workspace[]) => void;
}): React.JSX.Element | undefined {
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [message, setMessage] = useState<string>();
  const telemetry = useWorkspaceTelemetry();
  const projectManager = useProjectManager();
  const { workspaceConnection } = projectManager;
  const { workspace } = useFileManager();

  const reloadRows = useCallback(async (): Promise<void> => {
    try {
      const savedWorkspaces = await listWorkspaces();
      const grants = isDesktopTarget() ? await desktopBridge()?.directories?.list() : undefined;
      if (isDesktopTarget() && grants === undefined) {
        throw new Error('Workspace management is unavailable. Restart Tau and try again.');
      }
      const homeRoot = isDesktopTarget() ? nodeHomeRoot() : undefined;
      const workspaces = savedWorkspaces.filter((workspace) => homeRoot === undefined || workspace.path !== homeRoot);
      const built = await Promise.all(
        workspaces.map(async (workspace): Promise<WorkspaceRow> => {
          if (workspace.path !== undefined) {
            return {
              workspace,
              status: grants?.includes(workspace.path) ? 'connected' : 'disconnected',
              projectCount: undefined,
            };
          }
          const entry = await getWorkspace(workspace.workspaceId);
          let status: WorkspaceDirectoryStatus = 'disconnected';
          if (entry) {
            const permission = await checkHandlePermission(entry.handle);
            status = permission === 'granted' ? 'connected' : 'permission';
          }
          const projects = await listProjectsForWorkspace(workspace.workspaceId);
          return { workspace, status, projectCount: projects.length };
        }),
      );
      setRows(built);
      onWorkspacesChange?.(workspaces);
    } finally {
      setIsLoading(false);
    }
  }, [onWorkspacesChange]);

  useEffect(() => {
    const reload = async (): Promise<void> => {
      try {
        await reloadRows();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load workspaces.');
      }
    };
    void reload();
    return isDesktopTarget() ? subscribeProjectRootConfigurationChanges(reload) : undefined;
  }, [reloadRows]);

  const handleAddWorkspace = useCallback(async () => {
    if (!directoryPicker().available) {
      return;
    }
    setErrorMessage(undefined);
    setMessage(undefined);
    setBusyWorkspaceId('');
    try {
      const connected = await projectManager.connectWorkspace();
      if (connected === undefined) {
        telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'aborted' });
        return;
      }
      if (connected.minted) {
        telemetry.workspaceCreated({
          workspaceId: connected.workspace.workspaceId,
        });
      } else {
        telemetry.workspaceConnected({ workspaceId: connected.workspace.workspaceId });
      }
      await reloadRows();
      toast.success(`Connected workspace "${connected.workspace.name}"`);
    } catch (error) {
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unknown' });
      toast.error('Failed to connect workspace.');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to connect workspace.');
    } finally {
      setBusyWorkspaceId(undefined);
    }
  }, [projectManager, reloadRows, telemetry]);

  const handleConnectChange = useCallback(
    async (workspaceId: string) => {
      const picker = webAccessDirectoryPicker();
      if (!picker) {
        return;
      }
      setBusyWorkspaceId(workspaceId);
      try {
        await projectManager.assertWorkspaceMutationAllowed(workspaceId);
        const handle = await picker.pick({ id: `tau-workspace-${workspaceId}`, mode: 'readwrite' });
        if (handle === undefined) {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
          return;
        }
        await workspace.replaceWorkspaceHandle(workspaceId, handle);
        await projectManager.refreshWorkspaceCatalog();
        telemetry.workspaceConnected({ workspaceId });
        await reloadRows();
        toast.success(`Updated workspace folder to "${handle.name}"`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          telemetry.workspaceOpenFailed({ workspaceId, reason: 'aborted' });
          return;
        }
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown' });
        toast.error(
          isWorkspaceIdentityConflictError(error)
            ? workspaceIdentityConflictCopy
            : 'Failed to change workspace folder.',
        );
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
          await projectManager.refreshWorkspaceCatalog();
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
    [projectManager, reloadRows, telemetry, workspace],
  );

  const handleDisconnectWorkspace = useCallback(
    async (target: Workspace) => {
      setBusyWorkspaceId(target.workspaceId);
      setErrorMessage(undefined);
      setMessage(undefined);
      if (target.path !== undefined) {
        let revoked = false;
        try {
          await projectManager.assertWorkspaceMutationAllowed(target.workspaceId);
          const directories = desktopBridge()?.directories;
          if (!directories) {
            throw new Error('Workspace management is unavailable. Restart Tau and try again.');
          }
          await directories.disconnect(target.path);
          revoked = true;
          setRows((current) =>
            current.map((row) => (row.workspace.path === target.path ? { ...row, status: 'disconnected' } : row)),
          );
          setMessage(`Disconnected workspace "${target.name}". Your files are still on disk.`);
          await workspace.disposeStorageRoot(resolveStorageRootKey({ backend: 'node', path: target.path }, ''));
          await workspace.syncProjectRoots();
          await projectManager.refreshWorkspaceCatalog();
          await reloadRows();
        } catch (error) {
          setErrorMessage(
            revoked
              ? 'The workspace is disconnected. Restart Tau to finish refreshing locations.'
              : error instanceof Error
                ? error.message
                : 'Could not disconnect workspace.',
          );
        } finally {
          setBusyWorkspaceId(undefined);
        }
        return;
      }
      let disconnected: Awaited<ReturnType<typeof workspace.disconnectWorkspace>>;
      try {
        disconnected = await workspace.disconnectWorkspace(target.workspaceId);
      } catch (error) {
        console.error('Failed to disconnect workspace:', error);
        toast.error('Failed to disconnect workspace.');
        return;
      } finally {
        setBusyWorkspaceId(undefined);
      }

      try {
        await reloadRows();
      } catch (error) {
        console.warn('Workspace disconnected but Settings refresh failed', error);
      }
      if (!disconnected) {
        return;
      }
      toast.success(`Disconnected workspace "${disconnected.workspace.name}"`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            let restored: boolean;
            try {
              restored = await workspace.restoreWorkspaceHandle(target.workspaceId, disconnected.handle);
            } catch (error) {
              console.error('Failed to undo workspace disconnect:', error);
              toast.error('Failed to reconnect workspace.');
              return;
            }
            try {
              await reloadRows();
              if (restored) {
                await projectManager.refreshWorkspaceCatalog();
              }
            } catch (error) {
              console.warn('Workspace restored but Settings refresh failed', error);
            }
            if (restored) {
              telemetry.workspaceConnected({ workspaceId: target.workspaceId });
            } else {
              toast.info('Workspace connection has already changed.');
            }
          },
        },
      });
    },
    [projectManager, reloadRows, telemetry, workspace],
  );

  const isAddingWorkspace =
    workspaceConnection.phase !== 'idle' &&
    workspaceConnection.phase !== 'ready' &&
    workspaceConnection.phase !== 'failed';
  const showWorkspaceConnection = isAddingWorkspace || workspaceConnection.phase === 'failed';
  const pendingWorkspaceName =
    workspaceConnection.phase === 'registering'
      ? workspaceConnection.workspaceName
      : 'workspace' in workspaceConnection
        ? workspaceConnection.workspace?.name
        : undefined;
  const handleRetryWorkspace = useCallback(async (): Promise<void> => {
    try {
      const connected = await projectManager.retryWorkspaceConnection();
      if (connected === undefined) {
        return;
      }
      await reloadRows();
      setErrorMessage(undefined);
      setMessage(undefined);
    } catch (error) {
      toast.error('Failed to connect workspace.');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to connect workspace.');
    }
  }, [projectManager, reloadRows]);
  const connectionLabel =
    workspaceConnection.phase === 'registering'
      ? 'Saving access to this folder'
      : workspaceConnection.phase === 'mounting'
        ? 'Making local files available to Tau'
        : workspaceConnection.phase === 'browsing'
          ? 'Loading folders and projects'
          : workspaceConnection.phase === 'discovering'
            ? 'Reading project folders'
            : workspaceConnection.phase === 'publishing'
              ? `Preparing links for ${workspaceConnection.projectCount} projects`
              : workspaceConnection.phase === 'failed'
                ? workspaceConnection.message
                : undefined;

  if (!directoryPicker().available) {
    return undefined;
  }
  return (
    <SettingsSectionCard>
      <CardHeader className='flex flex-row items-center justify-between gap-2'>
        <CardTitle>Workspaces</CardTitle>
        <Button
          size='sm'
          variant='outline'
          disabled={isAddingWorkspace || busyWorkspaceId !== undefined}
          onClick={handleAddWorkspace}
        >
          <Plus />
          Add workspace
        </Button>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <p className='text-sm text-muted-foreground'>
          Connected workspaces are folders on your disk. Choose one from the new-project location picker when you do not
          want to use Home.
        </p>
        <p className='text-xs text-muted-foreground'>Disconnecting stops access to a workspace. Files stay on disk.</p>
        {errorMessage ? (
          <p role='alert' className='text-sm'>
            {errorMessage}
          </p>
        ) : undefined}
        {message ? (
          <p role='status' className='text-sm'>
            {message}
          </p>
        ) : undefined}
        {showWorkspaceConnection ? (
          <div role='status' aria-live='polite' className='flex items-center gap-3 rounded-md border p-3'>
            {workspaceConnection.phase === 'failed' ? undefined : <Loader className='size-4 shrink-0' />}
            <div className='min-w-0'>
              <div className='truncate text-sm font-medium'>{pendingWorkspaceName ?? 'Choose a workspace folder'}</div>
              <div className='text-xs text-muted-foreground'>{connectionLabel ?? 'Folder picker is open'}</div>
            </div>
            {workspaceConnection.phase === 'failed' ? (
              <Button
                className='ml-auto'
                size='sm'
                variant='outline'
                onClick={() => {
                  void handleRetryWorkspace();
                }}
              >
                {workspaceConnection.retry === 'pick-again' ? 'Choose folder again' : 'Try again'}
              </Button>
            ) : undefined}
          </div>
        ) : undefined}
        {isLoading ? (
          <Loader className='size-4' />
        ) : rows.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No connected workspaces yet. Add one to store projects in a folder on your disk.
          </p>
        ) : (
          <div className='flex flex-col gap-2'>
            {rows.map((row) => {
              const isBusyRow = busyWorkspaceId !== undefined || isAddingWorkspace;
              const projectCountLabel = `${row.projectCount} project${row.projectCount === 1 ? '' : 's'}`;
              const meta =
                row.projectCount === undefined ? undefined : (
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
                  description={row.workspace.path}
                  isBusy={isBusyRow}
                  onConnect={
                    row.workspace.path === undefined
                      ? async () => {
                          await handleConnectChange(row.workspace.workspaceId);
                        }
                      : row.status === 'disconnected'
                        ? handleAddWorkspace
                        : undefined
                  }
                  onGrantAccess={async () => {
                    await handleGrantAccess(row.workspace.workspaceId);
                  }}
                  onDisconnect={async () => {
                    await handleDisconnectWorkspace(row.workspace);
                  }}
                  meta={meta}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </SettingsSectionCard>
  );
}
