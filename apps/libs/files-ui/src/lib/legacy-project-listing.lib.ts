import * as Cookies from 'es-cookie';
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';

/**
 * Earlier builds kept a snapshot of this device's project list (names, slugs, chat rows) in `localStorage` and the
 * project count in a request cookie, to draw remembered rows and cards while the listing loaded. Loading now draws
 * generic skeletons, so nothing reads them; this removes what an earlier build left behind, so project names do not
 * linger on a shared device.
 */
const legacyStorageKeys = [
  `${appMetaConfig.cookiePrefix}project-listing`,
  `${appMetaConfig.cookiePrefix}project-list-count`,
  `${appMetaConfig.cookiePrefix}project-list-shape`,
] as const;

const legacyCountCookieName = `${appMetaConfig.cookiePrefix}project-count`;

/**
 * Remove the project listing snapshot and count cookie an earlier build wrote. Safe to call more than once, and on a
 * browser that never had them.
 */
export function clearLegacyProjectListing(): void {
  if (typeof document === 'undefined') {
    return;
  }
  try {
    for (const key of legacyStorageKeys) {
      globalThis.localStorage.removeItem(key);
    }
  } catch {
    // Best effort: a store that cannot be read holds nothing to clear.
  }
  if (Cookies.get(legacyCountCookieName) !== undefined) {
    Cookies.remove(legacyCountCookieName, { path: '/' });
  }
}
