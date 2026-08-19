/**
 * Tests for the parameter cache middleware.
 * Tests the wrap-style hook with onion model execution.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { GetParametersResult } from '#types/runtime.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import { parameterCache, parameterMemoryCache } from '#middleware/parameter-cache.middleware.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import {
  createMockRuntime,
  createMockInput,
  createMockDependencies,
  createMockGetParametersHandler,
} from '#testing/kernel-testing.utils.js';

/** The data type for a successful GetParametersResult */
type GetParametersData = {
  defaultParameters: Record<string, unknown>;
  jsonSchema: JSONSchema7;
};

/**
 * Create a successful extract parameters result for testing.
 */
function createSuccessResult(overrides?: Partial<GetParametersData>): GetParametersResult {
  return {
    success: true,
    data: {
      defaultParameters: { width: 10, height: 20 },
      jsonSchema: {
        type: 'object',
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
      ...overrides,
    },
    issues: [],
  };
}

/**
 * Create an error result for testing.
 */
function createErrorResult(): GetParametersResult {
  return {
    success: false,
    issues: [{ severity: 'error', code: 'RUNTIME', message: 'Test error' }],
  };
}

/**
 * Create serialized cache content (JSON format).
 */
function createSerializedCacheContent(result: GetParametersResult): string {
  return JSON.stringify(result);
}

/**
 * Create input and runtime configured for cache testing.
 */

type ParameterCacheOptions = { maxEntries: number; maxAge: number };

function createCacheContext(options?: {
  cacheExists?: boolean;
  cachedResult?: GetParametersResult;
  input?: Parameters<typeof createMockInput>[0];
  dependencies?: readonly Dependency[];
  dependencyHash?: string;
  cacheOptions?: ParameterCacheOptions;
}) {
  const serializedContent = options?.cachedResult ? createSerializedCacheContent(options.cachedResult) : '';

  const runtime = createMockRuntime<Record<string, never>, ParameterCacheOptions>({
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

describe('parameterCacheMiddleware', () => {
  const resolveParameterCacheMiddleware = async () => resolveRuntimePluginDefinition('middleware', parameterCache());
  let parameterCacheMiddleware: Awaited<ReturnType<typeof resolveParameterCacheMiddleware>>;

  beforeAll(async () => {
    parameterCacheMiddleware = await resolveParameterCacheMiddleware();
  });

  beforeEach(() => {
    parameterMemoryCache.clear();
  });

  describe('wrapGetParameters', () => {
    describe('cache hit', () => {
      it('should return cached result and not call handler', async () => {
        const cachedResult = createSuccessResult({
          defaultParameters: { cached: true },
        });

        const { input, runtime } = createCacheContext({
          cacheExists: true,
          cachedResult,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        expect(wrapGetParameters).toBeDefined();

        const result = await wrapGetParameters!(input, handler, runtime);

        // Handler should not be called on cache hit
        expect(handler).not.toHaveBeenCalled();

        // Result should be from cache
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.defaultParameters).toEqual({ cached: true });
        }
      });

      it('should log cache hit message', async () => {
        const cachedResult = createSuccessResult();
        const { input, runtime } = createCacheContext({
          cacheExists: true,
          cachedResult,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('cache hit'));
      });

      it('should preserve jsonSchema from cached result', async () => {
        const cachedResult = createSuccessResult({
          jsonSchema: {
            type: 'object',
            properties: {
              customProp: { type: 'string', default: 'test' },
            },
          },
        });

        const { input, runtime } = createCacheContext({
          cacheExists: true,
          cachedResult,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        const result = await wrapGetParameters!(input, handler, runtime);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.jsonSchema.properties).toHaveProperty('customProp');
        }
      });

      it('should treat a persisted result with an invalid parameter bag as a cache miss', async () => {
        const { input, runtime } = createCacheContext();
        runtime.filesystem.mocks.readFile.mockResolvedValue(
          JSON.stringify({ success: true, data: { defaultParameters: [], jsonSchema: {} }, issues: [] }),
        );
        const handlerResult = createSuccessResult({ defaultParameters: { fresh: true } });
        const handler = createMockGetParametersHandler(handlerResult);

        const result = await parameterCacheMiddleware.wrapGetParameters!(input, handler, runtime);

        expect(handler).toHaveBeenCalledOnce();
        expect(result).toBe(handlerResult);
      });
    });

    describe('cache miss', () => {
      it('should call handler and return its result', async () => {
        const handlerResult = createSuccessResult({
          defaultParameters: { fresh: true },
        });
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        const result = await wrapGetParameters!(input, handler, runtime);

        expect(handler).toHaveBeenCalled();
        expect(result).toBe(handlerResult);
      });

      it('should log cache miss message', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('cache miss'));
      });

      it('should write result to cache after handler returns', async () => {
        const handlerResult = createSuccessResult();
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest mock call args
        const writePath = runtime.filesystem.mocks.writeFile.mock.calls[0]?.[0];
        expect(writePath).toContain('.tau/cache/parameters');
        expect(writePath).toContain('.json');
      });

      it('should write valid JSON to cache', async () => {
        const handlerResult = createSuccessResult({
          defaultParameters: { a: 1, b: 2 },
        });
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest mock call args
        const writeContent = runtime.filesystem.mocks.writeFile.mock.calls[0]?.[1];
        expect(writeContent).toBeDefined();
        expect(typeof writeContent).toBe('string');

        // Should be valid JSON
        const parsed = JSON.parse(writeContent as string) as GetParametersResult;
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.defaultParameters).toEqual({ a: 1, b: 2 });
        }
      });

      it('should ensure cache directory exists before writing', async () => {
        const handlerResult = createSuccessResult();
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.ensureDir).toHaveBeenCalled();
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest mock call args
        const directoryPath = runtime.filesystem.mocks.ensureDir.mock.calls[0]?.[0];
        expect(directoryPath).toContain('.tau/cache/parameters');
      });

      it('should log cache write message', async () => {
        const handlerResult = createSuccessResult();
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cached parameters'));
      });

      it('should not cache failed results', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(errorResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('dependency hash usage', () => {
      it('should use runtime.dependencyHash for cache path', async () => {
        const dependencyHash = 'b'.repeat(64);
        const { input, runtime } = createCacheContext({
          cacheExists: false,
          dependencyHash,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        // Verify that writeFile was called with a path containing the dependency hash
        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalledWith(
          expect.stringContaining(dependencyHash),
          expect.any(String),
        );
      });

      it('should use runtime.dependencyHash for cache lookup', async () => {
        const dependencyHash = 'c'.repeat(64);
        const cachedResult = createSuccessResult();
        const { input, runtime } = createCacheContext({
          cacheExists: true,
          cachedResult,
          dependencyHash,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        // Verify that readFile was called with a path containing the dependency hash
        expect(runtime.filesystem.mocks.readFile).toHaveBeenCalledWith(expect.stringContaining(dependencyHash), 'utf8');
      });

      it('should result in cache miss when dependencyHash differs', async () => {
        const dependencyHash = 'different'.repeat(8);
        const { input, runtime } = createCacheContext({
          cacheExists: false,
          dependencyHash,
        });

        const handlerResult = createSuccessResult();
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        // Handler should be called because cache missed
        expect(handler).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle file read errors gracefully', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: true });
        // Make readFile throw an error
        runtime.filesystem.mocks.readFile.mockRejectedValue(new Error('Read error'));

        const handlerResult = createSuccessResult();
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        const result = await wrapGetParameters!(input, handler, runtime);

        // Should treat as cache miss and call handler
        expect(handler).toHaveBeenCalled();
        expect(result).toBe(handlerResult);
      });

      it('should log cache read error', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: true });
        runtime.filesystem.mocks.readFile.mockRejectedValue(new Error('Read error'));

        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Read error'));
      });

      it('should handle file write errors gracefully', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: false });
        // Make writeFile throw an error
        runtime.filesystem.mocks.writeFile.mockRejectedValue(new Error('Write error'));

        const handlerResult = createSuccessResult();
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        // Should not throw, just log warning
        const result = await wrapGetParameters!(input, handler, runtime);

        expect(result).toBe(handlerResult);
        expect(runtime.logger.warn).toHaveBeenCalledWith(expect.stringContaining('cache write error'));
      });

      it('should handle JSON parse errors gracefully', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: true });
        // Return invalid JSON
        runtime.filesystem.mocks.readFile.mockResolvedValue('not valid json {{{');

        const handlerResult = createSuccessResult();
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        const result = await wrapGetParameters!(input, handler, runtime);

        // Should treat as cache miss and call handler
        expect(handler).toHaveBeenCalled();
        expect(result).toBe(handlerResult);
      });
    });

    describe('cache path structure', () => {
      it('should use correct cache path format', async () => {
        const dependencyHash = 'd'.repeat(64);
        const { input, runtime } = createCacheContext({
          cacheExists: false,
          dependencyHash,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.readFile).toHaveBeenCalledWith(
          `/.tau/cache/parameters/${dependencyHash}.json`,
          'utf8',
        );
      });
    });

    describe('memory cache', () => {
      it('should return from memory cache on second call without filesystem access', async () => {
        const handlerResult = createSuccessResult({ defaultParameters: { fresh: true } });
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;

        await wrapGetParameters!(input, handler, runtime);

        runtime.filesystem.mocks.readFile.mockClear();
        runtime.filesystem.mocks.writeFile.mockClear();

        const result = await wrapGetParameters!(input, handler, runtime);

        expect(handler).toHaveBeenCalledOnce();
        expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalled();
        expect(runtime.filesystem.mocks.writeFile).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.defaultParameters).toEqual({ fresh: true });
        }
      });

      it('should populate memory cache on filesystem cache hit', async () => {
        const cachedResult = createSuccessResult({ defaultParameters: { cached: true } });
        const { input, runtime } = createCacheContext({
          cacheExists: true,
          cachedResult,
        });
        const handler = createMockGetParametersHandler();

        const { wrapGetParameters } = parameterCacheMiddleware;

        await wrapGetParameters!(input, handler, runtime);

        runtime.filesystem.mocks.readFile.mockClear();

        const result = await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.defaultParameters).toEqual({ cached: true });
        }
      });

      it('should log memory cache hit', async () => {
        const handlerResult = createSuccessResult();
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;

        await wrapGetParameters!(input, handler, runtime);

        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.logger.debug).toHaveBeenCalledWith(expect.stringContaining('memory cache hit'));
      });
    });

    describe('cache cleanup', () => {
      it('should call cleanup after a successful cache write', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: false });
        const handler = createMockGetParametersHandler(createSuccessResult());

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.readdirStat).toHaveBeenCalledWith('/.tau/cache/parameters');
      });

      it('should delete cache entries older than maxAge', async () => {
        const oldMtimeMs = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago (older than the 7 day max age)
        const { input, runtime } = createCacheContext({ cacheExists: false });

        runtime.filesystem.mocks.readdirStat.mockResolvedValue([
          {
            path: '/.tau/cache/parameters/old-cache.json',
            name: 'old-cache.json',
            type: 'file',
            size: 100,
            mtimeMs: oldMtimeMs,
          },
        ]);

        const handler = createMockGetParametersHandler(createSuccessResult());

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.unlink).toHaveBeenCalledWith('/.tau/cache/parameters/old-cache.json');
      });

      it('should delete excess entries when over maxEntries', async () => {
        const now = Date.now();
        const { input, runtime } = createCacheContext({ cacheExists: false });

        // 102 files (2 over the 100 max), staggered mtimeMs newest first.
        const entries = Array.from({ length: 102 }, (_, index) => ({
          path: `/.tau/cache/parameters/cache-${index}.json`,
          name: `cache-${index}.json`,
          type: 'file',
          size: 100,
          mtimeMs: now - index * 1000,
        }));
        runtime.filesystem.mocks.readdirStat.mockResolvedValue(entries);

        const handler = createMockGetParametersHandler(createSuccessResult());

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.unlink).toHaveBeenCalledTimes(2);
        expect(runtime.filesystem.mocks.unlink.mock.calls.map(([path]) => path as string)).toEqual([
          '/.tau/cache/parameters/cache-101.json',
          '/.tau/cache/parameters/cache-100.json',
        ]);
      });

      it('should ignore files that are not parameter cache entries', async () => {
        const oldMtimeMs = Date.now() - 8 * 24 * 60 * 60 * 1000;
        const { input, runtime } = createCacheContext({ cacheExists: false });

        runtime.filesystem.mocks.readdirStat.mockResolvedValue([
          {
            path: '/.tau/cache/parameters/stray.bin',
            name: 'stray.bin',
            type: 'file',
            size: 100,
            mtimeMs: oldMtimeMs,
          },
        ]);

        const handler = createMockGetParametersHandler(createSuccessResult());

        const { wrapGetParameters } = parameterCacheMiddleware;
        await wrapGetParameters!(input, handler, runtime);

        expect(runtime.filesystem.mocks.unlink).not.toHaveBeenCalled();
      });

      it('should tolerate cleanup errors', async () => {
        const { input, runtime } = createCacheContext({ cacheExists: false });
        runtime.filesystem.mocks.readdirStat.mockRejectedValue(new Error('Readdir error'));

        const handlerResult = createSuccessResult();
        const handler = createMockGetParametersHandler(handlerResult);

        const { wrapGetParameters } = parameterCacheMiddleware;
        const result = await wrapGetParameters!(input, handler, runtime);

        expect(result).toBe(handlerResult);
        expect(runtime.filesystem.mocks.writeFile).toHaveBeenCalled();
      });
    });
  });
});
