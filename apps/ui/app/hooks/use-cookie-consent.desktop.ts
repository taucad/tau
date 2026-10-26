import type { ConsentStatus } from '@taucad/consent';

/**
 * Desktop stand-in for the web analytics-cookie decision. The desktop app sets no analytics cookies and offers no
 * cookie preferences, so the decision is always `unknown` (the page reporter's documented desktop value). Global
 * Privacy Control is honoured by its callers through `global-privacy-control.lib`, so this module imports no web
 * consent code into the desktop renderer.
 *
 * @returns Always `unknown`.
 */
export function useCookieConsent(): ConsentStatus {
  return 'unknown';
}
