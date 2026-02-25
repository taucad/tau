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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OnWorkerLog } from '@taucad/types';
import type { ExportGeometryResult } from '#types/kernel.types.js';
import type { ExportGeometryInput } from '#types/kernel-worker.types.js';
import type { ExportGeometryHandler, KernelMiddlewareRuntime } from '#types/kernel-middleware.types.js';
import { defineMiddleware } from '#middleware/kernel-middleware.js';
import { MockKernelWorker } from '#testing/kernel-testing.utils.js';

describe('kernel-worker wrapExportGeometry middleware', () => {
  type ExportGeometrySpyTarget = {
    onExportGeometry: (...arguments_: unknown[]) => Promise<ExportGeometryResult>;
  };

  function spyOnExportGeometry(worker: MockKernelWorker) {
    return vi.spyOn(worker as unknown as ExportGeometrySpyTarget, 'onExportGeometry');
  }

  const defaultExportResult: ExportGeometryResult = {
    success: true,
    data: [{ bytes: new TextEncoder().encode('test-content'), name: 'export.gltf', mimeType: 'model/gltf+json' }],
    issues: [],
  };

  let onLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLog = vi.fn();
  });

  it('should call wrapExportGeometry hook when middleware is registered', async () => {
    const wrapExportGeometry = vi.fn(async (input: ExportGeometryInput, handler: ExportGeometryHandler) =>
      handler(input),
    );

    const middleware = defineMiddleware({
      name: 'TrackingMiddleware',
      wrapExportGeometry,
    });

    const worker = new MockKernelWorker({
      middleware: [middleware],
      exportResult: defaultExportResult,
      onLog: onLog as OnWorkerLog,
    });

    await worker.runExportGeometry('gltf');

    expect(wrapExportGeometry).toHaveBeenCalledTimes(1);
  });

  it('should receive correct ExportGeometryInput and KernelMiddlewareRuntime', async () => {
    let capturedInput: ExportGeometryInput | undefined;
    let capturedRuntime: KernelMiddlewareRuntime | undefined;

    const middleware = defineMiddleware({
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

    await worker.runExportGeometry('stl');

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.fileType).toBe('stl');
    expect(capturedRuntime).toBeDefined();
    expect(capturedRuntime!.logger).toBeDefined();
    expect(capturedRuntime!.filesystem).toBeDefined();
    expect(capturedRuntime!.state).toBeDefined();
  });

  it('should allow middleware to modify the export result', async () => {
    const modifiedData = new TextEncoder().encode('modified-content');

    const middleware = defineMiddleware({
      name: 'TransformMiddleware',
      async wrapExportGeometry(input, handler) {
        const result = await handler(input);
        if (result.success) {
          return {
            ...result,
            data: result.data.map((entry) => ({ ...entry, bytes: modifiedData })),
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

    const result = await worker.runExportGeometry();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.bytes).toBe(modifiedData);
    }
  });

  it('should execute multiple middleware in onion order', async () => {
    const executionOrder: string[] = [];

    const middleware1 = defineMiddleware({
      name: 'M1',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('M1-before');
        const result = await handler(input);
        executionOrder.push('M1-after');
        return result;
      },
    });

    const middleware2 = defineMiddleware({
      name: 'M2',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('M2-before');
        const result = await handler(input);
        executionOrder.push('M2-after');
        return result;
      },
    });

    const middleware3 = defineMiddleware({
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

    await worker.runExportGeometry();

    expect(executionOrder).toEqual(['M1-before', 'M2-before', 'M3-before', 'main', 'M3-after', 'M2-after', 'M1-after']);

    exportSpy.mockRestore();
  });

  it('should allow middleware to short-circuit by not calling handler', async () => {
    const cachedResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new TextEncoder().encode('cached'), name: 'cached.stl', mimeType: 'model/stl' }],
      issues: [],
    };

    const cacheMiddleware = defineMiddleware({
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
      name: 'WithHook',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('WithHook');
        return handler(input);
      },
    });

    const withoutHook = defineMiddleware({
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

    await worker.runExportGeometry();

    expect(executionOrder).toEqual(['WithHook']);
  });

  it('should catch middleware errors and return error result', async () => {
    const middleware = defineMiddleware({
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
      name: 'Enabled',
      async wrapExportGeometry(input, handler) {
        executionOrder.push('enabled');
        return handler(input);
      },
    });

    const disabled = defineMiddleware({
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

    await worker.runExportGeometry();

    expect(executionOrder).toEqual(['enabled']);
  });
});
