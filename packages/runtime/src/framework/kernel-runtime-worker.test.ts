import process from 'node:process';
import { MessageChannel } from 'node:worker_threads';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import type { ExportFile } from '@taucad/types';
import { createChannelClient, wrapMessagePort } from '@taucad/rpc';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { installWorkerCrashTrap } from '#transport/_internal/worker-crash-trap.js';
import { createWorkerDispatcher, runtimeChannelSessionKey } from '#transport/_internal/runtime-worker-dispatcher.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { KernelDefinition } from '#types/runtime-kernel.types.js';
import type { TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import type { CapabilitiesManifest, KernelIssue } from '#types/runtime.types.js';
import { seedTestFileSystem, initializeWorkerForTesting, createGeometryFile } from '#testing/kernel-testing.utils.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { TranscoderPlugin } from '#plugins/plugin-types.js';
import { replicadDetectPattern } from '#kernels/replicad/replicad.constants.js';
import { defineRuntime } from '#worker/runtime-definition.js';

// ===================================================================
// Helpers
// ===================================================================

type TestTranscoderPlugin = TranscoderPlugin & RuntimePluginDefinitionCarrier<TranscoderDefinition>;

function createMockKernelDefinition(id: string, overrides?: Partial<KernelDefinition>): KernelDefinition {
  const initSpy = vi.fn().mockResolvedValue({ id });
  const definition: KernelDefinition = {
    name: id,
    version: '1.0.0',
    initialize: initSpy,
    getDependencies: async (input) => ({ resolved: [input.filePath], unresolved: [] }),
    getParameters: async () => ({
      success: true,
      data: { defaultParameters: {}, jsonSchema: {} },
      issues: [] as KernelIssue[],
    }),
    createGeometry: async () => ({
      geometry: [{ format: 'gltf', content: new Uint8Array([1, 2, 3]) }],
      issues: [] as KernelIssue[],
      nativeHandle: undefined,
    }),
    exportGeometry: async () => ({
      success: true,
      data: [] as ExportFile[],
      issues: [] as KernelIssue[],
    }),
    ...overrides,
  };

  Object.defineProperty(definition, '_initSpy', { value: initSpy });
  return definition;
}

function getInitSpy(definition: KernelDefinition): ReturnType<typeof vi.fn> {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-injected property
  return (definition as unknown as { _initSpy: ReturnType<typeof vi.fn> })._initSpy;
}

async function createMultiKernelWorker(
  modules: Array<{
    id: string;
    extensions: string[];
    definition: KernelDefinition;
    detectImport?: string;
    builtinModuleNames?: string[];
  }>,
  transcoders: TestTranscoderPlugin[] = [],
): Promise<KernelRuntimeWorker> {
  const runtime = defineRuntime({
    kernels: modules.map((m) =>
      attachRuntimePluginDefinition(
        {
          id: m.id,
          extensions: m.extensions,
          ...(m.detectImport ? { detectImport: new RegExp(m.detectImport) } : {}),
          ...(m.builtinModuleNames ? { builtinModuleNames: m.builtinModuleNames } : {}),
        },
        () => m.definition,
      ),
    ),
    transcoders,
  });
  const worker = new KernelRuntimeWorker({ runtime });
  await initializeWorkerForTesting(worker);
  return worker;
}

// ===================================================================
// Tests
// ===================================================================

describe('KernelRuntimeWorker kernel selection', () => {
  const basePath = '/projects/test';

  beforeEach(async () => {
    await seedTestFileSystem({
      [`${basePath}/model.scad`]: 'cube([10, 10, 10]);',
      [`${basePath}/main.ts`]: `import { draw } from 'replicad';\ndraw();`,
      [`${basePath}/plain.ts`]: 'export const main = () => ({ type: "mesh" });',
      [`${basePath}/data.xyz`]: 'some unknown format',
      [`${basePath}/model.step`]: 'ISO-10303-21;',
    });
  });

  describe('extension fast path', () => {
    it('should select a kernel by extension when no detectImport is needed', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('model.scad'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
    });

    it('should select the first matching kernel by extension order', async () => {
      const kernelA = createMockKernelDefinition('kernel-a');
      const kernelB = createMockKernelDefinition('kernel-b');

      const worker = await createMultiKernelWorker([
        { id: 'kernel-a', extensions: ['scad'], definition: kernelA },
        { id: 'kernel-b', extensions: ['scad'], definition: kernelB },
      ]);

      await worker.createGeometry({
        file: createGeometryFile('model.scad'),
        parameters: {},
      });

      expect(getInitSpy(kernelA)).toHaveBeenCalledOnce();
      expect(getInitSpy(kernelB)).not.toHaveBeenCalled();
    });
  });

  describe('regex detection', () => {
    it('should select a kernel when file content matches detectImport regex', async () => {
      const replicadDefinition = createMockKernelDefinition('replicad');

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
        },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('main.ts'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(getInitSpy(replicadDefinition)).toHaveBeenCalledOnce();
    });

    it('should surface initialization errors when a kernel positively matches by regex', async () => {
      const replicadDefinition = createMockKernelDefinition('replicad');
      const catchAllDefinition = createMockKernelDefinition('tau');
      getInitSpy(replicadDefinition).mockRejectedValueOnce(new Error('Replicad multi WASM loader was not emitted'));

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
        },
        { id: 'tau', extensions: ['*'], definition: catchAllDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('main.ts'),
        parameters: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toEqual([
          expect.objectContaining({
            code: 'KERNEL_BINDING_FAILED',
            message: 'Replicad multi WASM loader was not emitted',
          }),
        ]);
      }
      expect(getInitSpy(replicadDefinition)).toHaveBeenCalledOnce();
      expect(getInitSpy(catchAllDefinition)).not.toHaveBeenCalled();
    });

    it('should not select a kernel when file content does not match detectImport regex', async () => {
      const replicadDefinition = createMockKernelDefinition('replicad');
      const catchAllDefinition = createMockKernelDefinition('tau');

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
        },
        { id: 'tau', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await worker.createGeometry({
        file: createGeometryFile('plain.ts'),
        parameters: {},
      });

      expect(getInitSpy(replicadDefinition)).not.toHaveBeenCalled();
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('catch-all fallback', () => {
    it('should select the catch-all kernel when no other kernel matches', async () => {
      const catchAllDefinition = createMockKernelDefinition('tau');

      const worker = await createMultiKernelWorker([{ id: 'tau', extensions: ['*'], definition: catchAllDefinition }]);

      const result = await worker.createGeometry({
        file: createGeometryFile('model.step'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });

    it('should accept any extension via catch-all wildcard', async () => {
      const catchAllDefinition = createMockKernelDefinition('tau');

      const worker = await createMultiKernelWorker([{ id: 'tau', extensions: ['*'], definition: catchAllDefinition }]);

      const result = await worker.createGeometry({
        file: createGeometryFile('data.xyz'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });

    it('should defer catch-all when bundler-equipped kernels exist', async () => {
      const replicadDefinition = createMockKernelDefinition('replicad');
      const catchAllDefinition = createMockKernelDefinition('tau');

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
          builtinModuleNames: ['replicad'],
        },
        { id: 'tau', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await worker.createGeometry({
        file: createGeometryFile('model.step'),
        parameters: {},
      });

      expect(getInitSpy(replicadDefinition)).not.toHaveBeenCalled();
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('multi-kernel priority', () => {
    it('should select extension-matched kernel over catch-all', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');
      const catchAllDefinition = createMockKernelDefinition('tau');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
        { id: 'tau', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await worker.createGeometry({
        file: createGeometryFile('model.scad'),
        parameters: {},
      });

      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
      expect(getInitSpy(catchAllDefinition)).not.toHaveBeenCalled();
    });
  });

  describe('selection cache', () => {
    it('should reuse cached kernel selection on repeated calls for the same file', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });

      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('file change invalidation', () => {
    it('should clear selection cache after notifyFileChanged', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();

      await worker.notifyFileChanged([`${basePath}/model.scad`]);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
    });

    it('should clear selection cache when a watch event fires (not just notifyFileChanged)', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();

      // @ts-expect-error - accessing private for test verification
      expect(worker.selectionCache.size).toBe(1);

      let capturedWatchCallback: ((event: { type: string; path: string }) => void) | undefined;
      const mockWatch = vi
        .fn()
        .mockImplementation((_request: unknown, callback: (event: { type: string; path: string }) => void) => {
          capturedWatchCallback = callback;
          return () => {
            capturedWatchCallback = undefined;
          };
        });

      // @ts-expect-error - accessing private for test verification
      worker.fileSystem = { watch: mockWatch, dispose: vi.fn(), listen: vi.fn() };

      worker.updateWatchSet([`${basePath}/model.scad`]);
      expect(capturedWatchCallback).toBeDefined();

      capturedWatchCallback!({ type: 'change', path: `${basePath}/model.scad` });

      // @ts-expect-error - accessing private for test verification
      expect(worker.selectionCache.size).toBe(0);
    });
  });

  describe('no kernel matches', () => {
    it('should return empty geometry when no kernel matches an unrecognized extension', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('data.xyz'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });
});

// ===================================================================
// Lazy capabilities manifest via loadKernelModule
// ===================================================================

describe('lazy capabilities manifest', () => {
  const basePath = '/projects/test';

  beforeEach(async () => {
    await seedTestFileSystem({
      [`${basePath}/model.scad`]: 'cube([1,1,1]);',
    });
  });

  it('should rebuild capabilities manifest after loading a kernel module', async () => {
    const definition = createMockKernelDefinition('openscad', {
      exportSchemas: {
        stl: z.object({ binary: z.boolean().default(true) }),
      },
    });

    const worker = await createMultiKernelWorker([{ id: 'openscad', extensions: ['scad'], definition }]);

    // Trigger lazy kernel load by rendering a file
    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    expect(manifest.routes.filter((r) => !r.transcoderId).length).toBeGreaterThan(0);
  });

  it('should include kernel export schemas in manifest after lazy load', async () => {
    const stlSchema = z.object({ binary: z.boolean().default(true) });
    const definition = createMockKernelDefinition('openscad', {
      exportSchemas: { stl: stlSchema },
    });

    const worker = await createMultiKernelWorker([{ id: 'openscad', extensions: ['scad'], definition }]);

    // Trigger lazy kernel load
    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    const stlExport = manifest.routes.find(
      (route) => route.kernelId === 'openscad' && route.targetFormat === 'stl' && !route.transcoderId,
    );
    expect(stlExport).toBeDefined();
    expect(stlExport!.schema).toHaveProperty('properties');
    expect((stlExport!.schema as { properties: Record<string, unknown> }).properties).toHaveProperty('binary');
    expect(stlExport!.defaults).toEqual({ binary: true });
  });

  it('should include render option schema in manifest after lazy load', async () => {
    const renderSchema = z.object({
      quality: z.enum(['low', 'high']).default('high'),
    });
    const definition = createMockKernelDefinition('openscad', {
      renderSchema,
    });

    const worker = await createMultiKernelWorker([{ id: 'openscad', extensions: ['scad'], definition }]);

    // Trigger lazy kernel load
    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    const renderOption = manifest.renderSchemas['openscad'];
    expect(renderOption).toBeDefined();
    expect(renderOption!.schema).toHaveProperty('properties');
    expect(renderOption!.defaults).toEqual({ quality: 'high' });
  });

  it('should push capabilitiesUpdated when kernel module loads', async () => {
    const definition = createMockKernelDefinition('openscad', {
      exportSchemas: {
        stl: z.object({ binary: z.boolean().default(true) }),
      },
    });

    const runtime = defineRuntime({
      kernels: [attachRuntimePluginDefinition({ id: 'openscad', extensions: ['scad'] }, () => definition)],
    });
    const worker = new KernelRuntimeWorker({ runtime });
    const callback = vi.fn();
    worker.onCapabilitiesUpdated = callback;

    await initializeWorkerForTesting(worker);

    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    expect(callback).toHaveBeenCalled();
    const lastCall = callback.mock.calls.at(-1)![0]! as CapabilitiesManifest;
    expect(lastCall.routes.some((route) => route.kernelId === 'openscad' && !route.transcoderId)).toBe(true);
  });

  it('should expose renderSchemas indexed by kernelId after lazy load', async () => {
    const renderSchema = z.object({
      quality: z.enum(['low', 'high']).default('high'),
    });
    const definition = createMockKernelDefinition('openscad', {
      renderSchema,
    });

    const worker = await createMultiKernelWorker([{ id: 'openscad', extensions: ['scad'], definition }]);

    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining/expect.anything matchers return any */
    expect(manifest.renderSchemas['openscad']).toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({
          properties: expect.objectContaining({ quality: expect.anything() }),
        }),
        defaults: { quality: 'high' },
      }),
    );
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */
  });
});

// ===================================================================
// Native-handle snapshot restoration
// ===================================================================

describe('native-handle snapshot restoration', () => {
  const basePath = '/projects/test';

  beforeEach(async () => {
    await seedTestFileSystem({
      [`${basePath}/model.mock`]: 'mock geometry',
    });
  });

  it('should restore a durable native handle through paired kernel hooks', async () => {
    const createGeometry = vi.fn().mockResolvedValue({
      geometry: [{ format: 'gltf', content: new Uint8Array([1, 2, 3]) }],
      nativeHandle: { kind: 'live-handle' },
      issues: [] as KernelIssue[],
    });
    const deserializeNativeHandle = vi.fn().mockReturnValue({ kind: 'restored-handle' });
    const exportGeometry = vi.fn().mockResolvedValue({
      success: true,
      data: [{ name: 'model.gltf', bytes: new Uint8Array([9]), mimeType: 'model/gltf+json' }],
      issues: [] as KernelIssue[],
    });
    const definition = createMockKernelDefinition('snapshot-kernel', {
      exportSchemas: { gltf: z.object({}) },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ snapshot: nativeHandle }),
      deserializeNativeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'snapshot-kernel', extensions: ['mock'], definition }]);

    const renderResult = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
    expect(renderResult.success).toBe(true);

    const internals = worker as unknown as { nativeHandle: unknown };
    internals.nativeHandle = undefined;

    const exportResult = await worker.exportGeometry('gltf');

    expect(exportResult.success).toBe(true);
    expect(createGeometry).toHaveBeenCalledOnce();
    expect(deserializeNativeHandle).toHaveBeenCalledWith(
      { serializedNativeHandle: { snapshot: { kind: 'live-handle' } } },
      expect.any(Object),
      { id: 'snapshot-kernel' },
    );
    expect(exportGeometry).toHaveBeenCalledWith(
      expect.objectContaining({ nativeHandle: { kind: 'restored-handle' } }),
      expect.any(Object),
      { id: 'snapshot-kernel' },
    );
  });

  it('should reheat when a durable native-handle snapshot cannot be restored', async () => {
    const createGeometry = vi
      .fn()
      .mockResolvedValueOnce({
        geometry: [{ format: 'gltf', content: new Uint8Array([1, 2, 3]) }],
        nativeHandle: { kind: 'initial-live-handle' },
        issues: [] as KernelIssue[],
      })
      .mockResolvedValueOnce({
        geometry: [{ format: 'gltf', content: new Uint8Array([4, 5, 6]) }],
        nativeHandle: { kind: 'reheated-live-handle' },
        issues: [] as KernelIssue[],
      });
    const deserializeNativeHandle = vi.fn(() => {
      throw new Error('Snapshot payload is corrupt');
    });
    const exportGeometry = vi.fn().mockResolvedValue({
      success: true,
      data: [{ name: 'model.gltf', bytes: new Uint8Array([9]), mimeType: 'model/gltf+json' }],
      issues: [] as KernelIssue[],
    });
    const definition = createMockKernelDefinition('snapshot-kernel', {
      exportSchemas: { gltf: z.object({}) },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ snapshot: nativeHandle }),
      deserializeNativeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'snapshot-kernel', extensions: ['mock'], definition }]);

    const renderResult = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
    expect(renderResult.success).toBe(true);

    const internals = worker as unknown as { nativeHandle: unknown };
    internals.nativeHandle = undefined;

    const exportResult = await worker.exportGeometry('gltf');

    expect(exportResult.success).toBe(true);
    expect(deserializeNativeHandle).toHaveBeenCalledOnce();
    expect(createGeometry).toHaveBeenCalledTimes(2);
    expect(exportGeometry).toHaveBeenCalledWith(
      expect.objectContaining({ nativeHandle: { kind: 'reheated-live-handle' } }),
      expect.any(Object),
      { id: 'snapshot-kernel' },
    );
  });

  it('should reheat a stale live-only handle before a direct export after a transcoded export', async () => {
    let canExportFromMemory = false;
    let createCount = 0;
    const noProgramIssue: KernelIssue = {
      message: 'No program has been executed yet. Call executeKcl first.',
      code: 'RUNTIME',
      severity: 'error',
    };

    const createGeometry = vi.fn(async () => {
      createCount += 1;
      canExportFromMemory = true;
      return {
        geometry: [{ format: 'gltf', content: new Uint8Array([createCount]) }],
        nativeHandle: {
          kind: 'live-engine-session',
          generation: createCount,
          hasGeometry: true,
        },
        issues: [] as KernelIssue[],
      };
    });

    const exportGeometry = vi.fn(async (input) => {
      if (!canExportFromMemory) {
        return { success: false, issues: [noProgramIssue] };
      }

      switch (input.format) {
        case 'glb': {
          canExportFromMemory = false;
          return {
            success: true,
            data: [{ name: 'source.glb', bytes: new Uint8Array([1, 2, 3]), mimeType: 'model/gltf-binary' }],
            issues: [] as KernelIssue[],
          };
        }

        case 'step': {
          return {
            success: true,
            data: [{ name: 'model.step', bytes: new Uint8Array([4, 5, 6]), mimeType: 'model/step' }],
            issues: [] as KernelIssue[],
          };
        }

        default: {
          return {
            success: false,
            issues: [
              {
                message: `Unsupported format: ${input.format}`,
                code: 'KERNEL_CAPABILITY_MISSING',
                severity: 'error',
              },
            ],
          };
        }
      }
    });

    const definition = createMockKernelDefinition('volatile-kernel', {
      exportSchemas: {
        glb: z.object({}),
        step: z.object({}),
      },
      createGeometry,
      exportGeometry,
      isNativeHandleValid: ({ nativeHandle }) => {
        if (typeof nativeHandle === 'object' && nativeHandle !== null && 'hasGeometry' in nativeHandle) {
          return !nativeHandle.hasGeometry || canExportFromMemory;
        }

        return canExportFromMemory;
      },
    });

    const transcode = vi.fn().mockResolvedValue({
      success: true,
      data: [{ name: 'model.usdz', bytes: new Uint8Array([9, 8, 7]), mimeType: 'model/vnd.usdz+zip' }],
      issues: [] as KernelIssue[],
    });
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Mock Converter',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'usdz', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({ id: 'mock-converter' }),
      transcode,
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    const transcoderPlugin = attachRuntimePluginDefinition({ id: 'mock-converter' }, () => transcoderDefinition);

    const worker = await createMultiKernelWorker(
      [{ id: 'volatile-kernel', extensions: ['mock'], definition }],
      [transcoderPlugin],
    );

    const renderResult = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
    expect(renderResult.success).toBe(true);

    const internals = worker as unknown as { nativeHandle: unknown };
    internals.nativeHandle = undefined;
    canExportFromMemory = false;

    const usdzResult = await worker.exportGeometry('usdz');

    expect(usdzResult.success).toBe(true);
    expect(createGeometry).toHaveBeenCalledTimes(2);
    expect(transcode).toHaveBeenCalledOnce();

    const stepResult = await worker.exportGeometry('step');

    expect(stepResult.success).toBe(true);
    expect(createGeometry).toHaveBeenCalledTimes(3);
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining matchers return any */
    expect(exportGeometry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        format: 'step',
        nativeHandle: expect.objectContaining({ generation: 3 }),
      }),
      expect.any(Object),
      { id: 'volatile-kernel' },
    );
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */
  });
});

// ===================================================================
// Worker crash trap
// ===================================================================

describe('installWorkerCrashTrap', () => {
  let teardown: (() => void) | undefined;

  afterEach(() => {
    teardown?.();
    teardown = undefined;
  });

  async function buildBootstrapFixture(): Promise<{
    server: ReturnType<typeof createWorkerDispatcher>;
    client: ReturnType<typeof createChannelClient<RuntimeProtocol>>;
    channel: MessageChannel;
    closeReasons: Array<string | undefined>;
  }> {
    const channel = new MessageChannel();
    const serverPort = wrapMessagePort<unknown>(channel.port1, { label: 'server' });
    const clientPort = wrapMessagePort<unknown>(channel.port2, { label: 'client' });
    serverPort.start?.();
    clientPort.start?.();

    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({}) });
    const server = createWorkerDispatcher(worker, serverPort);
    const client = createChannelClient<RuntimeProtocol>({
      port: clientPort,
      sessionKey: runtimeChannelSessionKey,
    });
    await client.ready;

    const closeReasons: Array<string | undefined> = [];
    client.onClose((info) => {
      closeReasons.push(info.reason);
    });

    return { server, client, channel, closeReasons };
  }

  /**
   * Capture the listener added by {@link installWorkerCrashTrap} and
   * invoke it directly. Vitest registers its own `uncaughtException` /
   * `unhandledRejection` handlers that fail the test on real emit, so
   * we can't drive the trap via `process.emit`. Spying on `process.on`
   * for the duration of the install lets us pull out exactly the new
   * listener and exercise it without touching vitest's surface.
   */
  function captureAndInstall(server: ReturnType<typeof createWorkerDispatcher>): {
    readonly dispose: () => void;
    readonly fireUncaught: (error: Error) => void;
    readonly fireUnhandled: (reason: unknown) => void;
  } {
    const captured = new Map<string, (...args: unknown[]) => void>();
    const onSpy = vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      captured.set(String(event), listener as (...args: unknown[]) => void);
      return process;
    });

    const dispose = installWorkerCrashTrap(server);
    onSpy.mockRestore();

    return {
      dispose,
      fireUncaught: (error) => captured.get('uncaughtException')?.(error),
      fireUnhandled: (reason) => captured.get('unhandledRejection')?.(reason),
    };
  }

  it('closes the channel with `lb` when an `uncaughtException` fires', async () => {
    const fixture = await buildBootstrapFixture();
    const disposeSpy = vi.spyOn(fixture.server, 'dispose');
    const trap = captureAndInstall(fixture.server);
    teardown = (): void => {
      trap.dispose();
      fixture.server.dispose('test-cleanup');
      fixture.client.close('test-cleanup');
      fixture.channel.port1.close();
      fixture.channel.port2.close();
    };

    trap.fireUncaught(new Error('synthetic worker crash'));

    expect(disposeSpy).toHaveBeenCalledWith(expect.stringContaining('synthetic worker crash'));
    /* The trap calls `handle.dispose` synchronously which initiates the
     * channel's local close — `lb` is queued onto the wire immediately.
     * Wait for the client to observe the close handshake. */
    await fixture.client.closed;
    expect(fixture.closeReasons).toEqual([expect.stringContaining('synthetic worker crash')]);
  });

  it('closes the channel with `lb` when an `unhandledRejection` fires', async () => {
    const fixture = await buildBootstrapFixture();
    const disposeSpy = vi.spyOn(fixture.server, 'dispose');
    const trap = captureAndInstall(fixture.server);
    teardown = (): void => {
      trap.dispose();
      fixture.server.dispose('test-cleanup');
      fixture.client.close('test-cleanup');
      fixture.channel.port1.close();
      fixture.channel.port2.close();
    };

    trap.fireUnhandled(new Error('async worker boom'));

    expect(disposeSpy).toHaveBeenCalledWith(expect.stringContaining('async worker boom'));
    await fixture.client.closed;
    expect(fixture.closeReasons).toEqual([expect.stringContaining('async worker boom')]);
  });

  it('removes process listeners after teardown', async () => {
    const fixture = await buildBootstrapFixture();
    const beforeCount = process.listenerCount('uncaughtException');
    const dispose = installWorkerCrashTrap(fixture.server);
    expect(process.listenerCount('uncaughtException')).toBe(beforeCount + 1);

    dispose();
    expect(process.listenerCount('uncaughtException')).toBe(beforeCount);

    teardown = (): void => {
      fixture.server.dispose('test-cleanup');
      fixture.client.close('test-cleanup');
      fixture.channel.port1.close();
      fixture.channel.port2.close();
    };
  });
});
