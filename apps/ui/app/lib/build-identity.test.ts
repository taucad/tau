import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIdentityPath, fetchLiveBuildId, readBuildId, readBuildIdentity } from '#lib/build-identity.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readBuildId', () => {
  it('should prefer the compiled-in build timestamp', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the host contract names window.ENV and its keys.
    vi.stubGlobal('window', { ENV: { TAU_BUILD_ID: '1' } });

    expect(readBuildId()).toBe(tauBuildId);
  });
});

describe('readBuildIdentity', () => {
  it('should render the compiled-in build timestamp as text', () => {
    expect(readBuildIdentity()).toBe(String(tauBuildId));
  });
});

describe('fetchLiveBuildId', () => {
  it('should read the build the server renders pages for, never from a cache', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ buildId: 1_792_730_113_029 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLiveBuildId()).resolves.toBe(1_792_730_113_029);
    expect(fetchMock).toHaveBeenCalledWith(
      buildIdentityPath,
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('should give up when the server does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      async (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'));
          });
        }),
    );

    await expect(fetchLiveBuildId(20)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it.each([
    ['a non-OK answer', async () => new Response('', { status: 404 })],
    ['an answer without a build id', async () => Response.json({})],
  ])('should name no build for %s', async (_label, answer) => {
    vi.stubGlobal('fetch', answer);

    await expect(fetchLiveBuildId()).resolves.toBeUndefined();
  });
});
