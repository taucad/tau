/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
/* oxlint-disable new-cap -- decorators are not constructors */
import { applyDecorators, createParamDecorator, SetMetadata, UseGuards } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { isPublicAuth, isOptionalAuth } from '#constants/auth.constant.js';
import { AuthGuard } from '#auth/auth.guard.js';
import type { AuthUser } from '#auth/auth.type.js';

/**
 * Compound decorator that applies authentication guard.
 * Use this on controllers or routes that require authentication.
 *
 * @example
 * ```typescript
 * \@UseAuth()
 * \@Controller('users')
 * export class UsersController {}
 * ```
 */
export const UseAuth = (): ReturnType<typeof applyDecorators> => applyDecorators(UseGuards(AuthGuard));

/**
 * Decorator to mark a route as publicly accessible (no authentication required)
 */
export const PublicAuth = (): ReturnType<typeof SetMetadata> => SetMetadata(isPublicAuth, true);

/**
 * Decorator to mark a route as having optional authentication
 * Route will still execute even if user is not authenticated
 */
export const OptionalAuth = (): ReturnType<typeof SetMetadata> => SetMetadata(isOptionalAuth, true);

/**
 * Parameter decorator to extract the authenticated user from the request.
 * Must be used with @UseAuth() or @UseGuards(AuthGuard) on the controller/route.
 *
 * @example
 * ```typescript
 * \@Get('me')
 * getProfile(@User() user: AuthUser) {
 *   return user;
 * }
 * ```
 *
 * @example With property extraction
 * ```typescript
 * \@Get('me/id')
 * getUserId(@User('id') userId: string) {
 *   return userId;
 * }
 * ```
 */
export const User = createParamDecorator(
  <K extends keyof AuthUser>(property: K | undefined, context: ExecutionContext): AuthUser | AuthUser[K] => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user: AuthUser }>();
    const { user } = request;

    if (property) {
      return user[property];
    }

    return user;
  },
);

/**
 * Like {@link User}, but returns `undefined` when there is no authenticated session.
 * Use only on routes marked {@link OptionalAuth}.
 */
export function readOptionalUser<K extends keyof AuthUser>(
  property: K | undefined,
  context: ExecutionContext,
): AuthUser | AuthUser[K] | undefined {
  const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
  const user = request.user ?? undefined;

  if (!user) {
    return undefined;
  }

  if (property) {
    return user[property];
  }

  return user;
}

export const OptionalUser = createParamDecorator(readOptionalUser);
