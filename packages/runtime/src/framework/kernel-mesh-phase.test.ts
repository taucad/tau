// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Seeded filesystem keys are absolute paths. */
/**
 * Mesh/build/export phase separation — orchestration contract.
 *
 * Locks in the three-phase kernel pipeline (kernel-mesh-geometry-phase-separation.md):
 * kernels that defer their display artifact return only a nativeHandle from
 * createGeometry; the display path runs meshGeometry at the kernel boundary;
 * BRep-only exports never tessellate; the geometry cache carries the build
 * entry (serialized handle) and the mesh cache carries the display artifact.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { createExportFile } from '@taucad/types/constants';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { GetDependenciesInput, KernelDefinition } from '#types/runtime-kernel.types.js';
import type { KernelIssue } from '#types/runtime.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  seedTestFileSystem,
  initializeWorkerForTesting,
  createGeometryFile,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { MiddlewarePlugin } from '#plugins/plugin-types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { NativeBuildInput } from '#framework/render-artifact.js';

type PhaseCounters = {
  create: number;
  mesh: number;
  export: number;
  lastMeshedHandle?: unknown;
};

const displayBytes = new Uint8Array([9, 9, 9]);

function createDeferredKernel(counters: PhaseCounters, overrides?: Partial<KernelDefinition>): KernelDefinition {
  const definition = {
    name: 'deferred-brep',
    version: '1.0.0',
    exportFormats: { step: { optionsSchema: z.object({}) } },
    initialize: async () => ({}),
    getDependencies: async (input: GetDependenciesInput) => ({ resolved: [input.entryPath], unresolved: [] }),
    getParameters: async () => ({
      success: true,
      data: { defaultParameters: {}, jsonSchema: {} },
      issues: [] as KernelIssue[],
    }),
    createGeometry: async () => {
      counters.create++;
      return { nativeHandle: { shapes: 2 }, issues: [] as KernelIssue[] };
    },
    meshGeometry: async ({ nativeHandle }: { nativeHandle: unknown; options: Record<string, unknown> }) => {
      counters.mesh++;
      counters.lastMeshedHandle = nativeHandle;
      return { geometry: { format: 'gltf', content: new Uint8Array(displayBytes) } };
    },
    exportGeometry: async () => {
      counters.export++;
      return {
        success: true,
        data: [createExportFile('step', 'model', new Uint8Array([1, 2]))],
        issues: [] as KernelIssue[],
      };
    },
    serializeNativeHandle: ({ nativeHandle }: { nativeHandle: unknown }) => ({ snapshot: nativeHandle }),
    deserializeNativeHandle: ({ serializedNativeHandle }: { serializedNativeHandle: { snapshot: unknown } }) =>
      serializedNativeHandle.snapshot,
    ...overrides,
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- test helper merges partial union branches.
  return definition as KernelDefinition;
}

async function createWorker(
  definition: KernelDefinition,
  middleware: readonly MiddlewarePlugin[] = [],
): Promise<KernelRuntimeWorker> {
  const runtime = defineRuntime({
    kernels: [attachRuntimePluginDefinition({ id: 'mock-brep', extensions: ['mock'] }, () => definition)],
    middleware: [...middleware],
    transcoders: [],
  });
  const worker = new KernelRuntimeWorker({ runtime });
  await initializeWorkerForTesting(worker);
  return worker;
}

const modelFile = () => createGeometryFile('model.mock');

describe('mesh/build/export phase separation', () => {
  beforeEach(async () => {
    await seedTestFileSystem({ '/model.mock': 'mock-model' });
  });

  it('display render defers to meshGeometry and publishes its artifact', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const worker = await createWorker(createDeferredKernel(counters));

    const result = await worker.createGeometry({ file: modelFile(), parameters: {} });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe('gltf');
      if (result.data.format === 'gltf') {
        expect(result.data.content).toEqual(displayBytes);
      }
      expect(result.data.hash).toBeTruthy();
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
      async wrapCreateGeometry(input, handler, runtime) {
        createDependencies = runtime.dependencies;
        return handler(input);
      },
    });
    const mesh = defineMiddleware({
      id: 'mesh-phase',
      name: 'mesh-phase',
      async wrapMeshGeometry(input, handler, runtime) {
        meshDependencies = runtime.dependencies;
        return handler(input);
      },
    });
    const exportOnly = defineMiddleware({
      id: 'export-only',
      name: 'export-only',
      async wrapExportGeometry(input, handler) {
        return handler(input);
      },
    });
    const worker = await createWorker(createDeferredKernel(counters), [create(), mesh(), exportOnly()]);

    const result = await worker.createGeometry({ file: modelFile(), parameters: {} });
    expect(result.success).toBe(true);

    expect(createDependencies.filter((dependency) => dependency.type === 'middleware')).toEqual([
      { type: 'middleware', id: 'create-phase', version: '1', index: 0, options: {} },
    ]);
    expect(meshDependencies.filter((dependency) => dependency.type === 'middleware')).toEqual([
      { type: 'middleware', id: 'create-phase', version: '1', index: 0, options: {} },
      { type: 'middleware', id: 'mesh-phase', version: '1', index: 1, options: {} },
    ]);
  });

  it('one-shot BRep export never runs the mesh phase', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const worker = await createWorker(createDeferredKernel(counters));

    const result = await worker.exportModel({ format: 'step', file: modelFile(), parameters: {} });

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
        createOptionsSchema: z.object({
          tessellation: z
            .object({
              segments: z.number(),
              samples: z.array(z.number()),
            })
            .default({ segments: 8, samples: [1, 2] }),
          renderOnly: z.string().default('preview'),
        }),
        render: {
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
        exportFormats: {
          step: {
            optionsSchema: z.object({
              tessellation: z.object({
                segments: z.number(),
                samples: z.array(z.number()),
              }),
              coordinateSystem: z.enum(['y-up', 'z-up']),
            }),
          },
        },
        createGeometry: async (input: NativeBuildInput) => {
          counters.create++;
          createInputs.push(input);
          return { nativeHandle: { shapes: 2 }, issues: [] as KernelIssue[] };
        },
      }),
    );

    try {
      const exported = await worker.exportModel({
        format: 'step',
        file: modelFile(),
        parameters: {},
        exportOptions: {
          tessellation: { segments: 64, samples: [9] },
          coordinateSystem: 'z-up',
        },
      });
      expect(exported.success).toBe(true);
      expect(createInputs[0]).toEqual({
        entryPath: '/model.mock',
        parameters: {},
        options: {
          tessellation: { segments: 64, samples: [9] },
          renderOnly: 'preview',
        },
      });
      expect('operation' in createInputs[0]!).toBe(false);
      expect(counters).toMatchObject({ create: 1, mesh: 0, export: 1 });

      const displayed = await worker.createGeometry({ file: modelFile(), parameters: {} });
      expect(displayed.success).toBe(true);
      expect(createInputs[1]).toEqual({
        entryPath: '/model.mock',
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

  it('display render fails the invariant when neither inline geometry nor meshGeometry exists', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const worker = await createWorker(createDeferredKernel(counters, { meshGeometry: undefined }));

    const result = await worker.createGeometry({ file: modelFile(), parameters: {} });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.code).toBe('KERNEL_CAPABILITY_MISSING');
      expect(result.issues[0]?.message).toContain('display path');
    }
    expect(counters.mesh).toBe(0);
  });

  it('mesh-native kernels keep the inline display path untouched', async () => {
    const counters: PhaseCounters = { create: 0, mesh: 0, export: 0 };
    const inlineBytes = new Uint8Array([4, 5, 6]);
    const worker = await createWorker(
      createDeferredKernel(counters, {
        meshGeometry: undefined,
        createGeometry: async () => {
          counters.create++;
          return {
            geometry: { format: 'gltf', content: inlineBytes },
            nativeHandle: { shapes: 1 },
            issues: [] as KernelIssue[],
          };
        },
      }),
    );

    const result = await worker.createGeometry({ file: modelFile(), parameters: {} });

    expect(result.success).toBe(true);
    if (result.success && result.data.format === 'gltf') {
      expect(result.data.content).toEqual(inlineBytes);
    }
    expect(counters.create).toBe(1);
    expect(counters.mesh).toBe(0);
  });

  it('runs a dual-hook content contributor only at the artifact-producing phase', async () => {
    const deferredCalls = { create: 0, mesh: 0 };
    const inlineCalls = { create: 0, mesh: 0 };
    const contentMiddleware = (calls: typeof deferredCalls, id: string) =>
      defineMiddleware({
        id,
        name: id,
        content: { render: ['includeEdges'] },
        async wrapCreateGeometry(input, handler) {
          calls.create++;
          return handler(input);
        },
        async wrapMeshGeometry(input, handler) {
          calls.mesh++;
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
        meshGeometry: undefined,
        async createGeometry() {
          inlineCounters.create++;
          return { geometry: { format: 'gltf', content: displayBytes }, nativeHandle: {}, issues: [] };
        },
      }),
      [contentMiddleware(inlineCalls, 'inline-content')],
    );

    try {
      const deferredResult = await deferred.createGeometry({
        file: modelFile(),
        parameters: {},
        content: { includeEdges: true },
      });
      const inlineResult = await inline.createGeometry({
        file: modelFile(),
        parameters: {},
        content: { includeEdges: true },
      });
      expect(deferredResult.success).toBe(true);
      expect(inlineResult.success).toBe(true);
      expect(deferredCalls).toEqual({ create: 0, mesh: 1 });
      expect(inlineCalls).toEqual({ create: 1, mesh: 0 });
    } finally {
      await deferred.cleanup();
      await inline.cleanup();
    }
  });
});
