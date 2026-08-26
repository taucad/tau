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
import { z } from 'zod';
import type { ExportGeometryResult } from '#types/runtime.types.js';
import type { ExportGeometryRequest } from '#types/runtime-kernel.types.js';
import type { ExportGeometryHandler, KernelMiddlewareRuntime } from '#types/runtime-middleware.types.js';
import type { Dependency, ExportDependency } from '#types/runtime-dependency.types.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph.
import { createGeometryFile, MockKernelWorker } from '../../test/support/kernel-worker.fixture.js';

const imageViewSchema = z.object({ id: z.string(), label: z.string().optional(), phi: z.number(), theta: z.number() });
const imageEdgeSchemas = {
  webp: z.union([
    z
      .object({
        mode: z.literal('single').default('single'),
        projection: z.enum(['perspective', 'orthographic']).default('perspective'),
        includeAxes: z.boolean().default(false),
        includeLabel: z.boolean().default(false),
        includeScale: z.boolean().default(false),
      })
      .strict(),
    z
      .object({
        mode: z.literal('batch'),
        projection: z.enum(['perspective', 'orthographic']).default('perspective'),
        includeAxes: z.boolean().default(false),
        includeLabel: z.boolean().default(false),
        includeScale: z.boolean().default(false),
        views: z.array(imageViewSchema).min(1),
      })
      .strict(),
  ]),
} as const;

describe('kernel-worker wrapExportGeometry middleware', () => {
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
      exportZodSchemas: { gltf: z.object({}) },
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
      exportZodSchemas: { gltf: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.runCreateGeometry('main.ts', {});
    await worker.runExportGeometry('gltf');

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.format).toBe('gltf');
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

  it('should keep render-only options out of native-build identity while retaining them in export identity', async () => {
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
    expect(createCaptures[0]!.hash).toBe(createCaptures[1]!.hash);
    for (const capture of createCaptures) {
      expect(capture.dependencies.some((dependency) => dependency.type === 'render-options')).toBe(false);
    }
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

  it('should include batch image views, labels, projection, and annotations in export dependency hashes', async () => {
    const hashes: string[] = [];
    const middleware = defineMiddleware({
      id: 'ImageIdentityCapture',
      name: 'ImageIdentityCapture',
      async wrapExportGeometry(input, handler, runtime) {
        hashes.push(runtime.dependencyHash);
        return handler(input);
      },
    });
    const transcoder = defineTranscoder({
      id: 'image-identity',
      name: 'ImageIdentity',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          optionsSchema: imageEdgeSchemas.webp,
        },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        return { success: true, data: input.files, issues: [] };
      },
      async cleanup() {
        await Promise.resolve();
      },
    });
    const worker = new MockKernelWorker({
      middleware: [middleware],
      transcoders: [transcoder()],
      exportResult: defaultExportResult,
      exportZodSchemas: { glb: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });
    const front = { id: 'front', label: 'Front', phi: 90, theta: 0 } as const;
    const top = { id: 'top', label: 'Top', phi: 0, theta: 0 } as const;
    const requests = [
      { mode: 'batch', projection: 'orthographic', includeAxes: true, includeLabel: true, views: [front, top] },
      { mode: 'batch', projection: 'orthographic', includeAxes: true, includeLabel: true, views: [top, front] },
      { mode: 'batch', projection: 'orthographic', includeAxes: false, includeLabel: true, views: [front, top] },
      { mode: 'batch', projection: 'perspective', includeAxes: true, includeLabel: true, views: [front, top] },
      {
        mode: 'batch',
        projection: 'orthographic',
        includeAxes: true,
        includeLabel: true,
        views: [{ ...front, label: 'Forward' }, top],
      },
      {
        mode: 'batch',
        projection: 'orthographic',
        includeAxes: true,
        includeLabel: true,
        includeScale: true,
        views: [front, top],
      },
    ] as const;

    await worker.initialize({ callbacks: { onLog: onLog as OnWorkerLog }, transferables: {}, options: {} });
    await worker.runCreateGeometry('main.ts', {});
    for (const request of requests) {
      // oxlint-disable-next-line no-await-in-loop -- each request contributes one ordered identity observation.
      const result = await worker.runExportGeometry('webp', request);
      expect(result.success).toBe(true);
    }

    expect(hashes).toHaveLength(requests.length);
    expect(new Set(hashes).size).toBe(requests.length);
  });

  it('should include the selected transcoder version in export dependency hashes', async () => {
    const capture = async (version: string) => {
      let dependencyHash = '';
      let dependencies: readonly Dependency[] = [];
      const middleware = defineMiddleware({
        id: `TranscoderCapture${version}`,
        name: `TranscoderCapture${version}`,
        async wrapExportGeometry(input, handler, runtime) {
          dependencyHash = runtime.dependencyHash;
          dependencies = runtime.dependencies;
          return handler(input);
        },
      });
      const transcoder = defineTranscoder({
        id: 'test-image',
        name: 'TestImage',
        version,
        edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }] as const,
        async initialize() {
          return {};
        },
        async transcode(input) {
          return { success: true, data: input.files, issues: [] };
        },
        async cleanup() {
          await Promise.resolve();
        },
      });
      const worker = new MockKernelWorker({
        middleware: [middleware],
        transcoders: [transcoder()],
        exportResult: {
          success: true,
          data: [{ bytes: new Uint8Array([1]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
          issues: [],
        },
        exportZodSchemas: { glb: z.object({}) },
        onLog: onLog as OnWorkerLog,
      });

      await worker.initialize({ callbacks: { onLog: onLog as OnWorkerLog }, transferables: {}, options: {} });
      await worker.runCreateGeometry('main.ts', {});
      const result = await worker.runExportGeometry('webp');
      expect(result.success).toBe(true);
      return { dependencyHash, dependencies };
    };

    const first = await capture('1.0.0');
    const second = await capture('2.0.0');
    expect(first.dependencyHash).not.toBe(second.dependencyHash);
    const firstExport = first.dependencies.find(
      (dependency): dependency is ExportDependency => dependency.type === 'export' && dependency.format === 'webp',
    );
    const secondExport = second.dependencies.find(
      (dependency): dependency is ExportDependency => dependency.type === 'export' && dependency.format === 'webp',
    );
    expect(firstExport?.route?.transcoderVersion).toBe('1.0.0');
    expect(secondExport?.route?.transcoderVersion).toBe('2.0.0');
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

    await worker.exportModel({ format: 'step', file: createGeometryFile('main.ts'), parameters: {} });

    expect(capturedDependencies).toContainEqual({ type: 'kernel', id: 'mock-kernel', version: '1.0.0' });
    expect(capturedDependencies).toContainEqual({
      type: 'middleware',
      id: 'DependencyCapture',
      version: '1.2.3',
      index: 0,
      options: { cache: true },
    });
  });

  it('should hash the phase-aware union of middleware that actually participates in export', async () => {
    let capturedDependencies: readonly Dependency[] = [];
    const unused = defineMiddleware({
      id: 'Unused',
      name: 'Unused',
      async wrapMeshGeometry(input, handler) {
        return handler(input);
      },
    });
    const create = defineMiddleware({
      id: 'Create',
      name: 'Create',
      async wrapCreateGeometry(input, handler) {
        return handler(input);
      },
    });
    const exportMiddleware = defineMiddleware({
      id: 'Export',
      name: 'Export',
      async wrapExportGeometry(input, handler, runtime) {
        capturedDependencies = runtime.dependencies;
        return handler(input);
      },
    });
    const noHooks = defineMiddleware({ id: 'NoHooks', name: 'NoHooks' });
    const worker = new MockKernelWorker({
      middleware: [unused, create, noHooks, exportMiddleware],
      exportResult: defaultExportResult,
      exportZodSchemas: { step: z.object({}) },
      onLog: onLog as OnWorkerLog,
    });

    await worker.exportModel({ format: 'step', file: createGeometryFile('main.ts'), parameters: {} });

    expect(capturedDependencies.filter((dependency) => dependency.type === 'middleware')).toEqual([
      { type: 'middleware', id: 'Create', version: '1', index: 0, options: {} },
      { type: 'middleware', id: 'Export', version: '1', index: 1, options: {} },
    ]);
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
