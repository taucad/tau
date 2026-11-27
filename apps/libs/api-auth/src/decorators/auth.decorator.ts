/* eslint-disable @typescript-eslint/naming-convention -- decorators are not constructors */
/* oxlint-disable new-cap -- decorators are not constructors */
import { applyDecorators, createParamDecorator, SetMetadata, UseGuards } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { isAuthoritativeSession, isPublicAuth, isOptionalAuth, isWebSessionRequired } from '#auth.constant.js';
import { AuthGuard, authClientOf } from '#auth.guard.js';
import type { AuthClientKind } from '#desktop-grant.js';
import type { AuthUser } from '#auth.type.js';

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
 * Marks a route or controller whose session must be read from the store on every request, never
 * from a session snapshot or a shared in-flight lookup. Required on any `GET` that mints something
 * outliving the request: a signed link, a presigned URL or a token.
 */
export const AuthoritativeSession = (): ReturnType<typeof SetMetadata> => SetMetadata(isAuthoritativeSession, true);

/**
 * Marks a route or controller that governs the account: it refuses Tau Desktop's OAuth access token with 403
 * `WEB_SESSION_REQUIRED` and answers web sessions as before (operator ruling D1=A: the desktop uses the account, and
 * account governance opens the web). Use it on routes that manage payment methods or standing payment consent, or
 * close the account.
 */
export const RequireWebSession = (): ReturnType<typeof SetMetadata> => SetMetadata(isWebSessionRequired, true);

/**
 * Parameter decorator for which kind of client the request authenticated as: `web` or `desktop`. For routes whose
 * answer differs for the desktop without refusing it outright.
 */
export const AuthClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthClientKind =>
    authClientOf(context.switchToHttp().getRequest<FastifyRequest>().raw),
);

/** The authenticated user and the kind of client it signed in with. */
export type AuthCaller = { readonly user: AuthUser; readonly client: AuthClientKind };

/**
 * Parameter decorator for {@link AuthCaller}: `@User()` and `@AuthClient()` in one parameter, for handlers that need
 * both. Must be used with `@UseAuth()`.
 */
export const Caller = createParamDecorator((_data: unknown, context: ExecutionContext): AuthCaller => {
  const request = context.switchToHttp().getRequest<FastifyRequest & { user: AuthUser }>();
  return { user: request.user, client: authClientOf(request.raw) };
});

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
