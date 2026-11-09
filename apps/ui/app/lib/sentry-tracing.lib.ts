import * as Sentry from '@sentry/react';
import type { Event } from '@sentry/react';
import { readRouteId } from '#lib/sentry-context.lib.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';
import { scrubUrl } from '#lib/sentry-event.lib.js';

/**
 * Browser tracing (SB17, D3): sampled page-load and navigation transactions named by React Router
 * route id, with the SDK's web vitals, continued into the API through `sentry-trace` and `baggage`.
 *
 * Staging traces every page load, so the suite can assert on traces (A17). Production stays off
 * until the integration's lazy-chunk size and main-thread cost are measured on a constrained phone
 * on staging; the blueprint's production rate is then 0.05.
 */

/** An SDK integration, as `@sentry/react` accepts one (it does not re-export the type). */
type SentryIntegration = Parameters<typeof Sentry.addIntegration>[0];

/**
 * The share of page loads and navigations traced in an environment, or `undefined` for none.
 *
 * @param environment - The SDK environment (`staging`, `production`, or an `-e2e` variant).
 * @returns 1 outside production; `undefined` in production, which installs no tracing at all.
 * @public
 */
export const tracesSampleRate = (environment: string | undefined): number | undefined =>
  environment === undefined || environment === 'production' || environment.startsWith('production-') ? undefined : 1;

/** Escape a string for use inside a regular expression. */
const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

/**
 * Where trace headers may go: the configured API origin only, never a third party or a kernel CDN.
 *
 * @param apiUrl - `TAU_API_URL`.
 * @returns One pattern matching that origin, or none when the URL is absent or does not parse.
 * @public
 */
export const tracePropagationTargets = (apiUrl: string | undefined): RegExp[] => {
  if (apiUrl === undefined) {
    return [];
  }
  try {
    return [new RegExp(`^${escapeRegExp(new URL(apiUrl).origin)}(?:/|$)`, 'u')];
  } catch {
    return [];
  }
};

/** The router React Router's `HydratedRouter` publishes, as far as span naming reads it. */
type PublishedRouter = { readonly subscribe?: (listener: () => void) => () => void };

/** Name the current page load or navigation after the route that rendered it. */
const nameActiveRootSpan = (): void => {
  const routeId = readRouteId();
  const active = Sentry.getActiveSpan();
  if (routeId === undefined || active === undefined) {
    return;
  }
  const root = Sentry.getRootSpan(active);
  root.updateName(routeId);
  root.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
};

/** How often, and how many times, to look for the router before giving up (the SDK can load first). */
const routerPollMilliseconds = 100;
const routerPollAttempts = 50;

/**
 * Keep transaction names on route ids: once now, and again on every router state change, which is
 * when a navigation's matches settle.
 *
 * @param attempt - Internal: how many times the router has been looked for.
 */
export const nameSpansByRoute = (attempt = 0): void => {
  const router = (globalThis.window as (Window & { __reactRouterDataRouter?: PublishedRouter }) | undefined)
    ?.__reactRouterDataRouter;
  if (router?.subscribe === undefined) {
    if (attempt < routerPollAttempts) {
      setTimeout(() => {
        nameSpansByRoute(attempt + 1);
      }, routerPollMilliseconds);
    }
    return;
  }
  nameActiveRootSpan();
  router.subscribe(nameActiveRootSpan);
};

/** A query string or fragment inside free text: up to the next space, quote, bracket or parenthesis. */
const embeddedQueryPattern = /[?#][^\s"'()<>[\]]*/gu;

/**
 * Scrub a span description however a URL sits in it (`GET https://…?x`, `fetch("/v1/…?x")`): every query string
 * and fragment removed, then invitation tokens redacted, as error events are.
 *
 * @param description - The span description.
 * @returns The scrubbed description.
 */
const scrubDescription = (description: string): string =>
  redactInvitationTokens(description.replaceAll(embeddedQueryPattern, ''));

/** The span data keys whose values can be URLs. */
const urlDataKeys = ['url', 'http.url', 'url.full', 'http.request.url'] as const;

/**
 * Strip query strings, fragments and invitation tokens from a transaction, as errors are (SB17):
 * its request URL, and each span's description and URL data.
 *
 * @param event - The transaction the SDK is about to send.
 * @returns The same transaction, scrubbed.
 * @public
 */
export const scrubTransaction = <TransactionEvent extends Event>(event: TransactionEvent): TransactionEvent => {
  if (event.request?.url !== undefined) {
    event.request = { url: scrubUrl(event.request.url) };
  }
  for (const span of event.spans ?? []) {
    if (span.description !== undefined) {
      span.description = scrubDescription(span.description);
    }
    for (const key of urlDataKeys) {
      const value: unknown = span.data[key];
      if (typeof value === 'string') {
        span.data[key] = scrubUrl(value);
      }
    }
    delete span.data['http.query'];
    delete span.data['http.fragment'];
  }
  return event;
};

/**
 * Resource-timing span ops a page-load transaction leaves out. SB17's scope is the page load, navigations, web vitals
 * and API calls (`http.client`); one span per fetched script, stylesheet or asset is not in it. Measured on staging
 * over 48 h to 2026-11-09: about 258 spans per page load, 206 of them `resource.script` and 33 more `resource.other`
 * and `resource.link`; and on an emulated constrained phone (Moto G4, 4x CPU throttle) about 480 ms of `sentry.lib`
 * main-thread time per load with tracing against about 120 ms without it.
 */
const ignoredResourceSpanOps = [
  'resource.script',
  'resource.css',
  'resource.link',
  'resource.img',
  'resource.other',
] as const;

/**
 * The tracing integration for an environment, or none in production (see the module comment).
 *
 * @param environment - The SDK environment.
 * @returns The integrations to add.
 * @public
 */
export const tracingIntegrations = (environment: string | undefined): SentryIntegration[] =>
  tracesSampleRate(environment) === undefined
    ? []
    : [Sentry.browserTracingIntegration({ ignoreResourceSpans: [...ignoredResourceSpanOps] })];
