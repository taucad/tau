/**
 * A positive `Sec-GPC: 1` seen by the document request. Browsers that send the
 * header do not always expose `navigator.globalPrivacyControl`, so the loader's
 * observation is kept for the lifetime of this page. Client-only: the module is
 * shared across requests on the server, where the loader result is used instead.
 *
 * Kept apart from the cookie-consent module so the desktop renderer can honour
 * GPC without bundling the web consent surface.
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
