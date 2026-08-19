/**
 * Parameter Cache Middleware
 *
 * Caches getParameters results to avoid redundant parameter parsing.
 * Uses the pre-computed dependency hash from the runtime environment.
 *
 * Uses wrap-style hooks with onion model:
 * 1. Check cache - if hit, return cached result (short-circuit)
 * 2. If miss, call handler() to execute downstream
 * 3. Write result to cache on the way back up
 */

import { z } from 'zod';
import { LruMap } from '@taucad/utils/cache';
import type { GetParametersResult } from '#types/runtime.types.js';
import { getParametersResultSchema } from '#types/runtime-protocol.schemas.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { cleanupOldCacheEntries } from '#middleware/_internal/cache-retention.js';

/**
 * In-memory L1 cache for parsed parameter results.
 * Module-scoped so each worker gets its own cache.
 * Exported for test isolation (`beforeEach` → `.clear()`).
 * @public
 */
export const parameterMemoryCache = new LruMap<GetParametersResult>({ maxEntries: 50 });

/**
 * Get the cache file path for a given cache key.
 *
 * @param cacheKey - identifier used to locate and deduplicate cached parameter files
 * @returns The full path to the cache file
 */
function getCachePath(cacheKey: string): string {
  return `/.tau/cache/parameters/${cacheKey}.json`;
}

/**
 * Get the cache directory path.
 *
 * @returns The full path to the cache directory
 */
const cacheDirectory = '/.tau/cache/parameters';

/**
 * Parameter cache middleware.
 *
 * Caches getParameters results based on file dependencies.
 * Uses wrap-style hook with onion model execution:
 * - Check cache before calling handler()
 * - Write to cache after handler() returns (on cache miss)
 * @public
 */
export const parameterCache = defineMiddleware({
  id: 'parameterCache',
  name: 'ParameterCache',
  version: '1.0.0',

  optionsSchema: z.object({
    maxEntries: z.number().default(100),
    /** Maximum age for cache entries. Milliseconds. */
    maxAge: z.number().default(7 * 24 * 60 * 60 * 1000),
  }),

  async wrapGetParameters(input, handler, { logger, filesystem, dependencyHash, options }) {
    const cacheKey = dependencyHash;

    // L1: In-memory cache (fast, no I/O)
    const memoryCached = parameterMemoryCache.get(cacheKey);
    if (memoryCached) {
      logger.debug(`Parameter memory cache hit for ${cacheKey}`);
      return memoryCached;
    }

    // L2: Filesystem cache
    const cachePath = getCachePath(cacheKey);
    try {
      const cachedData = await filesystem.readFile(cachePath, 'utf8');
      logger.debug(`Parameter cache hit for ${cacheKey}`);

      const parsed = getParametersResultSchema.safeParse(JSON.parse(cachedData));
      if (!parsed.success) {
        throw parsed.error;
      }
      const cachedResult = parsed.data as GetParametersResult;
      parameterMemoryCache.set(cacheKey, cachedResult);
      return cachedResult;
    } catch (error) {
      logger.debug(`Parameter cache miss for ${cacheKey}: ${String(error)}`);
    }

    // Compute: execute downstream
    const result = await handler(input);

    // Write back to L2 and populate L1
    if (result.success) {
      parameterMemoryCache.set(cacheKey, result);
      try {
        await filesystem.ensureDir(cacheDirectory);

        await filesystem.writeFile(cachePath, JSON.stringify(result));
        logger.debug(`Cached parameters at ${cacheKey}`);

        await cleanupOldCacheEntries({
          filesystem,
          cacheDirectory,
          extension: '.json',
          maxAge: options.maxAge,
          maxEntries: options.maxEntries,
        });
      } catch (error) {
        logger.warn(`Parameter cache write error for ${cacheKey}: ${String(error)}`);
      }
    }

    return result;
  },
});
