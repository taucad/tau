/* eslint-disable @typescript-eslint/naming-convention -- GitHub wire fixtures. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { ConfigService } from '@nestjs/config';
import type { BetterAuthService } from '#auth/better-auth.service.js';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { account, githubGistPreference } from '#database/schema.js';
import { GithubGistService } from '#api/github/github-gist.service.js';

const revision = 'a'.repeat(40);
const headers = new Headers({ cookie: 'session=test' });
const payload = { public: false, files: { 'tau-project.zip.base64url': { content: 'YXJjaGl2ZQ' } } };
const fixture = () => {
  const database = mockDeep<DatabaseService>();
  const auth = mockDeep<BetterAuthService>();
  const config = mock<ConfigService<Environment, true>>();
  config.get.mockReturnValue('client-id');
  database.database.query.account.findFirst.mockResolvedValue(
    mock<typeof account.$inferSelect>({
      id: 'linked',
      accountId: '42',
      userId: 'user',
      providerId: 'github',
      scope: 'gist',
    }),
  );
  database.database.query.githubGistPreference.findFirst.mockResolvedValue(undefined);
  auth.api.getAccessToken.mockResolvedValue({
    accessToken: 'server-only-token',
    scopes: ['gist'],
    accessTokenExpiresAt: undefined,
    idToken: undefined,
  });
  const state = {
    scopes: 'read:user, user:email, gist',
    identity: 42,
    status: 200,
    commits: [{ version: revision }],
    creation: {
      id: 'abc123',
      owner: { id: 42 },
      files: { 'tau-project.zip.base64url': { content: 'YXJjaGl2ZQ' } },
    },
    gist: {
      id: 'abc123',
      owner: { id: 42 },
      files: { 'tau-project.zip.base64url': { content: 'YXJjaGl2ZQ' } },
    },
  };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/user')) {
      return Response.json({ id: state.identity, login: 'person' }, { headers: { 'x-oauth-scopes': state.scopes } });
    }
    if (url.endsWith('/commits?per_page=1')) {
      return Response.json(state.commits);
    }
    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'POST') {
      return Response.json(state.creation, { status: 201 });
    }
    return Response.json(state.gist, { status: state.status });
  });
  vi.stubGlobal('fetch', fetch);
  return { database, auth, state, fetch, service: new GithubGistService(auth, database, config) };
};
afterEach(() => vi.unstubAllGlobals());

describe('server-side Gist authority', () => {
  it('should use verified provider scopes rather than stored scopes and never expose the token', async () => {
    const { service, state, auth } = fixture();
    state.scopes = 'read:user, user:email';
    const capability = await service.capability('user', headers);
    expect(capability).toMatchObject({
      status: 'permission-required',
      grantedScopes: ['read:user', 'user:email'],
      authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
    });
    expect(JSON.stringify(capability)).not.toContain('server-only-token');
    expect(auth.api.getAccessToken).toHaveBeenCalledWith({ headers, body: { accountId: 'linked' } });
  });
  it('should require reconnection when the provider identity differs', async () => {
    const { service, state } = fixture();
    state.identity = 99;
    expect(await service.capability('user', headers)).toMatchObject({ status: 'reconnect-required' });
  });
  it('should report no connection without obtaining a token', async () => {
    const { service, database, auth } = fixture();
    database.database.query.account.findFirst.mockResolvedValue(undefined);
    expect(await service.capability('user', headers)).toMatchObject({ status: 'not-connected' });
    expect(auth.api.getAccessToken).not.toHaveBeenCalled();
  });
  it('should reject a mutation without the live Gist grant', async () => {
    const { service, state, fetch } = fixture();
    state.scopes = 'read:user';
    await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
      response: { code: 'GITHUB_GIST_PERMISSION_REQUIRED' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('should stop Gist use without affecting or consulting GitHub', async () => {
    const { service, database, fetch } = fixture();
    database.database.query.githubGistPreference.findFirst.mockResolvedValue(
      mock<typeof githubGistPreference.$inferSelect>({ enabled: false }),
    );
    await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
      response: { code: 'GITHUB_GIST_USE_DISABLED' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('should read back a created Gist without history and return a pinned token-free locator', async () => {
    const { service, fetch } = fixture();
    expect(await service.mutate('user', headers, { action: 'create', payload })).toEqual({
      id: 'abc123',
      history: [{ version: revision }],
      html_url: 'https://gist.github.com/abc123',
    });
    expect(
      fetch.mock.calls.every(([, init]) => new Headers(init?.headers).get('x-github-api-version') === '2026-03-10'),
    ).toBe(true);
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api.github.com/gists');
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { authorization: 'Bearer server-only-token' },
    });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['https://api.github.com/user', 'GET'],
      ['https://api.github.com/gists', 'POST'],
      ['https://api.github.com/gists/abc123', 'GET'],
      ['https://api.github.com/gists/abc123/commits?per_page=1', 'GET'],
      [`https://api.github.com/gists/abc123/${revision}`, 'GET'],
    ]);
  });
  it.each(['update', 'delete'] as const)(
    'should verify the current commit before %s without embedded history',
    async (action) => {
      const { service, fetch } = fixture();
      await service.mutate('user', headers, { action, id: 'abc123', revision, payload: { files: payload.files } });
      expect(fetch.mock.calls.some(([url]) => url.endsWith(`/${revision}`))).toBe(true);
      expect(
        fetch.mock.calls.filter(([, init]) => init?.method === (action === 'update' ? 'PATCH' : 'DELETE')),
      ).toHaveLength(1);
    },
  );
  it.each([[], [{ version: 'invalid' }], {}])(
    'should reject invalid commit-list responses without repeating upload: %j',
    async (commits) => {
      const { service, state, fetch } = fixture();
      Object.assign(state, { commits });
      await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
        response: { code: 'GITHUB_GIST_RESPONSE_INVALID' },
      });
      expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    },
  );
  it('should compare the uploaded bytes with the pinned revision rather than the earlier unversioned read', async () => {
    const { service, state, fetch } = fixture();
    const defaultFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, init) =>
      url.endsWith(`/${revision}`)
        ? Response.json({ ...state.gist, files: { 'tau-project.zip.base64url': { content: 'concurrent-change' } } })
        : (defaultFetch?.(url, init) ?? Response.error()),
    );
    await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
      response: { code: 'GITHUB_GIST_CHANGED' },
    });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it.each([{ id: 'def456' }, { owner: { id: 99 } }, { files: { 'unrelated.txt': { content: 'private' } } }])(
    'should validate ownership and canonical files again at the pinned revision: %j',
    async (invalid) => {
      const { service, state, fetch } = fixture();
      const defaultFetch = fetch.getMockImplementation();
      fetch.mockImplementation(async (url, init) =>
        url.endsWith(`/${revision}`)
          ? Response.json({ ...state.gist, ...invalid })
          : (defaultFetch?.(url, init) ?? Response.error()),
      );
      await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
        response: { code: 'GITHUB_GIST_NOT_OWNED_PUBLICATION' },
      });
      expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    },
  );
  it('should reject a foreign create acknowledgement before reading it back', async () => {
    const { service, state, fetch } = fixture();
    state.creation.owner.id = 99;
    await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
      name: 'BadGatewayException',
      response: { code: 'GITHUB_GIST_RESPONSE_INVALID' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    { 'tau-project.zip.base64url': { content: 'stale' } },
    { 'tau-project.zip.base64url': { content: 'YXJjaGl2ZQ', truncated: true } },
    { 'tau-project.jwe': { content: 'YXJjaGl2ZQ' } },
  ])('should refuse to pin a different or truncated artifact after upload: %j', async (files) => {
    const { service, state, fetch } = fixture();
    Object.assign(state.gist, { files });
    await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
      name: 'ConflictException',
      response: { code: 'GITHUB_GIST_CHANGED' },
    });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it.each([{ id: 'def456' }, { owner: { id: 99 } }, { files: { 'unrelated.txt': { content: 'private' } } }])(
    'should reject an invalid created Gist read-back without repeating the upload: %j',
    async (invalid) => {
      const { service, state, fetch } = fixture();
      Object.assign(state.gist, invalid);
      await expect(service.mutate('user', headers, { action: 'create', payload })).rejects.toMatchObject({
        name: 'ForbiddenException',
        response: { code: 'GITHUB_GIST_NOT_OWNED_PUBLICATION' },
      });
      expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    },
  );
  it.each([
    { public: false, files: { 'other.txt': { content: 'data' } } },
    { public: false, files: { 'tau-project.zip.base64url': { content: 'x'.repeat(921_601) } } },
    { public: false, files: { 'tau-project.zip.base64url': { content: 'x' }, 'tau-project.jwe': { content: 'x' } } },
    { public: false, files: {}, description: 'extra' },
  ])('should reject invalid artifact payloads before obtaining credentials', async (invalid) => {
    const { service, fetch } = fixture();
    await expect(service.mutate('user', headers, { action: 'create', payload: invalid })).rejects.toMatchObject({
      response: { code: 'GITHUB_GIST_PAYLOAD_INVALID' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['update', 'delete'] as const)('should refuse %s of another account’s publication', async (action) => {
    const { service, state, fetch } = fixture();
    state.gist.owner.id = 99;
    await expect(
      service.mutate('user', headers, { action, id: 'abc123', revision, payload: { files: payload.files } }),
    ).rejects.toMatchObject({
      response: { code: 'GITHUB_GIST_NOT_OWNED_PUBLICATION' },
    });
    expect(fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });
  it('should refuse ordinary Gists and stale publication revisions', async () => {
    const { service, state } = fixture();
    await expect(
      service.mutate('user', headers, { action: 'delete', id: 'abc123', revision: 'b'.repeat(40) }),
    ).rejects.toMatchObject({ response: { code: 'GITHUB_GIST_CHANGED' } });
    Object.assign(state.gist, { files: { 'main.ts': { content: 'source' } } });
    await expect(service.mutate('user', headers, { action: 'delete', id: 'abc123', revision })).rejects.toMatchObject({
      response: { code: 'GITHUB_GIST_NOT_OWNED_PUBLICATION' },
    });
  });
  it('should remove the previous canonical filename when encryption changes', async () => {
    const { service, state, fetch } = fixture();
    const defaultFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, init) => {
      if (init?.method === 'PATCH') {
        Object.assign(state.gist, { files: { 'tau-project.jwe': { content: 'encrypted' } } });
      }
      return defaultFetch?.(url, init) ?? Response.error();
    });
    await service.mutate('user', headers, {
      action: 'update',
      id: 'abc123',
      revision,
      payload: { files: { 'tau-project.jwe': { content: 'encrypted' } } },
    });
    expect(fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({
        files: { 'tau-project.jwe': { content: 'encrypted' }, 'tau-project.zip.base64url': null },
      }),
    });
  });
});
