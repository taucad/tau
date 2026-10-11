import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createZooProxyTokenSource } from '#proxy/zoo-proxy-token.js';
import type { ZooProxyCredentialFrame } from '#proxy/zoo-proxy-credential.js';

const proxyUrl = 'ws://localhost:4001/v1/kernels/zoo';

/** Milliseconds. */
const refreshInterval = 10 * 60 * 1000;

const minted = (token: string): Response =>
  new Response(JSON.stringify({ token, expiresAt: '2026-10-11T00:30:00.000Z' }), { status: 201 });

const harness = (responses: Array<Response | Error>) => {
  let session: string | undefined;
  const frames: ZooProxyCredentialFrame[] = [];
  const logs: unknown[][] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const next = responses.shift();
    if (next === undefined) {
      throw new Error('unexpected fetch');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  const source = createZooProxyTokenSource({
    apiUrl: 'http://localhost:4000',
    proxyUrl,
    sessionToken: () => session,
    publish: (frame) => {
      frames.push(frame);
    },
    fetch,
    log: (...entry) => {
      logs.push(entry);
    },
  });
  return {
    source,
    frames,
    logs,
    fetch,
    signIn: (token: string) => {
      session = token;
    },
    signOut: () => {
      session = undefined;
    },
  };
};

describe('createZooProxyTokenSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes no token while signed out, without asking the API', async () => {
    const { source, frames, fetch } = harness([]);

    await source.update();

    expect(fetch).not.toHaveBeenCalled();
    expect(frames).toEqual([{ type: 'zoo-proxy-credential', url: proxyUrl }]);
    source.dispose();
  });

  it('mints a Zoo-scoped token with the session and publishes only that token', async () => {
    const { source, frames, fetch, signIn } = harness([minted('zt1.a.b')]);
    signIn('session-secret');

    await source.update();

    expect(fetch).toHaveBeenCalledExactlyOnceWith('http://localhost:4000/v1/kernels/zoo/tokens', {
      method: 'POST',
      headers: { authorization: 'Bearer session-secret' },
    });
    expect(frames).toEqual([{ type: 'zoo-proxy-credential', url: proxyUrl, token: 'zt1.a.b' }]);
    expect(JSON.stringify(frames)).not.toContain('session-secret');
    source.dispose();
  });

  it('does not mint again for a change that kept the same session', async () => {
    const { source, fetch, signIn } = harness([minted('zt1.a.b')]);
    signIn('session-secret');

    await source.update();
    await source.update();

    expect(fetch).toHaveBeenCalledOnce();
    source.dispose();
  });

  it('refreshes the token on its interval while signed in, and stops after sign-out', async () => {
    const { source, frames, fetch, signIn, signOut } = harness([minted('zt1.first'), minted('zt1.second')]);
    signIn('session-secret');
    await source.update();

    await vi.advanceTimersByTimeAsync(refreshInterval);
    expect(frames.at(-1)).toEqual({ type: 'zoo-proxy-credential', url: proxyUrl, token: 'zt1.second' });

    signOut();
    await source.update();
    expect(frames.at(-1)).toEqual({ type: 'zoo-proxy-credential', url: proxyUrl });
    await vi.advanceTimersByTimeAsync(refreshInterval * 3);
    expect(fetch).toHaveBeenCalledTimes(2);
    source.dispose();
  });

  it('drops the token when the API rejects the session', async () => {
    const { source, frames, signIn } = harness([minted('zt1.first'), new Response('', { status: 401 })]);
    signIn('session-secret');
    await source.update();

    signIn('revoked-session');
    await source.update();

    expect(frames.at(-1)).toEqual({ type: 'zoo-proxy-credential', url: proxyUrl });
    source.dispose();
  });

  it('keeps the current token through a transient failure and logs no credential', async () => {
    const { source, frames, logs, signIn } = harness([
      minted('zt1.first'),
      new Response('', { status: 503 }),
      new Error('network down'),
    ]);
    signIn('session-secret');
    await source.update();

    await vi.advanceTimersByTimeAsync(refreshInterval);
    await vi.advanceTimersByTimeAsync(refreshInterval);

    expect(frames).toEqual([{ type: 'zoo-proxy-credential', url: proxyUrl, token: 'zt1.first' }]);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(logs)).not.toMatch(/session-secret|zt1\./u);
    source.dispose();
  });
});
