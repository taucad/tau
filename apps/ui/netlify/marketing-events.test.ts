import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
/* oxlint-disable eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/ as a function, so this test sits beside it, outside the app alias root. */
import marketingEvents, {
  admitFrom,
  config,
  parseMarketingEvent,
  publicOrigin,
  rateLimit,
  resetCollectorState,
  toPostHogCapture,
} from './edge-functions/marketing-events.js';
/* oxlint-enable eslint/no-restricted-imports -- restore the alias rule. */
/* eslint-disable @typescript-eslint/naming-convention -- PostHog and Sentry wire names. */

const origin = 'https://tau.new';
const eventId = '0b6f3c1e-9a7d-4b2e-8f1a-2c3d4e5f6a7b';
const valid = { event: 'marketing_page_view', event_id: eventId, page: '/pricing/', returning: false };

const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(`${origin}/api/marketing-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const statusOf = async (pending: Promise<Response>): Promise<number> => {
  const response = await pending;
  return response.status;
};

const site = new Map<string, string>([['POSTHOG_CLIENT_KEY', 'phc_test']]);

beforeEach(() => {
  resetCollectorState();
  vi.stubGlobal('Netlify', { env: { get: (name: string) => site.get(name) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseMarketingEvent', () => {
  it('should accept the website contract', () => {
    expect(parseMarketingEvent({ ...valid, placement: 'hero', campaign: 'launch' })).toEqual({
      event: 'marketing_page_view',
      eventId,
      page: '/pricing/',
      placement: 'hero',
      campaign: 'launch',
      returning: false,
    });
    expect(parseMarketingEvent({ ...valid, page: '/' })).toBeDefined();
    expect(parseMarketingEvent({ ...valid, page: '/use-cases/engineering/' })).toBeDefined();
  });

  it('should refuse anything outside it', () => {
    expect(parseMarketingEvent({ ...valid, event: '$pageview' })).toBeUndefined();
    expect(parseMarketingEvent({ ...valid, event_id: 'not-a-uuid' })).toBeUndefined();
    expect(parseMarketingEvent({ ...valid, page: 'https://evil.example/' })).toBeUndefined();
    expect(parseMarketingEvent({ ...valid, page: '/pricing/?email=a@b.c' })).toBeUndefined();
    expect(parseMarketingEvent({ ...valid, placement: 'Hero Text' })).toBeUndefined();
    expect(parseMarketingEvent({ ...valid, returning: 'yes' })).toBeUndefined();
    expect(parseMarketingEvent({ ...valid, email: 'a@b.c' })).toBeUndefined();
    expect(parseMarketingEvent([valid])).toBeUndefined();
  });
});

describe('toPostHogCapture', () => {
  it('should build an anonymous capture with no person profile or GeoIP', () => {
    const event = parseMarketingEvent(valid);
    expect(event).toBeDefined();
    expect(toPostHogCapture(event!, 'phc_test', new Date('2026-11-10T00:00:00Z'))).toEqual({
      api_key: 'phc_test',
      event: 'marketing_page_view',
      uuid: eventId,
      distinct_id: eventId,
      timestamp: '2026-11-10T00:00:00.000Z',
      properties: {
        page: '/pricing/',
        returning: false,
        $lib: 'tau-www-collector',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
  });
});

describe('admitFrom', () => {
  it('should limit one address per window', () => {
    for (let index = 0; index < rateLimit.events; index += 1) {
      expect(admitFrom('198.51.100.1', 1000)).toBe(true);
    }
    expect(admitFrom('198.51.100.1', 1000)).toBe(false);
    expect(admitFrom('198.51.100.2', 1000)).toBe(true);
    expect(admitFrom('198.51.100.1', 1000 + rateLimit.window)).toBe(true);
  });
});

describe('marketingEvents', () => {
  it('should forward a valid event once, with only validated fields', async () => {
    const fetchMock = vi.fn(async () => new Response('{"status":"Ok"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = post(valid, { 'user-agent': 'Visitor UA', referer: `${origin}/pricing/`, cookie: 'a=b' });

    expect(await statusOf(marketingEvents(request, { ip: '198.51.100.1' }))).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    const body = JSON.parse(init.body as string) as { properties: Record<string, unknown> };
    expect(JSON.stringify(body)).not.toMatch(/Visitor UA|198\.51\.100\.1|a=b/u);
    expect(body.properties['$process_person_profile']).toBe(false);

    expect(await statusOf(marketingEvents(post(valid), { ip: '198.51.100.1' }))).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('should refuse other origins, bad bodies and other methods without contacting PostHog', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await statusOf(marketingEvents(post(valid, { origin: 'https://evil.example' })))).toBe(403);
    expect(await statusOf(marketingEvents(post('{not json')))).toBe(400);
    expect(await statusOf(marketingEvents(post({ ...valid, event: 'other' })))).toBe(400);
    expect(await statusOf(marketingEvents(post('x'.repeat(2048))))).toBe(413);
    expect(await statusOf(marketingEvents(post(valid, { 'content-type': 'text/plain' })))).toBe(415);
    expect(await statusOf(marketingEvents(new Request(`${origin}/api/marketing-events`)))).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should take the visitor origin the staging router names, only on a netlify.app alias', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"status":"Ok"}', { status: 200 })),
    );
    const alias = 'https://staging--tau-ui.netlify.app/api/marketing-events';
    const routed = (headers: Record<string, string>): Request =>
      new Request(alias, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ ...valid, event_id: crypto.randomUUID() }),
      });

    expect(publicOrigin(routed({ 'x-tau-public-host': 'taucad.dev' }))).toBe('https://taucad.dev');
    expect(
      await statusOf(marketingEvents(routed({ origin: 'https://taucad.dev', 'x-tau-public-host': 'taucad.dev' }))),
    ).toBe(202);
    expect(await statusOf(marketingEvents(routed({ origin: 'https://taucad.dev' })))).toBe(403);
    expect(publicOrigin(post(valid, { 'x-tau-public-host': 'evil.example' }))).toBe(origin);
    expect(publicOrigin(routed({ 'x-tau-public-host': 'evil.example/x' }))).toBe('https://staging--tau-ui.netlify.app');
  });

  it('should honour a privacy signal on the request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await statusOf(marketingEvents(post(valid, { 'sec-gpc': '1' })))).toBe(204);
    expect(await statusOf(marketingEvents(post(valid, { dnt: '1' })))).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should only serve its own path', () => {
    expect(config).toEqual({ path: '/api/marketing-events' });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
