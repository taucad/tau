import { describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecModelLoader } from '#model/types.js';
import { createCachedModelLoader } from '#runner/model-load-cache.js';

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
    const options = { plan: { kind: 'unit' } } as never;

    await expect(cached(options)).rejects.toThrow('first load failed');
    // Same key: a memoized rejection would return the failed promise without re-invoking.
    await expect(cached(options)).resolves.toBe(subject);
    expect(calls).toBe(2);
  });
});
