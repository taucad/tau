import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackageArtifactCache } from '#package-artifact-cache.js';
import { createTestFileSystem } from '#testing.fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('PackageArtifactCache', () => {
  it('deduplicates acquisition and requires a committed, hash-valid manifest for hits', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('/* package@1.2.3 */ export const value = 1;', {
          headers: { 'content-type': 'text/javascript' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const filesystem = createTestFileSystem();
    const cache = new PackageArtifactCache(filesystem);
    const { signal } = new AbortController();

    const [first, concurrent] = await Promise.all([cache.ensure('package', signal), cache.ensure('package', signal)]);
    const hit = await cache.ensure('package', signal);

    expect(concurrent).toEqual(first);
    expect(hit).toEqual(first);
    expect(first.exactVersion).toBe('1.2.3');
    expect(first.bytesHash).toMatch(/^[\da-f]{64}$/u);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not publish a request manifest after abort', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', async () => {
      controller.abort();
      return new Response('/* package@1.2.3 */ export {};');
    });
    const cache = new PackageArtifactCache(createTestFileSystem());
    await expect(cache.ensure('package', controller.signal)).rejects.toThrow();
  });

  it('keeps a deduplicated acquisition alive for a non-aborted waiter', async () => {
    const first = new AbortController();
    let releaseResponse!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await responseReady;
      return new Response('/* package@1.2.3 */ export {};');
    });
    vi.stubGlobal('fetch', fetchMock);
    const cache = new PackageArtifactCache(createTestFileSystem());

    const aborted = cache.ensure('package', first.signal);
    const survivor = cache.ensure('package', new AbortController().signal);
    first.abort();
    releaseResponse();

    await expect(aborted).rejects.toThrow();
    await expect(survivor).resolves.toMatchObject({ exactVersion: '1.2.3' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to jsDelivr and preserves scoped subpath identity', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('/* @scope/package@2.4.6 */ export {};'));
    vi.stubGlobal('fetch', fetchMock);
    const cache = new PackageArtifactCache(createTestFileSystem());

    const identity = await cache.ensure('@scope/package/subpath', new AbortController().signal);

    expect(identity).toMatchObject({
      exactVersion: '2.4.6',
      resolutionMetadata: {
        requestedSpecifier: '@scope/package/subpath',
        provider: 'jsdelivr',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized and timed-out responses without committing a hit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, { signal }: { signal: AbortSignal }) => {
        signal.throwIfAborted();
        return new Response('', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } });
      }),
    );
    const cache = new PackageArtifactCache(createTestFileSystem());
    await expect(cache.ensure('large', new AbortController().signal)).rejects.toThrow('Failed to acquire');

    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('timed out', 'TimeoutError')));
    const timedOut = new PackageArtifactCache(createTestFileSystem());
    await expect(timedOut.ensure('slow', new AbortController().signal)).rejects.toThrow('Failed to acquire');
  });

  it('treats an artifact without its request commit marker as a miss', async () => {
    const backing = createTestFileSystem();
    let rejectManifest = true;
    const filesystem = {
      ...backing,
      writeFile: async (path: string, content: string) => {
        if (rejectManifest && path.includes('/requests/')) {
          throw new Error('manifest write failed');
        }
        await backing.writeFile(path, content);
      },
    };
    const fetchMock = vi.fn(async () => new Response('/* package@1.2.3 */ export {};'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new PackageArtifactCache(filesystem).ensure('package', new AbortController().signal)).rejects.toThrow(
      'Failed to acquire',
    );
    rejectManifest = false;
    await expect(
      new PackageArtifactCache(filesystem).ensure('package', new AbortController().signal),
    ).resolves.toMatchObject({ exactVersion: '1.2.3' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
