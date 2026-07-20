/**
 * Unit tests for kernel middleware factory and helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { OnWorkerLog } from '@taucad/types';
import type { CreateGeometryResult } from '#types/runtime.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import {
  defineMiddleware,
  createMiddlewareLogger,
  createMiddlewareState,
  createMiddlewareRuntime,
} from '#middleware/runtime-middleware.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { createMockFileSystem } from '#testing/kernel-testing.utils.js';

// Mock dependencies for testing
const mockDependencies: readonly Dependency[] = [
  { type: 'file', path: 'test.kcl', contentHash: 'abc123' },
  {
    type: 'middleware',
    id: 'test-middleware',
    version: '1',
    index: 0,
    options: {},
  },
  { type: 'framework', name: 'tau', version: '0.0.1' },
];

describe('defineMiddleware', () => {
  it('should create public plugin metadata and hide lifecycle details', async () => {
    const middleware = defineMiddleware({
      id: 'testMiddleware',
      name: 'TestMiddleware',
    });
    const plugin = middleware();

    expect(plugin).toEqual({ id: 'testMiddleware', options: undefined });
    expect(plugin).not.toHaveProperty('name');
    await expect(resolveRuntimePluginDefinition('middleware', plugin)).resolves.toMatchObject({
      name: 'TestMiddleware',
      version: '1',
    });
  });

  it('should attach wrap hooks to the worker-owned definition', async () => {
    const wrapCreateGeometry = vi.fn();
    const wrapExportGeometry = vi.fn();
    const wrapGetParameters = vi.fn();

    const middleware = defineMiddleware({
      id: 'hookMiddleware',
      name: 'TestMiddleware',
      wrapCreateGeometry,
      wrapExportGeometry,
      wrapGetParameters,
    });
    const definition = await resolveRuntimePluginDefinition('middleware', middleware());

    expect(definition.wrapCreateGeometry).toBe(wrapCreateGeometry);
    expect(definition.wrapExportGeometry).toBe(wrapExportGeometry);
    expect(definition.wrapGetParameters).toBe(wrapGetParameters);
    expect(definition).not.toHaveProperty('wrapExportArtifact');
  });

  it('should attach a state schema to the worker-owned definition', async () => {
    const stateSchema = z.object({
      count: z.number(),
      message: z.string(),
    });

    const middleware = defineMiddleware({
      id: 'statefulMiddleware',
      name: 'TestMiddleware',
      stateSchema,
    });
    const definition = await resolveRuntimePluginDefinition('middleware', middleware());

    expect(definition.stateSchema).toBe(stateSchema);
  });

  it('should allow middleware without a state schema', async () => {
    const middleware = defineMiddleware({
      id: 'noStateMiddleware',
      name: 'NoStateMiddleware',
    });
    const definition = await resolveRuntimePluginDefinition('middleware', middleware());

    expect(definition.stateSchema).toBeUndefined();
  });
});

describe('createMiddlewareLogger', () => {
  let onLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLog = vi.fn();
  });

  it('should create a logger that injects middleware name as component', () => {
    const logger = createMiddlewareLogger(onLog as OnWorkerLog, 'TestMiddleware');

    logger.log('Test message');

    expect(onLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Test message',
      origin: { component: 'TestMiddleware' },
      data: undefined,
    });
  });

  it('should log at debug level', () => {
    const logger = createMiddlewareLogger(onLog as OnWorkerLog, 'TestMiddleware');

    logger.debug('Debug message');

    expect(onLog).toHaveBeenCalledWith({
      level: 'debug',
      message: 'Debug message',
      origin: { component: 'TestMiddleware' },
      data: undefined,
    });
  });

  it('should log at trace level', () => {
    const logger = createMiddlewareLogger(onLog as OnWorkerLog, 'TestMiddleware');

    logger.trace('Trace message');

    expect(onLog).toHaveBeenCalledWith({
      level: 'trace',
      message: 'Trace message',
      origin: { component: 'TestMiddleware' },
      data: undefined,
    });
  });

  it('should log at warn level', () => {
    const logger = createMiddlewareLogger(onLog as OnWorkerLog, 'TestMiddleware');

    logger.warn('Warning message');

    expect(onLog).toHaveBeenCalledWith({
      level: 'warn',
      message: 'Warning message',
      origin: { component: 'TestMiddleware' },
      data: undefined,
    });
  });

  it('should log at error level', () => {
    const logger = createMiddlewareLogger(onLog as OnWorkerLog, 'TestMiddleware');

    logger.error('Error message');

    expect(onLog).toHaveBeenCalledWith({
      level: 'error',
      message: 'Error message',
      origin: { component: 'TestMiddleware' },
      data: undefined,
    });
  });

  it('should include additional data when provided', () => {
    const logger = createMiddlewareLogger(onLog as OnWorkerLog, 'TestMiddleware');

    logger.log('Message with data', { data: { key: 'value' } });

    expect(onLog).toHaveBeenCalledWith({
      level: 'info',
      message: 'Message with data',
      origin: { component: 'TestMiddleware' },
      data: { key: 'value' },
    });
  });
});

describe('createMiddlewareState', () => {
  it('should create a state with empty initial value', () => {
    const state = createMiddlewareState();

    expect(state.value).toEqual({});
  });

  it('should update state with partial data', () => {
    type TestState = { count: number; message: string };
    const state = createMiddlewareState<TestState>();

    state.update({ count: 5 });

    expect(state.value.count).toBe(5);
    expect(state.value.message).toBeUndefined();
  });

  it('should merge multiple updates', () => {
    type TestState = { count: number; message: string };
    const state = createMiddlewareState<TestState>();

    state.update({ count: 5 });
    state.update({ message: 'hello' });

    expect(state.value.count).toBe(5);
    expect(state.value.message).toBe('hello');
  });

  it('should overwrite existing values on update', () => {
    type TestState = { count: number };
    const state = createMiddlewareState<TestState>();

    state.update({ count: 5 });
    state.update({ count: 10 });

    expect(state.value.count).toBe(10);
  });

  it('should validate updates against schema if provided', () => {
    const schema = z.object({
      count: z.number(),
    });

    const state = createMiddlewareState<z.infer<typeof schema>>(schema);

    // Valid update should succeed
    expect(() => {
      state.update({ count: 5 });
    }).not.toThrow();
    expect(state.value.count).toBe(5);
  });

  it('should throw on invalid update when schema is provided', () => {
    const schema = z.object({
      count: z.number(),
    });

    const state = createMiddlewareState<z.infer<typeof schema>>(schema);

    // Invalid update should throw
    expect(() => {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- Testing invalid input
      const invalidValue: number = 'not a number' as any;
      state.update({ count: invalidValue });
    }).toThrow();
  });

  it('should handle nested objects with deepmerge', () => {
    type TestState = { nested: { a: number; b: number } };
    const state = createMiddlewareState<TestState>();

    state.update({ nested: { a: 1, b: 2 } });
    state.update({ nested: { a: 10, b: 2 } });

    expect(state.value.nested?.a).toBe(10);
    expect(state.value.nested?.b).toBe(2);
  });
});

describe('createMiddlewareRuntime', () => {
  const mockDependencyHash = 'a'.repeat(64);

  it('should create a runtime with logger, filesystem, state, dependencies, and hash', () => {
    const onLog = vi.fn();
    const filesystem = createMockFileSystem();

    const runtime = createMiddlewareRuntime({
      onLog: onLog as OnWorkerLog,
      middlewareName: 'TestMiddleware',
      filesystem,
      dependencies: mockDependencies,
      dependencyHash: mockDependencyHash,
    });

    expect(runtime.logger).toBeDefined();
    expect(runtime.filesystem).toBe(filesystem);
    expect(runtime.state).toBeDefined();
    expect(runtime.state.value).toEqual({});
    expect(runtime.dependencies).toBe(mockDependencies);
    expect(runtime.dependencyHash).toBe(mockDependencyHash);
  });

  it('should create a runtime with state schema validation', () => {
    const onLog = vi.fn();
    const filesystem = createMockFileSystem();
    const stateSchema = z.object({
      count: z.number(),
    });

    const runtime = createMiddlewareRuntime<z.infer<typeof stateSchema>>({
      onLog: onLog as OnWorkerLog,
      middlewareName: 'TestMiddleware',
      filesystem,
      dependencies: mockDependencies,
      dependencyHash: mockDependencyHash,
      stateSchema,
    });

    // Valid update should work
    expect(() => {
      runtime.state.update({ count: 5 });
    }).not.toThrow();
    expect(runtime.state.value.count).toBe(5);
  });

  it('should configure logger with middleware name', () => {
    const onLog = vi.fn();
    const filesystem = createMockFileSystem();

    const runtime = createMiddlewareRuntime({
      onLog: onLog as OnWorkerLog,
      middlewareName: 'MyMiddleware',
      filesystem,
      dependencies: mockDependencies,
      dependencyHash: mockDependencyHash,
    });

    runtime.logger.debug('Test');

    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { component: 'MyMiddleware' },
      }),
    );
  });
});

describe('wrap hook behavior', () => {
  it('should allow wrap hooks to call handler and transform result', async () => {
    const middleware = defineMiddleware({
      id: 'transformMiddleware',
      name: 'TransformMiddleware',
      async wrapCreateGeometry(input, handler, _runtime) {
        const result = await handler(input);

        // Transform the result
        if (result.success && result.data !== undefined) {
          return {
            ...result,
            data: { ...result.data, transformed: true },
          };
        }

        return result;
      },
    });

    const mockHandler = vi.fn().mockResolvedValue({
      success: true,
      data: { format: 'gltf', hash: 'a'.repeat(64), content: new Uint8Array() },
      issues: [],
    });

    const runtime = createMiddlewareRuntime({
      onLog: vi.fn() as OnWorkerLog,
      middlewareName: 'Test',
      filesystem: createMockFileSystem(),
      dependencies: mockDependencies,
      dependencyHash: 'a'.repeat(64),
    });

    const definition = await resolveRuntimePluginDefinition('middleware', middleware());
    const result = await definition.wrapCreateGeometry!(
      {
        entryPath: '/test.kcl',
        parameters: {},
        options: {},
      },
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Mock handler for testing
      mockHandler as any,
      runtime,
    );

    expect(mockHandler).toHaveBeenCalled();
    expect(result.success).toBe(true);

    if (result.success) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Testing dynamic property
      expect((result.data as any).transformed).toBe(true);
    }
  });

  it('should allow wrap hooks to short-circuit by not calling handler', async () => {
    const cachedResult: CreateGeometryResult = {
      success: true,
      data: {
        format: 'gltf',
        content: new Uint8Array([1, 2, 3]),
      },
      issues: [],
    };

    const middleware = defineMiddleware({
      id: 'cacheMiddleware',
      name: 'CacheMiddleware',
      // Intentionally not calling handler to test short-circuit
      async wrapCreateGeometry(_input, _handler, _runtime) {
        // Short-circuit - don't call handler
        return cachedResult;
      },
    });

    const mockHandler = vi.fn();

    const input = {
      entryPath: '/test.kcl',
      parameters: {},
      options: {},
    } as const;
    const runtime = createMiddlewareRuntime({
      onLog: vi.fn() as OnWorkerLog,
      middlewareName: 'Test',
      filesystem: createMockFileSystem(),
      dependencies: mockDependencies,
      dependencyHash: 'a'.repeat(64),
    });

    const definition = await resolveRuntimePluginDefinition('middleware', middleware());
    const result = await definition.wrapCreateGeometry!(
      input,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Mock handler for testing
      mockHandler as any,
      runtime,
    );

    // Handler should not have been called
    expect(mockHandler).not.toHaveBeenCalled();
    expect(result).toBe(cachedResult);
  });

  it('should allow wrap hooks to access and update state', async () => {
    const stateSchema = z.object({
      callCount: z.number(),
    });

    type TestState = z.infer<typeof stateSchema>;

    const middleware = defineMiddleware({
      id: 'statefulWrapMiddleware',
      name: 'StatefulMiddleware',
      stateSchema,
      async wrapCreateGeometry(input, handler, { state }) {
        // Update state before calling handler
        state.update({ callCount: 1 });

        const result = await handler(input);

        // Read state after handler
        const count = state.value.callCount ?? 0;
        state.update({ callCount: count + 1 });

        return result;
      },
    });

    const mockHandler = vi.fn().mockResolvedValue({
      success: true,
      data: { format: 'gltf', content: new Uint8Array([1]) },
      issues: [],
    });

    const runtime = createMiddlewareRuntime<TestState>({
      onLog: vi.fn() as OnWorkerLog,
      middlewareName: 'Test',
      filesystem: createMockFileSystem(),
      dependencies: mockDependencies,
      dependencyHash: 'a'.repeat(64),
      stateSchema,
    });

    const definition = await resolveRuntimePluginDefinition('middleware', middleware());
    await definition.wrapCreateGeometry!(
      {
        entryPath: '/test.kcl',
        parameters: {},
        options: {},
      },
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Mock handler for testing
      mockHandler as any,
      runtime,
    );

    expect(runtime.state.value.callCount).toBe(2);
  });
});
