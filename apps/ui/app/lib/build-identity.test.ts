import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askLiveBuild,
  buildIdentityPath,
  liveBuildIdTimeout,
  parseBuildId,
  readBuildId,
  readBuildIdentity,
  readBuildRelease,
  readReportedBuildFloor,
  resolveMinBuildId,
  subscribeReportedBuildFloor,
  unknownBuildRelease,
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

describe('readBuildRelease', () => {
  it('should read the release the server published into window.ENV', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the host contract names window.ENV and its keys.
    vi.stubGlobal('window', { ENV: { TAU_RELEASE: 'abcdef012345' } });

    expect(readBuildRelease()).toBe('abcdef012345');
  });

  it('should accept a desktop semver release', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the host contract names window.ENV and its keys.
    vi.stubGlobal('window', { ENV: { TAU_RELEASE: '1.2.3' } });

    expect(readBuildRelease()).toBe('1.2.3');
  });

  /* `@TAU_RELEASE` is what an unstamped web build's server graph holds (`apps/ui/scripts/stamp-build-release.mts`). */
  it.each([undefined, '', 'main', 'v1.2.3', '@TAU_RELEASE'])('should answer the unknown release for %s', (release) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the host contract names window.ENV and its keys.
    vi.stubGlobal('window', { ENV: { TAU_RELEASE: release } });

    expect(readBuildRelease()).toBe(unknownBuildRelease);
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

  it.each([502, 503, 500, 429, 408, 403])(
    'should call a transient %i unreachable, not a host without an endpoint',
    async (status) => {
      vi.stubGlobal('fetch', async () => new Response('', { status }));

      await expect(askLiveBuild()).resolves.toBe('unreachable');
    },
  );

  it.each([
    [
      'times out while its body is read',
      async () =>
        new Response(
          new ReadableStream({
            start: (controller) => {
              controller.error(new DOMException('The operation timed out.', 'TimeoutError'));
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    ],
    [
      'is reset while its body is read',
      async () =>
        new Response(
          new ReadableStream({
            start: (controller) => {
              controller.error(new TypeError('network error'));
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    ],
    [
      'arrives truncated',
      async () => new Response('{"buildId":17927', { headers: { 'content-type': 'application/json' } }),
    ],
  ])('should call an OK JSON answer that %s unreachable, since it may pass', async (_label, answer) => {
    vi.stubGlobal('fetch', answer);

    await expect(askLiveBuild()).resolves.toBe('unreachable');
  });

  it.each([
    ['a 404', async () => new Response('', { status: 404 })],
    ['an answer without a build id', async () => Response.json({})],
    ['a JSON answer that is no object', async () => Response.json(null)],
    [
      'an SPA fallback document (desktop and tau serve have no build endpoint)',
      async () => new Response('<!DOCTYPE html><html></html>', { headers: { 'content-type': 'text/html' } }),
    ],
  ])('should say the host names no build for %s', async (_label, answer) => {
    vi.stubGlobal('fetch', answer);

    await expect(askLiveBuild()).resolves.toBe('none');
  });
});

describe('parseBuildId (FP2)', () => {
  it.each([
    [1_795_000_000_000, 1_795_000_000_000],
    ['1795000000000', 1_795_000_000_000],
  ])('should read %j as a build id', (value, expected) => {
    expect(parseBuildId(value)).toBe(expected);
  });

  it.each([undefined, '', 'not-a-number', '-5', '1.5', ' 7', '@TAU_RETAINED', 0, -5, 1.5, Number.NaN, '1e3'])(
    'should read %j as no build id',
    (value) => {
      expect(parseBuildId(value)).toBeUndefined();
    },
  );
});

describe('resolveMinBuildId (FP2)', () => {
  it('should be the oldest retained build when the operator set no floor', () => {
    expect(resolveMinBuildId({ operatorFloor: undefined, retainedFloor: '1795000000000' })).toBe(1_795_000_000_000);
  });

  it('should be the operator’s floor when no retained floor was stamped', () => {
    expect(resolveMinBuildId({ operatorFloor: '1795000000000', retainedFloor: '@TAU_RETAINED' })).toBe(
      1_795_000_000_000,
    );
  });

  it('should be the larger of the operator’s floor and the oldest retained build', () => {
    expect(resolveMinBuildId({ operatorFloor: '1795000000001', retainedFloor: '1795000000000' })).toBe(
      1_795_000_000_001,
    );
    expect(resolveMinBuildId({ operatorFloor: '1795000000000', retainedFloor: '1795000000002' })).toBe(
      1_795_000_000_002,
    );
  });

  it('should be no floor when neither names a build', () => {
    expect(resolveMinBuildId({ operatorFloor: '', retainedFloor: undefined })).toBeUndefined();
  });
});

describe('the build floor the server reports (FP2)', () => {
  it('should keep the minBuildId of the last whole answer and tell its subscribers', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReportedBuildFloor(listener);
    vi.stubGlobal('fetch', async () => Response.json({ buildId: 9, minBuildId: 7 }));
    await askLiveBuild();
    expect(readReportedBuildFloor()).toBe(7);

    vi.stubGlobal('fetch', async () => Response.json({ buildId: 9 }));
    await askLiveBuild();
    expect(readReportedBuildFloor()).toBe('none');
    expect(listener).toHaveBeenCalledTimes(2);

    // No whole answer: the last floor stands.
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await askLiveBuild();
    expect(readReportedBuildFloor()).toBe('none');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
