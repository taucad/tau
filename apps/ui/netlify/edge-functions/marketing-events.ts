/**
 * First-party collector for the marketing site's page counts (`apps/www`, `WWW_ANALYTICS_ENDPOINT`).
 *
 * The website sends one small JSON event (`marketing_page_view`, `marketing_cta_click` or
 * `marketing_download_click`) only after the visitor allowed analytics, and only without GPC or DNT. This
 * function is the contract `apps/www/README.md` sets for it:
 *
 * - **Nothing about the visitor's transport goes upstream.** The event is rebuilt from validated fields
 *   only; the visitor's IP, user agent, referrer and cookies are never forwarded, and PostHog sees this
 *   function's address with GeoIP off. Each event is anonymous (`$process_person_profile: false`), keyed by
 *   its own random id, so no person or cross-page identity is created.
 * - **The schema is closed.** Event names, pages, placements and campaign codes match the website's own
 *   enumerations in shape; anything else is refused with 400.
 * - **Abuse is bounded.** Same-origin JSON only, at most 1 KB, and a per-address rate limit and duplicate
 *   `event_id` check in this isolate.
 *
 * The events go to the same PostHog project as the app (`POSTHOG_CLIENT_KEY`).
 */

/** The part of Netlify's edge runtime global (Deno) this function reads. */
type NetlifyRuntime = { env: { get: (name: string) => string | undefined } };

/** The part of Netlify's edge context this function reads. */
type EdgeContext = { readonly ip?: string };

/** One validated event, as forwarded. */
export type MarketingEvent = Readonly<{
  event: 'marketing_page_view' | 'marketing_cta_click' | 'marketing_download_click';
  eventId: string;
  page: string;
  placement?: string;
  campaign?: string;
  returning?: boolean;
}>;

const eventNames = new Set(['marketing_page_view', 'marketing_cta_click', 'marketing_download_click']);
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;
/** A site path: lowercase segments and a trailing slash, as `allowedPages` lists them. */
const pagePattern = /^\/(?:[a-z\d-]{1,40}\/){0,3}$/u;
/** A placement or campaign code: a short lowercase token, as `ctaPlacements` and `campaignCodes` list them. */
const codePattern = /^[a-z\d-]{1,32}$/u;

/** Largest body accepted; a real event is about 200 bytes. */
export const maxEventBytes = 1024;
/** Events one address may send per window (milliseconds); a page sends one view and a few distinct clicks. */
export const rateLimit = { events: 60, window: 60_000 } as const;
/** Bound on the per-isolate memory of addresses and event ids. */
const trackedEntryLimit = 10_000;

const defaultApiHost = 'us.i.posthog.com';

function readSiteVariable(name: string): string | undefined {
  const runtime = Reflect.get(globalThis, 'Netlify') as NetlifyRuntime | undefined;
  return runtime?.env.get(name);
}

const isOptionalCode = (value: unknown): value is string | undefined =>
  value === undefined || (typeof value === 'string' && codePattern.test(value));

/**
 * Validate an untrusted body against the website's event contract.
 *
 * @param input - The parsed JSON body.
 * @returns The event, or `undefined` when any field is outside the contract.
 */
export function parseMarketingEvent(input: unknown): MarketingEvent | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const allowedKeys = new Set(['event', 'event_id', 'page', 'placement', 'campaign', 'returning']);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    return undefined;
  }
  const { event, page, placement, campaign, returning } = record;
  const eventId = record['event_id'];
  if (
    typeof event !== 'string' ||
    !eventNames.has(event) ||
    typeof eventId !== 'string' ||
    !uuidPattern.test(eventId) ||
    typeof page !== 'string' ||
    !pagePattern.test(page) ||
    !isOptionalCode(placement) ||
    !isOptionalCode(campaign) ||
    (returning !== undefined && typeof returning !== 'boolean')
  ) {
    return undefined;
  }
  return {
    event: event as MarketingEvent['event'],
    eventId,
    page,
    ...(placement === undefined ? {} : { placement }),
    ...(campaign === undefined ? {} : { campaign }),
    ...(returning === undefined ? {} : { returning }),
  };
}

/**
 * The PostHog capture body for one event: anonymous, without person processing or GeoIP.
 *
 * @param event - A validated event.
 * @param apiKey - The project's public key.
 * @param now - The capture time.
 * @returns The JSON body for PostHog's `/i/v0/e/` endpoint.
 */
export function toPostHogCapture(event: MarketingEvent, apiKey: string, now: Date): Record<string, unknown> {
  /* eslint-disable @typescript-eslint/naming-convention -- PostHog capture wire names. */
  return {
    api_key: apiKey,
    event: event.event,
    uuid: event.eventId,
    distinct_id: event.eventId,
    timestamp: now.toISOString(),
    properties: {
      page: event.page,
      ...(event.placement === undefined ? {} : { placement: event.placement }),
      ...(event.campaign === undefined ? {} : { campaign: event.campaign }),
      ...(event.returning === undefined ? {} : { returning: event.returning }),
      $lib: 'tau-www-collector',
      $process_person_profile: false,
      $geoip_disable: true,
    },
  };
  /* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
}

/** Per-isolate memory: recent counts per address, and event ids already forwarded. */
const windows = new Map<string, { start: number; count: number }>();
const forwarded = new Set<string>();

/**
 * Count one event from an address and answer whether it is within the limit.
 *
 * @param address - The client address Netlify reports, or a shared key when it is absent.
 * @param now - Milliseconds since the epoch.
 * @returns Whether the event may go on.
 */
export function admitFrom(address: string, now: number): boolean {
  if (windows.size > trackedEntryLimit) {
    windows.clear();
  }
  const current = windows.get(address);
  if (current === undefined || now - current.start >= rateLimit.window) {
    windows.set(address, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= rateLimit.events;
}

/** Forget the per-isolate memory (tests). */
export function resetCollectorState(): void {
  windows.clear();
  forwarded.clear();
}

const answer = (status: number): Response => new Response(null, { status, headers: { 'cache-control': 'no-store' } });

/**
 * The refusal for a request that is not a same-origin JSON event within the size limit, if any.
 *
 * @param request - The incoming request.
 * @returns The status to answer with, or `undefined` to go on.
 */
function refusal(request: Request): number | undefined {
  if (request.method !== 'POST') {
    return 405;
  }
  // A privacy signal on the request wins even if the page sent anyway.
  if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') {
    return 204;
  }
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return 403;
  }
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) {
    return 415;
  }
  return Number(request.headers.get('content-length') ?? '0') > maxEventBytes ? 413 : undefined;
}

export default async function marketingEvents(request: Request, context?: EdgeContext): Promise<Response> {
  const refused = refusal(request);
  if (refused === 405) {
    return new Response(null, { status: 405, headers: { allow: 'POST' } });
  }
  if (refused !== undefined) {
    return answer(refused);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxEventBytes) {
    return answer(413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return answer(400);
  }
  const event = parseMarketingEvent(parsed);
  if (event === undefined) {
    return answer(400);
  }
  if (!admitFrom(context?.ip ?? 'unknown', Date.now())) {
    return answer(429);
  }
  if (forwarded.has(event.eventId)) {
    return answer(202);
  }
  const apiKey = readSiteVariable('POSTHOG_CLIENT_KEY');
  if (apiKey === undefined || apiKey === '') {
    // No project on this site: accepted and dropped, as the app's analytics would be.
    return answer(202);
  }
  const apiHost = readSiteVariable('POSTHOG_API_HOST') ?? defaultApiHost;
  const host = apiHost.includes('://') ? new URL(apiHost).hostname : apiHost;
  if (forwarded.size > trackedEntryLimit) {
    forwarded.clear();
  }
  forwarded.add(event.eventId);
  try {
    const response = await fetch(`https://${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toPostHogCapture(event, apiKey, new Date())),
    });
    return answer(response.ok ? 202 : 502);
  } catch {
    forwarded.delete(event.eventId);
    return answer(502);
  }
}

export const config = { path: '/api/marketing-events' };
