/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { isIPv4, isIPv6 } from 'node:net';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';
import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UseAuth } from '#auth/decorators/auth.decorator.js';
import { httpHeader } from '#constants/http-header.constant.js';
import { GitProxyQueryDto } from '#api/git/git.dto.js';

/** Only git's own smart-HTTP endpoints are reachable through the proxy. */
const gitEndpointPattern = /\/(?:info\/refs|git-upload-pack|git-receive-pack)$/u;

/**
 * The remote's credential travels in its own header, never in the query string
 * (I8, review 3 F5) and never in `Authorization` — that one is the caller's Tau
 * session and must not reach a third party. Declared in the shared header
 * catalogue so the CORS allow-list carries it and the logger redacts it.
 */
const proxyAuthorizationHeader = httpHeader.xTauProxyAuthorization;

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

/**
 * A hostname that merely *resolves* to a private address is not caught here:
 * closing that needs the socket pinned to the address the check saw, which is a
 * custom dispatcher rather than a predicate. Recorded as a residual — the
 * reachable set through this proxy is already narrowed to three git endpoints.
 */
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

/**
 * CORS proxy for browser clients talking to a third-party git remote
 * (architecture "Remotes"): a few dozen lines of forwarding, not a Tau
 * transport. Same-origin Tau Cloud pushes never come here.
 */
@Controller({ path: 'git', version: '1' })
@UseAuth()
export class GitProxyController {
  @Get('proxy')
  public async proxyGet(
    @Query() query: GitProxyQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.forward(query.url, request, reply);
  }

  @Post('proxy')
  public async proxyPost(
    @Query() query: GitProxyQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.forward(query.url, request, reply);
  }

  private async forward(rawUrl: string, request: FastifyRequest, reply: FastifyReply): Promise<StreamableFile> {
    const target = this.resolveTarget(rawUrl);
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

    let response = await fetch(target, {
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
      // oxlint-disable-next-line no-await-in-loop -- a redirect chain is sequential by definition
      response = await fetch(next, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: abort.signal,
      });
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

    if (target.protocol !== 'https:') {
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
    if (isBlockedHost(target.hostname)) {
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
