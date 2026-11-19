import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { CloudOff } from 'lucide-react';
import { isOfflineShellPath } from '#lib/static-paths.js';
import { readInstallStatus, subscribeInstallStatus, useServiceWorker } from '#offline/use-pwa.js';

const subscribeConnectivity = (listener: () => void): (() => void) => {
  globalThis.addEventListener('online', listener);
  globalThis.addEventListener('offline', listener);
  return () => {
    globalThis.removeEventListener('online', listener);
    globalThis.removeEventListener('offline', listener);
  };
};

const readOnline = (): boolean => globalThis.navigator.onLine;
const serverOnline = (): boolean => true;
const serverInstallStatus = (): undefined => undefined;

/**
 * The service worker's registration (`use-pwa.ts`) and the offline usage page's user-facing state
 * (B5 R1/R3): an install or quota failure is shown rather than swallowed, and the usage page opened with no connection
 * says so instead of looking like a broken page. The saved usage it reopens is B4/C10-U4's store.
 */
export function OfflineShell(): React.JSX.Element | undefined {
  useServiceWorker();
  const status = useSyncExternalStore(subscribeInstallStatus, readInstallStatus, serverInstallStatus);
  const online = useSyncExternalStore(subscribeConnectivity, readOnline, serverOnline);
  const { pathname } = useLocation();

  if (!isOfflineShellPath(pathname)) {
    return undefined;
  }
  if (!online) {
    return (
      <OfflineNotice
        label='Offline'
        message='Offline — current usage is unavailable. A saved account view appears below when this device has one.'
      />
    );
  }
  if (status === 'failed' || status === 'quota-exceeded') {
    return (
      <OfflineNotice
        label='Offline copy unavailable'
        message={
          status === 'quota-exceeded'
            ? 'Not enough storage to save this page for offline use.'
            : 'This page could not be saved for offline use.'
        }
      />
    );
  }
  return undefined;
}

function OfflineNotice({ label, message }: { readonly label: string; readonly message: string }): React.JSX.Element {
  return (
    <div
      role='status'
      aria-label={label}
      className='fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md border bg-background p-3 shadow-lg'
    >
      <CloudOff className='size-4 shrink-0 text-muted-foreground' />
      <div className='min-w-0 flex-1 text-sm'>{message}</div>
    </div>
  );
}
