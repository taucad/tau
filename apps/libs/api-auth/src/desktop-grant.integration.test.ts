/* oxlint-disable new-cap -- NestJS decorators use PascalCase. */
/**
 * Tau Desktop's OAuth access token on Tau's own routes (desktop sign-in execution plan DSI-2): `SessionResolver`'s
 * desktop branch, the guard, `@RequireWebSession()` and `@AuthClient()`. Harness H1 with the real `AuthModule`.
 */
/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters keep their spelling */
import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthGuard } from '#auth.guard.js';
import { AuthClient, RequireWebSession } from '#decorators/auth.decorator.js';
import { DesktopGrantVerifier } from '#desktop-grant.js';
import type { AuthClientKind } from '#desktop-grant.js';
import { createSessionCacheHarness } from '#testing/session-cache.fixture.js';
import type { CookieJar, SessionCacheHarness } from '#testing/session-cache.fixture.js';
import { postForm, refresh, signInDesktop, storedToken } from '#testing/desktop-oauth.fixture.js';
import type { DesktopTokens } from '#testing/desktop-oauth.fixture.js';

type RequestWithUser = FastifyRequest & { user?: { id?: string }; session?: { session?: { id?: string } } };

@Controller({ path: 'desktop-grant-test', version: '1' })
@UseGuards(AuthGuard)
class DesktopGrantTestController {
  @Get()
  public read(
    @Req() request: RequestWithUser,
    @AuthClient() client: AuthClientKind,
  ): { userId: string | undefined; sessionId: string | undefined; client: AuthClientKind } {
    return { userId: request.user?.id, sessionId: request.session?.session?.id, client };
  }

  @Post('governs')
  @HttpCode(200)
  @RequireWebSession()
  public governs(@Req() request: RequestWithUser): { userId: string | undefined } {
    return { userId: request.user?.id };
  }
}

type Row = Record<string, unknown>;

describe('Tau Desktop access token on Tau routes', () => {
  let h: SessionCacheHarness;
  let jar: CookieJar;
  let userId: string;

  const rows = (model: string): Row[] => h.store[model] ?? [];
  const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
  const resolve = async (token: string) => h.sessions.resolve({ headers: bearer(token), method: 'GET' });
  const read = async (token: string) => h.inject({ url: '/v1/desktop-grant-test', headers: bearer(token) });
  const accessRow = (tokens: DesktopTokens): Row | undefined =>
    rows('oauthAccessToken').find((row) => row['token'] === storedToken(tokens.access_token));

  beforeAll(async () => {
    h = await createSessionCacheHarness({ maxAgeSeconds: 0, controllers: [DesktopGrantTestController] });
    ({ jar, userId } = await h.signUp());
  });

  afterAll(async () => {
    await h.close();
  });

  it('should resolve the account and a credential-free session named for the sign-in', async () => {
    const tokens = await signInDesktop(h, jar);

    const resolution = await resolve(tokens.access_token);

    expect(resolution.client).toBe('desktop');
    expect(resolution.user?.id).toBe(userId);
    expect(resolution.session?.id).toBe(accessRow(tokens)?.['authorizationCodeId']);
    expect(resolution.session?.token).toBe('');
    expect(resolution.setCookies).toEqual([]);
  });

  it('should admit the token on a guarded route and tell the handler it is the desktop', async () => {
    const tokens = await signInDesktop(h, jar);

    const response = await read(tokens.access_token);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userId, client: 'desktop' });
  });

  it('should tell a handler a cookie session is the web', async () => {
    const response = await h.inject({ url: '/v1/desktop-grant-test', jar });

    expect(response.json()).toMatchObject({ userId, client: 'web' });
  });

  // Spike finding 3 (security-load-bearing): the grant is checked on its own record, never through the browser session.
  describe('independence from the approving browser session', () => {
    it('should keep accepting the token after the approving browser session expires', async () => {
      const { jar: browser } = await h.signUp();
      const tokens = await signInDesktop(h, browser);
      const sessionId = accessRow(tokens)?.['sessionId'];
      const browserSession = rows('session').find((row) => row['id'] === sessionId);
      expect(browserSession).toBeDefined();
      browserSession!['expiresAt'] = new Date(Date.now() - 1000);

      const resolution = await resolve(tokens.access_token);
      const rotated = await refresh(h, tokens.refresh_token);
      const next = rotated.json<DesktopTokens>();
      const afterRefresh = await resolve(next.access_token);

      expect(resolution.user).not.toBeNull();
      expect(rotated.statusCode).toBe(200);
      expect(afterRefresh.user).not.toBeNull();
    });

    it('should keep the sign-in through a refresh after the approving browser session is deleted', async () => {
      const signedUp = await h.signUp();
      const tokens = await signInDesktop(h, signedUp.jar);

      h.deleteSessions(signedUp.userId);
      const rotated = await refresh(h, tokens.refresh_token);
      const next = rotated.json<DesktopTokens>();

      expect(rotated.statusCode).toBe(200);
      const resolution = await resolve(next.access_token);
      expect(resolution.user?.id).toBe(signedUp.userId);
    });

    it('should keep the same session id across a refresh, so a GitHub connect attempt survives one', async () => {
      const tokens = await signInDesktop(h, jar);
      const before = await resolve(tokens.access_token);
      const rotated = await refresh(h, tokens.refresh_token);
      const next = rotated.json<DesktopTokens>();
      const after = await resolve(next.access_token);

      expect(after.session?.id).toBe(before.session?.id);
    });
  });

  describe('tokens that must not authenticate', () => {
    it('should refuse a revoked access token', async () => {
      const tokens = await signInDesktop(h, jar);
      await postForm(h, '/oauth2/revoke', {
        token: tokens.access_token,
        token_type_hint: 'access_token',
        client_id: 'tau-desktop',
      });

      const resolution = await resolve(tokens.access_token);
      const response = await read(tokens.access_token);
      expect(resolution.user).toBeNull();
      expect(response.statusCode).toBe(401);
    });

    it('should refuse an expired access token', async () => {
      const tokens = await signInDesktop(h, jar);
      accessRow(tokens)!['expiresAt'] = new Date(Date.now() - 1000);

      const resolution = await resolve(tokens.access_token);
      expect(resolution.user).toBeNull();
    });

    it('should refuse a token marked revoked by the 90-day cap', async () => {
      const tokens = await signInDesktop(h, jar);
      accessRow(tokens)!['revoked'] = new Date();

      const resolution = await resolve(tokens.access_token);
      expect(resolution.user).toBeNull();
    });

    it("should refuse another client's token", async () => {
      const tokens = await signInDesktop(h, jar);
      accessRow(tokens)!['clientId'] = 'another-client';

      const resolution = await resolve(tokens.access_token);
      expect(resolution.user).toBeNull();
    });

    it('should refuse a token whose account is gone', async () => {
      const signedUp = await h.signUp();
      const tokens = await signInDesktop(h, signedUp.jar);
      const users = rows('user');
      users.splice(
        users.findIndex((row) => row['id'] === signedUp.userId),
        1,
      );

      const resolution = await resolve(tokens.access_token);
      expect(resolution.user).toBeNull();
    });

    it('should refuse an unknown opaque bearer on its own', async () => {
      const response = await read('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

      expect(response.statusCode).toBe(401);
    });

    it('should leave an unknown bearer beside a cookie to the cookie, as before, and call it the web', async () => {
      const response = await h.inject({
        url: '/v1/desktop-grant-test',
        jar,
        headers: bearer('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      });

      expect(response.json()).toMatchObject({ userId, client: 'web' });
    });

    it('should refuse every token while the desktop client is disabled', async () => {
      const tokens = await signInDesktop(h, jar);
      const client = rows('oauthClient')[0]!;
      client['disabled'] = true;
      try {
        // A fresh verifier: the resolver's own one trusts the client's flag for 30 seconds.
        expect(await new DesktopGrantVerifier(h.auth).verify(tokens.access_token)).toBeUndefined();
      } finally {
        client['disabled'] = false;
      }
    });
  });

  describe('@RequireWebSession()', () => {
    it('should refuse the desktop token with WEB_SESSION_REQUIRED', async () => {
      const tokens = await signInDesktop(h, jar);

      const response = await h.inject({
        method: 'POST',
        url: '/v1/desktop-grant-test/governs',
        headers: bearer(tokens.access_token),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'WEB_SESSION_REQUIRED' });
    });

    it('should answer a web session', async () => {
      const response = await h.inject({ method: 'POST', url: '/v1/desktop-grant-test/governs', jar });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ userId });
    });

    it('should still answer 401, not 403, to no credential', async () => {
      const response = await h.inject({ method: 'POST', url: '/v1/desktop-grant-test/governs' });

      expect(response.statusCode).toBe(401);
    });
  });
});
