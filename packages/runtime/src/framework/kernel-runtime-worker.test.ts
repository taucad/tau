/* eslint-disable @typescript-eslint/naming-convention -- filesystem fixture keys are canonical absolute paths */
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
  DisposeNativeHandleInput,
  ExportGeometryInput,
  GetDependenciesInput,
  KernelDefinition,
  KernelRuntime,
} from '#types/runtime-kernel.types.js';
import type { TranscodeInput, TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import type { CapabilitiesManifest, ExportGeometryResult, KernelIssue } from '#types/runtime.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  seedTestFileSystem,
  initializeWorkerForTesting,
  createGeometryFile,
  getTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import type { WrapCreateGeometryHook, WrapMeshGeometryHook } from '#types/runtime-middleware.types.js';
import { nativeBuildInputSymbol } from '#framework/render-artifact.js';
import type { MaterializedRender, NativeBuildInput } from '#framework/render-artifact.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';

const replicadDetectPattern = /import.*from\s+["']replicad["']/s;

// ===================================================================
// Helpers
// ===================================================================

type TestTranscoderPlugin = TranscoderPlugin & RuntimePluginDefinitionCarrier<TranscoderDefinition>;

function createMockKernelDefinition(id: string, overrides?: Partial<KernelDefinition>): KernelDefinition {
  const initSpy = vi.fn().mockResolvedValue({ id });
  const definition = {
    name: id,
    version: '1.0.0',
    exportFormats: {},
    initialize: initSpy,
    getDependencies: async (input: GetDependenciesInput) => ({ resolved: [input.entryPath], unresolved: [] }),
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

describe('KernelRuntimeWorker initialization', () => {
  it('rejects repeated initialization without clearing runtime state', async () => {
    const worker = await createMultiKernelWorker([]);
    try {
      await expect(initializeWorkerForTesting(worker)).rejects.toBeInstanceOf(RuntimeAlreadyInitializedError);
    } finally {
      await worker.cleanup();
    }
  });

  it('surfaces plugin permissions in capability registrations', async () => {
    const permissions = { network: ['https://plugins.example.test'], filesystemWrite: true } as const;
    const metadata = { permissions } as const;
    const kernel = defineKernel({
      id: 'metadata-kernel',
      extensions: ['meta'],
      ...metadata,
      name: 'Metadata kernel',
      version: '1.0.0',
      exportFormats: {},
      async initialize() {
        return {};
      },
      async getDependencies(input) {
        return { resolved: [input.entryPath], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: gltfGeometry('metadata'), nativeHandle: {} };
      },
      async exportGeometry() {
        return { success: true, data: [], issues: [] };
      },
    })();
    const middleware = defineMiddleware({ id: 'metadata-middleware', ...metadata, name: 'Metadata middleware' })();
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
        return { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };
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
    await seedTestFileSystem({ '/model.meta': 'metadata' });
    const runtime = defineRuntime({
      kernels: [kernel],
      middleware: [middleware],
      bundlers: [bundler],
      transcoders: [transcoder],
    });
    const worker = new KernelRuntimeWorker({ runtime });
    await initializeWorkerForTesting(worker);
    await worker.createGeometry({ file: createGeometryFile('model.meta'), parameters: {} });

    expect(worker.capabilitiesManifest.registrations).toEqual([
      { kind: 'kernel', id: 'metadata-kernel', extensions: ['meta'], ...metadata },
      { kind: 'middleware', id: 'metadata-middleware', ...metadata },
      { kind: 'bundler', id: 'metadata-bundler', ...metadata },
      { kind: 'transcoder', id: 'metadata-transcoder', ...metadata },
    ]);

    await worker.cleanup();
  });
});

// ===================================================================
// Tests
// ===================================================================

describe('KernelRuntimeWorker middleware identity', () => {
  it('keeps hooks, options, and loggers independent when display names match', async () => {
    await seedTestFileSystem({ '/model.mock': 'mock geometry' });

    const observations: Array<{ id: string; marker: string; logger: KernelRuntime['logger'] }> = [];
    const createMiddleware = (id: 'first' | 'second') =>
      defineMiddleware({
        id,
        name: 'Shared display name',
        optionsSchema: z.object({ marker: z.string() }),
        async wrapCreateGeometry(input, handler, runtime) {
          observations.push({ id, marker: runtime.options.marker, logger: runtime.logger });
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

    const result = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });

    expect(result.success).toBe(true);
    expect(observations.map(({ id, marker }) => ({ id, marker }))).toEqual([
      { id: 'first', marker: 'alpha' },
      { id: 'second', marker: 'beta' },
    ]);
    expect(observations[0]!.logger).not.toBe(observations[1]!.logger);
  });
});

describe('provider content projection', () => {
  it('omits content from every content-empty provider input', async () => {
    await seedTestFileSystem({ '/model.mock': 'mock geometry' });
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
      exportFormats: { glb: { optionsSchema: z.object({}) } },
      async createGeometry(input) {
        seen.kernelCreate.push(Object.hasOwn(input, 'content'));
        expect(Object.hasOwn(input, 'options')).toBe(false);
        return { nativeHandle: { label: 'native' }, issues: [] };
      },
      async meshGeometry(input) {
        seen.kernelMesh.push(Object.hasOwn(input, 'content'));
        return { geometry: gltfGeometry('display') };
      },
      async exportGeometry(input) {
        seen.kernelExport.push(Object.hasOwn(input, 'content'));
        return {
          success: true,
          data: [exportFile('model.glb', bytesFor('source'), 'model/gltf-binary')],
          issues: [],
        };
      },
    });
    const middleware = defineMiddleware({
      id: 'content-empty-provider-middleware',
      name: 'Content-empty provider middleware',
      async wrapCreateGeometry(input, handler) {
        seen.middlewareCreate.push(Object.hasOwn(input, 'content'));
        return handler(input);
      },
      async wrapMeshGeometry(input, handler) {
        seen.middlewareMesh.push(Object.hasOwn(input, 'content'));
        return handler(input);
      },
      async wrapExportGeometry(input, handler) {
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
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    const transcoder = attachRuntimePluginDefinition({ id: 'content-empty-transcoder' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [{ id: 'content-empty-provider-kernel', extensions: ['mock'], definition }],
      [transcoder],
      [middleware],
    );

    try {
      const createResult = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
      expect(createResult.success).toBe(true);
      const artifact = (worker as unknown as { currentPublishedRender?: MaterializedRender }).currentPublishedRender;
      expect(artifact).toBeDefined();
      expect(Object.hasOwn(artifact!.result, nativeBuildInputSymbol)).toBe(false);
      const glbResult = await worker.exportGeometry('glb');
      const usdzResult = await worker.exportGeometry('usdz');
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
    await seedTestFileSystem({ '/model.mock': 'mock geometry' });
    const observations: Array<{ hook: string; content: unknown; marker: unknown }> = [];
    const kernelCreateInputs: Array<Record<string, unknown>> = [];
    const kernelExportInputs: Array<Record<string, unknown>> = [];
    const definition = createMockKernelDefinition('projected-provider-kernel', {
      exportFormats: { glb: { optionsSchema: z.object({}) } },
      async createGeometry(input) {
        kernelCreateInputs.push(input);
        return { geometry: gltfGeometry('display'), nativeHandle: { label: 'native' }, issues: [] };
      },
      async exportGeometry(input) {
        kernelExportInputs.push(input);
        return {
          success: true,
          data: [exportFile('model.glb', bytesFor('direct'), 'model/gltf-binary')],
          issues: [],
        };
      },
    });
    const edges = defineMiddleware({
      id: 'projected-edges',
      name: 'Projected edges',
      content: { render: ['includeEdges'], exportFormats: { glb: ['includeEdges'] } },
      async wrapCreateGeometry(input, handler) {
        observations.push({ hook: 'edges-create', content: input.content, marker: input.parameters['marker'] });
        return handler({
          ...input,
          parameters: { ...input.parameters, marker: 'from-edges' },
          // Deliberately type-erased: downstream must ignore this replacement.
          content: { includeTopology: false },
        } as unknown as typeof input);
      },
      async wrapExportGeometry(input, handler) {
        observations.push({ hook: 'edges-export', content: input.content, marker: input.options['marker'] });
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
      content: { render: ['includeTopology'], exportFormats: { glb: ['includeTopology'] } },
      async wrapCreateGeometry(input, handler) {
        observations.push({ hook: 'topology-create', content: input.content, marker: input.parameters['marker'] });
        return handler(input);
      },
      async wrapExportGeometry(input, handler) {
        observations.push({ hook: 'topology-export', content: input.content, marker: input.options['marker'] });
        return handler(input);
      },
    })();
    const worker = await createMultiKernelWorker(
      [{ id: 'projected-provider-kernel', extensions: ['mock'], definition }],
      [],
      [edges, topology],
    );

    try {
      const createResult = await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: {},
        content: { includeEdges: true, includeTopology: true },
      });
      const exportResult = await worker.exportGeometry('glb', {}, { includeEdges: true, includeTopology: true });
      expect(createResult.success).toBe(true);
      expect(exportResult.success).toBe(true);

      expect(observations).toEqual([
        { hook: 'edges-create', content: { includeEdges: true }, marker: undefined },
        { hook: 'topology-create', content: { includeTopology: true }, marker: 'from-edges' },
        { hook: 'edges-export', content: { includeEdges: true }, marker: undefined },
        { hook: 'topology-export', content: { includeTopology: true }, marker: 'from-edges' },
      ]);
      expect(Object.hasOwn(kernelCreateInputs[0]!, 'content')).toBe(false);
      expect(kernelCreateInputs[0]?.['parameters']).toEqual({ marker: 'from-edges' });
      expect(Object.hasOwn(kernelExportInputs[0]!, 'content')).toBe(false);
      expect(kernelExportInputs[0]?.['options']).toEqual({ marker: 'from-edges' });
    } finally {
      await worker.cleanup();
    }
  });

  it('publishes exact provider unions and source/transcoder intersections without duplicates', async () => {
    await seedTestFileSystem({ '/model.mock': 'mock geometry' });
    const definition = createMockKernelDefinition('content-algebra-kernel', {
      render: { content: ['includeEdges'] },
      exportFormats: {
        glb: { optionsSchema: z.object({}), content: ['includeEdges'] },
        step: { optionsSchema: z.object({}) },
      },
      createGeometry: async () => ({ nativeHandle: { label: 'native' }, issues: [] }),
      meshGeometry: async () => ({ geometry: gltfGeometry('display') }),
    });
    const duplicateEdges = defineMiddleware({
      id: 'duplicate-edges',
      name: 'Duplicate edges',
      content: { render: ['includeEdges'], exportFormats: { glb: ['includeEdges'] } },
      wrapMeshGeometry: async (input, handler) => handler(input),
    })();
    const topology = defineMiddleware({
      id: 'topology-provider',
      name: 'Topology provider',
      content: { render: ['includeTopology'], exportFormats: { glb: ['includeTopology'] } },
      wrapMeshGeometry: async (input, handler) => handler(input),
    })();
    const transcoderDefinition: TranscoderDefinition = {
      name: 'Content intersection transcoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'webp', fidelity: 'mesh', content: ['includeEdges'] }],
      initialize: vi.fn().mockResolvedValue({}),
      transcode: vi.fn(),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    const transcoder = attachRuntimePluginDefinition({ id: 'content-intersection' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [{ id: 'content-algebra-kernel', extensions: ['mock'], definition }],
      [transcoder],
      [duplicateEdges, topology],
    );

    try {
      const createResult = await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: {},
        content: { includeEdges: true, includeTopology: true },
      });
      expect(createResult.success).toBe(true);
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
    await seedTestFileSystem({ '/model.mock': 'mock geometry' });
    const createGeometry = vi.fn(async () => ({ nativeHandle: { label: 'native' }, issues: [] }));
    const meshGeometry = vi.fn(async () => ({ geometry: gltfGeometry('display') }));
    const passThroughMesh: WrapMeshGeometryHook = async (input, handler) => handler(input);
    const fallback = vi.fn(passThroughMesh);
    const definition = createMockKernelDefinition('native-content-kernel', {
      render: { content: ['includeEdges'] },
      createGeometry,
      meshGeometry,
    });
    const fallbackMiddleware = defineMiddleware({
      id: 'fallback-edges',
      name: 'Fallback edges',
      content: { render: ['includeEdges'] },
      wrapMeshGeometry: fallback,
    })();
    const worker = await createMultiKernelWorker(
      [{ id: 'native-content-kernel', extensions: ['mock'], definition }],
      [],
      [fallbackMiddleware],
    );

    try {
      const createResult = await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: {},
        content: { includeEdges: true },
      });
      expect(createResult.success).toBe(true);
      expect(fallback).not.toHaveBeenCalled();
      expect(meshGeometry).toHaveBeenCalledWith(
        expect.objectContaining({ content: { includeEdges: true } }),
        expect.any(Object),
        expect.any(Object),
      );

      const calls = { create: createGeometry.mock.calls.length, mesh: meshGeometry.mock.calls.length };
      const unsupported = await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: {},
        content: { includeTopology: true },
      } as Parameters<typeof worker.createGeometry>[0]);
      expect(unsupported.success).toBe(false);
      expect(unsupported.issues[0]?.code).toBe('RUNTIME_CONTENT_UNSUPPORTED');
      expect(createGeometry).toHaveBeenCalledTimes(calls.create);
      expect(meshGeometry).toHaveBeenCalledTimes(calls.mesh);
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });
});

describe('create-options projection', () => {
  beforeEach(async () => {
    await seedTestFileSystem({ '/model.mock': 'mock geometry' });
  });

  it('canonicalizes omitted defaults and object insertion order into one native key', async () => {
    const createInputs: NativeBuildInput[] = [];
    const definition = createMockKernelDefinition('canonical-create-options', {
      createOptionsSchema: z.object({ quality: z.number().default(8) }),
      render: { optionsSchema: z.object({ quality: z.number().default(8) }) },
      createGeometry: async (input: NativeBuildInput) => {
        createInputs.push(input);
        return { geometry: gltfGeometry('display'), nativeHandle: { label: 'native' }, issues: [] };
      },
    });
    const worker = await createMultiKernelWorker([
      { id: 'canonical-create-options', extensions: ['mock'], definition },
    ]);

    try {
      await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: { a: 1, nested: { x: 2, y: 3 } },
      });
      const first = (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;
      await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: { nested: { y: 3, x: 2 }, a: 1 },
        options: { quality: 8 },
      });
      const second = (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;

      expect(createInputs.map(({ options }) => options)).toEqual([{ quality: 8 }, { quality: 8 }]);
      expect(second.identity.nativeHandleKey).toBe(first.identity.nativeHandleKey);
    } finally {
      await worker.cleanup();
    }
  });

  it('deep-merges selected source values over render values and replaces arrays', async () => {
    const createInputs: NativeBuildInput[] = [];
    const definition = createMockKernelDefinition('merged-create-options', {
      createOptionsSchema: z.object({
        nested: z.object({ a: z.number(), b: z.number() }),
        layers: z.array(z.number()),
      }),
      render: {
        optionsSchema: z.object({
          nested: z.object({ a: z.number() }),
          layers: z.array(z.number()),
          renderOnly: z.string(),
        }),
      },
      exportFormats: {
        gltf: {
          optionsSchema: z.object({
            nested: z.object({ b: z.number() }),
            layers: z.array(z.number()),
            sourceOnly: z.string(),
          }),
        },
      },
      createGeometry: async (input: NativeBuildInput) => {
        createInputs.push(input);
        return { nativeHandle: { label: 'native' }, issues: [] };
      },
      exportGeometry: async () => ({
        success: true,
        data: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')],
        issues: [],
      }),
    });
    const worker = await createMultiKernelWorker([{ id: 'merged-create-options', extensions: ['mock'], definition }]);

    try {
      const result = await worker.exportModel({
        format: 'gltf',
        file: createGeometryFile('model.mock'),
        parameters: {},
        options: { nested: { a: 1 }, layers: [1, 2], renderOnly: 'display' },
        exportOptions: { nested: { b: 2 }, layers: [9], sourceOnly: 'source' },
      });

      expect(result.success).toBe(true);
      expect(createInputs).toEqual([
        {
          entryPath: '/model.mock',
          parameters: {},
          options: { nested: { a: 1, b: 2 }, layers: [9] },
        },
      ]);
    } finally {
      await worker.cleanup();
    }
  });

  it('returns a typed issue before middleware or kernel work when create options fail', async () => {
    const createGeometry = vi.fn();
    const passThroughCreate: WrapCreateGeometryHook = async (input, handler) => handler(input);
    const wrapCreateGeometry = vi.fn(passThroughCreate);
    const definition = createMockKernelDefinition('invalid-create-options', {
      createOptionsSchema: z.object({ quality: z.number().positive() }),
      render: { optionsSchema: z.object({ quality: z.unknown() }) },
      createGeometry,
    });
    const middleware = defineMiddleware({
      id: 'must-not-run',
      name: 'Must not run',
      wrapCreateGeometry,
    })();
    const worker = await createMultiKernelWorker(
      [{ id: 'invalid-create-options', extensions: ['mock'], definition }],
      [],
      [middleware],
    );

    try {
      const result = await worker.createGeometry({
        file: createGeometryFile('model.mock'),
        parameters: {},
        options: { quality: 'invalid' },
      });

      expect(result.success).toBe(false);
      expect(result.issues[0]).toMatchObject({ code: 'RUNTIME', severity: 'error' });
      expect(result.issues[0]?.message).toContain('Create option validation failed');
      expect(wrapCreateGeometry).not.toHaveBeenCalled();
      expect(createGeometry).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });
});

describe('KernelRuntimeWorker kernel selection', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      '/model.scad': 'cube([10, 10, 10]);',
      '/main.ts': `import { draw } from 'replicad';\ndraw();`,
      '/plain.ts': 'export const main = () => ({ type: "mesh" });',
      '/data.xyz': 'some unknown format',
      '/model.step': 'ISO-10303-21;',
    });
  });

  describe('extension fast path', () => {
    it('should select a kernel by extension when no detectImport is needed', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('model.scad'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
    });

    it('should emit a namespaced event from the selected kernel runtime', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad', {
        createGeometry: async (_input, runtime) => {
          runtime.emitEvent('solverProgress', { iteration: 1 });
          return { nativeHandle: {}, geometry: gltfGeometryBytes(new Uint8Array([1])), issues: [] };
        },
      });
      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);
      const onKernelEvent = vi.fn();
      worker.onKernelEvent = onKernelEvent;

      try {
        await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
        expect(onKernelEvent).toHaveBeenCalledWith({
          kernelId: 'openrscad',
          type: 'solverProgress',
          payload: { iteration: 1 },
        });
      } finally {
        await worker.cleanup();
      }
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
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('model.step'),
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(getInitSpy(catchAllDefinition)).toHaveBeenCalledOnce();
    });

    it('should accept any extension via catch-all wildcard', async () => {
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('data.xyz'),
        parameters: {},
      });

      expect(result.success).toBe(true);
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
      const scadDefinition = createMockKernelDefinition('openrscad');
      const catchAllDefinition = createMockKernelDefinition('fallback');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
        { id: 'fallback', extensions: ['*'], definition: catchAllDefinition },
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
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });

      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();
    });
  });

  describe('file change invalidation', () => {
    it('should clear selection cache after notifyFileChanged', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
      ]);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
      expect(getInitSpy(scadDefinition)).toHaveBeenCalledOnce();

      await worker.notifyFileChanged(['/model.scad']);

      await worker.createGeometry({ file: createGeometryFile('model.scad'), parameters: {} });
    });

    it('should clear selection cache when a watch event fires (not just notifyFileChanged)', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
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

      // @ts-expect-error - exercising the private observation handoff seam
      void worker.reconcileWatchSet(new Map([['/model.scad', 50]]));
      await vi.waitFor(() => {
        expect(capturedWatchCallback).toBeDefined();
      });

      capturedWatchCallback!({ type: 'change', path: '/model.scad' });

      await vi.waitFor(() => {
        // @ts-expect-error - accessing private for test verification
        expect(worker.selectionCache.size).toBe(0);
      });
    });
  });

  describe('no kernel matches', () => {
    it('should fail when no kernel matches an unrecognized extension', async () => {
      const scadDefinition = createMockKernelDefinition('openrscad');

      const worker = await createMultiKernelWorker([
        { id: 'openrscad', extensions: ['scad'], definition: scadDefinition },
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

    it('should name the unhandled extension and the registered ones', async () => {
      await seedTestFileSystem({ '/a.scad': 'cube([1,1,1]);' });
      const worker = await createMultiKernelWorker([
        { id: 'replicad', extensions: ['ts', 'js'], definition: createMockKernelDefinition('replicad') },
      ]);

      const result = await worker.createGeometry({
        file: createGeometryFile('a.scad'),
        parameters: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toBe(
          'No kernel handles ".scad". Registered kernels handle: ts, js. Install a plugin that declares this extension and add it to the runtime definition.',
        );
      }
    });

    it('should carry the unhandled-extension detail into the export-route diagnostic', async () => {
      await seedTestFileSystem({ '/a.scad': 'cube([1,1,1]);' });
      const worker = await createMultiKernelWorker([
        { id: 'replicad', extensions: ['ts', 'js'], definition: createMockKernelDefinition('replicad') },
      ]);

      const result = await worker.exportModel({
        file: createGeometryFile('a.scad'),
        format: 'glb',
        parameters: {},
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
      '/model.scad': 'cube([1,1,1]);',
    });
  });

  it('should rebuild capabilities manifest after loading a kernel module', async () => {
    const definition = createMockKernelDefinition('openrscad', {
      exportFormats: {
        stl: { optionsSchema: z.object({ binary: z.boolean().default(true) }) },
      },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

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
    const definition = createMockKernelDefinition('openrscad', {
      exportFormats: { stl: { optionsSchema: stlSchema } },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    // Trigger lazy kernel load
    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    const stlExport = manifest.routes.find(
      (route) => route.kernelId === 'openrscad' && route.targetFormat === 'stl' && !route.transcoderId,
    );
    expect(stlExport).toBeDefined();
    expect(stlExport!.exportOptions.schema).toHaveProperty('properties');
    expect((stlExport!.exportOptions.schema as { properties: Record<string, unknown> }).properties).toHaveProperty(
      'binary',
    );
    expect(stlExport!.exportOptions.defaults).toEqual({ binary: true });
  });

  it('should include render option schema in manifest after lazy load', async () => {
    const renderSchema = z.object({
      quality: z.enum(['low', 'high']).default('high'),
    });
    const definition = createMockKernelDefinition('openrscad', {
      render: { optionsSchema: renderSchema },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    // Trigger lazy kernel load
    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    const renderOption = manifest.renderCapabilities['openrscad'];
    expect(renderOption).toBeDefined();
    expect(renderOption!.renderOptions.schema).toHaveProperty('properties');
    expect(renderOption!.renderOptions.defaults).toEqual({ quality: 'high' });
  });

  it('should push capabilitiesUpdated when kernel module loads', async () => {
    const definition = createMockKernelDefinition('openrscad', {
      exportFormats: {
        stl: { optionsSchema: z.object({ binary: z.boolean().default(true) }) },
      },
    });

    const runtime = defineRuntime({
      kernels: [attachRuntimePluginDefinition({ id: 'openrscad', extensions: ['scad'] }, () => definition)],
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
    expect(lastCall.routes.some((route) => route.kernelId === 'openrscad' && !route.transcoderId)).toBe(true);
  });

  it('should expose renderCapabilities indexed by kernelId after lazy load', async () => {
    const renderSchema = z.object({
      quality: z.enum(['low', 'high']).default('high'),
    });
    const definition = createMockKernelDefinition('openrscad', {
      render: { optionsSchema: renderSchema },
    });

    const worker = await createMultiKernelWorker([{ id: 'openrscad', extensions: ['scad'], definition }]);

    await worker.createGeometry({
      file: createGeometryFile('model.scad'),
      parameters: {},
    });

    const manifest = worker.capabilitiesManifest;
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining/expect.anything matchers return any */
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
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment */
  });
});

// ===================================================================
// Native-handle snapshot restoration
// ===================================================================

describe('native-handle snapshot restoration', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      '/model.mock': 'mock geometry',
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
      exportFormats: { gltf: { optionsSchema: z.object({}) } },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ snapshot: nativeHandle }),
      deserializeNativeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'snapshot-kernel', extensions: ['mock'], definition }]);

    const renderResult = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
    expect(renderResult.success).toBe(true);

    const artifact = (worker as unknown as { currentPublishedRender?: MaterializedRender }).currentPublishedRender;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;

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
      exportFormats: { gltf: { optionsSchema: z.object({}) } },
      createGeometry,
      exportGeometry,
      serializeNativeHandle: ({ nativeHandle }) => ({ snapshot: nativeHandle }),
      deserializeNativeHandle,
    });
    const worker = await createMultiKernelWorker([{ id: 'snapshot-kernel', extensions: ['mock'], definition }]);

    const renderResult = await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
    expect(renderResult.success).toBe(true);

    const artifact = (worker as unknown as { currentPublishedRender?: MaterializedRender }).currentPublishedRender;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;

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
      exportFormats: {
        glb: { optionsSchema: z.object({}) },
        step: { optionsSchema: z.object({}) },
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

    const artifact = (worker as unknown as { currentPublishedRender?: MaterializedRender }).currentPublishedRender;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;
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

  it('should use selected source options for transcoded native construction', async () => {
    const createInputs: NativeBuildInput[] = [];
    const definition = createMockKernelDefinition('transcoded-construction-kernel', {
      createOptionsSchema: z.object({ quality: z.number().default(8) }),
      render: {
        optionsSchema: z.object({ quality: z.number().default(8) }),
      },
      exportFormats: {
        glb: {
          optionsSchema: z.object({
            quality: z.number(),
            sourceOnly: z.string().optional(),
          }),
        },
      },
      createGeometry: async (input: NativeBuildInput) => {
        createInputs.push(input);
        return {
          nativeHandle: { label: `quality:${String(input.options?.['quality'])}` },
          issues: [] as KernelIssue[],
        };
      },
      exportGeometry: async (input: ExportGeometryInput) => ({
        success: true,
        data: [exportFile('source.glb', bytesFor(handleLabel(input.nativeHandle)), 'model/gltf-binary')],
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
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    const transcoder = attachRuntimePluginDefinition({ id: 'source-option-converter' }, () => transcoderDefinition);
    const worker = await createMultiKernelWorker(
      [{ id: 'transcoded-construction-kernel', extensions: ['mock'], definition }],
      [transcoder],
    );

    try {
      const result = await worker.exportModel({
        format: 'usdz',
        file: createGeometryFile('model.mock'),
        parameters: {},
        exportOptions: {
          quality: 64,
          sourceOnly: 'kernel',
          width: 2048,
        },
      });

      expect(result.success).toBe(true);
      expect(createInputs).toHaveLength(1);
      expect(createInputs[0]?.options).toEqual({ quality: 64 });
      expect('operation' in createInputs[0]!).toBe(false);
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
      const createGeometry = vi.fn(async () => {
        generation++;
        events.push('create');
        return {
          geometry: gltfGeometry('display'),
          nativeHandle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      });
      const deserializeNativeHandle = vi.fn(() => {
        events.push('restore');
        if (scenario === 'failed-snapshot') {
          throw new Error('corrupt snapshot');
        }
        return { label: 'restored' };
      });
      const definition = createMockKernelDefinition('resolver-order-kernel', {
        exportFormats: { gltf: { optionsSchema: z.object({}) } },
        createGeometry,
        exportGeometry: async (input: ExportGeometryInput) => {
          events.push(`export:${handleLabel(input.nativeHandle)}`);
          return {
            success: true,
            data: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')],
            issues: [],
          };
        },
        serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
        deserializeNativeHandle,
        isNativeHandleValid: () => {
          events.push('validate');
          return scenario !== 'invalid';
        },
      });
      const worker = await createMultiKernelWorker([{ id: 'resolver-order-kernel', extensions: ['mock'], definition }]);

      try {
        await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
        const artifact = (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;
        if (scenario === 'failed-snapshot') {
          artifact.liveNativeHandleSlot = undefined;
        } else if (scenario === 'none') {
          artifact.liveNativeHandleSlot = undefined;
          artifact.serializedNativeHandleSlot = undefined;
        }
        events.length = 0;

        const exportResult = await worker.exportGeometry('gltf');
        expect(exportResult.success).toBe(true);
        expect(events).toEqual(expectedEvents);
        expect(createGeometry).toHaveBeenCalledTimes(expectedCreateCalls);
        expect(deserializeNativeHandle).toHaveBeenCalledTimes(expectedRestoreCalls);
      } finally {
        await worker.cleanup();
      }
    },
  );

  it.each(['identityKey', 'kernelId', 'kernelVersion'] as const)(
    'rejects live and serialized slots with a mismatched %s binding',
    async (field) => {
      const createGeometry = vi.fn(async () => ({
        geometry: gltfGeometry('display'),
        nativeHandle: { label: `live-${createGeometry.mock.calls.length + 1}` },
        issues: [] as KernelIssue[],
      }));
      const deserializeNativeHandle = vi.fn(() => ({ label: 'restored' }));
      const isNativeHandleValid = vi.fn(() => true);
      const definition = createMockKernelDefinition('binding-kernel', {
        exportFormats: { gltf: { optionsSchema: z.object({}) } },
        createGeometry,
        exportGeometry: async () => ({
          success: true,
          data: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')],
          issues: [],
        }),
        serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
        deserializeNativeHandle,
        isNativeHandleValid,
      });
      const worker = await createMultiKernelWorker([{ id: 'binding-kernel', extensions: ['mock'], definition }]);

      try {
        await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
        const artifact = (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;
        expect(artifact.liveNativeHandleSlot).toBeDefined();
        expect(artifact.serializedNativeHandleSlot).toBeDefined();
        if (field === 'identityKey') {
          artifact.liveNativeHandleSlot!.identityKey = 'other-owner';
          artifact.serializedNativeHandleSlot!.identityKey = 'other-owner';
        } else {
          artifact.liveNativeHandleSlot![field] = 'other';
          artifact.serializedNativeHandleSlot![field] = 'other';
        }

        const exportResult = await worker.exportGeometry('gltf');
        expect(exportResult.success).toBe(true);
        expect(createGeometry).toHaveBeenCalledTimes(2);
        expect(isNativeHandleValid).not.toHaveBeenCalled();
        expect(deserializeNativeHandle).not.toHaveBeenCalled();
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
      exportFormats: { gltf: { optionsSchema: z.object({}) } },
      createGeometry: async (_input, runtime) => {
        createSignals.push(runtime.signal);
        generation++;
        return {
          geometry: gltfGeometry('display'),
          nativeHandle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      },
      exportGeometry: async (_input, runtime) => {
        exportSignals.push(runtime.signal);
        return {
          success: true,
          data: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')],
          issues: [],
        };
      },
      serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
      deserializeNativeHandle: ({ serializedNativeHandle }, runtime) => {
        restoreSignals.push(runtime.signal);
        if (serializedNativeHandle === 'corrupt') {
          throw new Error('corrupt snapshot');
        }
        return { label: 'restored' };
      },
    });
    const worker = await createMultiKernelWorker([{ id: 'native-signal-kernel', extensions: ['mock'], definition }]);

    try {
      await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
      const artifact = (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;
      artifact.liveNativeHandleSlot = undefined;

      const restoredExport = await worker.exportGeometry('gltf');
      expect(restoredExport.success).toBe(true);
      expect(restoreSignals[0]).toBe(exportSignals[0]);

      artifact.liveNativeHandleSlot = undefined;
      artifact.serializedNativeHandleSlot!.serializedNativeHandle = 'corrupt';
      const reheatedExport = await worker.exportGeometry('gltf');
      expect(reheatedExport.success).toBe(true);
      expect(restoreSignals[1]).toBe(createSignals[1]);
      expect(createSignals[1]).toBe(exportSignals[1]);
      expect(createSignals[1]).toBe(createSignals[0]);
    } finally {
      await worker.cleanup();
    }
  });

  it('disposes unpublished request handles while retaining the published exact-match handle', async () => {
    let generation = 0;
    const disposedInputs: DisposeNativeHandleInput[] = [];
    const disposeNativeHandle = vi.fn((input: DisposeNativeHandleInput) => {
      disposedInputs.push(input);
    });
    const definition = createMockKernelDefinition('transient-ownership-kernel', {
      exportFormats: { gltf: { optionsSchema: z.object({}) } },
      createGeometry: async () => {
        generation++;
        return {
          geometry: gltfGeometry('display'),
          nativeHandle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      },
      exportGeometry: async () => ({
        success: true,
        data: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')],
        issues: [],
      }),
      disposeNativeHandle,
    });
    const worker = await createMultiKernelWorker([
      { id: 'transient-ownership-kernel', extensions: ['mock'], definition },
    ]);

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { revision: 1 } });
    const exportModelResult = await worker.exportModel({
      format: 'gltf',
      file: createGeometryFile('model.mock'),
      parameters: { revision: 2 },
    });
    expect(exportModelResult.success).toBe(true);
    expect(disposeNativeHandle).toHaveBeenCalledOnce();
    expect(disposedInputs[0]).toEqual({ nativeHandle: { label: 'live-2' } });

    const publishedExport = await worker.exportGeometry('gltf');
    expect(publishedExport.success).toBe(true);
    expect(disposeNativeHandle).toHaveBeenCalledOnce();
    await worker.cleanup();
    expect(disposeNativeHandle).toHaveBeenCalledTimes(2);
    expect(disposedInputs[1]).toEqual({ nativeHandle: { label: 'live-1' } });
  });

  it('owns restored and reheated handles and disposes each exactly once after replacement', async () => {
    let generation = 0;
    const disposedInputs: DisposeNativeHandleInput[] = [];
    const disposeNativeHandle = vi.fn((input: DisposeNativeHandleInput) => {
      disposedInputs.push(input);
    });
    const deserializeNativeHandle = vi.fn(({ serializedNativeHandle }: DeserializeNativeHandleInput) => {
      if (
        typeof serializedNativeHandle !== 'object' ||
        serializedNativeHandle === null ||
        !('label' in serializedNativeHandle)
      ) {
        throw new Error('corrupt snapshot');
      }
      return { label: `restored:${String(serializedNativeHandle.label)}` };
    });
    const definition = createMockKernelDefinition('restore-ownership-kernel', {
      exportFormats: { gltf: { optionsSchema: z.object({}) } },
      createGeometry: async () => {
        generation++;
        return {
          geometry: gltfGeometry('display'),
          nativeHandle: { label: `live-${generation}` },
          issues: [] as KernelIssue[],
        };
      },
      exportGeometry: async () => ({
        success: true,
        data: [exportFile('model.gltf', bytesFor('export'), 'model/gltf+json')],
        issues: [],
      }),
      serializeNativeHandle: ({ nativeHandle }) => ({ label: handleLabel(nativeHandle) }),
      deserializeNativeHandle,
      disposeNativeHandle,
    });
    const worker = await createMultiKernelWorker([
      { id: 'restore-ownership-kernel', extensions: ['mock'], definition },
    ]);

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: {} });
    const artifact = (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;
    artifact.liveNativeHandleSlot = undefined;
    const restoredExport = await worker.exportGeometry('gltf');
    expect(restoredExport.success).toBe(true);
    expect(disposedInputs).toEqual([{ nativeHandle: { label: 'live-1' } }]);

    artifact.liveNativeHandleSlot = undefined;
    artifact.serializedNativeHandleSlot!.serializedNativeHandle = 'corrupt';
    const reheatedExport = await worker.exportGeometry('gltf');
    expect(reheatedExport.success).toBe(true);
    expect(deserializeNativeHandle).toHaveBeenCalledTimes(2);
    expect(disposedInputs).toEqual([
      { nativeHandle: { label: 'live-1' } },
      { nativeHandle: { label: 'restored:live-1' } },
    ]);
    expect(artifact.serializedNativeHandleSlot?.serializedNativeHandle).toEqual({ label: 'live-2' });

    artifact.liveNativeHandleSlot = undefined;
    const restoredReheatedExport = await worker.exportGeometry('gltf');
    expect(restoredReheatedExport.success).toBe(true);
    expect(deserializeNativeHandle).toHaveBeenCalledTimes(3);
    expect(deserializeNativeHandle.mock.calls[2]?.[0]).toMatchObject({
      serializedNativeHandle: { label: 'live-2' },
    });

    await worker.cleanup();
    expect(disposedInputs).toEqual([
      { nativeHandle: { label: 'live-1' } },
      { nativeHandle: { label: 'restored:live-1' } },
      { nativeHandle: { label: 'live-2' } },
      { nativeHandle: { label: 'restored:live-2' } },
    ]);
  });
});

// ===================================================================
// Cache identity regressions
// ===================================================================

describe('cache identity regressions', () => {
  beforeEach(async () => {
    await seedTestFileSystem({
      '/model.mock': 'mock geometry',
      '/a.mock': 'alpha',
      '/b.mock': 'bravo',
      '/b.other': 'other',
    });
  });

  it('rereads changed dependency bytes on each explicit render when the filesystem has no watcher', async () => {
    await seedTestFileSystem({ '/model.mock': 'first' });
    const definition = createMockKernelDefinition('watcherless-kernel', {
      createGeometry: async (input, runtime) => {
        const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
        return {
          geometry: gltfGeometry(source),
          nativeHandle: { label: source },
          issues: [] as KernelIssue[],
        };
      },
    });
    const worker = await createMultiKernelWorker([{ id: 'watcherless-kernel', extensions: ['mock'], definition }]);

    const first = await worker.render({ file: createGeometryFile('model.mock'), parameters: {} });
    await getTestFileSystem().writeFile('/model.mock', 'second');
    const second = await worker.render({ file: createGeometryFile('model.mock'), parameters: {} });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      return;
    }
    expect(first.data.format).toBe('gltf');
    expect(second.data.format).toBe('gltf');
    if (first.data.format !== 'gltf' || second.data.format !== 'gltf') {
      return;
    }
    expect(textFrom(first.data.content)).toBe('first');
    expect(textFrom(second.data.content)).toBe('second');
    expect(second.data.hash).not.toBe(first.data.hash);
    expect(getInitSpy(definition)).toHaveBeenCalledOnce();
  });

  it('should recompute base dependencies for consecutive direct createGeometry calls with different files', async () => {
    const definition = createMockKernelDefinition('dependency-kernel', {
      createGeometry: async (input: CreateGeometryInput, runtime: KernelRuntime) => {
        const source = await runtime.filesystem.readFile(input.entryPath, 'utf8');
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
      exportFormats: { gltf: { optionsSchema: z.object({}) } },
      createGeometry,
      exportGeometry,
    });
    const worker = await createMultiKernelWorker([{ id: 'request-scope-kernel', extensions: ['mock'], definition }]);

    await worker.createGeometry({ file: createGeometryFile('model.mock'), parameters: { label: 'preview' } });
    const internals = worker as unknown as {
      currentPublishedRender: MaterializedRender | undefined;
      activeKernelId: string | undefined;
      activeFilePath: string;
    };
    const previewOwnership = {
      currentPublishedRender: internals.currentPublishedRender,
      activeKernelId: internals.activeKernelId,
      activeFilePath: internals.activeFilePath,
    };

    const requestScoped = await worker.exportModel({
      file: createGeometryFile('model.mock'),
      parameters: { label: 'request-scoped' },
      format: 'gltf',
    });
    expect(requestScoped.success).toBe(true);
    expect(internals).toMatchObject(previewOwnership);

    const currentStateExport = await worker.exportGeometry('gltf');

    expect(currentStateExport.success).toBe(true);
    if (!currentStateExport.success) {
      return;
    }
    expect(textFrom(currentStateExport.data[0]!.bytes)).toBe('preview');
  });

  it('should select the request file kernel for exportModel after a different kernel was active', async () => {
    const sourceDefinition = createMockKernelDefinition('source-kernel', {
      exportFormats: { glb: { optionsSchema: z.object({}) } },
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
      exportFormats: { glb: { optionsSchema: z.object({}) } },
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
