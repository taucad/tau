// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createTunnelRateLimiter,
  isEnvelopeForDsn,
  sentryTunnel,
  tunnelBodyLimit,
  tunnelRateLimit,
} from '#routes/api.monitoring/route.js';

const dsn = 'https://public@o4500000000000000.ingest.us.sentry.io/4512297038446593';

const envelope = (headerDsn: string, payload = '{}'): string =>
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry's envelope header fields.
  `${JSON.stringify({ event_id: 'a'.repeat(32), dsn: headerDsn })}\n{"type":"event"}\n${payload}`;

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request('https://taucad.dev/api/monitoring', {
    method: 'POST',
    body,
    headers: { 'content-type': 'text/plain;charset=UTF-8', 'x-nf-client-connection-ip': '198.51.100.2', ...headers },
  });

const allowAll = (): boolean => true;

describe('isEnvelopeForDsn', () => {
  it('should accept the configured host and project, whatever the key', () => {
    expect(isEnvelopeForDsn(envelope(dsn), dsn)).toBe(true);
    expect(isEnvelopeForDsn(envelope(dsn.replace('public', 'other')), dsn)).toBe(true);
  });

  it('should refuse another project, another host, a lookalike host or a malformed header', () => {
    expect(isEnvelopeForDsn(envelope(dsn.replace('4512297038446593', '1')), dsn)).toBe(false);
    expect(isEnvelopeForDsn(envelope('https://public@evil.example/4512297038446593'), dsn)).toBe(false);
    expect(
      isEnvelopeForDsn(
        envelope('https://public@o4500000000000000.ingest.us.sentry.io.evil.example/4512297038446593'),
        dsn,
      ),
    ).toBe(false);
    expect(isEnvelopeForDsn(envelope(`${dsn.replace('/4512297038446593', '/prefix/4512297038446593')}`), dsn)).toBe(
      false,
    );
    expect(isEnvelopeForDsn('not json\n{}', dsn)).toBe(false);
    expect(isEnvelopeForDsn('{"event_id":"x"}\n{}', dsn)).toBe(false);
  });
});

describe('sentryTunnel', () => {
  it("should forward a valid envelope to the configured DSN's ingest endpoint with no cookie, IP or other header", async () => {
    const fetchUpstream = vi.fn(
      async () =>
        new Response('{"id":"x"}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-sentry-rate-limits': '60:error:org', 'set-cookie': 'a=b' },
        }),
    );
    const body = envelope(dsn);

    const response = await sentryTunnel(
      post(body, { cookie: 'tau.session=secret', 'x-forwarded-for': '198.51.100.2', 'sec-gpc': '1' }),
      { dsn, isAllowed: allowAll, fetchUpstream },
    );

    // Sec-GPC is not a reason to drop: error reporting is not tracking (D1).
    expect(response.status).toBe(200);
    expect(response.headers.get('x-sentry-rate-limits')).toBe('60:error:org');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(fetchUpstream).toHaveBeenCalledWith(
      'https://o4500000000000000.ingest.us.sentry.io/api/4512297038446593/envelope/?sentry_version=7&sentry_key=public',
      { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8' }, redirect: 'error' },
    );
  });

  it('should refuse an envelope for another project or host without forwarding it', async () => {
    const fetchUpstream = vi.fn();
    for (const other of [dsn.replace('4512297038446593', '99'), 'https://public@evil.example/4512297038446593']) {
      // oxlint-disable-next-line no-await-in-loop -- One refusal at a time.
      const response = await sentryTunnel(post(envelope(other)), { dsn, isAllowed: allowAll, fetchUpstream });
      expect(response.status).toBe(400);
    }
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it('should refuse a body over the size cap, declared or streamed', async () => {
    const fetchUpstream = vi.fn();
    const large = envelope(dsn, 'x'.repeat(tunnelBodyLimit));

    const declared = await sentryTunnel(post('{}', { 'content-length': String(tunnelBodyLimit + 1) }), {
      dsn,
      isAllowed: allowAll,
      fetchUpstream,
    });
    const streamed = await sentryTunnel(post(large), { dsn, isAllowed: allowAll, fetchUpstream });

    expect([declared.status, streamed.status]).toStrictEqual([413, 413]);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it('should rate limit each client address, with a retry-after the SDK honours', async () => {
    const fetchUpstream = vi.fn(async () => new Response('{}'));
    const isAllowed = createTunnelRateLimiter({ envelopes: 2, windowMilliseconds: 60_000 });
    let now = 0;
    const send = async (ip: string): Promise<number> => {
      const response = await sentryTunnel(post(envelope(dsn), { 'x-nf-client-connection-ip': ip }), {
        dsn,
        isAllowed,
        fetchUpstream,
        now: () => now,
      });
      return response.status;
    };

    const statuses = [await send('198.51.100.2'), await send('198.51.100.2'), await send('198.51.100.2')];
    const other = await send('203.0.113.9');
    now = 60_000;
    const later = await send('198.51.100.2');

    expect(statuses).toStrictEqual([200, 200, 429]);
    expect(other).toBe(200);
    expect(later).toBe(200);
    expect(tunnelRateLimit.envelopes).toBeGreaterThan(0);
  });

  it('should answer 404 without a configured DSN and 405 to anything but POST', async () => {
    const fetchUpstream = vi.fn();

    const unconfigured = await sentryTunnel(post(envelope(dsn)), {
      dsn: undefined,
      isAllowed: allowAll,
      fetchUpstream,
    });
    const read = await sentryTunnel(new Request('https://taucad.dev/api/monitoring'), {
      dsn,
      isAllowed: allowAll,
      fetchUpstream,
    });

    expect([unconfigured.status, read.status]).toStrictEqual([404, 405]);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it('should pass an upstream failure on as 502 and a null-body status without a body', async () => {
    const failing = await sentryTunnel(post(envelope(dsn)), {
      dsn,
      isAllowed: allowAll,
      fetchUpstream: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const empty = await sentryTunnel(post(envelope(dsn)), {
      dsn,
      isAllowed: allowAll,
      fetchUpstream: async () => new Response(null, { status: 204 }),
    });

    expect([failing.status, empty.status]).toStrictEqual([502, 204]);
  });
});
