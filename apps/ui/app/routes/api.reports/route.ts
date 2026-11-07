import { randomUUID } from 'node:crypto';
import type { Route } from './+types/route.js';
import { getEnvironment } from '#environment.config.js';
import { readBuildId } from '#lib/build-identity.js';
import { browserCrashFromReport, isFromOrigin, parseReports, scrubCspReport } from '#lib/browser-reports.server.js';
import type { BrowserCrash } from '#lib/browser-reports.server.js';
import { clientOf, createClientRateLimiter, readCapped } from '#lib/request.server.js';
import type { ClientRateLimiter } from '#lib/request.server.js';
import { sentryEnvelopeUrl, sentryEnvironment, sentryRelease, sentrySecurityUrl } from '#lib/sentry-event.lib.js';

/**
 * Reporting API receiver (browser observability SB6): the `default` endpoint every document names in
 * `Reporting-Endpoints`. It keeps two report types and drops the rest:
 *
 * - `crash`: one `tau-ui` event per report, `Browser crash: <reason>`, at `error` when the page was visible and
 *   `warning` when hidden, tagged `reason`, `visibility_state`, `is_top_level` and the editor `route`.
 * - `csp-violation`: forwarded, scrubbed, to the DSN's security endpoint, where Sentry groups violations natively.
 *
 * Only reports about a page of this origin are kept, bodies are capped and each client address is rate limited,
 * because anyone can post here. Nothing but the scrubbed report leaves: no cookie, client address or header other
 * than the reporting browser's user agent. A no-op without `SENTRY_DSN`.
 */

/** Largest delivery read, in bytes: a browser batches a handful of small reports. */
export const reportsBodyLimit = 64 * 1024;

/** Deliveries one client address may post per window. */
export const reportsRateLimit = { envelopes: 20, windowMilliseconds: 60_000 } as const;

/** Crash events sent from one delivery, at most: a tab delivers one crash per renderer it lost. */
export const crashesPerDelivery = 5;

/** Milliseconds a delivery may wait for Sentry. */
const upstreamTimeout = 3000;

type ReportsOptions = Readonly<{
  dsn: string | undefined;
  environment: string | undefined;
  release: string | undefined;
  isAllowed: ClientRateLimiter;
  now?: () => number;
  newEventId?: () => string;
  fetchUpstream?: typeof fetch;
}>;

/**
 * The Sentry event for one browser crash.
 *
 * @param crash - The crash, read from its report.
 * @param context - The event id, time, environment and release.
 * @returns The event, as an envelope item's payload.
 */
export const crashEvent = (
  crash: BrowserCrash,
  {
    eventId,
    timestamp,
    environment,
    release,
  }: { eventId: string; timestamp: number; environment: string | undefined; release: string | undefined },
): Record<string, unknown> => ({
  /* eslint-disable @typescript-eslint/naming-convention -- Sentry event and tag wire names. */
  event_id: eventId,
  timestamp,
  platform: 'javascript',
  logger: 'reporting-api',
  level: crash.visibility === 'hidden' ? 'warning' : 'error',
  message: `Browser crash: ${crash.reason}`,
  fingerprint: ['browser-crash', crash.reason],
  tags: {
    reason: crash.reason,
    visibility_state: crash.visibility ?? 'unknown',
    ...(crash.isTopLevel === undefined ? {} : { is_top_level: String(crash.isTopLevel) }),
    ...(crash.routeId === undefined ? {} : { route: crash.routeId }),
  },
  ...(environment === undefined ? {} : { environment }),
  ...(release === undefined ? {} : { release }),
  request: { url: crash.url, ...(crash.userAgent === undefined ? {} : { headers: { 'User-Agent': crash.userAgent } }) },
  /* eslint-enable @typescript-eslint/naming-convention -- Sentry wire names end here. */
});

/** Post to Sentry, swallowing its failures: the browser does not retry a report on our answer. */
const deliver = async (fetchUpstream: typeof fetch, url: string, init: RequestInit): Promise<void> => {
  try {
    await fetchUpstream(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(upstreamTimeout),
      ...init,
    });
  } catch {
    // A lost report is acceptable; a hung function is not.
  }
};

/**
 * Validate one Reporting API delivery and forward the reports it keeps.
 *
 * @param request - The browser's delivery.
 * @param options - The configured DSN, environment and release, the limiter, and stand-ins for tests.
 * @returns `204` once handled, or this route's refusal.
 */
export const browserReports = async (
  request: Request,
  {
    dsn,
    environment,
    release,
    isAllowed,
    now = Date.now,
    newEventId = () => randomUUID().replaceAll('-', ''),
    fetchUpstream = fetch,
  }: ReportsOptions,
): Promise<Response> => {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'POST' } });
  }
  const envelopeUrl = dsn ? sentryEnvelopeUrl(dsn) : undefined;
  const securityUrl = dsn ? sentrySecurityUrl(dsn, { environment, release }) : undefined;
  if (!dsn || envelopeUrl === undefined || securityUrl === undefined) {
    return new Response(null, { status: 404 });
  }
  if (!isAllowed(clientOf(request), now())) {
    return new Response(null, { status: 429 });
  }
  if (!(request.headers.get('content-type') ?? '').startsWith('application/reports+json')) {
    return new Response(null, { status: 415 });
  }
  const body = await readCapped(request, reportsBodyLimit);
  if (body === undefined) {
    return new Response(null, { status: 413 });
  }
  const reports = parseReports(body);
  if (reports === undefined) {
    return new Response(null, { status: 400 });
  }
  const { origin } = new URL(request.url);
  const ours = reports.filter((report) => isFromOrigin(report, origin));

  const deliveries: Array<Promise<void>> = [];
  const violations = ours.filter((report) => report.type === 'csp-violation').map((report) => scrubCspReport(report));
  if (violations.length > 0) {
    deliveries.push(
      deliver(fetchUpstream, securityUrl, {
        body: JSON.stringify(violations),
        headers: { 'content-type': 'application/reports+json' },
      }),
    );
  }
  const crashes = ours.filter((report) => report.type === 'crash').slice(0, crashesPerDelivery);
  for (const report of crashes) {
    const eventId = newEventId();
    const event = crashEvent(browserCrashFromReport(report), {
      eventId,
      timestamp: now() / 1000,
      environment,
      release,
    });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry envelope header fields.
    const header = { event_id: eventId, sent_at: new Date(now()).toISOString(), dsn };
    deliveries.push(
      deliver(fetchUpstream, envelopeUrl, {
        body: `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`,
        headers: { 'content-type': 'application/x-sentry-envelope' },
      }),
    );
  }
  await Promise.all(deliveries);
  return new Response(null, { status: 204 });
};

/** This server process's limiter: per instance, so a best effort bound, not a global quota. */
const isAllowed = createClientRateLimiter(reportsRateLimit);

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const environment = await getEnvironment();
  return browserReports(request, {
    dsn: environment.SENTRY_DSN,
    environment: sentryEnvironment(),
    release: sentryRelease(readBuildId()),
    isAllowed,
  });
}

export function loader(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST' } });
}
