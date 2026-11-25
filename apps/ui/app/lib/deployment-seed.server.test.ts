/**
 * The server's ask for the first snapshot (adaptive app deployment mode charter W11): the 1 s deadline, the per-origin
 * cache (answers 10 min, failures 30 s), one ask for concurrent requests, no ask without an API origin, and only an explicit answer as a seed.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createDeploymentSeedReader,
  deploymentSeedAnswerLifetimeMilliseconds,
  deploymentSeedFailureLifetimeMilliseconds,
} from '#lib/deployment-seed.server.js';

const apiUrl = 'https://api.test/v1';
const funded = (): Response =>
  Response.json({
    version: 1,
    edition: 'cloud',
    billing: { funded: true, environment: 'staging' },
    maxAgeSeconds: 300,
  });
const unfunded = (): Response =>
  Response.json({ version: 1, edition: 'self-host', billing: { funded: false }, maxAgeSeconds: 300 });

const clock = () => {
  let time = Date.UTC(2026, 10, 20);
  return {
    now: () => time,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
};

describe('deployment seed reader (W11)', () => {
  it('should seed a funded answer, ask the origin only, and keep it for 10 minutes', async () => {
    const time = clock();
    const fetch = vi.fn(async (_url: string) => funded());
    const read = createDeploymentSeedReader({
      fetch: fetch as typeof globalThis.fetch,
      now: time.now,
    });
    await expect(read(apiUrl)).resolves.toEqual({ state: 'funded', basis: 'confirmed', environment: 'staging' });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/deployment');
    time.advance(deploymentSeedAnswerLifetimeMilliseconds - 1);
    await read(apiUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(unfunded());
    time.advance(1);
    await expect(read(apiUrl)).resolves.toEqual({ state: 'unfunded', basis: 'confirmed' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should give no seed after the 1 s deadline, without waiting for the route, and ask again after 30 s', async () => {
    vi.useFakeTimers();
    try {
      const time = clock();
      const fetch = vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );
      const read = createDeploymentSeedReader({
        fetch: fetch as typeof globalThis.fetch,
        now: time.now,
      });
      const pending = read(apiUrl);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toBeUndefined();
      time.advance(deploymentSeedFailureLifetimeMilliseconds - 1);
      await expect(read(apiUrl)).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
      time.advance(1);
      void read(apiUrl);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should give no seed for a 404, a 5xx or a refused connection (I2)', async () => {
    for (const reply of [
      async () => new Response('', { status: 404 }),
      async () => new Response('', { status: 503 }),
      async () => {
        throw new TypeError('fetch failed');
      },
    ]) {
      const read = createDeploymentSeedReader({ fetch: reply as typeof globalThis.fetch });
      // oxlint-disable-next-line no-await-in-loop -- each case is its own reader.
      await expect(read(apiUrl)).resolves.toBeUndefined();
    }
  });

  it('should seed an unknown environment as unsupported and none as misconfigured (D7)', async () => {
    const answer = (billing: unknown) => async () =>
      Response.json({ version: 1, edition: 'cloud', billing, maxAgeSeconds: 300 });
    const unsupported = createDeploymentSeedReader({
      fetch: answer({ funded: true, environment: 'mars' }) as typeof globalThis.fetch,
    });
    await expect(unsupported(apiUrl)).resolves.toEqual({ state: 'unknown', problem: 'unsupported' });
    const misconfigured = createDeploymentSeedReader({
      fetch: answer({ funded: true }) as typeof globalThis.fetch,
    });
    await expect(misconfigured(apiUrl)).resolves.toEqual({ state: 'unknown', problem: 'misconfigured' });
  });

  it('should share one ask between concurrent requests for an origin', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    const fetch = vi.fn(async () => promise);
    const read = createDeploymentSeedReader({ fetch: fetch as typeof globalThis.fetch });
    const first = read(apiUrl);
    const second = read(`${apiUrl}/other`);
    resolve(funded());
    await expect(Promise.all([first, second])).resolves.toEqual([
      { state: 'funded', basis: 'confirmed', environment: 'staging' },
      { state: 'funded', basis: 'confirmed', environment: 'staging' },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should ask nothing with no API origin', async () => {
    const fetch = vi.fn(async () => funded());
    const adaptive = createDeploymentSeedReader({ fetch: fetch as typeof globalThis.fetch });
    for (const url of [undefined, '', 'not a url', 'file:///api']) {
      // oxlint-disable-next-line no-await-in-loop -- each case is one read.
      await expect(adaptive(url)).resolves.toBeUndefined();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
