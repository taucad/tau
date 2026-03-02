/**
 * Geometry Cache Middleware
 *
 * Caches createGeometry results to avoid redundant kernel computations.
 * Uses a content-addressable cache based on all dependencies (file content hashes,
 * middleware signatures, framework version, and kernel options).
 *
 * Uses wrap-style hooks with onion model:
 * 1. Check cache - if hit, return cached result (short-circuit)
 * 2. If miss, call handler() to execute downstream
 * 3. Write result to cache on the way back up
 *
 * Short-circuited results still flow through upstream middleware (e.g., transform)
 * because each middleware wraps around the next in the onion model.
 *
 * Storage format: MessagePack binary serialization for efficient storage of
 * binary geometry data (GLTF) without base64 encoding overhead.
 */

import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import type { GeometryResponse } from '@taucad/types';
import { z } from 'zod';
import { joinPath } from '@taucad/utils/path';
import type { KernelFileSystem } from '#types/kernel-worker.types.js';
import type { KernelSuccessResult } from '#types/kernel.types.js';
import { defineMiddleware } from '#middleware/kernel-middleware.js';
import { getDirectoryStat, ensureDirectoryExists } from '#framework/filesystem-helpers.js';

/**
 * Cache entry structure for MessagePack serialization.
 * Stores the full KernelSuccessResult so that all fields (geometries, issues,
 * and any future additions) are persisted implicitly.
 */
type CacheEntry = {
  version: 2;
  result: KernelSuccessResult<GeometryResponse[]>;
};

/**
 * Serialize a successful geometry result for cache storage using MessagePack.
 * The entire result (geometries + issues) is stored directly; MessagePack
 * handles Uint8Array natively so no base64 conversion is needed.
 *
 * @param result - The successful geometry result to serialize
 * @returns Binary MessagePack-encoded data
 */
function serializeResult(result: KernelSuccessResult<GeometryResponse[]>): Uint8Array<ArrayBuffer> {
  const entry: CacheEntry = { version: 2, result };
  return msgpackEncode(entry);
}

/**
 * Deserialize a geometry result from cache storage using MessagePack.
 * Returns the full KernelSuccessResult including issues.
 *
 * @param data - Binary MessagePack-encoded data
 * @returns The deserialized result with geometries and issues
 * @throws Error if cache format is invalid or incompatible version
 */
function deserializeResult(data: Uint8Array<ArrayBuffer>): KernelSuccessResult<GeometryResponse[]> {
  const decoded: unknown = msgpackDecode(data);

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('version' in decoded) ||
    decoded.version !== 2 ||
    !('result' in decoded)
  ) {
    throw new Error('Invalid or incompatible cache format');
  }

  const entry = decoded as CacheEntry;

  // Copy GLTF Uint8Arrays to ensure we have proper ArrayBuffers
  // (MessagePack may return views into a shared buffer)
  for (const geometry of entry.result.data) {
    if (geometry.format === 'gltf') {
      geometry.content = new Uint8Array(geometry.content);
    }
  }

  return entry.result;
}

/**
 * Get the cache file path for a given cache key.
 * Uses .bin extension for MessagePack binary storage.
 *
 * @param basePath - The base path for the build
 * @param cacheKey - The cache key
 * @returns The full path to the cache file
 */
function getCachePath(basePath: string, cacheKey: string): string {
  return joinPath(basePath, '.tau/cache/geometry', `${cacheKey}.bin`);
}

/**
 * Get the cache directory path.
 *
 * @param basePath - The base path for the build
 * @returns The full path to the cache directory
 */
function getCacheDir(basePath: string): string {
  return joinPath(basePath, '.tau/cache/geometry');
}

/**
 * Check if any geometries in the result have webrtc format.
 * Video-stream geometries cannot be cached as they contain live streams.
 *
 * @param geometries - The geometries to check
 * @returns True if any geometry is a webrtc
 */
function hasVideoStreamGeometry(geometries: readonly GeometryResponse[]): boolean {
  return geometries.some((geometry) => geometry.format === 'webrtc');
}

/**
 * Clean up old cache entries to prevent unbounded cache growth.
 * Deletes entries older than maxAgeMs and keeps only maxEntries most recent files.
 */
async function cleanupOldCacheEntries({
  filesystem,
  cacheDir,
  maxAgeMs,
  maxEntries,
}: {
  /** The filesystem for file operations */
  filesystem: KernelFileSystem;
  /** The cache directory path */
  cacheDir: string;
  /** Maximum age in milliseconds for cache entries */
  maxAgeMs: number;
  /** Maximum number of cache entries to keep */
  maxEntries: number;
}): Promise<void> {
  try {
    const files = await getDirectoryStat(filesystem, cacheDir);

    // Filter to only .bin cache files (MessagePack binary format)
    const cacheFiles = files.filter((file) => file.type === 'file' && file.name.endsWith('.bin'));

    if (cacheFiles.length === 0) {
      return;
    }

    const now = Date.now();
    const filesToDelete: string[] = [];

    // First pass: identify files older than maxAgeMs
    for (const file of cacheFiles) {
      const age = now - file.mtimeMs;
      if (age > maxAgeMs) {
        filesToDelete.push(joinPath(cacheDir, file.path));
      }
    }

    // Second pass: if still over maxEntries, delete oldest files
    const remainingFiles = cacheFiles.filter((file) => {
      const fullPath = joinPath(cacheDir, file.path);
      return !filesToDelete.includes(fullPath);
    });

    if (remainingFiles.length > maxEntries) {
      // Sort by modification time (oldest first)
      remainingFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

      // Delete oldest files to get under maxEntries
      const excessCount = remainingFiles.length - maxEntries;
      for (let index = 0; index < excessCount; index++) {
        const file = remainingFiles[index];
        if (file) {
          filesToDelete.push(joinPath(cacheDir, file.path));
        }
      }
    }

    // Delete identified files
    await Promise.all(filesToDelete.map(async (path) => filesystem.unlink(path)));
  } catch {
    // Cleanup errors are non-fatal - silently ignore
  }
}

/**
 * Geometry cache middleware.
 *
 * Caches createGeometry results based on all dependencies (files, middleware, framework, options).
 * Uses wrap-style hook with onion model execution:
 * - Check cache before calling handler()
 * - Write to cache after handler() returns (on cache miss)
 * - Short-circuited results still flow through upstream middleware
 *
 * Export operations are not cached - they are delegated to kernel workers
 * which handle format-specific conversion (e.g., GLTF JSON vs GLB binary).
 */
export const geometryCacheMiddleware = defineMiddleware({
  name: 'GeometryCache',
  version: '1.0.0',

  optionsSchema: z.object({
    maxEntries: z.number().default(100),
    maxAgeMs: z.number().default(7 * 24 * 60 * 60 * 1000),
  }),

  async wrapCreateGeometry(input, handler, { logger, filesystem, dependencyHash, options }) {
    const { basePath } = input;
    // Use pre-computed dependency hash as cache key
    const cacheKey = dependencyHash;
    const cachePath = getCachePath(basePath, cacheKey);

    // 1. Try reading cache directly (single round-trip instead of exists + readFile)
    try {
      const cachedData = await filesystem.readFile(cachePath);
      logger.debug(`Cache hit for ${cacheKey}`);

      return deserializeResult(cachedData);
    } catch (error) {
      // Cache miss or read error - proceed to compute
      logger.debug(`Cache miss for ${cacheKey}: ${String(error)}`);
    }

    // 2. Cache miss - execute downstream
    logger.debug(`Cache miss for ${cacheKey}`);
    const result = await handler(input);

    // 4. Write to cache on the way back up (skip if webrtc geometries present)
    if (result.success && result.data.length > 0) {
      // Skip caching if any geometry is a webrtc - these cannot be cached
      // and would result in incomplete data on cache hit
      if (hasVideoStreamGeometry(result.data)) {
        logger.debug(`Skipping cache for ${cacheKey}: contains webrtc geometry`);
      } else {
        try {
          // Ensure cache directory exists
          const cacheDir = getCacheDir(basePath);
          await ensureDirectoryExists(filesystem, cacheDir);

          const serialized = serializeResult(result);
          await filesystem.writeFile(cachePath, serialized);
          logger.debug(`Cached ${result.data.length} geometries at ${cacheKey}`);

          // Cleanup old cache entries to prevent unbounded growth
          await cleanupOldCacheEntries({
            filesystem,
            cacheDir,
            maxAgeMs: options.maxAgeMs,
            maxEntries: options.maxEntries,
          });
        } catch (error) {
          // Cache write error - log and continue
          logger.warn(`Cache write error for ${cacheKey}: ${String(error)}`);
        }
      }
    }

    return result;
  },
});
