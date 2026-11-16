/**
 * Whether Global Privacy Control is on, as the browser exposes it to script (`navigator.globalPrivacyControl`, W3C
 * GPC). The document is the same for every visitor, so the request's `Sec-GPC` header is not read.
 *
 * Kept apart from the cookie-consent module so the desktop renderer can honour GPC without bundling the web consent
 * surface.
 *
 * @returns Whether GPC is on.
 */
export const isGlobalPrivacyControlEnabled = (): boolean =>
  (globalThis.navigator as (Navigator & { readonly globalPrivacyControl?: boolean }) | undefined)
    ?.globalPrivacyControl === true;
