/* eslint-disable @typescript-eslint/naming-convention -- GitHub OAuth and REST wire fields retain provider names. */
/* eslint-disable @typescript-eslint/member-ordering -- OAuth lifecycle helpers stay beside the flow they protect. */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- identity and catalog coordinates remain explicit security inputs. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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
/** Pages of 100 read to find a repository's installation; past 1,000 installations or repositories access is `unknown`. */
const installationLookupPages = 10;
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
/** GitHub's token endpoint answers most refusals with 200 and an `error` field. */
const tokenErrorSchema = z.object({ error: z.string().min(1) });
const attemptSchema = z.object({ userId: z.string(), sessionId: z.string(), attemptId: z.string(), state: z.string() });
const callbackFailureCodes = [
  'GITHUB_CONSENT_DENIED',
  'GITHUB_CALLBACK_EXPIRED',
  'GITHUB_CALLBACK_FAILED',
  'GITHUB_EXPIRING_TOKENS_REQUIRED',
  'GITHUB_APP_CREDENTIALS_INVALID',
] as const;
type CallbackFailureCode = (typeof callbackFailureCodes)[number];
const failureSchema = z.object({ userId: z.string(), sessionId: z.string(), code: z.enum(callbackFailureCodes) });
/* Socket errors raised before a request byte leaves this process; anything else may have reached GitHub. */
const preSendErrorCodes: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);
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
const failedKey = (attemptId: string): string => `github:connection:failed:${attemptId}`;
const completionLockKey = (attemptId: string): string => `github:connection:complete:${attemptId}`;
const refreshKey = (connectionId: string): string => `github:connection:refresh:${connectionId}`;
const base64url = (value: Uint8Array<ArrayBuffer>): string => Buffer.from(value).toString('base64url');
const oauthChallenge = (verifier: string): string =>
  base64url(Uint8Array.from(createHash('sha256').update(verifier).digest()));
const reconnectRequired = (): UnauthorizedException =>
  new UnauthorizedException({ code: 'GITHUB_RECONNECT_REQUIRED', message: 'Reconnect GitHub to continue.' });
const pause = async (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, refreshWaitMilliseconds);
  });
const responseField = (error: unknown, field: 'code' | 'status'): unknown => {
  const response = error instanceof HttpException ? error.getResponse() : undefined;
  return typeof response === 'object' ? (response as Record<string, unknown>)[field] : undefined;
};
const callbackFailureCode = (error: unknown): CallbackFailureCode => {
  const code = responseField(error, 'code');
  return callbackFailureCodes.find((known) => known === code) ?? 'GITHUB_CALLBACK_FAILED';
};
const failedBeforeSending = (error: unknown): boolean => {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
  return typeof code === 'string' && preSendErrorCodes.has(code);
};
/**
 * A rotated refresh token is spent once GitHub reads it, so it is kept only when GitHub provably did not consume
 * it: the request never left, GitHub throttled or failed (429/5xx), or it refused the App's own credentials.
 */
const refreshTokenSurvives = (error: unknown): boolean => {
  const code = responseField(error, 'code');
  const status = responseField(error, 'status');
  return (
    code === 'GITHUB_RATE_LIMITED' ||
    code === 'GITHUB_APP_CREDENTIALS_INVALID' ||
    (code === 'GITHUB_UPSTREAM_FAILED' && typeof status === 'number' && status >= 500) ||
    (code === 'GITHUB_UPSTREAM_UNAVAILABLE' && error instanceof Error && failedBeforeSending(error.cause))
  );
};
const retryAfterSeconds = (headers: Headers): number | undefined => {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null && /^\d+$/u.test(retryAfter)) {
    return Number(retryAfter);
  }
  const reset = headers.get('x-ratelimit-reset');
  return reset !== null && /^\d+$/u.test(reset)
    ? Math.max(0, Number(reset) - Math.floor(Date.now() / 1000))
    : undefined;
};
/** Maps a non-OK GitHub REST or OAuth response to the module's typed refusal. */
const upstreamRefusal = (response: Response): HttpException => {
  if (response.status === 401) {
    return reconnectRequired();
  }
  if (
    response.status === 429 ||
    response.headers.get('x-ratelimit-remaining') === '0' ||
    (response.status === 403 && response.headers.has('retry-after'))
  ) {
    const seconds = retryAfterSeconds(response.headers);
    return new HttpException(
      {
        code: 'GITHUB_RATE_LIMITED',
        message: 'GitHub rate limit reached. Try again after the reported reset time.',
        ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (response.status === 403 && response.headers.has('x-github-sso')) {
    return new ForbiddenException({
      code: 'GITHUB_SSO_REQUIRED',
      message: 'Start an organization SSO session, then reconnect GitHub.',
    });
  }
  if (response.status === 403) {
    return new ForbiddenException({
      code: 'GITHUB_ACCESS_REFUSED',
      message: 'GitHub refused access to this resource.',
    });
  }
  if (response.status === 404) {
    return new NotFoundException({
      code: 'GITHUB_NOT_FOUND_OR_DENIED',
      message: 'The GitHub resource was not found or this connection cannot access it.',
    });
  }
  return new BadGatewayException({ code: 'GITHUB_UPSTREAM_FAILED', status: response.status });
};
const connectionSummary = (
  row: ConnectionRow,
): { id: string; subject: number; login: string; avatarUrl?: string; generation: number } => ({
  id: row.id,
  subject: row.githubSubject,
  login: row.login,
  ...(row.avatarUrl === null ? {} : { avatarUrl: row.avatarUrl }),
  generation: row.generation,
});

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
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
    const refusal = tokenErrorSchema.safeParse(value);
    if (refusal.success) {
      switch (refusal.data.error) {
        case 'bad_verification_code': {
          throw new BadRequestException({
            code: 'GITHUB_CALLBACK_EXPIRED',
            message: 'The GitHub authorization expired. Connect GitHub again.',
          });
        }
        case 'bad_refresh_token': {
          throw reconnectRequired();
        }
        default: {
          // Only GitHub's error code is logged; the response carries no credential on this branch.
          this.logger.error(`GitHub refused the repository App credentials: ${refusal.data.error}`);
          throw new ServiceUnavailableException({
            code: 'GITHUB_APP_CREDENTIALS_INVALID',
            message: 'GitHub refused the configured GitHub App credentials.',
          });
        }
      }
    }
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

  /** Starts an attempt; `returnTo` and `completionMode` arrive unvalidated from the request body. */
  public async start(
    userId: string,
    sessionId: string,
    returnTo: unknown = '/import',
    completionMode: unknown = 'browser',
  ): Promise<{ attemptId: string; authorizationUrl: string }> {
    const configuration = this.requireConfiguration();
    if (completionMode !== 'browser' && completionMode !== 'desktop-poll') {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_MODE_INVALID' });
    }
    if (
      typeof returnTo !== 'string' ||
      !returnTo.startsWith('/') ||
      returnTo.includes('//') ||
      returnTo.includes('\\') ||
      // A browser strips tab and newline from a URL, so `/\t/evil.example` would navigate to `//evil.example`.
      [...returnTo].some((character) => character <= '\u001F' || character === '\u007F') ||
      returnTo.length > 2048
    ) {
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

  /**
   * Handles GitHub's redirect and returns the completion page URL to send the browser to. It never throws: every
   * failure becomes `?error=<code>`, and a failure on a readable attempt is recorded so `complete` answers it.
   */
  public async callback(parameters: Readonly<{ state?: unknown; code?: unknown; error?: unknown }>): Promise<string> {
    let start: StartRecord | undefined;
    try {
      if (typeof parameters.state === 'string' && oauthValuePattern.test(parameters.state)) {
        const raw = await this.redisService.client.getdel(startKey(parameters.state));
        start = raw === null ? undefined : (JSON.parse(raw) as StartRecord);
      }
      if (parameters.error !== undefined) {
        throw new BadRequestException({
          code: parameters.error === 'access_denied' ? 'GITHUB_CONSENT_DENIED' : 'GITHUB_CALLBACK_FAILED',
        });
      }
      if (start === undefined) {
        throw new BadRequestException({ code: 'GITHUB_CALLBACK_EXPIRED' });
      }
      if (typeof parameters.code !== 'string' || !oauthValuePattern.test(parameters.code)) {
        throw new BadRequestException({ code: 'GITHUB_CALLBACK_FAILED' });
      }
      await this.storePending(start, parameters.code);
      return this.completionUrl(start);
    } catch (error) {
      const code = callbackFailureCode(error);
      this.logger.warn(
        `GitHub connection callback failed with ${code}${error instanceof HttpException ? '' : ` (${error instanceof Error ? error.name : 'unknown'})`}`,
      );
      if (start !== undefined) {
        try {
          await this.redisService.client.eval(
            storePendingLua,
            2,
            cancelledKey(start.attemptId),
            failedKey(start.attemptId),
            JSON.stringify({ userId: start.userId, sessionId: start.sessionId, code }),
            String(completionTtlSeconds),
          );
        } catch {
          // The redirect still carries the code; an unrecorded failure only makes a poller wait for expiry.
        }
      }
      return this.completionUrl(start, code);
    }
  }

  private async storePending(start: StartRecord, code: string): Promise<void> {
    const configuration = this.requireConfiguration();
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
    if (token.refresh_token === undefined) {
      throw new BadGatewayException({ code: 'GITHUB_EXPIRING_TOKENS_REQUIRED' });
    }
    const profile = userSchema.parse(await this.apiJson('/user', token.access_token));
    const now = Date.now();
    const pending: PendingRecord = {
      ...start,
      githubSubject: profile.id,
      login: profile.login,
      ...(profile.avatar_url === null ? {} : { avatarUrl: profile.avatar_url }),
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
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
      return this.unfinished(userId, sessionId, attemptId);
    }
    const pending = this.open<PendingRecord>(raw, userId, `pending:${attemptId}`);
    if (pending.userId !== userId || pending.sessionId !== sessionId || pending.attemptId !== attemptId) {
      throw new UnauthorizedException({ code: 'GITHUB_COMPLETION_OWNER_MISMATCH' });
    }
    const lockKey = completionLockKey(attemptId);
    const lockValue = randomUUID();
    let locked = false;
    for (let attempt = 0; attempt < refreshWaitAttempts && !locked; attempt += 1) {
      if (attempt > 0) {
        // oxlint-disable-next-line no-await-in-loop -- a concurrent completer holds the lock; wait for its result.
        await pause();
      }
      // oxlint-disable-next-line no-await-in-loop -- each retry attempts the same distributed lock.
      locked = (await this.redisService.client.set(lockKey, lockValue, 'EX', 30, 'NX')) === 'OK';
    }
    if (!locked) {
      throw new ServiceUnavailableException({ code: 'GITHUB_COMPLETION_BUSY' });
    }
    try {
      const existing = await this.databaseService.database.query.githubConnection.findFirst({
        where: and(eq(githubConnection.userId, userId), eq(githubConnection.githubSubject, pending.githubSubject)),
      });
      // A concurrent completer consumed the attempt while this one waited: answer with its row, bump nothing.
      if ((await this.redisService.client.get(key)) !== raw) {
        if (existing === undefined) {
          throw new BadRequestException({ code: 'GITHUB_COMPLETION_INVALID' });
        }
        return connectionSummary(existing);
      }
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
      return connectionSummary(row);
    } finally {
      await this.redisService.client.eval(releaseLockLua, 1, lockKey, lockValue);
    }
  }

  /**
   * Answers a completion with no pending result: the callback's recorded failure (consuming the attempt),
   * `GITHUB_COMPLETION_PENDING` while the owned attempt is unresolved (GitHub has not redirected back, or the
   * callback is still exchanging the code), otherwise expiry.
   */
  private async unfinished(userId: string, sessionId: string, attemptId: string): Promise<never> {
    const owns = (record: Readonly<{ userId: string; sessionId: string }>): boolean =>
      record.userId === userId && record.sessionId === sessionId;
    const failedRaw = await this.redisService.client.get(failedKey(attemptId));
    if (failedRaw !== null) {
      const failure = failureSchema.parse(JSON.parse(failedRaw));
      if (!owns(failure)) {
        throw new UnauthorizedException({ code: 'GITHUB_COMPLETION_OWNER_MISMATCH' });
      }
      await this.redisService.client.del(failedKey(attemptId), attemptKey(attemptId), cancelledKey(attemptId));
      throw new BadRequestException({ code: failure.code });
    }
    const attemptRaw = await this.redisService.client.get(attemptKey(attemptId));
    if (attemptRaw !== null) {
      const attempt = attemptSchema.parse(JSON.parse(attemptRaw));
      if (!owns(attempt)) {
        throw new UnauthorizedException({ code: 'GITHUB_COMPLETION_OWNER_MISMATCH' });
      }
      // ponytail: an attempt whose pending result expired unconsumed answers PENDING until the attempt's own TTL.
      throw new ConflictException({ code: 'GITHUB_COMPLETION_PENDING' });
    }
    throw new BadRequestException({ code: 'GITHUB_COMPLETION_EXPIRED' });
  }

  public async cancel(userId: string, sessionId: string, attemptId: string): Promise<void> {
    if (!uuidPattern.test(attemptId)) {
      throw new BadRequestException({ code: 'GITHUB_COMPLETION_INVALID' });
    }
    const raw = await this.redisService.client.get(attemptKey(attemptId));
    if (raw === null) {
      return;
    }
    const attempt = attemptSchema.parse(JSON.parse(raw));
    if (attempt.userId !== userId || attempt.sessionId !== sessionId || attempt.attemptId !== attemptId) {
      throw new UnauthorizedException({ code: 'GITHUB_COMPLETION_OWNER_MISMATCH' });
    }
    await this.redisService.client.set(cancelledKey(attemptId), '1', 'EX', startTtlSeconds);
    await this.redisService.client.del(
      startKey(attempt.state),
      pendingKey(attemptId),
      failedKey(attemptId),
      attemptKey(attemptId),
    );
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

  /** Revokes the grant at GitHub (best effort, never blocking removal), then deletes the connection row. */
  public async remove(userId: string, connectionId: string): Promise<void> {
    try {
      const { accessToken } = await this.token(userId, connectionId);
      await this.revokeGrant(accessToken);
    } catch (error) {
      const code = responseField(error, 'code');
      const reason = typeof code === 'string' ? code : error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`GitHub grant was not revoked before removing a connection: ${reason}`);
    }
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

  private async revokeGrant(accessToken: string): Promise<void> {
    const { clientId, clientSecret } = this.requireConfiguration();
    const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`, {
      method: 'DELETE',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'content-type': 'application/json',
        'x-github-api-version': apiVersion,
        'user-agent': 'tau-github-app',
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`GitHub answered ${String(response.status)}`);
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
      await pause();
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
    } catch (error) {
      /* A refresh token rotates when GitHub consumes it. If the exchange is
       * ambiguous, retrying the old value cannot be made safe. */
      if (refreshTokenSurvives(error)) {
        throw error;
      }
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

  private completionUrl(start: StartRecord | undefined, error?: CallbackFailureCode): string {
    const url = new URL('/github/complete', this.frontendUrl);
    if (start !== undefined) {
      url.searchParams.set('attempt', start.attemptId);
      url.searchParams.set('returnTo', start.returnTo);
      url.searchParams.set('mode', start.completionMode);
    }
    if (error !== undefined) {
      url.searchParams.set('error', error);
    }
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
    return {
      totalCount: body.total_count,
      repositories: body.repositories.map((repo) => this.repositorySummary(repo)),
      page,
    };
  }

  /**
   * One repository by stable id, so a renamed or transferred repository can be re-resolved. GitHub answers this
   * for any repository the user can see (a public one included) with the *user's* permissions, so the access is
   * reported only for a repository one of the connection's App installations holds, and is `unknown` otherwise.
   */
  public async repository(userId: string, connectionId: string, repositoryId: number): Promise<unknown> {
    const { accessToken, generation } = await this.token(userId, connectionId);
    const cacheScope = `${userId}:${connectionId}:${String(generation)}`;
    const path = `/repositories/${String(repositoryId)}`;
    const repository = repositorySchema.parse(await this.apiJson(path, accessToken, `${cacheScope}:${path}`));
    // Without the user's permissions the summary reports `unknown` access.
    return this.repositorySummary(
      (await this.installationHolds(repository, accessToken, cacheScope))
        ? repository
        : { ...repository, permissions: undefined },
    );
  }

  /**
   * Whether an unsuspended installation of the App on the repository owner's account holds the repository. Uses
   * the same pages (and cache keys) as the picker's listings; bounded to `installationLookupPages` of each.
   */
  private async installationHolds(
    repository: z.infer<typeof repositorySchema>,
    accessToken: string,
    cacheScope: string,
  ): Promise<boolean> {
    const listed = async <T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> =>
      schema.parse(await this.apiJson(path, accessToken, `${cacheScope}:${path}`));
    let installation: z.infer<typeof installationSchema> | undefined;
    for (let page = 1; page <= installationLookupPages && installation === undefined; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- pages are read only until the owner's installation appears.
      const body = await listed(
        `/user/installations?per_page=100&page=${String(page)}`,
        z.object({ total_count: z.number(), installations: z.array(installationSchema) }),
      );
      installation = body.installations.find((item) => item.account.id === repository.owner.id);
      if (page * 100 >= body.total_count) {
        break;
      }
    }
    if (installation === undefined || installation.suspended_at !== null) {
      return false;
    }
    if (installation.repository_selection === 'all') {
      return true;
    }
    for (let page = 1; page <= installationLookupPages; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- pages are read only until the repository appears.
      const body = await listed(
        `/user/installations/${String(installation.id)}/repositories?per_page=100&page=${String(page)}`,
        z.object({ total_count: z.number(), repositories: z.array(repositorySchema) }),
      );
      if (body.repositories.some((item) => item.id === repository.id)) {
        return true;
      }
      if (page * 100 >= body.total_count) {
        break;
      }
    }
    return false;
  }

  /** One branch by exact name; names may contain `/`. */
  public async branch(userId: string, connectionId: string, repositoryId: number, name: unknown): Promise<unknown> {
    if (
      typeof name !== 'string' ||
      name.length > 255 ||
      name.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new BadRequestException({ code: 'GITHUB_BRANCH_INVALID' });
    }
    const { accessToken, generation } = await this.token(userId, connectionId);
    const path = `/repositories/${String(repositoryId)}/branches/${name
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
    const branch = branchSchema.parse(
      await this.apiJson(path, accessToken, `${userId}:${connectionId}:${String(generation)}:${path}`),
    );
    return { name: branch.name, head: branch.commit.sha };
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

  private repositorySummary(repo: z.infer<typeof repositorySchema>): unknown {
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
      // The cause stays server-side: refresh reads it to tell a request that never left from an ambiguous one.
      throw new BadGatewayException(
        { code: 'GITHUB_UPSTREAM_UNAVAILABLE', message: 'GitHub did not respond.' },
        { cause: error },
      );
    }
    if (response.status === 304 && cached !== undefined) {
      return cached.body;
    }
    if (!response.ok) {
      throw upstreamRefusal(response);
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
