/**
 * The analytics decision shared with the Tau app. The website owns the choice; the app on the same
 * hostname reads this cookie (`apps/ui/app/lib/cookie-consent.lib.ts`) and never asks separately.
 */
export const consentCookieName = 'tau-cookie-consent';
/** Open app documents re-read the cookie when a message arrives on this channel. */
export const consentChannelName = 'tau-cookie-consent';
/** The marketing site's former, site-only record; read once and migrated to the cookie. */
export const legacyConsentKey = 'tau-www-analytics-consent-v1';
const lifetimeSeconds = 365 * 24 * 60 * 60;

export type ConsentDecision = 'accepted' | 'declined';

/** Pre-versioned values the app still honours (`parseStoredConsent`). */
const legacyDecision = (value: unknown): ConsentDecision | undefined => {
  if (value === 'accepted' || value === 'granted') {
    return 'accepted';
  }
  return value === 'declined' || value === 'denied' ? 'declined' : undefined;
};

/**
 * Read the decision from a `document.cookie` string, in the app's versioned shape.
 * @param cookies - The cookie header or `document.cookie`.
 * @returns The stored decision, or `undefined` when absent or malformed.
 */
export const readConsentCookie: (cookies: string) => ConsentDecision | undefined = (cookies) => {
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (part.slice(0, separator).trim() !== consentCookieName) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(part.slice(separator + 1).trim()));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'version' in parsed &&
        parsed.version === 1 &&
        'status' in parsed &&
        (parsed.status === 'accepted' || parsed.status === 'declined')
      ) {
        return parsed.status;
      }
      return legacyDecision(parsed);
    } catch {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Serialize a decision, or its withdrawal, as a `document.cookie` assignment.
 * @param decision - The decision to store, or `undefined` to delete it.
 * @param secure - Whether the page is served over HTTPS.
 * @returns The assignment string.
 */
export const consentCookie: (decision: ConsentDecision | undefined, secure: boolean) => string = (decision, secure) => {
  const value = decision === undefined ? '' : encodeURIComponent(JSON.stringify({ status: decision, version: 1 }));
  const maxAge = decision === undefined ? 0 : lifetimeSeconds;
  return `${consentCookieName}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
};
