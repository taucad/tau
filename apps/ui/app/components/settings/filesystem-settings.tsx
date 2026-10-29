import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import { SettingsGroup, SettingsItem, SettingsRow } from '#components/settings/settings-item.js';
import { WorkspaceConnections } from '#components/filesystem/workspace-connections.js';
import { BrowserStorageStatus } from '#components/settings/browser-storage-status.js';
import { usePersistentStorageStatus } from '#filesystem/use-persistent-storage-status.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { materializeOnSignIn, useMaterializeOnSignInLocation } from '#hooks/use-cloud-projects.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { formatBytes } from '#lib/format-bytes.js';

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
          <SettingsGroup title='Browser storage'>
            {storageUsage ? (
              <SettingsRow
                title='Space used'
                description={`${formatBytes(storageUsage.used)} of ${formatBytes(storageUsage.quota)}`}
              >
                <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full rounded-full bg-primary transition-all'
                    style={{
                      width: `${storageUsage.quota > 0 ? Math.min((storageUsage.used / storageUsage.quota) * 100, 100).toFixed(1) : 0}%`,
                    }}
                  />
                </div>
                {isStorageUnderPressure ? (
                  <p className='flex items-center gap-2 text-xs'>
                    <AlertCircle className='size-3.5 shrink-0 text-warning' aria-hidden='true' />
                    Browser storage is nearly full. Saving fails once it runs out.
                  </p>
                ) : undefined}
              </SettingsRow>
            ) : undefined}
            <BrowserStorageStatus status={persistenceStatus} />
          </SettingsGroup>
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
    <SettingsGroup>
      <SettingsRow
        title='Tau Cloud projects'
        description='Where your cloud projects appear when you sign in.'
        info='Each project downloads the first time you open it.'
        control={
          <Select
            value={selectedKey}
            onValueChange={(key) => {
              materializeOnSignIn.set(options.find((option) => option.key === key)?.location);
            }}
          >
            <SelectTrigger aria-label='Tau Cloud projects' className='w-40'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsGroup>
  );
}
