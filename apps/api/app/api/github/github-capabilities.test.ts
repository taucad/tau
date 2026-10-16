/* eslint-disable @typescript-eslint/naming-convention -- GitHub wire fixtures. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import type { githubConnection, githubRepositoryWrite } from '#database/schema.js';
import { GithubService } from '#api/github/github.service.js';

const repository = {
  id: 9,
  name: 'model',
  full_name: 'studio/model',
  private: true,
  visibility: 'private',
  archived: false,
  disabled: false,
  description: null,
  default_branch: 'main',
  html_url: 'https://github.com/studio/model',
  clone_url: 'https://github.com/studio/model.git',
  owner: { id: 7, login: 'studio', avatar_url: null, type: 'Organization' },
  permissions: { pull: true, push: true },
};
const installation = {
  id: 12,
  account: repository.owner,
  repository_selection: 'selected',
  suspended_at: null,
  permissions: { contents: 'write', metadata: 'read' },
};
const fixture = () => {
  const database = mockDeep<DatabaseService>();
  const config = mock<ConfigService<Environment, true>>();
  const environment: Partial<Environment> = {
    GITHUB_REPOSITORY_APP_CLIENT_ID: 'app-id',
    GITHUB_REPOSITORY_APP_CLIENT_SECRET: 'secret',
    GITHUB_REPOSITORY_APP_SLUG: 'test',
    GITHUB_REPOSITORY_APP_CALLBACK_URL: 'https://api.tau.test/v1/github/callback',
    GITHUB_REPOSITORY_CONNECTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    GITHUB_REPOSITORY_CONNECTION_KEY_VERSION: 1,
    TAU_FRONTEND_URL: 'https://tau.test',
  };
  config.get.mockImplementation((key: keyof Environment) => environment[key]);
  const row = mock<typeof githubConnection.$inferSelect>({
    id: 'connection',
    userId: 'user',
    githubSubject: 42,
    authorizationVersion: 1,
    generation: 2,
  });
  database.database.query.githubConnection.findFirst.mockResolvedValue(row);
  database.database.query.githubRepositoryWrite.findFirst.mockResolvedValue(undefined);
  const deletion = mockDeep<ReturnType<DatabaseService['database']['delete']>>();
  database.database.delete.mockReturnValue(deletion);
  const service = new GithubService(config, database, mockDeep<RedisService>());
  vi.spyOn(service, 'token').mockResolvedValue({
    accessToken: 'root-token',
    generation: 2,
    expiresAt: new Date(Date.now() + 28_800_000).toISOString(),
  });
  const scoped = {
    token: 'read-token',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    app: { client_id: 'app-id' },
    user: { id: 42 },
    // GitHub's scoped authorization response is not an installation resource: it omits id.
    installation: {
      account: { id: 7 },
      repository_selection: 'selected',
      permissions: { contents: 'read', metadata: 'read' },
    },
  };
  const scopedRequests: unknown[] = [];
  const provider = {
    repository: structuredClone(repository),
    installation: structuredClone(installation),
    repositories: [repository],
    scoped,
  };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/token/scoped')) {
      scopedRequests.push(JSON.parse(typeof init?.body === 'string' ? init.body : '') as unknown);
      return Response.json(provider.scoped);
    }
    if (url.endsWith('/repositories/9')) {
      return Response.json(provider.repository);
    }
    if (url.includes('/user/installations?')) {
      return Response.json({ total_count: 1, installations: [provider.installation] });
    }
    if (/\/installations\/\d+\/repositories\?/u.test(url)) {
      return Response.json({ total_count: provider.repositories.length, repositories: provider.repositories });
    }
    throw new Error('Unexpected provider route');
  });
  vi.stubGlobal('fetch', fetch);
  const allow = () =>
    database.database.query.githubRepositoryWrite.findFirst.mockResolvedValue(
      mock<typeof githubRepositoryWrite.$inferSelect>({
        connectionId: 'connection',
        repositoryId: 9,
        ownerId: 7,
        installationId: 12,
        authorizationVersion: 1,
      }),
    );
  return { service, database, provider, scopedRequests, fetch, allow, row };
};
afterEach(() => vi.unstubAllGlobals());

describe('GitHub repository capabilities', () => {
  it('should issue exactly one repository read credential while writes default off', async () => {
    const { service, scopedRequests } = fixture();
    expect(await service.repositoryAccess('user', 'connection', 9)).toMatchObject({
      canRead: true,
      canWrite: true,
      writeEnabled: false,
    });
    const result = await service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'read' });
    expect(result.accessToken).toBe('read-token');
    expect(scopedRequests).toEqual([
      {
        access_token: 'root-token',
        target_id: 7,
        repository_ids: [9],
        permissions: { contents: 'read', metadata: 'read' },
      },
    ]);
  });
  it('should accept a matching installation ID when the provider includes it', async () => {
    const { service, provider } = fixture();
    Object.assign(provider.scoped.installation, { id: 12 });
    await expect(
      service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'read' }),
    ).resolves.toMatchObject({ accessToken: 'read-token' });
  });
  it('should reject a different installation ID when the provider includes it', async () => {
    const { service, provider } = fixture();
    Object.assign(provider.scoped.installation, { id: 99 });
    await expect(
      service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'read' }),
    ).rejects.toMatchObject({ response: { code: 'GITHUB_SCOPED_TOKEN_INVALID' } });
  });
  it('should refuse write credential requests before calling the scope endpoint', async () => {
    const { service, scopedRequests } = fixture();
    await expect(
      service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'write' }),
    ).rejects.toMatchObject({ response: { code: 'GITHUB_REPOSITORY_WRITE_DISABLED' } });
    expect(scopedRequests).toEqual([]);
  });
  it('should issue a write credential only for an enabled repository', async () => {
    const { service, provider, scopedRequests, allow } = fixture();
    allow();
    provider.scoped.installation.permissions.contents = 'write';
    provider.scoped.token = 'write-token';
    const lease = await service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'write' });
    expect(lease.accessToken).toBe('write-token');
    expect(scopedRequests).toEqual([
      {
        access_token: 'root-token',
        target_id: 7,
        repository_ids: [9],
        permissions: { contents: 'write', metadata: 'read' },
      },
    ]);
  });
  it.each(['removed', 'suspended', 'read-only', 'archived', 'transferred', 'reauthorized', 'reinstalled'])(
    'should refuse writes after access becomes %s',
    async (state) => {
      const { service, provider, scopedRequests, allow, row } = fixture();
      allow();
      if (state === 'removed') {
        provider.repositories = [];
      }
      if (state === 'suspended') {
        Object.assign(provider.installation, { suspended_at: new Date().toISOString() });
      }
      if (state === 'read-only') {
        provider.installation.permissions.contents = 'read';
      }
      if (state === 'archived') {
        provider.repository.archived = true;
      }
      if (state === 'transferred') {
        provider.repository.owner.id = 99;
      }
      if (state === 'reinstalled') {
        provider.installation.id = 13;
      }
      if (state === 'reauthorized') {
        row.authorizationVersion = 2;
      }
      await expect(
        service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'write' }),
      ).rejects.toThrow();
      expect(scopedRequests).toEqual([]);
    },
  );
  it.each(['broader-permission', 'different-owner', 'different-user', 'different-app', 'root-token', 'expired'])(
    'should fail closed for a %s scope response',
    async (state) => {
      const { service, provider } = fixture();
      if (state === 'broader-permission') {
        provider.scoped.installation.permissions.contents = 'write';
      }
      if (state === 'different-owner') {
        provider.scoped.installation.account.id = 99;
      }
      if (state === 'different-user') {
        provider.scoped.user.id = 99;
      }
      if (state === 'different-app') {
        provider.scoped.app.client_id = 'other';
      }
      if (state === 'root-token') {
        provider.scoped.token = 'root-token';
      }
      if (state === 'expired') {
        provider.scoped.expires_at = new Date(0).toISOString();
      }
      await expect(
        service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'read' }),
      ).rejects.toMatchObject({ response: { code: 'GITHUB_SCOPED_TOKEN_INVALID' } });
    },
  );
  it('should refuse a write token if writes are disabled during issuance', async () => {
    const { service, provider, database, allow, scopedRequests } = fixture();
    allow();
    provider.scoped.installation.permissions.contents = 'write';
    database.database.query.githubRepositoryWrite.findFirst
      .mockResolvedValueOnce(
        mock<typeof githubRepositoryWrite.$inferSelect>({
          connectionId: 'connection',
          repositoryId: 9,
          ownerId: 7,
          installationId: 12,
          authorizationVersion: 1,
        }),
      )
      .mockResolvedValue(undefined);
    await expect(
      service.repositoryToken('user', 'connection', { repositoryId: 9, operation: 'write' }),
    ).rejects.toMatchObject({ response: { code: 'GITHUB_REPOSITORY_WRITE_DISABLED' } });
    expect(scopedRequests).toHaveLength(1);
  });
  it('should not obtain any credential when disabling writes', async () => {
    const { service, database, fetch } = fixture();
    const deletion = mockDeep<ReturnType<DatabaseService['database']['delete']>>();
    database.database.delete.mockReturnValue(deletion);
    await expect(
      service.setRepositoryWrite('user', 'connection', { repositoryId: 9, enabled: false }),
    ).resolves.toEqual({ writeEnabled: false });
    expect(deletion.where).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('should save approval without minting an operation token', async () => {
    const { service, database, scopedRequests } = fixture();
    const insertion = mockDeep<ReturnType<DatabaseService['database']['insert']>>();
    database.database.insert.mockReturnValue(insertion);
    const values = mockDeep<ReturnType<typeof insertion.values>>();
    insertion.values.mockReturnValue(values);
    await expect(service.setRepositoryWrite('user', 'connection', { repositoryId: 9, enabled: true })).resolves.toEqual(
      { writeEnabled: true },
    );
    expect(insertion.values).toHaveBeenCalledWith({
      connectionId: 'connection',
      repositoryId: 9,
      ownerId: 7,
      installationId: 12,
      authorizationVersion: 1,
    });
    expect(scopedRequests).toEqual([]);
  });
  it('should invalidate an approval after observed removal instead of restoring it on re-add', async () => {
    const { service, database, provider, allow } = fixture();
    allow();
    const deletion = mockDeep<ReturnType<DatabaseService['database']['delete']>>();
    database.database.delete.mockReturnValue(deletion);
    deletion.where.mockImplementation(() => {
      database.database.query.githubRepositoryWrite.findFirst.mockResolvedValue(undefined);
      return mockDeep<ReturnType<typeof deletion.where>>();
    });
    provider.repositories = [];
    expect(await service.repositoryAccess('user', 'connection', 9)).toMatchObject({ writeEnabled: false });
    expect(deletion.where).toHaveBeenCalledOnce();
    provider.repositories = [repository];
    expect(await service.repositoryAccess('user', 'connection', 9)).toMatchObject({
      canWrite: true,
      writeEnabled: false,
    });
  });
});
