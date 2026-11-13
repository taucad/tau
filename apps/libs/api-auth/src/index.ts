/** Public API of `@taucad/api-auth`. Narrower modules have their own subpath (see package.json). */
export * from '#auth.guard.js';
export * from '#auth.service.js';
export type * from '#auth.type.js';
export * from '#better-auth.service.js';
export * from '#session-resolver.js';
export * from '#decorators/auth.decorator.js';
export * from '#email-domain-allowlist.js';
// Every constant except the instance token, which stays inside api-auth (tests take it from ./testing).
export {
  afterHookKey,
  beforeHookKey,
  hookKey,
  isAuthoritativeSession,
  isOptionalAuth,
  isPublicAuth,
} from '#auth.constant.js';
export * from '#auth-extensions.js';
