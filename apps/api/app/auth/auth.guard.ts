import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Socket } from 'socket.io';
import { authInstanceKey, isOptionalAuth, isPublicAuth } from '#constants/auth.constant.js';

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
