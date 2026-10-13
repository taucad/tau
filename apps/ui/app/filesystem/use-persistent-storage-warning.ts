import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { isDesktopTarget } from '#lib/build-target.js';
import {
  claimPersistentStorageWarning,
  isPersistentStorageRefused,
  subscribePersistentStorageRefusal,
} from '#filesystem/handle-store.js';

/** The warning a profile sees once when the browser refuses persistent storage (R14). */
export const persistentStorageWarning = {
  title: 'This browser may clear your Home projects',
  description:
    'It declined to keep Tau’s storage and may delete it when space runs low. Back up the projects you need, or keep them in a folder on your disk.',
} as const;

const refusedOnServer = (): boolean => false;

/**
 * Say once, per browser profile, that Home is evictable (R14).
 *
 * Tau asks the browser to keep its storage when a workspace connects and on
 * the first project-route read. A refusal used to change nothing visible, so
 * the first sign of it was every Home project gone. The warning stays until it
 * is dismissed because it is shown only once. Desktop keeps Home on disk, so
 * it never warns there.
 */
export function usePersistentStorageWarning(): void {
  const isRefused = useSyncExternalStore(
    subscribePersistentStorageRefusal,
    isPersistentStorageRefused,
    refusedOnServer,
  );

  useEffect(() => {
    if (!isRefused || isDesktopTarget()) {
      return;
    }
    /* No cancellation: the claim is durable, so a remount that dropped the toast
     * after claiming would lose the only warning this profile gets. */
    const warnOnce = async (): Promise<void> => {
      try {
        if (await claimPersistentStorageWarning()) {
          toast.warning(persistentStorageWarning.title, {
            description: persistentStorageWarning.description,
            duration: Number.POSITIVE_INFINITY,
          });
        }
      } catch (error) {
        console.warn('Could not record the persistent storage warning', error);
      }
    };
    void warnOnce();
  }, [isRefused]);
}
