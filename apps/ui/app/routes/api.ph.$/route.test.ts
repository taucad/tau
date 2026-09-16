// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- HTTP headers and environment keys are external contracts. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { posthogProxy } from '#routes/api.ph.$/route.js';

vi.mock('#environment.config.js', () => ({
  getEnvironment: async () => ({
    POSTHOG_API_HOST: 'https://analytics.example.test',
    POSTHOG_ASSET_HOST: 'https://assets.example.test',
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PostHog proxy boundary', () => {
  it('should allowlist request headers and strip upstream cookie and hop-by-hop headers', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('accepted', {
        headers: {
          Connection: 'close',
          'Content-Type': 'text/plain',
          'Set-Cookie': 'vendor-id=secret; Path=/',
          'X-Upstream': 'kept',
        },
      }),
    );
    const request = new Request('https://tau.new/api/ph/e/?batch=1', {
      body: 'event-body',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret',
        'Content-Type': 'text/plain',
        Cookie: 'tau.session=secret',
        Forwarded: 'for=198.51.100.2',
        Origin: 'https://tau.new',
        'Proxy-Authorization': 'Basic secret',
        Referer: 'https://tau.new/private',
        'X-Forwarded-For': '198.51.100.2',
      },
      method: 'POST',
    });

    const response = await posthogProxy(request);
    const [url, init] = upstream.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(url).toStrictEqual(new URL('https://analytics.example.test/e/?batch=1'));
    expect([...headers]).toStrictEqual([
      ['accept', 'application/json'],
      ['content-type', 'text/plain'],
    ]);
    expect(await response.text()).toBe('accepted');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('connection')).toBeNull();
    expect(response.headers.get('x-upstream')).toBe('kept');
  });

  it('should reject GPC analytics traffic before reaching upstream', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');

    const response = await posthogProxy(
      new Request('https://tau.new/api/ph/e', { headers: { 'Sec-GPC': '1' }, method: 'POST' }),
    );

    expect(response.status).toBe(204);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('should preserve null-body upstream statuses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const response = await posthogProxy(new Request('https://tau.new/api/ph/e'));

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('should strip fields nominated by Connection and every upstream cookie', async () => {
    const headers = new Headers({
      Connection: 'Keep-Alive, X-Connection-Only , x-other-hop',
      'Content-Type': 'application/octet-stream',
      'Proxy-Connection': 'keep-alive',
      'X-Connection-Only': 'must-not-forward',
      'X-Other-Hop': 'must-not-forward',
      'X-Upstream': 'kept',
    });
    headers.append('Set-Cookie', 'first=secret; Path=/');
    headers.append('Set-Cookie', 'second=secret; Path=/');
    const body = new Uint8Array([0, 255, 1, 254]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { headers }));

    const response = await posthogProxy(new Request('https://tau.new/api/ph/static/array.js'));

    for (const name of ['connection', 'proxy-connection', 'keep-alive', 'x-connection-only', 'x-other-hop']) {
      expect(response.headers.get(name)).toBeNull();
    }
    expect(response.headers.getSetCookie()).toStrictEqual([]);
    expect(response.headers.get('x-upstream')).toBe('kept');
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(body);
  });
});
