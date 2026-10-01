/** Unit tests for the middleware authoring factory and shared operation services. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { OnWorkerLog } from '@taucad/types';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { EvaluateResult } from '#types/runtime-kernel-v2.types.js';
import type { EvaluateRequest } from '#types/runtime-middleware-v2.types.js';
import {
  createMiddlewareLogger,
  createMiddlewareState,
  createMiddlewareRuntime,
} from '#middleware/runtime-middleware.js';
import { defineMiddleware } from '#plugins/middleware-entry.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { createComputeCapabilityHost } from '#cache/kernel-compute-runtime.js';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph.
import { createMockFileSystem } from '../../test/support/kernel-worker.fixture.js';

const mockDependencies: readonly Dependency[] = [
  { type: 'file', path: 'test.kcl', contentHash: 'abc123' },
  { type: 'middleware', id: 'test-middleware', version: '1', index: 0, options: {} },
  { type: 'framework', name: 'tau', version: '0.0.1' },
];
const testSignal = new AbortController().signal;
const testTracer = { startSpan: vi.fn(() => ({ end: vi.fn() })) };
const testCompute = createComputeCapabilityHost({ binding: { mode: 'memory' }, workspace: 'test' }).capability(
  testSignal,
);
const runtimeFor = (stateSchema?: z.ZodObject<z.ZodRawShape>) =>
  createMiddlewareRuntime({
    signal: testSignal,
    tracer: testTracer,
    onLog: vi.fn() as OnWorkerLog,
    middlewareName: 'Test',
    filesystem: createMockFileSystem(),
    compute: testCompute,
    dependencies: mockDependencies,
    dependencyHash: 'a'.repeat(64),
    ...(stateSchema ? { stateSchema } : {}),
  });

describe('defineMiddleware', () => {
  it('keeps V2 hooks private on a registration', async () => {
    const wrapEvaluate = vi.fn();
    const wrapRender = vi.fn();
    const wrapWrite = vi.fn();
    const middleware = defineMiddleware({
      id: 'testMiddleware',
      name: 'TestMiddleware',
      wrapEvaluate,
      wrapRender,
      wrapWrite,
    });
    const plugin = middleware();
    expect(plugin).toEqual({ id: 'testMiddleware', options: undefined });
    expect(plugin).not.toHaveProperty('wrapEvaluate');
    await expect(resolveRuntimePluginDefinition('middleware', plugin)).resolves.toMatchObject({
      name: 'TestMiddleware',
      version: '1',
      wrapEvaluate,
      wrapRender,
      wrapWrite,
    });
  });

  it('attaches the state schema and permits no schema', async () => {
    const stateSchema = z.object({ count: z.number() });
    const stateful = defineMiddleware({ id: 'stateful', name: 'Stateful', stateSchema });
    const plain = defineMiddleware({ id: 'plain', name: 'Plain' });
    const statefulDefinition = await resolveRuntimePluginDefinition('middleware', stateful());
    const plainDefinition = await resolveRuntimePluginDefinition('middleware', plain());
    expect(statefulDefinition.stateSchema).toBe(stateSchema);
    expect(plainDefinition.stateSchema).toBeUndefined();
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
      signal: testSignal,
      tracer: testTracer,
      onLog: onLog as OnWorkerLog,
      middlewareName: 'TestMiddleware',
      filesystem,
      compute: testCompute,
      dependencies: mockDependencies,
      dependencyHash: mockDependencyHash,
    });

    expect(runtime.logger).toBeDefined();
    expect(runtime.tracer).toBe(testTracer);
    expect(runtime.filesystem).toBe(filesystem);
    expect(runtime.compute).toBe(testCompute);
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
      signal: testSignal,
      tracer: testTracer,
      onLog: onLog as OnWorkerLog,
      middlewareName: 'TestMiddleware',
      filesystem,
      compute: testCompute,
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
      signal: testSignal,
      tracer: testTracer,
      onLog: onLog as OnWorkerLog,
      middlewareName: 'MyMiddleware',
      filesystem,
      compute: testCompute,
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

describe('V2 wrap hook behavior', () => {
  const input: EvaluateRequest = { entryPath: 'test.kcl', parameters: {}, options: {} };

  it('can continue and transform an evaluation result', async () => {
    const middleware = defineMiddleware({
      id: 'transform',
      name: 'Transform',
      async wrapEvaluate(request, next) {
        const result = await next(request);
        return result.success ? { ...result, data: { ...result.data, views: ['model'] } } : result;
      },
    });
    const next = vi.fn(
      async (_request: EvaluateRequest): Promise<EvaluateResult> => ({
        success: true,
        data: { views: [] },
        issues: [],
      }),
    );
    const definition = await resolveRuntimePluginDefinition('middleware', middleware());
    const result = await definition.wrapEvaluate!(input, next, runtimeFor());
    expect(next).toHaveBeenCalledWith(input);
    expect(result).toMatchObject({ success: true, data: { views: ['model'] } });
  });

  it('can short-circuit without calling the next hook', async () => {
    const cached: EvaluateResult = { success: true, data: { views: ['model'] }, issues: [] };
    const middleware = defineMiddleware({
      id: 'cached',
      name: 'Cached',
      async wrapEvaluate() {
        return cached;
      },
    });
    const next = vi.fn(async (_request: EvaluateRequest) => cached);
    const definition = await resolveRuntimePluginDefinition('middleware', middleware());
    expect(await definition.wrapEvaluate!(input, next, runtimeFor())).toBe(cached);
    expect(next).not.toHaveBeenCalled();
  });

  it('can update and read operation state around the next hook', async () => {
    const stateSchema = z.object({ callCount: z.number() });
    const middleware = defineMiddleware({
      id: 'statefulWrap',
      name: 'StatefulWrap',
      stateSchema,
      async wrapEvaluate(request, next, { state }) {
        state.update({ callCount: 1 });
        const result = await next(request);
        state.update({ callCount: (state.value.callCount ?? 0) + 1 });
        return result;
      },
    });
    const runtime = createMiddlewareRuntime<z.infer<typeof stateSchema>>({
      signal: testSignal,
      tracer: testTracer,
      onLog: vi.fn() as OnWorkerLog,
      middlewareName: 'StatefulWrap',
      filesystem: createMockFileSystem(),
      compute: testCompute,
      dependencies: mockDependencies,
      dependencyHash: 'a'.repeat(64),
      stateSchema,
    });
    const next = vi.fn(
      async (_request: EvaluateRequest): Promise<EvaluateResult> => ({ success: true, data: {}, issues: [] }),
    );
    const definition = await resolveRuntimePluginDefinition('middleware', middleware());
    await definition.wrapEvaluate!(input, next, runtime);
    expect(runtime.state.value.callCount).toBe(2);
  });
});
