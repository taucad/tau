import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecModelLoader, LoadModelOptions } from '#model/types.js';

type JsonSerializable = string | number | boolean | JsonSerializable[] | { readonly [key: string]: JsonSerializable };

type JsonSerializationResult = { success: true; value: JsonSerializable | undefined } | { success: false };

/**
 * Observable counters for internal model-load cache tests and benchmarks.
 *
 * @internal
 */
export type GeoSpecModelLoadCacheStats = {
  hits: number;
  misses: number;
  bypasses: number;
  failures: number;
};

/**
 * Options accepted by the internal cached model-loader wrapper.
 *
 * @internal
 */
export type CreateCachedModelLoaderOptions = {
  stats?: GeoSpecModelLoadCacheStats;
  onLoadResolved?: (subject: GeometrySubject) => void;
};

const toDeterministicJsonValue = (
  value: unknown,
  seen: WeakSet<Record<string, unknown> | unknown[]> = new WeakSet<Record<string, unknown> | unknown[]>(),
): JsonSerializationResult => {
  if (value === undefined) {
    return { success: true, value: undefined };
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { success: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { success: true, value } : { success: false };
  }
  if (typeof value !== 'object' || value === null) {
    return { success: false };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return { success: false };
    }
    seen.add(value);
    const serialized: JsonSerializable[] = [];
    for (const item of value) {
      const result = toDeterministicJsonValue(item, seen);
      if (!result.success || result.value === undefined) {
        seen.delete(value);
        return { success: false };
      }
      serialized.push(result.value);
    }
    seen.delete(value);
    return { success: true, value: serialized };
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return { success: false };
  }

  const record = value as Record<string, unknown>;
  if (seen.has(record)) {
    return { success: false };
  }
  seen.add(record);
  const sortedEntries: Array<[string, JsonSerializable]> = [];
  for (const [key, entryValue] of Object.entries(record).sort(([left], [right]) => left.localeCompare(right))) {
    const result = toDeterministicJsonValue(entryValue, seen);
    if (!result.success) {
      seen.delete(record);
      return { success: false };
    }
    if (result.value !== undefined) {
      sortedEntries.push([key, result.value]);
    }
  }
  seen.delete(record);
  return { success: true, value: Object.fromEntries(sortedEntries) as JsonSerializable };
};

/**
 * Create an order-stable cache key for deterministic runtime-backed
 * `loadModel()` options. Raw `source` loads intentionally bypass caching.
 *
 * @internal
 */
export const createModelLoadCacheKey = (options: unknown): string | undefined => {
  if (typeof options !== 'object' || options === null || Array.isArray(options) || 'source' in options) {
    return undefined;
  }
  const serialized = toDeterministicJsonValue(options);
  return serialized.success && serialized.value !== undefined ? JSON.stringify(serialized.value) : undefined;
};

/**
 * Create fresh model-load cache counters.
 *
 * @internal
 */
export const createModelLoadCacheStats = (): GeoSpecModelLoadCacheStats => ({
  hits: 0,
  misses: 0,
  bypasses: 0,
  failures: 0,
});

/**
 * Wrap a GeoSpec model loader with deterministic in-flight/resolved/rejected
 * promise caching for one runner lifetime.
 *
 * @internal
 */
export const createCachedModelLoader = (
  modelLoader: GeoSpecModelLoader | undefined,
  options: CreateCachedModelLoaderOptions = {},
): GeoSpecModelLoader | undefined => {
  if (!modelLoader) {
    return undefined;
  }

  const cache = new Map<string, Promise<GeometrySubject>>();
  const { onLoadResolved, stats } = options;

  return (async (loadOptions: LoadModelOptions) => {
    const key = createModelLoadCacheKey(loadOptions);
    if (!key) {
      if (stats) {
        stats.bypasses += 1;
      }
      const subject = await modelLoader(loadOptions);
      onLoadResolved?.(subject);
      return subject;
    }

    const cached = cache.get(key);
    if (cached) {
      if (stats) {
        stats.hits += 1;
      }
      return cached;
    }

    if (stats) {
      stats.misses += 1;
    }
    const promise = (async () => {
      try {
        const subject = await modelLoader(loadOptions);
        onLoadResolved?.(subject);
        return subject;
      } catch (error) {
        if (stats) {
          stats.failures += 1;
        }
        throw error;
      }
    })();
    cache.set(key, promise);
    return promise;
  }) as GeoSpecModelLoader;
};
