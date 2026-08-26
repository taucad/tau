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
 * Short-circuited results still flow through middleware registered before the
 * cache. Built-in output transforms run inside the cache and are persisted.
 *
 * Storage format: MessagePack binary serialization for efficient storage of
 * binary geometry data (GLTF) without base64 encoding overhead.
 */

import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import type {
  ExportFile,
  GeometryResponse,
  ExportGeometryResult,
  KernelIssue,
  KernelSuccessResult,
} from '@taucad/runtime/types';
import { z } from 'zod';
import { LruMap, defineMiddleware, nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type {
  MiddlewarePluginFactory,
  MiddlewarePluginRegistration,
  NativeBuildInput,
  NativeBuildInputCarrier,
} from '@taucad/runtime/middleware';

import { createCacheRetentionTracker } from '#_internal/cache-retention.js';
import { traceCacheOperation } from '#_internal/cache-span.js';

type BuildCacheResult = KernelSuccessResult<GeometryResponse | undefined> & NativeBuildInputCarrier;

/**
 * The three L1 in-memory caches, created once per middleware registration.
 *
 * `geometryMemoryCache` holds build results — after the mesh/build/export split,
 * entries for kernels that defer display to `meshGeometry` carry `data: undefined`
 * plus a `serializedNativeHandle`; mesh-native kernels keep inline display data.
 * `meshMemoryCache` is keyed on the full dependency hash including render options.
 * `exportMemoryCache` clones export files on read/write so transferred buffers
 * cannot poison subsequent hits.
 *
 * @internal
 */
export type GeometryCaches = {
  geometryMemoryCache: LruMap<BuildCacheResult>;
  meshMemoryCache: LruMap<KernelSuccessResult<GeometryResponse>>;
  exportMemoryCache: LruMap<KernelSuccessResult<ExportFile[]>>;
};

/**
 * Build the three L1 caches one registration owns.
 *
 * @internal
 *
 * @returns Fresh, empty caches.
 */
export const createGeometryCaches = (): GeometryCaches => ({
  geometryMemoryCache: new LruMap<BuildCacheResult>({ maxEntries: 20 }),
  meshMemoryCache: new LruMap<KernelSuccessResult<GeometryResponse>>({ maxEntries: 20 }),
  exportMemoryCache: new LruMap<KernelSuccessResult<ExportFile[]>>({ maxEntries: 20 }),
});

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

const kernelIssueSchema = z.custom<KernelIssue>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    'code' in value &&
    typeof value.code === 'string' &&
    'severity' in value &&
    (value.severity === 'error' || value.severity === 'warning' || value.severity === 'info'),
);

const geometryResponseSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('gltf'), content: z.instanceof(Uint8Array) }).loose(),
  z.object({ format: z.literal('svg'), content: z.string(), name: z.string().optional() }).loose(),
  z
    .object({
      format: z.literal('webrtc'),
      stream: z.custom<ReadableStream | EventTarget>((value) => value !== undefined),
    })
    .loose(),
]);

const successResultShape = {
  success: z.literal(true),
  issues: z.array(kernelIssueSchema),
  serializedNativeHandle: z.unknown().optional(),
} as const;

const nativeBuildInputSchema = z
  .object({
    entryPath: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const buildCacheEntrySchema = z
  .object({
    version: z.literal(7),
    kind: z.literal('build'),
    result: z
      .object({
        ...successResultShape,
        data: geometryResponseSchema.nullish().transform((value) => value ?? undefined),
      })
      .loose(),
    nativeBuildInput: nativeBuildInputSchema,
  })
  .strict();

const meshCacheEntrySchema = z
  .object({
    version: z.literal(7),
    kind: z.literal('mesh'),
    result: z.object({ ...successResultShape, data: geometryResponseSchema }).loose(),
  })
  .strict();

const exportFileSchema = z.custom<ExportFile>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'mimeType' in value &&
    typeof value.mimeType === 'string' &&
    'bytes' in value &&
    value.bytes instanceof Uint8Array,
);

const exportCacheEntrySchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('export'),
    result: z.object({ ...successResultShape, data: z.array(exportFileSchema) }).loose(),
  })
  .strict();

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

function deserializeBuildResult(data: Uint8Array<ArrayBuffer>): BuildCacheResult {
  const entry = buildCacheEntrySchema.parse(msgpackDecode(data));
  return { ...cloneSuccessResult(entry.result), [nativeBuildInputSymbol]: entry.nativeBuildInput };
}

function deserializeMeshResult(data: Uint8Array<ArrayBuffer>): KernelSuccessResult<GeometryResponse> {
  const entry = meshCacheEntrySchema.parse(msgpackDecode(data));
  return cloneSuccessResult(entry.result);
}

function serializeExportResult(result: KernelSuccessResult<ExportFile[]>): Uint8Array<ArrayBuffer> {
  const entry: ExportCacheEntry = { version: 1, kind: 'export', result };
  return msgpackEncode(entry);
}

function deserializeExportResult(data: Uint8Array<ArrayBuffer>): KernelSuccessResult<ExportFile[]> {
  const entry = exportCacheEntrySchema.parse(msgpackDecode(data));
  return cloneExportSuccessResult(entry.result);
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
const geometryCacheOptionsSchema = z.object({
  maxEntries: z.number().default(100),
  /** Maximum age for cache entries. Milliseconds. */
  maxAge: z.number().default(7 * 24 * 60 * 60 * 1000),
});
type GeometryCachePluginFactory = MiddlewarePluginFactory<
  'geometryCache',
  z.input<typeof geometryCacheOptionsSchema>,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Represents z.object({}) state
  z.ZodObject<{}>,
  typeof geometryCacheOptionsSchema
>;

/**
 * Check if the result has webrtc format.
 * Video-stream geometries cannot be cached as they contain live streams.
 */
function hasVideoStreamGeometry(geometry: GeometryResponse): boolean {
  return geometry.format === 'webrtc';
}

/**
 * Geometry cache middleware bound to one registration's L1 caches.
 *
 * Caches createGeometry and exportGeometry results based on all dependencies
 * (files, middleware, framework, parameters, render options, export format/options).
 * Uses wrap-style hook with onion model execution:
 * - Check cache before calling handler()
 * - Write to cache after handler() returns (on cache miss)
 * - Short-circuited results still flow through upstream middleware
 *
 * @param caches - the L1 caches this registration owns
 * @returns The middleware plugin factory.
 */
const defineGeometryCacheMiddleware = (caches: GeometryCaches): GeometryCachePluginFactory => {
  const { geometryMemoryCache, meshMemoryCache, exportMemoryCache } = caches;
  const retainCache = createCacheRetentionTracker();

  return defineMiddleware({
    id: 'geometryCache',
    name: 'GeometryCache',
    version: '1.0.0',

    optionsSchema: geometryCacheOptionsSchema,

    async wrapCreateGeometry(input, handler, { logger, filesystem, dependencyHash, options, tracer }) {
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
        const cachedData = await traceCacheOperation(tracer, 'cache.geometry.build.read', async () =>
          filesystem.readFile(cachePath),
        );
        logger.debug(`Cache hit for ${cacheKey}`);

        const result = await traceCacheOperation(tracer, 'cache.geometry.build.decode', () =>
          deserializeBuildResult(cachedData),
        );
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
            const serialized = await traceCacheOperation(tracer, 'cache.geometry.build.encode', () =>
              serializeBuildResult(result),
            );
            await traceCacheOperation(tracer, 'cache.geometry.build.write', async () => {
              await filesystem.ensureDir(cacheDirectory);
              await filesystem.writeFile(cachePath, serialized);
            });
            logger.debug(`Cached geometry at ${cacheKey}`);

            await traceCacheOperation(tracer, 'cache.geometry.build.prune', async () =>
              retainCache({
                filesystem,
                cacheDirectory,
                extension: '.bin',
                writtenPath: cachePath,
                maxAge: options.maxAge,
                maxEntries: options.maxEntries,
              }),
            );
          } catch (error) {
            logger.warn(`Cache write error for ${cacheKey}: ${String(error)}`);
          }
        }
      }

      return result;
    },

    async wrapMeshGeometry(input, handler, { logger, filesystem, dependencyHash, options, tracer }) {
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
        const cachedData = await traceCacheOperation(tracer, 'cache.geometry.mesh.read', async () =>
          filesystem.readFile(cachePath),
        );
        logger.debug(`Mesh cache hit for ${cacheKey}`);

        const result = await traceCacheOperation(tracer, 'cache.geometry.mesh.decode', () =>
          deserializeMeshResult(cachedData),
        );
        meshMemoryCache.set(cacheKey, cloneSuccessResult(result));
        return result;
      } catch (error) {
        logger.debug(`Mesh cache miss for ${cacheKey}: ${String(error)}`);
      }

      const result = await handler(input);

      if (result.success) {
        if (hasVideoStreamGeometry(result.data)) {
          logger.debug(`Skipping mesh cache for ${cacheKey}: contains webrtc geometry`);
          return result;
        }
        meshMemoryCache.set(cacheKey, cloneSuccessResult(result));

        try {
          const serialized = await traceCacheOperation(tracer, 'cache.geometry.mesh.encode', () =>
            serializeMeshResult(result),
          );
          await traceCacheOperation(tracer, 'cache.geometry.mesh.write', async () => {
            await filesystem.ensureDir(cacheDirectory);
            await filesystem.writeFile(cachePath, serialized);
          });
          logger.debug(`Cached display mesh at ${cacheKey}`);

          await traceCacheOperation(tracer, 'cache.geometry.mesh.prune', async () =>
            retainCache({
              filesystem,
              cacheDirectory,
              extension: '.bin',
              writtenPath: cachePath,
              maxAge: options.maxAge,
              maxEntries: options.maxEntries,
            }),
          );
        } catch (error) {
          logger.warn(`Mesh cache write error for ${cacheKey}: ${String(error)}`);
        }
      }

      return result;
    },

    async wrapExportGeometry(input, handler, { logger, filesystem, dependencyHash, options, tracer }) {
      const cacheKey = dependencyHash;

      const memoryCached = exportMemoryCache.get(cacheKey);
      if (memoryCached) {
        logger.debug(`Export memory cache hit for ${cacheKey}`);
        return cloneExportSuccessResult(memoryCached);
      }

      const cachePath = getExportCachePath(cacheKey);
      try {
        const cachedData = await traceCacheOperation(tracer, 'cache.geometry.export.read', async () =>
          filesystem.readFile(cachePath),
        );
        logger.debug(`Export cache hit for ${cacheKey}`);

        const result = await traceCacheOperation(tracer, 'cache.geometry.export.decode', () =>
          deserializeExportResult(cachedData),
        );
        exportMemoryCache.set(cacheKey, cloneExportSuccessResult(result));
        return result;
      } catch (error) {
        logger.debug(`Export cache miss for ${cacheKey}: ${String(error)}`);
      }

      const result: ExportGeometryResult = await handler(input);
      if (result.success && result.data.length > 0) {
        exportMemoryCache.set(cacheKey, cloneExportSuccessResult(result));

        try {
          const serialized = await traceCacheOperation(tracer, 'cache.geometry.export.encode', () =>
            serializeExportResult(result),
          );
          await traceCacheOperation(tracer, 'cache.geometry.export.write', async () => {
            await filesystem.ensureDir(cacheDirectory);
            await filesystem.writeFile(cachePath, serialized);
          });
          logger.debug(`Cached ${result.data.length} exports at ${cacheKey}`);

          await traceCacheOperation(tracer, 'cache.geometry.export.prune', async () =>
            retainCache({
              filesystem,
              cacheDirectory,
              extension: '.bin',
              writtenPath: cachePath,
              maxAge: options.maxAge,
              maxEntries: options.maxEntries,
            }),
          );
        } catch (error) {
          logger.warn(`Export cache write error for ${cacheKey}: ${String(error)}`);
        }
      }

      return result;
    },
  });
};

/**
 * Geometry cache middleware factory. Each registration owns its own L1 caches.
 *
 * @param options - cache retention options
 * @returns The middleware registration.
 * @public
 */
export const geometryCache: GeometryCachePluginFactory = (options) =>
  defineGeometryCacheMiddleware(createGeometryCaches())(options);

/**
 * Registration bound to caller-owned caches so tests can inspect them.
 *
 * @internal
 *
 * @param caches - the L1 caches this registration should use
 * @returns The middleware registration.
 */
export const geometryCacheWithCaches = (
  caches: GeometryCaches,
): MiddlewarePluginRegistration<
  'geometryCache',
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Represents z.object({}) state
  z.ZodObject<{}>,
  typeof geometryCacheOptionsSchema,
  undefined
> => defineGeometryCacheMiddleware(caches)();
