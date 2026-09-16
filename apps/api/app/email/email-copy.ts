/**
 * Strings and derived labels shared between the transactional emails and the code that sets the
 * deadlines they describe. Token lifetimes live here so `auth.ts` and the copy cannot drift apart.
 */

/** Seconds each emailed token stays valid. `auth.ts` configures Better Auth from these. */
export const tokenLifetimeSeconds = {
  magicLink: 5 * 60,
  resetPassword: 60 * 60,
  verifyEmail: 60 * 60,
} as const;

export type TokenLifetimeKind = keyof typeof tokenLifetimeSeconds;

const describeDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};

/** How a token lifetime is written in the copy, derived so a config change rewrites the sentence. */
export const expiresIn = (kind: TokenLifetimeKind): string => describeDuration(tokenLifetimeSeconds[kind]);

/** Footer strings, shared by every template. Operator ruling 2026-09-16 (OQ3) fixes the entity line. */
export const footerCopy = {
  entity: 'Tau · taucad limited · Auckland, New Zealand',
  helpUrl: 'https://docs.tau.new',
} as const;

// Coarse User-Agent labels for the security rows (OQ7). A dependency does not earn its weight here:
// the row only needs "Safari on macOS", and an unrecognised agent omits the row entirely.
// Order matters — Chrome's agent claims Safari, and Edge's claims both.
const browserTokens = [
  ['Edg/', 'Edge'],
  ['OPR/', 'Opera'],
  ['Firefox/', 'Firefox'],
  ['FxiOS/', 'Firefox'],
  ['CriOS/', 'Chrome'],
  ['Chrome/', 'Chrome'],
  ['Safari/', 'Safari'],
] as const;

const platformTokens = [
  ['iPhone', 'iOS'],
  ['iPad', 'iPadOS'],
  ['Android', 'Android'],
  ['Macintosh', 'macOS'],
  ['Windows', 'Windows'],
  ['Linux', 'Linux'],
] as const;

const findToken = (userAgent: string, tokens: ReadonlyArray<readonly [string, string]>): string | undefined =>
  tokens.find(([needle]) => userAgent.includes(needle))?.[1];

/** `Safari on macOS`, or undefined when the agent is missing or unrecognised, which drops the row. */
export const describeDevice = (userAgent: string | undefined): string | undefined => {
  if (!userAgent) {
    return undefined;
  }
  const browser = findToken(userAgent, browserTokens);
  const platform = findToken(userAgent, platformTokens);
  if (browser !== undefined && platform !== undefined) {
    return `${browser} on ${platform}`;
  }
  return browser ?? platform;
};

/** Pulls the User-Agent out of whatever request shape a Better Auth callback was handed. */
export const deviceFromRequest = (request: Request | Headers | undefined): string | undefined => {
  const headers = request instanceof Headers ? request : request?.headers;
  return describeDevice(headers?.get('user-agent') ?? undefined);
};
