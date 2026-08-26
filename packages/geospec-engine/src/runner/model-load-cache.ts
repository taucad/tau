/**
 * Run-scoped model-load dedupe.
 *
 * Several tests in a file usually load the same model. Loading it once per run
 * is the whole win — but this cache is **run-scoped dedupe and must never
 * outlive a run**: the kernel's own `dependencyHash` is the only authority on
 * geometry freshness, and a cache that survived a run would start answering
 * for source the author has since edited.
 *
 * The key is recursively key-sorted JSON of the load options, so property order
 * cannot split an entry. Options that cannot be serialized faithfully — a live
 * runtime client, a callback, a circular graph — **bypass** the cache rather
 * than collapsing onto a lossy key.
 *
 * @module
 */

import { canonicalJson } from '#cache/evidence-cache.js';
import type { GeoSpecModelLoader, LoadModelOptions } from 'geospec/model';
import type { GeoSpecModelLoadCacheStats } from '#runner/profile.js';
import type { GeometrySubject } from 'geospec/mesh';

/**
 * Options for {@link createCachedModelLoader}.
 *
 * @public
 */
export type CreateCachedModelLoaderOptions = {
  /** Counters to populate. */
  stats?: GeoSpecModelLoadCacheStats;
  /** Fired for every resolved load — including cache hits. */
  onLoadResolved?: (subject: GeometrySubject) => void;
  /** Fired with the cache key of every cacheable load. */
  onCacheKey?: (key: string) => void;
};

/**
 * Whether a value survives a JSON round-trip with its identity intact.
 *
 * Functions, symbols and bigints are the interesting cases: `JSON.stringify`
 * silently drops the first two, which would make two different runtimes share
 * one key.
 *
 * @param value - The value to inspect.
 * @param seen - Objects already visited, so a cycle is detected rather than
 * recursed into.
 * @returns True when the value can key an entry faithfully.
 */
const isSerializable = (value: unknown, seen: Set<unknown>): boolean => {
  if (value === null) {
    return true;
  }
  const kind = typeof value;
  if (kind === 'function' || kind === 'symbol' || kind === 'bigint' || kind === 'undefined') {
    return false;
  }
  if (kind !== 'object') {
    return true;
  }
  const record = value as Record<string, unknown>;
  if (seen.has(record)) {
    return false;
  }
  seen.add(record);
  const entries = Array.isArray(record) ? record : Object.values(record);
  return entries.every((entry) => isSerializable(entry, seen));
};

/**
 * Wrap a model loader with run-scoped dedupe.
 *
 * @param loader - The loader to wrap, or `undefined`.
 * @param options - Counters and observation hooks.
 * @returns The wrapped loader, or `undefined` when there was nothing to wrap.
 * @public
 */
export const createCachedModelLoader = (
  loader: GeoSpecModelLoader | undefined,
  options: CreateCachedModelLoaderOptions = {},
): GeoSpecModelLoader | undefined => {
  if (!loader) {
    return undefined;
  }
  const { stats, onLoadResolved, onCacheKey } = options;
  const entries = new Map<string, Promise<GeometrySubject>>();

  const cached = async <Code extends Record<string, string>>(
    loadOptions: LoadModelOptions<Code>,
  ): Promise<GeometrySubject> => {
    if (!isSerializable(loadOptions, new Set())) {
      if (stats) {
        stats.bypasses += 1;
      }
      const subject = await loader(loadOptions);
      onLoadResolved?.(subject);
      return subject;
    }
    const key = canonicalJson(loadOptions);
    onCacheKey?.(key);
    const existing = entries.get(key);
    if (existing) {
      if (stats) {
        stats.hits += 1;
      }
      // A hit still resolves a load for this caller, so the run's
      // subject-tracking hook has to fire again — otherwise the second test
      // holds a subject nobody will dispose.
      const subject = await existing;
      onLoadResolved?.(subject);
      return subject;
    }
    if (stats) {
      stats.misses += 1;
    }
    const pending = loader(loadOptions);
    entries.set(key, pending);
    let subject: GeometrySubject;
    try {
      subject = await pending;
    } catch (error) {
      // A failed load is never memoized: the next attempt must be able to
      // succeed once the author fixes the model.
      entries.delete(key);
      if (stats) {
        stats.failures += 1;
      }
      throw error;
    }
    onLoadResolved?.(subject);
    return subject;
  };

  return cached;
};
