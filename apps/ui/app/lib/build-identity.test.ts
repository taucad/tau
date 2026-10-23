import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askLiveBuild,
  buildIdentityPath,
  liveBuildIdTimeout,
  readBuildId,
  readBuildIdentity,
} from '#lib/build-identity.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

describe('askLiveBuild', () => {
  it('should read the build the server renders pages for, never from a cache, within the timeout', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ buildId: 1_792_730_113_029 }));
    vi.stubGlobal('fetch', fetchMock);
    const abortAfter = vi.spyOn(AbortSignal, 'timeout');

    await expect(askLiveBuild()).resolves.toBe(1_792_730_113_029);
    expect(fetchMock).toHaveBeenCalledWith(
      buildIdentityPath,
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
    expect(abortAfter).toHaveBeenCalledWith(liveBuildIdTimeout);
  });

  it('should send one request for callers that ask at the same time, and a new one afterwards', async () => {
    const fetchMock = vi.fn(async () => Response.json({ buildId: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(Promise.all([askLiveBuild(), askLiveBuild()])).resolves.toStrictEqual([7, 7]);
    await askLiveBuild();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should call a server that does not answer in time unreachable', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    );
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return Response.json({ buildId: 7 });
    });

    await expect(askLiveBuild()).resolves.toBe('unreachable');
  });

  it('should call a network failure unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(askLiveBuild()).resolves.toBe('unreachable');
  });

  it.each([
    ['a non-OK answer', async () => new Response('', { status: 404 })],
    ['an answer without a build id', async () => Response.json({})],
    [
      'an SPA fallback document (desktop and tau serve have no build endpoint)',
      async () => new Response('<!DOCTYPE html><html></html>', { headers: { 'content-type': 'text/html' } }),
    ],
  ])('should say the host names no build for %s', async (_label, answer) => {
    vi.stubGlobal('fetch', answer);

    await expect(askLiveBuild()).resolves.toBe('none');
  });
});
