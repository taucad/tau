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
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '@taucad/api-database/schema';
import { staticAuthConfig } from '#config/auth-static.config.js';
import { desktopClientId, desktopScopes } from '#config/desktop-oauth.js';
import { revokeDesktopSignIns } from '#desktop-sign-ins.js';

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
