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
import type {
  CreateGeometryInput,
  DeserializeNativeHandleInput,
  ExportGeometryInput,
  GetDependenciesInput,
  KernelDefinition,
  KernelRuntime,
} from '#types/runtime-kernel.types.js';
import type { TranscodeInput, TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import type { CapabilitiesManifest, ExportGeometryResult, KernelIssue } from '#types/runtime.types.js';
import { seedTestFileSystem, initializeWorkerForTesting, createGeometryFile } from '#testing/kernel-testing.utils.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { replicadDetectPattern } from '#kernels/replicad/replicad.constants.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { exportMemoryCache, geometryCache, geometryMemoryCache } from '#middleware/geometry-cache.middleware.js';

// ===================================================================
// Helpers
// ===================================================================

type TestTranscoderPlugin = TranscoderPlugin & RuntimePluginDefinitionCarrier<TranscoderDefinition>;

function createMockKernelDefinition(id: string, overrides?: Partial<KernelDefinition>): KernelDefinition {
  const initSpy = vi.fn().mockResolvedValue({ id });
  const definition = {
    name: id,
    version: '1.0.0',
    initialize: initSpy,
    getDependencies: async (input: GetDependenciesInput) => ({ resolved: [input.filePath], unresolved: [] }),
    getParameters: async () => ({
      success: true,
      data: { defaultParameters: {}, jsonSchema: {} },
      issues: [] as KernelIssue[],
    }),
    createGeometry: async () => ({
      geometry: gltfGeometryBytes(new Uint8Array([1, 2, 3])),
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
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- test helper merges partial union branches.
  return definition as KernelDefinition;
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
  middleware: MiddlewarePlugin[] = [],
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
    middleware,
    transcoders,
  });
  const worker = new KernelRuntimeWorker({ runtime });
  await initializeWorkerForTesting(worker);
  return worker;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesFor(value: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(value);
}

function textFrom(bytes: Uint8Array<ArrayBuffer>): string {
  return textDecoder.decode(bytes);
}

function gltfGeometry(content: string): { format: 'gltf'; content: Uint8Array<ArrayBuffer> } {
  return { format: 'gltf', content: bytesFor(content) };
}

function gltfGeometryBytes(content: Uint8Array<ArrayBuffer>): { format: 'gltf'; content: Uint8Array<ArrayBuffer> } {
  return { format: 'gltf', content };
}

function exportFile(name: string, bytes: Uint8Array<ArrayBuffer>, mimeType: ExportFile['mimeType']): ExportFile {
  return { name, bytes, mimeType };
}

function handleLabel(nativeHandle: unknown): string {
  if (
    typeof nativeHandle === 'object' &&
    nativeHandle !== null &&
    'label' in nativeHandle &&
    typeof nativeHandle.label === 'string'
  ) {
    return nativeHandle.label;
  }
  throw new Error(`Unexpected native handle: ${String(nativeHandle)}`);
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
    it('should fail when no kernel matches an unrecognized extension', async () => {
      const scadDefinition = createMockKernelDefinition('openscad');

      const worker = await createMultiKernelWorker([
        { id: 'openscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('data.xyz'),
        parameters: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KERNEL_CAPABILITY_MISSING' }));
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
      geometry: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
      nativeHandle: { kind: 'live-handle' },
      issues: [] as KernelIssue[],
    });
    const deserializeNativeHandle = vi.fn().mockReturnValue({ kind: 'restored-handle' });
    const exportGeometry = vi.fn().mockResolvedValue({
      success: true,
      data: [exportFile('model.gltf', new Uint8Array([9]), 'model/gltf+json')],
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
        geometry: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
        nativeHandle: { kind: 'initial-live-handle' },
        issues: [] as KernelIssue[],
      })
      .mockResolvedValueOnce({
        geometry: { format: 'gltf', content: new Uint8Array([4, 5, 6]) },
        nativeHandle: { kind: 'reheated-live-handle' },
        issues: [] as KernelIssue[],
      });
    const deserializeNativeHandle = vi.fn(() => {
      throw new Error('Snapshot payload is corrupt');
    });
    const exportGeometry = vi.fn().mockResolvedValue({
      success: true,
      data: [exportFile('model.gltf', new Uint8Array([9]), 'model/gltf+json')],
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
        geometry: gltfGeometryBytes(new Uint8Array([createCount])),
        nativeHandle: {
          kind: 'live-engine-session',
          generation: createCount,
          hasGeometry: true,
        },
        issues: [] as KernelIssue[],
      };
    });

    const exportGeometry = vi.fn(async (input: ExportGeometryInput): Promise<ExportGeometryResult> => {
      if (!canExportFromMemory) {
        return { success: false, issues: [noProgramIssue] };
      }

      switch (input.format) {
        case 'glb': {
          canExportFromMemory = false;
          return {
            success: true,
            data: [exportFile('source.glb', new Uint8Array([1, 2, 3]), 'model/gltf-binary')],
            issues: [] as KernelIssue[],
          };
        }

        case 'step': {
          return {
            success: true,
            data: [exportFile('model.step', new Uint8Array([4, 5, 6]), 'application/step')],
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
          return !nativeHandle['hasGeometry'] || canExportFromMemory;
        }

        return canExportFromMemory;
      },
    });

    const transcode = vi.fn().mockResolvedValue({
      success: true,
      data: [exportFile('model.usdz', new Uint8Array([9, 8, 7]), 'model/vnd.usdz+zip')],
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
// Cache identity regressions
// ===================================================================

describe('cache identity regressions', () => {
  const basePath = '/projects/test';

  beforeEach(async () => {
    geometryMemoryCache.clear();
    exportMemoryCache.clear();
    await seedTestFileSystem({
      [`${basePath}/model.mock`]: 'mock geometry',
      [`${basePath}/a.mock`]: 'alpha',
      [`${basePath}/b.mock`]: 'bravo',
      [`${basePath}/b.other`]: 'other',
    });
  });

  afterEach(() => {
    geometryMemoryCache.clear();
    exportMemoryCache.clear();
  });

  it('should restore the cached native-handle snapshot for the settled render identity before export', async () => {
    const createGeometry = vi.fn(async (input) => {
      const label = `bank:${String(input.parameters['bankAngle'])}`;
      return {
        geometry: gltfGeometry(label),
        nativeHandle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const exportGeometry = vi.fn(async (input: ExportGeometryInput) => {
      const label = handleLabel(input.nativeHandle);
      return {
        success: true,
        data: [exportFile('model.usdz', bytesFor(label), 'model/vnd.usdz+zip')],
        issues: [] as KernelIssue[],
      };
    });
    const definition = createMockKernelDefinition('snapshot-kernel', {
      exportSchemas: { usdz: z.object({}) },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
      deserializeNativeHandle: ({ serializedNativeHandle }) => {
        if (
          typeof serializedNativeHandle === 'object' &&
          serializedNativeHandle !== null &&
          'label' in serializedNativeHandle &&
          typeof serializedNativeHandle.label === 'string'
        ) {
          return { label: serializedNativeHandle.label };
        }
        throw new Error('Unexpected serialized native handle');
      },
    });
    const worker = await createMultiKernelWorker(
      [{ id: 'snapshot-kernel', extensions: ['mock'], definition }],
      [],
      [geometryCache()],
    );

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { bankAngle: 90 } });
    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { bankAngle: 60 } });
    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { bankAngle: 90 } });

    const exportResult = await worker.exportGeometry('usdz');

    expect(exportResult.success).toBe(true);
    if (!exportResult.success) {
      return;
    }
    expect(textFrom(exportResult.data[0]!.bytes)).toBe('bank:90');
  });

  it('should invalidate staged exportModel file hashes before computing export cache keys', async () => {
    const createGeometry = vi.fn(async (input: CreateGeometryInput, runtime: KernelRuntime) => {
      const source = await runtime.filesystem.readFile(input.filePath, 'utf8');
      return {
        geometry: gltfGeometry(source),
        nativeHandle: { label: source },
        issues: [] as KernelIssue[],
      };
    });
    const exportGeometry = vi.fn(async (input: ExportGeometryInput) => {
      const label = handleLabel(input.nativeHandle);
      return {
        success: true,
        data: [exportFile('model.gltf', bytesFor(label), 'model/gltf+json')],
        issues: [] as KernelIssue[],
      };
    });
    const definition = createMockKernelDefinition('stage-kernel', {
      exportSchemas: { gltf: z.object({}) },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
      deserializeNativeHandle: ({ serializedNativeHandle }) => {
        if (
          typeof serializedNativeHandle === 'object' &&
          serializedNativeHandle !== null &&
          'label' in serializedNativeHandle &&
          typeof serializedNativeHandle.label === 'string'
        ) {
          return { label: serializedNativeHandle.label };
        }
        throw new Error('Unexpected serialized native handle');
      },
    });
    const worker = await createMultiKernelWorker(
      [{ id: 'stage-kernel', extensions: ['mock'], definition }],
      [],
      [geometryCache()],
    );

    await worker.exportModel({
      stage: { [`${basePath}/model.mock`]: bytesFor('stage-a') },
      file: createGeometryFile('model.mock'),
      parameters: {},
      format: 'gltf',
    });

    const second = await worker.exportModel({
      stage: { [`${basePath}/model.mock`]: bytesFor('stage-b') },
      file: createGeometryFile('model.mock'),
      parameters: {},
      format: 'gltf',
    });

    expect(second.success).toBe(true);
    if (!second.success) {
      return;
    }
    expect(textFrom(second.data[0]!.bytes)).toBe('stage-b');
  });

  it('should recompute base dependencies for consecutive direct createGeometry calls with different files', async () => {
    const definition = createMockKernelDefinition('dependency-kernel', {
      createGeometry: async (input: CreateGeometryInput, runtime: KernelRuntime) => {
        const source = await runtime.filesystem.readFile(input.filePath, 'utf8');
        return {
          geometry: gltfGeometry(source),
          nativeHandle: { label: source },
          issues: [] as KernelIssue[],
        };
      },
    });
    const worker = await createMultiKernelWorker([{ id: 'dependency-kernel', extensions: ['mock'], definition }]);

    const first = await worker.createGeometry({ file: createGeometryFile('a.mock'), parameters: {} });
    const second = await worker.createGeometry({ file: createGeometryFile('b.mock'), parameters: {} });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      return;
    }
    expect(first.data.hash).not.toBe(second.data.hash);
  });

  it('should keep request-scoped exportModel renders out of subsequent current-state exports', async () => {
    const createGeometry = vi.fn(async (input) => {
      const label = String(input.parameters['label']);
      return {
        geometry: gltfGeometry(label),
        nativeHandle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const exportGeometry = vi.fn(async (input: ExportGeometryInput) => {
      const label = handleLabel(input.nativeHandle);
      return {
        success: true,
        data: [exportFile('model.gltf', bytesFor(label), 'model/gltf+json')],
        issues: [] as KernelIssue[],
      };
    });
    const definition = createMockKernelDefinition('request-scope-kernel', {
      exportSchemas: { gltf: z.object({}) },
      createGeometry,
      exportGeometry,
    });
    const worker = await createMultiKernelWorker([{ id: 'request-scope-kernel', extensions: ['mock'], definition }]);

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'preview' } });

    const requestScoped = await worker.exportModel({
      file: createGeometryFile('model.mock'),
      parameters: { label: 'request-scoped' },
      format: 'gltf',
    });
    expect(requestScoped.success).toBe(true);

    const currentStateExport = await worker.exportGeometry('gltf');

    expect(currentStateExport.success).toBe(true);
    if (!currentStateExport.success) {
      return;
    }
    expect(textFrom(currentStateExport.data[0]!.bytes)).toBe('preview');
  });

  it('should export a cached published render with its selected kernel after global active kernel drift', async () => {
    const createGeometry = vi.fn(async (input) => {
      const label = `source:${String(input.parameters['label'])}`;
      return {
        geometry: gltfGeometry(label),
        nativeHandle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const deserializeNativeHandle = vi.fn(
      ({ serializedNativeHandle }: DeserializeNativeHandleInput<{ label: string }>) => ({
        label: serializedNativeHandle.label,
      }),
    );
    const exportGeometry = vi.fn(async (input: ExportGeometryInput) => {
      const label = handleLabel(input.nativeHandle);
      return {
        success: true,
        data: [exportFile('source.glb', bytesFor(label), 'model/gltf-binary')],
        issues: [] as KernelIssue[],
      };
    });
    const sourceDefinition = createMockKernelDefinition('source-kernel', {
      exportSchemas: { glb: z.object({}) },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
      deserializeNativeHandle,
    });
    const otherDefinition = createMockKernelDefinition('other-kernel', {
      exportSchemas: { glb: z.object({}) },
      createGeometry: async () => ({
        geometry: gltfGeometry('other-preview'),
        nativeHandle: undefined,
        issues: [] as KernelIssue[],
      }),
      exportGeometry: async () => ({
        success: true,
        data: [exportFile('other.glb', bytesFor('other-export'), 'model/gltf-binary')],
        issues: [] as KernelIssue[],
      }),
    });
    const transcode = vi.fn(async (input: TranscodeInput) => ({
      success: true,
      data: [exportFile('model.3mf', bytesFor(`3mf:${textFrom(input.files[0]!.bytes)}`), 'model/3mf')],
      issues: [] as KernelIssue[],
    }));
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Mock Converter',
      version: '1.0.0',
      edges: [{ from: 'glb', to: '3mf', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({ id: 'mock-converter' }),
      transcode,
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    const transcoderPlugin = attachRuntimePluginDefinition({ id: 'mock-converter' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [
        { id: 'source-kernel', extensions: ['mock'], definition: sourceDefinition },
        { id: 'other-kernel', extensions: ['other'], definition: otherDefinition },
      ],
      [transcoderPlugin],
      [geometryCache()],
    );

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'cached' } });

    const internals = worker as unknown as {
      currentPublishedRender: unknown;
      nativeHandle: unknown;
      nativeHandleSlot: unknown;
      pendingNativeHandle: unknown;
      serializedNativeHandleSlot: unknown;
    };
    internals.nativeHandle = undefined;
    internals.nativeHandleSlot = undefined;
    internals.pendingNativeHandle = undefined;
    internals.serializedNativeHandleSlot = undefined;

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'cached' } });
    expect(createGeometry).toHaveBeenCalledOnce();
    const cachedSourceRender = internals.currentPublishedRender;

    await worker.notifyFileChanged([`${basePath}/unrelated.txt`]);
    await worker.createGeometry({ file: createGeometryFile('b.other'), parameters: {} });

    internals.currentPublishedRender = cachedSourceRender;
    internals.nativeHandle = undefined;
    internals.nativeHandleSlot = undefined;
    internals.pendingNativeHandle = undefined;
    internals.serializedNativeHandleSlot = undefined;

    const exportResult = await worker.exportGeometry('3mf');

    if (!exportResult.success) {
      throw new Error(
        `Expected cached source render export to succeed, got: ${exportResult.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }
    expect(deserializeNativeHandle).toHaveBeenCalledOnce();
    expect(exportGeometry).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'glb', nativeHandle: { label: 'source:cached' } }),
      expect.any(Object),
      { id: 'source-kernel' },
    );
    expect(textFrom(exportResult.data[0]!.bytes)).toBe('3mf:source:cached');
  });

  it('should export the cached published render after unrelated invalidation clears active kernel state', async () => {
    const createGeometry = vi.fn(async (input) => {
      const label = `source:${String(input.parameters['label'])}`;
      return {
        geometry: gltfGeometry(label),
        nativeHandle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const deserializeNativeHandle = vi.fn(
      ({ serializedNativeHandle }: DeserializeNativeHandleInput<{ label: string }>) => ({
        label: serializedNativeHandle.label,
      }),
    );
    const exportGeometry = vi.fn(async (input: ExportGeometryInput) => ({
      success: true,
      data: [exportFile('source.glb', bytesFor(handleLabel(input.nativeHandle)), 'model/gltf-binary')],
      issues: [] as KernelIssue[],
    }));
    const sourceDefinition = createMockKernelDefinition('source-kernel', {
      exportSchemas: { glb: z.object({}) },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
      deserializeNativeHandle,
    });
    const transcode = vi.fn(async (input: TranscodeInput) => ({
      success: true,
      data: [exportFile('model.3mf', bytesFor(`3mf:${textFrom(input.files[0]!.bytes)}`), 'model/3mf')],
      issues: [] as KernelIssue[],
    }));
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Mock Converter',
      version: '1.0.0',
      edges: [{ from: 'glb', to: '3mf', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({ id: 'mock-converter' }),
      transcode,
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    const transcoderPlugin = attachRuntimePluginDefinition({ id: 'mock-converter' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [{ id: 'source-kernel', extensions: ['mock'], definition: sourceDefinition }],
      [transcoderPlugin],
      [geometryCache()],
    );

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'cached' } });

    const internals = worker as unknown as {
      nativeHandle: unknown;
      nativeHandleSlot: unknown;
      pendingNativeHandle: unknown;
    };
    internals.nativeHandle = undefined;
    internals.nativeHandleSlot = undefined;
    internals.pendingNativeHandle = undefined;

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'cached' } });
    expect(createGeometry).toHaveBeenCalledOnce();

    await worker.notifyFileChanged([`${basePath}/unrelated.txt`]);

    const exportResult = await worker.exportGeometry('3mf');

    if (!exportResult.success) {
      throw new Error(
        `Expected cached render export after unrelated invalidation to succeed, got: ${exportResult.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }
    expect(deserializeNativeHandle).toHaveBeenCalledOnce();
    expect(exportGeometry).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'glb', nativeHandle: { label: 'source:cached' } }),
      expect.any(Object),
      { id: 'source-kernel' },
    );
    expect(textFrom(exportResult.data[0]!.bytes)).toBe('3mf:source:cached');
  });

  it('should select the request file kernel for exportModel after a different kernel was active', async () => {
    const sourceDefinition = createMockKernelDefinition('source-kernel', {
      exportSchemas: { glb: z.object({}) },
      createGeometry: async (input) => {
        const label = `source:${String(input.parameters['label'])}`;
        return {
          geometry: gltfGeometry(label),
          nativeHandle: { label },
          issues: [] as KernelIssue[],
        };
      },
      exportGeometry: async (input: ExportGeometryInput) => ({
        success: true,
        data: [exportFile('source.glb', bytesFor(handleLabel(input.nativeHandle)), 'model/gltf-binary')],
        issues: [] as KernelIssue[],
      }),
    });
    const otherCreateGeometry = vi.fn(async (input) => {
      const label = `other:${String(input.parameters['label'])}`;
      return {
        geometry: gltfGeometry(label),
        nativeHandle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const otherExportGeometry = vi.fn(async (input: ExportGeometryInput) => ({
      success: true,
      data: [exportFile('other.glb', bytesFor(handleLabel(input.nativeHandle)), 'model/gltf-binary')],
      issues: [] as KernelIssue[],
    }));
    const otherDefinition = createMockKernelDefinition('other-kernel', {
      exportSchemas: { glb: z.object({}) },
      createGeometry: otherCreateGeometry,
      exportGeometry: otherExportGeometry,
    });
    const worker = await createMultiKernelWorker([
      { id: 'source-kernel', extensions: ['mock'], definition: sourceDefinition },
      { id: 'other-kernel', extensions: ['other'], definition: otherDefinition },
    ]);

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'preview' } });

    const exportResult = await worker.exportModel({
      file: createGeometryFile('b.other'),
      parameters: { label: 'request' },
      format: 'glb',
    });

    if (!exportResult.success) {
      throw new Error(
        `Expected request-scoped export to use b.other's kernel, got: ${exportResult.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }
    const exportedText = textFrom(exportResult.data[0]!.bytes);
    if (exportedText !== 'other:request') {
      throw new Error(`Expected request-scoped exportModel to emit other:request, got: ${exportedText}`);
    }
    expect(otherCreateGeometry).toHaveBeenCalledOnce();
    expect(otherExportGeometry).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'glb', nativeHandle: { label: 'other:request' } }),
      expect.any(Object),
      { id: 'other-kernel' },
    );
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
