import { describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/ as a function, so this test sits beside it, outside the app alias root.
import posthog, { config, extractHostname, forwardResponse, resolveUpstreamUrl } from './edge-functions/posthog.js';

const apiHost = 'us.i.posthog.com';
const assetHost = 'us-assets.i.posthog.com';

const upstreamFor = (path: string): string =>
  resolveUpstreamUrl(new URL(path, 'https://taucad.dev'), apiHost, assetHost).toString();

describe('extractHostname', () => {
  it('should accept a bare hostname and a URL', () => {
    expect(extractHostname(apiHost)).toBe(apiHost);
    expect(extractHostname(`https://${apiHost}`)).toBe(apiHost);
  });
});

describe('resolveUpstreamUrl', () => {
  it('should send captures to the API host without the proxy prefix', () => {
    expect(upstreamFor('/api/ph/i/v0/e/')).toBe(`https://${apiHost}/i/v0/e/`);
    expect(upstreamFor('/api/ph/e/')).toBe(`https://${apiHost}/e/`);
  });

  it('should keep the query, which carries the compression the body uses', () => {
    expect(upstreamFor('/api/ph/i/v0/e/?compression=gzip-js')).toBe(`https://${apiHost}/i/v0/e/?compression=gzip-js`);
  });

  it('should send static assets to the asset host', () => {
    expect(upstreamFor('/api/ph/static/1.438.9/surveys.js')).toBe(`https://${assetHost}/static/1.438.9/surveys.js`);
  });

  it('should leave every other path on the API host, as the app route does', () => {
    expect(upstreamFor('/api/ph/array/phc_key/config.js')).toBe(`https://${apiHost}/array/phc_key/config.js`);
    expect(upstreamFor('/api/ph/flags/?v=2')).toBe(`https://${apiHost}/flags/?v=2`);
  });
});

describe('forwardResponse', () => {
  it('should drop the fields that describe our hop to PostHog', () => {
    const response = forwardResponse(
      new Response(null, {
        status: 200,
        headers: {
          connection: 'x-upstream-only',
          'content-encoding': 'gzip',
          'set-cookie': 'ph_session=1',
          'x-upstream-only': 'dropped',
          'access-control-allow-origin': '*',
        },
      }),
    );
    for (const name of ['connection', 'content-encoding', 'set-cookie', 'x-upstream-only']) {
      expect(response.headers.get(name), name).toBeNull();
    }
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should keep the upstream status', () => {
    expect(forwardResponse(new Response(null, { status: 429 })).status).toBe(429);
  });
});

describe('posthog', () => {
  it('should answer a Global Privacy Control request without contacting PostHog', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await posthog(
      new Request('https://taucad.dev/api/ph/i/v0/e/', { method: 'POST', headers: { 'Sec-GPC': '1' }, body: '{}' }),
    );
    expect(response.status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('should forward a gzip capture body byte for byte, under its own content type', async () => {
    // The bytes the SDK sends: a gzip stream it labels `text/plain`. Anything that reads this as text destroys it.
    const sent = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x80, 0xff, 0xfe, 0x00, 0xc3, 0x28]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));

    await posthog(
      new Request('https://taucad.dev/api/ph/i/v0/e/?compression=gzip-js', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: sent,
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url instanceof URL ? url.toString() : url).toBe(`https://${apiHost}/i/v0/e/?compression=gzip-js`);
    expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(sent);
    expect(new Headers(init?.headers).get('content-type')).toBe('text/plain');
    fetchSpy.mockRestore();
  });

  it('should not forward anything that identifies the visitor', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await posthog(
      new Request('https://taucad.dev/api/ph/i/v0/e/', {
        method: 'POST',
        headers: { cookie: 'tau-session=secret', authorization: 'Bearer secret', 'content-type': 'text/plain' },
        body: 'x',
      }),
    );
    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    fetchSpy.mockRestore();
  });

  it('should send no body for a status that cannot carry one', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const response = await posthog(new Request('https://taucad.dev/api/ph/flags/'));
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    fetchSpy.mockRestore();
  });
});

describe('config', () => {
  it('should claim the whole proxy prefix, so no PostHog request reaches the SSR function', () => {
    expect(config.path).toBe('/api/ph/*');
  });
});
