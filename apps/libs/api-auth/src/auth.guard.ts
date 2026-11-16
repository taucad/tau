import type { IncomingMessage } from 'node:http';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isAuthoritativeSession, isOptionalAuth, isPublicAuth } from '#auth.constant.js';
import { hasAuthorizationHeader, SessionResolver } from '#session-resolver.js';
import { issuedOversizeSnapshot, sessionCookiePolicy } from '#session-cookie-policy.js';
import type { SessionResolution } from '#session-resolver.js';

/** A cloud host acting for its owner on one project's git routes (D21). */
export type HostDevicePrincipal = {
  readonly ownerId: string;
  readonly deviceId: string;
  readonly projectId: string;
};

/*
 * Keyed by the raw request object, so no header a client sends can forge an
 * entry: only server code holding the request can write one, and only the git
 * transport does (I10).
 */
const hostDevicePrincipals = new WeakMap<IncomingMessage, HostDevicePrincipal>();

/**
 * Admit one request as a cloud host. Called by the git transport alone, after
 * it resolved the repository-scoped credential and matched it to the route, so
 * every route the transport does not front never sees a host principal.
 *
 * @param rawRequest - The Node request the transport middleware received.
 * @param principal - The resolved host.
 */
export const attachHostDevice = (rawRequest: IncomingMessage, principal: HostDevicePrincipal): void => {
  hostDevicePrincipals.set(rawRequest, principal);
};

/**
 * The cloud host a request was admitted as, if any.
 *
 * @param rawRequest - The Node request (`FastifyRequest.raw`).
 * @returns The principal, or `undefined` for every other caller.
 */
export const hostDeviceOf = (rawRequest: IncomingMessage): HostDevicePrincipal | undefined =>
  hostDevicePrincipals.get(rawRequest);

/*
 * One resolution per request. Nest runs a class-level and a method-level guard
 * both, so a second run for the same request reads this entry and does no
 * lookup, appends no cookie and counts nothing. Keyed by the raw request, like
 * the host principals above.
 */
const resolutions = new WeakMap<IncomingMessage, SessionResolution>();

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionResolver) private readonly sessions: SessionResolver,
  ) {}

  /**
   * Validates if the current request is authenticated. WebSocket routes
   * authenticate in their own upgrade handlers, not through this guard.
   * Attaches session and user information to the request object
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthPublic = this.reflector.getAllAndOverride<boolean>(isPublicAuth, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isAuthPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    /* A cloud host acts for its owner (EQ5), and only where the git transport
     * admitted it; its credential is unknown to better-auth everywhere else. */
    const hostDevice = hostDeviceOf(request.raw);
    if (hostDevice !== undefined) {
      // @ts-expect-error -- request.session is not typed
      request.session = null;
      // @ts-expect-error -- request.user is not typed
      request.user = { id: hostDevice.ownerId };
      return true;
    }

    const resolution = await this.resolutionOf(context, request);
    const session =
      resolution.session === null || resolution.user === null
        ? null
        : { session: resolution.session, user: resolution.user };

    // @ts-expect-error -- request.session is not typed
    request.session = session;
    // @ts-expect-error -- request.user is not typed
    request.user = session?.user ?? null;

    // For optional auth, allow requests without sessions
    const isAuthOptional = this.reflector.getAllAndOverride<boolean>(isOptionalAuth, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isAuthOptional && !session) {
      return true;
    }

    if (!session) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
      });
    }

    return true;
  }

  private async resolutionOf(context: ExecutionContext, request: FastifyRequest): Promise<SessionResolution> {
    const raw = request.raw as IncomingMessage | undefined;
    const memoized = raw === undefined ? undefined : resolutions.get(raw);
    if (memoized !== undefined) {
      return memoized;
    }
    const authoritative = this.reflector.getAllAndOverride<boolean | undefined>(isAuthoritativeSession, [
      context.getHandler(),
      context.getClass(),
    ]);
    const resolution = await this.sessions.resolve({
      headers: request.headers,
      method: request.method,
      authoritative: authoritative === true,
    });
    if (raw !== undefined) {
      resolutions.set(raw, resolution);
    }
    await this.forwardSnapshot(context, request, resolution);
    return resolution;
  }

  /*
   * A Tau route forwards one thing only: an unchunked session snapshot with
   * exactly the configured Max-Age, or its expiry. Never a session_token set or
   * expiry, which could destroy a newer session (blueprint F5). Runs on the
   * first resolution of a request only, so a doubly guarded handler appends once.
   */
  private async forwardSnapshot(
    context: ExecutionContext,
    request: FastifyRequest,
    resolution: SessionResolution,
  ): Promise<void> {
    const maxAgeSeconds = this.sessions.maxAgeSeconds();
    if (maxAgeSeconds === 0 || resolution.setCookies.length === 0) {
      return;
    }
    const sessionDataName = await this.sessions.sessionDataName();
    const kept = sessionCookiePolicy({
      setCookies: resolution.setCookies,
      surface: 'tau',
      hasAuthorization: hasAuthorizationHeader(request.headers),
      sessionDataName,
      maxAgeSeconds,
    });
    if (issuedOversizeSnapshot(resolution.setCookies, sessionDataName)) {
      this.logger.debug('Dropped an oversize session snapshot');
    }
    if (kept.length === 0) {
      return;
    }
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    for (const entry of kept) {
      void reply.header('set-cookie', entry);
    }
    // A default only: a handler that sets its own Cache-Control replaces it.
    if (!reply.hasHeader('cache-control')) {
      void reply.header('cache-control', 'private, no-store');
    }
  }
}
