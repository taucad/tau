import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import { Loader } from '@taucad/ui/components/loader';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { WorkspaceDirectoryPanel } from '@taucad/files-ui/components/filesystem/workspace-directory-panel';
import {
  checkHandlePermission,
  getWorkspace,
  listProjectsForWorkspace,
  listWorkspaces,
  removeWorkspace,
  requestHandlePermission,
  subscribeProjectRootConfigurationChanges,
} from '@taucad/files-ui/filesystem/handle-store';
import type { Workspace } from '@taucad/files-ui/filesystem/handle-store';
import { desktopBridge, nodeHomeRoot } from '@taucad/files-ui/filesystem/desktop-bridge';
import {
  isWorkspaceIdentityConflictError,
  isWorkspaceRecoveryPendingError,
  workspaceIdentityConflictCopy,
} from '@taucad/ui-core/filesystem/workspace-errors';
import { directoryPicker, webAccessDirectoryPicker } from '@taucad/files-ui/constants/browser.constants';
import type { WorkspaceDirectoryStatus } from '@taucad/ui-core/constants/workspace-directory-copy.constants';
import { workspaceDirectoryActions } from '@taucad/ui-core/constants/workspace-directory-copy.constants';
import { toast } from '@taucad/ui/components/sonner';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { Button } from '@taucad/ui/components/button';
import {
  conflictReasonOf,
  folderStatusOf,
  useRootStatuses,
  workspaceStorageRootKey,
} from '#components/filesystem/folder-status.js';

type WorkspaceRow = {
  workspace: Workspace;
  /** From the grant list or the handle alone; the published root status refines it at render (D2). */
  status: WorkspaceDirectoryStatus;
  projectCount: number | undefined;
};

type DisplayedRow = WorkspaceRow & { readonly reason: string | undefined };

/** Where the project library lists an unfinished operation that can be discarded (U7). */
const projectRecoveryHref = '/projects#project-recovery';

/** Workspace connections shared by Settings and desktop Manage locations. */
export function WorkspaceConnections({
  onWorkspacesChange,
  shouldGroupNotFound = false,
}: {
  readonly onWorkspacesChange?: (workspaces: Workspace[]) => void;
  /** Collapse rows whose folder is not found into one group below the others (D2, the Files page). */
  readonly shouldGroupNotFound?: boolean;
}): React.JSX.Element | undefined {
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [message, setMessage] = useState<string>();
  /** The workspace whose change an unfinished project operation refused (U7). */
  const [recoveryRefusal, setRecoveryRefusal] = useState<string>();
  const [isNotFoundOpen, setIsNotFoundOpen] = useState(false);
  const telemetry = useWorkspaceTelemetry();
  const projectManager = useProjectManager();
  const { workspaceConnection } = projectManager;
  const { workspace, fileManagerRef } = useFileManager();
  const rootStatuses = useRootStatuses(fileManagerRef);

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
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unknown', error });
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
        telemetry.workspaceOpenFailed({ workspaceId, reason: 'unknown', error });
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

  const clearNotices = useCallback((): void => {
    setErrorMessage(undefined);
    setMessage(undefined);
    setRecoveryRefusal(undefined);
  }, []);

  /**
   * Ask the project library whether the workspace may change. A refusal for an unfinished project operation names it
   * and links to where it can be discarded (U7); any other failure is shown as it is.
   *
   * @returns Whether the change may go ahead.
   */
  const guardMutation = useCallback(
    async (target: Workspace): Promise<boolean> => {
      try {
        await projectManager.assertWorkspaceMutationAllowed(target.workspaceId);
        return true;
      } catch (error) {
        if (isWorkspaceRecoveryPendingError(error)) {
          setRecoveryRefusal(target.name);
          return false;
        }
        throw error;
      }
    },
    [projectManager],
  );

  /**
   * After a folder's record or grant changed: release its root, re-sync the roots and the catalog, and reload the
   * rows. All best-effort, because the change itself is already saved and the next start reads it (B16). A file
   * service in `error` is started again rather than asking for a restart.
   */
  const refreshAfterFolderChange = useCallback(
    async (target: Workspace): Promise<void> => {
      const storageRootKey =
        target.path === undefined
          ? resolveStorageRootKey({ backend: 'webaccess', workspaceId: target.workspaceId }, '')
          : resolveStorageRootKey({ backend: 'node', path: target.path }, '');
      try {
        await workspace.disposeStorageRoot(storageRootKey);
        await workspace.syncProjectRoots();
      } catch (error) {
        console.warn('Folder change saved; the file service will pick it up when it starts', error);
      }
      try {
        await projectManager.refreshWorkspaceCatalog();
      } catch (error) {
        console.warn('Folder change saved; the project catalog refresh failed', error);
      }
      if (fileManagerRef.getSnapshot().matches('error')) {
        fileManagerRef.send({ type: 'initialize' });
      }
      try {
        await reloadRows();
      } catch (error) {
        console.warn('Folder change saved; the folder list refresh failed', error);
      }
    },
    [fileManagerRef, projectManager, reloadRows, workspace],
  );

  /**
   * Remove one workspace from Tau (D2): the unfinished-operation guard, then main's grant, then the record and its
   * project bindings. Never its files. Nothing changes when the grant cannot be revoked (B21).
   *
   * @returns Whether it was removed.
   */
  const removeOne = useCallback(
    async (target: Workspace): Promise<boolean> => {
      if (!(await guardMutation(target))) {
        return false;
      }
      try {
        if (target.path !== undefined) {
          const directories = desktopBridge()?.directories;
          if (!directories) {
            throw new Error('Workspace management is unavailable.');
          }
          await directories.disconnect(target.path);
        }
        await removeWorkspace(target.workspaceId);
      } catch (error) {
        const cause = error instanceof Error ? ` ${error.message}` : '';
        setErrorMessage(`Couldn’t save the change to "${target.name}".${cause}`);
        return false;
      }
      setRows((current) => current.filter((row) => row.workspace.workspaceId !== target.workspaceId));
      return true;
    },
    [guardMutation],
  );

  const handleRemoveWorkspaces = useCallback(
    async (targets: readonly Workspace[]): Promise<void> => {
      const [first] = targets;
      if (first === undefined) {
        return;
      }
      setBusyWorkspaceId(first.workspaceId);
      clearNotices();
      const removed: Workspace[] = [];
      try {
        for (const target of targets) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Each removal revokes a grant in main; one at a time, stopping at the first refusal.
          if (!(await removeOne(target))) {
            break;
          }
          removed.push(target);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not remove the folder from Tau.');
      }
      try {
        if (removed.length > 0) {
          setMessage(
            removed.length === 1
              ? `Removed "${removed[0]!.name}" from Tau. Your files are still on disk.`
              : `Removed ${removed.length} folders from Tau. Your files are still on disk.`,
          );
          for (const target of removed) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- Each refresh releases one root and re-syncs, in order.
            await refreshAfterFolderChange(target);
          }
        }
      } finally {
        setBusyWorkspaceId(undefined);
      }
    },
    [clearNotices, refreshAfterFolderChange, removeOne],
  );

  const handleRetryFolder = useCallback(
    (target: Workspace): void => {
      fileManagerRef.send({ type: 'recheckRoots', storageRootKeys: [workspaceStorageRootKey(target)] });
    },
    [fileManagerRef],
  );

  const handleDisconnectWorkspace = useCallback(
    async (target: Workspace) => {
      setBusyWorkspaceId(target.workspaceId);
      clearNotices();
      if (target.path !== undefined) {
        try {
          if (!(await guardMutation(target))) {
            return;
          }
          const directories = desktopBridge()?.directories;
          if (!directories) {
            throw new Error('Workspace management is unavailable. Restart Tau and try again.');
          }
          await directories.disconnect(target.path);
          setRows((current) =>
            current.map((row) => (row.workspace.path === target.path ? { ...row, status: 'disconnected' } : row)),
          );
          setMessage(`Disconnected workspace "${target.name}". Your files are still on disk.`);
          await refreshAfterFolderChange(target);
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not disconnect workspace.');
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

  /* A granted folder's status is the file service's published one (U3); a record without a grant stays disconnected. */
  const displayedRows = useMemo((): DisplayedRow[] => {
    const byKey = new Map(rootStatuses.map((root) => [root.storageRootKey, root] as const));
    return rows.map((row) => {
      const root = row.status === 'connected' ? byKey.get(workspaceStorageRootKey(row.workspace)) : undefined;
      if (root === undefined) {
        return { ...row, reason: undefined };
      }
      const status = folderStatusOf(root);
      return {
        ...row,
        status,
        reason: status === 'conflict' || status === 'error' ? conflictReasonOf(root.code) : undefined,
      };
    });
  }, [rootStatuses, rows]);
  const notFoundRows = shouldGroupNotFound ? displayedRows.filter((row) => row.status === 'notFound') : [];
  const listedRows = shouldGroupNotFound ? displayedRows.filter((row) => row.status !== 'notFound') : displayedRows;

  if (!directoryPicker().available) {
    return undefined;
  }
  const isBusyRow = busyWorkspaceId !== undefined || isAddingWorkspace;
  const renderRow = (row: DisplayedRow): React.JSX.Element => {
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
        reason={row.reason}
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
        onRetry={() => {
          handleRetryFolder(row.workspace);
        }}
        onRemove={async () => {
          await handleRemoveWorkspaces([row.workspace]);
        }}
        meta={meta}
      />
    );
  };
  const notFoundGroupLabel = `Folders not found (${notFoundRows.length})`;
  return (
    <div className='flex flex-col gap-3'>
      <SettingsGroup
        title='Workspaces'
        action={
          <Button
            variant='outline'
            disabled={isAddingWorkspace || busyWorkspaceId !== undefined}
            onClick={handleAddWorkspace}
          >
            <Plus />
            Add workspace
          </Button>
        }
      >
        {showWorkspaceConnection ? (
          <div role='status' aria-live='polite' className='flex items-center gap-3 py-3'>
            {workspaceConnection.phase === 'failed' ? undefined : <Loader className='size-4 shrink-0' />}
            <div className='min-w-0'>
              <div className='truncate text-sm font-medium'>{pendingWorkspaceName ?? 'Choose a workspace folder'}</div>
              <div className='text-xs text-muted-foreground'>{connectionLabel ?? 'Folder picker is open'}</div>
            </div>
            {workspaceConnection.phase === 'failed' ? (
              <Button
                className='ml-auto'
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
          <div className='py-3.5'>
            <Loader className='size-4' />
          </div>
        ) : displayedRows.length === 0 ? (
          <SettingsRow title='No workspaces' description='Add a folder on your disk to keep projects there' />
        ) : (
          listedRows.map((row) => renderRow(row))
        )}
        {notFoundRows.length > 0 ? (
          <div className='flex flex-col py-2'>
            <div className='flex items-center justify-between gap-3'>
              <Button
                variant='ghost'
                size='sm'
                className='-ml-2'
                aria-expanded={isNotFoundOpen}
                onClick={() => {
                  setIsNotFoundOpen((open) => !open);
                }}
              >
                <ChevronRight aria-hidden className={isNotFoundOpen ? 'rotate-90' : undefined} />
                {notFoundGroupLabel}
              </Button>
              {notFoundRows.length > 1 ? (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={isBusyRow}
                  onClick={async () => {
                    await handleRemoveWorkspaces(notFoundRows.map((row) => row.workspace));
                  }}
                >
                  {workspaceDirectoryActions.removeAll}
                </Button>
              ) : undefined}
            </div>
            {isNotFoundOpen ? notFoundRows.map((row) => renderRow(row)) : undefined}
          </div>
        ) : undefined}
      </SettingsGroup>
      {errorMessage ? (
        <p role='alert' className='text-sm'>
          {errorMessage}
        </p>
      ) : undefined}
      {recoveryRefusal ? (
        <p role='alert' className='text-sm'>
          Tau can’t change “{recoveryRefusal}” yet: an unfinished project operation still needs this folder.{' '}
          <Link to={projectRecoveryHref} className='underline'>
            Review the unfinished project operation
          </Link>
        </p>
      ) : undefined}
      {message ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {message}
        </p>
      ) : undefined}
    </div>
  );
}
