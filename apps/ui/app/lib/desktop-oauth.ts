import { requireClientEnvironmentUrl } from '#environment.config.js';

/*
 * Tau Desktop signs in as a public OAuth client of the API's provider (desktop sign-in execution plan DSI-3). The
 * provider sends the browser to `/auth/sign-in` or `/auth/desktop` with a signed query (`sig`, `exp`, `ba_*`) that names
 * the authorization request; these helpers read it and rebuild the request when the page must send the browser back.
 */

/** The one client this web app shows a consent page for. */
export const desktopOauthClientId = 'tau-desktop';

/** The client's name as the page shows it. */
export const desktopOauthClientName = 'Tau Desktop';

/** Parameters the provider adds when it signs a query; never part of the authorization request itself. */
const signatureParameters = new Set(['sig', 'exp', 'ba_iat', 'ba_param', 'ba_pl', 'redirectTo', 'continue']);

/** A signed authorization request for Tau Desktop, as a login or consent page receives it. */
export type DesktopAuthorization = {
  /** The signed query, exactly as `/oauth2/consent` and the sign-in calls expect it as `oauth_query`. */
  readonly oauthQuery: string;
  /** When the signed query, and with it this page, stops being accepted. Milliseconds since the epoch. */
  readonly expiresAt: number;
  /** When the provider signed it. Milliseconds since the epoch. */
  readonly issuedAt: number | undefined;
  /** The prompts the request carries: `consent`, and `login` when a different account was asked for. */
  readonly prompts: readonly string[];
  /** The authorization request's own parameters, without the signature. */
  readonly request: URLSearchParams;
  /**
   * The page was reached after a sign-in on this request's sign-in page (`continue=1`, or `prompt=login`), so the
   * provider must be asked again, for consent only, rather than answered with this query.
   */
  readonly isContinuation: boolean;
};

/**
 * Reads a signed Tau Desktop authorization request from a page's query.
 *
 * @param search - The page's query string, with or without `?`.
 * @returns The request, or `undefined` when the query is not a signed request for Tau Desktop.
 */
export const readDesktopAuthorization = (search: string): DesktopAuthorization | undefined => {
  const parameters = new URLSearchParams(search);
  const expiresAtSeconds = Number(parameters.get('exp'));
  if (
    parameters.get('client_id') !== desktopOauthClientId ||
    parameters.getAll('sig').length !== 1 ||
    !Number.isFinite(expiresAtSeconds) ||
    expiresAtSeconds <= 0
  ) {
    return undefined;
  }
  // Only the names the provider signed (listed in `ba_param`), as its own client does: anything this app adds to the
  // address, such as `redirectTo`, would break the signature.
  const signedNames = new Set(parameters.getAll('ba_param'));
  const signed = new URLSearchParams();
  for (const [name, value] of parameters) {
    if (name === 'sig' || name === 'ba_param' || signedNames.has(name)) {
      signed.append(name, value);
    }
  }
  const request = new URLSearchParams();
  for (const [name, value] of parameters) {
    if (!signatureParameters.has(name)) {
      request.append(name, value);
    }
  }
  const issued = Number(parameters.get('ba_iat'));
  return {
    oauthQuery: signed.toString(),
    expiresAt: expiresAtSeconds * 1000,
    issuedAt: Number.isFinite(issued) && issued > 0 ? issued : undefined,
    prompts: (parameters.get('prompt') ?? '').split(' ').filter(Boolean),
    request,
    isContinuation: parameters.get('continue') === '1' || (parameters.get('prompt') ?? '').split(' ').includes('login'),
  };
};

/**
 * The API's authorization URL for the same request with other prompts: `consent` to continue to the consent page,
 * `login consent` to sign in as a different account first.
 *
 * @param authorization - The request this page received.
 * @param prompt - The prompts to send.
 * @returns The absolute URL to navigate the browser to.
 */
export const desktopAuthorizeUrl = (
  authorization: DesktopAuthorization,
  prompt: 'consent' | 'login consent',
): string => {
  const request = new URLSearchParams(authorization.request);
  request.set('prompt', prompt);
  return `${requireClientEnvironmentUrl('TAU_API_URL')}/v1/auth/oauth2/authorize?${request.toString()}`;
};

/**
 * Where a sign-in on a Tau Desktop request's sign-in page goes next: the consent page, marked as a continuation so it
 * asks the provider again (an emailed link or a provider round trip lands there with this query).
 *
 * @param authorization - The request the sign-in page received.
 * @returns The same-origin path for `redirectTo`.
 */
export const desktopContinuationPath = (authorization: DesktopAuthorization): string =>
  `/auth/desktop?${authorization.oauthQuery}&continue=1`;

/** Where Tau Desktop sends the browser after it received the sign-in: `/auth/desktop?result=…`. */
export const desktopSignInResults = ['signed-in', 'failed'] as const;

/** Why a sign-in failed, as Tau Desktop reports it in `reason`. */
export const desktopSignInFailureReasons = ['canceled', 'expired', 'error'] as const;

export type DesktopSignInResult =
  | { readonly kind: 'signed-in' }
  | { readonly kind: 'failed'; readonly reason: (typeof desktopSignInFailureReasons)[number] };

/**
 * Reads the outcome Tau Desktop reported after a sign-in.
 *
 * @param search - The page's query string.
 * @returns The outcome, or `undefined` when the page carries none.
 */
export const readDesktopSignInResult = (search: string): DesktopSignInResult | undefined => {
  const parameters = new URLSearchParams(search);
  const result = parameters.get('result');
  if (result === 'signed-in') {
    return { kind: 'signed-in' };
  }
  if (result !== 'failed') {
    return undefined;
  }
  const reason = parameters.get('reason');
  return {
    kind: 'failed',
    reason: reason === 'canceled' || reason === 'expired' ? reason : 'error',
  };
};
