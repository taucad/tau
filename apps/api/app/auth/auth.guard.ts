import type { IncomingMessage } from 'node:http';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Socket } from 'socket.io';
import { authInstanceKey, isOptionalAuth, isPublicAuth } from '#constants/auth.constant.js';

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

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(authInstanceKey) private readonly auth: Auth,
  ) {}

  /**
   * Validates if the current request is authenticated for all REST & Websockets
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

    const contextType = context.getType();

    if (contextType === 'ws') {
      const socket = context.switchToWs().getClient<Socket>();
      try {
        const session = await this.auth.api.getSession({
          headers: fromNodeHeaders(socket.handshake.headers),
        });
        // @ts-expect-error -- socket.session is not typed
        socket.session = session;
      } catch {
        socket.disconnect();
        return false;
      }

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

    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

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
}
