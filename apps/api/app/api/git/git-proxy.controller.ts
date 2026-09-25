/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- Nest request facets and relay identity remain explicit. */
import { isIPv4, isIPv6 } from 'node:net';
import type { LookupFunction } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Put,
  Param,
  PayloadTooLargeException,
  Query,
  Req,
  Res,
  StreamableFile,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { httpHeader } from '#constants/http-header.constant.js';
import { GitProxyQueryDto } from '#api/git/git.dto.js';
import { RedisService } from '#redis/redis.service.js';
import { z } from 'zod';

/** Only git's own smart-HTTP endpoints are reachable through the proxy. */
const gitEndpointPattern = /\/(?:info\/refs|git-upload-pack|git-receive-pack|info\/lfs\/objects\/batch)$/u;
const lfsBatchSuffix = '/info/lfs/objects/batch';
const lfsHandleTtlSeconds = 300;
const lfsBatchSchema = z
  .object({
    objects: z.array(
      z
        .object({
          oid: z.string().regex(/^[0-9a-f]{64}$/u),
          size: z.number().int().nonnegative(),
          actions: z
            .object({
              upload: z.object({ href: z.url(), header: z.record(z.string(), z.string()).optional() }).optional(),
              download: z.object({ href: z.url(), header: z.record(z.string(), z.string()).optional() }).optional(),
              verify: z.object({ href: z.url(), header: z.record(z.string(), z.string()).optional() }).optional(),
            })
            .optional(),
        })
        .loose(),
    ),
  })
  .loose();
type LfsRelayRecord = Readonly<{
  userId: string;
  oid: string;
  size: number;
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  expiresAt: number;
}>;
const lfsRelayRecordSchema = z.object({
  userId: z.string().min(1),
  oid: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.number().int().nonnegative(),
  url: z.url(),
  method: z.enum(['GET', 'POST', 'PUT']),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.number().int().positive(),
});
const relayHandlePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const relayKeyPattern = /^[\w-]{43}$/u;

/*
 * A relay record holds a third party's presigned URL and headers for five
 * minutes (D22). It is sealed with a key made for that one handle and handed
 * to the caller as an LFS action header, never stored: Redis alone holds only
 * ciphertext, the caller alone holds only a key, and the handle is the
 * additional data, so a sealed record cannot be replayed under another handle.
 */
export const sealRelayRecord = (handle: string, record: LfsRelayRecord): { sealed: string; key: string } => {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(handle));
  const body = Buffer.concat([cipher.update(JSON.stringify(record)), cipher.final()]);
  return {
    sealed: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'),
    key: key.toString('base64url'),
  };
};

const openRelayRecord = (handle: string, sealed: string, key: string): unknown => {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64url'), bytes.subarray(0, 12))
    .setAAD(Buffer.from(handle))
    .setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
};

/**
 * The remote's credential travels in its own header, never in the query string
 * (I8, review 3 F5) and never in `Authorization` — that one is the caller's Tau
 * session and must not reach a third party. Declared in the shared header
 * catalogue so the CORS allow-list carries it and the logger redacts it.
 */
const proxyAuthorizationHeader = httpHeader.xTauProxyAuthorization;
const refusedActionHeaders = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'set-cookie',
  'transfer-encoding',
  proxyAuthorizationHeader,
]);

/**
 * Addresses the API must not reach on a caller's behalf: loopback, the cloud
 * metadata service, and every private and carrier range the Fly network sits
 * in. Matched numerically rather than by string prefix, because the WHATWG URL
 * parser hands back `127.0.0.1` for `2130706433`, `0x7f.0.0.1` and
 * `017700000001` but hands back `::ffff:7f00:1` for the IPv4-mapped form.
 */
const blockedIpv4Ranges: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const toUint32 = (address: string): number =>
  address.split('.').reduce((total, octet) => total * 256 + Number(octet), 0);

const isBlockedIpv4 = (address: string): boolean =>
  blockedIpv4Ranges.some(([network, prefix]) => {
    // Arithmetic rather than bitwise (the workspace forbids bit operators):
    // a /8 match is "the same quotient by 2^(32 - prefix)".
    const block = 2 ** (32 - prefix);
    return Math.floor(toUint32(address) / block) === Math.floor(toUint32(network) / block);
  });

/**
 * The eight 16-bit groups of a valid IPv6 literal. A dotted IPv4 tail (the
 * resolver's `::ffff:127.0.0.1`) folds into the last two groups, so every
 * spelling of one address compares the same.
 */
const ipv6Groups = (address: string): number[] => {
  const text = address.replace(/%.*$/u, '');
  const dotted = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/u.exec(text)?.[1];
  const value = dotted === undefined ? 0 : toUint32(dotted);
  const hex =
    dotted === undefined
      ? text
      : `${text.slice(0, -dotted.length)}${Math.floor(value / 65_536).toString(16)}:${(value % 65_536).toString(16)}`;
  const [head = '', tail] = hex.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => '0'), ...right].map((group) =>
    Number.parseInt(group, 16),
  );
};

/**
 * The IPv4 address an IPv6 literal carries and a host may route to. In the low
 * 32 bits: IPv4-mapped `::ffff:a.b.c.d`, SIIT `::ffff:0:a.b.c.d`,
 * IPv4-compatible `::a.b.c.d` (which covers `::` and `::1`), and the NAT64
 * well-known prefix `64:ff9b::/96`. Right after the prefix: 6to4 `2002::/16`.
 */
const embeddedIpv4Prefixes = new Set(['0:0:0:0:0:0', '0:0:0:0:0:ffff', '0:0:0:0:ffff:0', '64:ff9b:0:0:0:0']);
const dottedIpv4 = (high = 0, low = 0): string =>
  [Math.floor(high / 256), high % 256, Math.floor(low / 256), low % 256].join('.');
const embeddedIpv4 = (groups: readonly number[]): string | undefined => {
  if (
    embeddedIpv4Prefixes.has(
      groups
        .slice(0, 6)
        .map((group) => group.toString(16))
        .join(':'),
    )
  ) {
    return dottedIpv4(groups[6], groups[7]);
  }
  return groups[0] === 0x20_02 ? dottedIpv4(groups[1], groups[2]) : undefined;
};

/** Fast refusal for literal/private host forms; DNS answers are checked and socket-pinned separately. */
const isBlockedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replaceAll(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }
  if (isIPv4(host)) {
    return isBlockedIpv4(host);
  }
  if (isIPv6(host)) {
    const groups = ipv6Groups(host);
    const embedded = embeddedIpv4(groups);
    if (embedded !== undefined) {
      return isBlockedIpv4(embedded);
    }
    const [first = 0, second = 0, third = 0] = groups;
    // Unique-local fc00::/7 (Fly's 6PN sits here), fe80::/10 link-local and fec0::/10 site-local, and the
    // local-use NAT64 prefix 64:ff9b:1::/48, which only a private translator routes and which may place its
    // IPv4 at any RFC 6052 offset.
    return (
      (first >= 0xfc_00 && first <= 0xfd_ff) ||
      (first >= 0xfe_80 && first <= 0xfe_ff) ||
      (first === 0x64 && second === 0xff_9b && third === 1)
    );
  }
  return false;
};

/** Redirect statuses git hosts actually use (`.git` suffix, org rename). */
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * Two hops is generous for the redirects a git host issues. Every hop is
 * re-checked by `resolveTarget`, so a redirect can never reach a host or a path
 * the original request could not.
 */
const maximumRedirectHops = 2;

const credentialQueryKeys = new Set(['access_token', 'token', 'authorization', 'password', 'api_key', 'apikey']);

/**
 * How long an upstream git host may take to answer before the socket is
 * destroyed. Without it a slow or hostile remote pinned an API connection for
 * as long as the browser stayed on the page (review C31). Generous, because a
 * large `git-upload-pack` negotiation against a busy host is legitimately slow;
 * it bounds the pathological case, not the normal one.
 */
const upstreamTimeoutMilliseconds = 60 * 1000;

/**
 * The most a signed-in caller may stream through the proxy into a third-party
 * git host in one request. Fastify's `bodyLimit` does not reach the git content
 * types (they are parsed as a raw stream), so this is the whole of the bound.
 */
const proxyRequestLimitBytes = 512 * 1024 * 1024;

/** A verify action's body is `{oid, size}`; anything near this is not one. */
const lfsVerifyLimitBytes = 64 * 1024;

/**
 * Proxied requests one user may make per minute. A 2 s sync debounce with a
 * push's three or four requests is ~120, so this bounds abuse without touching
 * a busy session. The LFS relay is not counted: it only reaches actions an
 * upstream batch answer issued.
 */
const proxyRequestsPerUserPerMinute = 600;

/** The fixed-window counter `repositories.service.ts` uses for its per-IP limits. */
const incrementWithExpiryLua = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

const lfsMediaType = 'application/vnd.git-lfs+json';

/**
 * The caller's `Accept` when it asks for the git-lfs media type, which the LFS
 * batch and verify endpoints require (a server may answer a wildcard with `406`).
 *
 * @param request - The incoming request.
 * @returns The header to forward, or undefined to keep the proxy's own.
 */
const lfsAccept = (request: FastifyRequest): string | undefined => {
  const { accept } = request.headers;
  return typeof accept === 'string' && accept.split(';')[0]?.trim().toLowerCase() === lfsMediaType ? accept : undefined;
};

/**
 * The request body, with a ceiling, reusing the shape the LFS relay already
 * uses for its exact-size check below.
 *
 * The git module parses `application/vnd.git-lfs+json` for its own LFS
 * endpoints, which drains the raw stream first; that body is forwarded as the
 * JSON it was, or the upstream receives nothing (D43).
 *
 * @param request - The incoming request.
 * @param limitBytes - The most it may carry.
 * @returns A stream that fails once the ceiling is passed.
 */
const boundedBody = (request: FastifyRequest, limitBytes: number): Readable =>
  Readable.from(
    (async function* (): AsyncGenerator<Uint8Array<ArrayBuffer>> {
      let received = 0;
      const parsed = request.body !== undefined && !(request.body instanceof Readable);
      for await (const chunk of parsed ? [Buffer.from(JSON.stringify(request.body))] : request.raw) {
        const bytes = Uint8Array.from(chunk as Uint8Array<ArrayBuffer>);
        received += bytes.byteLength;
        if (received > limitBytes) {
          throw new PayloadTooLargeException({ code: 'GIT_PROXY_REQUEST_TOO_LARGE' });
        }
        yield bytes;
      }
    })(),
  );

/**
 * One answer for every way the upstream failed to answer (socket, TLS,
 * timeout, a body cut short), so a refusal cannot tell a closed port from a
 * slow host (D21).
 *
 * @returns Never.
 * @throws BadGatewayException `GIT_PROXY_UPSTREAM_FAILED`.
 */
const upstreamFailed = (): never => {
  throw new BadGatewayException({ code: 'GIT_PROXY_UPSTREAM_FAILED', message: 'The git host did not answer' });
};

const pinnedFetch = async (target: URL, address: LookupAddress, init: RequestInit): Promise<Response> =>
  new Promise<Response>((resolve, reject) => {
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
      target,
      {
        method: init.method,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        /* Node's connect asks with `all: true` (happy-eyeballs) and then wants an
         * address list; a bare address fails as `ERR_INVALID_IP_ADDRESS` (D32). */
        lookup: ((_hostname, options, callback) => {
          if (options.all === true) {
            callback(null, [{ address: address.address, family: address.family }]);
          } else {
            callback(null, address.address, address.family);
          }
        }) satisfies LookupFunction,
      },
      (response) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(name, item);
            }
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        resolve(
          new Response(Readable.toWeb(response) as unknown as ReadableStream, {
            status: response.statusCode ?? 502,
            statusText: response.statusMessage,
            headers,
          }),
        );
      },
    );
    request.once('error', reject);
    request.setTimeout(upstreamTimeoutMilliseconds, () => {
      request.destroy(new Error('The upstream git host did not answer in time.'));
    });
    const abort = (): void => {
      request.destroy(new DOMException('The upstream request was aborted.', 'AbortError'));
    };
    if (init.signal?.aborted === true) {
      abort();
    } else {
      init.signal?.addEventListener('abort', abort, { once: true });
    }
    if (init.body instanceof ReadableStream) {
      const body = Readable.fromWeb(init.body as unknown as WebReadableStream);
      // `pipe` leaves the request open when its source fails, so an over-limit
      // body waited out the upstream timeout instead of answering its own 413.
      body.once('error', (error) => {
        request.destroy(error);
      });
      body.pipe(request);
    } else {
      request.end(init.body as string | Uint8Array<ArrayBuffer> | undefined);
    }
  });

/**
 * CORS proxy for browser clients talking to a third-party git remote
 * (architecture "Remotes"): a few dozen lines of forwarding, not a Tau
 * transport. Same-origin Tau Cloud pushes never come here.
 */
@Controller({ path: 'git', version: '1' })
@UseAuth()
export class GitProxyController {
  /**
   * Ruling P50: an operator env relaxes the scheme and private-address
   * refusals so charter AC18's local `git http-backend` can be driven through
   * the product. Read once, here, and announced every boot — the environment
   * schema refuses the value outright in production, so this can only ever be a
   * developer's or an end-to-end run's machine.
   */
  readonly #allowPrivate: boolean;
  readonly #apiUrl: string;

  public constructor(
    configService: ConfigService<Environment, true>,
    private readonly redis: RedisService,
    @Optional() @Inject('GIT_PROXY_FETCH') private readonly injectedFetch?: typeof globalThis.fetch,
  ) {
    this.#allowPrivate = configService.get('TAU_GIT_REMOTE_ALLOW_PRIVATE', { infer: true }) === '1';
    this.#apiUrl = configService.get('TAU_API_URL', { infer: true }).replace(/\/+$/u, '');
    if (this.#allowPrivate) {
      new Logger(GitProxyController.name).warn(
        'TAU_GIT_REMOTE_ALLOW_PRIVATE=1: the git proxy will reach http:// and private addresses. Development only.',
      );
    }
  }

  @Get('proxy')
  public async proxyGet(
    @User('id') userId: string,
    @Query() query: GitProxyQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.forward(query.url, request, reply, userId);
  }

  @Post('proxy')
  public async proxyPost(
    @User('id') userId: string,
    @Query() query: GitProxyQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.forward(query.url, request, reply, userId);
  }

  @Get('lfs/:handle')
  public async relayGet(
    @User('id') userId: string,
    @Param('handle') handle: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.relay(handle, 'GET', userId, request, reply);
  }

  @Post('lfs/:handle')
  public async relayPost(
    @User('id') userId: string,
    @Param('handle') handle: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.relay(handle, 'POST', userId, request, reply);
  }

  @Put('lfs/:handle')
  public async relayPut(
    @User('id') userId: string,
    @Param('handle') handle: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.relay(handle, 'PUT', userId, request, reply);
  }

  private async forward(
    rawUrl: string,
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
  ): Promise<StreamableFile> {
    let target = this.resolveTarget(rawUrl);
    await this.consumeRequestSlot(userId);
    const proxyAuthorization = request.headers[proxyAuthorizationHeader];
    const accept = lfsAccept(request);
    const headers = new Headers({
      /* GitHub's LFS API answers any `git/…` agent with an HTML 403 (D42). */
      'user-agent': accept === undefined ? 'git/tau-proxy' : 'git-lfs/tau-proxy',
      accept: accept ?? '*/*',
    });
    if (typeof proxyAuthorization === 'string') {
      headers.set('authorization', proxyAuthorization);
    }
    const contentType = request.headers['content-type'];
    if (typeof contentType === 'string') {
      headers.set('content-type', contentType);
    }

    const abort = new AbortController();
    reply.raw.once('close', () => {
      abort.abort();
    });

    let response = await this.fetchTarget(target, {
      method: request.method,
      headers,
      ...(request.method === 'POST'
        ? {
            body: Readable.toWeb(boundedBody(request, proxyRequestLimitBytes)) as ReadableStream,
            duplex: 'half',
          }
        : {}),
      redirect: 'manual',
      signal: abort.signal,
    } as RequestInit);

    for (let hop = 0; redirectStatuses.has(response.status); hop += 1) {
      const location = response.headers.get('location');
      if (location === null) {
        break;
      }
      // A Location no URL parser accepts is the remote's fault, not the caller's.
      const moved = URL.parse(location, target) ?? upstreamFailed();
      if (typeof proxyAuthorization === 'string') {
        return this.redirectedCredential(moved, reply);
      }
      if (hop >= maximumRedirectHops) {
        throw new BadGatewayException({
          code: 'GIT_PROXY_TOO_MANY_REDIRECTS',
          message: 'The remote redirected too many times',
        });
      }
      if (request.method !== 'GET') {
        // The request body is a consumed stream; replaying it is not possible
        // and silently dropping it would corrupt a push.
        throw new BadGatewayException({
          code: 'GIT_PROXY_REDIRECTED_BODY',
          message: 'The remote redirected a request with a body; re-issue against the final URL',
        });
      }
      // Every hop is re-checked: scheme, credentials, host range and git path.
      // A redirect that carried a credential was refused above, so there is
      // none left to drop here.
      const next = this.resolveTarget(moved.toString());
      // oxlint-disable-next-line no-await-in-loop -- a redirect chain is sequential by definition
      response = await this.fetchTarget(next, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: abort.signal,
      });
      target = next;
    }

    if (target.pathname.endsWith(lfsBatchSuffix) && response.ok) {
      return this.relayLfsBatch(response, userId, reply);
    }

    void reply.status(response.status);
    for (const header of ['content-type', 'content-encoding', 'cache-control']) {
      const value = response.headers.get(header);
      if (value !== null) {
        void reply.header(header, value);
      }
    }

    return new StreamableFile(
      response.body === null ? Readable.from([]) : Readable.fromWeb(response.body as unknown as WebReadableStream),
    );
  }

  /**
   * Answer an LFS batch with every signed action replaced by a short-lived,
   * user-bound relay handle, so the third party's presigned URL and headers
   * never reach the browser.
   *
   * @param response - The upstream batch answer.
   * @param userId - The caller the handles are bound to.
   * @param reply - The caller's reply.
   * @returns The rewritten batch body.
   */
  private async relayLfsBatch(response: Response, userId: string, reply: FastifyReply): Promise<StreamableFile> {
    const answer = lfsBatchSchema.safeParse(await response.json().catch(upstreamFailed));
    const parsed = answer.success ? answer.data : upstreamFailed();
    for (const object of parsed.objects) {
      for (const [name, method] of [
        ['upload', 'PUT'],
        ['download', 'GET'],
        ['verify', 'POST'],
      ] as const) {
        const action = object.actions?.[name];
        if (action === undefined) {
          continue;
        }
        const actionUrl = new URL(action.href);
        if (
          actionUrl.protocol !== 'https:' ||
          actionUrl.username !== '' ||
          actionUrl.password !== '' ||
          (actionUrl.port !== '' && !this.#allowPrivate)
        ) {
          throw new BadGatewayException({ code: 'GIT_LFS_ACTION_REFUSED' });
        }
        // oxlint-disable-next-line no-await-in-loop -- each action URL is an independent SSRF boundary.
        await this.publicAddress(actionUrl);
        const handle = randomUUID();
        const headers = Object.fromEntries(
          Object.entries(action.header ?? {}).filter(([header]) => !refusedActionHeaders.has(header.toLowerCase())),
        );
        const record: LfsRelayRecord = {
          userId,
          oid: object.oid,
          size: object.size,
          url: actionUrl.toString(),
          method,
          headers,
          expiresAt: Date.now() + lfsHandleTtlSeconds * 1000,
        };
        const { sealed, key } = sealRelayRecord(handle, record);
        // oxlint-disable-next-line no-await-in-loop -- each independently expiring action needs its own opaque handle.
        await this.redis.client.set(`git:lfs:relay:${handle}`, sealed, 'EX', lfsHandleTtlSeconds, 'NX');
        action.href = `${this.#apiUrl}/v1/git/lfs/${handle}`;
        action.header = { [httpHeader.xTauLfsKey]: key };
      }
    }
    void reply.status(response.status).header('content-type', lfsMediaType).header('cache-control', 'no-store');
    return new StreamableFile(Buffer.from(JSON.stringify(parsed)));
  }

  /**
   * Refuse a redirect on a request that carried a credential (D11).
   *
   * A GitHub App installation token is scoped to one *repository*, and a
   * renamed or transferred repository redirects to a different path on the
   * same origin — so dropping the credential only when the origin changed
   * replayed a repository-scoped token at a repository it was never issued for
   * (review C33, policy Rule 11). A credential follows nothing: the client
   * learns where the repository went, re-resolves it by its stable id and asks
   * the user before re-issuing. The target passes the same checks as any hop
   * and loses its query (a signed redirect's token) and userinfo before it is
   * echoed; a target that fails those checks is refused with the same code and
   * no `location`, never with a refusal that reads as the caller's own URL.
   * Answered here, not thrown: the global filter keeps only `code` and the
   * message, and the client needs `location`.
   *
   * @param moved - Where the remote redirected to.
   * @param reply - The caller's reply.
   * @returns The typed `409` body.
   */
  private redirectedCredential(moved: URL, reply: FastifyReply): StreamableFile {
    moved.username = '';
    moved.password = '';
    moved.search = '';
    moved.hash = '';
    let location: string | undefined;
    try {
      location = this.resolveTarget(moved.toString()).toString();
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }
    }
    void reply
      .status(HttpStatus.CONFLICT)
      .header('content-type', 'application/json')
      .header('cache-control', 'no-store');
    return new StreamableFile(
      Buffer.from(
        JSON.stringify({
          statusCode: HttpStatus.CONFLICT,
          code: 'GIT_PROXY_REDIRECTED_CREDENTIAL',
          error: 'The repository moved; confirm its new location before sending the credential there',
          ...(location === undefined ? {} : { location }),
        }),
      ),
    );
  }

  private async relay(
    handle: string,
    method: 'GET' | 'POST' | 'PUT',
    userId: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<StreamableFile> {
    if (!relayHandlePattern.test(handle)) {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_INVALID' });
    }
    const key = request.headers[httpHeader.xTauLfsKey];
    if (typeof key !== 'string' || !relayKeyPattern.test(key)) {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_REFUSED' });
    }
    const sealed = await this.redis.client.get(`git:lfs:relay:${handle}`);
    if (sealed === null) {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_EXPIRED' });
    }
    let opened: unknown;
    try {
      opened = openRelayRecord(handle, sealed, key);
    } catch {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_REFUSED' });
    }
    const record = lfsRelayRecordSchema.parse(opened);
    if (record.userId !== userId || record.method !== method || record.expiresAt <= Date.now()) {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_REFUSED' });
    }
    const target = new URL(record.url);
    const headers = new Headers(record.headers);
    /* The pinned request sends no agent of its own, and GitHub's LFS verify
     * refuses an anonymous one with an HTML 403 (D45). */
    if (!headers.has('user-agent')) {
      headers.set('user-agent', 'git-lfs/tau-proxy');
    }
    /* A presigned S3 PUT refuses a chunked body with 501; the sealed size is
     * the length, and the stream below enforces it (D46). */
    if (method === 'PUT') {
      headers.set('content-length', String(record.size));
    }
    const contentType = request.headers['content-type'];
    if (typeof contentType === 'string' && !headers.has('content-type')) {
      headers.set('content-type', contentType);
    }
    const accept = lfsAccept(request);
    if (accept !== undefined && !headers.has('accept')) {
      headers.set('accept', accept);
    }
    const body =
      method === 'PUT'
        ? Readable.from(
            (async function* (): AsyncGenerator<Uint8Array<ArrayBuffer>> {
              let received = 0;
              for await (const chunk of request.raw) {
                const bytes = Uint8Array.from(chunk as Uint8Array<ArrayBuffer>);
                received += bytes.byteLength;
                if (received > record.size) {
                  throw new BadRequestException({ code: 'GIT_LFS_OBJECT_TOO_LARGE' });
                }
                yield bytes;
              }
              if (received !== record.size) {
                throw new BadRequestException({ code: 'GIT_LFS_OBJECT_SIZE_MISMATCH' });
              }
            })(),
          )
        : boundedBody(request, lfsVerifyLimitBytes);
    const response = await this.fetchTarget(target, {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: Readable.toWeb(body) as ReadableStream, duplex: 'half' }),
      redirect: 'error',
    } as RequestInit);
    void reply.status(response.status);
    for (const header of ['content-type', 'content-length', 'etag']) {
      const value = response.headers.get(header);
      if (value !== null) {
        void reply.header(header, value);
      }
    }
    return new StreamableFile(
      response.body === null ? Readable.from([]) : Readable.fromWeb(response.body as unknown as WebReadableStream),
    );
  }

  private async fetchTarget(target: URL, init: RequestInit): Promise<Response> {
    const address = await this.publicAddress(target);
    try {
      return await (this.injectedFetch === undefined
        ? pinnedFetch(target, address, init)
        : this.injectedFetch(target, init));
    } catch (error) {
      /* A refusal of the caller's own body (over its limit, wrong size) is
         the caller's answer; undici wraps it as the `cause`. */
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error && error.cause instanceof HttpException) {
        throw error.cause;
      }
      // The caller gets one uniform answer (D21); the operator still needs the cause (D32).
      new Logger(GitProxyController.name).warn(
        {
          host: target.host,
          code: (error as { code?: unknown }).code,
          reason: error instanceof Error ? error.message : 'unknown',
        },
        'Git proxy upstream request failed',
      );
      return upstreamFailed();
    }
  }

  /**
   * Take one of the caller's proxied requests for this minute (D21).
   *
   * @param userId - The signed-in caller.
   * @throws HttpException 429 `GIT_PROXY_RATE_LIMITED` once the minute's budget is spent.
   */
  private async consumeRequestSlot(userId: string): Promise<void> {
    const minute = new Date().toISOString().slice(0, 16);
    const count = await this.redis.client.eval(incrementWithExpiryLua, 1, `git:proxy:rl:${userId}:${minute}`, '60');
    if (Number(count) > proxyRequestsPerUserPerMinute) {
      throw new HttpException(
        { code: 'GIT_PROXY_RATE_LIMITED', message: 'Too many git requests; try again in a minute' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async publicAddress(target: URL): Promise<LookupAddress> {
    const hostname = target.hostname.replaceAll(/^\[|\]$/gu, '');
    if (isIPv4(hostname) || isIPv6(hostname)) {
      if (!this.#allowPrivate && isBlockedHost(hostname)) {
        throw new BadRequestException({ code: 'GIT_PROXY_HOST_REFUSED', message: 'Refused host address' });
      }
      return { address: hostname, family: isIPv6(hostname) ? 6 : 4 };
    }
    let addresses: LookupAddress[];
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadGatewayException({ code: 'GIT_PROXY_DNS_FAILED' });
    }
    if (addresses.length === 0 || (!this.#allowPrivate && addresses.some(({ address }) => isBlockedHost(address)))) {
      throw new BadRequestException({ code: 'GIT_PROXY_HOST_REFUSED', message: 'Refused host address' });
    }
    const [address] = addresses;
    if (address === undefined) {
      throw new BadGatewayException({ code: 'GIT_PROXY_DNS_FAILED' });
    }
    return address;
  }

  private resolveTarget(rawUrl: string): URL {
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      throw new BadRequestException({
        code: 'GIT_PROXY_URL_INVALID',
        message: 'Not a URL',
      });
    }

    if (target.protocol !== 'https:' && !(this.#allowPrivate && target.protocol === 'http:')) {
      throw new BadRequestException({
        code: 'GIT_PROXY_URL_INVALID',
        message: 'Only https remotes are proxied',
      });
    }
    if (target.username !== '' || target.password !== '') {
      throw new BadRequestException({
        code: 'GIT_PROXY_CREDENTIAL_IN_URL',
        message: `Put the remote credential in the ${proxyAuthorizationHeader} header, not the URL`,
      });
    }
    for (const key of target.searchParams.keys()) {
      if (credentialQueryKeys.has(key.toLowerCase())) {
        throw new BadRequestException({
          code: 'GIT_PROXY_CREDENTIAL_IN_URL',
          message: `Put the remote credential in the ${proxyAuthorizationHeader} header, not the query string`,
        });
      }
    }
    if (!this.#allowPrivate && isBlockedHost(target.hostname)) {
      throw new BadRequestException({
        code: 'GIT_PROXY_HOST_REFUSED',
        message: 'Refused host',
      });
    }
    // The URL parser drops `:443`, so any port left is a non-default one: a
    // port scanner, not a git host (D21). Local development keeps any port.
    if (target.port !== '' && !this.#allowPrivate) {
      throw new BadRequestException({
        code: 'GIT_PROXY_PORT_REFUSED',
        message: 'Only the default https port is proxied',
      });
    }
    if (!gitEndpointPattern.test(target.pathname)) {
      throw new BadRequestException({
        code: 'GIT_PROXY_PATH_REFUSED',
        message: 'Only git smart-HTTP endpoints are proxied',
      });
    }
    return target;
  }
}
