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
import type { ExportFile, GeometryResponse } from '@taucad/types';
import { z } from 'zod';
import { LruMap } from '@taucad/utils/cache';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import type { ExportGeometryResult, KernelSuccessResult } from '#types/runtime.types.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { nativeBuildInputSymbol } from '#framework/render-artifact.js';
import type { NativeBuildInput, NativeBuildInputCarrier } from '#framework/render-artifact.js';

type BuildCacheResult = KernelSuccessResult<GeometryResponse | undefined> & NativeBuildInputCarrier;

/**
 * In-memory L1 cache for deserialized geometry results.
 * Module-scoped so each worker gets its own cache.
 * Smaller than parameter cache due to larger value sizes (binary GLTF).
 * Exported for test isolation (`beforeEach` → `.clear()`).
 *
 * After the mesh/build/export split, entries for kernels that defer display to
 * `meshGeometry` carry `data: undefined` plus a `serializedNativeHandle` — the
 * build-cache role. Mesh-native kernels keep inline display data as before.
 * @public
 */
export const geometryMemoryCache = new LruMap<BuildCacheResult>({ maxEntries: 20 });

/**
 * In-memory L1 cache for display-mesh results produced by the `meshGeometry` phase.
 * Keyed on the same dependency hash as the build entry (render options are part
 * of the hash). Exported for test isolation.
 * @public
 */
export const meshMemoryCache = new LruMap<KernelSuccessResult<GeometryResponse>>({ maxEntries: 20 });

/**
 * In-memory L1 cache for export results.
 * Export files are cloned on read/write so transferred buffers cannot poison
 * subsequent cache hits.
 * @public
 */
export const exportMemoryCache = new LruMap<KernelSuccessResult<ExportFile[]>>({ maxEntries: 20 });

/**
 * Cache entry structure for MessagePack serialization.
 * Stores the full KernelSuccessResult so that all fields (geometry, issues,
 * serializedNativeHandle, and any future additions) are persisted implicitly.
 *
 * Version 7: build entries carry the exact terminal kernel input separately
 * from the public result. Older entries and build entries without replay input
 * are treated as misses.
 */
type CacheEntry =
  | {
      version: 7;
      kind: 'build';
      result: KernelSuccessResult<GeometryResponse | undefined>;
      nativeBuildInput: NativeBuildInput;
    }
  | {
      version: 7;
      kind: 'mesh';
      result: KernelSuccessResult<GeometryResponse>;
    };

type ExportCacheEntry = {
  version: 1;
  kind: 'export';
  result: KernelSuccessResult<ExportFile[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNativeBuildInput(value: unknown): value is NativeBuildInput {
  if (!isRecord(value) || typeof value['entryPath'] !== 'string' || !isRecord(value['parameters'])) {
    return false;
  }
  return !Object.hasOwn(value, 'options') || isRecord(value['options']);
}

/**
 * Serialize a successful geometry result for cache storage using MessagePack.
 * The entire result (geometry + issues) is stored directly; MessagePack
 * handles Uint8Array natively so no base64 conversion is needed.
 *
 * @param result - The successful geometry result to serialize
 * @returns Binary MessagePack-encoded data
 */
function serializeBuildResult(result: BuildCacheResult): Uint8Array<ArrayBuffer> {
  const nativeBuildInput = result[nativeBuildInputSymbol];
  if (!nativeBuildInput) {
    throw new Error('Cannot cache a native build without exact replay input');
  }
  const { [nativeBuildInputSymbol]: _nativeBuildInput, ...publicResult } = result;
  const entry: CacheEntry = { version: 7, kind: 'build', result: publicResult, nativeBuildInput };
  return msgpackEncode(entry);
}

function serializeMeshResult(result: KernelSuccessResult<GeometryResponse>): Uint8Array<ArrayBuffer> {
  const entry: CacheEntry = { version: 7, kind: 'mesh', result };
  return msgpackEncode(entry);
}

/**
 * Deserialize a geometry result from cache storage using MessagePack.
 * Returns the full KernelSuccessResult including issues.
 *
 * @param data - Binary MessagePack-encoded data
 * @returns The deserialized result with geometry and issues
 * @throws Error if cache format is invalid or incompatible version
 */
function deserializeResult(data: Uint8Array<ArrayBuffer>, kind: CacheEntry['kind']): CacheEntry {
  const decoded: unknown = msgpackDecode(data);

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('version' in decoded) ||
    decoded.version !== 7 ||
    !('kind' in decoded) ||
    decoded.kind !== kind ||
    !('result' in decoded) ||
    (kind === 'build' && (!('nativeBuildInput' in decoded) || !isNativeBuildInput(decoded.nativeBuildInput)))
  ) {
    throw new Error('Invalid or incompatible cache format');
  }

  const entry = decoded as CacheEntry;

  // MessagePack serializes `undefined` as null, so decoded build-cache entries
  // (deferred display, no data) carry a nullish `data` — normalize back to the
  // wire contract before the entry is used.
  entry.result.data ??= undefined;

  // Copy GLTF Uint8Arrays to ensure we have proper ArrayBuffers
  // (MessagePack may return views into a shared buffer)
  if (entry.result.data?.format === 'gltf') {
    entry.result.data.content = new Uint8Array(entry.result.data.content);
  }

  return entry;
}

function deserializeBuildResult(data: Uint8Array<ArrayBuffer>): BuildCacheResult {
  const entry = deserializeResult(data, 'build');
  if (entry.kind !== 'build') {
    throw new Error('Invalid build cache entry');
  }
  return { ...entry.result, [nativeBuildInputSymbol]: entry.nativeBuildInput };
}

function deserializeMeshResult(data: Uint8Array<ArrayBuffer>): KernelSuccessResult<GeometryResponse> {
  const { result } = deserializeResult(data, 'mesh');
  if (result.data === undefined) {
    throw new Error('Invalid mesh cache entry: missing display geometry');
  }
  return { ...result, data: result.data };
}

function serializeExportResult(result: KernelSuccessResult<ExportFile[]>): Uint8Array<ArrayBuffer> {
  const entry: ExportCacheEntry = { version: 1, kind: 'export', result };
  return msgpackEncode(entry);
}

function deserializeExportResult(data: Uint8Array<ArrayBuffer>): KernelSuccessResult<ExportFile[]> {
  const decoded: unknown = msgpackDecode(data);

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('version' in decoded) ||
    decoded.version !== 1 ||
    !('kind' in decoded) ||
    decoded.kind !== 'export' ||
    !('result' in decoded)
  ) {
    throw new Error('Invalid or incompatible export cache format');
  }

  const entry = decoded as ExportCacheEntry;
  for (const file of entry.result.data) {
    file.bytes = new Uint8Array(file.bytes);
  }
  return entry.result;
}

function cloneGeometry(geometry: GeometryResponse): GeometryResponse {
  if (geometry.format !== 'gltf') {
    return geometry;
  }
  return { ...geometry, content: new Uint8Array(geometry.content) };
}

function cloneSuccessResult<T extends GeometryResponse | undefined>(
  result: KernelSuccessResult<T>,
): KernelSuccessResult<T> {
  return {
    ...result,
    data: (result.data === undefined ? undefined : cloneGeometry(result.data)) as T,
    issues: [...result.issues],
  };
}

function cloneBuildSuccessResult(result: BuildCacheResult): BuildCacheResult {
  return { ...cloneSuccessResult(result), [nativeBuildInputSymbol]: result[nativeBuildInputSymbol] };
}

function cloneExportFile(file: ExportFile): ExportFile {
  return { ...file, bytes: new Uint8Array(file.bytes) };
}

function cloneExportSuccessResult(result: KernelSuccessResult<ExportFile[]>): KernelSuccessResult<ExportFile[]> {
  return {
    ...result,
    data: result.data.map((file) => cloneExportFile(file)),
    issues: [...result.issues],
  };
}

/**
 * Get the cache file path for a given cache key.
 * Uses .bin extension for MessagePack binary storage.
 *
 * @param cacheKey - identifier used to locate and deduplicate cached geometry files
 * @returns The full path to the cache file
 */
function getCachePath(cacheKey: string): string {
  return `/.tau/cache/geometry/${cacheKey}.bin`;
}

/**
 * Get the cache file path for a display-mesh entry.
 *
 * @param cacheKey - identifier used to locate and deduplicate cached display meshes
 * @returns The full path to the mesh cache file
 */
function getMeshCachePath(cacheKey: string): string {
  return `/.tau/cache/geometry/mesh-${cacheKey}.bin`;
}

function getExportCachePath(cacheKey: string): string {
  return `/.tau/cache/geometry/export-${cacheKey}.bin`;
}

/**
 * Get the cache directory path.
 *
 * @returns The full path to the cache directory
 */
const cacheDirectory = '/.tau/cache/geometry';

/**
 * Check if the result has webrtc format.
 * Video-stream geometries cannot be cached as they contain live streams.
 */
function hasVideoStreamGeometry(geometry: GeometryResponse): boolean {
  return geometry.format === 'webrtc';
}

/**
 * Clean up old cache entries to prevent unbounded cache growth.
 * Deletes entries older than `maxAge` and keeps only `maxEntries` most recent files.
 */
async function cleanupOldCacheEntries({
  filesystem,
  cacheDirectory,
  maxAge,
  maxEntries,
}: {
  /** The filesystem for file operations */
  filesystem: KernelFileSystem;
  /** The cache directory path */
  cacheDirectory: string;
  /** Maximum age for cache entries. Milliseconds. */
  maxAge: number;
  /** Maximum number of cache entries to keep */
  maxEntries: number;
}): Promise<void> {
  try {
    const files = await filesystem.readdirStat(cacheDirectory);

    // Filter to only .bin cache files (MessagePack binary format)
    const cacheFiles = files.filter((file) => file.type === 'file' && file.name.endsWith('.bin'));

    if (cacheFiles.length === 0) {
      return;
    }

    const now = Date.now();
    const filesToDelete: string[] = [];

    // First pass: identify files older than maxAge
    for (const file of cacheFiles) {
      const age = now - file.mtimeMs;
      if (age > maxAge) {
        filesToDelete.push(file.path);
      }
    }

    // Second pass: if still over maxEntries, delete oldest files
    const remainingFiles = cacheFiles.filter((file) => !filesToDelete.includes(file.path));

    if (remainingFiles.length > maxEntries) {
      // Sort by modification time (oldest first)
      remainingFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

      // Delete oldest files to get under maxEntries
      const excessCount = remainingFiles.length - maxEntries;
      for (let index = 0; index < excessCount; index++) {
        const file = remainingFiles[index];
        if (file) {
          filesToDelete.push(file.path);
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
 * Caches createGeometry and exportGeometry results based on all dependencies
 * (files, middleware, framework, parameters, render options, export format/options).
 * Uses wrap-style hook with onion model execution:
 * - Check cache before calling handler()
 * - Write to cache after handler() returns (on cache miss)
 * - Short-circuited results still flow through upstream middleware
 *
 * @public
 */
export const geometryCache = defineMiddleware({
  id: 'geometryCache',
  name: 'GeometryCache',
  version: '1.0.0',

  optionsSchema: z.object({
    maxEntries: z.number().default(100),
    /** Maximum age for cache entries. Milliseconds. */
    maxAge: z.number().default(7 * 24 * 60 * 60 * 1000),
  }),

  async wrapCreateGeometry(input, handler, { logger, filesystem, dependencyHash, options }) {
    const cacheKey = dependencyHash;

    // L1: In-memory cache (fast, no I/O or deserialization)
    const memoryCached = geometryMemoryCache.get(cacheKey);
    if (memoryCached) {
      logger.debug(`Geometry memory cache hit for ${cacheKey}`);
      return cloneBuildSuccessResult(memoryCached);
    }

    // L2: Filesystem cache
    const cachePath = getCachePath(cacheKey);
    try {
      const cachedData = await filesystem.readFile(cachePath);
      logger.debug(`Cache hit for ${cacheKey}`);

      const result = deserializeBuildResult(cachedData);
      geometryMemoryCache.set(cacheKey, cloneBuildSuccessResult(result));
      return result;
    } catch (error) {
      logger.debug(`Cache miss for ${cacheKey}: ${String(error)}`);
    }

    // Compute: execute downstream
    const result = await handler(input);

    // Write back to L2 and populate L1. Skip webrtc (live streams) and entries
    // with nothing durable to serve — no display data and no native-handle
    // snapshot (e.g. zoo's live-only session) — a hit on such an entry would
    // short-circuit the kernel and then force a redundant reheat.
    if (result.success) {
      const replayInput = (result as BuildCacheResult)[nativeBuildInputSymbol];
      if (result.data !== undefined && hasVideoStreamGeometry(result.data)) {
        logger.debug(`Skipping cache for ${cacheKey}: contains webrtc geometry`);
      } else if (!replayInput) {
        logger.debug(`Skipping cache for ${cacheKey}: missing exact native-build replay input`);
      } else if (result.data === undefined && result.serializedNativeHandle === undefined) {
        logger.debug(`Skipping cache for ${cacheKey}: no display data and no native-handle snapshot`);
      } else {
        geometryMemoryCache.set(cacheKey, cloneBuildSuccessResult(result));

        try {
          await filesystem.ensureDir(cacheDirectory);

          const serialized = serializeBuildResult(result);
          await filesystem.writeFile(cachePath, serialized);
          logger.debug(`Cached geometry at ${cacheKey}`);

          await cleanupOldCacheEntries({
            filesystem,
            cacheDirectory,
            maxAge: options.maxAge,
            maxEntries: options.maxEntries,
          });
        } catch (error) {
          logger.warn(`Cache write error for ${cacheKey}: ${String(error)}`);
        }
      }
    }

    return result;
  },

  async wrapMeshGeometry(input, handler, { logger, filesystem, dependencyHash, options }) {
    const cacheKey = dependencyHash;

    // L1: In-memory cache
    const memoryCached = meshMemoryCache.get(cacheKey);
    if (memoryCached) {
      logger.debug(`Mesh memory cache hit for ${cacheKey}`);
      return cloneSuccessResult(memoryCached);
    }

    // L2: Filesystem cache
    const cachePath = getMeshCachePath(cacheKey);
    try {
      const cachedData = await filesystem.readFile(cachePath);
      logger.debug(`Mesh cache hit for ${cacheKey}`);

      const result = deserializeMeshResult(cachedData);
      meshMemoryCache.set(cacheKey, cloneSuccessResult(result));
      return result;
    } catch (error) {
      logger.debug(`Mesh cache miss for ${cacheKey}: ${String(error)}`);
    }

    const result = await handler(input);

    if (result.success && result.data !== undefined) {
      if (hasVideoStreamGeometry(result.data)) {
        logger.debug(`Skipping mesh cache for ${cacheKey}: contains webrtc geometry`);
        return result;
      }
      const displayResult = { ...result, data: result.data };
      meshMemoryCache.set(cacheKey, cloneSuccessResult(displayResult));

      try {
        await filesystem.ensureDir(cacheDirectory);

        const serialized = serializeMeshResult(displayResult);
        await filesystem.writeFile(cachePath, serialized);
        logger.debug(`Cached display mesh at ${cacheKey}`);

        await cleanupOldCacheEntries({
          filesystem,
          cacheDirectory,
          maxAge: options.maxAge,
          maxEntries: options.maxEntries,
        });
      } catch (error) {
        logger.warn(`Mesh cache write error for ${cacheKey}: ${String(error)}`);
      }
    }

    return result;
  },

  async wrapExportGeometry(input, handler, { logger, filesystem, dependencyHash, options }) {
    const cacheKey = dependencyHash;

    const memoryCached = exportMemoryCache.get(cacheKey);
    if (memoryCached) {
      logger.debug(`Export memory cache hit for ${cacheKey}`);
      return cloneExportSuccessResult(memoryCached);
    }

    const cachePath = getExportCachePath(cacheKey);
    try {
      const cachedData = await filesystem.readFile(cachePath);
      logger.debug(`Export cache hit for ${cacheKey}`);

      const result = deserializeExportResult(cachedData);
      exportMemoryCache.set(cacheKey, cloneExportSuccessResult(result));
      return result;
    } catch (error) {
      logger.debug(`Export cache miss for ${cacheKey}: ${String(error)}`);
    }

    const result: ExportGeometryResult = await handler(input);
    if (result.success && result.data.length > 0) {
      exportMemoryCache.set(cacheKey, cloneExportSuccessResult(result));

      try {
        await filesystem.ensureDir(cacheDirectory);

        const serialized = serializeExportResult(result);
        await filesystem.writeFile(cachePath, serialized);
        logger.debug(`Cached ${result.data.length} exports at ${cacheKey}`);

        await cleanupOldCacheEntries({
          filesystem,
          cacheDirectory,
          maxAge: options.maxAge,
          maxEntries: options.maxEntries,
        });
      } catch (error) {
        logger.warn(`Export cache write error for ${cacheKey}: ${String(error)}`);
      }
    }

    return result;
  },
});
