import { useServiceWorker } from '#offline/use-pwa.js';

/** A self-host build has no `/usage` route, so no offline usage notice: it only registers the service worker. */
export function OfflineShell(): React.JSX.Element | undefined {
  useServiceWorker();
  return undefined;
}
