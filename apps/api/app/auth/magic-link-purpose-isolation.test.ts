import { describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import type { GithubProfile } from 'better-auth/social-providers';
import { mock } from 'vitest-mock-extended';
import { apiKey } from '@better-auth/api-key';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { bearer, magicLink } from 'better-auth/plugins';
import { staticAuthConfig } from '#config/auth.js';

const baseURL = 'http://localhost:3333';
const email = 'purpose-isolation@example.test';

const createHarness = () => {
  const store = { user: [], session: [], account: [], verification: [], apikey: [] };
  let deliveredToken = '';
  const getGithubUserInfo = vi.fn(async () => ({
    user: { name: 'Offline GitHub user', email, emailVerified: true },
    data: mock<GithubProfile>({ id: 'github-provider-subject', email }),
  }));
  const auth = betterAuth({
    ...staticAuthConfig,
    baseURL,
    secret: 'offline-purpose-isolation-secret-at-least-32-characters',
    database: memoryAdapter(store),
    account: { ...staticAuthConfig.account, storeStateStrategy: 'database' },
    socialProviders: {
      google: { clientId: 'offline-client', clientSecret: 'offline-secret' },
      github: { clientId: 'offline-github', clientSecret: 'offline-secret', getUserInfo: getGithubUserInfo },
    },
    plugins: [
      // Match the runtime API-key name requirement and Tau secret-key format.
      apiKey({ requireName: true, customKeyGenerator: () => generatePrefixedId(idPrefix.secretKey) }),
      magicLink({
        storeToken: 'plain',
        sendMagicLink({ token }) {
          deliveredToken = token;
        },
      }),
      bearer(),
    ],
    rateLimit: { enabled: false },
  });
  const request = async (path: string, body?: Record<string, unknown>) =>
    auth.handler(
      new Request(`${baseURL}/v1/auth/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', origin: baseURL },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  return { auth, request, store, getGithubUserInfo, deliveredToken: () => deliveredToken };
};

describe('Magic Link verification purpose isolation', () => {
  it.each([false, true])(
    'should reject OAuth state as a magic link when the mailbox already exists: %s',
    async (existingUser) => {
      const harness = createHarness();
      if (existingUser) {
        const { internalAdapter } = await harness.auth.$context;
        await internalAdapter.createUser({ name: 'Mailbox owner', email, emailVerified: true }, { method: 'admin' });
      }
      const usersBefore = structuredClone(harness.store.user);
      const authorization = await harness.request('sign-in/social', {
        provider: 'google',
        callbackURL: baseURL,
        disableRedirect: true,
        additionalData: { email, name: 'Mailbox owner' },
      });
      expect(authorization.status).toBe(200);
      const payload: unknown = await authorization.json();
      if (!payload || typeof payload !== 'object' || !('url' in payload) || typeof payload.url !== 'string') {
        throw new Error('OAuth initiation did not return an authorization URL');
      }
      const state = new URL(payload.url).searchParams.get('state');
      expect(state).toBeTruthy();
      const rejected = await harness.request(`magic-link/verify?token=${encodeURIComponent(state ?? '')}`);
      expect(rejected.headers.get('location')).toContain('error=INVALID_TOKEN');
      expect(rejected.headers.get('set-cookie')).toBeNull();
      expect(harness.store.user).toEqual(usersBefore);
      expect(harness.store.session).toHaveLength(0);
    },
  );

  it('should accept a delivered magic link once and reject replay', async () => {
    const harness = createHarness();
    const sent = await harness.request('sign-in/magic-link', { email, name: 'Mailbox owner' });
    expect(sent.status).toBe(200);
    const token = harness.deliveredToken();
    expect(token).not.toBe('');
    const path = `magic-link/verify?token=${encodeURIComponent(token)}`;
    const accepted = await harness.request(path);
    expect(accepted.headers.get('set-cookie')).toContain('session_token');
    expect(harness.store.user).toHaveLength(1);
    expect(harness.store.session).toHaveLength(1);
    const replay = await harness.request(path);
    expect(replay.headers.get('location')).toContain('error=INVALID_TOKEN');
    expect(harness.store.session).toHaveLength(1);
  });
});

describe('Linked account row ownership', () => {
  it('should reject another user account row for token retrieval and unlinking', async () => {
    const { auth } = createHarness();
    const { internalAdapter } = await auth.$context;
    const owner = await internalAdapter.createUser({ name: 'Owner', email, emailVerified: true }, { method: 'admin' });
    const other = await internalAdapter.createUser(
      {
        name: 'Other mailbox owner',
        email: 'other-purpose@example.test',
        emailVerified: true,
      },
      { method: 'admin' },
    );
    const ownAccount = await internalAdapter.linkAccount({
      userId: owner.id,
      providerId: 'google',
      accountId: 'same-provider-subject',
    });
    const otherAccount = await internalAdapter.linkAccount({
      userId: other.id,
      providerId: 'github',
      accountId: 'same-provider-subject',
      accessToken: 'never-return-this-token',
    });
    // Keep a second owned account so the last-account guard does not hide ownership checks.
    await internalAdapter.linkAccount({ userId: owner.id, providerId: 'credential', accountId: owner.id });
    const session = await internalAdapter.createSession(owner.id);
    const headers = {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
      origin: baseURL,
    };
    await Promise.all(
      ['get-access-token', 'unlink-account'].map(async (path) => {
        const response = await auth.handler(
          new Request(`${baseURL}/v1/auth/${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ accountId: otherAccount.id }),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
      }),
    );
    expect(await internalAdapter.findAccounts(other.id)).toHaveLength(1);
    const unlinked = await auth.handler(
      new Request(`${baseURL}/v1/auth/unlink-account`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ accountId: ownAccount.id }),
      }),
    );
    expect(unlinked.status).toBe(200);
    expect(await internalAdapter.findAccounts(owner.id)).toHaveLength(1);
    expect(await internalAdapter.findAccounts(other.id)).toHaveLength(1);
  });
});

describe('Cached client account selectors against the upgraded server', () => {
  it('should reject legacy selectors without changing accounts and accept refreshed row-ID requests', async () => {
    const { auth, getGithubUserInfo } = createHarness();
    const { internalAdapter } = await auth.$context;
    const owner = await internalAdapter.createUser({ name: 'Owner', email, emailVerified: true }, { method: 'admin' });
    const account = await internalAdapter.linkAccount({
      userId: owner.id,
      providerId: 'github',
      accountId: 'github-provider-subject',
      accessToken: 'offline-gist-token',
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      scope: 'gist',
    });
    await internalAdapter.linkAccount({ userId: owner.id, providerId: 'credential', accountId: owner.id });
    const session = await internalAdapter.createSession(owner.id);
    const request = async (path: string, body?: Record<string, unknown>) =>
      auth.handler(
        new Request(`${baseURL}/v1/auth/${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', origin: baseURL },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    const before = await internalAdapter.findAccounts(owner.id);
    // These are the pre-upgrade UI request shapes, also retained in cached tabs and desktop bundles.
    const oldInfo = await request(`account-info?accountId=${account.accountId}`);
    expect(oldInfo.status).toBe(400);
    expect(await oldInfo.json()).toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
    const oldUnlink = await request('unlink-account', { providerId: 'github' });
    expect(oldUnlink.status).toBe(400);
    const oldGist = await request('get-access-token', { providerId: 'github', accountId: account.accountId });
    expect(oldGist.status).toBe(400);
    expect(await internalAdapter.findAccounts(owner.id)).toEqual(before);
    expect(getGithubUserInfo).not.toHaveBeenCalled();
    const currentInfo = await request(`account-info?accountId=${account.id}`);
    expect(currentInfo.status).toBe(200);
    expect(await currentInfo.json()).toMatchObject({ account: { id: account.id, providerId: 'github' } });
    expect(getGithubUserInfo).toHaveBeenCalledOnce();
    const currentGist = await request('get-access-token', { accountId: account.id });
    expect(currentGist.status).toBe(200);
    expect(await currentGist.json()).toMatchObject({ accessToken: 'offline-gist-token' });
    const currentUnlink = await request('unlink-account', { accountId: account.id });
    expect(currentUnlink.status).toBe(200);
    const remainingAccounts = await internalAdapter.findAccounts(owner.id);
    expect(remainingAccounts.map(({ providerId }) => providerId)).toEqual(['credential']);
  });
});

describe('API-key lifecycle with Tau options', () => {
  it('should issue a named key, verify it, and reject it after authenticated revocation', async () => {
    const { auth } = createHarness();
    const { internalAdapter } = await auth.$context;
    const user = await internalAdapter.createUser(
      { name: 'Key owner', email, emailVerified: true },
      { method: 'admin' },
    );
    const session = await internalAdapter.createSession(user.id);
    const post = async (path: string, body: Record<string, unknown>, authenticated = true) =>
      auth.handler(
        new Request(`${baseURL}/v1/auth/api-key/${path}`, {
          method: 'POST',
          headers: {
            ...(authenticated ? { authorization: `Bearer ${session.token}` } : {}),
            'content-type': 'application/json',
            origin: baseURL,
          },
          body: JSON.stringify(body),
        }),
      );
    const unauthenticatedIssue = await post('create', { name: 'Offline key' }, false);
    expect(unauthenticatedIssue.status).toBe(401);
    const unnamedIssue = await post('create', {});
    expect(unnamedIssue.status).toBe(400);
    const issued = await post('create', { name: 'Offline key' });
    expect(issued.status).toBe(200);
    const payload: unknown = await issued.json();
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('key' in payload) ||
      typeof payload.key !== 'string' ||
      !('id' in payload) ||
      typeof payload.id !== 'string'
    ) {
      throw new Error('API-key issuance did not return a key and ID');
    }
    expect(payload.key.startsWith(idPrefix.secretKey)).toBe(true);
    const verified = await auth.api.verifyApiKey({ body: { key: payload.key } });
    expect(verified.valid).toBe(true);
    expect(verified.key?.id).toBe(payload.id);
    expect(verified.key?.referenceId).toBe(user.id);
    const invalid = await auth.api.verifyApiKey({ body: { key: 'invalid-offline-key' } });
    expect(invalid.valid).toBe(false);
    const unauthenticatedDelete = await post('delete', { keyId: payload.id }, false);
    expect(unauthenticatedDelete.status).toBe(401);
    const deleted = await post('delete', { keyId: payload.id });
    expect(deleted.status).toBe(200);
    const revoked = await auth.api.verifyApiKey({ body: { key: payload.key } });
    expect(revoked.valid).toBe(false);
  });
});
