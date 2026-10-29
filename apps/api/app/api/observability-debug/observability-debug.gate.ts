/* oxlint-disable typescript-eslint/dot-notation -- environment index access required by TS4111 */

/** The environment the gate reads: `process.env`, or a test's subset of it. */
export type ObservabilityGateEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Whether this API serves the staging observability failure route (browser observability A12, SB13).
 *
 * Staging only, from configuration the deployment already has: Sentry must be configured (`SENTRY_DSN`) and its
 * environment must be exactly `staging` (`SENTRY_ENVIRONMENT`, the Fly secret that names the API's Sentry
 * environment, `telemetry/sentry.ts`). Production names another environment, so the route is not registered there
 * and answers 404 like any unknown path. There is no separate opt-in: none exists for the API, and the route only
 * throws.
 *
 * @param environment - The process environment, or the subset of it the gate reads.
 * @returns `true` only on a Sentry-reporting staging API.
 */
export const isObservabilityFailureRouteEnabled = (environment: ObservabilityGateEnvironment): boolean =>
  Boolean(environment['SENTRY_DSN']) && environment['SENTRY_ENVIRONMENT'] === 'staging';
