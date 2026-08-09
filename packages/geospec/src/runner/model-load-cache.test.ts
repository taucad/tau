import { describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecModelLoader, LoadModelOptions } from '#model/types.js';
import {
  createCachedModelLoader,
  createModelLoadCacheKey,
  isCachedModelLoader,
  readThreadedModelLoadCacheKey,
} from '#runner/model-load-cache.js';

describe('cached model loader rejection handling', () => {
  it('should not memoize a rejected load and retry on the next call', async () => {
    let calls = 0;
    const subject = { kind: 'geometry-subject' } as unknown as GeometrySubject;
    const loader = (async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('first load failed');
      }
      return subject;
    }) as GeoSpecModelLoader;

    const cached = createCachedModelLoader(loader)!;
    // oxlint-disable-next-line typescript/consistent-type-assertions -- intentionally invalid options for the error path.
    const options = { plan: { kind: 'unit' } } as unknown as Parameters<GeoSpecModelLoader>[0];

    await expect(cached(options)).rejects.toThrow('first load failed');
    // Same key: a memoized rejection would return the failed promise without re-invoking.
    await expect(cached(options)).resolves.toBe(subject);
    expect(calls).toBe(2);
  });
});

describe('cached model loader branding and key threading (R10)', () => {
  const subject = { kind: 'geometry-subject' } as unknown as GeometrySubject;

  it('should brand cached loaders so downstream layers can skip re-wrapping', () => {
    const loader = (async () => subject) as GeoSpecModelLoader;

    const cached = createCachedModelLoader(loader)!;

    expect(isCachedModelLoader(cached)).toBe(true);
    expect(isCachedModelLoader(loader)).toBe(false);
    expect(isCachedModelLoader(undefined)).toBe(false);
  });

  it('should thread the canonical cache key to the underlying loader on keyed loads', async () => {
    let received: LoadModelOptions | undefined;
    const loader = (async (options: LoadModelOptions) => {
      received = options;
      return subject;
    }) as GeoSpecModelLoader;
    const cached = createCachedModelLoader(loader)!;
    const options: LoadModelOptions = { file: 'assembly.ts', format: 'step', parameters: { include: ['b', 'a'] } };

    await cached(options);

    // The build lock must serialize on exactly the key the wrapper cached
    // under — byte-equal to an independent canonicalization of the options.
    expect(received).toBeDefined();
    expect(readThreadedModelLoadCacheKey(received!)).toBe(createModelLoadCacheKey(options));
  });

  it('should not thread a key on raw source loads that bypass the cache', async () => {
    let received: LoadModelOptions | undefined;
    const loader = (async (options: LoadModelOptions) => {
      received = options;
      return subject;
    }) as GeoSpecModelLoader;
    const cached = createCachedModelLoader(loader)!;
    // oxlint-disable-next-line typescript/consistent-type-assertions -- minimal raw-source options for the bypass path.
    const options = { source: { format: 'mesh-buffer' } } as unknown as LoadModelOptions;

    await cached(options);

    expect(received).toBe(options);
    expect(readThreadedModelLoadCacheKey(received!)).toBeUndefined();
  });
});
