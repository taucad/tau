/**
 * The HTTP hop's connection timing (DC1 review S6), shared by both ends so the
 * client always gives up an idle connection before the server does.
 */

/**
 * How long tau-storage keeps an idle keep-alive connection open (Node's
 * default is 5 s). Above {@link forwardFreeSocketTimeoutMilliseconds}, so a
 * direct connection (local stacks, the suites) is never reused as the worker
 * closes it. Through Flycast the API's connection ends at Fly's proxy, so
 * this does not govern the API's pool there; the 30 s free-socket timeout
 * does, and a reset on a reused connection is retried only when it is safe.
 */
export const storageKeepAliveTimeoutMilliseconds = 65_000;

/** How long tau-api keeps an idle connection to tau-storage in its pool. */
export const forwardFreeSocketTimeoutMilliseconds = 30_000;

/**
 * How long one forwarded request may sit with no byte moving either way:
 * Fly's `idle_timeout` on both apps' services (600 s), which would cut the
 * connection there anyway. A push's quiet commit phase (5 min at most) fits
 * inside it.
 */
export const forwardIdleTimeoutMilliseconds = 600_000;
