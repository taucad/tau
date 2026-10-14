import { useEffect, useSyncExternalStore } from 'react';
import {
  getPersistentStorageStatus,
  refreshPersistentStorageStatus,
  subscribePersistentStorageStatus,
} from '#filesystem/handle-store.js';
import type { PersistentStorageStatus } from '#filesystem/handle-store.js';
import { isDesktopTarget } from '#lib/build-target.js';

const statusOnServer = (): PersistentStorageStatus => 'unknown';

/** Observe persistence in settings; opening or refocusing settings never requests permission. */
export function usePersistentStorageStatus(): PersistentStorageStatus {
  const status = useSyncExternalStore(subscribePersistentStorageStatus, getPersistentStorageStatus, statusOnServer);
  useEffect(() => {
    if (isDesktopTarget()) {
      return;
    }
    const refresh = (): void => {
      void refreshPersistentStorageStatus();
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return status;
}
