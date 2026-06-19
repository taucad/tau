/**
 * Integration tests for wrapExportGeometry middleware execution.
 *
 * Tests the onion chain execution model for exportGeometry using
 * MockKernelWorker to verify:
 * 1. wrapExportGeometry hooks are called with correct input and runtime
 * 2. Middleware can intercept and modify export results
 * 3. Multiple middleware hooks chain correctly in onion order
 * 4. Short-circuiting works correctly
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { OnWorkerLog } from '@taucad/types';
import { z } from 'zod';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { ExportGeometryRequest } from '#types/runtime-kernel.types.js';
import type { ExportGeometryHandler, KernelMiddlewareRuntime } from '#types/runtime-middleware.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import { exportMemoryCache, geometryCache } from '#middleware/geometry-cache.middleware.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { MockKernelWorker } from '#testing/kernel-testing.utils.js';

describe('kernel-worker wrapExportGeometry middleware', () => {
  const resolveGeometryCacheMiddleware = async () => resolveRuntimePluginDefinition('middleware', geometryCache());
  let geometryCacheMiddleware: Awaited<ReturnType<typeof resolveGeometryCacheMiddleware>>;

  beforeAll(async () => {
    geometryCacheMiddleware = await resolveGeometryCacheMiddleware();
  });

  function spyOnExportGeometry(worker: MockKernelWorker) {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- keyof MockKernelWorker not assignable to vi.spyOn; use as unknown as to spy on protected method
    return vi.spyOn(
      worker as unknown as { onExportGeometry: (...args: unknown[]) => Promise<unknown> },
      'onExportGeometry',
    );
  }

  const defaultExportResult: ExportGeometryResult = {
    success: true,
    data: [
      {
        bytes: new TextEncoder().encode('test-content'),
        name: 'export.gltf',
        mimeType: 'model/gltf+json',
      },
    ],
    issues: [],
  };

  let onLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLog = vi.fn();
    exportMemoryCache.clear();
  });

  it('should call wrapExportGeometry hook when middleware is registered', async () => {
    const wrapExportGeometry = vi.fn(async (input: ExportGeometryRequest, handler: ExportGeometryHandler) =>
      handler(input),
    );

    const middleware = defineMiddleware({
      id: 'TrackingMiddleware',
      name: 'TrackingMiddleware',
      wrapExportGeometry,
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    await worker.runExportGeometry('gltf');

    expect(wrapExportGeometry).toHaveBeenCalledTimes(1);
  });

  it('should receive correct export request and KernelMiddlewareRuntime', async () => {
    let capturedInput: ExportGeometryRequest | undefined;
    let capturedRuntime: KernelMiddlewareRuntime | undefined;

    const middleware = defineMiddleware({
      id: 'InspectMiddleware',
      name: 'InspectMiddleware',
      async wrapExportGeometry(input, handler, runtime) {
        capturedInput = input;
        capturedRuntime = runtime;
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    await worker.runExportGeometry('stl');

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.format).toBe('stl');
    expect(capturedInput).not.toHaveProperty('nativeHandle');
    expect(capturedRuntime).toBeDefined();
    expect(capturedRuntime!.logger).toBeDefined();
    expect(capturedRuntime!.filesystem).toBeDefined();
    expect(capturedRuntime!.state).toBeDefined();
  });

  it('should allow middleware to modify the export result', async () => {
    const modifiedData = new TextEncoder().encode('modified-content');

    const middleware = defineMiddleware({
      id: 'TransformMiddleware',
      name: 'TransformMiddleware',
      async wrapExportGeometry(input, handler) {
        const result = await handler(input);
        if (result.success) {
          return {
            ...result,
            data: result.data.map((entry) => ({
              ...entry,
              bytes: modifiedData,
            })),
          };
        }

        return result;
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    const result = await worker.runExportGeometry();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.bytes).toBe(modifiedData);
    }
  });

  it('should execute multiple middleware in onion order', async () => {
    const executionOrder: string[] = [];

    const middleware1 = defineMiddleware({
      id: 'M1',
      name: 'M1',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('M1-before');
        const result = await handler(input);
        executionOrder.push('M1-after');
        return result;
      },
    });

    const middleware2 = defineMiddleware({
      id: 'M2',
      name: 'M2',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('M2-before');
        const result = await handler(input);
        executionOrder.push('M2-after');
        return result;
      },
    });

    const middleware3 = defineMiddleware({
      id: 'M3',
      name: 'M3',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('M3-before');
        const result = await handler(input);
        executionOrder.push('M3-after');
        return result;
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware1, middleware2, middleware3],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    const exportSpy = spyOnExportGeometry(worker).mockImplementation(async () => {
      executionOrder.push('main');
      return defaultExportResult;
    });

    await worker.runCreateGeometry('main.ts', {});
    executionOrder.length = 0;
    await worker.runExportGeometry();

    expect(executionOrder).toEqual(['M1-before', 'M2-before', 'M3-before', 'main', 'M3-after', 'M2-after', 'M1-after']);

    exportSpy.mockRestore();
  });

  it('should allow middleware to short-circuit by not calling handler', async () => {
    const cachedResult: ExportGeometryResult = {
      success: true,
      data: [
        {
          bytes: new TextEncoder().encode('cached'),
          name: 'cached.stl',
          mimeType: 'model/stl',
        },
      ],
      issues: [],
    };

    const cacheMiddleware = defineMiddleware({
      id: 'ExportCacheMiddleware',
      name: 'ExportCacheMiddleware',
      async wrapExportGeometry(_input, _handler) {
        return cachedResult;
      },
    });

    const worker = new MockKernelWorker({
      middleware: [cacheMiddleware],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    const exportSpy = spyOnExportGeometry(worker);

    await worker.runCreateGeometry('main.ts', {});
    const result = await worker.runExportGeometry();

    expect(exportSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.name).toBe('cached.stl');
    }

    exportSpy.mockRestore();
  });

  it('should skip middleware without wrapExportGeometry hooks', async () => {
    const executionOrder: string[] = [];

    const withHook = defineMiddleware({
      id: 'WithHook',
      name: 'WithHook',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('WithHook');
        return handler(input);
      },
    });

    const withoutHook = defineMiddleware({
      id: 'WithoutHook',
      name: 'WithoutHook',
      async wrapCreateGeometry(input, handler) {
        executionOrder.push('should-not-run');
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [withHook, withoutHook],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    executionOrder.length = 0;
    await worker.runExportGeometry();

    expect(executionOrder).toEqual(['WithHook']);
  });

  it('should catch middleware errors and return error result', async () => {
    const middleware = defineMiddleware({
      id: 'FailingMiddleware',
      name: 'FailingMiddleware',
      async wrapExportGeometry(_input, _handler) {
        throw new Error('Export middleware failed');
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    const result = await worker.runExportGeometry();

    expect(result.success).toBe(false);
    if (!result.success && result.issues[0]) {
      expect(result.issues[0].message).toContain('Middleware error in FailingMiddleware');
      expect(result.issues[0].message).toContain('Export middleware failed');
    }
  });

  it('should skip hooks of disabled middleware', async () => {
    const executionOrder: string[] = [];

    const enabled = defineMiddleware({
      id: 'Enabled',
      name: 'Enabled',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('enabled');
        return handler(input);
      },
    });

    const disabled = defineMiddleware({
      id: 'Disabled',
      name: 'Disabled',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('disabled');
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [enabled, disabled],
      middlewareEnabled: [true, false],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    await worker.runExportGeometry();

    expect(executionOrder).toEqual(['enabled']);
  });

  it('should include parameters in export dependency hashes from the last settled render', async () => {
    const captures: Array<{ hash: string; dependencies: readonly Dependency[] }> = [];
    const middleware = defineMiddleware({
      id: 'ParameterCapture',
      name: 'ParameterCapture',
      async wrapExportGeometry(input, handler, runtime) {
        captures.push({ hash: runtime.dependencyHash, dependencies: runtime.dependencies });
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', { height: 10 });
    await worker.runExportGeometry('step');
    await worker.runCreateGeometry('main.ts', { height: 20 });
    await worker.runExportGeometry('step');

    expect(captures).toHaveLength(2);
    expect(captures[0]!.hash).not.toBe(captures[1]!.hash);
    expect(captures[0]!.dependencies).toContainEqual({ type: 'parameter', parameters: { height: 10 } });
    expect(captures[1]!.dependencies).toContainEqual({ type: 'parameter', parameters: { height: 20 } });
  });

  it('should include render options in create and export dependency hashes', async () => {
    const createCaptures: Array<{ hash: string; dependencies: readonly Dependency[] }> = [];
    const exportCaptures: Array<{ hash: string; dependencies: readonly Dependency[] }> = [];
    const middleware = defineMiddleware({
      id: 'RenderOptionCapture',
      name: 'RenderOptionCapture',
      async wrapCreateGeometry(input, handler, runtime) {
        createCaptures.push({ hash: runtime.dependencyHash, dependencies: runtime.dependencies });
        return handler(input);
      },
      async wrapExportGeometry(input, handler, runtime) {
        exportCaptures.push({ hash: runtime.dependencyHash, dependencies: runtime.dependencies });
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {}, { quality: 'coarse' });
    await worker.runExportGeometry('step');
    await worker.runCreateGeometry('main.ts', {}, { quality: 'fine' });
    await worker.runExportGeometry('step');

    expect(createCaptures).toHaveLength(2);
    expect(createCaptures[0]!.hash).not.toBe(createCaptures[1]!.hash);
    expect(createCaptures[0]!.dependencies).toContainEqual({ type: 'render-options', options: { quality: 'coarse' } });
    expect(createCaptures[1]!.dependencies).toContainEqual({ type: 'render-options', options: { quality: 'fine' } });
    expect(exportCaptures).toHaveLength(2);
    expect(exportCaptures[0]!.hash).not.toBe(exportCaptures[1]!.hash);
    expect(exportCaptures[0]!.dependencies).toContainEqual({ type: 'render-options', options: { quality: 'coarse' } });
    expect(exportCaptures[1]!.dependencies).toContainEqual({ type: 'render-options', options: { quality: 'fine' } });
  });

  it('should include export format and options in export dependency hashes', async () => {
    const captures: Array<{ hash: string; dependencies: readonly Dependency[] }> = [];
    const middleware = defineMiddleware({
      id: 'ExportDependencyCapture',
      name: 'ExportDependencyCapture',
      async wrapExportGeometry(input, handler, runtime) {
        captures.push({ hash: runtime.dependencyHash, dependencies: runtime.dependencies });
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      exportZodSchemas: {
        step: z.object({ unit: z.string().optional() }),
        stl: z.object({ unit: z.string().optional() }),
      },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', { height: 10 });
    await worker.runExportGeometry('step', { unit: 'mm' });
    await worker.runExportGeometry('step', { unit: 'cm' });
    await worker.runExportGeometry('stl', { unit: 'mm' });

    expect(captures).toHaveLength(3);
    expect(new Set(captures.map((capture) => capture.hash)).size).toBe(3);
    expect(captures[0]!.dependencies).toContainEqual(
      expect.objectContaining({ type: 'export', format: 'step', options: { unit: 'mm' } }),
    );
    expect(captures[1]!.dependencies).toContainEqual(
      expect.objectContaining({ type: 'export', format: 'step', options: { unit: 'cm' } }),
    );
    expect(captures[2]!.dependencies).toContainEqual(
      expect.objectContaining({ type: 'export', format: 'stl', options: { unit: 'mm' } }),
    );
  });

  it('should include active kernel id and middleware signatures in export dependencies', async () => {
    let capturedDependencies: readonly Dependency[] = [];
    const middleware = defineMiddleware({
      id: 'DependencyCapture',
      name: 'DependencyCapture',
      version: '1.2.3',
      async wrapExportGeometry(input, handler, runtime) {
        capturedDependencies = runtime.dependencies;
        return handler(input);
      },
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      middlewareConfigs: [{ cache: true }],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    await worker.runExportGeometry('step');

    expect(capturedDependencies).toContainEqual({ type: 'kernel', id: 'mock-kernel', version: '1.0.0' });
    expect(capturedDependencies).toContainEqual({
      type: 'middleware',
      name: 'DependencyCapture',
      version: '1.2.3',
      index: 0,
      options: { cache: true },
    });
  });

  it('should cache repeated exports for the same settled render', async () => {
    const worker = new MockKernelWorker({
      middleware: [geometryCacheMiddleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', { height: 10 });
    await worker.runExportGeometry('step');
    await worker.runExportGeometry('step');

    expect(worker.exportGeometrySpy).toHaveBeenCalledOnce();
  });

  it('should fail current-state export middleware clearly without a settled render identity', async () => {
    const worker = new MockKernelWorker({
      middleware: [geometryCacheMiddleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    const result = await worker.runExportGeometry('step');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]).toMatchObject({
        code: 'RUNTIME_EXPORT_RENDER_IDENTITY_MISSING',
        severity: 'error',
      });
    }
  });

  it('should serve export cache hits before native handle restoration', async () => {
    const worker = new MockKernelWorker({
      middleware: [geometryCacheMiddleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', { height: 10 });
    await worker.runExportGeometry('step');
    const createCallsAfterCacheWrite = worker.createGeometryCalls;
    const internals = worker as unknown as { nativeHandle: unknown; lastSerializedNativeHandle: unknown };
    internals.nativeHandle = undefined;
    internals.lastSerializedNativeHandle = undefined;

    await worker.runExportGeometry('step');

    expect(worker.createGeometryCalls).toBe(createCallsAfterCacheWrite);
    expect(worker.exportGeometrySpy).toHaveBeenCalledOnce();
  });

  it('should miss export cache when parameters change and hit again when parameters return', async () => {
    const worker = new MockKernelWorker({
      middleware: [geometryCacheMiddleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', { height: 10 });
    await worker.runExportGeometry('step');
    await worker.runCreateGeometry('main.ts', { height: 20 });
    await worker.runExportGeometry('step');
    await worker.runCreateGeometry('main.ts', { height: 10 });
    await worker.runExportGeometry('step');

    expect(worker.exportGeometrySpy).toHaveBeenCalledTimes(2);
  });

  it('should not invoke export middleware when export options fail validation', async () => {
    const wrapExportGeometry = vi.fn(async (input: ExportGeometryRequest, handler: ExportGeometryHandler) =>
      handler(input),
    );
    const middleware = defineMiddleware({
      id: 'ValidationMiddleware',
      name: 'ValidationMiddleware',
      wrapExportGeometry,
    });
    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({ unit: z.string() }).strict() },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    const result = await worker.runExportGeometry('step', { unexpected: true });

    expect(result.success).toBe(false);
    expect(wrapExportGeometry).not.toHaveBeenCalled();
  });
});
