import type * as SentryNode from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { isRouteErrorResponse } from 'react-router';
import type { EntryContext } from 'react-router';
import { ENV } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';
import { isObservabilityHarnessEnabled } from '#lib/observability-harness-context.js';
import { automatedRunEnvironment, scrubUrl, sentryEnvironment, sentryRelease } from '#lib/sentry-event.lib.js';

/*
 * Server-side render error reporting (SB10, D8): a small `@sentry/node` reporter for the SSR function, errors only,
 * filed in the browser's `tau-ui` project with the browser's environment and release so the client and server
 * failures of one route group side by side. It loads the SDK on the first error only, so a cold start without
 * one never pays for it, and it is a no-op while the host has not set `SENTRY_DSN`.
 */

/** What an SSR error report knows about where it happened. */
export type SsrErrorScope = {
  readonly request: Request;
  /** The React Router id of the deepest matched route, when the document render knows it. */
  readonly routeId?: string;
  /** The HTTP status the request is answered with. */
  readonly status: number;
  /** Which server channel saw the error. */
  readonly channel: 'handle-error' | 'stream';
};

/** Milliseconds a report may hold the function open to deliver its event. */
export const ssrFlushTimeout = 2000;

/** The harness route whose `e2e_run` query the suite correlates by (SB15). */
const harnessPath = '/__debug/observability';
const harnessRunPattern = /^[\w-]{1,128}$/u;

/**
 * The harness `e2e_run` tag for a staging harness request, read from the request rather than a page location.
 *
 * @param url - The request URL.
 * @returns `{ e2e_run }` on an enabled harness request with a bounded opaque run id, else nothing.
 */
const harnessTags = (url: URL): Readonly<Record<string, string>> => {
  const run = url.searchParams.get('e2e_run');
  return isObservabilityHarnessEnabled() && url.pathname === harnessPath && run !== null && harnessRunPattern.test(run)
    ? // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry query tag contract.
      { e2e_run: run }
    : {};
};

/**
 * Scrub a server event as the browser's are: the URL without its query string, fragment or invitation tokens, no
 * header but `User-Agent`, no cookies, body or user, and no invitation token anywhere in the event text.
 *
 * @param event - The event the SDK is about to send.
 * @returns The scrubbed event.
 * @public
 */
export const scrubServerSentryEvent = (event: ErrorEvent): ErrorEvent => {
  // Sentry derives its reserved `runtime` tag from this context, overriding scope tags.
  // Keep the execution boundary queryable as `runtime:ssr` and the Node engine separately.
  const runtime = event.contexts?.['runtime'];
  event.contexts = {
    ...event.contexts,
    ...(runtime && runtime['name'] !== 'ssr' ? { nodeEngine: { ...runtime, type: 'default' } } : {}),
    runtime: { name: 'ssr' },
  };
  if (event.request) {
    const { url, method, headers } = event.request;
    const userAgent = headers?.['User-Agent'] ?? headers?.['user-agent'];
    event.request = {
      ...(url === undefined ? {} : { url: scrubUrl(url) }),
      ...(method === undefined ? {} : { method }),
      ...(userAgent === undefined ? {} : { headers: { 'User-Agent': userAgent } }),
    };
  }
  delete event.user;
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a JSON round trip of the same event.
  return JSON.parse(redactInvitationTokens(JSON.stringify(event))) as ErrorEvent;
};

/** Start the SDK once, on the first error. */
const startServerSentry = async (dsn: string): Promise<typeof SentryNode> => {
  const sentry = await import('@sentry/node');
  sentry.init({
    dsn,
    environment: sentryEnvironment(),
    release: sentryRelease(readBuildId()),
    sendDefaultPii: false,
    // Errors only: no tracing, no OpenTelemetry, no http patching and no process-level handlers in the function.
    skipOpenTelemetrySetup: true,
    defaultIntegrations: false,
    // Do not content-deduplicate across requests: identical failures still need their own correlation ids.
    integrations: [
      sentry.eventFiltersIntegration(),
      sentry.functionToStringIntegration(),
      sentry.linkedErrorsIntegration(),
      sentry.nodeContextIntegration(),
    ],
    beforeSend: scrubServerSentryEvent,
  });
  return sentry;
};

let started: Promise<typeof SentryNode> | undefined;

/** An object or function `Reflect.get` can read (`WeakKey` also admits symbols, which it cannot). */
// oxlint-disable-next-line typescript/no-restricted-types -- `Reflect.get` takes exactly `object`.
const isObjectLike = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/** Netlify Functions keep a promise handed to `Netlify.context.waitUntil` alive after the response; elsewhere it is absent. */
const keepAlive = (promise: Promise<unknown>): void => {
  const netlify: unknown = Reflect.get(globalThis, 'Netlify');
  const context: unknown = isObjectLike(netlify) ? Reflect.get(netlify, 'context') : undefined;
  const waitUntil: unknown = isObjectLike(context) ? Reflect.get(context, 'waitUntil') : undefined;
  if (typeof waitUntil === 'function') {
    Reflect.apply(waitUntil, context, [promise]);
  }
};

/**
 * Report one server-side render error. A no-op without `SENTRY_DSN` and for a request the client aborted, as React
 * Router's own `handleError` guidance skips them. Never throws; delivery is kept alive past the response.
 *
 * @param error - The thrown value.
 * @param scope - The request, route and status it belongs to.
 * @public
 */
export const reportSsrError = (error: unknown, { request, routeId, status, channel }: SsrErrorScope): void => {
  const dsn = ENV.SENTRY_DSN;
  if (!dsn || request.signal.aborted) {
    return;
  }
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent');
  const send = async (): Promise<void> => {
    try {
      await capture();
    } catch (sendError) {
      console.error('[ssr-error-reporting] the error tracker threw', sendError);
    }
  };
  const capture = async (): Promise<void> => {
    started ??= startServerSentry(dsn);
    const sentry = await started;
    // A forked scope per event, so one request's tags never reach another's (the function serves many).
    sentry.withScope((scope) => {
      const runTags = harnessTags(url);
      scope.setTags({
        runtime: 'ssr',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry tag name filtered on by operators.
        http_status: String(status),
        ...(routeId === undefined ? {} : { route: routeId }),
        ...runTags,
      });
      // Only what an operator needs is attached; `beforeSend` scrubs it again. A harness run reports apart.
      scope.addEventProcessor((event) => ({
        ...event,
        ...(Object.keys(runTags).length > 0
          ? { environment: automatedRunEnvironment(event.environment ?? sentryEnvironment()) }
          : {}),
        request: {
          url: url.href,
          method: request.method,
          ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
        },
      }));
      sentry.captureException(error, { mechanism: { type: `tau.ssr.${channel}`, handled: false } });
    });
    await sentry.flush(ssrFlushTimeout);
  };
  keepAlive(send());
};

/** The status a value thrown into `handleError` answers its request with. */
const statusOf = (error: unknown): number => (isRouteErrorResponse(error) ? error.status : 500);

/** Errors `handleError` saw for a request, waiting for the document render to name their route. */
const pending = new WeakMap<Request, unknown[]>();

const flush = (request: Request, routeId: string | undefined, status: number | undefined): void => {
  const errors = pending.get(request);
  pending.delete(request);
  for (const error of errors ?? []) {
    reportSsrError(error, { request, routeId, status: status ?? statusOf(error), channel: 'handle-error' });
  }
};

/**
 * Take an error React Router handed to `handleError`. A document render calls the entry's `handleRequest` in the
 * same task right after (`renderHtml`), which names the route and status ({@link claimSsrErrors}); a data or
 * resource request never does, so what is still waiting at the next microtask is reported without a route. A
 * route error response under 500 is skipped.
 *
 * @param error - The thrown value.
 * @param request - The request it belongs to.
 * @public
 */
export const queueSsrError = (error: unknown, request: Request): void => {
  // A refusal React Router built itself (no matching route, a method not allowed) is not a server fault.
  if (request.signal.aborted || statusOf(error) < 500) {
    return;
  }
  const errors = pending.get(request);
  if (errors) {
    errors.push(error);
    return;
  }
  pending.set(request, [error]);
  queueMicrotask(() => {
    flush(request, undefined, undefined);
  });
};

/**
 * The deepest matched route of a document render, the id the browser's `route` tag uses.
 *
 * @param context - The entry context.
 * @returns The route id, if any route matched.
 * @public
 */
export const leafRouteId = (context: EntryContext): string | undefined =>
  context.staticHandlerContext.matches.at(-1)?.route.id;

/**
 * Report the errors {@link queueSsrError} holds for a document request with its route and status.
 *
 * @param request - The document request.
 * @param routeId - Its deepest matched route.
 * @param status - Its response status.
 * @public
 */
export const claimSsrErrors = (request: Request, routeId: string | undefined, status: number): void => {
  flush(request, routeId, status);
};
