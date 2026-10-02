// @vitest-environment node
/**
 * Mesh/build/export phase separation — orchestration contract.
 *
 * Locks in the three-phase kernel pipeline (kernel-mesh-geometry-phase-separation.md):
 * kernels evaluate a native handle before rendering the display artifact;
 * BRep-only exports never render; the geometry cache carries the build
 * entry (serialized handle) and the mesh cache carries the display artifact.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { createExportFile } from '@taucad/types/constants';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { AnyKernelDefinitionV2, ResolveInput } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { Rendering } from '#client/runtime-document.types.js';
import type { KernelIssue } from '#types/runtime.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createParameterDeclaration,
  seedTestFileSystem,
  initializeWorkerForTesting,
  createGeometryFile,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { MiddlewarePlugin } from '#plugins/plugin-types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { NativeBuildInput } from '#framework/render-artifact.js';

type PhaseCounters = {
  create: number;
  mesh: number;
  export: number;
  lastMeshedHandle?: unknown;
};

const workers: KernelRuntimeWorker[] = [];
const documents = new Map<
  KernelRuntimeWorker,
  { documentId: string; parameters: Record<string, unknown>; intent: number }
>();
let requestSequence = 0;

const displayBytes = new Uint8Array([9, 9, 9]);

function createDeferredKernel(
  counters: PhaseCounters,
  overrides: Partial<AnyKernelDefinitionV2> = {},
): AnyKernelDefinitionV2 {
  const definition: AnyKernelDefinitionV2 = {
    id: 'mock-brep',
    extensions: ['mock'],
    name: 'deferred-brep',
    version: '1.0.0',
    views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
    exports: { step: { title: 'STEP', mimeType: 'model/step', extension: 'step', optionsSchema: z.object({}) } },
    initialize: async () => ({}),
    resolve: async (input: ResolveInput) => ({
      resolved: [input.entryPath],
      unresolved: [],
    }),
    describe: async () => {
      const declaration = createParameterDeclaration();
      if (!declaration.success) {
        return declaration;
      }
      return { success: true, data: { parameters: declaration.data }, issues: declaration.issues };
    },
    evaluate: async () => {
      counters.create++;
      return { handle: { shapes: 2 }, issues: [] as KernelIssue[] };
    },
    render: async ({ handle }: { handle: unknown }) => {
      counters.mesh++;
      counters.lastMeshedHandle = handle;
      return { content: new Uint8Array(displayBytes) };
    },
    export: async () => {
      counters.export++;
      return {
        files: [createExportFile('step', 'model', new Uint8Array([1, 2]))] as const,
        issues: [] as KernelIssue[],
      };
    },
    serializeHandle: ({ handle }: { handle: unknown }) => ({
      snapshot: handle,
    }),
    deserializeHandle: ({ serialized }: { serialized: { snapshot: unknown } }) => serialized.snapshot,
  };
  return Object.assign(definition, overrides);
}

async function createWorker(
  definition: AnyKernelDefinitionV2,
  middleware: readonly MiddlewarePlugin[] = [],
): Promise<KernelRuntimeWorker> {
  const runtime = defineRuntime({
    kernels: [attachRuntimePluginDefinition({ id: 'mock-brep', extensions: ['mock'] }, () => definition)],
    middleware: [...middleware],
    transcoders: [],
  });
  const worker = new KernelRuntimeWorker({ runtime });
  await initializeWorkerForTesting(worker);
  workers.push(worker);
  return worker;
}

const modelFile = () => createGeometryFile('model.mock');

const openDocument = async (
  worker: KernelRuntimeWorker,
  input: { parameters?: Record<string, unknown>; evaluateOptions?: Record<string, unknown> } = {},
): Promise<string> => {
  const previous = documents.get(worker);
  if (previous) {
    return previous.documentId;
  }
  const documentId = `phase-document-${++requestSequence}`;
  const parameters = input.parameters ?? {};
  const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
  worker.onEvaluated = (event) => {
    evaluated.push(event);
  };
  documents.set(worker, { documentId, parameters, intent: 1 });
  worker.handleOpenDocument({
    documentId,
    intent: 1,
    file: modelFile(),
    parameters,
    evaluateOptions: input.evaluateOptions,
    watch: false,
  });
  await vi.waitFor(
    () => {
      expect(evaluated).toHaveLength(1);
    },
    { timeout: 10_000 },
  );
  return documentId;
};

const renderView = async (
  worker: KernelRuntimeWorker,
  input: { parameters?: Record<string, unknown>; view?: string; content?: RuntimeContentInput } = {},
): Promise<Rendering> => {
  const documentId = await openDocument(worker, { parameters: input.parameters });
  const record = documents.get(worker)!;
  if (input.parameters && JSON.stringify(input.parameters) !== JSON.stringify(record.parameters)) {
    record.parameters = input.parameters;
    record.intent++;
    worker.handleUpdateDocument({ documentId, intent: record.intent, parameters: input.parameters });
  }
  const rendered: Rendering[] = [];
  const subscriptionId = `phase-view-${++requestSequence}`;
  worker.onRendered = (event) => {
    if (event.subscriptionId === subscriptionId) {
      rendered.push(event);
    }
  };
  worker.handleOpenView({
    documentId,
    subscriptionId,
    requestId: subscriptionId,
    view: input.view,
    content: input.content,
  });
  await vi.waitFor(
    () => {
      expect(rendered).toHaveLength(1);
    },
    { timeout: 10_000 },
  );
  worker.handleCloseView({ subscriptionId });
  return rendered[0]!;
};

const exportViewDocument = async (worker: KernelRuntimeWorker, input: { options?: Record<string, unknown> } = {}) => {
  const documentId = await openDocument(worker);
  return worker.exportDocument({
    documentId,
    operationId: `phase-export-${++requestSequence}`,
    target: 'step',
    ...input,
  });
};

describe('mesh/build/export phase separation', () => {
  afterEach(async () => {
    await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
    documents.clear();
  });

  beforeEach(async () => {
    await seedTestFileSystem({ 'model.mock': 'mock-model' });
  });

  it('reuses one evaluation across A, B, A views without compute middleware and isolates render warnings', async () => {
    const rendered: string[] = [];
    let evaluations = 0;
    const definition = createDeferredKernel(
      { create: 0, mesh: 0, export: 0 },
      {
        views: {
          a: { title: 'A', mimeType: 'model/gltf-binary' },
          b: { title: 'B', mimeType: 'model/gltf-binary' },
        },
        evaluate: async () => {
          evaluations++;
          return { handle: { build: evaluations }, views: ['a', 'b'], issues: [] };
        },
        render: async ({ view }) => {
          rendered.push(view);
          return {
            content: new Uint8Array([view === 'a' ? 1 : 2]),
            issues:
              view === 'b'
                ? ([{ code: 'RUNTIME', type: 'kernel', severity: 'warning', message: 'B only' }] as KernelIssue[])
                : [],
          };
        },
      },
    );
    const runtime = defineRuntime({
      kernels: [attachRuntimePluginDefinition({ id: 'mock-brep', extensions: ['mock'] }, () => definition)],
      middleware: [],
      transcoders: [],
    });
    const worker = new KernelRuntimeWorker({ runtime });
    await initializeWorkerForTesting(worker);
    workers.push(worker);
    try {
      const a1 = await renderView(worker, { view: 'a' });
      const b = await renderView(worker, { view: 'b' });
      const a2 = await renderView(worker, { view: 'a' });
      expect([a1, b, a2].every((result) => result.success)).toBe(true);
      expect(evaluations).toBe(1);
      expect(rendered).toEqual(['a', 'b']);
      if (a1.success && a2.success) {
        expect(a2.artifact).toEqual(a1.artifact);
        expect(a2.evaluationId).toBe(a1.evaluationId);
      }
      expect(a1.issues).toEqual([]);
      expect(b.issues.map((issue) => issue.message)).toContain('B only');
      expect(a2.issues).toEqual([]);
    } finally {
      await worker.cleanup();
    }
  });

  it('reapplies an offered-view narrowing middleware once around a reused terminal evaluation', async () => {
    let evaluations = 0;
    const rendered: string[] = [];
    const definition = createDeferredKernel(
      { create: 0, mesh: 0, export: 0 },
      {
        views: {
          a: { title: 'A', mimeType: 'model/gltf-binary' },
          b: { title: 'B', mimeType: 'model/gltf-binary' },
        },
        evaluate: async () => {
          evaluations++;
          return { handle: { build: evaluations }, views: ['a', 'b'], issues: [] };
        },
        render: async ({ view }) => {
          rendered.push(view);
          return { content: new Uint8Array([2]) };
        },
      },
    );
    const narrowing = defineMiddleware({
      id: 'narrow-views',
      name: 'Narrow Views',
      async wrapEvaluate(input, handler) {
        const result = await handler(input);
        return result.success ? { ...result, data: { ...result.data, views: ['b'] } } : result;
      },
    });
    const worker = await createWorker(definition, [narrowing()]);
    try {
      const first = await renderView(worker);
      const record = documents.get(worker)!;
      record.intent++;
      worker.handleUpdateDocument({ documentId: record.documentId, intent: record.intent });
      const second = await renderView(worker);
      expect(first.success && second.success).toBe(true);
      expect(evaluations).toBe(1);
      expect(rendered).toEqual(['b', 'b']);
    } finally {
      await worker.cleanup();
    }
  });

  it('exports the newer evaluation after its board render fails', async () => {
    let evaluations = 0;
    const released: unknown[] = [];
    const definition = createDeferredKernel(
      { create: 0, mesh: 0, export: 0 },
      {
        evaluate: async ({ parameters }) => {
          evaluations++;
          return { handle: { revision: parameters['revision'] }, issues: [] };
        },
        render: async ({ handle }) => {
          if ((handle as { revision?: number }).revision === 2) {
            throw new Error('board projection failed');
          }
          return { content: new Uint8Array([1]) };
        },
        export: async ({ handle }) => ({
          files: [
            createExportFile('step', 'model', new Uint8Array([(handle as { revision: number }).revision])),
          ] as const,
          issues: [],
        }),
        releaseHandle: ({ handle }) => {
          released.push(handle);
        },
      },
    );
    const worker = await createWorker(definition);
    try {
      const first = await renderView(worker, { parameters: { revision: 1 } });
      const second = await renderView(worker, { parameters: { revision: 2 } });
      expect(first.success).toBe(true);
      expect(second.success).toBe(false);
      expect(released).toEqual([{ revision: 1 }]);
      const exported = await exportViewDocument(worker);
      expect(exported.success).toBe(true);
      if (exported.success) {
        expect(exported.files[0].bytes).toEqual(new Uint8Array([2]));
      }
      expect(evaluations).toBe(2);
    } finally {
      await worker.cleanup();
    }
    expect(released).toEqual([{ revision: 1 }, { revision: 2 }]);
  });

  it('display render uses the v2 render hook and publishes its artifact', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const worker = await createWorker(createDeferredKernel(counters));

    const result = await renderView(worker);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.mimeType).toBe('model/gltf-binary');
      if (result.artifact.mimeType === 'model/gltf-binary') {
        expect(result.artifact.content).toEqual(displayBytes);
      }
      expect(result.hash).toBeTruthy();
    }
    expect(counters.create).toBe(1);
    expect(counters.mesh).toBe(1);
    expect(counters.lastMeshedHandle).toEqual({ shapes: 2 });
  });

  it('uses create-only identity for the native build and the create-plus-mesh union for display', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    let createDependencies: readonly Dependency[] = [];
    let meshDependencies: readonly Dependency[] = [];
    const create = defineMiddleware({
      id: 'create-phase',
      name: 'create-phase',
      async wrapEvaluate(input, handler, runtime) {
        createDependencies = runtime.dependencies;
        return handler(input);
      },
    });
    const mesh = defineMiddleware({
      id: 'mesh-phase',
      name: 'mesh-phase',
      async wrapRender(input, handler, runtime) {
        meshDependencies = runtime.dependencies;
        return handler(input);
      },
    });
    const exportOnly = defineMiddleware({
      id: 'export-only',
      name: 'export-only',
      async wrapExport(input, handler) {
        return handler(input);
      },
    });
    const worker = await createWorker(createDeferredKernel(counters), [create(), mesh(), exportOnly()]);

    const result = await renderView(worker);
    expect(result.success).toBe(true);

    expect(createDependencies.filter((dependency) => dependency.type === 'middleware')).toEqual([
      {
        type: 'middleware',
        id: 'create-phase',
        version: '1',
        index: 0,
        options: {},
      },
    ]);
    expect(meshDependencies.filter((dependency) => dependency.type === 'middleware')).toEqual([
      {
        type: 'middleware',
        id: 'create-phase',
        version: '1',
        index: 0,
        options: {},
      },
      {
        type: 'middleware',
        id: 'mesh-phase',
        version: '1',
        index: 1,
        options: {},
      },
    ]);
  });

  it('one-shot BRep export never runs the mesh phase', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const worker = await createWorker(createDeferredKernel(counters));

    const result = await exportViewDocument(worker);

    expect(result.success).toBe(true);
    expect(counters.create).toBe(1);
    expect(counters.export).toBe(1);
    expect(counters.mesh).toBe(0);
  });

  it('should pass schema-projected construction values without route intent', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const createInputs: NativeBuildInput[] = [];
    const worker = await createWorker(
      createDeferredKernel(counters, {
        evaluateOptionsSchema: z.object({
          tessellation: z
            .object({
              segments: z.number(),
              samples: z.array(z.number()),
            })
            .default({ segments: 8, samples: [1, 2] }),
          renderOnly: z.string().default('preview'),
        }),
        views: {
          display: {
            title: 'Display',
            mimeType: 'model/gltf-binary',
            optionsSchema: z.object({
              tessellation: z
                .object({
                  segments: z.number(),
                  samples: z.array(z.number()),
                })
                .default({ segments: 8, samples: [1, 2] }),
              renderOnly: z.string().default('preview'),
            }),
          },
        },
        exports: {
          step: {
            title: 'STEP',
            mimeType: 'model/step',
            extension: 'step',
            optionsSchema: z.object({
              tessellation: z.object({
                segments: z.number(),
                samples: z.array(z.number()),
              }),
              coordinateSystem: z.enum(['y-up', 'z-up']),
            }),
          },
        },
        evaluate: async (input: NativeBuildInput) => {
          counters.create++;
          createInputs.push(input);
          return { handle: { shapes: 2 }, issues: [] as KernelIssue[] };
        },
      }),
    );

    try {
      await openDocument(worker, { evaluateOptions: { tessellation: { segments: 64, samples: [9] } } });
      const exported = await exportViewDocument(worker, {
        options: {
          tessellation: { segments: 64, samples: [9] },
          coordinateSystem: 'z-up',
        },
      });
      expect(exported.success).toBe(true);
      expect(createInputs[0]).toEqual({
        entryPath: 'model.mock',
        parameters: {},
        options: {
          tessellation: { segments: 64, samples: [9] },
          renderOnly: 'preview',
        },
      });
      expect('operation' in createInputs[0]!).toBe(false);
      expect(counters).toMatchObject({ create: 1, mesh: 0, export: 1 });

      worker.handleCloseDocument({ documentId: documents.get(worker)!.documentId });
      documents.delete(worker);
      const displayed = await renderView(worker);
      expect(displayed.success).toBe(true);
      expect(createInputs[1]).toEqual({
        entryPath: 'model.mock',
        parameters: {},
        options: {
          tessellation: { segments: 8, samples: [1, 2] },
          renderOnly: 'preview',
        },
      });
      expect(counters).toMatchObject({ create: 2, mesh: 1, export: 1 });
    } finally {
      await worker.cleanup();
    }
  });

  it('display render fails the invariant when the declared view has no render hook', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const worker = await createWorker(createDeferredKernel(counters, { render: undefined }));

    const result = await renderView(worker);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.code).toBe('KERNEL_CAPABILITY_MISSING');
      expect(result.issues[0]?.message).toContain('display');
    }
    expect(counters.mesh).toBe(0);
  });

  it('mesh-native kernels render their evaluated display artifact', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const inlineBytes = new Uint8Array([4, 5, 6]);
    const worker = await createWorker(
      createDeferredKernel(counters, {
        evaluate: async () => {
          counters.create++;
          return { handle: { shapes: 1, bytes: inlineBytes }, issues: [] as KernelIssue[] };
        },
        render: async ({ handle }: { handle: { bytes: Uint8Array<ArrayBuffer> } }) => {
          counters.mesh++;
          return { content: handle.bytes };
        },
      }),
    );

    const result = await renderView(worker);

    expect(result.success).toBe(true);
    if (result.success && result.artifact.mimeType === 'model/gltf-binary') {
      expect(result.artifact.content).toEqual(inlineBytes);
    }
    expect(counters.create).toBe(1);
    expect(counters.mesh).toBe(1);
  });

  it('routes a dual-hook content contributor only to the artifact-producing render phase', async () => {
    const deferredCalls = { create: 0, mesh: 0 };
    const inlineCalls = { create: 0, mesh: 0 };
    const contentMiddleware = (calls: typeof deferredCalls, id: string) =>
      defineMiddleware({
        id,
        name: id,
        content: { views: { 'model/gltf-binary': ['includeEdges'] } },
        async wrapEvaluate(input, handler) {
          calls.create++;
          expect('content' in input).toBe(false);
          return handler(input);
        },
        async wrapRender(input, handler) {
          calls.mesh++;
          expect(input.content).toMatchObject({ includeEdges: true });
          return handler(input);
        },
      })();

    const deferredCounters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const deferred = await createWorker(createDeferredKernel(deferredCounters), [
      contentMiddleware(deferredCalls, 'deferred-content'),
    ]);
    const inlineCounters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const inline = await createWorker(
      createDeferredKernel(inlineCounters, {
        async evaluate() {
          inlineCounters.create++;
          return { handle: { bytes: displayBytes }, issues: [] };
        },
        async render({ handle }: { handle: { bytes: Uint8Array<ArrayBuffer> } }) {
          inlineCounters.mesh++;
          return { content: handle.bytes };
        },
      }),
      [contentMiddleware(inlineCalls, 'inline-content')],
    );

    try {
      const deferredResult = await renderView(deferred, { content: { includeEdges: true } });
      const inlineResult = await renderView(inline, { content: { includeEdges: true } });
      expect(deferredResult.success).toBe(true);
      expect(inlineResult.success).toBe(true);
      expect(deferredCalls).toEqual({ create: 1, mesh: 1 });
      expect(inlineCalls).toEqual({ create: 1, mesh: 1 });
    } finally {
      await deferred.cleanup();
      await inline.cleanup();
    }
  });
});
