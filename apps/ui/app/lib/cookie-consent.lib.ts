import * as Cookies from 'es-cookie';
import { consentCookieName } from '#constants/cookie.constants.js';

export type ConsentStatus = 'unknown' | 'accepted' | 'declined';

export const parseStoredConsent = (value: string | undefined): { legacy: boolean; status: ConsentStatus } => {
  if (value === undefined) {
    return { legacy: false, status: 'unknown' };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      parsed.version === 1 &&
      'status' in parsed &&
      (parsed.status === 'accepted' || parsed.status === 'declined')
    ) {
      return { legacy: false, status: parsed.status };
    }
    if (parsed === 'granted' || parsed === 'accepted') {
      return { legacy: true, status: 'accepted' };
    }
    if (parsed === 'denied' || parsed === 'declined') {
      return { legacy: true, status: 'declined' };
    }
  } catch {
    if (value === 'granted' || value === 'accepted') {
      return { legacy: true, status: 'accepted' };
    }
    if (value === 'denied' || value === 'declined') {
      return { legacy: true, status: 'declined' };
    }
  }

  return { legacy: false, status: 'unknown' };
};

/**
 * A positive `Sec-GPC: 1` seen by the document request. Browsers that send the
 * header do not always expose `navigator.globalPrivacyControl`, so the loader's
 * observation is kept for the lifetime of this page. Client-only: the module is
 * shared across requests on the server, where the loader result is used instead.
 */
let requestGlobalPrivacyControl = false;

/**
 * Records a positive request-header GPC signal for this document.
 *
 * @param enabled - Whether the document request carried `Sec-GPC: 1`.
 */
export const recordRequestGlobalPrivacyControl = (enabled: boolean): void => {
  if (enabled && typeof document !== 'undefined') {
    requestGlobalPrivacyControl = true;
  }
};

/** Test seam: forget the recorded request-header signal. */
export const resetRequestGlobalPrivacyControl = (): void => {
  requestGlobalPrivacyControl = false;
};

export const isGlobalPrivacyControlEnabled = (): boolean =>
  requestGlobalPrivacyControl ||
  (globalThis.navigator as (Navigator & { readonly globalPrivacyControl?: boolean }) | undefined)
    ?.globalPrivacyControl === true;

export const readConsentStatusFromHeader = (
  header: string | undefined,
  globalPrivacyControl: boolean,
): ConsentStatus => {
  if (globalPrivacyControl) {
    return 'declined';
  }
  return parseStoredConsent(Cookies.parse(header ?? '')[consentCookieName]).status;
};

/** The one effective web consent decision: stored choice, overridden by GPC from either source. */
export const readConsentStatus = (): ConsentStatus => {
  if (isGlobalPrivacyControlEnabled()) {
    return 'declined';
  }
  return typeof document === 'undefined' ? 'unknown' : parseStoredConsent(Cookies.get(consentCookieName)).status;
};
