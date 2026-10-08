import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
/**
 * Filesystem settings pane.
 *
 * Surfaces the multi-workspace foundation introduced by the workspaces
 * audit (R4 + R12 + R13 + R19):
 *
 * - Lists every known workspace; each row owns its own connect /
 *   grant-access / change / disconnect controls via `WorkspaceDirectoryPanel`.
 * - Creation destinations are selected where projects are created.
 * - Reports aggregate Home storage pressure without exposing its engine.
 */

import { useState, useCallback, useEffect } from 'react';
import { AlertCircle, HardDrive, Plus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';
import {
  checkHandlePermission,
  getWorkspace,
  listProjectsForWorkspace,
  listWorkspaces,
  requestHandlePermission,
} from '#filesystem/handle-store.js';
import { isWorkspaceIdentityConflictError, workspaceIdentityConflictCopy } from '#filesystem/workspace-errors.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { webAccessDirectoryPicker } from '#constants/browser.constants.js';
import type { WorkspaceDirectoryStatus } from '#constants/workspace-directory-copy.constants.js';
import { Loader } from '#components/ui/loader.js';
import { toast } from '#components/ui/sonner.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { materializeOnSignIn, useMaterializeOnSignInLocation } from '#hooks/use-cloud-projects.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import { isDesktopTarget } from '#lib/build-target.js';

type WorkspaceRow = {
  workspace: Workspace;
  status: WorkspaceDirectoryStatus;
  projectCount: number;
};

export function FileSystemSettings(): React.JSX.Element {
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | undefined>(undefined);
  const telemetry = useWorkspaceTelemetry();
  const projectManager = useProjectManager();
  const { workspaceConnection } = projectManager;
  /* A plan without backup has no Tau Cloud projects to bring: the setting is absent,
   * as the no-train toggle is on a plan it does not apply to. */
  const { isResolved, canSyncFiles } = useCommercialFeatures();
  const { workspace } = useFileManager();

  const reloadRows = useCallback(async (): Promise<void> => {
    try {
      const workspaces = await listWorkspaces();
      const built = await Promise.all(
        workspaces.map(async (workspace): Promise<WorkspaceRow> => {
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadRows();
  }, [reloadRows]);

  const handleAddWorkspace = useCallback(async () => {
    if (!webAccessDirectoryPicker()) {
      return;
    }
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
      throw error;
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
      await projectManager.retryWorkspaceConnection();
    } catch {
      toast.error('Failed to connect workspace.');
    }
  }, [projectManager]);
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

  return (
    <div className='flex flex-col gap-6 pb-6'>
      {webAccessDirectoryPicker() ? (
        <SettingsItem settingId='workspaces'>
          <SettingsSectionCard>
            <CardHeader className='flex flex-row items-center justify-between gap-2'>
              <CardTitle>Workspaces</CardTitle>
              <Button size='sm' variant='outline' disabled={isAddingWorkspace} onClick={handleAddWorkspace}>
                <Plus className='mr-1 size-3.5' />
                Add Workspace
              </Button>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <p className='text-sm text-muted-foreground'>
                Connect a project folder or a folder containing projects. Tau finds tau.json at the selected root and in
                nested folders. Choose a workspace from the new-project location picker when you do not want to use
                Home.
              </p>
              {showWorkspaceConnection ? (
                <div role='status' aria-live='polite' className='flex items-center gap-3 rounded-md border p-3'>
                  {workspaceConnection.phase === 'failed' ? undefined : <Loader className='size-4 shrink-0' />}
                  <div className='min-w-0'>
                    <div className='truncate text-sm font-medium'>
                      {pendingWorkspaceName ?? 'Choose a workspace folder'}
                    </div>
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
        </SettingsItem>
      ) : undefined}

      {isResolved && canSyncFiles ? (
        <SettingsItem settingId='tau-cloud-projects'>
          <TauCloudProjectsSetting workspaces={rows.map((row) => row.workspace)} />
        </SettingsItem>
      ) : undefined}

      {/* Desktop's Home is a folder on disk, so the origin's storage quota says nothing about it. */}
      {storageUsage && !isDesktopTarget() ? (
        <SettingsItem settingId='browser-storage'>
          <SettingsSectionCard>
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
                <div className='flex items-center gap-3 rounded-md border border-warning/40 p-3'>
                  <AlertCircle className='size-4 shrink-0 text-warning' />
                  <p className='text-sm'>
                    Browser storage is nearly full. Free up space or move projects to a connected workspace — writes
                    start failing once the quota is reached.
                  </p>
                </div>
              ) : undefined}
              <p className='text-xs text-muted-foreground'>
                Home uses browser-managed storage and can be cleared or evicted. Connected workspaces live on your disk
                and are not counted here.
              </p>
            </CardContent>
          </SettingsSectionCard>
        </SettingsItem>
      ) : undefined}
    </div>
  );
}

/**
 * Materialize on sign-in (charter D20): which workspace, if any, receives this
 * account's Tau Cloud projects when it signs in. Off by default; one workspace
 * at most, because a project is one directory per device.
 *
 * @param props - This device's connected workspaces; Home is always offered.
 * @returns The setting.
 */
function TauCloudProjectsSetting({ workspaces }: { readonly workspaces: readonly Workspace[] }): React.JSX.Element {
  const selected = useMaterializeOnSignInLocation();
  const options: ReadonlyArray<{ key: string; label: string; location: ProjectCreationLocation | undefined }> = [
    { key: 'off', label: 'Off', location: undefined },
    { key: 'home', label: 'Home', location: homeProjectCreationLocation },
    ...workspaces.map((entry) => ({
      key: entry.workspaceId,
      label: entry.name,
      location: { kind: 'workspace', workspaceId: entry.workspaceId } as const,
    })),
  ];
  const selectedKey = selected === undefined ? 'off' : selected.kind === 'home' ? 'home' : selected.workspaceId;
  return (
    <SettingsSectionCard aria-labelledby='tau-cloud-projects-title'>
      <CardHeader>
        <CardTitle id='tau-cloud-projects-title'>Tau Cloud Projects</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <p className='text-sm text-muted-foreground'>
          When you sign in, add every project backed up on Tau Cloud to this workspace. Each one downloads the first
          time you open it.
        </p>
        <fieldset className='grid gap-2 sm:grid-cols-3'>
          <legend className='sr-only'>Workspace for Tau Cloud projects</legend>
          {options.map((option) => (
            <label
              key={option.key}
              className='flex cursor-action items-center gap-3 rounded-md border p-3 transition-colors hover:border-primary/50 hover:bg-accent/50 has-checked:border-primary has-[input:focus-visible]:focus-outline'
            >
              <input
                className='accent-primary'
                type='radio'
                name='tau-cloud-projects-location'
                value={option.key}
                checked={selectedKey === option.key}
                onChange={() => {
                  materializeOnSignIn.set(option.location);
                }}
              />
              <span className='truncate text-sm font-medium'>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </CardContent>
    </SettingsSectionCard>
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
