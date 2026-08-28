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
import { LruMap, defineMiddleware, getParametersResultSchema } from '@taucad/runtime/middleware';
import type { MiddlewarePluginFactory, MiddlewarePluginRegistration } from '@taucad/runtime/middleware';
import type { GetParametersResult } from '@taucad/runtime/types';

import { createCacheRetentionTracker } from '#_internal/cache-retention.js';
import { traceCacheOperation } from '#_internal/cache-span.js';

/**
 * Get the cache file path for a given cache key.
 *
 * @param cacheKey - identifier used to locate and deduplicate cached parameter files
 * @returns The full path to the cache file
 */
function getCachePath(cacheKey: string): string {
  return `.tau/cache/parameters/${cacheKey}.json`;
}

/**
 * Get the cache directory path.
 *
 * @returns The full path to the cache directory
 */
const cacheDirectory = '.tau/cache/parameters';
const parameterCacheOptionsSchema = z.object({
  maxEntries: z.number().default(100),
  /** Maximum age for cache entries. Milliseconds. */
  maxAge: z.number().default(7 * 24 * 60 * 60 * 1000),
});
type ParameterCachePluginFactory = MiddlewarePluginFactory<
  'parameterCache',
  z.input<typeof parameterCacheOptionsSchema>,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Represents z.object({}) state
  z.ZodObject<{}>,
  typeof parameterCacheOptionsSchema
>;

/**
 * Parameter cache middleware.
 *
 * Caches getParameters results based on file dependencies.
 * Uses wrap-style hook with onion model execution:
 * - Check cache before calling handler()
 * - Write to cache after handler() returns (on cache miss)
 *
 * @param parameterMemoryCache - the L1 cache this registration owns
 * @returns The middleware plugin factory.
 */
const defineParameterCacheMiddleware = (
  parameterMemoryCache: LruMap<GetParametersResult>,
): ParameterCachePluginFactory => {
  const retainCache = createCacheRetentionTracker();

  return defineMiddleware({
    id: 'parameterCache',
    name: 'ParameterCache',
    version: '1.0.0',

    optionsSchema: parameterCacheOptionsSchema,

    async wrapGetParameters(input, handler, { logger, filesystem, dependencyHash, options, tracer }) {
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
        const cachedData = await traceCacheOperation(tracer, 'cache.parameter.read', async () =>
          filesystem.readFile(cachePath, 'utf8'),
        );
        logger.debug(`Parameter cache hit for ${cacheKey}`);

        const cachedResult = await traceCacheOperation(tracer, 'cache.parameter.decode', () => {
          const parsed = getParametersResultSchema.safeParse(JSON.parse(cachedData));
          if (!parsed.success) {
            throw parsed.error;
          }
          return parsed.data as GetParametersResult;
        });
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
          const encoded = await traceCacheOperation(tracer, 'cache.parameter.encode', () => JSON.stringify(result));

          await traceCacheOperation(tracer, 'cache.parameter.write', async () => {
            await filesystem.ensureDir(cacheDirectory);
            await filesystem.writeFile(cachePath, encoded);
          });
          logger.debug(`Cached parameters at ${cacheKey}`);

          await traceCacheOperation(tracer, 'cache.parameter.prune', async () =>
            retainCache({
              filesystem,
              cacheDirectory,
              extension: '.json',
              writtenPath: cachePath,
              maxAge: options.maxAge,
              maxEntries: options.maxEntries,
            }),
          );
        } catch (error) {
          logger.warn(`Parameter cache write error for ${cacheKey}: ${String(error)}`);
        }
      }

      return result;
    },
  });
};

/**
 * Parameter cache middleware factory. Each registration owns its own L1 cache.
 *
 * @param options - cache retention options
 * @returns The middleware registration.
 * @public
 */
export const parameterCache: ParameterCachePluginFactory = (options) =>
  defineParameterCacheMiddleware(new LruMap<GetParametersResult>({ maxEntries: 50 }))(options);

/**
 * Registration bound to a caller-owned L1 cache so tests can inspect it.
 *
 * @internal
 *
 * @param parameterMemoryCache - the L1 cache this registration should use
 * @returns The middleware registration.
 */
export const parameterCacheWithCache = (
  parameterMemoryCache: LruMap<GetParametersResult>,
): MiddlewarePluginRegistration<
  'parameterCache',
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Represents z.object({}) state
  z.ZodObject<{}>,
  typeof parameterCacheOptionsSchema,
  undefined
> => defineParameterCacheMiddleware(parameterMemoryCache)();
