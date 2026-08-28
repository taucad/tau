/**
 * Tests for the geometry cache middleware.
 * Tests the wrap-style hook with onion model execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  KernelIssue,
  MeshGeometryResult,
  Dependency,
  ExportGeometryRequest,
} from '@taucad/runtime/types';
import { nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type {
  CreateGeometryHandler,
  ExportGeometryHandler,
  KernelMiddlewareRuntime,
  MeshGeometryHandler,
  MiddlewareCreateGeometryRequest,
  NativeBuildInput,
  NativeBuildInputCarrier,
} from '@taucad/runtime/middleware';

import { createGeometryCaches, geometryCacheWithCaches } from '#geometry-cache.middleware.js';
import type { GeometryCaches } from '#geometry-cache.middleware.js';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import {
  createMockRuntime,
  createMockInput,
  createGltfSuccessResult,
  createErrorResult,
  createMockDependencies,
  createMockCreateGeometryHandler as createBaseCreateGeometryHandler,
} from '@taucad/runtime-testing';

const nativeBuildInput: NativeBuildInput = {
  entryPath: 'test.kcl',
  parameters: {},
  options: {},
};

const createMockCreateGeometryHandler = (result?: CreateGeometryResult): CreateGeometryHandler => {
  const resolved = result ?? createGltfSuccessResult(new Uint8Array([1, 2, 3]));
  if (resolved.success) {
    Object.assign(resolved, { [nativeBuildInputSymbol]: nativeBuildInput });
  }
  return createBaseCreateGeometryHandler(resolved);
};

/**
 * Create serialized build-cache content.
 * Mirrors the CacheEntry structure: stores the full KernelSuccessResult.
 */
function createSerializedCacheContent(
  content: Uint8Array<ArrayBuffer>,
  issues: KernelIssue[] = [],
): Uint8Array<ArrayBuffer> {
  return msgpackEncode({
    version: 7,
    kind: 'build',
    result: {
      success: true,
      data: { format: 'gltf', content },
      issues,
    },
    nativeBuildInput,
  });
}

/**
 * Create serialized export cache content (MessagePack binary format, v1).
 */
function createSerializedExportCacheContent(
  files: Array<{ bytes: Uint8Array<ArrayBuffer>; name: string; mimeType: string }>,
  issues: KernelIssue[] = [],
): Uint8Array<ArrayBuffer> {
  return msgpackEncode({
    version: 1,
    kind: 'export',
    result: {
      success: true,
      data: files,
      issues,
    },
  });
}

/**
 * Create input and runtime for cache testing.
 */

type GeometryCacheOptions = { maxEntries: number; maxAge: number };

function createCacheTestContext(options?: {
  cacheExists?: boolean;
  cachedContent?: Uint8Array<ArrayBuffer>;
  input?: Parameters<typeof createMockInput>[0];
  dependencies?: readonly Dependency[];
  dependencyHash?: string;
  cacheOptions?: GeometryCacheOptions;
}): {
  input: MiddlewareCreateGeometryRequest;

  runtime: KernelMiddlewareRuntime<Record<string, never>, GeometryCacheOptions> &
    ReturnType<typeof createMockRuntime<Record<string, never>, GeometryCacheOptions>>;
} {
  // Create serialized content if cachedContent is provided (MessagePack binary format)
  const serializedContent = options?.cachedContent
    ? createSerializedCacheContent(options.cachedContent)
    : new Uint8Array();

  const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
    filesystemOverrides: {
      existsResult: options?.cacheExists ?? false,
      readFileResult: serializedContent,
    },
    dependencies: options?.dependencies ?? createMockDependencies(),
    dependencyHash: options?.dependencyHash ?? 'a'.repeat(64),
    options: options?.cacheOptions ?? {
      maxEntries: 100,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });

  return {
    input: createMockInput(options?.input),

    runtime,
  };
}

function createExportCacheTestContext(options?: {
  cacheExists?: boolean;
  serializedContent?: Uint8Array<ArrayBuffer>;
  dependencyHash?: string;
  cacheOptions?: GeometryCacheOptions;
}): {
  input: ExportGeometryRequest;
  runtime: KernelMiddlewareRuntime<Record<string, never>, GeometryCacheOptions> &
    ReturnType<typeof createMockRuntime<Record<string, never>, GeometryCacheOptions>>;
} {
  const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
    filesystemOverrides: {
      existsResult: options?.cacheExists ?? false,
      readFileResult: options?.serializedContent ?? new Uint8Array(),
    },
    dependencies: createMockDependencies(),
    dependencyHash: options?.dependencyHash ?? 'e'.repeat(64),
    options: options?.cacheOptions ?? {
      maxEntries: 100,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });

  return {
    input: {
      format: 'step',
      options: {},
    },
    runtime,
  };
}

describe('geometryCacheMiddleware', () => {
  const resolveGeometryCacheMiddleware = async (caches: GeometryCaches) =>
    resolveRuntimePluginDefinition('middleware', geometryCacheWithCaches(caches));
  let geometryCacheMiddleware: Awaited<ReturnType<typeof resolveGeometryCacheMiddleware>>;
  let caches: GeometryCaches;

  // Each registration owns its L1 caches, so a fresh middleware per test is the isolation.
  beforeEach(async () => {
    caches = createGeometryCaches();
    geometryCacheMiddleware = await resolveGeometryCacheMiddleware(caches);
  });

  describe('wrapCreateGeometry', () => {
    describe('cache hit', () => {
      it('should return cached result and not call handler', async () => {
        const gltfContent = new Uint8Array([1, 2, 3, 4]);

        const { input, runtime } = createCacheTestContext({
          cacheExists: true,
          cachedContent: gltfContent,
        });
        const handler = createMockCreateGeometryHandler();

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        expect(wrapCreateGeometry).toBeDefined();

        const result = await wrapCreateGeometry!(input, handler, runtime);

        // Handler should not be called on cache hit
        expect(handler).not.toHaveBeenCalled();

        // Result should be from cache
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data?.format).toBe('gltf');
          if (result.data?.format === 'gltf') {
            // Content should be the cached Uint8Array
            expect(result.data.content).toBeInstanceOf(Uint8Array);
            expect(result.data.content).toEqual(gltfContent);
          } else {
            throw new Error(`Unexpected geometry format: ${result.data?.format}`);
          }
        }
      });

      it('should log cache hit message', async () => {
        const gltfContent = new Uint8Array([1, 2, 3]);
        const { input, runtime } = createCacheTestContext({
          cacheExists: true,
          cachedContent: gltfContent,
        });
        const handler = createMockCreateGeometryHandler();

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache hit'));
      });

      it('should preserve issues on cache hit', async () => {
        const gltfContent = new Uint8Array([1, 2, 3]);
        const cachedIssues: KernelIssue[] = [
          {
            message: 'ignoring unknown variable "size"',
            code: 'BUNDLER_FAILED',
            severity: 'warning',
            type: 'compilation',
          },
          {
            message: 'undefined operation',
            code: 'BUNDLER_FAILED',
            severity: 'warning',
            type: 'compilation',
          },
        ];

        const serializedContent = createSerializedCacheContent(gltfContent, cachedIssues);
        const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
          filesystemOverrides: {
            existsResult: true,
            readFileResult: serializedContent,
          },
          dependencies: createMockDependencies(),
          dependencyHash: 'a'.repeat(64),
          options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
        });

        const input = createMockInput();
        const handler = createMockCreateGeometryHandler();

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(handler).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues).toHaveLength(2);
          expect(result.issues[0]?.message).toBe('ignoring unknown variable "size"');
          expect(result.issues[1]?.message).toBe('undefined operation');
        }
      });
    });

    describe('cache miss', () => {
      it('should call handler and return its result', async () => {
        const handlerResult = createGltfSuccessResult(new Uint8Array([5, 6, 7]));
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(handler).toHaveBeenCalled();
        expect(result).toBe(handlerResult);
      });

      it('should log cache miss message', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler();

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache miss'));
      });

      it('should write result to cache after handler returns', async () => {
        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest mock call args
        const writePath = runtime.filesystem.mocks.writeFile.mock.calls[0]?.[0];
        expect(writePath).toContain('.tau/cache/geometry');
        expect(writePath).toContain('.bin');
      });

      it('should ensure cache directory exists before writing', async () => {
        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.filesystem.mocks.ensureDir).toHaveBeenCalled();
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest mock call args
        const directoryPath = runtime.filesystem.mocks.ensureDir.mock.calls[0]?.[0];
        expect(directoryPath).toContain('.tau/cache/geometry');
      });

      it('should log cache write message', async () => {
        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cached geometry'));
      });

      it('should persist issues when writing to cache', async () => {
        const issues: KernelIssue[] = [
          {
            message: 'ignoring unknown variable "size"',
            code: 'BUNDLER_FAILED',
            severity: 'warning',
            type: 'compilation',
          },
        ];
        const handlerResult: CreateGeometryResult = {
          success: true,
          data: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
          issues,
        };
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues).toEqual(issues);
        }

        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
      });

      it('should not cache failed results', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handler = createMockCreateGeometryHandler(errorResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('dependency hash usage', () => {
      it('should use runtime.dependencyHash for cache path', async () => {
        const dependencyHash = 'b'.repeat(64);
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
          dependencyHash,
        });
        const handler = createMockCreateGeometryHandler();

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // Verify that writeFile was called with a path containing the dependency hash
        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalledWith(
          expect.stringContaining(dependencyHash),
          expect.any(Uint8Array),
        );
      });

      it('should use runtime.dependencyHash for cache lookup', async () => {
        const dependencyHash = 'c'.repeat(64);
        const cachedContent = new Uint8Array([1, 2, 3]);
        const { input, runtime } = createCacheTestContext({
          cacheExists: true,
          cachedContent,
          dependencyHash,
        });
        const handler = createMockCreateGeometryHandler();

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // Verify that readFile was called with a path containing the dependency hash
        expect(runtime.filesystem.mocks.readFile).toHaveBeenCalledWith(
          expect.stringContaining(dependencyHash),
          undefined,
        );
      });
    });

    describe('error handling', () => {
      it('should handle file read errors gracefully', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: true,
        });
        // Make readFile throw an error
        runtime.filesystem.mocks.readFile.mockRejectedValue(new Error('Read error'));

        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        // Should treat as cache miss and call handler
        expect(handler).toHaveBeenCalled();
        expect(result).toBe(handlerResult);
      });

      it('should handle file write errors gracefully', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        // Make writeFile throw an error
        runtime.filesystem.mocks.writeFile.mockRejectedValue(new Error('Write error'));

        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        // Should not throw, just log warning
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result).toBe(handlerResult);
        expect(runtime.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cache write error'));
      });
    });

    describe('webrtc handling', () => {
      it('should skip caching when result contains webrtc geometry', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        // Create a handler that returns webrtc geometry
        const mockStream = new ReadableStream();
        const videoStreamResult = {
          success: true,
          data: { format: 'webrtc', stream: mockStream } as const,
          issues: [],
        };
        const handler = createMockCreateGeometryHandler(videoStreamResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        // Handler should be called
        expect(handler).toHaveBeenCalled();
        expect(result).toBe(videoStreamResult);

        // Should NOT write to cache
        expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
        // Should log that caching was skipped
        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping cache'));
        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('webrtc'));
      });

      it('should cache when result contains only GLTF geometry', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // Should write to cache
        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
      });

      it('should skip caching when result is webrtc geometry', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const mockStream = new ReadableStream();
        const videoStreamResult = {
          success: true,
          data: { format: 'webrtc', stream: mockStream } as const,
          issues: [],
        };
        const handler = createMockCreateGeometryHandler(videoStreamResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // Should NOT write to cache when any geometry is webrtc
        expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('cache cleanup', () => {
      it('should call cleanup after successful cache write', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });
        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // `readdirStat` should be called for cleanup
        expect(runtime.filesystem.mocks.readdirStat).toHaveBeenCalled();
      });

      it('should delete old cache entries', async () => {
        const now = Date.now();
        const oldMtimeMs = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago (older than 7 day max age)
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });

        runtime.filesystem.mocks.readdirStat.mockResolvedValue([
          {
            path: '.tau/cache/geometry/old-cache.bin',
            name: 'old-cache.bin',
            type: 'file',
            size: 100,
            mtimeMs: oldMtimeMs,
          },
        ]);

        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // Should delete old cache file
        expect(runtime.filesystem.mocks.unlink).toHaveBeenCalled();
      });

      it('should delete excess cache entries when over max count', async () => {
        const now = Date.now();
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });

        // Create 102 files (2 over the 100 max), stagger mtimeMs oldest first
        const cacheDirectory = '.tau/cache/geometry';
        const entries = Array.from({ length: 102 }, (_, index) => ({
          path: `${cacheDirectory}/cache-${index}.bin`,
          name: `cache-${index}.bin`,
          type: 'file',
          size: 100,
          mtimeMs: now - index * 1000,
        }));
        runtime.filesystem.mocks.readdirStat.mockResolvedValue(entries);

        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        // Should delete 2 oldest files to get to 100
        expect(runtime.filesystem.mocks.unlink).toHaveBeenCalledTimes(2);
      });

      it('should handle cleanup errors gracefully', async () => {
        const { input, runtime } = createCacheTestContext({
          cacheExists: false,
        });

        runtime.filesystem.mocks.readdirStat.mockRejectedValue(new Error('Readdir error'));

        const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = geometryCacheMiddleware;
        // Should not throw, cleanup errors are non-fatal
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);
        // Cache write should still have happened
        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
      });
    });
  });

  describe('cache key behavior with parameter changes', () => {
    it('should use dependencyHash for cache key lookup', async () => {
      const dependencyHash = 'abc123'.repeat(11).slice(0, 64);
      const cachedContent = new Uint8Array([1, 2, 3]);
      const serializedContent = createSerializedCacheContent(cachedContent);

      const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
        filesystemOverrides: {
          existsResult: true,
          readFileResult: serializedContent,
        },
        dependencies: createMockDependencies(),
        dependencyHash,
        options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
      });

      const input = createMockInput();
      const handler: CreateGeometryHandler = vi.fn();

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      // Verify cache was checked at the correct path using the dependency hash
      expect(runtime.filesystem.mocks.readFile).toHaveBeenCalledWith(
        expect.stringContaining(dependencyHash),
        undefined,
      );
    });

    it('should result in cache miss when dependencyHash differs (simulating parameter change)', async () => {
      // Different dependency hash simulates a parameter change
      const dependencyHash = 'hash2'.repeat(13).slice(0, 64);

      // Cache doesn't exist for this new hash
      const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
        filesystemOverrides: {
          existsResult: false,
        },
        dependencies: createMockDependencies([{ type: 'parameter', parameters: { key: 'newParams123' } }]),
        dependencyHash,
        options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
      });

      const input = createMockInput();

      const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
      const handler: CreateGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      // Handler should be called because cache missed
      expect(handler).toHaveBeenCalled();
    });

    it('should result in cache hit when dependencyHash is identical', async () => {
      const dependencyHash = 'same'.repeat(16);
      const cachedContent = new Uint8Array([1, 2, 3]);
      const serializedContent = createSerializedCacheContent(cachedContent);

      const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
        filesystemOverrides: {
          existsResult: true,
          readFileResult: serializedContent,
        },
        dependencies: createMockDependencies([{ type: 'parameter', parameters: { key: 'sameParams' } }]),
        dependencyHash,
        options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
      });

      const input = createMockInput();

      const handler: CreateGeometryHandler = vi.fn();

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      // Handler should NOT be called because cache hit
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('L1 cache storage', () => {
    it('should store a defensive copy in L1 on fresh compute', async () => {
      const originalContent = new Uint8Array([1, 2, 3]);
      const handlerResult = createGltfSuccessResult(originalContent);
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;
      await wrapCreateGeometry!(input, handler, runtime);

      const cached = caches.geometryMemoryCache.get(runtime.dependencyHash);
      expect(cached).toBeDefined();
      if (cached?.success && cached.data?.format === 'gltf') {
        expect(cached.data.content.buffer).not.toBe(originalContent.buffer);
        expect(cached.data.content).toEqual(originalContent);
        originalContent[0] = 99;
        expect(cached.data.content).toEqual(new Uint8Array([1, 2, 3]));
      }
    });
  });

  describe('memory cache', () => {
    it('should return from memory cache on second call without filesystem access', async () => {
      const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      runtime.filesystem.mocks.readFile.mockClear();
      runtime.filesystem.mocks.writeFile.mockClear();

      const result = await wrapCreateGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalled();
      expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.format).toBe('gltf');
      }
    });

    it('should populate memory cache on filesystem cache hit', async () => {
      const gltfContent = new Uint8Array([1, 2, 3]);
      const { input, runtime } = createCacheTestContext({
        cacheExists: true,
        cachedContent: gltfContent,
      });
      const handler = createMockCreateGeometryHandler();

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      runtime.filesystem.mocks.readFile.mockClear();

      const result = await wrapCreateGeometry!(input, handler, runtime);

      expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.format).toBe('gltf');
      }
    });

    it('should log memory cache hit', async () => {
      const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      await wrapCreateGeometry!(input, handler, runtime);

      expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('memory cache hit'));
    });

    it('should not populate memory cache for webrtc geometry', async () => {
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const mockStream = new ReadableStream();
      const videoStreamResult = {
        success: true,
        data: { format: 'webrtc', stream: mockStream } as const,
        issues: [],
      };
      const handler = createMockCreateGeometryHandler(videoStreamResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;

      await wrapCreateGeometry!(input, handler, runtime);

      expect(caches.geometryMemoryCache.size).toBe(0);
    });
  });

  it('should return a fresh L1 copy after the first result buffer is transferred', async () => {
    const { input, runtime } = createCacheTestContext({ cacheExists: false });
    const content = new Uint8Array([1, 2, 3]);
    const handlerResult = createGltfSuccessResult(content);
    const handler = createMockCreateGeometryHandler(handlerResult);

    const { wrapCreateGeometry } = geometryCacheMiddleware;
    const first = await wrapCreateGeometry!(input, handler, runtime);
    if (first.success && first.data?.format === 'gltf') {
      structuredClone(first.data.content, { transfer: [first.data.content.buffer] });
    }

    const second = await wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second.success).toBe(true);
    if (second.success && second.data?.format === 'gltf') {
      expect(second.data.content).toEqual(new Uint8Array([1, 2, 3]));
      expect(second.data.content.buffer).not.toBe(content.buffer);
    }
  });

  describe('serializedNativeHandle storage', () => {
    it('preserves exact replay input through result spread and L1/L2 round-trips', async () => {
      const replayInput: NativeBuildInput = {
        entryPath: 'generated/model.scad',
        parameters: { dimensions: { width: 12, depths: [3, 5] } },
        options: { tessellation: { segments: 64 } },
      };
      const terminalResult = {
        ...createGltfSuccessResult(new Uint8Array([1, 2, 3])),
        serializedNativeHandle: { brep: 'CACHED_BREP' },
        [nativeBuildInputSymbol]: replayInput,
      };
      const spreadHandler: CreateGeometryHandler = vi.fn(async () => ({ ...terminalResult }));
      const { input, runtime } = createCacheTestContext({ cacheExists: false });

      const first = await geometryCacheMiddleware.wrapCreateGeometry!(input, spreadHandler, runtime);
      const second = await geometryCacheMiddleware.wrapCreateGeometry!(input, spreadHandler, runtime);

      expect((first as CreateGeometryResult & NativeBuildInputCarrier)[nativeBuildInputSymbol]).toEqual(replayInput);
      expect((second as CreateGeometryResult & NativeBuildInputCarrier)[nativeBuildInputSymbol]).toEqual(replayInput);

      const written: unknown = runtime.filesystem.mocks.writeFile.mock.calls[0]?.[1];
      expect(written).toBeInstanceOf(Uint8Array);
      if (!(written instanceof Uint8Array)) {
        throw new TypeError('Expected cached bytes.');
      }
      caches.geometryMemoryCache.clear();
      runtime.filesystem.mocks.readFile.mockResolvedValue(written);
      const fromFilesystem = await geometryCacheMiddleware.wrapCreateGeometry!(input, spreadHandler, runtime);

      expect((fromFilesystem as CreateGeometryResult & NativeBuildInputCarrier)[nativeBuildInputSymbol]).toEqual(
        replayInput,
      );
      expect(spreadHandler).toHaveBeenCalledOnce();
    });

    it('should store serializedNativeHandle in cache entry when present in result', async () => {
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const serializedNativeHandle = { brep: 'BREP_DATA', meta: { name: 'part' } };
      const handlerResult: CreateGeometryResult = {
        success: true,
        data: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
        issues: [],
        serializedNativeHandle,
      };
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;
      await wrapCreateGeometry!(input, handler, runtime);

      const cached = caches.geometryMemoryCache.get(runtime.dependencyHash);
      expect(cached).toBeDefined();
      expect(cached?.serializedNativeHandle).toEqual(serializedNativeHandle);
    });

    it('should restore serializedNativeHandle from L2 cache on cache hit', async () => {
      const serializedNativeHandle = { brep: 'CACHED_BREP' };
      const cacheData = msgpackEncode({
        version: 7,
        kind: 'build',
        result: {
          success: true,
          data: { format: 'gltf', content: new Uint8Array([4, 5, 6]) },
          issues: [],
          serializedNativeHandle,
        },
        nativeBuildInput,
      });

      const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
        filesystemOverrides: {
          readFileResult: cacheData,
        },
        dependencies: createMockDependencies(),
        dependencyHash: 'a'.repeat(64),
        options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
      });
      const input = createMockInput();
      const handler = createMockCreateGeometryHandler();

      const { wrapCreateGeometry } = geometryCacheMiddleware;
      const result = await wrapCreateGeometry!(input, handler, runtime);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serializedNativeHandle).toEqual(serializedNativeHandle);
      }
      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore a v6 build entry without exact replay input', async () => {
      const legacyCacheData = msgpackEncode({
        version: 6,
        kind: 'build',
        result: {
          success: true,
          data: { format: 'gltf', content: new Uint8Array([4, 5, 6]) },
          issues: [],
          serializedNativeHandle: { brep: 'LEGACY_BREP' },
        },
      });
      const handlerResult = createGltfSuccessResult(new Uint8Array([7, 8, 9]));
      const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
        filesystemOverrides: {
          readFileResult: legacyCacheData,
        },
        dependencies: createMockDependencies(),
        dependencyHash: 'b'.repeat(64),
        options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
      });
      const input = createMockInput();
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;
      const result = await wrapCreateGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toEqual(handlerResult);
    });

    it.each([
      ['array parameters', { entryPath: 'test.kcl', parameters: [] }],
      ['array options', { entryPath: 'test.kcl', parameters: {}, options: [] }],
    ])('should ignore v7 build entries with malformed replay %s', async (_label, malformedInput) => {
      const cacheData = msgpackEncode({
        version: 7,
        kind: 'build',
        result: {
          success: true,
          data: { format: 'gltf', content: new Uint8Array([4, 5, 6]) },
          issues: [],
          serializedNativeHandle: { brep: 'INVALID' },
        },
        nativeBuildInput: malformedInput,
      });
      const handlerResult = createGltfSuccessResult(new Uint8Array([7, 8, 9]));
      const runtime = createMockRuntime<Record<string, never>, GeometryCacheOptions>({
        filesystemOverrides: { readFileResult: cacheData },
        dependencies: createMockDependencies(),
        dependencyHash: 'c'.repeat(64),
        options: { maxEntries: 100, maxAge: 7 * 24 * 60 * 60 * 1000 },
      });
      const handler = createMockCreateGeometryHandler(handlerResult);

      const result = await geometryCacheMiddleware.wrapCreateGeometry!(createMockInput(), handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toEqual(handlerResult);
    });

    it('should omit serializedNativeHandle when result has none', async () => {
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;
      await wrapCreateGeometry!(input, handler, runtime);

      const cached = caches.geometryMemoryCache.get(runtime.dependencyHash);
      expect(cached).toBeDefined();
      expect(cached?.serializedNativeHandle).toBeUndefined();
    });
  });

  describe('wrapMeshGeometry', () => {
    const input = { options: {} };

    it('returns a valid filesystem mesh-cache hit without calling the handler', async () => {
      const cachedResult: MeshGeometryResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
      const { runtime } = createCacheTestContext();
      runtime.filesystem.mocks.readFile.mockResolvedValue(
        msgpackEncode({ version: 7, kind: 'mesh', result: cachedResult }),
      );
      const handler: MeshGeometryHandler = vi.fn();

      const result = await geometryCacheMiddleware.wrapMeshGeometry!(input, handler, runtime);

      expect(handler).not.toHaveBeenCalled();
      expect(result).toEqual(cachedResult);
    });

    it('writes a successful mesh once and serves the next call from memory', async () => {
      const handlerResult: MeshGeometryResult = createGltfSuccessResult(new Uint8Array([4, 5, 6]));
      const { runtime } = createCacheTestContext();
      const handler: MeshGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      await geometryCacheMiddleware.wrapMeshGeometry!(input, handler, runtime);
      runtime.filesystem.mocks.readFile.mockClear();
      const result = await geometryCacheMiddleware.wrapMeshGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalledOnce();
      expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalled();
      expect(result).toEqual(handlerResult);
    });

    it('treats a mesh-cache result without display data as a miss', async () => {
      const handlerResult: MeshGeometryResult = createGltfSuccessResult(new Uint8Array([7, 8, 9]));
      const { runtime } = createCacheTestContext();
      runtime.filesystem.mocks.readFile.mockResolvedValue(
        msgpackEncode({ version: 7, kind: 'mesh', result: { success: true, issues: [] } }),
      );
      const handler: MeshGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const result = await geometryCacheMiddleware.wrapMeshGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toBe(handlerResult);
    });
  });

  describe('wrapExportGeometry', () => {
    const createExportSuccess = (bytes: Uint8Array<ArrayBuffer>, issues: KernelIssue[] = []): ExportGeometryResult => ({
      success: true,
      data: [
        { bytes, name: 'model.gltf', mimeType: 'model/gltf+json' },
        { bytes: new Uint8Array([9, 8]), name: 'buffers/model.bin', mimeType: 'application/octet-stream' },
      ],
      issues,
    });

    it('should share one retention scan across build and export writes', async () => {
      const { input: buildInput, runtime } = createCacheTestContext({ cacheExists: false });
      const buildHandler = createMockCreateGeometryHandler(createGltfSuccessResult(new Uint8Array([1, 2, 3])));
      const exportHandler: ExportGeometryHandler = vi
        .fn()
        .mockResolvedValue(createExportSuccess(new Uint8Array([4, 5, 6])));

      await geometryCacheMiddleware.wrapCreateGeometry!(buildInput, buildHandler, runtime);
      await geometryCacheMiddleware.wrapExportGeometry!({ format: 'step', options: {} }, exportHandler, runtime);

      expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalledTimes(2);
      expect(runtime.filesystem.mocks.readdirStat).toHaveBeenCalledOnce();
      expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.build.prune');
      expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.export.prune');
    });

    it('should return cached export result from L2 and not call handler', async () => {
      const cachedBytes = new Uint8Array([1, 2, 3, 4]);
      const { input, runtime } = createExportCacheTestContext({
        cacheExists: true,
        serializedContent: createSerializedExportCacheContent([
          { bytes: cachedBytes, name: 'cached.gltf', mimeType: 'model/gltf+json' },
          {
            bytes: new Uint8Array([5, 6]),
            name: 'buffers/cached.bin',
            mimeType: 'application/octet-stream',
          },
        ]),
      });
      const handler: ExportGeometryHandler = vi.fn();

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([
          { bytes: cachedBytes, name: 'cached.gltf', mimeType: 'model/gltf+json' },
          {
            bytes: new Uint8Array([5, 6]),
            name: 'buffers/cached.bin',
            mimeType: 'application/octet-stream',
          },
        ]);
      }
    });

    it('should return cached export result from L1 without filesystem access', async () => {
      const handlerResult = createExportSuccess(new Uint8Array([5, 6, 7]));
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);
      runtime.filesystem.mocks.readFile.mockClear();
      runtime.filesystem.mocks.writeFile.mockClear();

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalled();
      expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.map(({ name, mimeType, bytes }) => ({ name, mimeType, bytes: [...bytes] }))).toEqual([
          { name: 'model.gltf', mimeType: 'model/gltf+json', bytes: [5, 6, 7] },
          { name: 'buffers/model.bin', mimeType: 'application/octet-stream', bytes: [9, 8] },
        ]);
      }
    });

    it('should write successful export results under the export cache namespace', async () => {
      const dependencyHash = 'f'.repeat(64);
      const handlerResult = createExportSuccess(new Uint8Array([9, 8, 7]));
      const { input, runtime } = createExportCacheTestContext({
        cacheExists: false,
        dependencyHash,
      });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`/export-${dependencyHash}.bin`),
        expect.any(Uint8Array),
      );
    });

    it('should preserve export issues on cache hit', async () => {
      const cachedIssues: KernelIssue[] = [
        {
          message: 'export used fallback tessellation',
          code: 'UNKNOWN',
          severity: 'warning',
          type: 'unknown',
        },
      ];
      const { input, runtime } = createExportCacheTestContext({
        cacheExists: true,
        serializedContent: createSerializedExportCacheContent(
          [
            { bytes: new Uint8Array([1, 2]), name: 'cached.gltf', mimeType: 'model/gltf+json' },
            {
              bytes: new Uint8Array([3, 4]),
              name: 'buffers/cached.bin',
              mimeType: 'application/octet-stream',
            },
          ],
          cachedIssues,
        ),
      });
      const handler: ExportGeometryHandler = vi.fn();

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.issues).toEqual(cachedIssues);
      }
    });

    it('should clone every cached export buffer after returned buffers are transferred', async () => {
      const originalBytes = new Uint8Array([1, 2, 3]);
      const handlerResult = createExportSuccess(originalBytes);
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const first = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);
      if (first.success) {
        structuredClone(first.data, { transfer: first.data.map((file) => file.bytes.buffer) });
      }

      const second = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(second.success).toBe(true);
      if (second.success) {
        expect(second.data.map(({ name, bytes }) => ({ name, bytes: [...bytes] }))).toEqual([
          { name: 'model.gltf', bytes: [1, 2, 3] },
          { name: 'buffers/model.bin', bytes: [9, 8] },
        ]);
        expect(second.data[0]?.bytes.buffer).not.toBe(originalBytes.buffer);
        expect(second.data[1]?.bytes.byteLength).toBe(2);
      }
    });

    it('should treat corrupt export cache entries as misses', async () => {
      const handlerResult = createExportSuccess(new Uint8Array([4, 5, 6]));
      const { input, runtime } = createExportCacheTestContext({
        cacheExists: true,
        serializedContent: new Uint8Array([255, 0, 255]),
      });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toBe(handlerResult);
    });

    it('should treat wrong-kind export cache entries as misses', async () => {
      const handlerResult = createExportSuccess(new Uint8Array([4, 5, 6]));
      const wrongKind = msgpackEncode({
        version: 1,
        kind: 'geometry',
        result: {
          success: true,
          data: [{ bytes: new Uint8Array([1]), name: 'bad.step', mimeType: 'model/step' }],
          issues: [],
        },
      });
      const { input, runtime } = createExportCacheTestContext({
        cacheExists: true,
        serializedContent: wrongKind,
      });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toBe(handlerResult);
    });

    it('should not cache failed export results', async () => {
      const failedResult: ExportGeometryResult = {
        success: false,
        issues: [{ message: 'export failed', code: 'UNKNOWN', severity: 'error', type: 'unknown' }],
      };
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(failedResult);

      await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(caches.exportMemoryCache.size).toBe(0);
    });

    it('should not cache empty successful export results', async () => {
      const emptyResult: ExportGeometryResult = {
        success: true,
        data: [],
        issues: [],
      };
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(emptyResult);

      await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(caches.exportMemoryCache.size).toBe(0);
    });

    it('should tolerate export cache read errors as misses', async () => {
      const handlerResult = createExportSuccess(new Uint8Array([1]));
      const { input, runtime } = createExportCacheTestContext({ cacheExists: true });
      runtime.filesystem.mocks.readFile.mockRejectedValue(new Error('read failed'));
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toBe(handlerResult);
      expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Export cache miss'));
    });

    it('should tolerate export cache write errors', async () => {
      const handlerResult = createExportSuccess(new Uint8Array([1]));
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      runtime.filesystem.mocks.writeFile.mockRejectedValue(new Error('write failed'));
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(result).toBe(handlerResult);
      expect(runtime.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Export cache write error'));
    });

    it('should tolerate export cache cleanup errors', async () => {
      const handlerResult = createExportSuccess(new Uint8Array([1]));
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      runtime.filesystem.mocks.readdirStat.mockRejectedValue(new Error('cleanup failed'));
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(result.success).toBe(true);
      expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
    });
  });
});
