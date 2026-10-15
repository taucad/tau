/**
 * The optional-analytics decision shared by the Tau app (`apps/ui`) and website (`apps/www`).
 *
 * The edge serves both on one hostname, so a host-only `Path=/` cookie written by either is read by
 * both: a choice made on the website applies in the app and the reverse. The cookie carries only the
 * decision and a format version so a changed purpose can require a new decision.
 */

/** Cookie holding the decision. */
export const consentCookieName = 'tau-cookie-consent';

/** Documents of the same origin re-read the cookie when a message arrives on this channel. */
export const consentChannelName = 'tau-cookie-consent';

/** Days a recorded decision lasts before the visitor is asked again. */
export const consentLifetimeDays = 365;

/** A recorded choice. */
export type ConsentDecision = 'accepted' | 'declined';

/** The effective state: a recorded choice, or `unknown` when none is valid. */
export type ConsentStatus = ConsentDecision | 'unknown';

const legacyDecision = (value: unknown): ConsentDecision | undefined => {
  if (value === 'accepted' || value === 'granted') {
    return 'accepted';
  }
  return value === 'declined' || value === 'denied' ? 'declined' : undefined;
};

/**
 * Parse a stored cookie value (already URI-decoded).
 *
 * @param value - The raw cookie value, or `undefined` when absent.
 * @returns The status, and whether it came from a pre-versioned value that should be rewritten.
 */
export const parseConsent = (
  value: string | undefined,
): { readonly legacy: boolean; readonly status: ConsentStatus } => {
  if (value === undefined) {
    return { legacy: false, status: 'unknown' };
  }

  let parsed: unknown = value;
  try {
    parsed = JSON.parse(value);
  } catch {
    // A bare legacy word is not JSON.
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    parsed.version === 1 &&
    'status' in parsed &&
    (parsed.status === 'accepted' || parsed.status === 'declined')
  ) {
    return { legacy: false, status: parsed.status };
  }

  const legacy = legacyDecision(parsed);
  return legacy === undefined ? { legacy: false, status: 'unknown' } : { legacy: true, status: legacy };
};

/**
 * Read the decision from a `Cookie` header or `document.cookie` string.
 *
 * @param cookies - Semicolon-separated cookie pairs.
 * @returns The recorded status, `unknown` when absent or malformed.
 */
export const readConsentCookie = (cookies: string | undefined): ConsentStatus => {
  for (const part of (cookies ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== consentCookieName) {
      continue;
    }
    let value: string;
    try {
      value = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return 'unknown';
    }
    return parseConsent(value).status;
  }
  return 'unknown';
};

/**
 * Serialize a decision, or its withdrawal, as a `document.cookie` assignment.
 *
 * @param decision - The decision to store, or `undefined` to delete the cookie.
 * @param secure - Whether the page is served over HTTPS.
 * @returns The assignment string.
 */
export const serializeConsentCookie = (decision: ConsentDecision | undefined, secure: boolean): string => {
  const value = decision === undefined ? '' : encodeURIComponent(JSON.stringify({ status: decision, version: 1 }));
  const maxAge = decision === undefined ? 0 : consentLifetimeDays * 24 * 60 * 60;
  return `${consentCookieName}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
};

/**
 * Record a decision, or withdraw it, in this browser and tell other open documents of the origin.
 * Callers apply their own privacy-signal rules before calling.
 *
 * @param decision - The decision to store, or `undefined` to withdraw it.
 */
export const writeConsent = (decision: ConsentDecision | undefined): void => {
  // oxlint-disable-next-line unicorn/no-document-cookie -- Server requests must carry the decision; the Cookie Store API is not universally available.
  document.cookie = serializeConsentCookie(decision, globalThis.location.protocol === 'https:');
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }
  const channel = new BroadcastChannel(consentChannelName);
  channel.postMessage(decision ?? 'unknown');
  channel.close();
};
