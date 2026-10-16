import { readConsentCookie } from '@taucad/consent';
import type { ConsentStatus } from '@taucad/consent';
import { isGlobalPrivacyControlEnabled } from '#lib/global-privacy-control.lib.js';

/**
 * The decision a document request carried, for the server render.
 *
 * @param header - The request's `Cookie` header.
 * @param globalPrivacyControl - Whether the request sent `Sec-GPC: 1`.
 * @returns The effective status; GPC is a hard decline.
 */
export const readConsentStatusFromHeader = (header: string | undefined, globalPrivacyControl: boolean): ConsentStatus =>
  globalPrivacyControl ? 'declined' : readConsentCookie(header);

/** The one effective web consent decision: stored choice, overridden by GPC from either source. */
export const readConsentStatus = (): ConsentStatus => {
  if (isGlobalPrivacyControlEnabled()) {
    return 'declined';
  }
  return typeof document === 'undefined' ? 'unknown' : readConsentCookie(document.cookie);
};
