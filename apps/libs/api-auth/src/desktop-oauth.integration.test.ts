/**
 * Tau Desktop's OAuth sign-in through the real `AuthModule` route (desktop sign-in execution plan DSI-1): the public
 * native client, its loopback redirect, PKCE, the 60-second code, rotation, the 90-day cap, revocation, and the
 * routes Tau keeps closed. The cases port the M0 spike (`docs/research/artifacts/desktop-sign-in-execution-plan/`).
 */
/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters (RFC 6749, RFC 7009, RFC 7636) and the provider's API names keep their spelling */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desktopClientId, desktopOauthDisabledPaths, desktopTokenLifetimes } from '#config/desktop-oauth.js';
import { createSessionCacheHarness } from '#testing/session-cache.fixture.js';
import type { CookieJar, SessionCacheHarness } from '#testing/session-cache.fixture.js';
import {
  approveSignIn,
  authorizeUrl,
  exchangeCode,
  locationOf,
  loopbackRedirect,
  pkcePair,
  postForm,
  refresh,
  signInDesktop,
  storedToken,
} from '#testing/desktop-oauth.fixture.js';
import type { DesktopTokens } from '#testing/desktop-oauth.fixture.js';

type Row = Record<string, unknown>;

describe('Tau Desktop OAuth sign-in', () => {
  let h: SessionCacheHarness;
  let jar: CookieJar;

  const rows = (model: string): Row[] => h.store[model] ?? [];

  beforeAll(async () => {
    h = await createSessionCacheHarness({ maxAgeSeconds: 0 });
    ({ jar } = await h.signUp());
  });

  afterAll(async () => {
    await h.close();
  });

  describe('authorization requests', () => {
    it('should send an unauthenticated browser to the Tau sign-in page with a signed query', async () => {
      const response = await h.inject({
        url: authorizeUrl({
          redirect_uri: loopbackRedirect(),
          state: 'state-1',
          code_challenge: pkcePair().challenge,
          code_challenge_method: 'S256',
        }),
      });

      const location = locationOf(response);
      expect(response.statusCode).toBe(302);
      expect(`${location.origin}${location.pathname}`).toBe('https://tau.new/auth/sign-in');
      expect(location.searchParams.get('sig')).toBeTruthy();
      expect(location.searchParams.get('client_id')).toBe(desktopClientId);
    });

    it('should send a signed-in browser asked for prompt=consent to the consent page', async () => {
      const { consentUrl } = await approveSignIn(h, jar);

      expect(`${consentUrl.origin}${consentUrl.pathname}`).toBe('https://tau.new/auth/desktop');
    });

    it('should send a signed-in browser asked for prompt=login back to the sign-in page', async () => {
      const response = await h.inject({
        url: authorizeUrl({
          redirect_uri: loopbackRedirect(),
          state: 's',
          code_challenge: pkcePair().challenge,
          code_challenge_method: 'S256',
          prompt: 'login consent',
        }),
        jar,
      });

      expect(locationOf(response).pathname).toBe('/auth/sign-in');
    });

    it.each([
      ['any loopback port with a random path', loopbackRedirect(65_000), true],
      ['the registered base without a random path', 'http://127.0.0.1:50002/cb', false],
      ['localhost', 'http://localhost:50003/cb/AAAAAAAAAAAAAAAAAAAAAAAA', false],
      ['a foreign host', 'http://attacker.invalid:50004/cb/AAAAAAAAAAAAAAAAAAAAAAAA', false],
      ['https on the loopback', 'https://127.0.0.1:50005/cb/AAAAAAAAAAAAAAAAAAAAAAAA', false],
      ['an added query', 'http://127.0.0.1:50006/cb/AAAAAAAAAAAAAAAAAAAAAAAA?next=x', false],
    ])('should admit %s only when it is the loopback shape', async (_label, redirect, admitted) => {
      const response = await h.inject({
        url: authorizeUrl({
          redirect_uri: redirect,
          state: 's',
          code_challenge: pkcePair().challenge,
          code_challenge_method: 'S256',
          prompt: 'consent',
        }),
        jar,
      });

      const location = locationOf(response);
      expect(location.pathname === '/auth/desktop').toBe(admitted);
      // A refused URI is never redirected to, not even with an error.
      expect(location.href.startsWith(redirect)).toBe(false);
    });

    it('should refuse a request without PKCE or with the plain method', async () => {
      const withoutPkce = await h.inject({ url: authorizeUrl({ redirect_uri: loopbackRedirect(), state: 's' }), jar });
      const plain = await h.inject({
        url: authorizeUrl({
          redirect_uri: loopbackRedirect(),
          state: 's',
          code_challenge: 'A'.repeat(43),
          code_challenge_method: 'plain',
        }),
        jar,
      });

      expect(locationOf(withoutPkce).searchParams.get('error')).toBe('invalid_request');
      expect(locationOf(plain).searchParams.get('error')).toBe('invalid_request');
    });

    it('should skip a remembered consent unless the desktop asks for prompt=consent', async () => {
      await signInDesktop(h, jar);
      const response = await h.inject({
        url: authorizeUrl({
          redirect_uri: loopbackRedirect(),
          state: 's',
          code_challenge: pkcePair().challenge,
          code_challenge_method: 'S256',
        }),
        jar,
      });

      // This is why the desktop always sends prompt=consent (execution plan E2).
      expect(locationOf(response).hostname).toBe('127.0.0.1');
    });
  });

  describe('code exchange', () => {
    it('should return the code to the loopback listener with the state, then issue tokens over a form POST', async () => {
      const signIn = await approveSignIn(h, jar);
      expect(signIn.back.hostname).toBe('127.0.0.1');
      expect(signIn.back.searchParams.get('state')).toBe(signIn.state);

      const response = await exchangeCode(h, signIn);
      const tokens = response.json<DesktopTokens>();

      expect(response.statusCode).toBe(200);
      expect(tokens.token_type.toLowerCase()).toBe('bearer');
      expect(tokens.expires_in).toBe(desktopTokenLifetimes.accessToken);
      expect(tokens.refresh_token).toEqual(expect.any(String));
      expect(JSON.stringify(rows('oauthAccessToken'))).not.toContain(tokens.access_token);
      expect(JSON.stringify(rows('oauthRefreshToken'))).not.toContain(tokens.refresh_token);
    });

    it('should refuse a reused code', async () => {
      const signIn = await approveSignIn(h, jar);
      await exchangeCode(h, signIn);

      const reuse = await exchangeCode(h, signIn);

      expect(reuse.statusCode).toBe(400);
      expect(reuse.json<{ error: string }>().error).toBe('invalid_grant');
    });

    it('should refuse a wrong verifier', async () => {
      const signIn = await approveSignIn(h, jar);

      const response = await exchangeCode(h, { ...signIn, verifier: pkcePair().verifier });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should refuse a code older than 60 seconds while the consent page itself stays valid for ten minutes', async () => {
      const signIn = await approveSignIn(h, jar);
      const row = rows('verification').find((candidate) => candidate['identifier'] === storedToken(signIn.code));
      expect(row).toBeDefined();
      row!['createdAt'] = new Date(Date.now() - (desktopTokenLifetimes.code + 1) * 1000);

      const response = await exchangeCode(h, signIn);

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error_description: string }>().error_description).toBe('authorization code expired');
      const secondsLeft = Number(signIn.consentUrl.searchParams.get('exp')) - Math.floor(Date.now() / 1000);
      expect(secondsLeft).toBeGreaterThan(desktopTokenLifetimes.signedPage - 30);
    });
  });

  describe('refresh', () => {
    it('should rotate the refresh token and revoke the family when a rotated token is replayed', async () => {
      const first = await signInDesktop(h, jar);
      const rotated = await refresh(h, first.refresh_token);
      const second = rotated.json<DesktopTokens>();
      expect(second.refresh_token).not.toBe(first.refresh_token);

      const replay = await refresh(h, first.refresh_token);
      const afterReplay = await refresh(h, second.refresh_token);

      expect(replay.statusCode).toBe(400);
      expect(afterReplay.statusCode).toBe(400);
    });

    it('should keep the family id across rotations and slide the expiry', async () => {
      const first = await signInDesktop(h, jar);
      const firstRow = rows('oauthRefreshToken').find((row) => row['token'] === storedToken(first.refresh_token))!;
      const rotated = await refresh(h, first.refresh_token);
      const second = rotated.json<DesktopTokens>();
      const secondRow = rows('oauthRefreshToken').find((row) => row['token'] === storedToken(second.refresh_token))!;

      expect(firstRow['authorizationCodeId']).toEqual(expect.any(String));
      expect(secondRow['authorizationCodeId']).toBe(firstRow['authorizationCodeId']);
      const refreshLifetime =
        new Date(secondRow['expiresAt'] as Date).getTime() - new Date(secondRow['createdAt'] as Date).getTime();
      expect(refreshLifetime).toBe(desktopTokenLifetimes.refreshToken * 1000);
    });

    it('should refuse a refresh 90 days after the sign-in and revoke its family', async () => {
      const first = await signInDesktop(h, jar);
      const rotated = await refresh(h, first.refresh_token);
      const second = rotated.json<DesktopTokens>();
      const familyId = rows('oauthRefreshToken').find((row) => row['token'] === storedToken(second.refresh_token))![
        'authorizationCodeId'
      ];
      const family = rows('oauthRefreshToken').filter((row) => row['authorizationCodeId'] === familyId);
      for (const row of family) {
        row['createdAt'] = new Date(Date.now() - (desktopTokenLifetimes.signIn + 60) * 1000);
      }

      const response = await refresh(h, second.refresh_token);

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error_description: string }>().error_description).toBe('sign-in ended');
      expect(family.every((row) => row['revoked'] instanceof Date)).toBe(true);
      expect(
        rows('oauthAccessToken')
          .filter((row) => row['authorizationCodeId'] === familyId)
          .every((row) => row['revoked'] instanceof Date),
      ).toBe(true);
    });

    it('should still refresh a family inside the cap', async () => {
      const first = await signInDesktop(h, jar);
      const familyId = rows('oauthRefreshToken').find((row) => row['token'] === storedToken(first.refresh_token))![
        'authorizationCodeId'
      ];
      for (const row of rows('oauthRefreshToken').filter(
        (candidate) => candidate['authorizationCodeId'] === familyId,
      )) {
        row['createdAt'] = new Date(Date.now() - (desktopTokenLifetimes.signIn - 60) * 1000);
      }

      const refreshed = await refresh(h, first.refresh_token);

      expect(refreshed.statusCode).toBe(200);
    });
  });

  describe('revocation (RFC 7009)', () => {
    it('should revoke the access token and then the refresh token without a client secret', async () => {
      const tokens = await signInDesktop(h, jar);

      const access = await postForm(h, '/oauth2/revoke', {
        token: tokens.access_token,
        token_type_hint: 'access_token',
        client_id: desktopClientId,
      });
      const refreshRevoke = await postForm(h, '/oauth2/revoke', {
        token: tokens.refresh_token,
        token_type_hint: 'refresh_token',
        client_id: desktopClientId,
      });

      expect(access.statusCode).toBe(200);
      expect(refreshRevoke.statusCode).toBe(200);
      // The provider deletes a revoked access token's row; the resolver then finds nothing.
      expect(rows('oauthAccessToken').some((row) => row['token'] === storedToken(tokens.access_token))).toBe(false);
      const afterRevoke = await refresh(h, tokens.refresh_token);
      expect(afterRevoke.statusCode).toBe(400);
    });
  });

  describe('what the desktop token cannot do', () => {
    it.each([
      ['GET', '/v1/auth/list-sessions', undefined],
      ['POST', '/v1/auth/revoke-other-sessions', {}],
      [
        'POST',
        '/v1/auth/change-password',
        { currentPassword: 'correct horse battery staple', newPassword: 'another long passphrase' },
      ],
      ['POST', '/v1/auth/delete-user', {}],
      ['POST', '/v1/auth/update-user', { name: 'Renamed' }],
      ['POST', '/v1/auth/api-key/create', { name: 'key' }],
      ['GET', '/v1/auth/one-time-token/generate', undefined],
      ['POST', '/v1/auth/device/approve', { userCode: 'ABCD1234' }],
    ] as const)('should refuse %s %s for a desktop access token', async (method, url, payload) => {
      const tokens = await signInDesktop(h, jar);

      const response = await h.fastify.inject({
        method,
        url,
        headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' },
        ...(payload === undefined ? {} : { payload }),
      });

      expect([401, 403]).toContain(response.statusCode);
    });

    it('should refuse to accept a consent for a desktop access token', async () => {
      const tokens = await signInDesktop(h, jar);
      const { challenge } = pkcePair();
      const pending = await h.inject({
        url: authorizeUrl({
          redirect_uri: loopbackRedirect(),
          state: 's',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          prompt: 'consent',
        }),
        jar,
      });

      const response = await h.fastify.inject({
        method: 'POST',
        url: '/v1/auth/oauth2/consent',
        headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' },
        payload: { accept: true, oauth_query: locationOf(pending).search.slice(1) },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should read no Better Auth session from a desktop access token', async () => {
      const tokens = await signInDesktop(h, jar);

      const session = await h.auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${tokens.access_token}` }),
      });

      expect(session).toBeNull();
    });

    it('should not let a desktop access token approve a sign-in of its own', async () => {
      const tokens = await signInDesktop(h, jar);

      const response = await h.fastify.inject({
        method: 'GET',
        url: authorizeUrl({
          redirect_uri: loopbackRedirect(),
          state: 's',
          code_challenge: pkcePair().challenge,
          code_challenge_method: 'S256',
        }),
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });

      expect(locationOf(response).pathname).toBe('/auth/sign-in');
    });
  });

  // Spike finding 5 (security-load-bearing): no client can be registered, and the unused provider routes are closed.
  describe('client registration and unused provider routes', () => {
    it.each(desktopOauthDisabledPaths)('should answer 404 for %s from a signed-in browser', async (path) => {
      const response = await h.inject({ method: 'POST', url: `/v1/auth${path}`, jar, payload: {} });
      const read = await h.inject({ url: `/v1/auth${path}`, jar });

      expect(response.statusCode).toBe(404);
      expect(read.statusCode).toBe(404);
    });

    it('should refuse to register a client even through the server API, for any session', async () => {
      const cookie = jar.header();
      const before = rows('oauthClient').length;

      // The harness types `auth` as the generic `Auth`; the endpoint exists because the static plugin set mounts it.
      const { createOAuthClient } = h.auth.api as unknown as {
        createOAuthClient: (input: unknown) => Promise<unknown>;
      };
      await expect(
        createOAuthClient({
          headers: new Headers({ cookie }),
          body: { redirect_uris: ['https://attacker.invalid/callback'], token_endpoint_auth_method: 'none' },
        }),
      ).rejects.toMatchObject({ status: 'UNAUTHORIZED' });
      expect(rows('oauthClient')).toHaveLength(before);
    });

    it('should hold exactly the seeded desktop client', () => {
      expect(rows('oauthClient').map((row) => row['clientId'])).toEqual([desktopClientId]);
    });
  });
});
