/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- Nest request facets and relay identity remain explicit. */
import { isIPv4, isIPv6 } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { randomUUID } from 'node:crypto';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Put,
  Param,
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
  repositoryUrl: string;
  oid: string;
  size: number;
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  expiresAt: number;
}>;
const lfsRelayRecordSchema = z.object({
  userId: z.string().min(1),
  repositoryUrl: z.url(),
  oid: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.number().int().nonnegative(),
  url: z.url(),
  method: z.enum(['GET', 'POST', 'PUT']),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.number().int().positive(),
});
const relayHandlePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

/** `::ffff:127.0.0.1` and `::ffff:7f00:1` are the same address. */
const mappedIpv4 = (address: string): string | undefined => {
  const match = /^::ffff:(.+)$/u.exec(address);
  if (match === null) {
    return undefined;
  }
  const rest = match[1] ?? '';
  if (isIPv4(rest)) {
    return rest;
  }
  const groups = /^([\da-f]{1,4}):([\da-f]{1,4})$/u.exec(rest);
  if (groups === null) {
    return undefined;
  }
  const high = Number.parseInt(groups[1] ?? '0', 16);
  const low = Number.parseInt(groups[2] ?? '0', 16);
  return [Math.floor(high / 256), high % 256, Math.floor(low / 256), low % 256].join('.');
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
    const mapped = mappedIpv4(host);
    if (mapped !== undefined) {
      return isBlockedIpv4(mapped);
    }
    return host === '::1' || host === '::' || /^f[cd]/u.test(host) || /^fe[89ab]/u.test(host);
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

const pinnedFetch = async (target: URL, address: LookupAddress, init: RequestInit): Promise<Response> =>
  new Promise<Response>((resolve, reject) => {
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
      target,
      {
        method: init.method,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        lookup: (_hostname, _options, callback) => {
          callback(null, address.address, address.family);
        },
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
    const abort = (): void => {
      request.destroy(new DOMException('The upstream request was aborted.', 'AbortError'));
    };
    if (init.signal?.aborted === true) {
      abort();
    } else {
      init.signal?.addEventListener('abort', abort, { once: true });
    }
    if (init.body instanceof ReadableStream) {
      Readable.fromWeb(init.body as unknown as WebReadableStream).pipe(request);
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
    const proxyAuthorization = request.headers[proxyAuthorizationHeader];
    const headers = new Headers({
      'user-agent': 'git/tau-proxy',
      accept: '*/*',
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
            body: Readable.toWeb(request.raw) as ReadableStream,
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
      const next = this.resolveTarget(new URL(location, target).toString());
      if (next.origin !== target.origin) {
        headers.delete('authorization');
      }
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
      const parsed = lfsBatchSchema.parse(await response.json());
      const repositoryUrl = new URL(target);
      repositoryUrl.pathname = repositoryUrl.pathname.slice(0, -lfsBatchSuffix.length);
      repositoryUrl.search = '';
      repositoryUrl.hash = '';
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
          if (actionUrl.protocol !== 'https:' || actionUrl.username !== '' || actionUrl.password !== '') {
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
            repositoryUrl: repositoryUrl.toString(),
            oid: object.oid,
            size: object.size,
            url: actionUrl.toString(),
            method,
            headers,
            expiresAt: Date.now() + lfsHandleTtlSeconds * 1000,
          };
          // oxlint-disable-next-line no-await-in-loop -- each independently expiring action needs its own opaque handle.
          await this.redis.client.set(
            `git:lfs:relay:${handle}`,
            JSON.stringify(record),
            'EX',
            lfsHandleTtlSeconds,
            'NX',
          );
          action.href = `${this.#apiUrl}/v1/git/lfs/${handle}`;
          action.header = {};
        }
      }
      void reply
        .status(response.status)
        .header('content-type', 'application/vnd.git-lfs+json')
        .header('cache-control', 'no-store');
      return new StreamableFile(Buffer.from(JSON.stringify(parsed)));
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
    const raw = await this.redis.client.get(`git:lfs:relay:${handle}`);
    if (raw === null) {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_EXPIRED' });
    }
    const record = lfsRelayRecordSchema.parse(JSON.parse(raw));
    if (record.userId !== userId || record.method !== method || record.expiresAt <= Date.now()) {
      throw new BadRequestException({ code: 'GIT_LFS_HANDLE_REFUSED' });
    }
    const target = new URL(record.url);
    const headers = new Headers(record.headers);
    const contentType = request.headers['content-type'];
    if (typeof contentType === 'string' && !headers.has('content-type')) {
      headers.set('content-type', contentType);
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
        : request.raw;
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
    return this.injectedFetch === undefined ? pinnedFetch(target, address, init) : this.injectedFetch(target, init);
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
    if (!gitEndpointPattern.test(target.pathname)) {
      throw new BadRequestException({
        code: 'GIT_PROXY_PATH_REFUSED',
        message: 'Only git smart-HTTP endpoints are proxied',
      });
    }
    return target;
  }
}
