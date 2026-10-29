/**
 * Sentry error reporting (launch gate OBS-7).
 *
 * Errors only: no tracing, no profiling and no request bodies, cookies or headers. Traces stay with the
 * OpenTelemetry SDK in `otel.ts`, so Sentry is told to skip its own OpenTelemetry setup and runs with an explicit
 * integration list instead of its defaults, which would patch `http` a second time.
 *
 * Inert unless `SENTRY_DSN` is set. The DSN and `SENTRY_ENVIRONMENT` are Fly secrets written by
 * `module.fly_api_secrets` in tau-cloud, never values in this repository.
 */
/* oxlint-disable typescript-eslint/dot-notation -- process.env index access required by TS4111 (verbatimModuleSyntax) */
import process from 'node:process';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';

/**
 * Drop what a request can carry that must not leave the process: the query string (OAuth `code` and `state`,
 * verification tokens), every header, cookie and body, and the user.
 *
 * @param event - The event Sentry is about to send.
 * @returns The same event, scrubbed.
 */
export const scrubSentryEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    const { url } = event.request;
    event.request = {
      method: event.request.method,
      ...(url === undefined ? {} : { url: url.split(/[?#]/u, 1)[0] }),
    };
  }
  delete event.user;
  return event;
};

/**
 * Keep the image name and immutable tag/digest without registry path separators,
 * which Sentry rejects in release identifiers.
 *
 * @param imageReference - The Fly deployment image reference, when deployed.
 * @returns The release identifier, or undefined for local runs without an image.
 */
export const getSentryRelease = (imageReference: string | undefined): string | undefined =>
  imageReference?.split('/').at(-1);

const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'],
    release: getSentryRelease(process.env['FLY_IMAGE_REF']),
    serverName: process.env['FLY_MACHINE_ID'],
    skipOpenTelemetrySetup: true,
    sendDefaultPii: false,
    defaultIntegrations: false,
    // Do not content-deduplicate across requests: identical failures still need their own correlation ids.
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.nodeContextIntegration(),
      // A crash still exits the process (the API's unhandled-rejection handler rethrows into this path); the
      // integration only reports it and flushes first.
      Sentry.onUncaughtExceptionIntegration(),
    ],
    beforeSend: scrubSentryEvent,
  });
}

/**
 * The git 503 codes a client is told to retry, because the condition clears by itself: another lease of the same
 * owner finishing, disk freed by a finished lease, a lost manifest race, or a drain before restart.
 *
 * They are capacity working as designed, so they are logged as warnings and counted, never reported as Sentry
 * errors (Hosted Remote Storage X3, DA1). `GIT_REPOSITORY_INCOMPLETE` is deliberately absent: retrying cannot
 * clear it. A 503 with any other code, or none, is still reported.
 */
export const retryableGitRefusalCodes: ReadonlySet<string> = new Set([
  'GIT_LEASE_OWNER_BUSY',
  'GIT_LEASE_DISK_FULL',
  'GIT_PUSH_RACE_LOST',
  'GIT_SERVICE_RESTARTING',
]);

/**
 * Whether a failed request is a retryable git refusal rather than a server error.
 *
 * @param statusCode - The HTTP status the request is answered with.
 * @param code - The refusal's `code`, when it has one.
 * @returns True only for a 503 whose code is in {@link retryableGitRefusalCodes}.
 */
export const isRetryableGitRefusal = (statusCode: number, code: unknown): boolean =>
  statusCode === 503 && typeof code === 'string' && retryableGitRefusalCodes.has(code);

/**
 * Report a server error. A no-op when Sentry is not configured.
 *
 * Per-event fields go in the capture context, never on a scope: a scope set* call outlives the event when no
 * scope was forked, which is how a readiness warning's fields once reached an unrelated exception (TAU-API-6).
 *
 * @param error - The thrown value.
 * @param requestId - The `req_…` id, so an event joins the `[ERR]` log line and the error body's `requestId`.
 */
export const reportServerError = (error: unknown, requestId?: string): void => {
  if (!Sentry.isInitialized()) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry tag name joined by the [ERR] log line
  Sentry.captureException(error, requestId ? { tags: { request_id: requestId } } : undefined);
};

/**
 * One down indicator of a readiness probe.
 */
export type ReadinessFailure = {
  /** The terminus indicator key: `redis`, `database`, `s3`, `git` or `memory_heap`. */
  indicator: string;
  /** The indicator's own reason, when it gave one. */
  message?: string;
  /** How long the indicator's probe took, when it measured one. */
  responseTimeMs?: number;
};

/**
 * Report one down readiness indicator as a warning grouped by that indicator.
 *
 * A down indicator is the probe working: a Machine fault drains the Machine, a shared dependency is reported as
 * degraded without draining. Reported as the terminus `ServiceUnavailableException` it became one anonymous error
 * group that never said which dependency failed (TAU-API-3). Each indicator now gets its own fingerprint, tag and
 * context instead.
 *
 * @param failure - The down indicator.
 */
export const reportReadinessFailure = (failure: ReadinessFailure): void => {
  if (!Sentry.isInitialized()) {
    return;
  }
  Sentry.captureMessage(`Readiness check down: ${failure.indicator}`, {
    level: 'warning',
    fingerprint: ['health-readiness', failure.indicator],
    tags: { 'health.indicator': failure.indicator },
    contexts: { readiness: { ...failure } },
  });
};
