/**
 * Recovery before mount (PL7 service worker staging defects blueprint, FP5): remove this origin's service worker and
 * the caches it owns, so the next document load reaches the network with no worker in between. Safe mode
 * (`?safe=1`, read by `entry.client.tsx`) calls it; the boot watchdog's inline script does the same without the
 * bundle (`#lib/boot-watchdog`), with the same cache rule written out as a pattern.
 *
 * Imports only the retirement's cache rule, which imports nothing, so the client entry carries a few hundred bytes.
 */
import { isWorkerCache } from '#offline/service-worker-retire.js';

/**
 * Unregister every service worker registration of this origin and delete the worker's caches. Never rejects.
 */
export const unregisterServiceWorker = async (): Promise<void> => {
  try {
    const container = globalThis.navigator.serviceWorker as ServiceWorkerContainer | undefined;
    const registrations = (await container?.getRegistrations()) ?? [];
    await Promise.all(registrations.map(async (registration) => registration.unregister()));
    const names = await globalThis.caches.keys();
    await Promise.all(names.filter((name) => isWorkerCache(name)).map(async (name) => globalThis.caches.delete(name)));
  } catch {
    // No worker API or storage here: nothing stands between the page and the network.
  }
};
