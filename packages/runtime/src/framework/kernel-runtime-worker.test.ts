import process from 'node:process';
import { MessageChannel } from 'node:worker_threads';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import type { ExportFile } from '@taucad/types';
import type { WatchEvent } from '@taucad/filesystem';
import { createChannelClient, wrapMessagePort } from '@taucad/rpc';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { installWorkerCrashTrap } from '#transport/_internal/worker-crash-trap.js';
import { createDocumentWorkerDispatcher } from '#transport/_internal/runtime-document-dispatcher.js';
import { runtimeChannelSessionKey } from '#transport/_internal/runtime-channel-bindings.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import type { RuntimeTranscodeArgs, TelemetryEntry } from '#types/runtime-wire.types.js';
import type { KernelRuntime } from '#types/runtime-kernel.types.js';
import type { TranscodeInput, TranscodeResult, TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import type { CapabilitiesManifest, KernelIssue } from '#types/runtime.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  seedTestFileSystem,
  initializeWorkerForTesting,
  createGeometryFile,
  getTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */
import { attachRuntimePluginDefinition, resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import type { WrapEvaluateHook, WrapRenderHook } from '#types/runtime-middleware-v2.types.js';
import { nativeBuildInputSymbol } from '#framework/render-artifact.js';
import type { MaterializedRender, NativeBuildInput } from '#framework/render-artifact.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type {
  AnyKernelDefinitionV2,
  EvaluateInput,
  KernelExportDeclarations,
  ResolveInput,
  ExportOutput,
} from '#types/runtime-kernel-v2.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';

const replicadDetectPattern = /import.*from\s+["']replicad["']/s;
const emptyParameterDeclaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:runtime-worker-parameters',
    $uses: ['JSONSchemaUnits'],
    name: 'RuntimeWorkerParameters',
    type: 'object',
  },
  defaults: {},
} as const;

// ===================================================================
// Helpers
// ===================================================================

type TestTranscoderPlugin = TranscoderPlugin & RuntimePluginDefinitionCarrier<TranscoderDefinition>;
type TestExportInput = Parameters<NonNullable<AnyKernelDefinitionV2['export']>>[0];
type TestReleaseInput = Readonly<{ handle: unknown }>;
type TestDeserializeInput = Readonly<{ serialized: unknown }>;

const kernelInitSpies = new WeakMap<AnyKernelDefinitionV2, ReturnType<typeof vi.fn>>();

/** A direct v2 kernel fixture; individual tests override the hooks they exercise. */
function createMockKernelDefinition(id: string, overrides: Partial<AnyKernelDefinitionV2> = {}): AnyKernelDefinitionV2 {
  const initSpy = vi.fn(async () => ({ id }));
  const exportDeclarations = overrides.exports as KernelExportDeclarations | undefined;
  const base: AnyKernelDefinitionV2 = {
    id,
    extensions: ['mock'],
    name: id,
    version: '1.0.0',
    views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
    exports: {},
    initialize: initSpy,
    resolve: async ({ entryPath }: ResolveInput) => ({
      resolved: [entryPath],
      unresolved: [],
    }),
    describe: async () => ({
      success: true,
      data: { parameters: emptyParameterDeclaration },
      issues: [],
    }),
    evaluate: async () => ({ handle: { bytes: new Uint8Array([1, 2, 3]) } }),
    render: async ({ handle }: { handle: unknown }) => {
      if (typeof handle === 'object' && handle !== null && 'bytes' in handle && handle.bytes instanceof Uint8Array) {
        return { content: new Uint8Array(handle.bytes) };
      }
      return { content: new Uint8Array([1, 2, 3]) };
    },
    export: async () => {
      throw new Error('This mock kernel declares no exports.');
    },
  };
  const defaultWrite =
    Object.keys(exportDeclarations ?? {}).length > 0 && !overrides.export
      ? {
          export: async ({ exportId }: { exportId: string }) => {
            const declaration = exportDeclarations?.[exportId];
            if (!declaration) {
              throw new Error(`Undeclared mock export: ${exportId}`);
            }
            return {
              files: [
                exportFile(`export.${declaration.extension}`, bytesFor('default'), declaration.mimeType),
              ] as const,
            };
          },
        }
      : {};
  const definition = Object.assign(base, overrides, defaultWrite);
  kernelInitSpies.set(definition, initSpy);
  return definition;
}

function getInitSpy(definition: AnyKernelDefinitionV2): ReturnType<typeof vi.fn> {
  const spy = kernelInitSpies.get(definition);
  if (!spy) {
    throw new Error('Expected a direct v2 mock kernel definition.');
  }
  return spy;
}

async function createMultiKernelWorker(
  modules: Array<{
    id: string;
    extensions: string[];
    definition: AnyKernelDefinitionV2;
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

function gltfGeometry(content: string): {
  format: 'gltf';
  content: Uint8Array<ArrayBuffer>;
} {
  return { format: 'gltf', content: bytesFor(content) };
}

function exportFile(name: string, bytes: Uint8Array<ArrayBuffer>, mimeType: ExportFile['mimeType']): ExportFile {
  return { name, bytes, mimeType };
}

function handleLabel(handle: unknown): string {
  if (typeof handle === 'object' && handle !== null && 'label' in handle && typeof handle.label === 'string') {
    return handle.label;
  }
  throw new Error(`Unexpected native handle: ${String(handle)}`);
}

async function evaluateDocumentRequest(
  worker: KernelRuntimeWorker,
  input: Parameters<KernelRuntimeWorker['handleOpenDocument']>[0],
): Promise<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> {
  const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
  worker.onEvaluated = (event) => {
    evaluated.push(event);
  };
  worker.handleOpenDocument(input);
  await vi.waitFor(() => {
    expect(evaluated).toHaveLength(1);
  });
  return evaluated[0]!;
}

async function evaluateWorkerDocument(
  worker: KernelRuntimeWorker,
  documentId: string,
  file: string,
): Promise<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> {
  return evaluateDocumentRequest(worker, {
    documentId,
    intent: 1,
    file: createGeometryFile(file),
    parameters: {},
    watch: false,
  });
}

async function openWorkerDocument(worker: KernelRuntimeWorker, documentId: string, file: string): Promise<void> {
  await openWorkerDocumentWithParameters(worker, {
    documentId,
    file,
    parameters: {},
  });
}

async function openWorkerDocumentWithParameters(
  worker: KernelRuntimeWorker,
  input: {
    documentId: string;
    file: string;
    parameters: Record<string, unknown>;
  },
): Promise<void> {
  const evaluated = await evaluateDocumentRequest(worker, {
    documentId: input.documentId,
    intent: 1,
    file: createGeometryFile(input.file),
    parameters: input.parameters,
    watch: false,
  });
  expect(evaluated.success, JSON.stringify(evaluated.issues)).toBe(true);
}

async function requestWorkerView(
  worker: KernelRuntimeWorker,
  args: {
    documentId: string;
    subscriptionId: string;
    options?: Record<string, unknown>;
    content?: Record<string, boolean>;
  },
): Promise<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> {
  const rendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
  worker.onRendered = (event) => {
    rendered.push(event);
  };
  worker.handleOpenView({
    ...args,
    requestId: `${args.subscriptionId}-render`,
    view: 'display',
  });
  await vi.waitFor(() => {
    expect(rendered).toHaveLength(1);
  });
  return rendered[0]!;
}

async function renderWorkerView(
  worker: KernelRuntimeWorker,
  args: {
    documentId: string;
    subscriptionId: string;
    options?: Record<string, unknown>;
    content?: Record<string, boolean>;
  },
): Promise<void> {
  const rendered = await requestWorkerView(worker, args);
  expect(rendered.success, JSON.stringify(rendered.issues)).toBe(true);
}

function documentArtifact(worker: KernelRuntimeWorker, documentId: string): MaterializedRender {
  // @ts-expect-error -- Direct worker identity test reads the retained private document artifact.
  const artifact: MaterializedRender | undefined = worker.documents.get(documentId)?.current?.artifact;
  if (!artifact) {
    throw new Error(`Document ${documentId} has no retained artifact.`);
  }
  return artifact;
}

describe('KernelRuntimeWorker initialization', () => {
  it('should clean every initialized kernel owner once even if another owner cleanup fails', async () => {
    const firstCleanup = vi.fn(async () => {
      throw new Error('first cleanup failed');
    });
    const secondCleanup = vi.fn(async () => undefined);
    const unusedCleanup = vi.fn(async () => undefined);
    await seedTestFileSystem({ 'model.first': '', 'model.second': '' });
    const worker = await createMultiKernelWorker([
      {
        id: 'first',
        extensions: ['first'],
        definition: createMockKernelDefinition('first', {
          onDispose: firstCleanup,
        }),
      },
      {
        id: 'second',
        extensions: ['second'],
        definition: createMockKernelDefinition('second', {
          onDispose: secondCleanup,
        }),
      },
      {
        id: 'unused',
        extensions: ['unused'],
        definition: createMockKernelDefinition('unused', {
          onDispose: unusedCleanup,
        }),
      },
    ]);
    try {
      await openWorkerDocument(worker, 'first-document', 'model.first');
      await openWorkerDocument(worker, 'second-document', 'model.second');
      await worker.cleanup();
      await worker.cleanup();
      expect(firstCleanup).toHaveBeenCalledExactlyOnceWith({ id: 'first' });
      expect(secondCleanup).toHaveBeenCalledExactlyOnceWith({ id: 'second' });
      expect(unusedCleanup).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });

  it('rejects repeated initialization without clearing runtime state', async () => {
    const worker = await createMultiKernelWorker([]);
    try {
      await expect(initializeWorkerForTesting(worker)).rejects.toBeInstanceOf(RuntimeAlreadyInitializedError);
    } finally {
      await worker.cleanup();
    }
  });

  it('surfaces plugin permissions and kernel builtin dependencies in capability registrations', async () => {
    const permissions = {
      network: ['https://plugins.example.test'],
      filesystemWrite: true,
    } as const;
    const metadata = { permissions } as const;
    const kernel = defineKernel({
      id: 'metadata-kernel',
      extensions: ['meta'],
      builtinPackages: { replicad: { name: '@taulabs/replicad', version: '1.1.0-taulabs.0' } },
      ...metadata,
      name: 'Metadata kernel',
      version: '1.0.0',
      views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve(input) {
        return { resolved: [input.entryPath], unresolved: [] };
      },
      async describe() {
        return {
          success: true,
          data: { parameters: emptyParameterDeclaration },
          issues: [],
        };
      },
      async evaluate() {
        return { handle: { content: bytesFor('metadata') } };
      },
      async render({ handle }) {
        return { content: handle.content };
      },
    })();
    const middleware = defineMiddleware({
      id: 'metadata-middleware',
      ...metadata,
      name: 'Metadata middleware',
    })();
    const bundler = defineBundler({
      id: 'metadata-bundler',
      extensions: ['meta'],
      ...metadata,
      name: 'Metadata bundler',
      version: '1.0.0',
      async initialize() {
        return {};
      },
      async detectImports() {
        return { detectedModules: [], dependencies: [] };
      },
      async bundle() {
        return {
          code: '',
          issues: [],
          success: true,
          dependencies: [],
          unresolvedPaths: [],
        };
      },
      async execute() {
        return { success: true, value: undefined };
      },
      registerModule() {
        throw new Error('registerModule is not used by this metadata test.');
      },
    })();
    const transcoder = defineTranscoder({
      id: 'metadata-transcoder',
      ...metadata,
      name: 'Metadata transcoder',
      version: '1.0.0',
      edges: [] as const,
      async initialize() {
        return {};
      },
      async transcode() {
        return { success: true, data: [], issues: [] };
      },
    })();
    await seedTestFileSystem({ 'model.meta': 'metadata' });
    const runtime = defineRuntime({
      kernels: [kernel],
      middleware: [middleware],
      bundlers: [bundler],
      transcoders: [transcoder],
    });
    const worker = new KernelRuntimeWorker({ runtime });
    await initializeWorkerForTesting(worker);
    await openWorkerDocument(worker, 'metadata-document', 'model.meta');

    expect(worker.capabilitiesManifest.registrations).toEqual([
      {
        kind: 'kernel',
        id: 'metadata-kernel',
        extensions: ['meta'],
        builtinDependencies: { replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0' },
        ...metadata,
      },
      { kind: 'middleware', id: 'metadata-middleware', ...metadata },
      { kind: 'bundler', id: 'metadata-bundler', ...metadata },
      { kind: 'transcoder', id: 'metadata-transcoder', ...metadata },
    ]);

    await worker.cleanup();
  });
});

describe('KernelRuntimeWorker direct transcode', () => {
  it('transcodes caller-owned files without loading a kernel', async () => {
    const inputFile = exportFile('settled.glb', new Uint8Array([1, 2, 3]), 'model/gltf-binary');
    const transcode = vi.fn().mockResolvedValue({
      success: true,
      data: [exportFile('capture.webp', new Uint8Array([4, 5, 6]), 'image/webp')],
      issues: [],
    });
    const definition: TranscoderDefinition = {
      name: 'Image transcoder',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          optionsSchema: z.object({ width: z.number() }),
        },
      ],
      initialize: vi.fn().mockResolvedValue({}),
      transcode,
    };
    const plugin = attachRuntimePluginDefinition({ id: 'image-transcoder' }, () => definition);
    const worker = await createMultiKernelWorker([], [plugin]);
    const telemetry: Array<{
      readonly name: string;
      readonly detail?: Record<string, unknown>;
    }> = [];
    worker.setTelemetrySend((entries) => telemetry.push(...entries));

    try {
      const result = await worker.transcode({
        from: 'glb',
        to: 'webp',
        files: [inputFile],
        options: { width: 640 },
      });

      expect(result.success).toBe(true);
      expect(transcode).toHaveBeenCalledWith(
        {
          from: 'glb',
          to: 'webp',
          files: [inputFile],
          options: { width: 640 },
        },
        expect.any(Object),
        {},
      );
      worker.flushTelemetry();
      expect(telemetry.at(-1)?.name).toBe('kernel.transcode');
      expect(telemetry.at(-1)?.detail).toMatchObject({
        from: 'glb',
        to: 'webp',
        transcoder: 'image-transcoder',
        success: true,
      });
    } finally {
      await worker.cleanup();
    }
  });

  it('skips a queued transcode whose signal aborts before dequeue', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const transcode = vi.fn(async () => {
      started.resolve();
      await release.promise;
      return {
        success: true,
        data: [exportFile('capture.webp', new Uint8Array([1]), 'image/webp')],
        issues: [],
      };
    });
    const definition: TranscoderDefinition = {
      name: 'Queued transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode,
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'queued-transcoder' }, () => definition)],
    );
    const request = {
      from: 'glb',
      to: 'webp',
      files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
      options: {},
    } satisfies RuntimeTranscodeArgs;

    try {
      const first = worker.transcode(request);
      await started.promise;
      const controller = new AbortController();
      const queued = worker.transcode(request, controller.signal);
      controller.abort();
      release.resolve();

      await expect(first).resolves.toMatchObject({ success: true });
      await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
      expect(transcode).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      await worker.cleanup();
    }
  });

  it('shares one FIFO with export/render and drains accepted work before cleanup', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const cleanupProvider = vi.fn().mockResolvedValue(undefined);
    const definition: TranscoderDefinition = {
      name: 'FIFO transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn(async () => {
        started.resolve();
        await release.promise;
        return {
          success: true,
          data: [exportFile('capture.webp', new Uint8Array([1]), 'image/webp')],
          issues: [],
        };
      }),
      onDispose: cleanupProvider,
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'fifo-transcoder' }, () => definition)],
    );
    const transcode = worker.transcode({
      from: 'glb',
      to: 'webp',
      files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
      options: {},
    });
    await started.promise;
    const queued = Promise.allSettled([
      worker.exportDocument({
        documentId: 'missing-document',
        operationId: 'queued-export',
        target: 'glb',
      }),
      worker.describe({ file: createGeometryFile('model.unknown') }),
    ]);
    const cleanup = worker.cleanup();

    expect(await Promise.race([cleanup.then(() => 'settled'), Promise.resolve('pending')])).toBe('pending');
    release.resolve();

    await expect(transcode).resolves.toMatchObject({ success: true });
    await expect(queued).resolves.toHaveLength(2);
    await expect(cleanup).resolves.toBeUndefined();
    expect(cleanupProvider).toHaveBeenCalledOnce();
  });

  it('passes active cancellation to the transcoder runtime signal', async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const transcode = vi.fn(
      async (_input: TranscodeInput, runtime: Parameters<TranscoderDefinition['transcode']>[1]) =>
        new Promise<TranscodeResult>((_resolve, reject) => {
          started.resolve(runtime.signal);
          runtime.signal.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Transcode aborted.', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    const definition: TranscoderDefinition = {
      name: 'Abortable transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode,
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'abortable-transcoder' }, () => definition)],
    );
    const telemetry: Array<{
      readonly name: string;
      readonly detail?: Record<string, unknown>;
    }> = [];
    worker.setTelemetrySend((entries) => telemetry.push(...entries));
    const controller = new AbortController();

    try {
      const result = worker.transcode(
        {
          from: 'glb',
          to: 'webp',
          files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
          options: {},
        },
        controller.signal,
      );
      const runtimeSignal = await started.promise;
      controller.abort();

      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      expect(runtimeSignal.aborted).toBe(true);
      worker.flushTelemetry();
      const span = telemetry.find(({ name }) => name === 'kernel.transcode');
      expect(span?.detail?.['success']).toBe(false);
      expect(span?.detail?.['parentSpanId']).toBeUndefined();
    } finally {
      await worker.cleanup();
    }
  });

  it('stops at cancellation boundaries after initialization and transcoding hooks', async () => {
    const initialization = Promise.withResolvers<Record<string, unknown>>();
    const transcode = vi.fn<TranscoderDefinition['transcode']>().mockResolvedValue({
      success: true,
      data: [exportFile('capture.webp', new Uint8Array([1]), 'image/webp')],
      issues: [],
    });
    const definition: TranscoderDefinition = {
      name: 'Boundary transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize: vi.fn(async () => initialization.promise),
      transcode,
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'boundary-transcoder' }, () => definition)],
    );
    const request: RuntimeTranscodeArgs = {
      from: 'glb',
      to: 'webp',
      files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
      options: {},
    };

    try {
      const initializationController = new AbortController();
      const duringInitialization = worker.transcode(request, initializationController.signal);
      await vi.waitFor(() => {
        expect(definition.initialize).toHaveBeenCalledOnce();
      });
      initializationController.abort();
      initialization.resolve({});

      await expect(duringInitialization).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(transcode).not.toHaveBeenCalled();

      const hookController = new AbortController();
      transcode.mockImplementationOnce(async (input) => {
        hookController.abort();
        return { success: true, data: input.files, issues: [] };
      });

      await expect(worker.transcode(request, hookController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      await worker.cleanup();
    }
  });

  it('surfaces every option issue with a transcoder-specific code', async () => {
    const definition: TranscoderDefinition = {
      name: 'Validated transcoder',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          optionsSchema: z.object({
            width: z.number().positive(),
            height: z.number().positive(),
          }),
        },
      ],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn(),
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'validated-transcoder' }, () => definition)],
    );

    try {
      const result = await worker.transcode({
        from: 'glb',
        to: 'webp',
        files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
        options: { width: -1, height: -1 },
      });

      expect(result.success).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.issues.every(({ code }) => code === 'TRANSCODER_OPTIONS_INVALID')).toBe(true);
      expect(definition.transcode).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });

  it('classifies missing routes and provider throws as distinct transcoder failures', async () => {
    const definition: TranscoderDefinition = {
      name: 'Throwing transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn().mockRejectedValue(new Error('encoder crashed')),
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'throwing-transcoder' }, () => definition)],
    );
    const files = [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')];

    try {
      await expect(worker.transcode({ from: 'glb', to: 'png', files, options: {} })).resolves.toMatchObject({
        success: false,
        issues: [{ code: 'TRANSCODER_CAPABILITY_MISSING' }],
      });
      const failed = await worker.transcode({
        from: 'glb',
        to: 'webp',
        files,
        options: {},
      });
      expect(failed.success).toBe(false);
      expect(failed.issues).toHaveLength(1);
      expect(failed.issues[0]?.code).toBe('TRANSCODER_EXECUTION_FAILED');
      expect(failed.issues[0]?.message).toContain('encoder crashed');
    } finally {
      await worker.cleanup();
    }
  });

  it('retries a provider after a transient initialization failure', async () => {
    const initialize = vi
      .fn<TranscoderDefinition['initialize']>()
      .mockRejectedValueOnce(new Error('adapter warming up'))
      .mockResolvedValue({});
    const definition: TranscoderDefinition = {
      name: 'Retryable transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize,
      transcode: vi.fn().mockResolvedValue({
        success: true,
        data: [exportFile('capture.webp', new Uint8Array([1]), 'image/webp')],
        issues: [],
      }),
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'retryable-transcoder' }, () => definition)],
    );
    const request = {
      from: 'glb',
      to: 'webp',
      files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
      options: {},
    } satisfies RuntimeTranscodeArgs;

    try {
      await expect(worker.transcode(request)).resolves.toMatchObject({
        success: false,
        issues: [{ code: 'TRANSCODER_INITIALIZATION_FAILED' }],
      });
      await expect(worker.transcode(request)).resolves.toMatchObject({
        success: true,
      });
      expect(initialize).toHaveBeenCalledTimes(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('records finalized artifact failure instead of plugin-declared success', async () => {
    const definition: TranscoderDefinition = {
      name: 'Invalid output transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn().mockResolvedValue({ success: true, data: [], issues: [] }),
    };
    const worker = await createMultiKernelWorker(
      [],
      [attachRuntimePluginDefinition({ id: 'invalid-output-transcoder' }, () => definition)],
    );
    const telemetry: Array<{
      readonly name: string;
      readonly detail?: Record<string, unknown>;
    }> = [];
    worker.setTelemetrySend((entries) => telemetry.push(...entries));

    try {
      await expect(
        worker.transcode({
          from: 'glb',
          to: 'webp',
          files: [exportFile('settled.glb', new Uint8Array([1]), 'model/gltf-binary')],
          options: {},
        }),
      ).resolves.toMatchObject({
        success: false,
        issues: [{ code: 'EXPORT_ARTIFACT_SET_INVALID' }],
      });
      worker.flushTelemetry();
      expect(
        telemetry.filter(({ name }) => name === 'kernel.transcode').map(({ detail }) => detail?.['success']),
      ).toEqual([false]);
    } finally {
      await worker.cleanup();
    }
  });

  it('lets the first registration win when two plugins compose the same edge', async () => {
    const factory = (id: 'first-edge' | 'second-edge') =>
      defineTranscoder({
        id,
        name: id,
        version: '1.0.0',
        edges: [
          {
            from: 'glb',
            to: 'webp',
            fidelity: 'mesh',
            optionsSchema:
              id === 'first-edge' ? z.object({ first: z.literal(true) }) : z.object({ second: z.literal(true) }),
          },
        ] as const,
        async initialize() {
          return {};
        },
        async transcode(input) {
          return { success: true, data: input.files, issues: [] };
        },
      })();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await seedTestFileSystem({ 'model.ts': 'model' });
      const runtime = defineRuntime({
        transcoders: [factory('first-edge'), factory('second-edge')],
      });
      const worker = await createMultiKernelWorker(
        [
          {
            id: 'manifest-kernel',
            extensions: ['ts'],
            definition: createMockKernelDefinition('manifest-kernel', {
              exports: {
                glb: {
                  title: 'GLB',
                  mimeType: 'model/gltf-binary',
                  extension: 'glb',
                  optionsSchema: z.object({}),
                },
              },
            }),
          },
        ],
        [...runtime.transcoders],
      );
      await openWorkerDocument(worker, 'manifest-document', 'model.ts');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('shadowed by "first-edge"'));
      const routes = worker.capabilitiesManifest.routes.filter(
        ({ sourceFormat, targetFormat }) => sourceFormat === 'glb' && targetFormat === 'webp',
      );
      expect(routes).toHaveLength(1);
      expect(routes[0]?.transcoderId).toBe('first-edge');
      expect(routes[0]?.exportOptions.schema.properties).toHaveProperty('first');
      expect(routes[0]?.exportOptions.schema.properties).not.toHaveProperty('second');
      await worker.cleanup();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects a plugin registering the same edge twice', async () => {
    const runtime = defineRuntime({
      transcoders: [
        defineTranscoder({
          id: 'twice',
          name: 'twice',
          version: '1.0.0',
          edges: [
            { from: 'glb', to: 'webp', fidelity: 'mesh' },
            { from: 'glb', to: 'webp', fidelity: 'mesh' },
          ] as const,
          async initialize() {
            return {};
          },
          async transcode(input) {
            return { success: true, data: input.files, issues: [] };
          },
        })(),
      ],
    });
    const worker = new KernelRuntimeWorker({ runtime });

    await expect(initializeWorkerForTesting(worker)).rejects.toThrow(
      'Duplicate transcoder edge glb → webp registered twice by "twice".',
    );
  });

  it('fails initialization when an edge schema cannot be advertised as JSON Schema', async () => {
    const transcoder = defineTranscoder({
      id: 'unadvertisable-edge',
      name: 'Unadvertisable edge',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh', optionsSchema: z.date() }] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        return { success: true, data: input.files, issues: [] };
      },
    })();
    const worker = new KernelRuntimeWorker({
      runtime: defineRuntime({ transcoders: [transcoder] }),
    });

    await expect(initializeWorkerForTesting(worker)).rejects.toThrow(
      'Failed to derive JSON Schema for unadvertisable-edge glb->webp.',
    );
  });
});

// ===================================================================
// Tests
// ===================================================================

describe('KernelRuntimeWorker middleware identity', () => {
  it('keeps hooks, options, and loggers independent when display names match', async () => {
    await seedTestFileSystem({ 'model.mock': 'mock geometry' });

    const observations: Array<{
      id: string;
      marker: string;
      logger: KernelRuntime['logger'];
    }> = [];
    const createMiddleware = (id: 'first' | 'second') =>
      defineMiddleware({
        id,
        name: 'Shared display name',
        optionsSchema: z.object({ marker: z.string() }),
        async wrapEvaluate(input, handler, runtime) {
          observations.push({
            id,
            marker: runtime.options.marker,
            logger: runtime.logger,
          });
          return handler(input);
        },
      });

    const worker = await createMultiKernelWorker(
      [
        {
          id: 'mock-kernel',
          extensions: ['mock'],
          definition: createMockKernelDefinition('mock-kernel'),
        },
      ],
      [],
      [createMiddleware('first')({ marker: 'alpha' }), createMiddleware('second')({ marker: 'beta' })],
    );

    await openWorkerDocument(worker, 'middleware-identity-document', 'model.mock');
    expect(observations.map(({ id, marker }) => ({ id, marker }))).toEqual([
      { id: 'first', marker: 'alpha' },
      { id: 'second', marker: 'beta' },
    ]);
    expect(observations[0]!.logger).not.toBe(observations[1]!.logger);
  });
});

describe('provider content projection', () => {
  it('omits content from every content-empty provider input', async () => {
    await seedTestFileSystem({ 'model.mock': 'mock geometry' });
    const seen = {
      kernelCreate: [] as boolean[],
      kernelMesh: [] as boolean[],
      kernelExport: [] as boolean[],
      middlewareCreate: [] as boolean[],
      middlewareMesh: [] as boolean[],
      middlewareExport: [] as boolean[],
      transcoder: [] as boolean[],
    };
    const definition = createMockKernelDefinition('content-empty-provider-kernel', {
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({}),
        },
      },
      async evaluate(input) {
        seen.kernelCreate.push(Object.hasOwn(input, 'content'));
        expect(input.options).toEqual({});
        return { handle: { label: 'native' }, issues: [] };
      },
      async render(input) {
        seen.kernelMesh.push(Object.hasOwn(input, 'content'));
        return { content: bytesFor('display') };
      },
      async export(input) {
        seen.kernelExport.push(Object.hasOwn(input, 'content'));
        return {
          files: [exportFile('model.glb', bytesFor('source'), 'model/gltf-binary')],
          issues: [],
        };
      },
    });
    const middleware = defineMiddleware({
      id: 'content-empty-provider-middleware',
      name: 'Content-empty provider middleware',
      async wrapEvaluate(input, handler) {
        seen.middlewareCreate.push(Object.hasOwn(input, 'content'));
        return handler(input);
      },
      async wrapRender(input, handler) {
        seen.middlewareMesh.push(Object.hasOwn(input, 'content'));
        return handler(input);
      },
      async wrapExport(input, handler) {
        seen.middlewareExport.push(Object.hasOwn(input, 'content'));
        return handler(input);
      },
    })();
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Content-empty transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'usdz', fidelity: 'mesh' }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn(async (input: TranscodeInput) => {
        seen.transcoder.push(Object.hasOwn(input, 'content'));
        return {
          success: true,
          data: [exportFile('model.usdz', new Uint8Array([1]), 'model/vnd.usdz+zip')],
          issues: [],
        };
      }),
      onDispose: vi.fn().mockResolvedValue(undefined),
    };
    const transcoder = attachRuntimePluginDefinition({ id: 'content-empty-transcoder' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [
        {
          id: 'content-empty-provider-kernel',
          extensions: ['mock'],
          definition,
        },
      ],
      [transcoder],
      [middleware],
    );

    try {
      await openWorkerDocument(worker, 'content-empty-document', 'model.mock');
      await renderWorkerView(worker, {
        documentId: 'content-empty-document',
        subscriptionId: 'content-empty-view',
      });
      const artifact = documentArtifact(worker, 'content-empty-document');
      expect(Object.hasOwn(artifact.result, nativeBuildInputSymbol)).toBe(false);
      const glbResult = await worker.exportDocument({
        documentId: 'content-empty-document',
        operationId: 'direct-export',
        target: 'glb',
      });
      const usdzResult = await worker.exportDocument({
        documentId: 'content-empty-document',
        operationId: 'routed-export',
        target: 'usdz',
      });
      expect(glbResult.success).toBe(true);
      expect(usdzResult.success).toBe(true);
      expect(seen).toEqual({
        kernelCreate: [false],
        kernelMesh: [false],
        kernelExport: [false, false],
        middlewareCreate: [false],
        middlewareMesh: [false],
        middlewareExport: [false, false],
        transcoder: [false],
      });
    } finally {
      await worker.cleanup();
    }
  });

  it('projects canonical content per middleware and preserves non-content transformations', async () => {
    await seedTestFileSystem({ 'model.mock': 'mock geometry' });
    const observations: Array<{
      hook: string;
      content: unknown;
      marker: unknown;
    }> = [];
    const kernelCreateInputs: Array<Record<string, unknown>> = [];
    const kernelExportInputs: Array<Record<string, unknown>> = [];
    const definition = createMockKernelDefinition('projected-provider-kernel', {
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({ marker: z.string().optional() }),
        },
      },
      async evaluate(input) {
        kernelCreateInputs.push(input);
        return { handle: { label: 'native' }, issues: [] };
      },
      async export(input) {
        kernelExportInputs.push(input);
        return {
          files: [exportFile('model.glb', bytesFor('direct'), 'model/gltf-binary')] as const,
          issues: [],
        };
      },
    });
    const edges = defineMiddleware({
      id: 'projected-edges',
      name: 'Projected edges',
      content: {
        views: { 'model/gltf-binary': ['includeEdges'] },
        exports: { glb: ['includeEdges'] },
      },
      async wrapEvaluate(input, handler) {
        observations.push({
          hook: 'edges-evaluate',
          content: undefined,
          marker: input.parameters['marker'],
        });
        return handler({
          ...input,
          parameters: { ...input.parameters, marker: 'from-edges' },
        });
      },
      async wrapRender(input, handler) {
        observations.push({
          hook: 'edges-render',
          content: input.content,
          marker: input.options['marker'],
        });
        return handler({
          ...input,
          content: { includeTopology: false },
        } as unknown as typeof input);
      },
      async wrapExport(input, handler) {
        observations.push({
          hook: 'edges-export',
          content: input.content,
          marker: input.options['marker'],
        });
        return handler({
          ...input,
          options: { ...input.options, marker: 'from-edges' },
          content: { includeTopology: false },
        } as unknown as typeof input);
      },
    })();
    const topology = defineMiddleware({
      id: 'projected-topology',
      name: 'Projected topology',
      content: {
        views: { 'model/gltf-binary': ['includeTopology'] },
        exports: { glb: ['includeTopology'] },
      },
      async wrapEvaluate(input, handler) {
        observations.push({
          hook: 'topology-evaluate',
          content: undefined,
          marker: input.parameters['marker'],
        });
        return handler(input);
      },
      async wrapRender(input, handler) {
        observations.push({
          hook: 'topology-render',
          content: input.content,
          marker: input.options['marker'],
        });
        return handler(input);
      },
      async wrapExport(input, handler) {
        observations.push({
          hook: 'topology-export',
          content: input.content,
          marker: input.options['marker'],
        });
        return handler(input);
      },
    })();
    const worker = await createMultiKernelWorker(
      [{ id: 'projected-provider-kernel', extensions: ['mock'], definition }],
      [],
      [edges, topology],
    );

    try {
      await openWorkerDocument(worker, 'projected-content-document', 'model.mock');
      await renderWorkerView(worker, {
        documentId: 'projected-content-document',
        subscriptionId: 'projected-content-view',
        content: { includeEdges: true, includeTopology: true },
      });
      const exportResult = await worker.exportDocument({
        documentId: 'projected-content-document',
        operationId: 'projected-content-export',
        target: 'glb',
        content: { includeEdges: true, includeTopology: true },
      });
      expect(exportResult.success).toBe(true);

      expect(observations).toEqual([
        { hook: 'edges-evaluate', content: undefined, marker: undefined },
        { hook: 'topology-evaluate', content: undefined, marker: 'from-edges' },
        {
          hook: 'edges-render',
          content: { includeEdges: true },
          marker: undefined,
        },
        {
          hook: 'topology-render',
          content: { includeTopology: true },
          marker: undefined,
        },
        {
          hook: 'edges-export',
          content: { includeEdges: true },
          marker: undefined,
        },
        {
          hook: 'topology-export',
          content: { includeTopology: true },
          marker: 'from-edges',
        },
      ]);
      expect(Object.hasOwn(kernelCreateInputs[0]!, 'content')).toBe(false);
      expect(kernelCreateInputs[0]?.['parameters']).toEqual({
        marker: 'from-edges',
      });
      expect(Object.hasOwn(kernelExportInputs[0]!, 'content')).toBe(false);
      expect(kernelExportInputs[0]?.['options']).toEqual({
        marker: 'from-edges',
      });
    } finally {
      await worker.cleanup();
    }
  });

  it('publishes exact provider unions and source/transcoder intersections without duplicates', async () => {
    await seedTestFileSystem({ 'model.mock': 'mock geometry' });
    const definition = createMockKernelDefinition('content-algebra-kernel', {
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          content: ['includeEdges'],
        },
      },
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({}),
          content: ['includeEdges'],
        },
        step: {
          title: 'STEP',
          mimeType: 'application/step',
          extension: 'step',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async () => ({ handle: { label: 'native' }, issues: [] }),
      render: async () => ({ content: bytesFor('display') }),
    });
    const duplicateEdges = defineMiddleware({
      id: 'duplicate-edges',
      name: 'Duplicate edges',
      content: {
        views: { 'model/gltf-binary': ['includeEdges'] },
        exports: { glb: ['includeEdges'] },
      },
      wrapRender: async (input, handler) => handler(input),
    })();
    const topology = defineMiddleware({
      id: 'topology-provider',
      name: 'Topology provider',
      content: {
        views: { 'model/gltf-binary': ['includeTopology'] },
        exports: { glb: ['includeTopology'] },
      },
      wrapRender: async (input, handler) => handler(input),
    })();
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Content intersection transcoder',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          content: ['includeEdges'],
        },
      ],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn(),
      onDispose: vi.fn().mockResolvedValue(undefined),
    };
    const transcoder = attachRuntimePluginDefinition({ id: 'content-intersection' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [{ id: 'content-algebra-kernel', extensions: ['mock'], definition }],
      [transcoder],
      [duplicateEdges, topology],
    );

    try {
      await openWorkerDocument(worker, 'content-algebra-document', 'model.mock');
      const contentKeys = (value: { schema: { properties?: Record<string, unknown> } } | undefined) =>
        Object.keys(value?.schema.properties ?? {}).sort();
      const manifest = worker.capabilitiesManifest;
      const directGlb = manifest.routes.find(
        ({ kernelId, targetFormat, transcoderId }) =>
          kernelId === 'content-algebra-kernel' && targetFormat === 'glb' && transcoderId === undefined,
      );
      const directStep = manifest.routes.find(
        ({ kernelId, targetFormat, transcoderId }) =>
          kernelId === 'content-algebra-kernel' && targetFormat === 'step' && transcoderId === undefined,
      );
      const webp = manifest.routes.find(({ targetFormat }) => targetFormat === 'webp');

      expect(contentKeys(manifest.renderCapabilities['content-algebra-kernel']?.content)).toEqual([
        'includeEdges',
        'includeTopology',
      ]);
      expect(contentKeys(directGlb?.content)).toEqual(['includeEdges', 'includeTopology']);
      expect(directStep).not.toHaveProperty('content');
      expect(contentKeys(webp?.content)).toEqual(['includeEdges']);
    } finally {
      await worker.cleanup();
    }
  });

  it('suppresses fallback work for native content and rejects unsupported dynamic input before providers', async () => {
    await seedTestFileSystem({ 'model.mock': 'mock geometry' });
    const evaluate = vi.fn(async () => ({
      handle: { label: 'native' },
      issues: [],
    }));
    const render = vi.fn(async () => ({ content: bytesFor('display') }));
    const passThroughMesh: WrapRenderHook<Record<string, never>, Record<string, never>, 'includeEdges'> = async (
      input,
      handler,
    ) => handler(input);
    const fallback = vi.fn(passThroughMesh);
    const definition = createMockKernelDefinition('native-content-kernel', {
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          content: ['includeEdges'],
        },
      },
      evaluate,
      render,
    });
    const fallbackMiddleware = defineMiddleware({
      id: 'fallback-edges',
      name: 'Fallback edges',
      content: { views: { 'model/gltf-binary': ['includeEdges'] } },
      wrapRender: fallback,
    })();
    const worker = await createMultiKernelWorker(
      [{ id: 'native-content-kernel', extensions: ['mock'], definition }],
      [],
      [fallbackMiddleware],
    );

    try {
      await openWorkerDocument(worker, 'native-content-document', 'model.mock');
      await renderWorkerView(worker, {
        documentId: 'native-content-document',
        subscriptionId: 'native-content-view',
        content: { includeEdges: true },
      });
      expect(fallback).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ content: { includeEdges: true } }),
        expect.any(Object),
        expect.any(Object),
      );

      const calls = {
        create: evaluate.mock.calls.length,
        mesh: render.mock.calls.length,
      };
      const unsupported = await requestWorkerView(worker, {
        documentId: 'native-content-document',
        subscriptionId: 'unsupported-content-view',
        content: { includeTopology: true },
      });
      expect(unsupported.success).toBe(false);
      expect(unsupported.issues[0]?.code).toBe('RUNTIME_CONTENT_UNSUPPORTED');
      expect(evaluate).toHaveBeenCalledTimes(calls.create);
      expect(render).toHaveBeenCalledTimes(calls.mesh);
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });
});

describe('create-options projection', () => {
  beforeEach(async () => {
    await seedTestFileSystem({ 'model.mock': 'mock geometry' });
  });

  it('canonicalizes omitted defaults and object insertion order into one native key', async () => {
    const createInputs: NativeBuildInput[] = [];
    const definition = createMockKernelDefinition('canonical-create-options', {
      evaluateOptionsSchema: z.object({ quality: z.number().default(8) }),
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          optionsSchema: z.object({ quality: z.number().default(8) }),
        },
      },
      evaluate: async (input: NativeBuildInput) => {
        createInputs.push(input);
        return { handle: { label: 'native' }, issues: [] };
      },
    });
    const worker = await createMultiKernelWorker([
      { id: 'canonical-create-options', extensions: ['mock'], definition },
    ]);

    try {
      const firstEvaluation = await evaluateDocumentRequest(worker, {
        documentId: 'canonical-options-first',
        intent: 1,
        file: createGeometryFile('model.mock'),
        parameters: { a: 1, nested: { x: 2, y: 3 } },
        watch: false,
      });
      expect(firstEvaluation.success).toBe(true);
      const first = documentArtifact(worker, 'canonical-options-first');
      const secondEvaluation = await evaluateDocumentRequest(worker, {
        documentId: 'canonical-options-second',
        intent: 1,
        file: createGeometryFile('model.mock'),
        parameters: { nested: { y: 3, x: 2 }, a: 1 },
        evaluateOptions: { quality: 8 },
        watch: false,
      });
      expect(secondEvaluation.success).toBe(true);
      const second = documentArtifact(worker, 'canonical-options-second');

      expect(createInputs.map(({ options }) => options)).toEqual([{ quality: 8 }]);
      expect(second.identity.nativeHandleKey).toBe(first.identity.nativeHandleKey);
      expect(second.evaluationSlot).toBe(first.evaluationSlot);
    } finally {
      await worker.cleanup();
    }
  });

  it('pins evaluate options for views and uses export-specific options only in a private build', async () => {
    const createInputs: NativeBuildInput[] = [];
    const definition = createMockKernelDefinition('merged-create-options', {
      evaluateOptionsSchema: z.object({
        nested: z.object({ a: z.number(), b: z.number() }),
        layers: z.array(z.number()),
      }),
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          optionsSchema: z.object({
            nested: z.object({ a: z.number() }).default({ a: 1 }),
            layers: z.array(z.number()).default([1, 2]),
            renderOnly: z.string().default('display'),
          }),
        },
      },
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({
            nested: z.object({ b: z.number() }),
            layers: z.array(z.number()),
            sourceOnly: z.string(),
          }),
        },
      },
      evaluate: async (input: NativeBuildInput) => {
        createInputs.push(input);
        return { handle: { label: 'native' }, issues: [] };
      },
      export: async () => ({
        files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
        issues: [],
      }),
    });
    const worker = await createMultiKernelWorker([{ id: 'merged-create-options', extensions: ['mock'], definition }]);

    try {
      const evaluated = await evaluateDocumentRequest(worker, {
        documentId: 'pinned-options-document',
        intent: 1,
        file: createGeometryFile('model.mock'),
        parameters: {},
        evaluateOptions: { nested: { a: 1, b: 2 }, layers: [9] },
        watch: false,
      });
      expect(evaluated.success, JSON.stringify(evaluated.issues)).toBe(true);
      expect(createInputs).toHaveLength(1);
      await renderWorkerView(worker, {
        documentId: 'pinned-options-document',
        subscriptionId: 'pinned-options-view',
        options: { nested: { a: 1 }, layers: [1, 2], renderOnly: 'display' },
      });
      expect(createInputs).toHaveLength(1);
      const result = await worker.exportDocument({
        documentId: 'pinned-options-document',
        operationId: 'pinned-options-export',
        target: 'gltf',
        options: { nested: { b: 2 }, layers: [1, 2], sourceOnly: 'source' },
      });

      expect(result.success, JSON.stringify(result.issues)).toBe(true);
      expect(createInputs).toEqual([
        {
          entryPath: 'model.mock',
          parameters: {},
          options: { nested: { a: 1, b: 2 }, layers: [9] },
        },
        {
          entryPath: 'model.mock',
          parameters: {},
          options: { nested: { a: 1, b: 2 }, layers: [1, 2] },
        },
      ]);
    } finally {
      await worker.cleanup();
    }
  });

  it('returns a typed issue before middleware or kernel work when create options fail', async () => {
    const evaluate = vi.fn();
    const passThroughCreate: WrapEvaluateHook<Record<string, never>, Record<string, never>> = async (input, handler) =>
      handler(input);
    const wrapEvaluate = vi.fn(passThroughCreate);
    const definition = createMockKernelDefinition('invalid-create-options', {
      evaluateOptionsSchema: z.object({ quality: z.number().positive() }),
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          optionsSchema: z.object({ quality: z.unknown() }),
        },
      },
      evaluate,
    });
    const middleware = defineMiddleware({
      id: 'must-not-run',
      name: 'Must not run',
      wrapEvaluate,
    })();
    const worker = await createMultiKernelWorker(
      [{ id: 'invalid-create-options', extensions: ['mock'], definition }],
      [],
      [middleware],
    );

    try {
      const result = await evaluateDocumentRequest(worker, {
        documentId: 'invalid-create-options',
        intent: 1,
        file: createGeometryFile('model.mock'),
        parameters: {},
        evaluateOptions: { quality: 'invalid' },
        watch: false,
      });

      expect(result.success).toBe(false);
      expect(result.issues[0]).toMatchObject({
        code: 'EVALUATE_OPTIONS_INVALID',
        severity: 'error',
      });
      expect(result.issues[0]?.message).toContain('evaluate option');
      expect(wrapEvaluate).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });
});

describe('KernelRuntimeWorker kernel selection', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      'model.scad': 'cube([10, 10, 10]);',
      'main.ts': `import { draw } from 'replicad';\ndraw();`,
      'plain.ts': 'export const main = () => ({ type: "mesh" });',
      'data.xyz': 'some unknown format',
      'model.step': 'ISO-10303-21;',
    });
  });

  describe('extension fast path', () => {
    it('should select a kernel by a case-insensitive compound extension', async () => {
      await seedTestFileSystem({ 'model.MESH.XML': '<mesh />' });
      const meshDefinition = createMockKernelDefinition('mesh-kernel');
      const worker = await createMultiKernelWorker([
        {
          id: 'mesh-kernel',
          extensions: ['mesh.xml'],
          definition: meshDefinition,
        },
      ]);

      await openWorkerDocument(worker, 'compound-extension-document', 'model.MESH.XML');
      expect(getInitSpy(meshDefinition)).toHaveBeenCalledOnce();
    });

    it('names the selected kernel on the selection span, so a trace says which kernel ran', async () => {
      const entries: TelemetryEntry[] = [];
      const scadDefinition = createMockKernelDefinition('openrscad');
      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);
      worker.setTelemetrySend((batch) => entries.push(...batch));

      await openWorkerDocument(worker, 'selection-span-document', 'model.scad');
      worker.flushTelemetry();

      /* A resident native engine logs its own identity at fork, so the host log cannot say which
       * kernel a render used. The trace has to. */
      expect(entries.find(({ name }) => name === 'kernel.select')?.detail).toMatchObject({
        file: 'model.scad',
        kernelId: 'openrscad',
      });
    });

    it('should select a kernel by extension when no detectImport is needed', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await openWorkerDocument(worker, 'extension-selection-document', 'model.scad');
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
    });

    it('should select the first matching kernel by extension order', async () => {
      const kernelA = createMockKernelDefinition('kernel-a');
      const kernelB = createMockKernelDefinition('kernel-b');

      const worker = await createMultiKernelWorker([
        { id: 'kernel-a', extensions: ['scad'], definition: kernelA },
        { id: 'kernel-b', extensions: ['scad'], definition: kernelB },
      ]);

      await openWorkerDocument(worker, 'first-extension-document', 'model.scad');

      expect(getInitSpy(kernelA)).toHaveBeenCalledOnce();
      expect(getInitSpy(kernelB)).not.toHaveBeenCalled();
    });
  });

  describe('regex detection', () => {
    it('selects a v2 kernel from JSON-round-tripped detectImport metadata with flags', async () => {
      await seedTestFileSystem({
        'main.ts': "import { draw } FROM 'REPLICAD';\ndraw();",
      });
      const initialize = vi.fn(async () => ({}));
      const registration = defineKernel({
        id: 'serialized-replicad',
        name: 'Serialized Replicad',
        version: '1.0.0',
        extensions: ['ts'],
        detectImport: /import.*from\s+["']replicad["']/is,
        views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
        exports: {},
        initialize,
        async resolve({ entryPath }) {
          return { resolved: [entryPath], unresolved: [] };
        },
        async describe() {
          return {
            success: true,
            data: { parameters: emptyParameterDeclaration },
            issues: [],
          };
        },
        async evaluate() {
          return { handle: {} };
        },
        async render() {
          return { content: new Uint8Array([1]) };
        },
      })();
      // oxlint-disable-next-line unicorn/prefer-structured-clone -- This checks the public JSON registration boundary.
      const metadata = JSON.parse(JSON.stringify(registration)) as Pick<
        typeof registration,
        'id' | 'extensions' | 'detectImport' | 'views' | 'exports'
      >;
      expect(metadata.detectImport).toEqual({
        source: registration.detectImport?.source,
        flags: 'is',
      });
      const definition = await resolveRuntimePluginDefinition('kernel', registration);
      const runtime = defineRuntime({
        kernels: [attachRuntimePluginDefinition(metadata, () => definition)],
      });
      const worker = new KernelRuntimeWorker({ runtime });
      await initializeWorkerForTesting(worker);

      try {
        await openWorkerDocument(worker, 'serialized-detection-document', 'main.ts');
        expect(initialize).toHaveBeenCalledOnce();
      } finally {
        await worker.cleanup();
      }
    });

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

      await openWorkerDocument(worker, 'regex-match-document', 'main.ts');
      expect(getInitSpy(replicadDefinition)).toHaveBeenCalledOnce();
    });

    it('should surface initialization errors when a kernel positively matches by regex', async () => {
      const replicadDefinition = createMockKernelDefinition('replicad');
      const catchAllDefinition = createMockKernelDefinition('fallback');
      getInitSpy(replicadDefinition).mockRejectedValueOnce(new Error('Replicad multi WASM loader was not emitted'));

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
        },
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      const result = await evaluateWorkerDocument(worker, 'regex-initialization-failure-document', 'main.ts');

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
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
        },
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await openWorkerDocument(worker, 'regex-no-match-document', 'plain.ts');

      expect(getInitSpy(replicadDefinition)).not.toHaveBeenCalled();
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('catch-all fallback', () => {
    it('should select the catch-all kernel when no other kernel matches', async () => {
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await openWorkerDocument(worker, 'catch-all-step-document', 'model.step');
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });

    it('should accept any extension via catch-all wildcard', async () => {
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await openWorkerDocument(worker, 'catch-all-xyz-document', 'data.xyz');
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });

    it('should defer catch-all when bundler-equipped kernels exist', async () => {
      const replicadDefinition = createMockKernelDefinition('replicad');
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: replicadDefinition,
          detectImport: replicadDetectPattern.source,
          builtinModuleNames: ['replicad'],
        },
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await openWorkerDocument(worker, 'catch-all-priority-document', 'model.step');

      expect(getInitSpy(replicadDefinition)).not.toHaveBeenCalled();
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('multi-kernel priority', () => {
    it('should select extension-matched kernel over catch-all', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      await openWorkerDocument(worker, 'extension-priority-document', 'model.scad');

      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
      expect(getInitSpy(catchAllDefinition)).not.toHaveBeenCalled();
    });
  });

  describe('selection cache', () => {
    it('should reuse cached kernel selection on repeated calls for the same file', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await openWorkerDocument(worker, 'selection-cache-first', 'model.scad');
      await openWorkerDocument(worker, 'selection-cache-second', 'model.scad');

      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('file change invalidation', () => {
    it('should clear selection cache after notifyFileChanged', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await openWorkerDocument(worker, 'selection-invalidation-first', 'model.scad');
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();

      await worker.notifyFileChanged(['model.scad']);

      await openWorkerDocument(worker, 'selection-invalidation-second', 'model.scad');
    });

    it('should clear selection cache when a watch event fires (not just notifyFileChanged)', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      let capturedWatchCallback: ((event: WatchEvent) => void) | undefined;
      const workerFileSystem = Reflect.get(worker, 'fileSystem') as WorkerFileSystemProxy;
      workerFileSystem.watchReady = (_request, callback) => {
        capturedWatchCallback = callback;
        return {
          unsubscribe: () => {
            capturedWatchCallback = undefined;
          },
          ready: Promise.resolve(),
          closed: Promise.resolve(),
        };
      };
      await evaluateDocumentRequest(worker, {
        documentId: 'selection-watch-document',
        intent: 1,
        file: createGeometryFile('model.scad'),
        parameters: {},
        watch: true,
      });
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
      // @ts-expect-error - accessing private for test verification
      expect(worker.selectionCache.size).toBe(1);
      // @ts-expect-error -- Observe the private selection cache's watch invalidation.
      const clearSelection = vi.spyOn(worker.selectionCache, 'clear');
      await vi.waitFor(() => {
        expect(capturedWatchCallback).toBeDefined();
      });

      await getTestFileSystem().writeFile('model.scad', 'cube([2,2,2]);');
      capturedWatchCallback!({ type: 'change', path: 'model.scad' });

      await vi.waitFor(() => {
        expect(clearSelection).toHaveBeenCalled();
      });
    });

    it('keeps render-only middleware dependencies watched by a live document', async () => {
      await seedTestFileSystem({
        'model.mock': 'model',
        'render.dep': 'first',
      });
      const evaluate = vi.fn(async () => ({ handle: { label: 'model' } }));
      const render = vi.fn(async () => ({ content: bytesFor('model') }));
      const definition = createMockKernelDefinition('render-watch-kernel', {
        evaluate,
        render,
      });
      const middleware = defineMiddleware({
        id: 'render-watch',
        name: 'Render watch',
        resolve: () => [{ path: 'render.dep', affects: ['render'] }],
        async wrapRender(input, next) {
          return next(input);
        },
      })();
      const worker = await createMultiKernelWorker(
        [{ id: 'render-watch-kernel', extensions: ['mock'], definition }],
        [],
        [middleware],
      );
      await evaluateDocumentRequest(worker, {
        documentId: 'render-watch-document',
        intent: 1,
        file: createGeometryFile('model.mock'),
        parameters: {},
        watch: true,
      });
      const first = await requestWorkerView(worker, {
        documentId: 'render-watch-document',
        subscriptionId: 'render-watch-view',
      });
      expect(worker.getWatchedPaths()).toContain('render.dep');

      const reevaluated: number[] = [];
      const rerendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
      worker.onEvaluated = ({ intent }) => {
        reevaluated.push(intent);
      };
      worker.onRendered = (event) => {
        rerendered.push(event);
      };
      await getTestFileSystem().writeFile('render.dep', 'second');
      await vi.waitFor(() => {
        expect(reevaluated).toHaveLength(1);
        expect(rerendered).toHaveLength(1);
      });
      expect(evaluate).toHaveBeenCalledOnce();
      expect(render).toHaveBeenCalledTimes(2);
      const second = rerendered[0];
      if (!first.success || !second?.success) {
        throw new Error('Expected both watched view projections to succeed.');
      }
      expect(second.hash).not.toBe(first.hash);
      await worker.cleanup();
    });
  });

  describe('no kernel matches', () => {
    it('should fail when no kernel matches an unrecognized extension', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      const result = await evaluateWorkerDocument(worker, 'unhandled-xyz-document', 'data.xyz');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KERNEL_CAPABILITY_MISSING' }));
      }
    });

    it('should name the unhandled extension and the registered ones', async () => {
      await seedTestFileSystem({ 'a.scad': 'cube([1,1,1]);' });
      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: createMockKernelDefinition('replicad'),
        },
      ]);

      const result = await evaluateWorkerDocument(worker, 'unhandled-scad-document', 'a.scad');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toBe(
          'No kernel handles ".scad". Registered kernels handle: ts, js. Install a plugin that declares this extension and add it to the runtime definition.',
        );
      }
    });

    it('should carry the unhandled-extension detail into the export-route diagnostic', async () => {
      await seedTestFileSystem({ 'a.scad': 'cube([1,1,1]);' });
      const worker = await createMultiKernelWorker([
        {
          id: 'replicad',
          extensions: ['ts', 'js'],
          definition: createMockKernelDefinition('replicad'),
        },
      ]);

      await evaluateWorkerDocument(worker, 'unhandled-export-document', 'a.scad');
      const result = await worker.exportDocument({
        documentId: 'unhandled-export-document',
        operationId: 'unhandled-export',
        target: 'glb',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toContain('No kernel handles ".scad"');
      }
    });
  });
});

// ===================================================================
// Lazy capabilities manifest via loadKernelModule
// ===================================================================

describe('lazy capabilities manifest', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      'model.scad': 'cube([1,1,1]);',
    });
  });

  it('should rebuild capabilities manifest after loading a kernel module', async () => {
    const definition = createMockKernelDefinition('openrscad', {
      exports: {
        stl: {
          title: 'STL',
          mimeType: 'model/stl',
          extension: 'stl',
          optionsSchema: z.object({ binary: z.boolean().default(true) }),
        },
      },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    await openWorkerDocument(worker, 'manifest-routes-document', 'model.scad');

    const manifest = worker.capabilitiesManifest;
    expect(manifest.routes.filter((r) => !r.transcoderId).length).toBeGreaterThan(0);
  });

  it('should include kernel export schemas in manifest after lazy load', async () => {
    const stlSchema = z.object({ binary: z.boolean().default(true) });
    const definition = createMockKernelDefinition('openrscad', {
      exports: {
        stl: {
          title: 'STL',
          mimeType: 'model/stl',
          extension: 'stl',
          optionsSchema: stlSchema,
        },
      },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    await openWorkerDocument(worker, 'manifest-export-schema-document', 'model.scad');

    const manifest = worker.capabilitiesManifest;
    const stlExport = manifest.routes.find(
      (route) => route.kernelId === 'openrscad' && route.targetFormat === 'stl' && !route.transcoderId,
    );
    expect(stlExport).toBeDefined();
    expect(stlExport!.exportOptions.schema).toHaveProperty('properties');
    expect(
      (
        stlExport!.exportOptions.schema as {
          properties: Record<string, unknown>;
        }
      ).properties,
    ).toHaveProperty('binary');
    expect(stlExport!.exportOptions.defaults).toEqual({ binary: true });
  });

  it('should include render option schema in manifest after lazy load', async () => {
    const renderSchema = z.object({
      quality: z.enum(['low', 'high']).default('high'),
    });
    const definition = createMockKernelDefinition('openrscad', {
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          optionsSchema: renderSchema,
        },
      },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    await openWorkerDocument(worker, 'manifest-view-schema-document', 'model.scad');

    const manifest = worker.capabilitiesManifest;
    const renderOption = manifest.renderCapabilities['openrscad'];
    expect(renderOption).toBeDefined();
    expect(renderOption!.renderOptions.schema).toHaveProperty('properties');
    expect(renderOption!.renderOptions.defaults).toEqual({ quality: 'high' });
  });

  it('should push capabilitiesUpdated when kernel module loads', async () => {
    const definition = createMockKernelDefinition('openrscad', {
      exports: {
        stl: {
          title: 'STL',
          mimeType: 'model/stl',
          extension: 'stl',
          optionsSchema: z.object({ binary: z.boolean().default(true) }),
        },
      },
    });

    const runtime = defineRuntime({
      kernels: [attachRuntimePluginDefinition({ id: 'openrscad', extensions: ['scad'] }, () => definition)],
    });
    const worker = new KernelRuntimeWorker({ runtime });
    const callback = vi.fn();
    worker.onCapabilitiesUpdated = callback;

    await initializeWorkerForTesting(worker);

    await openWorkerDocument(worker, 'manifest-notification-document', 'model.scad');

    expect(callback).toHaveBeenCalled();
    const lastCall = callback.mock.calls.at(-1)![0]! as CapabilitiesManifest;
    expect(lastCall.routes.some((route) => route.kernelId === 'openrscad' && !route.transcoderId)).toBe(true);
  });

  it('should expose renderCapabilities indexed by kernelId after lazy load', async () => {
    const renderSchema = z.object({
      quality: z.enum(['low', 'high']).default('high'),
    });
    const definition = createMockKernelDefinition('openrscad', {
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          optionsSchema: renderSchema,
        },
      },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    await openWorkerDocument(worker, 'manifest-render-capability-document', 'model.scad');

    const manifest = worker.capabilitiesManifest;
    /* oxlint-disable typescript/no-unsafe-assignment -- expect.objectContaining/expect.anything matchers return any */
    expect(manifest.renderCapabilities['openrscad']).toEqual(
      expect.objectContaining({
        renderOptions: expect.objectContaining({
          schema: expect.objectContaining({
            properties: expect.objectContaining({ quality: expect.anything() }),
          }),
          defaults: { quality: 'high' },
        }),
      }),
    );
    /* oxlint-enable typescript/no-unsafe-assignment */
  });
});

// ===================================================================
// Native-handle snapshot restoration
// ===================================================================

describe('native-handle snapshot restoration', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      'model.mock': 'mock geometry',
    });
  });

  it('should restore a durable native handle through paired kernel hooks', async () => {
    const evaluate = vi.fn().mockResolvedValue({
      handle: { kind: 'live-handle' },
      exports: ['gltf'],
      issues: [] as KernelIssue[],
    });
    const deserializeHandle = vi.fn().mockReturnValue({ kind: 'restored-handle' });
    const exportFiles = vi.fn().mockResolvedValue({
      files: [exportFile('model.gltf', new Uint8Array([9]), 'model/gltf+json')] as const,
      issues: [] as KernelIssue[],
    });
    const definition = createMockKernelDefinition('snapshot-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
        stl: {
          title: 'STL',
          mimeType: 'model/stl',
          extension: 'stl',
          optionsSchema: z.object({}),
        },
      },
      evaluate,
      export: exportFiles,
      serializeHandle: ({ handle }: { handle: unknown }) => ({
        snapshot: handle,
      }),
      deserializeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'snapshot-kernel', extensions: ['mock'], definition }]);

    await openWorkerDocument(worker, 'restored-doc', 'model.mock');
    const artifact = documentArtifact(worker, 'restored-doc');
    const serialized = artifact.serializedNativeHandleSlot;
    expect(serialized).toBeDefined();
    if (!serialized) {
      throw new Error('Expected a serialized native handle.');
    }
    serialized.serializedNativeHandle = structuredClone(serialized.serializedNativeHandle);
    artifact.liveNativeHandleSlot = undefined;

    const unoffered = await worker.exportDocument({
      documentId: 'restored-doc',
      operationId: 'unoffered-stl',
      target: 'stl',
    });
    expect(unoffered.success).toBe(false);
    expect(unoffered.issues[0]?.code).toBe('EXPORT_UNKNOWN');

    const exportResult = await worker.exportDocument({
      documentId: 'restored-doc',
      operationId: 'restored-gltf',
      target: 'gltf',
    });

    expect(exportResult.success).toBe(true);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(deserializeHandle).toHaveBeenCalledWith(
      { serialized: { snapshot: { kind: 'live-handle' } } },
      expect.any(Object),
      { id: 'snapshot-kernel' },
    );
    expect(exportFiles).toHaveBeenCalledWith(
      expect.objectContaining({ handle: { kind: 'restored-handle' } }),
      expect.any(Object),
      { id: 'snapshot-kernel' },
    );
  });

  it('should reheat when a durable native-handle snapshot cannot be restored', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        handle: { kind: 'initial-live-handle' },
        issues: [] as KernelIssue[],
      })
      .mockResolvedValueOnce({
        handle: { kind: 'reheated-live-handle' },
        issues: [] as KernelIssue[],
      });
    const deserializeHandle = vi.fn(() => {
      throw new Error('Snapshot payload is corrupt');
    });
    const exportFiles = vi.fn().mockResolvedValue({
      files: [exportFile('model.gltf', new Uint8Array([9]), 'model/gltf+json')] as const,
      issues: [] as KernelIssue[],
    });
    const definition = createMockKernelDefinition('snapshot-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate,
      export: exportFiles,
      serializeHandle: ({ handle }: { handle: unknown }) => ({
        snapshot: handle,
      }),
      deserializeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'snapshot-kernel', extensions: ['mock'], definition }]);

    await openWorkerDocument(worker, 'reheat-doc', 'model.mock');
    const artifact = documentArtifact(worker, 'reheat-doc');
    artifact.liveNativeHandleSlot = undefined;

    const exportResult = await worker.exportDocument({
      documentId: 'reheat-doc',
      operationId: 'reheated-gltf',
      target: 'gltf',
    });

    expect(exportResult.success).toBe(true);
    expect(deserializeHandle).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(exportFiles).toHaveBeenCalledWith(
      expect.objectContaining({ handle: { kind: 'reheated-live-handle' } }),
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

    const evaluate = vi.fn(async () => {
      createCount += 1;
      canExportFromMemory = true;
      return {
        handle: {
          kind: 'live-engine-session',
          generation: createCount,
          hasGeometry: true,
        },
        views: [] as const,
        exports: ['glb', 'step'] as const,
        issues: [] as KernelIssue[],
      };
    });

    const exportFiles = vi.fn(async (input: TestExportInput): Promise<ExportOutput> => {
      if (!canExportFromMemory) {
        throw Object.assign(new Error(noProgramIssue.message), {
          issues: [noProgramIssue],
        });
      }

      switch (input.exportId) {
        case 'glb': {
          canExportFromMemory = false;
          return {
            files: [exportFile('source.glb', new Uint8Array([1, 2, 3]), 'model/gltf-binary')] as const,
            issues: [] as KernelIssue[],
          };
        }

        case 'step': {
          return {
            files: [exportFile('model.step', new Uint8Array([4, 5, 6]), 'application/step')] as const,
            issues: [] as KernelIssue[],
          };
        }

        default: {
          throw new Error(`Unsupported format: ${input.exportId}`);
        }
      }
    });

    const definition = createMockKernelDefinition('volatile-kernel', {
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({}),
        },
        step: {
          title: 'STEP',
          mimeType: 'application/step',
          extension: 'step',
          optionsSchema: z.object({}),
        },
      },
      evaluate,
      export: exportFiles,
      isHandleValid: ({ handle }) => {
        if (typeof handle === 'object' && handle !== null && 'hasGeometry' in handle) {
          return !handle['hasGeometry'] || canExportFromMemory;
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
      onDispose: vi.fn().mockResolvedValue(undefined),
    };
    const transcoderPlugin = attachRuntimePluginDefinition({ id: 'mock-converter' }, () => transcoderDefinition);

    const worker = await createMultiKernelWorker(
      [{ id: 'volatile-kernel', extensions: ['mock'], definition }],
      [transcoderPlugin],
    );

    await openWorkerDocument(worker, 'volatile-doc', 'model.mock');
    const artifact = documentArtifact(worker, 'volatile-doc');
    artifact.liveNativeHandleSlot = undefined;
    canExportFromMemory = false;

    const usdzResult = await worker.exportDocument({
      documentId: 'volatile-doc',
      operationId: 'volatile-usdz',
      target: 'usdz',
    });

    expect(usdzResult.success).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(transcode).toHaveBeenCalledOnce();

    const stepResult = await worker.exportDocument({
      documentId: 'volatile-doc',
      operationId: 'volatile-step',
      target: 'step',
    });

    expect(stepResult.success).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(3);
    /* oxlint-disable typescript/no-unsafe-assignment -- expect.objectContaining matchers return any */
    expect(exportFiles).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exportId: 'step',
        handle: expect.objectContaining({ generation: 3 }),
      }),
      expect.any(Object),
      { id: 'volatile-kernel' },
    );
    /* oxlint-enable typescript/no-unsafe-assignment */
  });

  it('should use selected source options for transcoded native construction', async () => {
    const createInputs: NativeBuildInput[] = [];
    const definition = createMockKernelDefinition('transcoded-construction-kernel', {
      evaluateOptionsSchema: z.object({ quality: z.number().default(8) }),
      views: {
        display: {
          title: 'Display',
          mimeType: 'model/gltf-binary',
          optionsSchema: z.object({ quality: z.number().default(8) }),
        },
      },
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({
            quality: z.number(),
            sourceOnly: z.string().optional(),
          }),
        },
      },
      evaluate: async (input: NativeBuildInput) => {
        createInputs.push(input);
        return {
          handle: { label: `quality:${String(input.options?.['quality'])}` },
          views: [] as const,
          exports: ['glb'] as const,
          issues: [] as KernelIssue[],
        };
      },
      export: async (input: TestExportInput) => ({
        files: [exportFile('source.glb', bytesFor(handleLabel(input.handle)), 'model/gltf-binary')] as const,
        issues: [] as KernelIssue[],
      }),
    });
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Source Option Converter',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'usdz',
          fidelity: 'mesh',
          optionsSchema: z.object({ width: z.number() }),
        },
      ],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn().mockResolvedValue({
        success: true,
        data: [exportFile('model.usdz', new Uint8Array([1]), 'model/vnd.usdz+zip')],
        issues: [] as KernelIssue[],
      }),
      onDispose: vi.fn().mockResolvedValue(undefined),
    };
    const transcoder = attachRuntimePluginDefinition({ id: 'source-option-converter' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [
        {
          id: 'transcoded-construction-kernel',
          extensions: ['mock'],
          definition,
        },
      ],
      [transcoder],
    );

    try {
      await openWorkerDocument(worker, 'transcoded-options-doc', 'model.mock');
      const result = await worker.exportDocument({
        documentId: 'transcoded-options-doc',
        operationId: 'transcoded-options-export',
        target: 'usdz',
        options: {
          quality: 64,
          sourceOnly: 'kernel',
          width: 2048,
        },
      });

      expect(result.success).toBe(true);
      expect(createInputs).toHaveLength(2);
      expect(createInputs.at(-1)?.options).toEqual({ quality: 64 });
      expect('operation' in createInputs.at(-1)!).toBe(false);
    } finally {
      await worker.cleanup();
    }
  });

  it.each([
    {
      label: 'valid live',
      scenario: 'live',
      expectedEvents: ['validate', 'export:live-1'],
      expectedCreateCalls: 1,
      expectedRestoreCalls: 0,
    },
    {
      label: 'invalid live with valid snapshot',
      scenario: 'invalid',
      expectedEvents: ['validate', 'restore', 'export:restored'],
      expectedCreateCalls: 1,
      expectedRestoreCalls: 1,
    },
    {
      label: 'failed snapshot',
      scenario: 'failed-snapshot',
      expectedEvents: ['restore', 'create', 'export:live-2'],
      expectedCreateCalls: 2,
      expectedRestoreCalls: 1,
    },
    {
      label: 'no slots',
      scenario: 'none',
      expectedEvents: ['create', 'export:live-2'],
      expectedCreateCalls: 2,
      expectedRestoreCalls: 0,
    },
  ] as const)(
    'uses the sole resolver order for $label',
    async ({ scenario, expectedEvents, expectedCreateCalls, expectedRestoreCalls }) => {
      const events: string[] = [];
      let generation = 0;
      const evaluate = vi.fn(async () => {
        generation++;
        events.push('create');
        return {
          geometry: gltfGeometry('display'),
          handle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      });
      const deserializeHandle = vi.fn(() => {
        events.push('restore');
        if (scenario === 'failed-snapshot') {
          throw new Error('corrupt snapshot');
        }
        return { label: 'restored' };
      });
      const definition = createMockKernelDefinition('resolver-order-kernel', {
        exports: {
          gltf: {
            title: 'GLTF',
            mimeType: 'model/gltf+json',
            extension: 'gltf',
            optionsSchema: z.object({}),
          },
        },
        evaluate,
        export: async (input: TestExportInput) => {
          events.push(`export:${handleLabel(input.handle)}`);
          return {
            files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
            issues: [],
          };
        },
        serializeHandle: ({ handle }) => ({ label: handleLabel(handle) }),
        deserializeHandle,
        isHandleValid: () => {
          events.push('validate');
          return scenario !== 'invalid';
        },
      });
      const worker = await createMultiKernelWorker([{ id: 'resolver-order-kernel', extensions: ['mock'], definition }]);

      try {
        await openWorkerDocument(worker, 'resolver-order-document', 'model.mock');
        const artifact = documentArtifact(worker, 'resolver-order-document');
        if (scenario === 'failed-snapshot') {
          artifact.liveNativeHandleSlot = undefined;
        } else if (scenario === 'none') {
          artifact.liveNativeHandleSlot = undefined;
          artifact.serializedNativeHandleSlot = undefined;
        }
        events.length = 0;
        deserializeHandle.mockClear();

        const exportResult = await worker.exportDocument({
          documentId: 'resolver-order-document',
          operationId: 'resolver-order-export',
          target: 'gltf',
        });
        expect(exportResult.success).toBe(true);
        expect(events).toEqual(expectedEvents);
        expect(evaluate).toHaveBeenCalledTimes(expectedCreateCalls);
        expect(deserializeHandle).toHaveBeenCalledTimes(expectedRestoreCalls);
      } finally {
        await worker.cleanup();
      }
    },
  );

  it('serializes the native handle only when something reads the snapshot', async () => {
    const serializeHandle = vi.fn(({ handle }: { handle: unknown }) => ({
      label: handleLabel(handle),
    }));
    const definition = createMockKernelDefinition('lazy-snapshot-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async () => ({
        geometry: gltfGeometry('display'),
        handle: { label: 'live-1' },
        issues: [] as KernelIssue[],
      }),
      export: async () => ({
        files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
        issues: [],
      }),
      serializeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'lazy-snapshot-kernel', extensions: ['mock'], definition }]);

    try {
      await openWorkerDocument(worker, 'lazy-snapshot-document', 'model.mock');
      // D12: a display render never ships the snapshot, so producing one costs the frame for nothing.
      expect(serializeHandle).not.toHaveBeenCalled();

      const artifact = documentArtifact(worker, 'lazy-snapshot-document');
      expect(artifact.serializedNativeHandleSlot?.serializedNativeHandle).toEqual({ label: 'live-1' });
      expect(serializeHandle).toHaveBeenCalledOnce();
      // Memoised: a second reader of the same slot pays nothing.
      expect(artifact.serializedNativeHandleSlot?.serializedNativeHandle).toEqual({ label: 'live-1' });
      expect(serializeHandle).toHaveBeenCalledOnce();
    } finally {
      await worker.cleanup();
    }
  });

  it('resolves no snapshot once the handle it would read is gone', async () => {
    const serializeHandle = vi.fn(({ handle }: { handle: unknown }) => ({
      label: handleLabel(handle),
    }));
    const definition = createMockKernelDefinition('dangling-snapshot-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async () => ({
        geometry: gltfGeometry('display'),
        handle: { label: 'live-1' },
        issues: [] as KernelIssue[],
      }),
      serializeHandle,
    });
    const worker = await createMultiKernelWorker([
      { id: 'dangling-snapshot-kernel', extensions: ['mock'], definition },
    ]);

    try {
      await openWorkerDocument(worker, 'dangling-snapshot-document', 'model.mock');
      const artifact = documentArtifact(worker, 'dangling-snapshot-document');
      await worker.cleanup();

      /* Deferring the work means the thunk outlives the handle. Serialising a disposed kernel shape
       * is a crash, not a missed optimisation, so a dead handle resolves to nothing and the caller
       * reheats. */
      expect(artifact.serializedNativeHandleSlot?.serializedNativeHandle).toBeUndefined();
      expect(serializeHandle).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });

  it.each(['identityKey', 'kernelId', 'kernelVersion'] as const)(
    'rejects live and serialized slots with a mismatched %s binding',
    async (field) => {
      const evaluate = vi.fn(async () => ({
        geometry: gltfGeometry('display'),
        handle: { label: `live-${evaluate.mock.calls.length + 1}` },
        issues: [] as KernelIssue[],
      }));
      const deserializeHandle = vi.fn(() => ({ label: 'restored' }));
      const isHandleValid = vi.fn(() => true);
      const definition = createMockKernelDefinition('binding-kernel', {
        exports: {
          gltf: {
            title: 'GLTF',
            mimeType: 'model/gltf+json',
            extension: 'gltf',
            optionsSchema: z.object({}),
          },
        },
        evaluate,
        export: async () => ({
          files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
          issues: [],
        }),
        serializeHandle: ({ handle }) => ({ label: handleLabel(handle) }),
        deserializeHandle,
        isHandleValid,
      });
      const worker = await createMultiKernelWorker([{ id: 'binding-kernel', extensions: ['mock'], definition }]);

      try {
        await openWorkerDocument(worker, 'binding-document', 'model.mock');
        const artifact = documentArtifact(worker, 'binding-document');
        expect(artifact.liveNativeHandleSlot).toBeDefined();
        expect(artifact.serializedNativeHandleSlot).toBeDefined();
        if (field === 'identityKey') {
          artifact.liveNativeHandleSlot!.identityKey = 'other-owner';
          artifact.serializedNativeHandleSlot!.identityKey = 'other-owner';
        } else {
          artifact.liveNativeHandleSlot![field] = 'other';
          artifact.serializedNativeHandleSlot![field] = 'other';
        }
        isHandleValid.mockClear();
        deserializeHandle.mockClear();

        const exportResult = await worker.exportDocument({
          documentId: 'binding-document',
          operationId: 'binding-export',
          target: 'gltf',
        });
        expect(exportResult.success).toBe(true);
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(isHandleValid).not.toHaveBeenCalled();
        expect(deserializeHandle).not.toHaveBeenCalled();
      } finally {
        await worker.cleanup();
      }
    },
  );

  it('shares the operation signal across restore, reheat, and export', async () => {
    const createSignals: AbortSignal[] = [];
    const restoreSignals: AbortSignal[] = [];
    const exportSignals: AbortSignal[] = [];
    let generation = 0;
    const definition = createMockKernelDefinition('native-signal-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async (_input, runtime) => {
        createSignals.push(runtime.signal);
        generation++;
        return {
          geometry: gltfGeometry('display'),
          handle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      },
      export: async (_input, runtime) => {
        exportSignals.push(runtime.signal);
        return {
          files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
          issues: [],
        };
      },
      serializeHandle: ({ handle }) => ({ label: handleLabel(handle) }),
      deserializeHandle: ({ serialized }, runtime) => {
        restoreSignals.push(runtime.signal);
        if (serialized === 'corrupt') {
          throw new Error('corrupt snapshot');
        }
        return { label: 'restored' };
      },
    });
    const worker = await createMultiKernelWorker([{ id: 'native-signal-kernel', extensions: ['mock'], definition }]);

    try {
      await openWorkerDocument(worker, 'native-signal-document', 'model.mock');
      const artifact = documentArtifact(worker, 'native-signal-document');
      artifact.liveNativeHandleSlot = undefined;

      const restoredExport = await worker.exportDocument({
        documentId: 'native-signal-document',
        operationId: 'native-signal-restored',
        target: 'gltf',
      });
      expect(restoredExport.success).toBe(true);
      expect(restoreSignals[0]).toBe(exportSignals[0]);

      artifact.liveNativeHandleSlot = undefined;
      artifact.serializedNativeHandleSlot!.serializedNativeHandle = 'corrupt';
      const reheatedExport = await worker.exportDocument({
        documentId: 'native-signal-document',
        operationId: 'native-signal-reheated',
        target: 'gltf',
      });
      expect(reheatedExport.success).toBe(true);
      expect(restoreSignals[1]).toBe(createSignals[1]);
      expect(createSignals[1]).toBe(exportSignals[1]);
      expect(createSignals[1]).not.toBe(createSignals[0]);
    } finally {
      await worker.cleanup();
    }
  });

  it('retains a request evaluation for reuse and disposes it with the published handle at cleanup', async () => {
    let generation = 0;
    const disposedInputs: TestReleaseInput[] = [];
    const releaseHandle = vi.fn((input: TestReleaseInput) => {
      disposedInputs.push(input);
    });
    const definition = createMockKernelDefinition('transient-ownership-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async () => {
        generation++;
        return {
          geometry: gltfGeometry('display'),
          handle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      },
      export: async () => ({
        files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
        issues: [],
      }),
      releaseHandle,
    });
    const worker = await createMultiKernelWorker([
      { id: 'transient-ownership-kernel', extensions: ['mock'], definition },
    ]);

    await openWorkerDocumentWithParameters(worker, {
      documentId: 'published-ownership-document',
      file: 'model.mock',
      parameters: { revision: 1 },
    });
    await openWorkerDocumentWithParameters(worker, {
      documentId: 'request-ownership-document',
      file: 'model.mock',
      parameters: { revision: 2 },
    });
    const exportModelResult = await worker.exportDocument({
      documentId: 'request-ownership-document',
      operationId: 'request-ownership-export',
      target: 'gltf',
    });
    expect(exportModelResult.success).toBe(true);
    expect(releaseHandle).not.toHaveBeenCalled();

    const publishedExport = await worker.exportDocument({
      documentId: 'published-ownership-document',
      operationId: 'published-ownership-export',
      target: 'gltf',
    });
    expect(publishedExport.success).toBe(true);
    expect(releaseHandle).not.toHaveBeenCalled();
    await worker.cleanup();
    expect(releaseHandle).toHaveBeenCalledTimes(2);
    expect(disposedInputs).toEqual(
      expect.arrayContaining([{ handle: { label: 'live-1' } }, { handle: { label: 'live-2' } }]),
    );
  });

  it('owns restored and reheated handles and disposes each exactly once after replacement', async () => {
    let generation = 0;
    const disposedInputs: TestReleaseInput[] = [];
    const releaseHandle = vi.fn((input: TestReleaseInput) => {
      disposedInputs.push(input);
    });
    const deserializeHandle = vi.fn(({ serialized }: TestDeserializeInput) => {
      if (typeof serialized !== 'object' || serialized === null || !('label' in serialized)) {
        throw new Error('corrupt snapshot');
      }
      return { label: `restored:${String(serialized.label)}` };
    });
    const definition = createMockKernelDefinition('restore-ownership-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async () => {
        generation++;
        return {
          geometry: gltfGeometry('display'),
          handle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      },
      export: async () => ({
        files: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')] as const,
        issues: [],
      }),
      serializeHandle: ({ handle }) => ({ label: handleLabel(handle) }),
      deserializeHandle,
      releaseHandle,
    });
    const worker = await createMultiKernelWorker([
      { id: 'restore-ownership-kernel', extensions: ['mock'], definition },
    ]);

    await openWorkerDocument(worker, 'restore-ownership-document', 'model.mock');
    const artifact = documentArtifact(worker, 'restore-ownership-document');
    artifact.liveNativeHandleSlot = undefined;
    const restoredExport = await worker.exportDocument({
      documentId: 'restore-ownership-document',
      operationId: 'restore-ownership-first',
      target: 'gltf',
    });
    expect(restoredExport.success).toBe(true);
    expect(disposedInputs).toEqual([{ handle: { label: 'live-1' } }]);

    artifact.liveNativeHandleSlot = undefined;
    artifact.serializedNativeHandleSlot!.serializedNativeHandle = 'corrupt';
    const reheatedExport = await worker.exportDocument({
      documentId: 'restore-ownership-document',
      operationId: 'restore-ownership-second',
      target: 'gltf',
    });
    expect(reheatedExport.success).toBe(true);
    expect(deserializeHandle).toHaveBeenCalledTimes(2);
    expect(disposedInputs).toEqual([{ handle: { label: 'live-1' } }, { handle: { label: 'restored:live-1' } }]);
    expect(artifact.serializedNativeHandleSlot?.serializedNativeHandle).toEqual({ label: 'live-2' });

    artifact.liveNativeHandleSlot = undefined;
    const restoredReheatedExport = await worker.exportDocument({
      documentId: 'restore-ownership-document',
      operationId: 'restore-ownership-third',
      target: 'gltf',
    });
    expect(restoredReheatedExport.success).toBe(true);
    expect(deserializeHandle).toHaveBeenCalledTimes(3);
    expect(deserializeHandle.mock.calls[2]?.[0]).toMatchObject({
      serialized: { label: 'live-2' },
    });

    await worker.cleanup();
    expect(disposedInputs).toEqual([
      { handle: { label: 'live-1' } },
      { handle: { label: 'restored:live-1' } },
      { handle: { label: 'live-2' } },
      { handle: { label: 'restored:live-2' } },
    ]);
  });
});

// ===================================================================
// Cache identity regressions
// ===================================================================

describe('cache identity regressions', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      'model.mock': 'mock geometry',
      'a.mock': 'alpha',
      'b.mock': 'bravo',
      'b.other': 'other',
    });
  });

  it('rereads changed dependency bytes on each explicit render when the filesystem has no watcher', async () => {
    await seedTestFileSystem({ 'model.mock': 'first' });
    const definition = createMockKernelDefinition('watcherless-kernel', {
      evaluate: async (input, runtime) => {
        const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
        return {
          handle: { label: source },
          issues: [] as KernelIssue[],
        };
      },
      render: async ({ handle }) => ({
        content: bytesFor(handleLabel(handle)),
      }),
    });
    // The store this fixture serves does watch its own mutations (D15), so the watcherless
    // freshness path needs a filesystem served without that channel.
    const worker = new KernelRuntimeWorker({
      runtime: defineRuntime({
        kernels: [attachRuntimePluginDefinition({ id: 'watcherless-kernel', extensions: ['mock'] }, () => definition)],
      }),
    });
    await initializeWorkerForTesting(worker, { watchable: false });

    await openWorkerDocument(worker, 'watcherless-first', 'model.mock');
    const first = await requestWorkerView(worker, {
      documentId: 'watcherless-first',
      subscriptionId: 'watcherless-first-view',
    });
    await getTestFileSystem().writeFile('model.mock', 'second');
    await openWorkerDocument(worker, 'watcherless-second', 'model.mock');
    const second = await requestWorkerView(worker, {
      documentId: 'watcherless-second',
      subscriptionId: 'watcherless-second-view',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      return;
    }
    expect(first).toMatchObject({ artifact: { content: bytesFor('first') } });
    expect(second).toMatchObject({ artifact: { content: bytesFor('second') } });
    expect(second.hash).not.toBe(first.hash);
    expect(getInitSpy(definition)).toHaveBeenCalledOnce();
  });

  it('recomputes base dependencies for documents opened on different files', async () => {
    const definition = createMockKernelDefinition('dependency-kernel', {
      evaluate: async (input: EvaluateInput<undefined>, runtime: KernelRuntime) => {
        const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
        return {
          geometry: gltfGeometry(source),
          handle: { label: source },
          issues: [] as KernelIssue[],
        };
      },
    });
    const worker = await createMultiKernelWorker([{ id: 'dependency-kernel', extensions: ['mock'], definition }]);

    await openWorkerDocument(worker, 'dependency-a-document', 'a.mock');
    await openWorkerDocument(worker, 'dependency-b-document', 'b.mock');
    expect(documentArtifact(worker, 'dependency-a-document').identity.dependencyHash).not.toBe(
      documentArtifact(worker, 'dependency-b-document').identity.dependencyHash,
    );
  });

  it('keeps another document export from retargeting the first document', async () => {
    const evaluate = vi.fn(async (input) => {
      const label = String(input.parameters['label']);
      return {
        geometry: gltfGeometry(label),
        handle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const exportFiles = vi.fn(async (input: TestExportInput) => {
      const label = handleLabel(input.handle);
      return {
        files: [exportFile('model.gltf', bytesFor(label), 'model/gltf+json')] as const,
        issues: [] as KernelIssue[],
      };
    });
    const definition = createMockKernelDefinition('request-scope-kernel', {
      exports: {
        gltf: {
          title: 'GLTF',
          mimeType: 'model/gltf+json',
          extension: 'gltf',
          optionsSchema: z.object({}),
        },
      },
      evaluate,
      export: exportFiles,
    });
    const worker = await createMultiKernelWorker([{ id: 'request-scope-kernel', extensions: ['mock'], definition }]);

    await openWorkerDocumentWithParameters(worker, {
      documentId: 'preview-document',
      file: 'model.mock',
      parameters: { label: 'preview' },
    });
    const previewArtifact = documentArtifact(worker, 'preview-document');
    await openWorkerDocumentWithParameters(worker, {
      documentId: 'request-document',
      file: 'model.mock',
      parameters: { label: 'request-scoped' },
    });
    const requestScoped = await worker.exportDocument({
      documentId: 'request-document',
      operationId: 'request-export',
      target: 'gltf',
    });
    expect(requestScoped.success).toBe(true);
    expect(documentArtifact(worker, 'preview-document')).toBe(previewArtifact);

    const currentStateExport = await worker.exportDocument({
      documentId: 'preview-document',
      operationId: 'preview-export',
      target: 'gltf',
    });

    expect(currentStateExport.success).toBe(true);
    if (!currentStateExport.success) {
      return;
    }
    expect(textFrom(currentStateExport.files[0].bytes)).toBe('preview');
  });

  it('selects each document file kernel independently for exports', async () => {
    const sourceDefinition = createMockKernelDefinition('source-kernel', {
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async (input) => {
        const label = `source:${String(input.parameters['label'])}`;
        return {
          geometry: gltfGeometry(label),
          handle: { label },
          issues: [] as KernelIssue[],
        };
      },
      export: async (input: TestExportInput) => ({
        files: [exportFile('source.glb', bytesFor(handleLabel(input.handle)), 'model/gltf-binary')] as const,
        issues: [] as KernelIssue[],
      }),
    });
    const otherCreateGeometry = vi.fn(async (input) => {
      const label = `other:${String(input.parameters['label'])}`;
      return {
        geometry: gltfGeometry(label),
        handle: { label },
        issues: [] as KernelIssue[],
      };
    });
    const otherExportGeometry = vi.fn(async (input: TestExportInput) => ({
      files: [exportFile('other.glb', bytesFor(handleLabel(input.handle)), 'model/gltf-binary')] as const,
      issues: [] as KernelIssue[],
    }));
    const otherDefinition = createMockKernelDefinition('other-kernel', {
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({}),
        },
      },
      evaluate: otherCreateGeometry,
      export: otherExportGeometry,
    });
    const worker = await createMultiKernelWorker([
      {
        id: 'source-kernel',
        extensions: ['mock'],
        definition: sourceDefinition,
      },
      {
        id: 'other-kernel',
        extensions: ['other'],
        definition: otherDefinition,
      },
    ]);

    await openWorkerDocumentWithParameters(worker, {
      documentId: 'source-kernel-document',
      file: 'model.mock',
      parameters: { label: 'preview' },
    });
    await openWorkerDocumentWithParameters(worker, {
      documentId: 'other-kernel-document',
      file: 'b.other',
      parameters: { label: 'request' },
    });
    const exportResult = await worker.exportDocument({
      documentId: 'other-kernel-document',
      operationId: 'other-kernel-export',
      target: 'glb',
    });

    if (!exportResult.success) {
      throw new Error(
        `Expected request-scoped export to use b.other's kernel, got: ${exportResult.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }
    const exportedText = textFrom(exportResult.files[0].bytes);
    if (exportedText !== 'other:request') {
      throw new Error(`Expected request-scoped exportModel to emit other:request, got: ${exportedText}`);
    }
    expect(otherCreateGeometry).toHaveBeenCalledOnce();
    expect(otherExportGeometry).toHaveBeenCalledWith(
      expect.objectContaining({
        exportId: 'glb',
        handle: { label: 'other:request' },
      }),
      expect.any(Object),
      { id: 'other-kernel' },
    );
  });

  it('evaluates and exports request documents without retargeting a concurrent live document', async () => {
    await seedTestFileSystem({
      'preview.view': 'preview',
      'export.source': 'export',
    });
    const render = vi.fn(async (input) => ({
      content: bytesFor(`mesh:${handleLabel(input.handle)}`),
      issues: [] as KernelIssue[],
    }));
    const evaluationKernel = createMockKernelDefinition('evaluation-kernel', {
      evaluate: async (input, runtime) => {
        const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
        return { handle: { label: source }, issues: [] as KernelIssue[] };
      },
      render,
    });
    const previewKernel = createMockKernelDefinition('preview-kernel', {
      evaluate: async (input) => ({
        geometry: gltfGeometry(String(input.parameters['label'])),
        handle: { label: String(input.parameters['label']) },
        issues: [] as KernelIssue[],
      }),
    });
    const exportKernel = createMockKernelDefinition('export-kernel', {
      exports: {
        glb: {
          title: 'GLB',
          mimeType: 'model/gltf-binary',
          extension: 'glb',
          optionsSchema: z.object({}),
        },
      },
      evaluate: async () => ({
        handle: { label: 'export-b' },
        issues: [] as KernelIssue[],
      }),
      export: async (input: TestExportInput) => ({
        files: [exportFile('export.glb', bytesFor(handleLabel(input.handle)), 'model/gltf-binary')] as const,
        issues: [],
      }),
    });
    const worker = await createMultiKernelWorker([
      { id: 'preview-kernel', extensions: ['view'], definition: previewKernel },
      {
        id: 'evaluation-kernel',
        extensions: ['eval'],
        definition: evaluationKernel,
      },
      { id: 'export-kernel', extensions: ['source'], definition: exportKernel },
    ]);
    const evaluations: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    const renderings: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    const progressDocuments: string[] = [];
    worker.onEvaluated = (event) => evaluations.push(event);
    worker.onRendered = (event) => renderings.push(event);
    worker.onDocumentProgressUpdate = ({ documentId }) => progressDocuments.push(documentId);

    try {
      worker.handleOpenDocument({
        documentId: 'live-document',
        intent: 1,
        file: createGeometryFile('preview.view'),
        parameters: { label: 'preview-c' },
        watch: true,
      });
      await vi.waitFor(() => {
        expect(evaluations.some((event) => event.documentId === 'live-document')).toBe(true);
      });
      worker.handleOpenView({
        documentId: 'live-document',
        subscriptionId: 'live-view',
        requestId: 'live-view-first',
        view: 'display',
      });
      await vi.waitFor(() => {
        expect(renderings.some((event) => event.requestId === 'live-view-first')).toBe(true);
      });
      evaluations.length = 0;
      renderings.length = 0;
      progressDocuments.length = 0;

      worker.handleOpenDocument({
        documentId: 'request-evaluation-document',
        intent: 1,
        stage: { 'nested/request.eval': bytesFor('evaluation-a') },
        file: createGeometryFile('nested/request.eval'),
        parameters: {},
        watch: false,
      });
      worker.handleOpenDocument({
        documentId: 'request-export-document',
        intent: 1,
        file: createGeometryFile('export.source'),
        parameters: {},
        watch: false,
      });
      worker.handleUpdateDocument({
        documentId: 'live-document',
        intent: 2,
        parameters: { label: 'preview-d' },
      });
      await vi.waitFor(() => {
        expect(evaluations.map((event) => event.documentId)).toEqual([
          'request-evaluation-document',
          'request-export-document',
          'live-document',
        ]);
      });
      await vi.waitFor(() => {
        expect(renderings.some((event) => event.requestId === 'live-view-first')).toBe(true);
      });
      worker.handleOpenView({
        documentId: 'request-evaluation-document',
        subscriptionId: 'request-evaluation-view',
        requestId: 'request-evaluation-render',
        view: 'display',
      });
      await vi.waitFor(() => {
        expect(renderings.some((event) => event.requestId === 'request-evaluation-render')).toBe(true);
      });
      const evaluationResult = renderings.find((event) => event.requestId === 'request-evaluation-render');
      expect(evaluationResult?.success).toBe(true);
      if (evaluationResult?.success) {
        expect(textFrom(evaluationResult.artifact.content as Uint8Array<ArrayBuffer>)).toBe('mesh:evaluation-a');
      }
      expect(render).toHaveBeenCalledOnce();
      const exportResult = await worker.exportDocument({
        documentId: 'request-export-document',
        operationId: 'request-export-operation',
        target: 'glb',
      });
      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(textFrom(exportResult.files[0].bytes)).toBe('export-b');
      }
      expect(textFrom(await getTestFileSystem().readFile('nested/request.eval'))).toBe('evaluation-a');
      expect(renderings.filter((event) => event.subscriptionId === 'live-view')).toHaveLength(1);
      expect(evaluations.filter((event) => event.documentId === 'live-document')).toHaveLength(1);
      expect(progressDocuments).toContain('live-document');

      const current = await worker.exportDocument({
        documentId: 'live-document',
        operationId: 'live-export-operation',
        target: 'gltf',
      });
      expect(current.success).toBe(false);
      const published = documentArtifact(worker, 'live-document');
      expect(published.identity.parameters).toEqual({ label: 'preview-d' });
    } finally {
      await worker.cleanup();
    }
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
    server: ReturnType<typeof createDocumentWorkerDispatcher>;
    client: ReturnType<typeof createChannelClient<RuntimeDocumentProtocol>>;
    channel: MessageChannel;
    closeReasons: Array<string | undefined>;
  }> {
    const channel = new MessageChannel();
    const serverPort = wrapMessagePort<unknown>(channel.port1, {
      label: 'server',
    });
    const clientPort = wrapMessagePort<unknown>(channel.port2, {
      label: 'client',
    });
    serverPort.start?.();
    clientPort.start?.();

    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({}) });
    const server = createDocumentWorkerDispatcher(worker, serverPort);
    const client = createChannelClient<RuntimeDocumentProtocol>({
      port: clientPort,
      sessionKey: runtimeChannelSessionKey,
      protocolSchemas: runtimeDocumentProtocolSchemas,
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
  function captureAndInstall(
    server: ReturnType<typeof createDocumentWorkerDispatcher>,
    options?: { readonly exit?: (code: number) => void },
  ): {
    readonly dispose: () => void;
    readonly fireUncaught: (error: Error) => void;
    readonly fireUnhandled: (reason: unknown) => void;
  } {
    const captured = new Map<string, (...args: unknown[]) => void>();
    const onSpy = vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      captured.set(String(event), listener as (...args: unknown[]) => void);
      return process;
    });

    const dispose = installWorkerCrashTrap(server, options);
    onSpy.mockRestore();

    return {
      dispose,
      fireUncaught: (error) => captured.get('uncaughtException')?.(error),
      fireUnhandled: (reason) => captured.get('unhandledRejection')?.(reason),
    };
  }

  it('closes the channel with `lb` and ends the process when an `uncaughtException` fires', async () => {
    const fixture = await buildBootstrapFixture();
    const disposeSpy = vi.spyOn(fixture.server, 'dispose');
    const exit = vi.fn<(code: number) => void>();
    const trap = captureAndInstall(fixture.server, { exit });
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
    /* The exit waits for the server's own close to finalize, which the
     * client's observation only approximates. */
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  it('leaves the channel open when an `unhandledRejection` fires', async () => {
    const fixture = await buildBootstrapFixture();
    const disposeSpy = vi.spyOn(fixture.server, 'dispose');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const exit = vi.fn<(code: number) => void>();
    const trap = captureAndInstall(fixture.server, { exit });
    teardown = (): void => {
      trap.dispose();
      stderrSpy.mockRestore();
      fixture.server.dispose('test-cleanup');
      fixture.client.close('test-cleanup');
      fixture.channel.port1.close();
      fixture.channel.port2.close();
    };

    trap.fireUnhandled(new Error('async worker boom'));

    expect(disposeSpy).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('[tau-runtime] unhandled rejection: async worker boom'),
    );
    /* The session survives: the next call still round-trips. */
    await expect(fixture.client.call('dispose', null)).resolves.toBeNull();
    expect(fixture.closeReasons).toEqual([]);
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
