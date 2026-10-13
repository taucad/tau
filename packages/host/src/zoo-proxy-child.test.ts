import { describe, expect, it, vi } from 'vitest';

import { createZooProxyChildCredential } from '#zoo-proxy-child.js';

const proxyUrl = 'wss://api.example.test/v1/kernels/zoo';
/** The Zoo token source's default refresh interval, in milliseconds. */
const refreshInterval = 10 * 60_000;

const minting = (...tokens: string[]) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ token: tokens.shift(), expiresAt: '2026-10-11T00:30:00.000Z' }), { status: 201 }),
  );

describe('createZooProxyChildCredential', () => {
  it('sends the latest Zoo-scoped token to the current child, and replays it to the next one', async () => {
    const fetch = minting('zt1.first');
    const credential = createZooProxyChildCredential({
      zooProxy: { url: proxyUrl, apiUrl: 'https://api.example.test/', sessionToken: 'session-1' },
      fetch,
      onWarning: vi.fn(),
    });
    const first = { post: vi.fn() };
    credential.attach(first);
    await credential.start();

    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://api.example.test/v1/kernels/zoo/tokens', {
      method: 'POST',
      headers: { authorization: 'Bearer session-1' },
    });
    expect(first.post).toHaveBeenCalledExactlyOnceWith({
      type: 'zoo-proxy-credential',
      url: proxyUrl,
      token: 'zt1.first',
    });

    const second = { post: vi.fn() };
    credential.attach(second);
    expect(second.post).toHaveBeenCalledExactlyOnceWith({
      type: 'zoo-proxy-credential',
      url: proxyUrl,
      token: 'zt1.first',
    });
    credential.dispose();
  });

  it('sends every refresh to each attached child until it detaches', async () => {
    const credential = createZooProxyChildCredential({
      zooProxy: { url: proxyUrl, apiUrl: 'https://api.example.test', sessionToken: 'session-1' },
      fetch: minting('zt1.first', 'zt1.second', 'zt1.third'),
      onWarning: vi.fn(),
    });
    const first = { post: vi.fn() };
    const second = { post: vi.fn() };
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const detachFirst = credential.attach(first);
      credential.attach(second);
      await credential.start();
      /* The source refreshes on its own interval. */
      await vi.advanceTimersByTimeAsync(refreshInterval);
      detachFirst();
      await vi.advanceTimersByTimeAsync(refreshInterval);
    } finally {
      vi.useRealTimers();
    }

    const tokens = (receiver: { post: ReturnType<typeof vi.fn> }) =>
      receiver.post.mock.calls.map(([frame]) => (frame as { token?: string }).token);
    expect(tokens(first)).toEqual(['zt1.first', 'zt1.second']);
    expect(tokens(second)).toEqual(['zt1.first', 'zt1.second', 'zt1.third']);
    credential.dispose();
  });

  it('mints nothing without a session token and sends no credential', async () => {
    const fetch = vi.fn();
    const credential = createZooProxyChildCredential({
      zooProxy: { url: proxyUrl, apiUrl: 'https://api.example.test' },
      fetch,
      onWarning: vi.fn(),
    });
    const child = { post: vi.fn() };
    credential.attach(child);
    await credential.start();

    expect(fetch).not.toHaveBeenCalled();
    expect(child.post).toHaveBeenCalledExactlyOnceWith({ type: 'zoo-proxy-credential', url: proxyUrl });
    credential.dispose();
  });

  it('warns without the credential when minting fails', async () => {
    const onWarning = vi.fn();
    const credential = createZooProxyChildCredential({
      zooProxy: { url: proxyUrl, apiUrl: 'https://api.example.test', sessionToken: 'session-secret' },
      fetch: vi.fn(async () => new Response('', { status: 503 })),
      onWarning,
    });
    await credential.start();

    expect(onWarning).toHaveBeenCalledOnce();
    expect(JSON.stringify(onWarning.mock.calls)).not.toContain('session-secret');
    credential.dispose();
  });
});
