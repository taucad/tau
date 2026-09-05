/**
 * NestJS DI token for the shared Stripe SDK client (BA6): the Better Auth
 * plugin, BillingService, and the top-up controller all use one instance.
 */
export const stripeClientKey = 'stripeClientKey';

/**
 * Redis cache key for a user's entitlements projection (wire form).
 */
export const entitlementsRedisKey = (userId: string): string => `tau:billing:entitlements:${userId}`;

/**
 * Redis hash key for a user's hot-path credit balances (owned by the B2 Lua
 * ledger; B1 only invalidates it after durable money-in writes).
 */
export const creditsRedisKey = (userId: string): string => `tau:credits:${userId}`;

/**
 * Redis hash key holding a user's in-flight reservations
 * (`reservationId → "amount:floor:expiresAtMs"`; expiry embedded, no TTL keys).
 */
export const creditsReservationRedisKey = (userId: string): string => `tau:credits:res:${userId}`;

/**
 * Redis key prefix for the free-tier daily turn counter (UTC day bucket).
 */
export const creditsTurnBucketRedisKey = (userId: string, utcDay: string): string =>
  `tau:credits:turns:${userId}:${utcDay}`;

/**
 * Reservation lifetime in milliseconds (Q9): a crashed stream's hold is
 * swept — charged its input floor, never free-released — after this window.
 */
export const reservationTtl = 5 * 60_000;

/**
 * Free-tier daily turn soft cap (Q1).
 */
export const freeTierDailyTurnCap = 10;

/**
 * Entitlements cache TTL. Webhook fan-out invalidates eagerly; the TTL only
 * bounds staleness when an invalidation is missed.
 */
export const entitlementsCacheTtlSeconds = 300;

/**
 * Monthly credit grants per tier in microdollars (AD16), with AD10 rollover
 * ceilings at 2x. Pro figures must match the plugin `limits` blob in
 * `better-auth.config.ts` (which imports these constants — one home).
 */
export const freeTierMonthlyGrantMicro = 500_000n; // $0.50 (Q1)
export const freeTierRolloverCeilingMicro = 1_000_000n;
export const proMonthlyGrantMicro = 20_000_000n; // $20 post-markup credit value (Q5)
export const proRolloverCeilingMicro = 40_000_000n;

/**
 * Credit-pack top-up bounds in cents (Q6): presets $5/$10/$25/$50/$100 in the
 * UI, custom $5–$500 — one bounded integer check covers both (presets are a
 * UI affordance, not a server contract).
 */
export const topupMinCents = 500;
export const topupMaxCents = 50_000;

/**
 * Hourly Checkout-session caps (C18 abuse bound): sessions are free to mint
 * but each carries Stripe-side cost and Radar surface.
 */
export const topupSessionsPerUserPerHour = 10;
export const topupSessionsPerIpPerHour = 20;

/**
 * Redis fixed-window key for top-up session rate limits (UTC hour bucket).
 */
export const topupRateLimitRedisKey = (scope: 'user' | 'ip', id: string, utcHour: string): string =>
  `tau:billing:topup:rl:${scope}:${id}:${utcHour}`;

/**
 * Typed WebSocket close codes for the Zoo proxy gate (B4/T2/AD9). Application
 * codes 4000–4999 are caller-defined per RFC 6455; the runtime's Zoo transport
 * maps these to sign-in/upgrade errors — keep the values in sync with
 * `packages/runtime/src/kernels/zoo/transport/zoo-websocket-transport.ts`.
 */
export const zooCloseCodes = {
  unauthenticated: 4401,
  insufficientCredits: 4402,
  entitlementRequired: 4403,
  idleTimeout: 4408,
} as const;

/**
 * Ledger line-item categories (AD14/C17). Spend rows only; grants and top-ups
 * are category-less credit.
 */
export const creditCategories = ['llm', 'zoo_engine', 'geospec_hosted', 'solver_orchestration'] as const;

/**
 * One ledger category.
 */
export type CreditCategory = (typeof creditCategories)[number];
