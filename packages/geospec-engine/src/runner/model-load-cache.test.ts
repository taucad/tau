import { describe, expect, it, vi } from 'vitest';
import { createCachedModelLoader } from '#runner/model-load-cache.js';
import { createGeoSpecModelLoadCacheStats } from '#runner/profile.js';
import type { GeoSpecModelLoader, LoadModelOptions } from 'geospec/model';
import type { GeometrySubject } from '#mesh/types.js';

const subject = (name: string): GeometrySubject =>
  ({ kind: 'geometry-subject', provenance: { source: { name } } }) as unknown as GeometrySubject;

describe('cached model loader', () => {
  it('should pass through when there is nothing to wrap', () => {
    expect(createCachedModelLoader(undefined)).toBeUndefined();
  });

  it('should load once per distinct option set, regardless of property order', async () => {
    const loader = vi.fn(async () => subject('a')) as unknown as GeoSpecModelLoader;
    const stats = createGeoSpecModelLoadCacheStats();
    const cached = createCachedModelLoader(loader, { stats })!;

    await cached({ file: 'part.ts', projectPath: '/p' });
    await cached({ projectPath: '/p', file: 'part.ts' });
    await cached({ file: 'other.ts', projectPath: '/p' });

    expect(loader).toHaveBeenCalledTimes(2);
    expect(stats).toEqual({ hits: 1, misses: 2, bypasses: 0, failures: 0 });
  });

  it('should re-fire onLoadResolved on a hit so the run still tracks the subject', async () => {
    const loaded = subject('a');
    const loader = vi.fn(async () => loaded) as unknown as GeoSpecModelLoader;
    const onLoadResolved = vi.fn();
    const onCacheKey = vi.fn();
    const cached = createCachedModelLoader(loader, { onLoadResolved, onCacheKey })!;

    await cached({ file: 'part.ts' });
    await cached({ file: 'part.ts' });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(onLoadResolved).toHaveBeenCalledTimes(2);
    expect(onLoadResolved).toHaveBeenCalledWith(loaded);
    expect(onCacheKey).toHaveBeenCalledWith('{"file":"part.ts"}');
  });

  it('should bypass options that cannot be serialized faithfully', async () => {
    const loader = vi.fn(async () => subject('a')) as unknown as GeoSpecModelLoader;
    const stats = createGeoSpecModelLoadCacheStats();
    const onLoadResolved = vi.fn();
    const cached = createCachedModelLoader(loader, { stats, onLoadResolved })!;

    // A live runtime client carries methods `JSON.stringify` would silently
    // drop, collapsing two different runtimes onto one key.
    const runtime = { connect: async () => undefined, terminate: () => undefined, export: async () => ({}) };
    await cached({ file: 'part.ts', runtime } as unknown as LoadModelOptions);
    await cached({ file: 'part.ts', runtime } as unknown as LoadModelOptions);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(stats).toMatchObject({ bypasses: 2, hits: 0, misses: 0 });
    expect(onLoadResolved).toHaveBeenCalledTimes(2);
  });

  it('should bypass a circular option graph rather than throw', async () => {
    const loader = vi.fn(async () => subject('a')) as unknown as GeoSpecModelLoader;
    const stats = createGeoSpecModelLoadCacheStats();
    const cached = createCachedModelLoader(loader, { stats })!;
    const parameters: Record<string, unknown> = {};
    parameters['self'] = parameters;

    await cached({ file: 'part.ts', parameters });
    expect(stats.bypasses).toBe(1);
  });

  it('should keep serializable arrays and nulls cacheable', async () => {
    const loader = vi.fn(async () => subject('a')) as unknown as GeoSpecModelLoader;
    const stats = createGeoSpecModelLoadCacheStats();
    const cached = createCachedModelLoader(loader, { stats })!;

    await cached({ file: 'part.ts', parameters: { sizes: [1, 2], off: null, on: true } });
    await cached({ file: 'part.ts', parameters: { on: true, off: null, sizes: [1, 2] } });
    expect(stats).toMatchObject({ hits: 1, misses: 1, bypasses: 0 });
  });

  it('should never memoize a failed load', async () => {
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('kernel exploded');
      }
      return subject('a');
    }) as unknown as GeoSpecModelLoader;
    const stats = createGeoSpecModelLoadCacheStats();
    const cached = createCachedModelLoader(loader, { stats })!;

    await expect(cached({ file: 'part.ts' })).rejects.toThrow('kernel exploded');
    await expect(cached({ file: 'part.ts' })).resolves.toBeDefined();
    expect(stats).toMatchObject({ failures: 1, misses: 2, hits: 0 });
  });

  it('should work with no counters at all', async () => {
    const loader = vi.fn(async () => subject('a')) as unknown as GeoSpecModelLoader;
    const cached = createCachedModelLoader(loader)!;
    await cached({ file: 'part.ts' });
    await cached({ file: 'part.ts' });
    const runtime = { connect: async () => undefined };
    await cached({ file: 'part.ts', runtime } as unknown as LoadModelOptions);
    await expect(cached({ file: 'part.ts' })).resolves.toBeDefined();
  });

  it('should record a failure without counters too', async () => {
    const loader = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as GeoSpecModelLoader;
    const cached = createCachedModelLoader(loader)!;
    await expect(cached({ file: 'part.ts' })).rejects.toThrow('boom');
  });
});
