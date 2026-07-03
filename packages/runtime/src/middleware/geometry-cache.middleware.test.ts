/**
 * Tests for the geometry cache middleware.
 * Tests the wrap-style hook with onion model execution.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import type { CreateGeometryResult, ExportGeometryResult, KernelIssue } from '#types/runtime.types.js';
import type {
  CreateGeometryHandler,
  ExportGeometryHandler,
  KernelMiddlewareRuntime,
} from '#types/runtime-middleware.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { CreateGeometryInput, ExportGeometryRequest } from '#types/runtime-kernel.types.js';
import { exportMemoryCache, geometryCache, geometryMemoryCache } from '#middleware/geometry-cache.middleware.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import {
  createMockRuntime,
  createMockInput,
  createGltfSuccessResult,
  createErrorResult,
  createMockDependencies,
  createMockCreateGeometryHandler,
} from '#testing/kernel-testing.utils.js';

/**
 * Create serialized cache content (MessagePack binary format, v5).
 * Mirrors the CacheEntry structure: stores the full KernelSuccessResult.
 */
function createSerializedCacheContent(
  content: Uint8Array<ArrayBuffer>,
  issues: KernelIssue[] = [],
): Uint8Array<ArrayBuffer> {
  return msgpackEncode({
    version: 5,
    result: {
      success: true,
      data: { format: 'gltf', content },
      issues,
    },
  });
}

/**
 * Create serialized export cache content (MessagePack binary format, v1).
 */
function createSerializedExportCacheContent(
  bytes: Uint8Array<ArrayBuffer>,
  issues: KernelIssue[] = [],
): Uint8Array<ArrayBuffer> {
  return msgpackEncode({
    version: 1,
    kind: 'export',
    result: {
      success: true,
      data: [{ bytes, name: 'cached.step', mimeType: 'application/step' }],
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
  input: CreateGeometryInput;

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
    projectRootPath: '/projects/export-test',
    basePath: '/projects/export-test',
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
  const resolveGeometryCacheMiddleware = async () => resolveRuntimePluginDefinition('middleware', geometryCache());
  let geometryCacheMiddleware: Awaited<ReturnType<typeof resolveGeometryCacheMiddleware>>;

  beforeAll(async () => {
    geometryCacheMiddleware = await resolveGeometryCacheMiddleware();
  });

  beforeEach(() => {
    geometryMemoryCache.clear();
    exportMemoryCache.clear();
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
          expect(result.data.format).toBe('gltf');
          if (result.data.format === 'gltf') {
            // Content should be the cached Uint8Array
            expect(result.data.content).toBeInstanceOf(Uint8Array);
            expect(result.data.content).toEqual(gltfContent);
          } else {
            throw new Error(`Unexpected geometry format: ${result.data.format}`);
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
            path: '/projects/test-build/.tau/cache/geometry/old-cache.bin',
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
        const cacheDirectory = '/projects/test-build/.tau/cache/geometry';
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

      const cached = geometryMemoryCache.get(runtime.dependencyHash);
      expect(cached).toBeDefined();
      if (cached?.success && cached.data.format === 'gltf') {
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
        expect(result.data.format).toBe('gltf');
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
        expect(result.data.format).toBe('gltf');
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

      expect(geometryMemoryCache.size).toBe(0);
    });
  });

  it('should return a fresh L1 copy after the first result buffer is transferred', async () => {
    const { input, runtime } = createCacheTestContext({ cacheExists: false });
    const content = new Uint8Array([1, 2, 3]);
    const handlerResult = createGltfSuccessResult(content);
    const handler = createMockCreateGeometryHandler(handlerResult);

    const { wrapCreateGeometry } = geometryCacheMiddleware;
    const first = await wrapCreateGeometry!(input, handler, runtime);
    if (first.success && first.data.format === 'gltf') {
      structuredClone(first.data.content, { transfer: [first.data.content.buffer] });
    }

    const second = await wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second.success).toBe(true);
    if (second.success && second.data.format === 'gltf') {
      expect(second.data.content).toEqual(new Uint8Array([1, 2, 3]));
      expect(second.data.content.buffer).not.toBe(content.buffer);
    }
  });

  describe('serializedNativeHandle storage', () => {
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

      const cached = geometryMemoryCache.get(runtime.dependencyHash);
      expect(cached).toBeDefined();
      expect(cached?.serializedNativeHandle).toEqual(serializedNativeHandle);
    });

    it('should restore serializedNativeHandle from L2 cache on cache hit', async () => {
      const serializedNativeHandle = { brep: 'CACHED_BREP' };
      const cacheData = msgpackEncode({
        version: 5,
        result: {
          success: true,
          data: { format: 'gltf', content: new Uint8Array([4, 5, 6]) },
          issues: [],
          serializedNativeHandle,
        },
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

    it('should ignore legacy v3 entries that use the retired snapshot shape', async () => {
      const legacyCacheData = msgpackEncode({
        version: 3,
        result: {
          success: true,
          data: [{ format: 'gltf', content: new Uint8Array([4, 5, 6]) }],
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

    it('should omit serializedNativeHandle when result has none', async () => {
      const { input, runtime } = createCacheTestContext({ cacheExists: false });
      const handlerResult = createGltfSuccessResult(new Uint8Array([1, 2, 3]));
      const handler = createMockCreateGeometryHandler(handlerResult);

      const { wrapCreateGeometry } = geometryCacheMiddleware;
      await wrapCreateGeometry!(input, handler, runtime);

      const cached = geometryMemoryCache.get(runtime.dependencyHash);
      expect(cached).toBeDefined();
      expect(cached?.serializedNativeHandle).toBeUndefined();
    });
  });

  describe('wrapExportGeometry', () => {
    const createExportSuccess = (bytes: Uint8Array<ArrayBuffer>, issues: KernelIssue[] = []): ExportGeometryResult => ({
      success: true,
      data: [{ bytes, name: 'model.step', mimeType: 'application/step' }],
      issues,
    });

    it('should return cached export result from L2 and not call handler', async () => {
      const cachedBytes = new Uint8Array([1, 2, 3, 4]);
      const { input, runtime } = createExportCacheTestContext({
        cacheExists: true,
        serializedContent: createSerializedExportCacheContent(cachedBytes),
      });
      const handler: ExportGeometryHandler = vi.fn();

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]?.bytes).toEqual(cachedBytes);
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
        expect(result.data[0]?.bytes).toEqual(new Uint8Array([5, 6, 7]));
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
        serializedContent: createSerializedExportCacheContent(new Uint8Array([1, 2]), cachedIssues),
      });
      const handler: ExportGeometryHandler = vi.fn();

      const result = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.issues).toEqual(cachedIssues);
      }
    });

    it('should clone cached export bytes after the returned buffer is transferred', async () => {
      const originalBytes = new Uint8Array([1, 2, 3]);
      const handlerResult = createExportSuccess(originalBytes);
      const { input, runtime } = createExportCacheTestContext({ cacheExists: false });
      const handler: ExportGeometryHandler = vi.fn().mockResolvedValue(handlerResult);

      const first = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);
      if (first.success) {
        structuredClone(first.data[0]!.bytes, { transfer: [first.data[0]!.bytes.buffer] });
      }

      const second = await geometryCacheMiddleware.wrapExportGeometry!(input, handler, runtime);

      expect(handler).toHaveBeenCalledOnce();
      expect(second.success).toBe(true);
      if (second.success) {
        expect(second.data[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
        expect(second.data[0]?.bytes.buffer).not.toBe(originalBytes.buffer);
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
      expect(exportMemoryCache.size).toBe(0);
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
      expect(exportMemoryCache.size).toBe(0);
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
