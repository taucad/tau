import type { FastifyInstance } from 'fastify';

/**
 * Extension ports of the auth module. Auth declares them and runs them at the
 * point where it used to call billing and hosts directly; the app binds them
 * (`apps/api/app/composition/auth-extensions.module.ts`). Each is optional, so
 * a self-hosted server without billing boots with none bound.
 */

/** Refuses or prepares an account deletion before anything is written. Bound to billing's account closure in Tau Cloud. */
export const accountDeletionGateToken = Symbol('AUTH_ACCOUNT_DELETION_GATE');

/** @see accountDeletionGateToken */
export type AccountDeletionGate = {
  prepareForAuthDeletion(input: { readonly authUserId: string; readonly request?: Request }): Promise<void>;
};

/** Work an account deletion runs once the gate has let it through, in the order bound. */
export const accountDeletionHooksToken = Symbol('AUTH_ACCOUNT_DELETION_HOOKS');

/**
 * One step of an accepted account deletion. `before-storage-tombstone` steps
 * run after the gate and before the storage tombstone is written;
 * `after-storage-tombstone` steps run last, once nothing can refuse.
 */
export type AccountDeletionHook = {
  readonly stage: 'before-storage-tombstone' | 'after-storage-tombstone';
  readonly run: (input: { readonly userId: string }) => Promise<void>;
};

/**
 * Shared counter for Better Auth's rate limits, so every API Machine counts the same requests. Bound to Redis in
 * the app; unbound (tests, a single local process) Better Auth keeps its in-memory counter.
 */
export const authRateLimitStoreToken = Symbol('AUTH_RATE_LIMIT_STORE');

/** @see authRateLimitStoreToken */
export type AuthRateLimitStore = {
  consume(input: { readonly key: string; readonly limit: number; readonly windowSeconds: number }): Promise<{
    readonly allowed: boolean;
    readonly retryAfterSeconds: number;
  }>;
};

/** Raw routes registered under the auth base path, ahead of the Better Auth wildcard. */
export const authRouteExtensionsToken = Symbol('AUTH_ROUTE_EXTENSIONS');

/** @see authRouteExtensionsToken */
export type AuthRouteExtension = {
  register(instance: FastifyInstance, basePath: string): void;
};
