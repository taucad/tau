import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { CloudOff } from 'lucide-react';
import { isDesktopTarget } from '#lib/build-target.js';
import { isOfflineShellPath } from '#lib/static-paths.js';
import { offlineShellMessageType } from '#offline/offline-shell-worker.js';
import type { OfflineShellMessage, OfflineShellStatus } from '#offline/offline-shell-worker.js';

/** Path the build writes the generated worker to (see `scripts/generate-offline-shell.ts`). */
const workerUrl = '/offline-shell-worker.js';

/**
 * Whether this bundle should register the offline shell worker.
 *
 * Three gates, each for a different reason:
 *
 * - `PROD` — a dev server has no prerendered document and no generated worker.
 * - `TAU_OFFLINE_SHELL` — defined only by `apps/ui/vite.config.ts`, the web
 *   build whose `react-router.config.ts` `buildEnd` generates the worker.
 *   `desktop/vite.config.ts` and `serve/vite.config.ts` define their own env
 *   and never set it, so the Electron `tau://` build and the `tau serve --ui`
 *   daemon SPA — both of which already boot offline from a packaged index
 *   fallback — never register anything. Dotted access is required: Vite
 *   substitutes `import.meta.env.X` textually, never `import.meta.env['X']`.
 * - `isDesktopTarget()` — belt and braces for the same Electron build.
 */
const isOfflineShellBuild = (): boolean =>
  import.meta.env.PROD && import.meta.env.TAU_OFFLINE_SHELL === 'enabled' && !isDesktopTarget();

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

const isOfflineShellMessage = (data: unknown): data is OfflineShellMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === offlineShellMessageType;

/**
 * Offline shell registration and its user-facing state (B5 R1/R3).
 *
 * Registers the generated worker on the web origin only, and surfaces what the
 * worker reports: an install or quota failure is shown rather than swallowed,
 * and a shell route opened with no connection says so instead of looking like
 * a broken page. The saved usage this shell reopens is B4/C10-U4's store.
 */
export function OfflineShell(): React.JSX.Element | undefined {
  const [status, setStatus] = useState<OfflineShellStatus>();
  const online = useSyncExternalStore(subscribeConnectivity, readOnline, serverOnline);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isOfflineShellBuild() || !('serviceWorker' in globalThis.navigator)) {
      return;
    }
    const container = globalThis.navigator.serviceWorker;
    const onMessage = (event: MessageEvent): void => {
      if (isOfflineShellMessage(event.data)) {
        setStatus(event.data.status);
      }
    };
    container.addEventListener('message', onMessage);
    const install = async (): Promise<void> => {
      try {
        await container.register(workerUrl);
      } catch {
        setStatus('failed');
      }
    };
    // async-iife: bootstrap -- installing must never block the view the reader came for.
    void install();
    return () => {
      container.removeEventListener('message', onMessage);
    };
  }, []);

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
