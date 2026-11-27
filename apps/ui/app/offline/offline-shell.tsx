import { useServiceWorker } from '#offline/use-pwa.js';

/**
 * Registers the service worker. `/usage` has no offline document of its own: offline, it follows the remembered
 * deployment record, as the desktop's does (adaptive app deployment mode W12).
 */
export function OfflineShell(): React.JSX.Element | undefined {
  useServiceWorker();
  return undefined;
}
