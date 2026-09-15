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

export const isGlobalPrivacyControlEnabled = (): boolean =>
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

export const readConsentStatus = (): ConsentStatus => {
  if (isGlobalPrivacyControlEnabled()) {
    return 'declined';
  }
  return typeof document === 'undefined' ? 'unknown' : parseStoredConsent(Cookies.get(consentCookieName)).status;
};
