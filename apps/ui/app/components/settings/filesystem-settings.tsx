import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { SettingsGroup, SettingsItem, SettingsRow } from '@taucad/settings-ui/components/settings/settings-item';
import { WorkspaceConnections } from '#components/filesystem/workspace-connections.js';
import { BrowserStorageStatus } from '@taucad/settings-ui/components/settings/browser-storage-status';
import { usePersistentStorageStatus } from '@taucad/files-ui/filesystem/use-persistent-storage-status';
import { isDesktopTarget } from '#lib/build-target.js';
import { useHasFolderAccess } from '#components/settings/settings-registry.js';
import { formatBytes } from '@taucad/ui-core/lib/format-bytes';

export function FileSystemSettings(): React.JSX.Element {
  const persistenceStatus = usePersistentStorageStatus();
  const hasFolderAccess = useHasFolderAccess();
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
      {/* Without folder access the connections list renders nothing, which would leave an empty Workspaces section. */}
      {hasFolderAccess ? (
        <SettingsItem settingId='workspaces'>
          <WorkspaceConnections />
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
