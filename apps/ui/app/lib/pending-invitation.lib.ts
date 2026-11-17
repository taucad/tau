import * as Cookies from 'es-cookie';

/**
 * Where an invitation token waits between arriving and being accepted (#2290).
 *
 * An invitation link carries a bearer token in its path, and a page whose own
 * address holds a token leaks it: analytics record the URL, the sign-in round
 * trip copies it into `?redirectTo=`, and a replay resolves every relative
 * `href` on the page against it. So the token never stays in the address bar.
 * The web server takes it out of `/invitations/<token>` before any document
 * renders and answers a redirect to `/invitations`, holding the token in this
 * cookie; the desktop shell, which has no server, holds it in session storage
 * before the router commits the URL. `/invitations` reads it back, posts it to
 * the API, and forgets it once the API has answered for good.
 *
 * The cookie is scoped to `/invitations`, so no other request on the site
 * carries it, and is readable by script because the accept is a cross-origin
 * call the page makes with the API's own session cookie: a server holding the
 * token could not make it on the visitor's behalf.
 */
export const pendingInvitationCookieName = 'tau-invitation';

/** The only path that reads the token back. */
export const pendingInvitationPath = '/invitations';

/**
 * How long an unaccepted token waits, in seconds: long enough to sign up and
 * verify an address, short enough not to outlive the visit. Opening the link
 * again holds it again.
 */
const pendingInvitationLifetime = 24 * 60 * 60;

/** The desktop shell's copy: session storage, since `app://` has no server to set a cookie. */
const pendingInvitationStorageKey = 'tau.pending-invitation';

/**
 * The `Set-Cookie` value that holds a token on the web.
 *
 * @param token - The token taken from the invitation path.
 * @param requestUrl - The request it arrived on, whose protocol decides `Secure`.
 * @returns The header value.
 */
export const pendingInvitationCookie = (token: string, requestUrl: string): string => {
  const isSecure = new URL(requestUrl).protocol === 'https:';
  return [
    `${pendingInvitationCookieName}=${encodeURIComponent(token)}`,
    `Path=${pendingInvitationPath}`,
    `Max-Age=${pendingInvitationLifetime}`,
    'SameSite=Lax',
    ...(isSecure ? ['Secure'] : []),
  ].join('; ');
};

/**
 * Hold a token where no server can: the desktop shell's session storage.
 *
 * @param token - The token taken from the invitation path.
 */
export const holdPendingInvitation = (token: string): void => {
  try {
    globalThis.sessionStorage.setItem(pendingInvitationStorageKey, token);
  } catch {
    // A blocked store holds nothing; `/invitations` then says there is no invitation to open.
  }
};

/**
 * The token waiting to be accepted, from whichever host held it.
 *
 * @returns The token, or `undefined` when no invitation is waiting.
 */
export const readPendingInvitation = (): string | undefined => {
  const fromCookie = Cookies.get(pendingInvitationCookieName);
  if (fromCookie !== undefined && fromCookie !== '') {
    return fromCookie;
  }
  try {
    return globalThis.sessionStorage.getItem(pendingInvitationStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * Forget a token on both hosts, once the API has accepted or refused it for good.
 *
 * Only the token this page answered for: another tab may have opened a newer
 * link while this one's accept was in flight, and that one must survive.
 *
 * @param token - The token the API has just answered for.
 */
export const clearPendingInvitation = (token: string): void => {
  if (Cookies.get(pendingInvitationCookieName) === token) {
    Cookies.remove(pendingInvitationCookieName, { path: pendingInvitationPath });
  }
  try {
    if (globalThis.sessionStorage.getItem(pendingInvitationStorageKey) === token) {
      globalThis.sessionStorage.removeItem(pendingInvitationStorageKey);
    }
  } catch {
    // Nothing was held there.
  }
};
