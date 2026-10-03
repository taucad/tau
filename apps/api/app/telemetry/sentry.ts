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

const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'],
    release: process.env['FLY_IMAGE_REF'],
    serverName: process.env['FLY_MACHINE_ID'],
    skipOpenTelemetrySetup: true,
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.nodeContextIntegration(),
      // A crash still exits the process (the API's unhandled-rejection handler rethrows into this path); the
      // integration only reports it and flushes first.
      Sentry.onUncaughtExceptionIntegration(),
    ],
    beforeSend: scrubSentryEvent,
  });
}

/**
 * Report a server error. A no-op when Sentry is not configured.
 *
 * @param error - The thrown value.
 * @param requestId - The `req_…` id, so an event joins the `[ERR]` log line and the error body's `requestId`.
 */
export const reportServerError = (error: unknown, requestId?: string): void => {
  if (!Sentry.isInitialized()) {
    return;
  }
  Sentry.withScope((scope) => {
    if (requestId) {
      scope.setTag('request_id', requestId);
    }
    Sentry.captureException(error);
  });
};
