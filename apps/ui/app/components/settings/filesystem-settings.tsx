import { useState, useEffect } from 'react';
import { AlertCircle, HardDrive } from 'lucide-react';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { SettingsItem, SettingsSectionCard } from '#components/settings/settings-item.js';
import { WorkspaceConnections } from '#components/filesystem/workspace-connections.js';
import { BrowserStorageStatus } from '#components/settings/browser-storage-status.js';
import { usePersistentStorageStatus } from '#filesystem/use-persistent-storage-status.js';
import { refreshPersistentStorageStatus } from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { materializeOnSignIn, useMaterializeOnSignInLocation } from '#hooks/use-cloud-projects.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import { isDesktopTarget } from '#lib/build-target.js';

export function FileSystemSettings(): React.JSX.Element {
  const persistenceStatus = usePersistentStorageStatus();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const { isResolved, canSyncFiles } = useCommercialFeatures();
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
      <SettingsItem settingId='workspaces'>
        <WorkspaceConnections onWorkspacesChange={setWorkspaces} />
      </SettingsItem>
      {isResolved && canSyncFiles ? (
        <SettingsItem settingId='tau-cloud-projects'>
          <TauCloudProjectsSetting workspaces={workspaces} />
        </SettingsItem>
      ) : undefined}

      {/* Desktop's Home is a folder on disk, so the origin's storage quota says nothing about it. */}
      {isDesktopTarget() ? undefined : (
        <SettingsItem settingId='browser-storage'>
          <SettingsSectionCard>
            <CardHeader>
              <CardTitle>Browser storage</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {storageUsage ? (
                <div className='flex items-center gap-3'>
                  <HardDrive className='size-5 shrink-0 text-muted-foreground' />
                  <div className='flex flex-1 flex-col gap-1.5'>
                    <div className='flex items-center justify-between text-sm'>
                      <span>{formatBytes(storageUsage.used)} used</span>
                      <span className='text-muted-foreground'>{formatBytes(storageUsage.quota)} total</span>
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
              ) : undefined}
              {isStorageUnderPressure ? (
                <div className='flex items-center gap-3 rounded-md border border-warning/40 p-3'>
                  <AlertCircle className='size-4 shrink-0 text-warning' />
                  <p className='text-sm'>
                    Browser storage is nearly full. Free up space or move projects to a connected workspace — writes
                    start failing once the quota is reached.
                  </p>
                </div>
              ) : undefined}
              <BrowserStorageStatus
                status={persistenceStatus}
                onCheckStatus={() => {
                  void refreshPersistentStorageStatus();
                }}
              />
            </CardContent>
          </SettingsSectionCard>
        </SettingsItem>
      )}
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
