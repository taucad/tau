/**
 * The desktop OAuth sign-in on PostgreSQL through the Drizzle adapter, the storage production uses (desktop sign-in
 * execution plan DSI-1). Proves what the memory adapter cannot: the migration's tables, arrays and JSON columns
 * round-trip through the provider, the seeded `tau-desktop` client is the one the provider finds, and deleting the
 * approving browser session sets the token rows' `session_id` to null without ending the desktop's grant.
 */
/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters (RFC 6749, RFC 7009, RFC 7636) and the provider's API names keep their spelling */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '@taucad/api-database/schema';
import { staticAuthConfig } from '#config/auth-static.config.js';
import { desktopClientId, desktopScopes } from '#config/desktop-oauth.js';
import { revokeDesktopSignIns } from '#desktop-sign-ins.js';
import { pruneDesktopRefreshTokens } from '#desktop-sign-in-retention.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const origin = 'http://127.0.0.1';
const password = 'correct horse battery staple';

describe('Tau Desktop OAuth sign-in on PostgreSQL', () => {
  const client = postgres(databaseUrl, { max: 2, onnotice: () => undefined });
  const database = drizzle(client, { schema });
  const auth = betterAuth({
    ...staticAuthConfig,
    baseURL: origin,
    database: drizzleAdapter(database, { provider: 'pg' }),
    secret: 'desktop-oauth-postgres-secret-32-characters',
    rateLimit: { enabled: false },
    emailAndPassword: { ...staticAuthConfig.emailAndPassword, requireEmailVerification: false },
    emailVerification: { ...staticAuthConfig.emailVerification, sendOnSignIn: false, sendOnSignUp: false },
  });
  const email = `desktop-oauth-${randomUUID()}@example.test`;
  let userId = '';
  let cookie = '';

  const call = async (
    path: string,
    init: { method?: string; cookie?: string; json?: unknown; form?: Record<string, string> } = {},
  ) => {
    const headers = new Headers();
    let body: string | undefined;
    if (init.form) {
      headers.set('content-type', 'application/x-www-form-urlencoded');
      body = new URLSearchParams(init.form).toString();
    } else if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    }
    if (init.cookie) {
      headers.set('cookie', init.cookie);
      headers.set('origin', origin);
    }
    return auth.handler(
      new Request(`${origin}/v1/auth${path}`, { method: init.method ?? 'GET', headers, body, redirect: 'manual' }),
    );
  };

  const cookieOf = (response: Response): string =>
    response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');

  const signInBrowser = async (): Promise<string> =>
    cookieOf(await call('/sign-in/email', { method: 'POST', json: { email, password } }));

  const signInDesktop = async (browserCookie: string) => {
    const verifier = randomBytes(32).toString('base64url');
    const redirect = `http://127.0.0.1:49152/cb/${randomBytes(24).toString('base64url')}`;
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: desktopClientId,
      scope: desktopScopes.join(' '),
      redirect_uri: redirect,
      state: 'state-1',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'consent',
    });
    const authorize = await call(`/oauth2/authorize?${query.toString()}`, { cookie: browserCookie });
    const consentUrl = new URL(authorize.headers.get('location') ?? '');
    const consent = await call('/oauth2/consent', {
      method: 'POST',
      cookie: browserCookie,
      json: { accept: true, oauth_query: consentUrl.search.slice(1) },
    });
    const back = new URL(((await consent.json()) as { url: string }).url);
    const token = await call('/oauth2/token', {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code: back.searchParams.get('code') ?? '',
        code_verifier: verifier,
        redirect_uri: redirect,
        client_id: desktopClientId,
      },
    });
    expect(token.status).toBe(200);
    return (await token.json()) as { access_token: string; refresh_token: string };
  };

  const stored = (token: string): string => createHash('sha256').update(token).digest('base64url');

  beforeAll(async () => {
    const signUp = await call('/sign-up/email', { method: 'POST', json: { email, password, name: 'Desktop OAuth' } });
    expect(signUp.status).toBe(200);
    userId = ((await signUp.json()) as { user: { id: string } }).user.id;
    cookie = await signInBrowser();
  });

  afterAll(async () => {
    await database.delete(schema.user).where(eq(schema.user.id, userId));
    await client.end();
  });

  it('should find the migration-seeded public client', async () => {
    const [row] = await database
      .select()
      .from(schema.oauthClient)
      .where(eq(schema.oauthClient.clientId, desktopClientId));

    expect(row).toMatchObject({
      tokenEndpointAuthMethod: 'none',
      requirePKCE: true,
      skipConsent: false,
      redirectUris: ['http://127.0.0.1/cb'],
      grantTypes: ['authorization_code', 'refresh_token'],
    });
  });

  it('should issue, store hashed, and rotate tokens through the Drizzle adapter', async () => {
    const tokens = await signInDesktop(cookie);
    const [access] = await database
      .select()
      .from(schema.oauthAccessToken)
      .where(eq(schema.oauthAccessToken.token, stored(tokens.access_token)));
    const [first] = await database
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.token, stored(tokens.refresh_token)));

    expect(access?.scopes).toEqual([...desktopScopes]);
    expect(first?.authorizationCodeId).toEqual(expect.any(String));

    const rotated = await call('/oauth2/token', {
      method: 'POST',
      form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: desktopClientId },
    });
    expect(rotated.status).toBe(200);
    const family = await database
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.authorizationCodeId, first?.authorizationCodeId ?? ''));
    expect(family).toHaveLength(2);
  });

  it("should null the token rows' browser session and keep the desktop's grant when that session is deleted", async () => {
    const browser = await signInBrowser();
    const tokens = await signInDesktop(browser);
    const [refreshRow] = await database
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.token, stored(tokens.refresh_token)));
    const sessionId = refreshRow?.sessionId ?? '';
    expect(sessionId).not.toBe('');

    await database.delete(schema.session).where(eq(schema.session.id, sessionId));

    const [after] = await database
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.id, refreshRow?.id ?? ''));
    expect(after?.sessionId).toBeNull();
    const refreshed = await call('/oauth2/token', {
      method: 'POST',
      form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: desktopClientId },
    });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { access_token: string };
    const [nextAccess] = await database
      .select()
      .from(schema.oauthAccessToken)
      .where(eq(schema.oauthAccessToken.token, stored(next.access_token)));
    expect(nextAccess?.sessionId).toBeNull();
  });

  it('should end every desktop sign-in of the account on a password change (revokeDesktopSignIns)', async () => {
    const tokens = await signInDesktop(cookie);

    await revokeDesktopSignIns(database, userId);

    const refreshed = await call('/oauth2/token', {
      method: 'POST',
      form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: desktopClientId },
    });
    const accessRows = await database
      .select({ id: schema.oauthAccessToken.id })
      .from(schema.oauthAccessToken)
      .where(eq(schema.oauthAccessToken.userId, userId));
    expect(refreshed.status).toBe(400);
    expect(accessRows).toEqual([]);
  });

  describe('pruning (DSI-10)', () => {
    const day = 24 * 60 * 60 * 1000;
    const refreshGrant = async (refreshToken: string) =>
      call('/oauth2/token', {
        method: 'POST',
        form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: desktopClientId },
      });
    /** The rotated refresh token a refresh grant answers. */
    const rotate = async (refreshToken: string): Promise<string> => {
      const response = await refreshGrant(refreshToken);
      const body = (await response.json()) as { refresh_token: string };
      return body.refresh_token;
    };
    const familyOf = async (refreshToken: string): Promise<string> => {
      const [row] = await database
        .select({ family: schema.oauthRefreshToken.authorizationCodeId })
        .from(schema.oauthRefreshToken)
        .where(eq(schema.oauthRefreshToken.token, stored(refreshToken)));
      return row?.family ?? '';
    };
    const familyRows = async (family: string) =>
      database
        .select()
        .from(schema.oauthRefreshToken)
        .where(eq(schema.oauthRefreshToken.authorizationCodeId, family))
        .orderBy(schema.oauthRefreshToken.createdAt);
    /** Moves one row's times by `days` (negative is into the past), as if it had been issued then. */
    const age = async (id: string, createdDaysAgo: number, expiresInDays: number) => {
      await database
        .update(schema.oauthRefreshToken)
        .set({
          createdAt: new Date(Date.now() - createdDaysAgo * day),
          expiresAt: new Date(Date.now() + expiresInDays * day),
        })
        .where(eq(schema.oauthRefreshToken.id, id));
    };

    it("should keep a live family's earliest row, so the 90-day cap still ends the sign-in on time", async () => {
      // Three rotations: the earliest row, two rotated rows and the live one.
      const first = await signInDesktop(cookie);
      const second = await rotate(first.refresh_token);
      const third = await rotate(second);
      const live = await rotate(third);
      const family = await familyOf(live);
      const [earliest, rotatedA, rotatedB, current] = await familyRows(family);
      // Signed in 85 days ago: the earliest and first rotated rows expired long since, the live row is fresh.
      await age(earliest!.id, 85, -55);
      await age(rotatedA!.id, 60, -30);
      await age(rotatedB!.id, 20, 10);
      await age(current!.id, 1, 29);

      const pruned = await pruneDesktopRefreshTokens(database, { now: new Date(), limit: 1000 });

      const remaining = await familyRows(family);
      const left = remaining.map((row) => row.id);
      expect(left).toEqual([earliest!.id, rotatedB!.id, current!.id]);
      expect(pruned.expiredRows).toBeGreaterThanOrEqual(1);
      // Six days on, the sign-in is 91 days old. Had the earliest row gone, the family would look 21 days old and
      // this refresh would be granted.
      await database
        .update(schema.oauthRefreshToken)
        .set({ createdAt: sql`${schema.oauthRefreshToken.createdAt} - interval '6 days'` })
        .where(inArray(schema.oauthRefreshToken.id, left));
      const refused = await refreshGrant(live);
      const refusal = (await refused.json()) as { error_description?: string };
      expect(refused.status).toBe(400);
      expect(refusal.error_description).toContain('sign-in ended');
    });

    it('should delete a family past the cap, or dead for a day, whole, and leave a live one alone', async () => {
      const capped = await signInDesktop(cookie);
      const cappedFamily = await familyOf(capped.refresh_token);
      const [cappedRow] = await familyRows(cappedFamily);
      await age(cappedRow!.id, 91, 5);

      const revoked = await signInDesktop(cookie);
      const revokedFamily = await familyOf(revoked.refresh_token);
      const [revokedRow] = await familyRows(revokedFamily);
      await database
        .update(schema.oauthRefreshToken)
        .set({ revoked: new Date(Date.now() - 2 * day) })
        .where(eq(schema.oauthRefreshToken.id, revokedRow!.id));
      await age(revokedRow!.id, 3, 27);

      const justRevoked = await signInDesktop(cookie);
      const justRevokedFamily = await familyOf(justRevoked.refresh_token);
      await database
        .update(schema.oauthRefreshToken)
        .set({ revoked: new Date() })
        .where(eq(schema.oauthRefreshToken.authorizationCodeId, justRevokedFamily));

      const healthy = await signInDesktop(cookie);
      const healthyFamily = await familyOf(healthy.refresh_token);

      const pruned = await pruneDesktopRefreshTokens(database, { now: new Date(), limit: 1000 });

      expect(await familyRows(cappedFamily)).toEqual([]);
      expect(await familyRows(revokedFamily)).toEqual([]);
      expect(pruned.deadFamilies).toBeGreaterThanOrEqual(2);
      // Revoked moments ago: a refresh may still be settling, so it waits a day.
      expect(await familyRows(justRevokedFamily)).toHaveLength(1);
      expect(await familyRows(healthyFamily)).toHaveLength(1);
      const stillLive = await refreshGrant(healthy.refresh_token);
      expect(stillLive.status).toBe(200);
    });
  });

  it('should delete every token row with the account', async () => {
    const other = `desktop-oauth-${randomUUID()}@example.test`;
    const signUp = await call('/sign-up/email', { method: 'POST', json: { email: other, password, name: 'Other' } });
    const otherId = ((await signUp.json()) as { user: { id: string } }).user.id;
    const otherCookie = cookieOf(await call('/sign-in/email', { method: 'POST', json: { email: other, password } }));
    await signInDesktop(otherCookie);

    await database.delete(schema.user).where(eq(schema.user.id, otherId));

    const left = await database
      .select({ id: schema.oauthRefreshToken.id })
      .from(schema.oauthRefreshToken)
      .where(inArray(schema.oauthRefreshToken.userId, [otherId]));
    expect(left).toEqual([]);
  });
});
