/* eslint-disable @typescript-eslint/naming-convention -- GitHub OAuth and REST wire fields retain provider names. */
/* eslint-disable @typescript-eslint/member-ordering -- OAuth lifecycle helpers stay beside the flow they protect. */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- identity and catalog coordinates remain explicit security inputs. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Environment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
import { githubConnection } from '#database/schema.js';
import { RedisService } from '#redis/redis.service.js';

const apiVersion = '2026-03-10';
const startTtlSeconds = 600;
const completionTtlSeconds = 300;
const refreshSkewMilliseconds = 60_000;
const refreshLockMilliseconds = 10_000;
const refreshWaitMilliseconds = 100;
const refreshWaitAttempts = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const oauthValuePattern = /^[A-Za-z0-9._~-]{20,1024}$/u;
const releaseLockLua = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const consumeValueLua = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`;
const storePendingLua = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
`;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});
const githubId = z.number().int().positive();
const userSchema = z.object({ id: githubId, login: z.string().min(1), avatar_url: z.url().nullable() });
const installationSchema = z.object({
  id: githubId,
  account: z.object({ id: githubId, login: z.string(), avatar_url: z.url().nullable(), type: z.string() }),
  repository_selection: z.enum(['all', 'selected']),
  suspended_at: z.string().nullable(),
  permissions: z.record(z.string(), z.string()),
});
const repositorySchema = z.object({
  id: githubId,
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  visibility: z.enum(['public', 'private', 'internal']),
  archived: z.boolean(),
  disabled: z.boolean(),
  description: z.string().nullable(),
  default_branch: z.string(),
  html_url: z.url(),
  clone_url: z.url(),
  owner: z.object({ id: githubId, login: z.string(), avatar_url: z.url().nullable(), type: z.string() }),
  permissions: z.object({ pull: z.boolean(), push: z.boolean(), admin: z.boolean().optional() }).optional(),
});
const branchSchema = z.object({ name: z.string(), commit: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/u) }) });
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string().min(1),
      mode: z.string(),
      type: z.enum(['blob', 'tree', 'commit']),
      sha: z.string().regex(/^[0-9a-f]{40}$/u),
      size: z.number().int().nonnegative().optional(),
    }),
  ),
});
const blobSchema = z.object({
  encoding: z.literal('base64'),
  content: z.string(),
  size: z.number().int().nonnegative(),
});

type StartRecord = Readonly<{
  userId: string;
  sessionId: string;
  verifier: string;
  attemptId: string;
  returnTo: string;
  completionMode: 'browser' | 'desktop-poll';
}>;
type PendingRecord = StartRecord &
  Readonly<{
    githubSubject: number;
    login: string;
    avatarUrl?: string;
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt?: string;
  }>;

type ConnectionRow = typeof githubConnection.$inferSelect;

const startKey = (state: string): string => `github:connection:start:${state}`;
const pendingKey = (attemptId: string): string => `github:connection:pending:${attemptId}`;
const attemptKey = (attemptId: string): string => `github:connection:attempt:${attemptId}`;
const cancelledKey = (attemptId: string): string => `github:connection:cancelled:${attemptId}`;
const completionLockKey = (attemptId: string): string => `github:connection:complete:${attemptId}`;
const refreshKey = (connectionId: string): string => `github:connection:refresh:${connectionId}`;
const completionModes: ReadonlySet<string> = new Set(['browser', 'desktop-poll']);
const base64url = (value: Uint8Array<ArrayBuffer>): string => Buffer.from(value).toString('base64url');
const oauthChallenge = (verifier: string): string =>
  base64url(Uint8Array.from(createHash('sha256').update(verifier).digest()));
const reconnectRequired = (): UnauthorizedException =>
  new UnauthorizedException({ code: 'GITHUB_RECONNECT_REQUIRED', message: 'Reconnect GitHub to continue.' });

@Injectable()
export class GithubService {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly callbackUrl: string | undefined;
  private readonly frontendUrl: string;
  private readonly appSlug: string | undefined;
  private readonly keyVersion: number;
  private readonly encryptionKey: Uint8Array<ArrayBuffer> | undefined;
  private readonly responseCache = new Map<string, Readonly<{ etag: string; body: unknown }>>();

  public constructor(
    config: ConfigService<Environment, true>,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {
    this.clientId = config.get('GITHUB_REPOSITORY_APP_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('GITHUB_REPOSITORY_APP_CLIENT_SECRET', { infer: true });
    this.callbackUrl = config.get('GITHUB_REPOSITORY_APP_CALLBACK_URL', { infer: true });
    this.frontendUrl = config.get('TAU_FRONTEND_URL', { infer: true });
    this.appSlug = config.get('GITHUB_REPOSITORY_APP_SLUG', { infer: true });
    this.keyVersion = config.get('GITHUB_REPOSITORY_CONNECTION_KEY_VERSION', { infer: true });
    const encodedKey = config.get('GITHUB_REPOSITORY_CONNECTION_KEY', { infer: true });
    if (encodedKey !== undefined) {
      const key = Buffer.from(encodedKey, 'base64url');
      if (key.byteLength !== 32) {
        throw new Error('GITHUB_REPOSITORY_CONNECTION_KEY must encode exactly 32 bytes.');
      }
      this.encryptionKey = Uint8Array.from(key);
    }
  }

  private requireConfiguration(): Readonly<{
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    appSlug: string;
  }> {
    if (!this.clientId || !this.clientSecret || !this.callbackUrl || !this.appSlug || !this.encryptionKey) {
      throw new ServiceUnavailableException({
        code: 'GITHUB_CONNECTION_UNAVAILABLE',
        message: 'GitHub connection is not configured.',
      });
    }
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      callbackUrl: this.callbackUrl,
      appSlug: this.appSlug,
    };
  }

  private tokenResponse(value: unknown): z.infer<typeof tokenSchema> {
    const parsed = tokenSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadGatewayException({
        code: 'GITHUB_EXPIRING_TOKENS_REQUIRED',
        message: 'The GitHub App must have expiring user access tokens enabled.',
      });
    }
    return parsed.data;
  }

  private seal(value: unknown, userId: string, purpose: string): string {
    const key = this.encryptionKey;
    if (key === undefined) {
      this.requireConfiguration();
      throw new ServiceUnavailableException({ code: 'GITHUB_CONNECTION_UNAVAILABLE' });
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`github:${userId}:${purpose}:${String(this.keyVersion)}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [
      String(this.keyVersion),
      base64url(Uint8Array.from(nonce)),
      base64url(Uint8Array.from(cipher.getAuthTag())),
      base64url(Uint8Array.from(ciphertext)),
    ].join('.');
  }

  private open<T>(sealed: string, userId: string, purpose: string): T {
    const key = this.encryptionKey;
    if (key === undefined) {
      this.requireConfiguration();
      throw new ServiceUnavailableException({ code: 'GITHUB_CONNECTION_UNAVAILABLE' });
    }
    const [version, nonce, tag, ciphertext] = sealed.split('.');
    if (version !== String(this.keyVersion) || !nonce || !tag || !ciphertext) {
      throw reconnectRequired();
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
      decipher.setAAD(Buffer.from(`github:${userId}:${purpose}:${version}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8'),
      ) as T;
    } catch {
      throw reconnectRequired();
    }
  }

  public async start(
    userId: string,
    sessionId: string,
    returnTo = '/import',
    completionMode: 'browser' | 'desktop-poll' = 'browser',
  ): Promise<{ attemptId: string; authorizationUrl: string }> {
    const configuration = this.requireConfiguration();
    if (!completionModes.has(completionMode)) {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_MODE_INVALID' });
    }
    if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.length > 2048) {
      throw new BadRequestException({ code: 'RETURN_LOCATION_INVALID' });
    }
    const state = base64url(Uint8Array.from(randomBytes(32)));
    const verifier = base64url(Uint8Array.from(randomBytes(48)));
    const attemptId = randomUUID();
    const record: StartRecord = { userId, sessionId, verifier, attemptId, returnTo, completionMode };
    const stored = await this.redisService.client.set(
      startKey(state),
      JSON.stringify(record),
      'EX',
      startTtlSeconds,
      'NX',
    );
    if (stored !== 'OK') {
      throw new ServiceUnavailableException({ code: 'GITHUB_START_COLLISION' });
    }
    await this.redisService.client.set(
      attemptKey(attemptId),
      JSON.stringify({ userId, sessionId, attemptId, state }),
      'EX',
      startTtlSeconds,
    );
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: configuration.clientId,
      redirect_uri: configuration.callbackUrl,
      state,
      code_challenge: oauthChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { attemptId, authorizationUrl: url.toString() };
  }

  public async callback(
    state: string,
    code: string,
  ): Promise<{ attemptId: string; returnTo: string; completionMode: 'browser' | 'desktop-poll' }> {
    const configuration = this.requireConfiguration();
    if (!oauthValuePattern.test(state) || !oauthValuePattern.test(code)) {
      throw new BadRequestException({ code: 'GITHUB_CALLBACK_INVALID' });
    }
    const raw = await this.redisService.client.getdel(startKey(state));
    if (raw === null) {
      throw new BadRequestException({ code: 'GITHUB_CALLBACK_EXPIRED' });
    }
    const start = JSON.parse(raw) as StartRecord;
    const token = this.tokenResponse(
      await this.githubJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          code,
          redirect_uri: configuration.callbackUrl,
          code_verifier: start.verifier,
        }),
      }),
    );
    const profile = userSchema.parse(await this.apiJson('/user', token.access_token));
    const now = Date.now();
    const pending: PendingRecord = {
      ...start,
      githubSubject: profile.id,
      login: profile.login,
      ...(profile.avatar_url === null ? {} : { avatarUrl: profile.avatar_url }),
      accessToken: token.access_token,
      ...(token.refresh_token === undefined ? {} : { refreshToken: token.refresh_token }),
      accessTokenExpiresAt: new Date(now + token.expires_in * 1000).toISOString(),
      ...(token.refresh_token_expires_in === undefined
        ? {}
        : { refreshTokenExpiresAt: new Date(now + token.refresh_token_expires_in * 1000).toISOString() }),
    };
    const stored = await this.redisService.client.eval(
      storePendingLua,
      2,
      cancelledKey(start.attemptId),
      pendingKey(start.attemptId),
      this.seal(pending, start.userId, `pending:${start.attemptId}`),
      String(completionTtlSeconds),
    );
    if (stored !== 1) {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_CANCELLED' });
    }
    return { attemptId: start.attemptId, returnTo: start.returnTo, completionMode: start.completionMode };
  }

  public async complete(
    userId: string,
    sessionId: string,
    attemptId: string,
  ): Promise<{ id: string; subject: number; login: string; avatarUrl?: string; generation: number }> {
    this.requireConfiguration();
    if (!uuidPattern.test(attemptId)) {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_INVALID' });
    }
    const key = pendingKey(attemptId);
    const raw = await this.redisService.client.get(key);
    if (raw === null) {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_EXPIRED' });
    }
    const pending = this.open<PendingRecord>(raw, userId, `pending:${attemptId}`);
    if (pending.userId !== userId || pending.sessionId !== sessionId || pending.attemptId !== attemptId) {
      throw new UnauthorizedException({ code: 'GITHUB_COMPLETION_OWNER_MISMATCH' });
    }
    const lockKey = completionLockKey(attemptId);
    const lockValue = randomUUID();
    const locked = await this.redisService.client.set(lockKey, lockValue, 'EX', 30, 'NX');
    if (locked !== 'OK') {
      throw new ServiceUnavailableException({ code: 'GITHUB_COMPLETION_BUSY' });
    }
    try {
      const existing = await this.databaseService.database.query.githubConnection.findFirst({
        where: and(eq(githubConnection.userId, userId), eq(githubConnection.githubSubject, pending.githubSubject)),
      });
      const id = existing?.id ?? randomUUID();
      const generation = (existing?.generation ?? 0) + 1;
      const values = {
        id,
        userId,
        githubSubject: pending.githubSubject,
        login: pending.login,
        avatarUrl: pending.avatarUrl,
        accessToken: this.seal(pending.accessToken, userId, `access:${id}`),
        refreshToken:
          pending.refreshToken === undefined ? null : this.seal(pending.refreshToken, userId, `refresh:${id}`),
        accessTokenExpiresAt: new Date(pending.accessTokenExpiresAt),
        refreshTokenExpiresAt:
          pending.refreshTokenExpiresAt === undefined ? null : new Date(pending.refreshTokenExpiresAt),
        keyVersion: this.keyVersion,
        generation,
        updatedAt: new Date(),
      };
      const [row] =
        existing === undefined
          ? await this.databaseService.database.insert(githubConnection).values(values).returning()
          : await this.databaseService.database
              .update(githubConnection)
              .set(values)
              .where(and(eq(githubConnection.id, existing.id), eq(githubConnection.userId, userId)))
              .returning();
      if (row === undefined) {
        throw new ServiceUnavailableException({ code: 'GITHUB_CONNECTION_WRITE_FAILED' });
      }
      await this.redisService.client.eval(consumeValueLua, 1, key, raw);
      await this.redisService.client.del(attemptKey(attemptId), cancelledKey(attemptId));
      return {
        id: row.id,
        subject: row.githubSubject,
        login: row.login,
        ...(row.avatarUrl === null ? {} : { avatarUrl: row.avatarUrl }),
        generation: row.generation,
      };
    } finally {
      await this.redisService.client.eval(releaseLockLua, 1, lockKey, lockValue);
    }
  }

  public async cancel(userId: string, sessionId: string, attemptId: string): Promise<void> {
    if (!uuidPattern.test(attemptId)) {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_INVALID' });
    }
    const raw = await this.redisService.client.get(attemptKey(attemptId));
    if (raw === null) {
      return;
    }
    const attempt = z
      .object({ userId: z.string(), sessionId: z.string(), attemptId: z.string(), state: z.string() })
      .parse(JSON.parse(raw));
    if (attempt.userId !== userId || attempt.sessionId !== sessionId || attempt.attemptId !== attemptId) {
      throw new UnauthorizedException({ code: 'GITHUB_COMPLETION_OWNER_MISMATCH' });
    }
    await this.redisService.client.set(cancelledKey(attemptId), '1', 'EX', startTtlSeconds);
    await this.redisService.client.del(startKey(attempt.state), pendingKey(attemptId), attemptKey(attemptId));
  }

  public async list(
    userId: string,
  ): Promise<ReadonlyArray<{ id: string; subject: number; login: string; avatarUrl?: string; generation: number }>> {
    const rows = await this.databaseService.database
      .select({
        id: githubConnection.id,
        subject: githubConnection.githubSubject,
        login: githubConnection.login,
        avatarUrl: githubConnection.avatarUrl,
        generation: githubConnection.generation,
      })
      .from(githubConnection)
      .where(eq(githubConnection.userId, userId));
    return rows.map(({ avatarUrl, ...row }) => ({ ...row, ...(avatarUrl === null ? {} : { avatarUrl }) }));
  }

  public async remove(userId: string, connectionId: string): Promise<void> {
    await this.databaseService.database
      .delete(githubConnection)
      .where(and(eq(githubConnection.id, connectionId), eq(githubConnection.userId, userId)));
    const prefix = `${userId}:${connectionId}:`;
    for (const key of this.responseCache.keys()) {
      if (key.startsWith(prefix)) {
        this.responseCache.delete(key);
      }
    }
  }

  private async owned(userId: string, connectionId: string): Promise<ConnectionRow> {
    const row = await this.databaseService.database.query.githubConnection.findFirst({
      where: and(eq(githubConnection.id, connectionId), eq(githubConnection.userId, userId)),
    });
    if (row === undefined) {
      throw new UnauthorizedException({ code: 'GITHUB_CONNECTION_NOT_FOUND' });
    }
    return row;
  }

  public async token(
    userId: string,
    connectionId: string,
  ): Promise<{ accessToken: string; expiresAt: string; generation: number }> {
    for (let attempt = 0; attempt < refreshWaitAttempts; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- lock ownership must be observed before each retry.
      const row = await this.owned(userId, connectionId);
      if (row.accessTokenExpiresAt.getTime() > Date.now() + refreshSkewMilliseconds) {
        return {
          accessToken: this.open(row.accessToken, userId, `access:${row.id}`),
          expiresAt: row.accessTokenExpiresAt.toISOString(),
          generation: row.generation,
        };
      }
      const lockValue = randomUUID();
      // oxlint-disable-next-line no-await-in-loop -- each retry attempts the same distributed lock.
      const locked = await this.redisService.client.set(
        refreshKey(connectionId),
        lockValue,
        'PX',
        refreshLockMilliseconds,
        'NX',
      );
      if (locked === 'OK') {
        try {
          // oxlint-disable-next-line no-await-in-loop -- the lock holder performs the single refresh.
          return await this.refresh(userId, row);
        } finally {
          // oxlint-disable-next-line no-await-in-loop -- release follows the refresh in the same lock attempt.
          await this.redisService.client.eval(releaseLockLua, 1, refreshKey(connectionId), lockValue);
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- retries are intentionally serialized.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, refreshWaitMilliseconds);
      });
    }
    throw new ServiceUnavailableException({ code: 'GITHUB_REFRESH_BUSY' });
  }

  private async refresh(
    userId: string,
    initial: ConnectionRow,
  ): Promise<{ accessToken: string; expiresAt: string; generation: number }> {
    const row = await this.owned(userId, initial.id);
    if (row.accessTokenExpiresAt.getTime() > Date.now() + refreshSkewMilliseconds) {
      return {
        accessToken: this.open(row.accessToken, userId, `access:${row.id}`),
        expiresAt: row.accessTokenExpiresAt.toISOString(),
        generation: row.generation,
      };
    }
    if (
      row.refreshToken === null ||
      row.refreshTokenExpiresAt === null ||
      row.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw reconnectRequired();
    }
    const configuration = this.requireConfiguration();
    const refreshToken = this.open<string>(row.refreshToken, userId, `refresh:${row.id}`);
    let token: z.infer<typeof tokenSchema>;
    try {
      token = this.tokenResponse(
        await this.githubJson('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: configuration.clientId,
            client_secret: configuration.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        }),
      );
    } catch {
      /* A refresh token rotates when GitHub consumes it. If the exchange is
       * ambiguous, retrying the old value cannot be made safe. */
      await this.databaseService.database
        .update(githubConnection)
        .set({ refreshToken: null, refreshTokenExpiresAt: null, generation: row.generation + 1, updatedAt: new Date() })
        .where(
          and(
            eq(githubConnection.id, row.id),
            eq(githubConnection.userId, userId),
            eq(githubConnection.generation, row.generation),
          ),
        );
      throw reconnectRequired();
    }
    const now = Date.now();
    const next = {
      accessToken: this.seal(token.access_token, userId, `access:${row.id}`),
      refreshToken: this.seal(token.refresh_token ?? refreshToken, userId, `refresh:${row.id}`),
      accessTokenExpiresAt: new Date(now + token.expires_in * 1000),
      refreshTokenExpiresAt: new Date(
        now +
          (token.refresh_token_expires_in ??
            Math.max(1, Math.floor((row.refreshTokenExpiresAt.getTime() - now) / 1000))) *
            1000,
      ),
      generation: row.generation + 1,
      updatedAt: new Date(),
    };
    const [updated] = await this.databaseService.database
      .update(githubConnection)
      .set(next)
      .where(
        and(
          eq(githubConnection.id, row.id),
          eq(githubConnection.userId, userId),
          eq(githubConnection.generation, row.generation),
        ),
      )
      .returning();
    if (updated === undefined) {
      throw new ServiceUnavailableException({ code: 'GITHUB_REFRESH_CONFLICT' });
    }
    return {
      accessToken: token.access_token,
      expiresAt: next.accessTokenExpiresAt.toISOString(),
      generation: next.generation,
    };
  }

  public completionUrl(attemptId: string, returnTo: string, completionMode: 'browser' | 'desktop-poll'): string {
    const url = new URL('/github/complete', this.frontendUrl);
    url.searchParams.set('attempt', attemptId);
    url.searchParams.set('returnTo', returnTo);
    url.searchParams.set('mode', completionMode);
    return url.toString();
  }

  public configuration(): { installUrl: string } {
    const { appSlug } = this.requireConfiguration();
    return { installUrl: `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new` };
  }

  public async installations(userId: string, connectionId: string, page: number): Promise<unknown> {
    const { accessToken, generation } = await this.token(userId, connectionId);
    const path = `/user/installations?per_page=100&page=${String(page)}`;
    const body = z
      .object({ total_count: z.number(), installations: z.array(installationSchema) })
      .parse(await this.apiJson(path, accessToken, `${userId}:${connectionId}:${String(generation)}:${path}`));
    return {
      totalCount: body.total_count,
      installations: body.installations.map((item) => ({
        id: item.id,
        owner: {
          id: item.account.id,
          login: item.account.login,
          avatarUrl: item.account.avatar_url,
          type: item.account.type,
        },
        repositorySelection: item.repository_selection,
        suspended: item.suspended_at !== null,
        permissions: item.permissions,
      })),
      page,
    };
  }

  public async repositories(
    userId: string,
    connectionId: string,
    installationId: number,
    page: number,
  ): Promise<unknown> {
    const { accessToken, generation } = await this.token(userId, connectionId);
    const path = `/user/installations/${String(installationId)}/repositories?per_page=100&page=${String(page)}`;
    const body = z
      .object({ total_count: z.number(), repositories: z.array(repositorySchema) })
      .parse(await this.apiJson(path, accessToken, `${userId}:${connectionId}:${String(generation)}:${path}`));
    return { totalCount: body.total_count, repositories: body.repositories.map((repo) => this.repository(repo)), page };
  }

  public async branches(userId: string, connectionId: string, repositoryId: number, page: number): Promise<unknown> {
    const { accessToken, generation } = await this.token(userId, connectionId);
    const path = `/repositories/${String(repositoryId)}/branches?per_page=100&page=${String(page)}`;
    const body = z
      .array(branchSchema)
      .parse(await this.apiJson(path, accessToken, `${userId}:${connectionId}:${String(generation)}:${path}`));
    return { branches: body.map((branch) => ({ name: branch.name, head: branch.commit.sha })), page };
  }

  public async tree(userId: string, connectionId: string, repositoryId: number, head: string): Promise<unknown> {
    if (!/^[0-9a-f]{40}$/u.test(head)) {
      throw new BadRequestException({ code: 'GITHUB_HEAD_INVALID' });
    }
    const { accessToken, generation } = await this.token(userId, connectionId);
    const path = `/repositories/${String(repositoryId)}/git/trees/${head}?recursive=1`;
    const cacheScope = `${userId}:${connectionId}:${String(generation)}`;
    const body = treeSchema.parse(await this.apiJson(path, accessToken, `${cacheScope}:${path}`));
    if (body.truncated) {
      throw new UnprocessableEntityException({
        code: 'GITHUB_TREE_TOO_LARGE',
        message: 'GitHub could not return the complete repository tree.',
      });
    }
    const unsupported = body.tree.find(
      (entry) =>
        entry.type === 'commit' || (entry.type === 'blob' && entry.mode !== '100644' && entry.mode !== '100755'),
    );
    if (unsupported !== undefined) {
      throw new UnprocessableEntityException({
        code: 'GITHUB_TREE_UNSUPPORTED',
        message: `Unsupported tracked entry: ${unsupported.path}`,
      });
    }
    const manifestEntry = body.tree.find((entry) => entry.type === 'blob' && entry.path === 'tau.json');
    let manifestBase64: string | undefined;
    if (manifestEntry !== undefined) {
      const blob = blobSchema.parse(
        await this.apiJson(
          `/repositories/${String(repositoryId)}/git/blobs/${manifestEntry.sha}`,
          accessToken,
          `${cacheScope}:blob:${manifestEntry.sha}`,
        ),
      );
      if (blob.size > 1024 * 1024) {
        throw new UnprocessableEntityException({ code: 'GITHUB_MANIFEST_TOO_LARGE' });
      }
      manifestBase64 = Buffer.from(blob.content.replaceAll(/\s+/gu, ''), 'base64').toString('base64');
    }
    return {
      files: body.tree
        .filter((entry) => entry.type === 'blob')
        .map((entry) => ({ path: entry.path, mode: entry.mode, size: entry.size ?? 0, oid: entry.sha })),
      ...(manifestBase64 === undefined ? {} : { manifestBase64 }),
    };
  }

  private repository(repo: z.infer<typeof repositorySchema>): unknown {
    const access =
      repo.permissions?.pull === true
        ? repo.permissions.push && !repo.archived && !repo.disabled
          ? 'write'
          : 'read'
        : 'unknown';
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: { id: repo.owner.id, login: repo.owner.login, avatarUrl: repo.owner.avatar_url, type: repo.owner.type },
      visibility: repo.visibility,
      access,
      archived: repo.archived,
      disabled: repo.disabled,
      description: repo.description,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
    };
  }

  private async apiJson(path: string, accessToken: string, cacheKey?: string): Promise<unknown> {
    return this.githubJson(
      `https://api.github.com${path}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${accessToken}`,
          'x-github-api-version': apiVersion,
          'user-agent': 'tau-github-app',
        },
      },
      cacheKey,
    );
  }

  private async githubJson(url: string, init: RequestInit, cacheKey?: string): Promise<unknown> {
    const cached = cacheKey === undefined ? undefined : this.responseCache.get(cacheKey);
    const headers = new Headers(init.headers);
    if (cached !== undefined) {
      headers.set('if-none-match', cached.etag);
    }
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (response.status === 304 && cached === undefined) {
        headers.delete('if-none-match');
        response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      }
    } catch (error) {
      throw new BadGatewayException({
        code: 'GITHUB_UPSTREAM_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'GitHub did not respond.',
      });
    }
    if (response.status === 304 && cached !== undefined) {
      return cached.body;
    }
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      if (response.status === 401) {
        throw reconnectRequired();
      }
      if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') {
        throw new HttpException(
          {
            code: 'GITHUB_RATE_LIMITED',
            message: 'GitHub rate limit reached. Try again after the reported reset time.',
            ...(retryAfter === null ? {} : { retryAfter }),
            ...(rateLimitReset === null ? {} : { rateLimitReset }),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (response.status === 403 && response.headers.has('x-github-sso')) {
        throw new ForbiddenException({
          code: 'GITHUB_SSO_REQUIRED',
          message: 'Start an organization SSO session, then reconnect GitHub.',
        });
      }
      if (response.status === 403) {
        throw new ForbiddenException({
          code: 'GITHUB_ACCESS_REFUSED',
          message: 'GitHub refused access to this resource.',
        });
      }
      if (response.status === 404) {
        throw new NotFoundException({
          code: 'GITHUB_NOT_FOUND_OR_DENIED',
          message: 'The GitHub resource was not found or this connection cannot access it.',
        });
      }
      throw new BadGatewayException({ code: 'GITHUB_UPSTREAM_FAILED', status: response.status });
    }
    const body: unknown = await response.json();
    const etag = response.headers.get('etag');
    if (cacheKey !== undefined && etag !== null) {
      this.responseCache.delete(cacheKey);
      this.responseCache.set(cacheKey, { etag, body });
      while (this.responseCache.size > 256) {
        const oldest = this.responseCache.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        this.responseCache.delete(oldest);
      }
    }
    return body;
  }
}
