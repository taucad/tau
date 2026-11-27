/**
 * Tau Desktop's side of the OAuth sign-in, driven against harness H1 (`session-cache.fixture.ts`): what the desktop's
 * main process and the consent page each send, minus the browser. Test code only.
 */
/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters (RFC 6749, RFC 7009, RFC 7636) and the provider's API names keep their spelling */
import { createHash, randomBytes } from 'node:crypto';
import type { LightMyRequestResponse } from 'fastify';
import { desktopClientId, desktopScopes } from '#config/desktop-oauth.js';
import type { CookieJar, SessionCacheHarness } from '#testing/session-cache.fixture.js';

/** A PKCE pair (RFC 7636, S256). */
export const pkcePair = (): { verifier: string; challenge: string } => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

/** A loopback redirect URI of the shape the desktop opens for one attempt. */
export const loopbackRedirect = (port = 49_152): string =>
  `http://127.0.0.1:${String(port)}/cb/${randomBytes(24).toString('base64url')}`;

/** The stored (hashed) form of a code or token. */
export const storedToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

/** `/v1/auth/oauth2/authorize?…` for the desktop client. */
export const authorizeUrl = (parameters: Record<string, string>): string =>
  `/v1/auth/oauth2/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: desktopClientId,
    scope: desktopScopes.join(' '),
    ...parameters,
  }).toString()}`;

/** The `Location` of a redirect, parsed. */
export const locationOf = (response: LightMyRequestResponse): URL => {
  const { location } = response.headers;
  if (typeof location !== 'string') {
    throw new TypeError(`Expected a redirect, got ${String(response.statusCode)}: ${response.body.slice(0, 200)}`);
  }
  return new URL(location);
};

/** A form POST through the real `AuthModule` route, as the desktop's main process sends it (no cookie, no Origin). */
export const postForm = async (
  h: SessionCacheHarness,
  path: string,
  form: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> =>
  h.fastify.inject({
    method: 'POST',
    url: `/v1/auth${path}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload: new URLSearchParams(form).toString(),
  });

export type ApprovedSignIn = {
  readonly verifier: string;
  readonly redirect: string;
  readonly state: string;
  /** The consent page URL the provider sent the browser to. */
  readonly consentUrl: URL;
  /** Where the consent answer sends the browser: the desktop's listener. */
  readonly back: URL;
  readonly code: string;
};

/**
 * Authorize with `prompt=consent` in a signed-in browser and accept on the consent page.
 *
 * @param h - The harness.
 * @param jar - The browser's cookies.
 * @param port - The loopback port.
 * @returns What the desktop's listener receives, with the PKCE verifier it holds.
 */
export const approveSignIn = async (h: SessionCacheHarness, jar: CookieJar, port = 49_152): Promise<ApprovedSignIn> => {
  const { verifier, challenge } = pkcePair();
  const redirect = loopbackRedirect(port);
  const state = randomBytes(16).toString('base64url');
  const authorize = await h.inject({
    url: authorizeUrl({
      redirect_uri: redirect,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    }),
    jar,
  });
  const consentUrl = locationOf(authorize);
  const consent = await h.inject({
    method: 'POST',
    url: '/v1/auth/oauth2/consent',
    jar,
    payload: { accept: true, oauth_query: consentUrl.search.slice(1) },
  });
  const back = new URL(consent.json<{ url: string }>().url);
  return { verifier, redirect, state, consentUrl, back, code: back.searchParams.get('code') ?? '' };
};

export type DesktopTokens = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly token_type: string;
  readonly scope: string;
};

/**
 * Exchange the code as the desktop does.
 *
 * @param h - The harness.
 * @param signIn - The approved sign-in.
 * @returns The token endpoint's response.
 */
export const exchangeCode = async (h: SessionCacheHarness, signIn: ApprovedSignIn): Promise<LightMyRequestResponse> =>
  postForm(h, '/oauth2/token', {
    grant_type: 'authorization_code',
    code: signIn.code,
    code_verifier: signIn.verifier,
    redirect_uri: signIn.redirect,
    client_id: desktopClientId,
  });

/**
 * Sign the desktop in end to end and return its tokens.
 *
 * @param h - The harness.
 * @param jar - The approving browser's cookies.
 * @returns The token set.
 */
export const signInDesktop = async (h: SessionCacheHarness, jar: CookieJar): Promise<DesktopTokens> => {
  const response = await exchangeCode(h, await approveSignIn(h, jar));
  if (response.statusCode !== 200) {
    throw new Error(`Token exchange failed with ${String(response.statusCode)}: ${response.body}`);
  }
  return response.json<DesktopTokens>();
};

/**
 * Refresh as the desktop does.
 *
 * @param h - The harness.
 * @param refreshToken - The current refresh token.
 * @returns The token endpoint's response.
 */
export const refresh = async (h: SessionCacheHarness, refreshToken: string): Promise<LightMyRequestResponse> =>
  postForm(h, '/oauth2/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: desktopClientId,
  });
