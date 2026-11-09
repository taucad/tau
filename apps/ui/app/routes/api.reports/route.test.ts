// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Reporting API and Sentry wire names. */
import { describe, expect, it, vi } from 'vitest';
import { browserReports, crashesPerDelivery, reportsBodyLimit } from '#routes/api.reports/route.js';

const dsn = 'https://public@o4500000000000000.ingest.us.sentry.io/4512297038446593';
const page = 'https://taucad.dev/w/home/bracket?share=secret';

const post = (reports: unknown, headers: Record<string, string> = {}): Request =>
  new Request('https://taucad.dev/api/reports', {
    method: 'POST',
    body: typeof reports === 'string' ? reports : JSON.stringify(reports),
    headers: {
      'content-type': 'application/reports+json',
      'x-nf-client-connection-ip': '198.51.100.2',
      cookie: 'session=secret',
      ...headers,
    },
  });

const crash = (body: Record<string, unknown>, url = page) => ({
  type: 'crash',
  url,
  age: 0,
  user_agent: 'Chrome/140',
  body,
});

const options = (fetchUpstream: typeof fetch) => ({
  dsn,
  environment: 'staging',
  release: 'tau-ui@42',
  isAllowed: () => true,
  now: () => 1_700_000_000_000,
  newEventId: () => 'a'.repeat(32),
  fetchUpstream,
});

const upstream = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

/** The body of one upstream post, as sent. */
const sentBody = (fetchUpstream: ReturnType<typeof upstream>, call = 0): string => {
  const body = fetchUpstream.mock.calls[call]?.[1]?.body;
  return typeof body === 'string' ? body : '';
};

describe('browserReports', () => {
  it('should send a visible crash as one error event named by its reason, with the editor route', async () => {
    const fetchUpstream = upstream();

    const response = await browserReports(
      post([crash({ reason: 'oom', page_visibility: 'visible', is_top_level: true })]),
      options(fetchUpstream),
    );

    expect(response.status).toBe(204);
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    const [url, init] = fetchUpstream.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://o4500000000000000.ingest.us.sentry.io/api/4512297038446593/envelope/?sentry_version=7&sentry_key=public',
    );
    expect(init?.headers).toStrictEqual({ 'content-type': 'application/x-sentry-envelope' });
    const [header, item, payload] = sentBody(fetchUpstream).split('\n');
    expect(JSON.parse(header ?? '')).toMatchObject({ event_id: 'a'.repeat(32), dsn });
    expect(JSON.parse(item ?? '')).toStrictEqual({ type: 'event' });
    expect(JSON.parse(payload ?? '')).toStrictEqual({
      event_id: 'a'.repeat(32),
      timestamp: 1_700_000_000,
      platform: 'javascript',
      logger: 'reporting-api',
      level: 'error',
      message: 'Browser crash: oom',
      fingerprint: ['browser-crash', 'oom'],
      tags: { reason: 'oom', visibility_state: 'visible', is_top_level: 'true', route: 'routes/w.$workspace.$project' },
      environment: 'staging',
      release: 'tau-ui@42',
      request: { url: 'https://taucad.dev/w/home/bracket', headers: { 'User-Agent': 'Chrome/140' } },
    });
    expect(sentBody(fetchUpstream)).not.toContain('secret');
  });

  it('should file a crash in a hidden page as a warning', async () => {
    const fetchUpstream = upstream();

    await browserReports(post([crash({ reason: 'oom', page_visibility: 'hidden' })]), options(fetchUpstream));

    const payload = JSON.parse(sentBody(fetchUpstream).split('\n')[2] ?? '') as {
      level: string;
      tags: Record<string, string>;
    };
    expect(payload.level).toBe('warning');
    expect(payload.tags['visibility_state']).toBe('hidden');
  });

  it('should forward CSP violations, scrubbed, to the security endpoint in one post', async () => {
    const fetchUpstream = upstream();
    const violation = {
      type: 'csp-violation',
      url: page,
      body: { documentURL: page, blockedURL: 'eval', effectiveDirective: 'script-src', sample: 'secret()' },
    };

    const response = await browserReports(post([violation, violation]), options(fetchUpstream));

    expect(response.status).toBe(204);
    expect(fetchUpstream).toHaveBeenCalledTimes(1);
    const [url, init] = fetchUpstream.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://o4500000000000000.ingest.us.sentry.io/api/4512297038446593/security/?sentry_key=public&sentry_environment=staging&sentry_release=tau-ui%4042',
    );
    expect(init?.headers).toStrictEqual({ 'content-type': 'application/reports+json' });
    const sent = JSON.parse(sentBody(fetchUpstream)) as unknown[];
    expect(sent).toHaveLength(2);
    expect(sent[0]).toStrictEqual({
      type: 'csp-violation',
      url: 'https://taucad.dev/w/home/bracket',
      body: { documentURL: 'https://taucad.dev/w/home/bracket', blockedURL: 'eval', effectiveDirective: 'script-src' },
    });
  });

  it('should drop reports about another origin and report types it does not keep', async () => {
    const fetchUpstream = upstream();

    const response = await browserReports(
      post([
        crash({ reason: 'oom' }, 'https://evil.example/w/a/b'),
        { type: 'deprecation', url: page, body: { id: 'x' } },
        { type: 'intervention', url: page, body: { id: 'x' } },
      ]),
      options(fetchUpstream),
    );

    expect(response.status).toBe(204);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it('should send at most a few crashes from one delivery', async () => {
    const fetchUpstream = upstream();

    await browserReports(post(Array.from({ length: 10 }, () => crash({ reason: 'oom' }))), options(fetchUpstream));

    expect(fetchUpstream).toHaveBeenCalledTimes(crashesPerDelivery);
  });

  it('should still answer when Sentry fails', async () => {
    const fetchUpstream = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network');
    });

    const response = await browserReports(post([crash({ reason: 'oom' })]), options(fetchUpstream));

    expect(response.status).toBe(204);
  });

  it('should refuse other methods, other content types, oversized or malformed bodies and rate limited clients', async () => {
    const fetchUpstream = upstream();
    const base = options(fetchUpstream);

    const statuses = await Promise.all([
      browserReports(new Request('https://taucad.dev/api/reports'), base),
      browserReports(post([], { 'content-type': 'application/json' }), base),
      browserReports(post('x'.repeat(reportsBodyLimit + 1)), base),
      browserReports(post('{"not":"an array"}'), base),
      browserReports(post([]), { ...base, isAllowed: () => false }),
      browserReports(post([]), { ...base, dsn: undefined }),
    ]);

    expect(statuses.map((response) => response.status)).toStrictEqual([405, 415, 413, 400, 429, 404]);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
