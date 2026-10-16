/* eslint-disable @typescript-eslint/naming-convention -- GitHub REST field names. */
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { BetterAuthService } from '#auth/better-auth.service.js';
import { DatabaseService } from '#database/database.service.js';
import { account, githubGistPreference } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';

const artifactLimit = 921_600;
const filenames = ['tau-project.zip.base64url', 'tau-project.jwe'] as const;
const fileSchema = z.object({ content: z.string().min(1).max(artifactLimit) }).strict();
const payloadSchema = z
  .object({
    public: z.boolean().optional(),
    files: z.partialRecord(z.enum(filenames), fileSchema.nullable()),
  })
  .strict()
  .refine((body) => Object.values(body.files).filter((file) => file !== null).length === 1);
const gistSchema = z.object({
  id: z.string().regex(/^[0-9a-f]+$/u),
  owner: z.object({ id: z.number().int().positive() }),
  files: z.record(z.string(), z.object({ content: z.string().optional(), truncated: z.boolean().optional() })),
  history: z.array(z.object({ version: z.string().regex(/^[0-9a-f]{40}$/u) })).min(1),
});
const mutationResponseSchema = gistSchema.extend({ history: gistSchema.shape.history.optional() });
type GistCredential = { accessToken: string; accountId: number; login: string; scopes: string[] };

type GistCapability = Readonly<{
  status: 'not-connected' | 'connected' | 'disabled' | 'permission-required' | 'reconnect-required';
  enabled: boolean;
  grantedScopes: readonly string[];
  authorizationUrl: string;
  account?: { id: number; login: string };
  verifiedAt?: string;
}>;
type GistMutationResult = Readonly<{ id: string; history: ReadonlyArray<{ version: string }>; html_url: string }>;

@Injectable()
export class GithubGistService {
  public constructor(
    private readonly auth: BetterAuthService,
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  public async capability(userId: string, headers: Headers): Promise<GistCapability> {
    const preference = await this.database.database.query.githubGistPreference.findFirst({
      where: eq(githubGistPreference.userId, userId),
    });
    const enabled = preference?.enabled !== false;
    const authorizationUrl = this.authorizationUrl();
    try {
      const credential = await this.credential(userId, headers);
      if (credential === undefined) {
        return { status: 'not-connected', enabled, grantedScopes: [], authorizationUrl };
      }
      return {
        status: credential.scopes.includes('gist') ? (enabled ? 'connected' : 'disabled') : 'permission-required',
        enabled,
        grantedScopes: credential.scopes,
        authorizationUrl,
        account: { id: credential.accountId, login: credential.login },
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return { status: 'reconnect-required', enabled, grantedScopes: [], authorizationUrl };
      }
      throw error;
    }
  }

  public async setEnabled(userId: string, headers: Headers, enabled: boolean): Promise<{ enabled: boolean }> {
    if (enabled) {
      const credential = await this.credential(userId, headers);
      if (!credential?.scopes.includes('gist')) {
        throw new ForbiddenException({ code: 'GITHUB_GIST_PERMISSION_REQUIRED' });
      }
    }
    await this.database.database
      .insert(githubGistPreference)
      .values({ userId, enabled })
      .onConflictDoUpdate({ target: githubGistPreference.userId, set: { enabled } });
    return { enabled };
  }

  public async mutate(
    userId: string,
    headers: Headers,
    input: { action: 'create' | 'update' | 'delete'; id?: string; revision?: string; payload?: unknown },
  ): Promise<GistMutationResult | undefined> {
    const payload = input.action === 'delete' ? undefined : payloadSchema.safeParse(input.payload);
    if (payload !== undefined && !payload.success) {
      throw new BadRequestException({ code: 'GITHUB_GIST_PAYLOAD_INVALID' });
    }
    if (
      input.action === 'create' &&
      (payload?.data.public === undefined || Object.values(payload.data.files).some((file) => file === null))
    ) {
      throw new BadRequestException({ code: 'GITHUB_GIST_PAYLOAD_INVALID' });
    }
    if (input.action === 'update' && payload?.success && payload.data.public !== undefined) {
      throw new BadRequestException({ code: 'GITHUB_GIST_PAYLOAD_INVALID' });
    }
    const credential = await this.requireWrite(userId, headers);
    if (input.action !== 'create') {
      const current = await this.ownedGist(credential, input.id ?? '');
      if (input.revision === undefined || current.history[0]?.version !== input.revision) {
        throw new ConflictException({ code: 'GITHUB_GIST_CHANGED' });
      }
      if (input.action === 'update' && payload?.success) {
        const currentName = filenames.find((name) => name in current.files);
        if (currentName !== undefined && !(currentName in payload.data.files)) {
          payload.data.files[currentName] = null;
        }
      }
    }
    // A disable that lands during provider verification prevents the mutation.
    const preference = await this.database.database.query.githubGistPreference.findFirst({
      where: eq(githubGistPreference.userId, userId),
    });
    if (preference?.enabled === false) {
      throw new ForbiddenException({ code: 'GITHUB_GIST_USE_DISABLED' });
    }
    const response = await this.request(
      input.action === 'create' ? '/gists' : `/gists/${input.id ?? ''}`,
      credential.accessToken,
      {
        method: input.action === 'create' ? 'POST' : input.action === 'update' ? 'PATCH' : 'DELETE',
        ...(payload?.success ? { body: JSON.stringify(payload.data) } : {}),
      },
    );
    if (input.action === 'delete') {
      return undefined;
    }
    const body = mutationResponseSchema.safeParse(await this.json(response));
    if (!body.success || body.data.owner.id !== credential.accountId) {
      throw new BadGatewayException({ code: 'GITHUB_GIST_RESPONSE_INVALID' });
    }
    // GitHub can omit history from a mutation response. Read the same owned publication to pin its revision.
    let { history } = body.data;
    if (history === undefined) {
      const current = await this.ownedGist(credential, body.data.id);
      const uploaded = Object.entries(payload?.data.files ?? {}).find(([, file]) => file !== null);
      const readBack = current.files[uploaded?.[0] ?? ''];
      if (uploaded === undefined || readBack?.truncated === true || readBack?.content !== uploaded[1]?.content) {
        throw new ConflictException({ code: 'GITHUB_GIST_CHANGED' });
      }
      history = current.history;
    }
    return { id: body.data.id, history, html_url: `https://gist.github.com/${body.data.id}` };
  }
  private authorizationUrl(): string {
    return `https://github.com/settings/connections/applications/${encodeURIComponent(this.config.get('GITHUB_CLIENT_ID', { infer: true }))}`;
  }

  private async credential(userId: string, headers: Headers): Promise<GistCredential | undefined> {
    const linked = await this.database.database.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.providerId, 'github')),
    });
    if (linked === undefined) {
      return undefined;
    }
    let lease;
    try {
      lease = await this.auth.api.getAccessToken({ headers, body: { accountId: linked.id } });
    } catch {
      throw new UnauthorizedException({ code: 'GITHUB_GIST_RECONNECT_REQUIRED' });
    }
    const response = await this.request('/user', lease.accessToken, { method: 'GET' });
    const identity = z
      .object({ id: z.number().int().positive(), login: z.string() })
      .safeParse(await this.json(response));
    const granted = response.headers.get('x-oauth-scopes');
    if (!identity.success || String(identity.data.id) !== linked.accountId || granted === null) {
      throw new UnauthorizedException({ code: 'GITHUB_GIST_RECONNECT_REQUIRED' });
    }
    return {
      accessToken: lease.accessToken,
      accountId: identity.data.id,
      login: identity.data.login,
      scopes: granted.split(/[ ,]+/u).filter(Boolean),
    };
  }

  private async requireWrite(userId: string, headers: Headers): Promise<GistCredential> {
    const preference = await this.database.database.query.githubGistPreference.findFirst({
      where: eq(githubGistPreference.userId, userId),
    });
    if (preference?.enabled === false) {
      throw new ForbiddenException({ code: 'GITHUB_GIST_USE_DISABLED' });
    }
    const credential = await this.credential(userId, headers);
    if (credential === undefined) {
      throw new UnauthorizedException({ code: 'GITHUB_GIST_RECONNECT_REQUIRED' });
    }
    if (!credential.scopes.includes('gist')) {
      throw new ForbiddenException({ code: 'GITHUB_GIST_PERMISSION_REQUIRED' });
    }
    return credential;
  }

  private async request(path: string, token: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-github-api-version': '2026-03-10',
        },
      });
    } catch {
      throw new BadGatewayException({ code: 'GITHUB_GIST_UNAVAILABLE' });
    }
    if (response.status === 401) {
      throw new UnauthorizedException({ code: 'GITHUB_GIST_RECONNECT_REQUIRED' });
    }
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
    ) {
      throw new BadGatewayException({ code: 'GITHUB_GIST_RATE_LIMITED' });
    }
    if (response.status === 403 || response.status === 404) {
      throw new ForbiddenException({ code: 'GITHUB_GIST_ACCESS_DENIED' });
    }
    if (!response.ok) {
      throw new BadGatewayException({ code: 'GITHUB_GIST_UNAVAILABLE' });
    }
    return response;
  }

  private async json(response: Response): Promise<unknown> {
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new BadGatewayException({ code: 'GITHUB_GIST_RESPONSE_INVALID' });
    }
    const decoder = new TextDecoder();
    let received = 0;
    let text = '';
    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- enforce the bound before allocating JSON.
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        received += chunk.value.byteLength;
        if (received > artifactLimit * 2 + 65_536) {
          // oxlint-disable-next-line no-await-in-loop -- release an oversized response immediately.
          await reader.cancel();
          throw new Error('response limit');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      return JSON.parse(text + decoder.decode()) as unknown;
    } catch {
      throw new BadGatewayException({ code: 'GITHUB_GIST_RESPONSE_INVALID' });
    } finally {
      reader.releaseLock();
    }
  }

  private async ownedGist(credential: GistCredential, id: string) {
    if (!/^[0-9a-f]{1,64}$/u.test(id)) {
      throw new BadRequestException({ code: 'GITHUB_GIST_ID_INVALID' });
    }
    const response = await this.request(`/gists/${id}`, credential.accessToken, { method: 'GET' });
    const gist = gistSchema.safeParse(await this.json(response));
    if (
      !gist.success ||
      gist.data.id !== id ||
      gist.data.owner.id !== credential.accountId ||
      Object.keys(gist.data.files).length !== 1 ||
      !Object.keys(gist.data.files).every((name) => filenames.some((known) => known === name))
    ) {
      throw new ForbiddenException({ code: 'GITHUB_GIST_NOT_OWNED_PUBLICATION' });
    }
    return gist.data;
  }
}
