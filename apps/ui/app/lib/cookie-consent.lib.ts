import { readConsentCookie } from '@taucad/consent';
import type { ConsentStatus } from '@taucad/consent';
import { isGlobalPrivacyControlEnabled } from '@taucad/ui-core/lib/global-privacy-control.lib';

/** The one effective web consent decision: the stored choice, overridden by GPC. */
export const readConsentStatus = (): ConsentStatus => {
  if (isGlobalPrivacyControlEnabled()) {
    return 'declined';
  }
  return typeof document === 'undefined' ? 'unknown' : readConsentCookie(document.cookie);
};
