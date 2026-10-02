/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys are not camelCase identifiers. */
/**
 * Tests for KernelWorker lifecycle, watch subscription, and cache invalidation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { kernelConfigurations, logLevels } from '@taucad/types/constants';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';
import type { OnWorkerLog } from '@taucad/types';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { WatchEvent } from '@taucad/filesystem';
import type {
  CapabilitiesManifest,
  ExportGeometryResult,
  GetParameterDeclarationsResult,
  KernelIssue,
} from '#types/runtime.types.js';
import type {
  KernelFileSystem,
  KernelRuntime,
  GetDependenciesInput,
  GetParametersInput,
} from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { TranscoderDefinition, TranscoderEdge } from '#types/runtime-transcoder.types.js';
import type { MaterializedRender, NativeBuildInput, OperationOwner } from '#framework/render-artifact.js';
import type { EvaluateResult } from '#types/runtime-kernel-v2.types.js';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph.
import type { MockKernelWorkerOptions } from '../../test/support/kernel-worker.fixture.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  MockKernelWorker,
  createMockFileSystem,
  createGeometryFile,
  createParameterDeclaration,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { createKernelParameterDeclaration } from '#kernels/kernel-module-helpers.js';
import { abortReason } from '#types/runtime-wire.types.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { admitJsonSchema } from '@taucad/parameters/schema';

const tessellationSchema = z.object({
  tessellation: z
    .object({
      linearTolerance: z.number().positive().default(0.1),
      angularTolerance: z.number().positive().default(15),
    })
    .default({ linearTolerance: 0.1, angularTolerance: 15 }),
});
const imageViewSchema = z.object({ id: z.string(), label: z.string().optional(), phi: z.number(), theta: z.number() });
const imageBaseSchema = z.object({
  width: z.number().int().positive().default(1024),
  height: z.number().int().positive().default(1024),
  includeAxes: z.boolean().default(false),
  includeLabel: z.boolean().default(false),
  includeScale: z.boolean().default(false),
  projection: z.enum(['perspective', 'orthographic']).default('perspective'),
});
const imageRouteSchema = z.union([
  imageBaseSchema
    .extend({
      mode: z.literal('single').default('single'),
      phi: z.number().default(60),
      theta: z.number().default(45),
    })
    .strict(),
  imageBaseSchema
    .extend({
      mode: z.literal('batch'),
      views: z.array(imageViewSchema).min(1),
    })
    .strict(),
]);
const imageEdgeSchemas = {
  png: imageRouteSchema,
  webp: imageRouteSchema,
  jpeg: imageRouteSchema,
} as const;
const strictStlExportSchema = z.object({ binary: z.boolean().default(true) }).strict();

// =============================================================================
// Test Helpers
// =============================================================================

async function flushMicrotasks(iterations = 100): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    // oxlint-disable-next-line no-await-in-loop -- Intentionally draining microtask queue
    await Promise.resolve();
  }
}

const noopLog: OnWorkerLog = () => {
  /* No-op */
};

function createConfiguredWorker(overrides?: Partial<MockKernelWorkerOptions>) {
  const filesystem = createMockFileSystem();
  filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, new Uint8Array([1, 2, 3])])),
  );

  return new MockKernelWorker({
    middleware: [],
    onLog: noopLog,
    filesystem,
    ...overrides,
  });
}

// oxlint-disable-next-line max-params -- The fixture mirrors document inputs at its many call sites.
async function openDocument(
  worker: MockKernelWorker,
  parameters: Record<string, unknown> = {},
  file = createGeometryFile('test.kcl'),
  settings: { documentId?: string; watch?: boolean; stage?: Record<string, Uint8Array<ArrayBuffer>> } = {},
): Promise<Parameters<NonNullable<MockKernelWorker['onEvaluated']>>[0]> {
  const { documentId = 'test-document', watch = false, stage } = settings;
  const evaluated = Promise.withResolvers<Parameters<NonNullable<MockKernelWorker['onEvaluated']>>[0]>();
  worker.onEvaluated = (event) => {
    if (event.documentId === documentId) {
      evaluated.resolve(event);
    }
  };
  worker.handleOpenDocument({ documentId, intent: 0, file, parameters, watch, stage });
  return evaluated.promise;
}

// oxlint-disable-next-line max-params -- The fixture keeps intent and settings explicit at call sites.
async function updateDocument(
  worker: MockKernelWorker,
  parameters: Record<string, unknown>,
  intent: number,
  settings: { documentId?: string; stage?: Record<string, Uint8Array<ArrayBuffer>> } = {},
): Promise<Parameters<NonNullable<MockKernelWorker['onEvaluated']>>[0]> {
  const { documentId = 'test-document', stage } = settings;
  const evaluated = Promise.withResolvers<Parameters<NonNullable<MockKernelWorker['onEvaluated']>>[0]>();
  worker.onEvaluated = (event) => {
    if (event.documentId === documentId && event.intent === intent) {
      evaluated.resolve(event);
    }
  };
  worker.handleUpdateDocument({ documentId, intent, parameters, stage });
  return evaluated.promise;
}

let exportOperationId = 0;
const exportDocument = async (worker: MockKernelWorker, target: string, options?: Record<string, unknown>) =>
  worker.exportDocument({
    documentId: 'test-document',
    operationId: `test-export-${++exportOperationId}`,
    target,
    options,
  });

let viewRequestId = 0;
async function openView(
  worker: MockKernelWorker,
  options?: Record<string, unknown>,
): Promise<Parameters<NonNullable<MockKernelWorker['onRendered']>>[0]> {
  const requestId = `test-view-${++viewRequestId}`;
  const rendered = Promise.withResolvers<Parameters<NonNullable<MockKernelWorker['onRendered']>>[0]>();
  worker.onRendered = (event) => {
    if (event.requestId === requestId) {
      rendered.resolve(event);
    }
  };
  worker.handleOpenView({ documentId: 'test-document', subscriptionId: requestId, requestId, view: 'model', options });
  return rendered.promise;
}

const documentArtifact = (worker: MockKernelWorker, documentId = 'test-document'): MaterializedRender | undefined =>
  (worker as unknown as { documents: Map<string, { current?: { artifact?: MaterializedRender } }> }).documents.get(
    documentId,
  )?.current?.artifact;

async function openWatchedDocument(
  worker: MockKernelWorker,
  file = createGeometryFile('test.ts'),
  parameters: Record<string, unknown> = {},
): Promise<void> {
  await openDocument(worker, parameters, file, { watch: true });
}

class FailingKernelWorker extends MockKernelWorker {
  protected override async onEvaluateForOwner(
    _owner: OperationOwner,
    _input: NativeBuildInput,
    _runtime: KernelRuntime,
  ): Promise<EvaluateResult> {
    throw new Error('Build failed: syntax error');
  }
}

class DependencyKernelWorker extends MockKernelWorker {
  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return { resolved: [entryPath, 'dep.ts'], unresolved: [] };
  }
}

class VolatileDependencyKernelWorker extends MockKernelWorker {
  private dependencyCalls = 0;

  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    this.dependencyCalls++;
    return { resolved: [entryPath, this.dependencyCalls === 1 ? 'first.ts' : 'second.ts'], unresolved: [] };
  }
}

/** Records the handles the framework released, standing in for a kernel that frees WASM memory. */
class DisposingKernelWorker extends MockKernelWorker {
  public readonly disposedHandles: unknown[] = [];

  /** Handle returned by every build. Left undefined to hand out a fresh handle per build. */
  public stableHandle: unknown;

  private builds = 0;

  protected override async onEvaluateForOwner(
    owner: OperationOwner,
    _input: NativeBuildInput,
    _runtime: KernelRuntime,
  ): Promise<EvaluateResult> {
    this.builds++;
    return this.completeFixtureEvaluation(new Uint8Array([1, 2, 3]), {
      handle: this.stableHandle ?? { build: this.builds },
      owner,
    });
  }

  protected override disposeNativeHandleForOwner(_owner: OperationOwner, nativeHandle: unknown): void {
    this.disposedHandles.push(nativeHandle);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('KernelWorker lifecycle', () => {
  class ParameterBoundaryWorker extends MockKernelWorker {
    public receivedParameters: Record<string, unknown> | undefined;

    protected override async onGetParameters(): Promise<GetParameterDeclarationsResult> {
      return createParameterDeclaration(
        { width: 10, height: 5 },
        {
          properties: {
            width: { type: 'double', ucumUnit: 'mm' },
            height: { type: 'double' },
          },
        },
      );
    }

    protected override async onEvaluateForOwner(
      owner: OperationOwner,
      input: NativeBuildInput,
      runtime: KernelRuntime,
    ): Promise<EvaluateResult> {
      this.receivedParameters = input.parameters;
      return super.onEvaluateForOwner(owner, input, runtime);
    }
  }

  const storedUnitBearingWidth = defineMiddleware({
    id: 'storedUnitBearingWidth',
    name: 'StoredUnitBearingWidth',
    async wrapEvaluate(input, handler) {
      return handler({ ...input, parameters: { width: '20 in', ...input.parameters } });
    },
  });

  it('should convert unit-bearing text at the kernel boundary', async () => {
    const worker = new ParameterBoundaryWorker({ middleware: [], onLog: noopLog });

    const result = await openDocument(worker, { width: '20 in' }, createGeometryFile('main.ts'));

    expect(result.success, JSON.stringify(result.issues)).toBe(true);
    expect(worker.receivedParameters?.['width']).toBeCloseTo(508);
    expect(worker.receivedParameters?.['height']).toBe(5);
  });

  it('should convert stored unit-bearing text and fill defaults on a document evaluation', async () => {
    const worker = new ParameterBoundaryWorker({ middleware: [storedUnitBearingWidth()], onLog: noopLog });

    const result = await openDocument(worker, {}, createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    expect(worker.receivedParameters?.['width']).toBeCloseTo(508);
    expect(worker.receivedParameters?.['height']).toBe(5);
  });

  it('should rematerialize an export with the converted default-filled parameters', async () => {
    class ExportParameterBoundaryWorker extends ParameterBoundaryWorker {
      public readonly receivedParameterHistory: Array<Readonly<Record<string, unknown>>> = [];

      public constructor(options: MockKernelWorkerOptions) {
        super(options);
        this.kernelCreateOptionsZodSchemaMap.set('mock-kernel', z.object({ tessellation: z.number() }));
      }

      protected override async onEvaluateForOwner(
        owner: OperationOwner,
        input: NativeBuildInput,
        runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        this.receivedParameterHistory.push(input.parameters);
        return super.onEvaluateForOwner(owner, input, runtime);
      }
    }
    const worker = new ExportParameterBoundaryWorker({
      middleware: [storedUnitBearingWidth()],
      onLog: noopLog,
      renderZodSchema: z.object({ tessellation: z.number().default(0.1) }),
      exportZodSchemas: { gltf: z.object({ tessellation: z.number().default(0.01) }) },
    });

    await openDocument(worker, {}, createGeometryFile('main.ts'));
    const result = await exportDocument(worker, 'gltf');

    expect(result.success).toBe(true);
    expect(worker.receivedParameterHistory).toHaveLength(2);
    for (const parameters of worker.receivedParameterHistory) {
      expect(parameters['width']).toBeCloseTo(508);
      expect(parameters['height']).toBe(5);
    }
  });

  it('should report SEMANTICS_UNRESOLVED for unit-bearing text on a field with no unit', async () => {
    const worker = new ParameterBoundaryWorker({ middleware: [], onLog: noopLog });

    const result = await openDocument(worker, { height: '20 in' }, createGeometryFile('main.ts'));

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected unit-less text to be refused');
    }
    expect(result.issues[0]?.code).toBe('SEMANTICS_UNRESOLVED');
    expect(result.issues[0]?.message).toMatch(/\/height.*20 in.*number|unit declaration/iu);
  });

  it('should pass a string that a mixed numeric-or-string field accepts', async () => {
    class MixedParameterWorker extends ParameterBoundaryWorker {
      protected override async onGetParameters(): Promise<GetParameterDeclarationsResult> {
        return createParameterDeclaration(
          {},
          {
            properties: {
              stock: {
                oneOf: [{ type: 'number' }, { type: 'string', enum: ['3mm-plate'] }],
              },
            },
          },
        );
      }
    }
    const worker = new MixedParameterWorker({ middleware: [], onLog: noopLog });

    const result = await openDocument(worker, { stock: '3mm-plate' }, createGeometryFile('main.ts'));

    expect(result.success).toBe(true);
    expect(worker.receivedParameters?.['stock']).toBe('3mm-plate');
  });

  it('should stop document evaluation, view, and export when parameter discovery fails', async () => {
    const issue: KernelIssue = {
      message: 'Workspace changed while reading current schema.',
      code: 'RUNTIME',
      type: 'runtime',
      severity: 'error',
    };
    const builds = vi.fn();
    class FailedParameterWorker extends MockKernelWorker {
      protected override async onGetParameters(): Promise<GetParameterDeclarationsResult> {
        return { success: false, issues: [issue] };
      }
      protected override async onEvaluateForOwner(
        owner: OperationOwner,
        input: NativeBuildInput,
        runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        builds();
        return super.onEvaluateForOwner(owner, input, runtime);
      }
    }
    const worker = new FailedParameterWorker({ middleware: [], onLog: noopLog });
    const file = createGeometryFile('main.ts');
    const parameters = { RadiusMm: 16 };
    try {
      const rendered: Array<Parameters<NonNullable<typeof worker.onRendered>>[0]> = [];
      worker.onRendered = (event) => rendered.push(event);
      const evaluated = await openDocument(worker, parameters, file);
      worker.handleOpenView({ documentId: 'test-document', subscriptionId: 'view', requestId: 'first', view: 'model' });
      expect(evaluated).toMatchObject({ success: false, issues: [issue] });
      await vi.waitFor(() => {
        expect(rendered).toEqual([expect.objectContaining({ success: false, issues: [issue] })]);
      });
      expect(await exportDocument(worker, 'gltf')).toMatchObject({ success: false, issues: [issue] });
      expect(builds).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });

  it('should replace parameter arrays across document evaluation, view, and export', async () => {
    const capturedParameters: Array<Record<string, unknown>> = [];
    class ArrayParameterWorker extends MockKernelWorker {
      protected override async onGetParameters(): Promise<GetParameterDeclarationsResult> {
        return createParameterDeclaration({
          sections: { planes: [{ point: [0, 0, 0] }], clipLines: true },
        });
      }

      protected override async onEvaluateForOwner(
        owner: OperationOwner,
        input: NativeBuildInput,
        runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        capturedParameters.push(input.parameters);
        return super.onEvaluateForOwner(owner, input, runtime);
      }
    }

    const worker = new ArrayParameterWorker({ middleware: [], onLog: noopLog });
    const file = createGeometryFile('main.ts');
    const parameters = { sections: { planes: [{ point: [1, 2, 3] }] } };
    const rendered = Promise.withResolvers<Parameters<NonNullable<typeof worker.onRendered>>[0]>();
    worker.onRendered = rendered.resolve;
    const evaluation = await openDocument(worker, parameters, file);
    worker.handleOpenView({ documentId: 'test-document', subscriptionId: 'view', requestId: 'first', view: 'model' });
    {
      const operationResult = await rendered.promise;
      expect(operationResult.success).toBe(true);
    }
    expect(evaluation.success).toBe(true);
    {
      const operationResult = await exportDocument(worker, 'gltf');
      expect(operationResult.success).toBe(true);
    }

    expect(capturedParameters).toEqual([{ sections: { planes: [{ point: [1, 2, 3] }], clipLines: true } }]);
  });

  // The producer projection drops an empty `properties` map, as PicoGK emits for a source without `Params`.
  it.each([
    {
      declares: 'other parameters',
      declaration: () =>
        createParameterDeclaration({}, { properties: { accepted: { type: 'string' } }, additionalProperties: false }),
    },
    {
      declares: 'no parameters',
      declaration: () =>
        createKernelSuccess(
          createKernelParameterDeclaration(
            {},
            { type: 'object', properties: {}, additionalProperties: false },
            { id: 'urn:taucad:test:closed', name: 'Closed' },
          ),
        ),
    },
  ])(
    'drops stale values that a changed closed schema declaring $declares no longer declares',
    async ({ declaration }) => {
      const capturedParameters: Array<Record<string, unknown>> = [];
      class ClosedParameterWorker extends MockKernelWorker {
        protected override async onGetParameters(): Promise<GetParameterDeclarationsResult> {
          return declaration();
        }

        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          capturedParameters.push(input.parameters);
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }

      const restorePersistedParameters = defineMiddleware({
        id: 'restorePersistedParameters',
        name: 'RestorePersistedParameters',
        async wrapEvaluate(input, handler) {
          return handler({ ...input, parameters: { ...input.parameters, RadiusMm: 16 } });
        },
      });
      const worker = new ClosedParameterWorker({ middleware: [restorePersistedParameters()], onLog: noopLog });
      const file = createGeometryFile('main.cs');
      const parameters = { RadiusMm: 16 };
      await openDocument(worker, parameters, file);
      {
        const operationResult = await exportDocument(worker, 'gltf');
        expect(operationResult.success).toBe(true);
      }

      expect(capturedParameters).toEqual([{}]);
    },
  );

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('host-compiled wasm modules', () => {
    /* A host and a kernel derive the same asset's URL through different bundles; when they
     * disagree the supply is silently dead weight (D20). */
    it('hands a kernel the module supplied for its url and reports a miss against a supplied set', async () => {
      const onLog = vi.fn();
      const worker = createConfiguredWorker({ onLog });
      const module = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      worker.setCompiledWasmModules([{ url: 'https://example.test/occt-multi.wasm', module }]);
      const runtime = (worker as unknown as { createRuntime(): KernelRuntime }).createRuntime();

      expect(runtime.getCompiledWasmModule('https://example.test/occt-multi.wasm')).toBe(module);
      expect(onLog).not.toHaveBeenCalled();

      expect(runtime.getCompiledWasmModule('https://example.test/occt-single.wasm')).toBeUndefined();
      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped.
          message: expect.stringContaining('occt-single.wasm'),
          data: {
            requested: 'https://example.test/occt-single.wasm',
            supplied: ['https://example.test/occt-multi.wasm'],
          },
        }),
      );
    });

    it('stays silent when no host supplied anything', () => {
      const onLog = vi.fn();
      const worker = createConfiguredWorker({ onLog });
      const runtime = (worker as unknown as { createRuntime(): KernelRuntime }).createRuntime();

      expect(runtime.getCompiledWasmModule('https://example.test/occt-multi.wasm')).toBeUndefined();
      expect(onLog).not.toHaveBeenCalled();
    });
  });

  describe('bundler filesystem', () => {
    /* `detect` and `bundle` traverse the same graph, and a module imported by ten others was
     * probed once per edge: 146 filesystem operations for a 7-module cold open (D15). */
    it('serves the bundler one probe and one read per path, and releases both at the operation boundary', async () => {
      const filesystem = createMockFileSystem({ existsResult: true, readFileResult: 'export const a = 1;' });
      const worker = createConfiguredWorker({ filesystem });
      const view = (worker as unknown as { bundlerFilesystem: KernelFileSystem }).bundlerFilesystem;

      await view.exists('lib/a.ts');
      await view.exists('lib/a.ts');
      expect(await view.readFile('lib/a.ts', 'utf8')).toBe('export const a = 1;');
      await view.readFile('lib/a.ts');

      expect(filesystem.mocks.exists).toHaveBeenCalledOnce();
      expect(filesystem.mocks.readFile).toHaveBeenCalledOnce();

      // A changed path drops its content, and the next operation re-probes.
      await worker.notifyFileChanged(['lib/a.ts']);
      await view.exists('lib/a.ts');
      await view.readFile('lib/a.ts');

      expect(filesystem.mocks.exists).toHaveBeenCalledTimes(2);
      expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('source snapshots', () => {
    it('rejects pre-aborted request-scoped parameter resolution before reading source', async () => {
      const filesystem = createMockFileSystem();
      const worker = createConfiguredWorker({ filesystem });
      const controller = new AbortController();
      controller.abort();

      await expect(
        worker.getParameters(createGeometryFile('main.ts'), { mode: 'declared-only' }, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(filesystem.mocks.readFiles).not.toHaveBeenCalled();
    });

    it('returns the coherent relevant closure with owned bytes without evaluating geometry', async () => {
      const contents = {
        'main.ts': new Uint8Array([1, 2]),
        'dep.ts': new Uint8Array([3, 4]),
        'tau.json': new Uint8Array([5, 6]),
      };
      const filesystem = createMockFileSystem({ existsResult: (path) => path in contents });
      filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
        Object.fromEntries(paths.map((path) => [path, contents[path as keyof typeof contents]])),
      );
      const worker = new DependencyKernelWorker({ middleware: [], onLog: noopLog, filesystem });

      const result = await worker.snapshotSource({
        file: createGeometryFile('main.ts'),
        additionalPaths: [
          { path: 'tau.json', required: true },
          { path: 'package.json', required: false },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      expect(result.data.files.map(({ path, role }) => [path, role])).toEqual([
        ['dep.ts', 'kernel-dependency'],
        ['main.ts', 'entry'],
        ['tau.json', 'additional'],
      ]);
      expect(result.data.files.every(({ sha256 }) => /^[0-9a-f]{64}$/u.test(sha256))).toBe(true);
      expect(result.data.unresolvedPaths).toEqual([]);
      expect(worker.createGeometryCalls).toBe(0);
      result.data.files[0]!.content[0] = 99;
      expect(contents['dep.ts'][0]).toBe(3);

      const controller = new AbortController();
      controller.abort();
      await expect(
        worker.snapshotSource({ file: createGeometryFile('main.ts') }, controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it.each(['missing', 'present'] as const)(
      'should snapshot a normal %s optional middleware sidecar without unresolved inputs',
      async (presence) => {
        const sidecarPath = '.tau/parameters/main.ts.json';
        const contents: Record<string, Uint8Array<ArrayBuffer>> = {
          'main.ts': new Uint8Array([1, 2]),
          'dep.ts': new Uint8Array([3, 4]),
        };
        if (presence === 'present') {
          contents[sidecarPath] = new TextEncoder().encode(
            JSON.stringify({ activeGroup: 'default', groups: { default: { values: {} } } }),
          );
        }
        const filesystem = createMockFileSystem({ existsResult: (path) => path in contents });
        filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
          Object.fromEntries(paths.map((path) => [path, contents[path]!])),
        );
        const middleware = defineMiddleware({
          id: 'optional-sidecar',
          name: 'OptionalSidecar',
          resolve: () => [{ path: sidecarPath, affects: ['evaluate'] }],
        });
        const worker = new DependencyKernelWorker({ middleware: [middleware], onLog: noopLog, filesystem });
        try {
          const result = await worker.snapshotSource({ file: createGeometryFile('main.ts') });
          expect(result.success).toBe(true);
          if (!result.success) {
            return;
          }
          expect(result.issues).toEqual([]);
          expect(result.data.unresolvedPaths).toEqual([]);
          expect(result.data.files.map(({ path }) => path)).toEqual(Object.keys(contents).sort());
          const sidecar = result.data.files.find(({ path }) => path === sidecarPath);
          if (presence === 'present') {
            expect(sidecar?.role).toBe('middleware-dependency');
            expect(sidecar?.content).toEqual(contents[sidecarPath]);
            expect(sidecar?.sha256).toMatch(/^[0-9a-f]{64}$/u);
          } else {
            expect(sidecar).toBeUndefined();
          }
          expect(filesystem.mocks.exists).toHaveBeenCalledWith(sidecarPath);
          expect(worker.createGeometryCalls).toBe(0);
        } finally {
          await worker.cleanup();
        }
      },
    );

    it('fails closed when a required file is absent or the dependency graph changes', async () => {
      const missingFilesystem = createMockFileSystem({ existsResult: (path) => path !== 'tau.json' });
      missingFilesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1]),
        'dep.ts': new Uint8Array([2]),
      });
      const missingWorker = new DependencyKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem: missingFilesystem,
      });
      await expect(
        missingWorker.snapshotSource({
          file: createGeometryFile('main.ts'),
          additionalPaths: [{ path: 'tau.json', required: true }],
        }),
      ).resolves.toMatchObject({ success: false, issues: [{ code: 'SOURCE_SNAPSHOT_INVALID' }] });

      const changingFilesystem = createMockFileSystem({ existsResult: true });
      changingFilesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
        Object.fromEntries(paths.map((path) => [path, new Uint8Array([1])])),
      );
      const changingWorker = new VolatileDependencyKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem: changingFilesystem,
      });
      await expect(changingWorker.snapshotSource({ file: createGeometryFile('main.ts') })).resolves.toMatchObject({
        success: false,
        issues: [{ code: 'SOURCE_SNAPSHOT_CHANGED' }],
      });

      const changingContentFilesystem = createMockFileSystem({ existsResult: true });
      let readCount = 0;
      changingContentFilesystem.mocks.readFiles.mockImplementation(async (paths: string[]) => {
        readCount++;
        return Object.fromEntries(paths.map((path) => [path, new Uint8Array([readCount])]));
      });
      const changingContentWorker = new DependencyKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem: changingContentFilesystem,
      });
      await expect(
        changingContentWorker.snapshotSource({ file: createGeometryFile('main.ts') }),
      ).resolves.toMatchObject({
        success: false,
        issues: [{ code: 'SOURCE_SNAPSHOT_CHANGED' }],
      });
    });
  });

  it('should warn exactly once per initialize when cross-origin isolation is degraded', async () => {
    const isolatedLog = vi.fn<OnWorkerLog>();
    await createConfiguredWorker().initialize({
      callbacks: { onLog: isolatedLog },
      transferables: {},
      options: {},
    });
    expect(isolatedLog.mock.calls.filter(([entry]) => entry.level === logLevels.warn)).toEqual([]);

    vi.stubGlobal('crossOriginIsolated', false);
    const degradedLog = vi.fn<OnWorkerLog>();
    await createConfiguredWorker().initialize({
      callbacks: { onLog: degradedLog },
      transferables: {},
      options: {},
    });

    const warnings = degradedLog.mock.calls.filter(([entry]) => entry.level === logLevels.warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.[0].message).toContain('no-coep');
  });

  // ---------------------------------------------------------------------------
  // Watch subscription on error path
  // ---------------------------------------------------------------------------

  describe('watch subscription on error', () => {
    it('should retain the entry subscription when createGeometry fails', async () => {
      const filesystem = createMockFileSystem({ readFileResult: new Uint8Array([1, 2, 3]) });
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      await openDocument(worker, {}, createGeometryFile('main.ts'), { watch: true });

      expect(worker.getWatchedPaths()).toContain('main.ts');
    });

    it('should include entry path in watch set when build produces empty dependencies', async () => {
      const worker = createConfiguredWorker();
      await openDocument(worker, {}, createGeometryFile('main.ts'), { watch: true });

      expect(worker.getWatchedPaths()).toContain('main.ts');
    });
  });

  // ---------------------------------------------------------------------------
  // Render generation and execution ownership correctness
  // ---------------------------------------------------------------------------

  describe('render execution ownership', () => {
    it('serializes a superseding render behind the active render', async () => {
      let resolveGateA!: () => void;
      const gateA = new Promise<void>((resolve) => {
        resolveGateA = resolve;
      });
      let resolveGateB!: () => void;
      const gateB = new Promise<void>((resolve) => {
        resolveGateB = resolve;
      });
      let enteredA!: () => void;
      const renderAEntered = new Promise<void>((resolve) => {
        enteredA = resolve;
      });
      let enteredB!: () => void;
      const renderBEntered = new Promise<void>((resolve) => {
        enteredB = resolve;
      });
      let createGeometryCallCount = 0;

      class GatedKernelWorker extends MockKernelWorker {
        protected override async onEvaluateForOwner(): Promise<EvaluateResult> {
          createGeometryCallCount++;
          const isFirst = createGeometryCallCount === 1;
          (isFirst ? enteredA : enteredB)();
          await (isFirst ? gateA : gateB);
          return this.completeFixtureEvaluation(new Uint8Array([1]));
        }
      }

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new GatedKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      worker.handleOpenDocument({
        documentId: 'test-document',
        intent: 0,
        file: createGeometryFile('main.ts'),
        parameters: { revision: 1 },
        watch: false,
      });
      await renderAEntered;

      worker.handleUpdateDocument({ documentId: 'test-document', intent: 1, parameters: { revision: 2 } });
      await flushMicrotasks();
      expect(createGeometryCallCount).toBe(1);

      resolveGateA();
      await renderBEntered;
      expect(createGeometryCallCount).toBe(2);

      resolveGateB();
      await flushMicrotasks();
    });
  });

  // ---------------------------------------------------------------------------
  // bundleResultCache invalidation
  // ---------------------------------------------------------------------------

  describe('native handle ownership', () => {
    const createDisposingWorker = (): DisposingKernelWorker =>
      new DisposingKernelWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });

    it('releases the replaced handle when a rebuild publishes a new one', async () => {
      const worker = createDisposingWorker();

      await openDocument(worker, { size: 1 });
      expect(worker.disposedHandles).toEqual([]);

      await updateDocument(worker, { size: 2 }, 1);
      await vi.waitFor(() => {
        expect(worker.disposedHandles).toEqual([{ build: 1 }]);
      });
    });

    it('retains a handle reused across builds and releases it once on cleanup', async () => {
      const worker = createDisposingWorker();
      const sharedHandle = { shared: true };
      worker.stableHandle = sharedHandle;

      await openDocument(worker, { size: 1 });
      await updateDocument(worker, { size: 2 }, 1);
      expect(worker.disposedHandles).toEqual([]);

      await worker.cleanup();

      expect(worker.disposedHandles).toEqual([sharedHandle]);
    });

    it('releases equal primitive handle IDs once per evaluation generation', async () => {
      const worker = createDisposingWorker();
      worker.stableHandle = 0;

      await openDocument(worker, { size: 1 });
      await updateDocument(worker, { size: 2 }, 1);
      await vi.waitFor(() => {
        expect(worker.disposedHandles).toEqual([0]);
      });

      await worker.cleanup();
      expect(worker.disposedHandles).toEqual([0, 0]);
    });

    it('keeps a document handle pinned while newer documents evaluate', async () => {
      const worker = createDisposingWorker();
      await openDocument(worker, { size: 1 }, createGeometryFile('test.kcl'), { documentId: 'first' });
      await openDocument(worker, { size: 2 }, createGeometryFile('test.kcl'), { documentId: 'second' });
      expect(worker.disposedHandles).toEqual([]);
      await updateDocument(worker, { size: 3 }, 1, { documentId: 'second' });
      await vi.waitFor(() => {
        expect(worker.disposedHandles).toEqual([{ build: 2 }]);
      });
      await worker.cleanup();
      expect(worker.disposedHandles).toEqual([{ build: 2 }, { build: 1 }, { build: 3 }]);
    });

    it('releases a replaced request slot once and leaves its lazy snapshot unread', async () => {
      let snapshotReads = 0;
      class SnapshotWorker extends DisposingKernelWorker {
        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          const result = await super.onEvaluateForOwner(owner, input, runtime);
          return result.success ? { ...result, serializeHandleSnapshot: () => ({ read: ++snapshotReads }) } : result;
        }
      }
      const worker = new SnapshotWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      await openDocument(worker, { size: 1 });
      const oldSlot = (
        worker as unknown as {
          retainedEvaluation?: { serializedNativeHandleSlot?: { serializedNativeHandle: unknown } };
        }
      ).retainedEvaluation;
      expect(snapshotReads).toBe(0);
      await updateDocument(worker, { size: 2 }, 1);
      await vi.waitFor(() => {
        expect(worker.disposedHandles).toEqual([{ build: 1 }]);
      });
      expect(oldSlot?.serializedNativeHandleSlot?.serializedNativeHandle).toBeUndefined();
      expect(snapshotReads).toBe(0);
      await worker.cleanup();
      expect(worker.disposedHandles).toEqual([{ build: 1 }, { build: 2 }]);
    });

    it('releases a restored handle once after its published slot is replaced', async () => {
      class RestoringWorker extends DisposingKernelWorker {
        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          const result = await super.onEvaluateForOwner(owner, input, runtime);
          return result.success ? { ...result, serializedHandle: { snapshot: true } } : result;
        }

        protected override async deserializeNativeHandleForOwner(): Promise<unknown> {
          return { restored: true };
        }
      }
      const worker = new RestoringWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      await openDocument(worker, { size: 1 });
      const artifact = (
        worker as unknown as { documents: Map<string, { current?: { artifact?: MaterializedRender } }> }
      ).documents.get('test-document')?.current?.artifact;
      artifact!.liveNativeHandleSlot = undefined;
      const exported = await exportDocument(worker, 'gltf');
      expect(exported.success).toBe(true);
      expect(worker.disposedHandles).toEqual([{ build: 1 }]);
      await updateDocument(worker, { size: 2 }, 1);
      await vi.waitFor(() => {
        expect(worker.disposedHandles).toEqual([{ build: 1 }, { restored: true }]);
      });
      await worker.cleanup();
      expect(worker.disposedHandles).toEqual([{ build: 1 }, { restored: true }, { build: 2 }]);
    });

    it('does not pin or export an older handle after the newest evaluation fails', async () => {
      class FailingWorker extends DisposingKernelWorker {
        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          if (input.parameters['size'] === 2) {
            return {
              success: false,
              issues: [{ code: 'RUNTIME', type: 'kernel', severity: 'error', message: 'build failed' }],
            };
          }
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }
      const worker = new FailingWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      const first = await openDocument(worker, { size: 1 });
      const second = await updateDocument(worker, { size: 2 }, 1);
      expect(first.success).toBe(true);
      expect(second.success).toBe(false);
      const exported = await exportDocument(worker, 'gltf');
      expect(exported.success).toBe(false);
      await worker.cleanup();
      expect(worker.disposedHandles).toEqual([{ build: 1 }]);
    });

    it('reuses a completed evaluation after its request is superseded before projection', async () => {
      class SupersededWorker extends MockKernelWorker {
        public supersede?: () => void;
        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          const result = await super.onEvaluateForOwner(owner, input, runtime);
          this.supersede?.();
          return result;
        }
      }
      const worker = new SupersededWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      const settled = Promise.withResolvers<Parameters<NonNullable<typeof worker.onEvaluated>>[0]>();
      worker.onEvaluated = (event) => {
        if (event.intent === 1) {
          settled.resolve(event);
        }
      };
      worker.supersede = () => {
        worker.handleUpdateDocument({ documentId: 'doc', intent: 1, parameters: {} });
      };
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 0,
        file: createGeometryFile('test.kcl'),
        parameters: {},
        watch: false,
      });
      const result = await settled.promise;
      expect(result.success).toBe(true);
      expect(worker.createGeometryCalls).toBe(1);
      await worker.cleanup();
    });

    it('disposes a superseded materialization handle after unwind without publishing it', async () => {
      const entered = Promise.withResolvers<void>();
      const gate = Promise.withResolvers<void>();

      class SupersededHandleWorker extends DisposingKernelWorker {
        private calls = 0;

        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          this.calls++;
          if (this.calls !== 1) {
            return super.onEvaluateForOwner(owner, input, runtime);
          }

          const handle = { superseded: true };
          this.captureNativeHandle(handle, owner);
          entered.resolve();
          await gate.promise;
          runtime.signal.throwIfAborted();
          return this.completeFixtureEvaluation(new Uint8Array([1]), { handle, owner });
        }
      }

      const worker = new SupersededHandleWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      const evaluated: number[] = [];
      worker.onEvaluated = ({ intent }) => evaluated.push(intent);
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 0,
        file: createGeometryFile('main.ts'),
        parameters: {},
        watch: false,
      });
      await entered.promise;
      worker.handleUpdateDocument({ documentId: 'doc', intent: 1, parameters: { size: 2 } });
      gate.resolve();
      await vi.waitFor(() => {
        expect(evaluated).toEqual([1]);
      });

      expect(worker.disposedHandles).toEqual([{ superseded: true }]);
    });
  });

  describe('bundleResultCache invalidation', () => {
    it('should invalidate bundleResultCache entry when changed path matches the entry key directly', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('main.ts', {
        code: '',
        dependencies: [],
        unresolvedPaths: [],
        issues: [
          {
            message: 'Unterminated regular expression',
            code: 'BUNDLER_FAILED',
            type: 'compilation',
            severity: 'error',
          },
        ],
        success: false,
      });

      await worker.notifyFileChanged(['main.ts']);

      // @ts-expect-error - accessing private for test verification
      expect(worker.bundleResultCache.has('main.ts')).toBe(false);
    });

    it('should invalidate bundleResultCache via watch handler when changed path matches entry key', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('main.ts', {
        code: '',
        dependencies: [],
        unresolvedPaths: [],
        issues: [{ message: 'Syntax error', code: 'BUNDLER_FAILED', type: 'compilation', severity: 'error' }],
        success: false,
      });

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
      void worker.reconcileWatchSet(new Map([['main.ts', 50]]));
      await vi.waitFor(() => {
        expect(capturedWatchCallback).toBeDefined();
      });

      capturedWatchCallback!({ type: 'change', path: 'main.ts' });

      await vi.waitFor(() => {
        // @ts-expect-error - accessing private for test verification
        expect(worker.bundleResultCache.has('main.ts')).toBe(false);
      });
    });

    it('should install no subscription when the inline filesystem exposes no watch', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.fileSystem = { dispose: vi.fn(), listen: vi.fn() };

      // @ts-expect-error - exercising the private observation handoff seam
      await worker.reconcileWatchSet(new Map([['main.ts', 50]]));

      // The watcherless arm still records the desired set (explicit operations
      // reread through it) but must leave no subscription to dispose.
      expect(worker.getWatchedPaths()).toEqual(new Set(['main.ts']));
      // @ts-expect-error - accessing private for test verification
      expect(worker.watchUnsubscribe).toBeUndefined();
    });
  });

  describe('inline filesystem watch readiness', () => {
    it('should await a real watchReady before completing watch reconciliation', async () => {
      const worker = createConfiguredWorker();
      const armed = Promise.withResolvers<void>();
      const unsubscribe = vi.fn();
      // A socket-backed inline filesystem registers its watch with a round trip,
      // so its own `ready` — not a synthesised resolved promise — gates the
      // post-subscribe hash revalidation.
      const inlineFileSystem = Object.assign(createMockFileSystem(), {
        watch: vi.fn(() => unsubscribe),
        watchReady: vi.fn(() => ({
          unsubscribe,
          ready: armed.promise,
          closed: new Promise<void>(() => {
            // This synthetic watch stays open for the duration of the test.
          }),
        })),
      });

      await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });

      let settled = false;
      const reconciled = (async () => {
        // @ts-expect-error - exercising the private observation handoff seam
        await worker.reconcileWatchSet(new Map([['main.ts', 50]]));
        settled = true;
      })();
      await vi.waitFor(() => {
        expect(inlineFileSystem.watchReady).toHaveBeenCalledOnce();
      });

      expect(settled).toBe(false);
      expect(inlineFileSystem.watchReady).toHaveBeenCalledOnce();

      armed.resolve();
      await reconciled;

      expect(worker.getWatchedPaths()).toEqual(new Set(['main.ts']));
      await worker.cleanup();
    });

    it('does not supersede the arming render when the watch replays a pre-arm write', async () => {
      /* Measured on macOS: `fs.watch` delivers a `change` for the entry a few
       * milliseconds after the arm, replaying the write that created the file
       * just before the client connected. Nothing has hashed `main.ts` yet, so
       * without a baseline recorded at arm time the replay reads as a change
       * against `undefined`, schedules an autonomous re-render, and aborts the
       * explicit render that armed the watch — which then reaches terminal
       * `idle` with no geometry and settles as `{ superseded: true }`. */
      const entryBytes = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': entryBytes });
      filesystem.mocks.readFile.mockResolvedValue(entryBytes);

      const inlineFileSystem = Object.assign(filesystem, {
        watch: vi.fn(() => vi.fn()),
        watchReady: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          handler({ type: 'change', path: 'main.ts' });
          return {
            unsubscribe: vi.fn(),
            ready: Promise.resolve(),
            closed: new Promise<void>(() => {
              // This synthetic watch stays open for the duration of the test.
            }),
          };
        }),
      });

      /* Dependency discovery is the first step of the render that follows the
       * arm, so holding it open puts the replay exactly where the measured
       * failure put it: after the watch is live, before anything has hashed the
       * entry (`cachedHashes=[["main.ts", null]]`). */
      const discovering = Promise.withResolvers<void>();
      const releaseDiscovery = Promise.withResolvers<void>();
      class GatedKernelWorker extends MockKernelWorker {
        protected override async onGetDependencies({
          entryPath,
        }: GetDependenciesInput): Promise<GetDependenciesResult> {
          discovering.resolve();
          await releaseDiscovery.promise;
          return { resolved: [entryPath], unresolved: [] };
        }
      }

      const worker = new GatedKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
      const evaluated = Promise.withResolvers<Parameters<NonNullable<typeof worker.onEvaluated>>[0]>();
      worker.onEvaluated = evaluated.resolve;
      worker.handleOpenDocument({
        documentId: 'arming',
        intent: 0,
        file: createGeometryFile('main.ts'),
        parameters: {},
        watch: true,
      });
      await discovering.promise;
      releaseDiscovery.resolve();

      {
        const operationResult = await evaluated.promise;

        expect(operationResult.success).toBe(true);
      }
      expect(worker.createGeometryCalls).toBe(1);
      await worker.cleanup();
    });

    it('should publish only fresh source when the first operation mirror changes during dependency discovery', async () => {
      const starter = new TextEncoder().encode(kernelConfigurations[0].emptyCode);
      const authored = new TextEncoder().encode(`using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;
Library.Go(Params.VoxelSizeMm, () =>
{
    var radius = Params.RadiusMm;
    Library.oViewer().SetGroupMaterial(0, "3159cf", 0f, 0.7f);
    Library.oViewer().SetGroupMaterial(1, "f2b134", 0f, 0.7f);
    Library.oViewer().Add(Utils.mshCreateCube(new Vector3(radius, radius * 0.5f, radius * 0.25f)), 0);
    Library.oViewer().Add(Voxels.voxSphere(new Vector3(radius * 2f, 0, 0), radius * 0.5f), 1);
});

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 1f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Order = 1)]
    public static float RadiusMm { get; set; } = 12f;
}
`);
      const sourceHash = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
      expect(starter.byteLength).toBe(313);
      expect(authored.byteLength).toBe(761);
      expect(sourceHash(starter)).toBe('76af0745e78534f33045a8ba17f071d02a578e185405c129f1679cfae2e02ea2');
      expect(sourceHash(authored)).toBe('7ff51d066da3d5abf7401ab0451d768daebaef0827a3e41c3ed9a4d3db8d1068');
      let authoritativeBytes = starter;
      const filesystem = createMockFileSystem({ readFileResult: () => authoritativeBytes });
      filesystem.mocks.readFiles.mockImplementation(async () => ({ 'main.cs': authoritativeBytes }));
      filesystem.mocks.writeFile.mockImplementation(async (_path: string, bytes: Uint8Array<ArrayBuffer>) => {
        authoritativeBytes = bytes;
      });
      let deliverWatchEvent!: (event: WatchEvent) => void;
      const inlineFileSystem = Object.assign(filesystem, {
        watch: vi.fn(() => vi.fn()),
        watchReady: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          deliverWatchEvent = handler;
          return {
            unsubscribe: vi.fn(),
            ready: Promise.resolve(),
            closed: new Promise<void>(() => {
              // The controlled subscription stays open until worker cleanup.
            }),
          };
        }),
      });
      const mirrored = Promise.withResolvers<void>();
      const releaseDiscovery = Promise.withResolvers<void>();
      const snapshots = new Map<number, Uint8Array<ArrayBuffer>>();
      const builds: Array<{ operationId: number; hash: string }> = [];
      class MirroredKernelWorker extends MockKernelWorker {
        protected override async onGetDependencies(
          { entryPath }: GetDependenciesInput,
          runtime: KernelRuntime,
        ): Promise<GetDependenciesResult> {
          if (runtime.operationId === undefined) {
            throw new Error('The controlled kernel has no operation identity.');
          }

          if (!snapshots.has(runtime.operationId)) {
            snapshots.set(runtime.operationId, await runtime.filesystem.readFile(entryPath));
          }
          if (snapshots.size === 1) {
            mirrored.resolve();
            await releaseDiscovery.promise;
          }
          return { resolved: [entryPath], unresolved: [] };
        }

        protected override async onEvaluateForOwner(
          _owner: OperationOwner,
          _input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          const bytes = runtime.operationId === undefined ? undefined : snapshots.get(runtime.operationId);
          if (bytes === undefined || runtime.operationId === undefined) {
            throw new Error('The geometry operation has no admitted mirror.');
          }

          builds.push({ operationId: runtime.operationId, hash: sourceHash(bytes) });
          return this.completeFixtureEvaluation(bytes);
        }
      }

      const worker = new MirroredKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
      const evaluations: Array<Parameters<NonNullable<MockKernelWorker['onEvaluated']>>[0]> = [];
      worker.onEvaluated = (event) => evaluations.push(event);
      try {
        worker.handleOpenDocument({
          documentId: 'test-document',
          intent: 0,
          file: createGeometryFile('main.cs'),
          parameters: {},
          watch: true,
        });
        await mirrored.promise;
        const [initialOperation] = snapshots.keys();
        expect(initialOperation).toBeDefined();
        await filesystem.writeFile('main.cs', authored);
        deliverWatchEvent({ type: 'change', path: 'main.cs' });
        releaseDiscovery.resolve();
        await vi.waitFor(() => {
          expect(
            builds.map(({ hash }) => hash),
            JSON.stringify({ builds, published: evaluations }),
          ).toContain(sourceHash(authored));
          expect(builds.some((build) => build.operationId !== initialOperation)).toBe(true);
          expect(evaluations).toHaveLength(1);
          expect(evaluations[0]?.sourceRevision?.files['main.cs']).toBe(`sha256:${sourceHash(authored)}`);
        });
        expect(evaluations[0]?.success).toBe(true);
        const rendered = await openView(worker);
        if (!rendered.success) {
          expect.fail('The selected document did not publish successful geometry.');
        }
        expect(rendered.artifact.content).toEqual(authored);
        if (typeof rendered.artifact.content === 'string') {
          expect.fail('The selected GLB view did not publish binary geometry.');
        }
        expect(sourceHash(rendered.artifact.content)).toBe(sourceHash(authored));
      } finally {
        releaseDiscovery.resolve();
        await worker.cleanup();
      }
    });

    it('publishes the arming render when a newly watched path replays identical content', async () => {
      const entryBytes = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': entryBytes, 'dep.ts': entryBytes });
      filesystem.mocks.readFile.mockResolvedValue(entryBytes);
      let watchCount = 0;
      const inlineFileSystem = Object.assign(filesystem, {
        watch: vi.fn(() => vi.fn()),
        watchReady: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchCount += 1;
          if (watchCount === 2) {
            handler({ type: 'change', path: 'dep.ts' });
          }
          return {
            unsubscribe: vi.fn(),
            ready: Promise.resolve(),
            closed: new Promise<void>(() => {
              // This synthetic watch stays open for the duration of the test.
            }),
          };
        }),
      });
      class DependencyKernelWorker extends MockKernelWorker {
        protected override async onGetDependencies({
          entryPath,
        }: GetDependenciesInput): Promise<GetDependenciesResult> {
          return { resolved: [entryPath, 'dep.ts'], unresolved: [] };
        }
      }
      const worker = new DependencyKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
      const evaluated = await openDocument(worker, {}, createGeometryFile('main.ts'), { watch: true });
      expect(evaluated.success).toBe(true);
      expect(worker.createGeometryCalls).toBe(1);
      await worker.cleanup();
    });

    it.each(['missing', 'io-error'] as const)(
      'should distinguish %s while baselining an unknown watch path',
      async (kind) => {
        const failure = Object.assign(new Error(kind === 'missing' ? 'Missing entry' : 'Entry read refused'), {
          code: kind === 'missing' ? 'ENOENT' : 'EIO',
        });
        const filesystem = createMockFileSystem();
        filesystem.mocks.readFile.mockRejectedValue(failure);
        const watch = vi.fn(() => vi.fn());
        const inlineFileSystem = Object.assign(filesystem, { watch });
        const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
        await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
        try {
          // @ts-expect-error -- exercise the owning watch handoff without invoking a kernel on unreadable source.
          const reconciliation = worker.reconcileWatchSet(new Map([['main.cs', 50]]));
          if (kind === 'missing') {
            await expect(reconciliation).resolves.toBe(true);
            expect(watch).toHaveBeenCalledOnce();
            expect(worker.getWatchedPaths()).toEqual(new Set(['main.cs']));
            // @ts-expect-error -- inspect the existing revision ledger's absence sentinel, not a new cache owner.
            expect(worker.fileHashCache.get('main.cs')).toBe('missing');
          } else {
            await expect(reconciliation).rejects.toBe(failure);
            expect(watch).not.toHaveBeenCalled();
            expect(worker.getWatchedPaths()).toEqual(new Set());
          }
        } finally {
          await worker.cleanup();
        }
      },
    );

    it.each(['cleanup', 'supersession'] as const)(
      'should refuse a pending unknown-path baseline after %s',
      async (kind) => {
        const reading = Promise.withResolvers<void>();
        const releaseRead = Promise.withResolvers<void>();
        const filesystem = createMockFileSystem();
        filesystem.mocks.readFile.mockImplementation(async () => {
          reading.resolve();
          await releaseRead.promise;
          return new Uint8Array([1, 2, 3]);
        });
        const watch = vi.fn(() => vi.fn());
        const inlineFileSystem = Object.assign(filesystem, { watch });
        const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
        await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
        try {
          // @ts-expect-error -- hold the existing watch handoff before any subscription is installed.
          const reconciliation = worker.reconcileWatchSet(new Map([['main.cs', 50]]));
          await reading.promise;
          const cleanup = kind === 'cleanup' ? worker.cleanup() : undefined;
          if (kind === 'supersession') {
            worker.handleOpenDocument({
              documentId: 'successor',
              intent: 0,
              file: createGeometryFile('successor.ts'),
              parameters: {},
              watch: false,
            });
          }
          releaseRead.resolve();
          await expect(reconciliation).resolves.toBe(false);
          await cleanup;
          expect(watch).not.toHaveBeenCalled();
          expect(worker.getWatchedPaths()).toEqual(new Set());
          // @ts-expect-error -- stale bytes must not enter the existing revision ledger after the admission fence.
          expect(worker.fileHashCache.has('main.cs')).toBe(false);
        } finally {
          releaseRead.resolve();
          await worker.cleanup();
        }
      },
    );

    it('stops replacement validation when cleanup closes admission during an identical replay', async () => {
      const entryBytes = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem();
      const validationStarted = Promise.withResolvers<void>();
      const unsubscribe = vi.fn();
      let deliverWatchEvent!: (event: WatchEvent) => void;
      const inlineFileSystem = Object.assign(filesystem, {
        watch: vi.fn(() => unsubscribe),
        watchReady: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          deliverWatchEvent = handler;
          return {
            unsubscribe,
            ready: Promise.resolve(),
            closed: new Promise<void>(() => {
              // This synthetic watch stays open until cleanup rejects its replacement.
            }),
          };
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
      // @ts-expect-error - seed the already-hashed dependency at the private watch handoff seam
      worker.fileHashCache.set('dep.ts', await worker.hashContent(entryBytes));
      filesystem.mocks.readFile.mockImplementation(async () => {
        deliverWatchEvent({ type: 'change', path: 'dep.ts' });
        validationStarted.resolve();
        return entryBytes;
      });

      // @ts-expect-error - exercise replacement validation independently of render setup
      const reconciliation = worker.reconcileWatchSet(new Map([['dep.ts', 50]]));
      await validationStarted.promise;
      const cleanup = worker.cleanup();

      await expect(reconciliation).resolves.toBe(false);
      await cleanup;
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(worker.getWatchedPaths()).toEqual(new Set());
    });

    it.each([
      {
        event: { type: 'change', path: 'dep.ts' } satisfies WatchEvent,
        nextBytes: new Uint8Array([1, 2, 3]),
        commits: true,
      },
      {
        event: { type: 'change', path: 'dep.ts' } satisfies WatchEvent,
        nextBytes: new Uint8Array([4, 5, 6]),
        commits: false,
      },
      { event: { type: 'reset' } satisfies WatchEvent, nextBytes: new Uint8Array([1, 2, 3]), commits: false },
    ])(
      'revalidates an arming event delivered during hashing before commit ($event.type)',
      async ({ event, nextBytes, commits }) => {
        const entryBytes = new Uint8Array([1, 2, 3]);
        let currentBytes = entryBytes;
        const filesystem = createMockFileSystem();
        filesystem.mocks.readFile.mockImplementation(async () => currentBytes);
        const unsubscribe = vi.fn();
        let deliverWatchEvent!: (event: WatchEvent) => void;
        const inlineFileSystem = Object.assign(filesystem, {
          watch: vi.fn(() => unsubscribe),
          watchReady: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
            deliverWatchEvent = handler;
            return {
              unsubscribe,
              ready: Promise.resolve(),
              closed: new Promise<void>(() => {
                // This synthetic watch stays open for the duration of the test.
              }),
            };
          }),
        });
        const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
        await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem }, options: {} });
        // @ts-expect-error - seed and gate the private hash boundary used by replacement validation
        const originalHashContent = worker.hashContent.bind(worker);
        // @ts-expect-error - seed the already-hashed dependency at the private watch handoff seam
        worker.fileHashCache.set('dep.ts', await originalHashContent(entryBytes));
        // @ts-expect-error - isolate replacement coherence from the independently covered watch-routing queue
        worker.routeWatchEvent = async () => {
          // Watch routing has independent coverage; this test owns only replacement coherence.
        };
        const hashStarted = Promise.withResolvers<void>();
        const releaseHash = Promise.withResolvers<void>();
        let hashCalls = 0;
        // @ts-expect-error - hold the first validation hash to deliver an event after its bytes were read
        worker.hashContent = async (content: Uint8Array<ArrayBuffer>) => {
          hashCalls += 1;
          if (hashCalls === 1) {
            hashStarted.resolve();
            await releaseHash.promise;
          }
          return originalHashContent(content);
        };

        // @ts-expect-error - exercise replacement validation independently of render setup
        const reconciliation = worker.reconcileWatchSet(new Map([['dep.ts', 50]]));
        await hashStarted.promise;
        currentBytes = nextBytes;
        deliverWatchEvent(event);
        releaseHash.resolve();

        await expect(reconciliation).resolves.toBe(commits);
        expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(event.type === 'reset' ? 1 : 2);
        expect(worker.getWatchedPaths()).toEqual(commits ? new Set(['dep.ts']) : new Set());
        if (!commits) {
          expect(unsubscribe).toHaveBeenCalledOnce();
        }
        await worker.cleanup();
      },
    );
  });

  describe('exact and loss invalidation routing', () => {
    it('should reevaluate a watched document only for its exact entry path', async () => {
      const worker = createConfiguredWorker();
      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        const evaluated = vi.fn();
        worker.onEvaluated = evaluated;

        await worker.notifyFileChanged(['thumbnail.webp']);
        await worker.notifyFileChanged(['main.geospec.ts']);
        expect(evaluated).not.toHaveBeenCalled();

        await worker.notifyFileChanged(['main.ts']);
        await vi.waitFor(() => {
          expect(evaluated).toHaveBeenCalledOnce();
        });
      } finally {
        await worker.cleanup();
      }
    });

    it('does not route a former entry change to a newly opened document', async () => {
      const worker = createConfiguredWorker();
      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        worker.handleCloseDocument({ documentId: 'test-document' });
        const settled = openDocument(worker, {}, createGeometryFile('renamed.ts'), { watch: true });
        await worker.notifyFileChanged(['main.ts']);
        await settled;
        expect(worker.createGeometryCalls).toBe(2);
        expect(worker.getWatchedPaths()).toContain('renamed.ts');
      } finally {
        await worker.cleanup();
      }
    });

    it('should route staged peer writes without reevaluating an unrelated watched document', async () => {
      const worker = createConfiguredWorker();
      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        const evaluated = vi.fn();
        worker.onEvaluated = evaluated;
        worker.handleOpenDocument({
          documentId: 'peer',
          intent: 0,
          file: createGeometryFile('peer.ts'),
          parameters: {},
          watch: false,
          stage: { 'main.geospec.ts': new Uint8Array([1]) },
        });
        await vi.waitFor(() => {
          expect(evaluated).toHaveBeenCalledOnce();
        });
        expect(evaluated.mock.calls[0]?.[0].documentId).toBe('peer');
      } finally {
        await worker.cleanup();
      }
    });

    it('should invalidate changed dependencies and schedule one recovery for reset', async () => {
      const filesystem = createMockFileSystem({ readFileResult: new Uint8Array([1, 2, 3]) });
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return () => {
            watchHandler = undefined;
          };
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        await vi.waitFor(() => {
          expect(watchHandler).toBeDefined();
        });
        // @ts-expect-error - seed volatile state to verify conservative loss recovery
        worker.bundleResultCache.set('cached.ts', {
          code: '',
          dependencies: ['main.ts'],
          unresolvedPaths: [],
          issues: [],
          success: true,
        });
        const evaluated = vi.fn();
        worker.onEvaluated = evaluated;
        filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([4]));
        filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': new Uint8Array([4]) });

        filesystem.mocks.readFile.mockResolvedValue(new Uint8Array());
        watchHandler!({ type: 'reset' });
        await vi.waitFor(() => {
          expect(evaluated).toHaveBeenCalledOnce();
        });

        // @ts-expect-error - changed dependencies are invalidated without clearing unrelated caches
        expect(worker.bundleResultCache.size).toBe(0);
      } finally {
        await worker.cleanup();
      }
    });

    it('should ignore an exact event and reset when watched bytes are unchanged', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem({ readFileResult: bytes });
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': bytes });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        const evaluated = vi.fn();
        worker.onEvaluated = evaluated;
        filesystem.mocks.readFile.mockClear();
        watchHandler!({ type: 'change', path: 'main.ts' });
        watchHandler!({ type: 'reset' });
        // Count only the two event rereads, excluding document/watch admission.
        await vi.waitFor(() => {
          expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(2);
        });
        expect(evaluated).not.toHaveBeenCalled();
        expect(worker.createGeometryCalls).toBe(1);
      } finally {
        await worker.cleanup();
      }
    });

    it('should collapse duplicate watch records for one changed revision', async () => {
      const initial = new Uint8Array([1]);
      const changed = new Uint8Array([2]);
      const filesystem = createMockFileSystem({ readFileResult: initial });
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': initial });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        filesystem.mocks.readFile.mockResolvedValue(changed);
        filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': changed });
        filesystem.mocks.readFile.mockClear();
        watchHandler!({ type: 'change', path: 'main.ts' });
        watchHandler!({ type: 'change', path: 'main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });
        expect(filesystem.mocks.readFile.mock.calls.length).toBeGreaterThanOrEqual(2);
        await new Promise((resolve) => {
          setTimeout(resolve, 75);
        });
        expect(worker.createGeometryCalls).toBe(2);
      } finally {
        await worker.cleanup();
      }
    });

    it('should conservatively render after an observer read failure', async () => {
      const filesystem = createMockFileSystem({ readFileResult: new Uint8Array([1]) });
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': new Uint8Array([1]) });
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([1]));
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        filesystem.mocks.readFile.mockRejectedValue(new Error('read failed'));
        watchHandler!({ type: 'change', path: 'main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });
        expect(worker.createGeometryCalls).toBe(2);
      } finally {
        await worker.cleanup();
      }
    });

    it('should render both present-to-missing and missing-to-present revisions', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': new Uint8Array([1]) });
      let missing = false;
      let bytes = new Uint8Array([1]);
      filesystem.mocks.readFile.mockImplementation(async () => {
        if (missing) {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        }
        return bytes;
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        missing = true;
        watchHandler!({ type: 'delete', path: 'main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });

        missing = false;
        bytes = new Uint8Array([2]);
        watchHandler!({ type: 'change', path: 'main.ts' });
        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(3);
        });
      } finally {
        await worker.cleanup();
      }
    });

    it('should render the latest authoritative revision once across local, external, and echo records', async () => {
      const initial = new Uint8Array([1]);
      const local = new Uint8Array([2]);
      const external = new Uint8Array([3]);
      const filesystem = createMockFileSystem({ readFileResult: initial });
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': initial });
      filesystem.mocks.readFile.mockResolvedValue(initial);
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        filesystem.mocks.readFile
          .mockResolvedValueOnce(local)
          .mockResolvedValueOnce(external)
          .mockResolvedValue(external);
        filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': external });
        watchHandler!({ type: 'change', path: 'main.ts' });
        watchHandler!({ type: 'change', path: 'main.ts' });
        watchHandler!({ type: 'change', path: 'main.ts' });

        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBe(2);
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 75);
        });
        expect(worker.createGeometryCalls).toBe(2);
        // @ts-expect-error - verify the existing runtime revision cache owns the final authoritative bytes
        expect(worker.fileHashCache.get('main.ts')).toBe(await worker.hashContent(external));
      } finally {
        await worker.cleanup();
      }
    });

    it('should reject a stale watch reread after a newer staged write owns the same path', async () => {
      const initial = new Uint8Array([1]);
      const latest = new Uint8Array([2]);
      let diskBytes = initial;
      const renderReads: number[][] = [];
      const staleRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
      const watchReadStarted = Promise.withResolvers<void>();
      let parkNextRead = false;
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockImplementation(async () => {
        const snapshot = new Uint8Array(diskBytes);
        renderReads.push([...snapshot]);
        return { 'main.ts': snapshot };
      });
      filesystem.mocks.readFile.mockImplementation(async () => {
        if (parkNextRead) {
          parkNextRead = false;
          watchReadStarted.resolve();
          return staleRead.promise;
        }
        return new Uint8Array(diskBytes);
      });
      filesystem.mocks.writeFile.mockImplementation(async (_path, data) => {
        if (typeof data === 'string') {
          diskBytes = new TextEncoder().encode(data);
          return;
        }
        if (data instanceof Uint8Array) {
          diskBytes = Uint8Array.from(data);
        }
      });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;

      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        const evaluated = vi.fn();
        worker.onEvaluated = evaluated;
        parkNextRead = true;
        watchHandler!({ type: 'change', path: 'main.ts' });
        await watchReadStarted.promise;

        // @ts-expect-error - drive the production staged-write path during the parked observer reread
        await worker.writeFilesAndInvalidate({ 'main.ts': latest });
        // @ts-expect-error - verify the staged revision owns the cache before the stale read settles
        expect(worker.fileHashCache.get('main.ts')).toBe(await worker.hashContent(latest));

        staleRead.resolve(initial);
        // @ts-expect-error - wait for the production routeWatchEvent reconciliation lane to settle
        await worker.watchReconciliationTail;
        // @ts-expect-error - the stale observer revision must never be installed
        expect(worker.fileHashCache.get('main.ts')).not.toBe(await worker.hashContent(initial));

        await vi.waitFor(() => {
          expect(worker.createGeometryCalls).toBeGreaterThan(1);
          expect(renderReads.at(-1)).toEqual([2]);
        });
        // @ts-expect-error - compare the worker's source digest with the authoritative staged bytes
        const latestDigest = `sha256:${await worker.hashContent(latest)}`;
        await vi.waitFor(() => {
          expect(evaluated.mock.calls.at(-1)?.[0].sourceRevision?.files['main.ts']).toBe(latestDigest);
        });
      } finally {
        await worker.cleanup();
      }
    });

    it('should discard a stale observed revision when a newer same-path revision already owns the cache', () => {
      const worker = createConfiguredWorker();
      // @ts-expect-error - pin the private revision-commit guard at its single install site
      worker.fileHashCache.set('main.ts', 'newer');
      // @ts-expect-error - pin the paired content cache behavior at the same private seam
      worker.fileContentCache.set('main.ts', new Uint8Array([2]));

      // @ts-expect-error - exercise the private compare-and-set commit used by observer reconciliation
      worker._applyObservedRevisions(
        ['main.ts'],
        new Map([['main.ts', { hash: 'stale', content: new Uint8Array([1]), expectedPrior: { hash: 'older' } }]]),
      );

      // @ts-expect-error - verify stale observer data was conservatively evicted, not installed
      expect(worker.fileHashCache.has('main.ts')).toBe(false);
      // @ts-expect-error - verify the paired stale content was also evicted
      expect(worker.fileContentCache.has('main.ts')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Document operation error cleanup
  // ---------------------------------------------------------------------------

  describe('document operation error cleanup', () => {
    it('clears the internal progress relay when document evaluation throws', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      // The internal phase relay must be cleared after a failed evaluation so
      // a later document operation cannot receive stale progress callbacks.

      {
        const operationResult = await openDocument(worker, {}, createGeometryFile('main.ts'));

        expect(operationResult.success).toBe(false);
      }

      // @ts-expect-error - accessing private for test verification
      expect(worker.onProgress).toBeUndefined();
    });

    it('keeps unwatched document failures out of the filesystem watch set', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      {
        const operationResult = await openDocument(worker, {}, createGeometryFile('main.ts'));

        expect(operationResult.success).toBe(false);
      }

      expect(worker.getWatchedPaths()).not.toContain('main.ts');
    });

    it('retains the document filesystem watch after export', async () => {
      const filesystem = createMockFileSystem({ readFileResult: new Uint8Array([1, 2, 3]) });
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      const unsubscribe = vi.fn();
      const watch = vi.fn((_request: { paths: readonly string[] }, _handler: unknown) => unsubscribe);
      const worker = new MockKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });
      // @ts-expect-error - accessing private bridge filesystem for watch verification
      worker.fileSystem = {
        ...filesystem,
        watch,
      };

      await openDocument(worker, {}, createGeometryFile('main.ts'), { watch: true });
      const result = await exportDocument(worker, 'glb');

      expect(result.success).toBe(true);
      expect(watch).toHaveBeenCalledOnce();
      const watchRequest = watch.mock.calls[0]?.[0] as { paths: readonly string[] } | undefined;
      expect(watchRequest?.paths).toContain('main.ts');
    });

    it('clears progress after a failed watched document evaluation', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = new FailingKernelWorker({
        middleware: [],
        onLog: noopLog,
        filesystem,
      });

      {
        const operationResult = await openDocument(worker, {}, createGeometryFile('main.ts'), { watch: true });

        expect(operationResult.success).toBe(false);
      }

      // @ts-expect-error - accessing private for test verification
      expect(worker.onProgress).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Bundler cache efficiency
  // ---------------------------------------------------------------------------

  describe('bundler cache efficiency', () => {
    it('should return cached dependencies from resolveDependencies when bundleResultCache has a hit', async () => {
      const worker = createConfiguredWorker();

      const expectedDependencies = ['main.ts', 'lib/box.ts'];

      // Pre-populate the bundle cache with a known result
      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('main.ts', {
        code: 'bundled-code',
        dependencies: expectedDependencies,
        unresolvedPaths: [],
        issues: [],
        success: true,
      });

      const mockBundlerDefinition = {
        name: 'MockBundler',
        version: '1.0.0',
        extensions: ['ts'],
        initialize: vi.fn(),
        detectImports: vi.fn(),
        bundle: vi.fn(),
        execute: vi.fn(),
        registerModule: vi.fn(),
      };

      // Inject mock bundler directly into loadedBundlers
      // @ts-expect-error - accessing protected for test verification
      worker.loadedBundlers.set('ts', { definition: mockBundlerDefinition, ctx: {} });

      // @ts-expect-error - accessing private for test verification
      const facade = worker.createBundlerFacade(new AbortController().signal);
      const result = await facade.resolveDependencies('main.ts');

      expect(result).toEqual({ resolved: expectedDependencies, unresolved: [] });
    });
  });

  describe('render preparation reuse', () => {
    const parameterMiddleware = defineMiddleware({
      id: 'parameter-reuse-test',
      name: 'parameter-reuse-test',
      async wrapDescribe(input, handler) {
        return handler(input);
      },
    });

    class PreparationCountingWorker extends MockKernelWorker {
      public dependencyCalls = 0;
      public parameterCalls = 0;
      public failParameters = false;
      public kernelVersion = '1.0.0';
      public middlewareRevision = 'a';

      public setKernelOptions(options: Record<string, unknown>): void {
        this.kernelInitOptionsMap.set('mock-kernel', options);
      }

      public override getMiddleware() {
        return super.getMiddleware().map((entry) => ({ ...entry, id: `${entry.id}:${this.middlewareRevision}` }));
      }

      protected override getActiveKernelVersion(): string {
        return this.kernelVersion;
      }

      protected override async onGetDependencies(
        input: GetDependenciesInput,
        runtime: KernelRuntime,
      ): Promise<GetDependenciesResult> {
        this.dependencyCalls += 1;
        return super.onGetDependencies(input, runtime);
      }

      protected override async onGetParameters(
        input: GetParametersInput,
        runtime: KernelRuntime,
      ): Promise<GetParameterDeclarationsResult> {
        this.parameterCalls += 1;
        if (this.failParameters) {
          return { success: false, issues: [{ code: 'RUNTIME', message: 'failed', severity: 'error' }] };
        }
        return super.onGetParameters(input, runtime);
      }
    }

    const createPreparationWorker = (): PreparationCountingWorker => {
      /* `readFile` and `readFiles` have to answer the same bytes for the same path: the hash
       * cache is filled from one and arm-time validation reads the other, so a fixture where
       * they disagree never commits a watch. */
      const filesystem = Object.assign(createMockFileSystem({ readFileResult: new Uint8Array([1, 2, 3]) }), {
        watch: vi.fn(() => vi.fn()),
      });
      filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
        Object.fromEntries(paths.map((path) => [path, new Uint8Array([1, 2, 3])])),
      );
      const worker = new PreparationCountingWorker({ middleware: [parameterMiddleware], onLog: noopLog, filesystem });
      // @ts-expect-error - white-box fixture installs the same watch-capable filesystem on the runtime seam.
      worker.fileSystem = filesystem;
      return worker;
    };

    it('reuses dependency discovery and successful parameters across parameter-only renders', async () => {
      const worker = createPreparationWorker();
      const file = createGeometryFile('main.ts');

      await openDocument(worker, { width: 1 }, file);
      await updateDocument(worker, { width: 2 }, 1);
      await updateDocument(worker, { width: 3 }, 2);

      expect(worker.dependencyCalls).toBe(1);
      expect(worker.parameterCalls).toBe(1);
      expect(worker.createGeometryCalls).toBe(3);
    });

    it('invalidates preparation reuse when an observed dependency changes', async () => {
      const worker = createPreparationWorker();
      const file = createGeometryFile('main.ts');
      await openDocument(worker, {}, file);

      await worker.notifyFileChanged(['main.ts']);
      await updateDocument(worker, {}, 1);

      expect(worker.dependencyCalls).toBe(2);
      expect(worker.parameterCalls).toBe(2);
    });

    it('misses the parameter cache when entry, kernel, options, or middleware identity changes', async () => {
      const worker = createPreparationWorker();

      await openDocument(worker, {}, createGeometryFile('main.ts'), { documentId: 'main' });
      await openDocument(worker, {}, createGeometryFile('other.ts'), { documentId: 'other' });
      worker.kernelVersion = '2.0.0';
      await updateDocument(worker, {}, 1, { documentId: 'other' });
      worker.setKernelOptions({ feature: true });
      await updateDocument(worker, {}, 2, { documentId: 'other' });
      worker.middlewareRevision = 'b';
      await updateDocument(worker, {}, 3, { documentId: 'other' });

      expect(worker.parameterCalls).toBe(5);
    });

    it('never caches a failed parameter extraction', async () => {
      const worker = createPreparationWorker();
      worker.failParameters = true;
      const file = createGeometryFile('main.ts');

      await openDocument(worker, {}, file);
      worker.failParameters = false;
      await updateDocument(worker, {}, 1);

      expect(worker.parameterCalls).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Bundler invalidation on active-file switch
  // ---------------------------------------------------------------------------

  describe('operation-scoped runtime facade', () => {
    it('should create a fresh bundler facade for each runtime operation', () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      const runtime1 = worker.createRuntime();
      const bundler1 = runtime1.bundler;

      // @ts-expect-error - accessing private for test verification
      const runtime2 = worker.createRuntime();
      const bundler2 = runtime2.bundler;

      expect(bundler1).not.toBe(bundler2);
    });
  });

  // ---------------------------------------------------------------------------
  // Document state emission
  // ---------------------------------------------------------------------------

  describe('document state', () => {
    it('should emit idle when evaluation completes', async () => {
      const worker = createConfiguredWorker();

      const stateChanges: string[] = [];
      worker.onDocumentStateChanged = ({ state }) => stateChanges.push(state);
      await openDocument(worker, {}, createGeometryFile('main.ts'));
      expect(stateChanges).toContain('idle');
    });
  });

  // ---------------------------------------------------------------------------
  // Document input parameters
  // ---------------------------------------------------------------------------

  describe('document input parameters', () => {
    it('should use an explicit empty parameters object', async () => {
      const worker = createConfiguredWorker();

      const evaluated = await openDocument(worker, {}, createGeometryFile('main.ts'));
      expect(evaluated.success).toBe(true);
      expect(documentArtifact(worker)?.identity.parameters).toEqual({});
    });

    it('should use provided parameters when given', async () => {
      const worker = createConfiguredWorker();

      const evaluated = await openDocument(worker, { width: 10 }, createGeometryFile('main.ts'));
      expect(evaluated.success).toBe(true);
      expect(documentArtifact(worker)?.identity.parameters).toEqual({ width: 10 });
    });
  });

  // ---------------------------------------------------------------------------
  // Document staging
  // ---------------------------------------------------------------------------

  describe('document staging', () => {
    it('writes every staged byte payload to the worker filesystem before opening the entry', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      const callOrder: string[] = [];
      class RecordingWorker extends MockKernelWorker {
        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          callOrder.push('createGeometry');
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }
      const worker = new RecordingWorker({ middleware: [], onLog: noopLog, filesystem });
      filesystem.mocks.writeFile.mockImplementation(async (path: string) => {
        callOrder.push(`writeFile:${path}`);
      });

      const stage: Record<string, Uint8Array<ArrayBuffer>> = {
        'main.ts': new Uint8Array([10, 20, 30]),
        'lib.ts': new Uint8Array([40, 50]),
      };

      await openDocument(worker, { width: 5 }, createGeometryFile('main.ts'), { stage });

      expect(filesystem.mocks.writeFile).toHaveBeenCalledTimes(2);
      expect(filesystem.mocks.writeFile).toHaveBeenCalledWith('main.ts', new Uint8Array([10, 20, 30]));
      expect(filesystem.mocks.writeFile).toHaveBeenCalledWith('lib.ts', new Uint8Array([40, 50]));

      // Strict ordering: every write completes before geometry work starts.
      expect(callOrder).toEqual(['writeFile:main.ts', 'writeFile:lib.ts', 'createGeometry']);
    });

    it('creates parent directories (recursive) once per unique parent before staging', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({});
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });

      await openDocument(worker, {}, createGeometryFile('a.ts'), {
        stage: {
          'a.ts': new Uint8Array([1]),
          'b.ts': new Uint8Array([2]),
          'sub/c.ts': new Uint8Array([3]),
        },
      });

      expect(filesystem.mocks.mkdir).toHaveBeenCalledTimes(1);
      expect(filesystem.mocks.mkdir).toHaveBeenCalledWith('sub', { recursive: true });
    });

    it('should observe staged bytes the filesystem already holds without writing them again', async () => {
      const stored = new Uint8Array([7, 8, 9]);
      const filesystem = createMockFileSystem({ readFileResult: stored });
      filesystem.mocks.readFiles.mockResolvedValue({ 'sub/main.ts': stored });
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error - install the watch-capable proxy seam exercised by production initialization
      worker.fileSystem = filesystem;
      const file = createGeometryFile('sub/main.ts');

      try {
        await openDocument(worker, {}, file, { watch: true });
        await vi.waitFor(() => {
          expect(watchHandler).toBeDefined();
        });
        const staged = new Uint8Array(stored);
        await updateDocument(worker, {}, 1, { stage: { 'sub/main.ts': staged } });

        expect(filesystem.mocks.writeFile).not.toHaveBeenCalled();
        expect(filesystem.mocks.mkdir).not.toHaveBeenCalled();
        // @ts-expect-error - white-box: the staged bytes are the path's observed revision.
        expect(worker.fileContentCache.get('sub/main.ts')).toBe(staged);
        expect(worker.createGeometryCalls).toBe(1);

        const evaluated = vi.fn();
        worker.onEvaluated = evaluated;
        const reads = filesystem.mocks.readFile.mock.calls.length;
        watchHandler!({ type: 'change', path: 'sub/main.ts' });
        await vi.waitFor(() => {
          expect(filesystem.mocks.readFile.mock.calls.length).toBeGreaterThan(reads);
        });
        await flushMicrotasks();

        expect(evaluated).not.toHaveBeenCalled();
        expect(worker.createGeometryCalls).toBe(1);
      } finally {
        await worker.cleanup();
      }
    });

    it('opens the entry without staging when the stage map is empty', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      await openDocument(worker, {}, createGeometryFile('main.ts'), { stage: {} });

      expect(filesystem.mocks.writeFile).not.toHaveBeenCalled();
      expect(filesystem.mocks.mkdir).not.toHaveBeenCalled();
      expect(worker.createGeometryCalls).toBe(1);
    });

    it('does not render if a writeFile failure aborts staging', async () => {
      const filesystem = createMockFileSystem();
      filesystem.mocks.writeFile.mockRejectedValueOnce(new Error('disk full'));
      const worker = new MockKernelWorker({ middleware: [], onLog: noopLog, filesystem });
      const evaluated = await openDocument(worker, {}, createGeometryFile('main.ts'), {
        stage: { 'main.ts': new Uint8Array([1]) },
      });

      expect(worker.createGeometryCalls).toBe(0);
      expect(evaluated.success).toBe(false);
      expect(evaluated.issues.some((issue) => issue.message.includes('disk full'))).toBe(true);
    });
  });

  describe('immediate entry watch', () => {
    it('should emit idle for an aborted preview before buffering its watched successor (T23)', async () => {
      const gate = Promise.withResolvers<void>();
      const entered = Promise.withResolvers<void>();
      let signal: AbortSignal | undefined;
      class HeldWorker extends MockKernelWorker {
        private calls = 0;

        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          if (++this.calls === 1) {
            signal = runtime.signal;
            entered.resolve();
            await gate.promise;
            runtime.signal.throwIfAborted();
          }
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }
      let revision = new Uint8Array([1, 2, 3]);
      const filesystem = createMockFileSystem({ readFileResult: () => revision });
      filesystem.mocks.readFiles.mockImplementation(async () => ({ 'main.ts': revision }));
      let watchHandler: ((event: WatchEvent) => void) | undefined;
      Object.assign(filesystem, {
        watch: vi.fn((_request: unknown, handler: (event: WatchEvent) => void) => {
          watchHandler = handler;
          return vi.fn();
        }),
      });
      const worker = new HeldWorker({ middleware: [], onLog: noopLog, filesystem });
      // @ts-expect-error -- install the watch-capable proxy seam used by initialization.
      worker.fileSystem = filesystem;
      const admissions: string[] = [];
      const published: string[] = [];
      worker.onEvaluating = ({ evaluationId }) => admissions.push(evaluationId);
      worker.onEvaluated = ({ id }) => published.push(id);
      try {
        worker.handleOpenDocument({
          documentId: 'doc',
          intent: 0,
          file: createGeometryFile('main.ts'),
          parameters: {},
          watch: true,
        });
        await entered.promise;
        expect(worker.getWatchedPaths()).toContain('main.ts');
        expect(watchHandler).toBeDefined();
        worker.handleOperationAbort({ operationId: `evaluate:doc:${admissions[0]}`, reason: abortReason.superseded });
        expect(signal?.aborted).toBe(true);
        revision = new Uint8Array([4]);
        watchHandler!({ type: 'change', path: 'main.ts' });
        gate.resolve();
        await vi.waitFor(() => {
          expect(published).toHaveLength(1);
        });
        expect(admissions).toHaveLength(2);
        expect(published).toEqual([admissions[1]]);
        expect(published).not.toContain(admissions[0]);
        expect(worker.createGeometryCalls).toBe(1);
        expect(documentArtifact(worker, 'doc')?.identity.file.filename).toBe('main.ts');
      } finally {
        gate.resolve();
        await worker.cleanup();
      }
    });

    it('should terminally settle a buffered preview before buffering the next watched successor', async () => {
      const worker = createConfiguredWorker();
      const admissions: Array<{ intent: number; evaluationId: string }> = [];
      const published: number[] = [];
      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        worker.onEvaluating = ({ intent, evaluationId }) => admissions.push({ intent, evaluationId });
        worker.onEvaluated = ({ intent }) => published.push(intent);
        worker.handleUpdateDocument({ documentId: 'test-document', intent: 1, parameters: { size: 4 } });
        worker.handleUpdateDocument({ documentId: 'test-document', intent: 2, parameters: { size: 5 } });
        await vi.waitFor(() => {
          expect(published).toEqual([2]);
        });
        expect(admissions.map(({ intent }) => intent)).toEqual([1, 2]);
        expect(admissions[0]?.evaluationId).not.toBe(admissions[1]?.evaluationId);
        expect(worker.createGeometryCalls).toBe(2);
        expect(documentArtifact(worker)?.identity.parameters).toEqual({ size: 5 });
        expect(documentArtifact(worker)?.identity.file.filename).toBe('main.ts');
      } finally {
        await worker.cleanup();
      }
    });

    it('should terminally settle a queued preview superseded before execution', async () => {
      const gate = Promise.withResolvers<void>();
      const entered = Promise.withResolvers<void>();
      let firstSignal: AbortSignal | undefined;
      class HeldWorker extends MockKernelWorker {
        private calls = 0;

        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          if (++this.calls === 1) {
            firstSignal = runtime.signal;
            entered.resolve();
            await gate.promise;
            runtime.signal.throwIfAborted();
          }
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }
      const worker = new HeldWorker({ middleware: [], onLog: noopLog, filesystem: createMockFileSystem() });
      const admissions: Array<{ intent: number; evaluationId: string }> = [];
      const published: number[] = [];
      worker.onEvaluating = ({ intent, evaluationId }) => admissions.push({ intent, evaluationId });
      worker.onEvaluated = ({ intent }) => published.push(intent);
      try {
        worker.handleOpenDocument({
          documentId: 'doc',
          intent: 0,
          file: createGeometryFile('main.ts'),
          parameters: {},
          watch: true,
        });
        await entered.promise;
        worker.handleUpdateDocument({ documentId: 'doc', intent: 1, parameters: { size: 4 } });
        worker.handleUpdateDocument({ documentId: 'doc', intent: 2, parameters: { size: 5 } });
        expect(firstSignal?.aborted).toBe(true);
        gate.resolve();
        await vi.waitFor(() => {
          expect(published).toEqual([2]);
        });
        expect(admissions.map(({ intent }) => intent)).toEqual([0, 1, 2]);
        expect(new Set(admissions.map(({ evaluationId }) => evaluationId)).size).toBe(3);
        expect(worker.createGeometryCalls).toBe(1);
        expect(documentArtifact(worker, 'doc')?.identity.parameters).toEqual({ size: 5 });
      } finally {
        gate.resolve();
        await worker.cleanup();
      }
    });

    it('should acknowledge a buffered timeout without entering geometry', async () => {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      class HeldWorker extends MockKernelWorker {
        protected override async onEvaluateForOwner(
          owner: OperationOwner,
          input: NativeBuildInput,
          runtime: KernelRuntime,
        ): Promise<EvaluateResult> {
          if (this.createGeometryCalls === 1) {
            entered.resolve();
            await release.promise;
            runtime.signal.throwIfAborted();
          }
          return super.onEvaluateForOwner(owner, input, runtime);
        }
      }
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
      filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
        Object.fromEntries(paths.map((path) => [path, new Uint8Array([1, 2, 3])])),
      );
      const worker = new HeldWorker({ middleware: [], onLog: noopLog, filesystem });
      try {
        await openWatchedDocument(worker, createGeometryFile('main.ts'));
        const published = vi.fn();
        const errors = vi.fn();
        worker.onEvaluated = published;
        worker.onDocumentError = errors;
        const admissions: string[] = [];
        worker.onEvaluating = ({ evaluationId }) => admissions.push(evaluationId);
        worker.handleUpdateDocument({ documentId: 'test-document', intent: 1, parameters: { size: 4 } });
        await entered.promise;
        const operationId = `evaluate:test-document:${admissions[0]}`;
        worker.handleOperationAbort({ operationId, reason: abortReason.timeout });
        release.resolve();
        await vi.waitFor(() => {
          expect(errors).toHaveBeenCalledOnce();
        });
        expect(errors).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: 'operation',
            documentId: 'test-document',
            intent: 1,
            evaluationId: admissions[0],
            operationId,
            code: 'OPERATION_TIMEOUT',
            phase: 'evaluate',
          }),
        );
        expect(published).not.toHaveBeenCalled();
        expect(worker.createGeometryCalls).toBe(1);
        expect(documentArtifact(worker)?.identity.file.filename).toBe('main.ts');
      } finally {
        release.resolve();
        await worker.cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // middleware getDependencies hook
  // ---------------------------------------------------------------------------

  describe('middleware getDependencies', () => {
    it('should leave the manifest revision unchanged when a createGeometry-scoped dependency of a middleware that also wraps getParameters changes', async () => {
      const dependencyPath = '.tau/parameters/main.ts.json';
      const middleware = defineMiddleware({
        id: 'operation-scoped-dependency',
        name: 'operation-scoped-dependency',
        resolve() {
          return [{ path: dependencyPath, affects: ['evaluate'] }];
        },
        async wrapDescribe(input, handler) {
          return handler(input);
        },
      });
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([10]));
      const worker = createConfiguredWorker({ middleware: [middleware], filesystem });
      const file = createGeometryFile('main.ts');

      const first = await worker.getParameters(file);
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([20]));
      // @ts-expect-error - accessing the private invalidation seam for contract verification.
      worker._invalidateCachesForPaths([dependencyPath]);
      const second = await worker.getParameters(file);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      if (!first.success || !second.success) {
        throw new Error('Expected both parameter manifests to resolve');
      }
      expect(second.data.revision).toBe(first.data.revision);
    });

    it('should include middleware dependency files in the dependency hash', async () => {
      const parameterFileContent = new Uint8Array([10, 20, 30]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        resolve() {
          return [{ path: '.tau/parameters/main.ts.json', affects: ['evaluate'] }];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockResolvedValue(parameterFileContent);

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      const result1 = await openDocument(worker, {}, createGeometryFile('main.ts'));
      expect(result1.success).toBe(true);
      const hash1 = result1.sourceRevision?.files['.tau/parameters/main.ts.json'];

      // Change the parameter file content and invalidate caches
      // (simulates a watch-triggered file change between render cycles)
      filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([99, 99, 99]));
      // @ts-expect-error - accessing private for test verification
      worker._invalidateCachesForPaths(['.tau/parameters/main.ts.json']);
      // @ts-expect-error - accessing private for test verification
      worker.renderDependencyCache = undefined;

      const result2 = await updateDocument(worker, {}, 1);
      expect(result2.success).toBe(true);
      const hash2 = result2.sourceRevision?.files['.tau/parameters/main.ts.json'];

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).not.toBe(hash2);
    });

    it('should produce identical hashes when middleware dependency file is unchanged', async () => {
      const parameterFileContent = new Uint8Array([10, 20, 30]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        resolve() {
          return [{ path: '.tau/parameters/main.ts.json', affects: ['evaluate'] }];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockResolvedValue(parameterFileContent);

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      const result1 = await openDocument(worker, {}, createGeometryFile('main.ts'));
      const hash1 = result1.sourceRevision?.files['.tau/parameters/main.ts.json'];

      const result2 = await updateDocument(worker, {}, 1);
      const hash2 = result2.sourceRevision?.files['.tau/parameters/main.ts.json'];

      expect(hash1).toBeDefined();
      expect(hash1).toBe(hash2);
    });

    it('should use sentinel hash when middleware dependency file is missing', async () => {
      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        resolve() {
          return [{ path: '.tau/missing.json', affects: ['evaluate'] }];
        },
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });
      filesystem.mocks.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        filesystem,
      });

      const result = await openDocument(worker, {}, createGeometryFile('main.ts'));
      expect(result.success).toBe(true);
      expect(result.sourceRevision?.files['.tau/missing.json']).toBe('missing');
    });

    it('should call getDependencies with correct input and resolved options', async () => {
      const getDependenciesSpy = vi.fn().mockReturnValue([]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        resolve: getDependenciesSpy,
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const middlewareOptions = { parametersFile: '.tau/params.json' };
      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        middlewareConfigs: [middlewareOptions],
        filesystem,
      });

      await openDocument(worker, {}, createGeometryFile('main.ts'));

      expect(getDependenciesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entryPath: 'main.ts',
        }),
        expect.objectContaining({
          options: middlewareOptions,
        }),
      );
      const dependencyRuntime = getDependenciesSpy.mock.calls[0]?.[1] as { readonly signal?: unknown } | undefined;
      expect(dependencyRuntime?.signal).toBeInstanceOf(AbortSignal);
    });

    it('should skip getDependencies for disabled middleware', async () => {
      const getDependenciesSpy = vi.fn().mockReturnValue([]);

      const middlewareWithDeps = defineMiddleware({
        id: 'test-deps',
        name: 'test-deps',
        resolve: getDependenciesSpy,
      });

      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({
        'main.ts': new Uint8Array([1, 2, 3]),
      });

      const worker = createConfiguredWorker({
        middleware: [middlewareWithDeps],
        middlewareEnabled: [false],
        filesystem,
      });

      await openDocument(worker, {}, createGeometryFile('main.ts'));

      expect(getDependenciesSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid middleware dependency paths before provider access with a middleware issue', async () => {
      const middlewareWithInvalidDependency = defineMiddleware({
        id: 'invalid-dependency',
        name: 'invalid-dependency',
        resolve() {
          return [{ path: '../outside.json', affects: ['evaluate'] }];
        },
      });
      const filesystem = createMockFileSystem();
      filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': new Uint8Array([1]) });
      const worker = createConfiguredWorker({ middleware: [middlewareWithInvalidDependency], filesystem });

      const result = await openDocument(worker, {}, createGeometryFile('main.ts'));
      expect(result).toMatchObject({
        success: false,
        issues: [expect.objectContaining({ code: 'MIDDLEWARE_FAILED' })],
      });
      expect(filesystem.mocks.readFile).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Unresolved dependency path tracking
  // ---------------------------------------------------------------------------

  describe('unresolved dependency path tracking', () => {
    it('should include bundleResultCache unresolvedPaths in the observed path set', async () => {
      const worker = createConfiguredWorker();

      // @ts-expect-error - accessing private for test verification
      worker.bundleResultCache.set('main.ts', {
        code: '',
        dependencies: ['main.ts'],
        unresolvedPaths: ['lib/box.ts', 'lib/cylinder.ts'],
        issues: [],
        success: false,
      });

      // @ts-expect-error - accessing private for test verification
      await worker.reconcileObservedPaths();

      expect(worker.getWatchedPaths()).toContain('lib/box.ts');
      expect(worker.getWatchedPaths()).toContain('lib/cylinder.ts');
      expect(worker.getWatchedPaths()).toContain('main.ts');
    });
  });

  it('closes admission synchronously, aborts active work, and runs cleanup once', async () => {
    let releaseRender!: () => void;
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    let renderStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      renderStarted = resolve;
    });
    const cleanupHook = vi.fn();

    class CleanupWorker extends MockKernelWorker {
      protected override async onEvaluateForOwner(): Promise<EvaluateResult> {
        renderStarted();
        await renderGate;
        return this.completeFixtureEvaluation(new Uint8Array([1]));
      }

      protected override async onCleanup(): Promise<void> {
        cleanupHook();
      }
    }

    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': new Uint8Array([1]) });
    const worker = new CleanupWorker({ middleware: [], onLog: noopLog, filesystem });
    const dispose = vi.fn();
    const unsubscribe = vi.fn();
    // @ts-expect-error - install production lifecycle seams for focused verification
    worker.fileSystem = { ...filesystem, dispose };
    // @ts-expect-error - focused verification of post-drain watch teardown
    worker.watchUnsubscribe = unsubscribe;
    // @ts-expect-error - the document already observes its entry, so reconciliation leaves the subscription alone
    worker.watchedPaths = new Set(['main.ts']);

    const evaluated: number[] = [];
    worker.onEvaluated = ({ intent }) => evaluated.push(intent);
    worker.handleOpenDocument({
      documentId: 'doc',
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: true,
    });
    await started;
    const firstCleanup = worker.cleanup();
    const secondCleanup = worker.cleanup();

    expect(firstCleanup).toBe(secondCleanup);
    expect(unsubscribe).not.toHaveBeenCalled();
    await expect(worker.describe({ file: createGeometryFile('other.ts') })).rejects.toThrow(
      'Runtime worker is closing',
    );
    await expect(worker.notifyFileChanged(['main.ts'])).rejects.toThrow('Runtime worker is closing');
    expect(cleanupHook).not.toHaveBeenCalled();

    releaseRender();
    await firstCleanup;
    expect(evaluated).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cleanupHook).toHaveBeenCalledOnce();
  });
});

describe('document cancellation', () => {
  it('publishes only the latest intent after a superseded native evaluation', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    class HeldWorker extends MockKernelWorker {
      private calls = 0;

      protected override async onEvaluateForOwner(
        owner: OperationOwner,
        input: NativeBuildInput,
        runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        if (++this.calls === 1) {
          entered.resolve();
          await release.promise;
          runtime.signal.throwIfAborted();
        }
        return super.onEvaluateForOwner(owner, input, runtime);
      }
    }
    const worker = new HeldWorker({ middleware: [], filesystem: createMockFileSystem() });
    const evaluated: number[] = [];
    const errors: unknown[] = [];
    worker.onEvaluated = ({ intent }) => evaluated.push(intent);
    worker.onDocumentError = (event) => errors.push(event);
    worker.handleOpenDocument({
      documentId: 'doc',
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: false,
    });
    await entered.promise;
    worker.handleUpdateDocument({ documentId: 'doc', intent: 1, parameters: { size: 2 } });
    release.resolve();
    await vi.waitFor(() => {
      expect(evaluated).toEqual([1]);
    });
    expect(errors).toEqual([]);
    await worker.cleanup();
  });

  it('shares a document operation signal across middleware, kernel and bundler without aliasing its successor', async () => {
    const middlewareSignals: AbortSignal[] = [];
    const kernelSignals: AbortSignal[] = [];
    const bundlerSignals: AbortSignal[] = [];
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const middleware = defineMiddleware({
      id: 'signal-capture',
      name: 'signal-capture',
      async wrapEvaluate(input, handler, runtime) {
        middlewareSignals.push(runtime.signal);
        return handler(input);
      },
    });
    class SignalWorker extends MockKernelWorker {
      protected override async onEvaluateForOwner(
        _owner: OperationOwner,
        _input: NativeBuildInput,
        runtime: KernelRuntime,
      ): Promise<EvaluateResult> {
        kernelSignals.push(runtime.signal);
        await runtime.execute('export default undefined;');
        if (kernelSignals.length === 1) {
          entered.resolve();
          await release.promise;
        }
        return this.completeFixtureEvaluation(new Uint8Array([1]));
      }
    }
    const worker = new SignalWorker({ middleware: [middleware], filesystem: createMockFileSystem() });
    const bundlerDefinition = {
      name: 'signal bundler',
      version: '1.0.0',
      extensions: ['ts'],
      initialize: vi.fn(async () => ({})),
      detectImports: vi.fn(async () => ({ detectedModules: [], dependencies: [] })),
      bundle: vi.fn(async () => ({ code: '', dependencies: [], unresolvedPaths: [], issues: [], success: true })),
      execute: vi.fn(async (_code: string, runtime: { readonly signal: AbortSignal }) => {
        bundlerSignals.push(runtime.signal);
        return { success: true, value: undefined };
      }),
      registerModule: vi.fn(),
    };
    // @ts-expect-error -- install the already-loaded bundler seam used by the production runtime facade.
    worker.loadedBundlers.set('ts', { definition: bundlerDefinition, ctx: {} });
    const evaluated: number[] = [];
    worker.onEvaluated = ({ intent }) => evaluated.push(intent);
    worker.handleOpenDocument({
      documentId: 'doc',
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: false,
    });
    await entered.promise;
    expect(middlewareSignals[0]).toBe(kernelSignals[0]);
    expect(bundlerSignals[0]).toBe(kernelSignals[0]);
    worker.handleUpdateDocument({ documentId: 'doc', intent: 1, parameters: { size: 2 } });
    const firstSignal = kernelSignals[0]!;
    expect(firstSignal.aborted).toBe(true);
    release.resolve();
    await vi.waitFor(() => {
      expect(evaluated).toEqual([1]);
    });
    expect(kernelSignals).toHaveLength(2);
    expect(middlewareSignals[1]).toBe(kernelSignals[1]);
    expect(bundlerSignals[1]).toBe(kernelSignals[1]);
    expect(kernelSignals[1]).not.toBe(firstSignal);
    expect(kernelSignals[1]?.aborted).toBe(false);
    await worker.cleanup();
  });

  it('rejects an invalid document locator without replacing an open document', async () => {
    const worker = createConfiguredWorker();
    {
      const operationResult = await openDocument(worker);
      expect(operationResult.success).toBe(true);
    }
    expect(() => {
      worker.handleOpenDocument({
        documentId: 'invalid',
        intent: 0,
        file: { path: '', filename: '../escape.ts' },
        parameters: {},
        watch: false,
      });
    }).toThrow();
    {
      const operationResult = await updateDocument(worker, { size: 2 }, 1);
      expect(operationResult.success).toBe(true);
    }
    expect(worker.createGeometryCalls).toBe(2);
    await worker.cleanup();
  });

  it('rejects a duplicate document ID without replacing the original', async () => {
    const worker = createConfiguredWorker();
    {
      const operationResult = await openDocument(worker, { size: 1 });
      expect(operationResult.success).toBe(true);
    }
    expect(() => {
      worker.handleOpenDocument({
        documentId: 'test-document',
        intent: 0,
        file: createGeometryFile('other.ts'),
        parameters: { size: 999 },
        watch: false,
      });
    }).toThrow('already open');
    {
      const operationResult = await updateDocument(worker, { size: 2 }, 1);
      expect(operationResult.success).toBe(true);
    }
    expect(documentArtifact(worker)?.identity.file.filename).toBe('test.kcl');
    await worker.cleanup();
  });
});

describe('shared pools', () => {
  it('should close an unused bridge port when an inline filesystem takes precedence', async () => {
    const worker = createConfiguredWorker();
    const close = vi.fn();
    const fileSystemPort = { close } as unknown as MessagePort;

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: { inlineFileSystem: createMockFileSystem(), fileSystemPort },
      options: {},
    });

    expect(close).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Transcoder loading and capabilities manifest
// ---------------------------------------------------------------------------

describe('transcoder loading', () => {
  function createMockTranscoderModule(edges: TranscoderEdge[]) {
    return {
      name: 'MockTranscoder',
      version: '1.0.0',
      edges,
      initialize: vi.fn().mockResolvedValue({ initialized: true }),
      transcode: vi.fn<TranscoderDefinition<{ initialized: boolean }>['transcode']>().mockResolvedValue({
        success: true,
        data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'output.usdz', mimeType: 'model/vnd.usdz+zip' }],
        issues: [],
      }),
      onDispose: vi.fn().mockResolvedValue(undefined),
    } satisfies TranscoderDefinition<{ initialized: boolean }>;
  }

  const createMockTranscoderPlugin = (id: string, module: ReturnType<typeof createMockTranscoderModule>) =>
    attachRuntimePluginDefinition({ id }, () => module);

  it('should include kernel-direct routes in manifest even without transcoders', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const transcodedRoutes = manifest.routes.filter((r) => r.transcoderId);
    const directRoutes = manifest.routes.filter((r) => !r.transcoderId);
    expect(transcodedRoutes).toEqual([]);
    expect(directRoutes.length).toBeGreaterThan(0);
    expect(directRoutes.every((entry) => entry.kernelId === 'mock-kernel')).toBe(true);
    expect(manifest.routes.length).toBe(directRoutes.length);
    expect(directRoutes.every((r) => r.sourceFormat === r.targetFormat)).toBe(true);
  });

  it('should load transcoder modules and populate transcodeEdges in capabilities manifest', async () => {
    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      { from: 'glb', to: '3mf', fidelity: 'mesh' },
    ]);

    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('test-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const transcodedRoutes = worker.capabilitiesManifest.routes.filter((r) => r.transcoderId === 'test-transcoder');
    expect(transcodedRoutes).toHaveLength(2);
    const usdzRoute = transcodedRoutes.find((r) => r.targetFormat === 'usdz');
    const threeMfRoute = transcodedRoutes.find((r) => r.targetFormat === '3mf');
    expect(usdzRoute).toEqual(
      expect.objectContaining({
        transcoderId: 'test-transcoder',
        sourceFormat: 'glb',
        targetFormat: 'usdz',
        fidelity: 'mesh',
      }),
    );
    expect(usdzRoute!.exportOptions.schema).toHaveProperty('type', 'object');
    expect(threeMfRoute).toEqual(
      expect.objectContaining({
        transcoderId: 'test-transcoder',
        sourceFormat: 'glb',
        targetFormat: '3mf',
        fidelity: 'mesh',
      }),
    );
    expect(threeMfRoute!.exportOptions.schema).toHaveProperty('type', 'object');
    expect(mockModule.initialize).not.toHaveBeenCalled();
  });

  it('should route export through transcoder when format matches an edge', async () => {
    const transcoderResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new Uint8Array([10, 20, 30]), name: 'output.usdz', mimeType: 'model/vnd.usdz+zip' }],
      issues: [],
    };

    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);
    mockModule.transcode.mockResolvedValue(transcoderResult);

    const kernelExportResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'export.glb', mimeType: 'model/gltf-binary' }],
      issues: [],
    };

    const worker = createConfiguredWorker({
      exportResult: kernelExportResult,
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('route-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz');
    const secondResult = await exportDocument(worker, 'usdz');

    expect(result.success).toBe(true);
    expect(secondResult.success).toBe(true);
    if (result.success) {
      expect(result.files[0].mimeType).toBe('model/vnd.usdz+zip');
    }

    expect(mockModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'glb', to: 'usdz' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown as AbortSignal }),
      expect.any(Object),
    );
    expect(mockModule.initialize).toHaveBeenCalledOnce();
    expect(mockModule.transcode).toHaveBeenCalledTimes(2);

    await worker.cleanup();
    expect(mockModule.onDispose).toHaveBeenCalledOnce();
    expect(mockModule.onDispose).toHaveBeenCalledWith({ initialized: true });
  });

  it('should fall through to direct kernel export when no transcoder route matches', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const kernelExportResult: ExportGeometryResult = {
      success: true,
      data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'export.stl', mimeType: 'model/stl' }],
      issues: [],
    };

    const worker = createConfiguredWorker({
      exportResult: kernelExportResult,
      nativeHandle: { kind: 'mock-native-handle' },
      exportZodSchemas: {
        glb: z.object({}),
        gltf: z.object({}),
        stl: z.object({}),
      },
      transcoders: [createMockTranscoderPlugin('fallthrough-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'stl');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.files[0].mimeType).toBe('model/stl');
    }

    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should not initialize or clean up an unused transcoder', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('cleanup-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await worker.cleanup();

    expect(mockModule.initialize).not.toHaveBeenCalled();
    expect(mockModule.onDispose).not.toHaveBeenCalled();
  });

  it('should propagate kernel export failure without calling transcoder', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportResult: {
        success: false,
        issues: [{ message: 'No geometry available', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('error-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz');

    expect(result.success).toBe(false);
    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should validate transcoder edge options before transcoding', async () => {
    const optionsSchema = z.object({ quality: z.number().min(0).max(1) });
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema }]);

    const worker = createConfiguredWorker({
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('validated-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz', { quality: 0.5 });
    expect(result.success).toBe(true);
  });

  it('should hard-fail when transcoder edge options are invalid', async () => {
    const optionsSchema = z.object({ quality: z.number().min(0).max(1) });
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema }]);

    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('invalid-opts-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz', { quality: 5 });
    expect(result.success).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Transcoder edge glb → usdz option quality') as string,
        }),
      ]),
    );
    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should reject unknown transcoder export option keys at runtime', async () => {
    const optionsSchema = z.object({ quality: z.number().min(0).max(1) }).strict();
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema }]);
    const worker = createConfiguredWorker({
      transcoders: [createMockTranscoderPlugin('unknown-opts-transcoder', mockModule)],
    });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz', { futurePluginOption: true });
    expect(result).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ message: expect.stringContaining('futurePluginOption') as string })],
    });
    expect(mockModule.transcode).not.toHaveBeenCalled();
  });

  it('should populate manifest schema and defaults from kernel export formats', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbExport = manifest.routes.find((r) => r.targetFormat === 'glb' && !r.transcoderId);
    expect(glbExport).toBeDefined();
    expect(glbExport!.kernelId).toBe('mock-kernel');
    expect(glbExport!.fidelity).toBe('mesh');
  });

  it('should derive JSON Schema from default Zod schemas when no custom export formats are declared', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbExport = manifest.routes.find((r) => r.targetFormat === 'glb' && !r.transcoderId);
    expect(glbExport).toBeDefined();
    expect(glbExport!.exportOptions.schema).toHaveProperty('type', 'object');
    expect(glbExport!.exportOptions.defaults).toEqual({});
  });

  it('should invoke transcoder.transcode exactly once for a matching route without any runtime guard', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: z.object({}),
      },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('single-call-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz');

    expect(result.success).toBe(true);
    expect(mockModule.transcode).toHaveBeenCalledTimes(1);
    expect(mockModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'glb', to: 'usdz' }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should return actionable error with native formats when no route matches', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'bvh');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]!.message).toContain('No export route found');
      expect(result.issues[0]!.message).toContain('Register a transcoder');
      expect(result.issues[0]!.code).toBe('TRANSCODER_CAPABILITY_MISSING');
    }
  });

  it('should prefer brep routes over mesh routes via manifest order', async () => {
    const brepModule = createMockTranscoderModule([{ from: 'step', to: 'iges', fidelity: 'brep' }]);
    const meshModule = createMockTranscoderModule([{ from: 'glb', to: 'iges', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: z.object({}),
        gltf: z.object({}),
        step: z.object({}),
      },
      transcoders: [
        createMockTranscoderPlugin('brep-transcoder', brepModule),
        createMockTranscoderPlugin('mesh-transcoder', meshModule),
      ],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const igesRoutes = manifest.routes.filter((r) => r.targetFormat === 'iges');
    expect(igesRoutes.length).toBe(2);
  });

  it('should include schema and defaults on direct export routes when a kernel declares export formats', async () => {
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const glbRoute = manifest.routes.find((r) => r.targetFormat === 'glb');
    expect(glbRoute).toBeDefined();
    expect(glbRoute!.exportOptions.schema).toHaveProperty('properties');

    const { properties } = glbRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');

    expect(glbRoute!.exportOptions.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
      }),
    );
  });

  it('should mark only truly required input fields as required in capability schemas', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: z.object({
          defaulted: z.boolean().default(true),
          requiredValue: z.string(),
        }),
      },
    });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    const glbRoute = worker.capabilitiesManifest.routes.find((route) => route.targetFormat === 'glb');
    expect(glbRoute?.exportOptions.schema.required).toEqual(['requiredValue']);
  });

  it('should include ALL declared properties on every direct export route (replicad-like scenario)', async () => {
    const stlSchema = z
      .object({ binary: z.boolean().default(true) })
      .extend(tessellationSchema.shape)
      .extend(coordinateSystemSchema.shape);
    const stepSchema = z
      .object({ assemblyMode: z.enum(['single', 'assembly']).default('single') })
      .extend(coordinateSystemSchema.shape);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        stl: stlSchema,
        step: stepSchema,
        glb: glbSchema,
        gltf: glbSchema,
      },
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;

    const stlRoute = manifest.routes.find((r) => r.targetFormat === 'stl')!;
    expect(stlRoute).toBeDefined();
    const stlProps = Object.keys((stlRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties);
    expect(stlProps).toEqual(expect.arrayContaining(['binary', 'tessellation', 'coordinateSystem']));
    expect(stlRoute.exportOptions.defaults).toMatchObject({ binary: true, coordinateSystem: 'z-up' });
    expect(stlRoute.exportOptions.defaults).toHaveProperty('tessellation');

    const stepRoute = manifest.routes.find((r) => r.targetFormat === 'step')!;
    expect(stepRoute).toBeDefined();
    const stepProps = Object.keys(
      (stepRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties,
    );
    expect(stepProps).toEqual(expect.arrayContaining(['assemblyMode', 'coordinateSystem']));
    expect(stepProps).not.toContain('tessellation');

    const glbRoute = manifest.routes.find((r) => r.targetFormat === 'glb')!;
    expect(glbRoute).toBeDefined();
    const glbProps = Object.keys((glbRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties);
    expect(glbProps).toEqual(expect.arrayContaining(['tessellation', 'coordinateSystem']));

    const gltfRoute = manifest.routes.find((r) => r.targetFormat === 'gltf')!;
    expect(gltfRoute).toBeDefined();
    const gltfProps = Object.keys(
      (gltfRoute.exportOptions.schema as { properties: Record<string, unknown> }).properties,
    );
    expect(gltfProps).toEqual(expect.arrayContaining(['tessellation', 'coordinateSystem']));
  });

  it('should include merged schema and defaults on transcoded export routes', async () => {
    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('schema-merge-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();
    expect(usdzRoute!.transcoderId).toBe('schema-merge-transcoder');
    expect(usdzRoute!.exportOptions.schema).toHaveProperty('properties');

    const { properties } = usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');

    expect(usdzRoute!.exportOptions.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
      }),
    );
  });

  it('should preserve discriminated edge branches when merging source export options', async () => {
    const edgeSchema = z.union([
      z
        .object({
          mode: z.literal('single').default('single'),
          phi: z.number().default(60),
        })
        .strict()
        .meta({ title: 'Single' }),
      z
        .object({
          mode: z.literal('batch'),
          views: z.array(z.object({ id: z.string(), phi: z.number(), theta: z.number() }).strict()).min(1),
        })
        .strict()
        .meta({ title: 'Batch' }),
    ]);
    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'webp', fidelity: 'mesh', optionsSchema: edgeSchema },
    ]);
    const worker = createConfiguredWorker({
      nativeHandle: { kind: 'mock-native-handle' },
      exportZodSchemas: { glb: tessellationSchema },
      transcoders: [createMockTranscoderPlugin('image-transcoder', mockModule)],
    });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    const route = worker.capabilitiesManifest.routes.find((candidate) => candidate.targetFormat === 'webp');
    expect(route?.exportOptions.defaults).toMatchObject({ mode: 'single', phi: 60 });
    const branches = route?.exportOptions.schema.anyOf;
    expect(branches).toHaveLength(2);
    for (const branch of branches ?? []) {
      expect(branch).not.toBe(false);
      expect(branch).not.toBe(true);
      if (typeof branch !== 'object') {
        throw new TypeError('Expected an object JSON Schema branch.');
      }
      expect(branch.type).toBe('object');
      expect(branch.properties).toHaveProperty('mode');
      expect(branch.properties).toHaveProperty('tessellation');
    }

    await openDocument(worker);
    const result = await exportDocument(worker, 'webp', {
      mode: 'batch',
      views: [{ id: 'front', phi: 90, theta: 0 }],
    });

    expect(result.success).toBe(true);
    expect(mockModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'webp',
        options: { mode: 'batch', views: [{ id: 'front', phi: 90, theta: 0 }] },
      }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should publish every capability schema as plain JSON that survives transport and admission', async () => {
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);
    const stlModule = createMockTranscoderModule([
      {
        from: 'glb',
        to: 'stl',
        fidelity: 'mesh',
        optionsSchema: z.strictObject({ binary: z.boolean().default(false) }),
        sourceOptions: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
      },
    ]);
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: glbSchema },
      renderZodSchema: tessellationSchema,
      transcoders: [createMockTranscoderPlugin('stl-transcoder', stlModule)],
    });
    // @ts-expect-error -- route-planner contract test configures the mock kernel's protected declaration map.
    worker.kernelExportContentMap.set('mock-kernel', { glb: ['includeEdges'] });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    const { routes, renderCapabilities } = worker.capabilitiesManifest;
    expect(routes.some((route) => route.targetFormat === 'stl' && route.transcoderId !== undefined)).toBe(true);
    const schemas: Array<readonly [string, JSONSchema7]> = [
      ...routes.flatMap(
        (route): Array<readonly [string, JSONSchema7]> => [
          [`${route.targetFormat} export options`, route.exportOptions.schema],
          ...(route.content ? [[`${route.targetFormat} content`, route.content.schema] as const] : []),
        ],
      ),
      ...Object.entries(renderCapabilities).flatMap(([kernelId, capability]) =>
        capability ? [[`${kernelId} render options`, capability.renderOptions.schema] as const] : [],
      ),
    ];
    for (const [label, schema] of schemas) {
      expect(Reflect.ownKeys(schema), label).toEqual(Object.keys(schema));
      expect(Object.values(schema).includes(undefined), label).toBe(false);
      if (Object.keys(schema).length > 0) {
        expect(() => {
          admitJsonSchema(structuredClone(schema) as Record<string, unknown>);
        }, label).not.toThrow();
      }
    }
  });

  it('should pin image source semantics while exposing only consumer-controlled route options', async () => {
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);
    const imageModule = createMockTranscoderModule(
      (Object.keys(imageEdgeSchemas) as Array<keyof typeof imageEdgeSchemas>).map((target) => ({
        from: 'glb',
        to: target,
        fidelity: 'mesh',
        optionsSchema: imageEdgeSchemas[target],
        content: ['includeEdges'] as const,
        sourceOptions: { coordinateSystem: 'z-up', unit: { length: 'meter' } },
      })),
    );
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: glbSchema },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('image-transcoder', imageModule)],
    });
    // @ts-expect-error -- route-planner contract test configures the mock kernel's protected declaration map.
    worker.kernelExportContentMap.set('mock-kernel', { glb: ['includeEdges'] });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });

    for (const target of Object.keys(imageEdgeSchemas)) {
      const route = worker.capabilitiesManifest.routes.find((candidate) => candidate.targetFormat === target);
      expect(route?.content?.defaults).toEqual({ includeEdges: false });
      expect(route?.content?.schema).toMatchObject({
        additionalProperties: false,
        properties: { includeEdges: { type: 'boolean' } },
      });
      expect(route?.exportOptions.defaults).not.toHaveProperty('coordinateSystem');
      expect(route?.exportOptions.defaults).not.toHaveProperty('unit');

      const branches = route?.exportOptions.schema.anyOf;
      expect(branches).toHaveLength(2);
      for (const branch of branches ?? []) {
        if (typeof branch !== 'object') {
          throw new TypeError('Expected an object JSON Schema branch.');
        }
        expect(branch.properties).toHaveProperty('tessellation');
        expect(branch.properties).toHaveProperty('mode');
        expect(branch.properties).toHaveProperty('width');
        expect(branch.properties).toHaveProperty('includeAxes');
        expect(branch.properties).toHaveProperty('includeLabel');
        expect(branch.properties).toHaveProperty('includeScale');
        expect(branch.properties).not.toHaveProperty('coordinateSystem');
        expect(branch.properties).not.toHaveProperty('unit');
      }
    }

    await openDocument(worker);
    const result = await worker.exportDocument({
      documentId: 'test-document',
      operationId: 'webp-image-export',
      target: 'webp',
      options: { mode: 'single' },
      content: { includeEdges: true },
    });

    expect(result.success, JSON.stringify(result.issues)).toBe(true);
    expect(worker.exportGeometrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'glb',
        options: {
          tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
          coordinateSystem: 'z-up',
          unit: { length: 'meter' },
        },
        content: { includeEdges: true },
      }),
      expect.any(Object),
    );
    expect(imageModule.transcode).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'webp',
      }),
      expect.any(Object),
      expect.any(Object),
    );
    const transcodeInput = imageModule.transcode.mock.calls[0]?.[0];
    expect(transcodeInput?.options).not.toHaveProperty('coordinateSystem');
    expect(transcodeInput?.options).not.toHaveProperty('unit');
  });

  it('should not duplicate enum values in transcoded route schemas', async () => {
    const edgeSchema = coordinateSystemSchema;
    const mockModule = createMockTranscoderModule([
      {
        from: 'glb',
        to: 'usdz',
        fidelity: 'mesh',
        optionsSchema: edgeSchema,
        sourceOptions: { coordinateSystem: 'y-up' },
      },
    ]);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('dedup-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();

    const coordSchema = (usdzRoute!.exportOptions.schema as { properties: { coordinateSystem: { enum: string[] } } })
      .properties.coordinateSystem;
    expect(coordSchema.enum).toEqual(['y-up', 'z-up']);
    expect(coordSchema.enum).toHaveLength(2);
  });

  it('should merge kernel-specific options into transcoded route schema', async () => {
    const qualitySchema = z.object({
      quality: z.number().min(0).max(1).default(0.8).describe('Transcoding quality'),
    });

    const mockModule = {
      name: 'QualityTranscoder',
      version: '1.0.0',
      edges: [{ from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema: qualitySchema }],
      initialize: vi.fn().mockResolvedValue({ initialized: true }),
      transcode: vi.fn().mockResolvedValue({
        success: true,
        data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'output.usdz', mimeType: 'model/vnd.usdz+zip' }],
        issues: [],
      }),
      onDispose: vi.fn().mockResolvedValue(undefined),
    } satisfies TranscoderDefinition<{ initialized: boolean }>;

    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('quality-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();

    const { properties } = usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');
    expect(properties).toHaveProperty('quality');

    expect(usdzRoute!.exportOptions.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
        quality: 0.8,
      }),
    );
  });

  it('should merge edge transcoder JSON Schema properties with kernel JSON Schema', async () => {
    const qualitySchema = z.object({
      quality: z.number().min(0).max(1).default(0.8).describe('Transcoding quality'),
    });

    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh', optionsSchema: qualitySchema },
    ]);

    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        glb: glbSchema,
      },
      transcoders: [createMockTranscoderPlugin('edge-merge-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();

    const { properties } = usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> };
    expect(properties).toHaveProperty('tessellation');
    expect(properties).toHaveProperty('coordinateSystem');
    expect(properties).toHaveProperty('quality');

    expect(usdzRoute!.exportOptions.defaults).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
        coordinateSystem: 'z-up',
        quality: 0.8,
      }),
    );
  });

  it('should propagate replicad-like kernel GLB schema into transcoded USDZ route without Zod schemas', async () => {
    const stlSchema = z
      .object({ binary: z.boolean().default(true).describe('Binary STL format') })
      .extend(tessellationSchema.shape)
      .extend(coordinateSystemSchema.shape)
      .extend(unitSchema.shape);
    const stepSchema = z
      .object({ assemblyMode: z.enum(['single', 'assembly']).default('single').describe('Assembly mode') })
      .extend(coordinateSystemSchema.shape);
    const glbSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);
    const gltfSchema = tessellationSchema.extend(coordinateSystemSchema.shape).extend(unitSchema.shape);

    const mockModule = createMockTranscoderModule([
      { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      { from: 'glb', to: '3mf', fidelity: 'mesh' },
      { from: 'glb', to: 'obj', fidelity: 'mesh' },
    ]);

    const worker = createConfiguredWorker({
      exportZodSchemas: {
        stl: stlSchema,
        step: stepSchema,
        glb: glbSchema,
        gltf: gltfSchema,
      },
      transcoders: [createMockTranscoderPlugin('replicad-converter', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;

    // Direct routes for all 4 native formats
    const directRoutes = manifest.routes.filter((r) => !r.transcoderId);
    expect(directRoutes).toHaveLength(4);
    expect(directRoutes.map((r) => r.targetFormat).sort()).toEqual(['glb', 'gltf', 'step', 'stl']);

    // Transcoded routes: 3 edges × 4 source-matching-GLB = 3 (only GLB matches 'from: glb')
    const transcodedRoutes = manifest.routes.filter((r) => r.transcoderId);
    expect(transcodedRoutes).toHaveLength(3);

    // USDZ route should carry the kernel's GLB tessellation + coordinateSystem + unit
    const usdzRoute = manifest.routes.find((r) => r.targetFormat === 'usdz');
    expect(usdzRoute).toBeDefined();
    expect(usdzRoute!.sourceFormat).toBe('glb');
    expect(usdzRoute!.transcoderId).toBe('replicad-converter');
    expect(usdzRoute!.exportOptions.schema).toHaveProperty('properties');

    const usdzProps = (usdzRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(usdzProps).toHaveProperty('tessellation');
    expect(usdzProps).toHaveProperty('coordinateSystem');
    expect(usdzProps).toHaveProperty('unit');

    expect(usdzRoute!.exportOptions.defaults).toEqual({
      tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
      coordinateSystem: 'z-up',
      unit: { length: 'meter' },
    });

    // 3MF route should also carry the kernel's GLB options
    const threeMfRoute = manifest.routes.find((r) => r.targetFormat === '3mf');
    expect(threeMfRoute).toBeDefined();
    const threeMfProps = (threeMfRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(threeMfProps).toHaveProperty('tessellation');
    expect(threeMfProps).toHaveProperty('coordinateSystem');
    expect(threeMfProps).toHaveProperty('unit');

    // OBJ route should also carry the kernel's GLB options
    const objectRoute = manifest.routes.find((r) => r.targetFormat === 'obj');
    expect(objectRoute).toBeDefined();
    const objectProperties = (objectRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(objectProperties).toHaveProperty('tessellation');
    expect(objectProperties).toHaveProperty('coordinateSystem');
    expect(objectProperties).toHaveProperty('unit');

    // Direct STL route should have its own schema (binary + tessellation + coordinateSystem)
    const stlRoute = manifest.routes.find((r) => r.targetFormat === 'stl' && !r.transcoderId);
    expect(stlRoute).toBeDefined();
    const stlProps = (stlRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(stlProps).toHaveProperty('binary');
    expect(stlProps).toHaveProperty('tessellation');
    expect(stlProps).toHaveProperty('coordinateSystem');
    expect(stlProps).toHaveProperty('unit');

    // Direct STEP route should have assemblyMode + coordinateSystem but NOT tessellation
    const stepRoute = manifest.routes.find((r) => r.targetFormat === 'step' && !r.transcoderId);
    expect(stepRoute).toBeDefined();
    const stepProps = (stepRoute!.exportOptions.schema as { properties: Record<string, unknown> }).properties;
    expect(stepProps).toHaveProperty('assemblyMode');
    expect(stepProps).toHaveProperty('coordinateSystem');
    expect(stepProps).not.toHaveProperty('tessellation');
  });

  it('should apply source format Zod defaults when exporting via transcoded route with empty options', async () => {
    const glbSchema = z.object({
      tessellation: z
        .object({
          linearTolerance: z.number().positive().default(0.01),
          angularTolerance: z.number().positive().default(30),
        })
        .default({ linearTolerance: 0.01, angularTolerance: 30 }),
    });

    const mockModule = createMockTranscoderModule([{ from: 'glb', to: 'usdz', fidelity: 'mesh' }]);

    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: glbSchema },
      nativeHandle: { kind: 'mock-native-handle' },
      transcoders: [createMockTranscoderPlugin('defaults-transcoder', mockModule)],
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    await openDocument(worker);
    const result = await exportDocument(worker, 'usdz', {});

    expect(result.success).toBe(true);

    const kernelInput = worker.exportGeometrySpy.mock.calls[0]![0];
    expect(kernelInput.format).toBe('glb');
    expect(kernelInput.options).toEqual(
      expect.objectContaining({
        tessellation: { linearTolerance: 0.01, angularTolerance: 30 },
      }),
    );
  });
});

// =============================================================================
// rebuildAndPushCapabilities
// =============================================================================

describe('rebuildAndPushCapabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update capabilitiesManifest and invoke onCapabilitiesUpdated callback', () => {
    const worker = createConfiguredWorker();
    const callback = vi.fn();
    worker.onCapabilitiesUpdated = callback;

    // @ts-expect-error - accessing protected method for test verification
    worker.rebuildAndPushCapabilities();

    expect(callback).toHaveBeenCalledOnce();
    const manifest = callback.mock.calls[0]![0]! as CapabilitiesManifest;
    expect(manifest).toBe(worker.capabilitiesManifest);
    expect(manifest.routes.filter((r) => !r.transcoderId).length).toBeGreaterThan(0);
  });

  it('should not throw when onCapabilitiesUpdated is not set', () => {
    const worker = createConfiguredWorker();

    expect(() => {
      // @ts-expect-error - accessing protected method for test verification
      worker.rebuildAndPushCapabilities();
    }).not.toThrow();
  });

  it('should reflect updated kernel export formats in the rebuilt manifest', () => {
    const worker = createConfiguredWorker();
    const callback = vi.fn();
    worker.onCapabilitiesUpdated = callback;

    // @ts-expect-error - accessing protected method for test verification
    worker.rebuildAndPushCapabilities();
    const initialDirectRoutes = worker.capabilitiesManifest.routes.filter((r) => !r.transcoderId).length;

    // @ts-expect-error - accessing protected field for test verification
    worker.kernelExportZodSchemasMap.set('new-kernel', { step: z.object({}), iges: z.object({}) });

    // @ts-expect-error - accessing protected method for test verification
    worker.rebuildAndPushCapabilities();

    const manifest = worker.capabilitiesManifest;
    const directRoutes = manifest.routes.filter((r) => !r.transcoderId);
    expect(directRoutes.length).toBe(initialDirectRoutes + 2);
    expect(directRoutes.some((route) => route.kernelId === 'new-kernel' && route.targetFormat === 'step')).toBe(true);
    expect(directRoutes.some((route) => route.kernelId === 'new-kernel' && route.targetFormat === 'iges')).toBe(true);
  });
});

// =============================================================================
// Native-handle materialization
// =============================================================================

describe('native-handle materialization', () => {
  const stableFileSystem = () => createMockFileSystem({ existsResult: true, readFileResult: new Uint8Array() });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be a no-op when nativeHandle is already set', async () => {
    const worker = createConfiguredWorker({
      nativeHandle: { meshData: new Float32Array(3) },
    });

    await openDocument(worker, {}, createGeometryFile('test.ts'));

    const callsAfterRender = worker.createGeometryCalls;
    const result = await exportDocument(worker, 'gltf');

    expect(result.success).toBe(true);
    // No additional createGeometry calls — nativeHandle was already set
    expect(worker.createGeometryCalls).toBe(callsAfterRender);
  });

  it('should reheat instead of restoring a snapshot without kernel hooks', async () => {
    const serializedData = { brep: 'BREP_DATA', meta: { name: 'part' } };
    const worker = createConfiguredWorker({
      filesystem: stableFileSystem(),
      evaluationSnapshot: serializedData,
    });

    await openDocument(worker);

    const callsAfterRender = worker.createGeometryCalls;
    const artifact = documentArtifact(worker);
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;

    const result = await exportDocument(worker, 'gltf');
    expect(result.success).toBe(true);
    expect(worker.createGeometryCalls).toBeGreaterThan(callsAfterRender);
  });

  it('keeps the durable snapshot off a display render result (W6b/D12)', async () => {
    const serializedData = { brep: 'BREP_DATA', meta: { name: 'part' } };
    const worker = createConfiguredWorker({
      filesystem: stableFileSystem(),
      evaluationSnapshot: serializedData,
    });

    await openDocument(worker);

    const artifact = documentArtifact(worker);
    expect(artifact).toBeDefined();
    /* The snapshot belongs to the export path's slot, not the document result. */
    expect(artifact!.result).not.toHaveProperty('serializedNativeHandle');
    expect(artifact!.serializedNativeHandleSlot?.serializedNativeHandle).toEqual(serializedData);
  });

  it('should re-evaluate when no handle data exists for export', async () => {
    const worker = createConfiguredWorker({ filesystem: stableFileSystem() });

    await openDocument(worker);

    const initialCalls = worker.createGeometryCalls;
    const artifact = documentArtifact(worker);
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;
    artifact!.serializedNativeHandleSlot = undefined;
    const result = await exportDocument(worker, 'gltf');

    expect(result.success).toBe(true);
    expect(worker.createGeometryCalls).toBeGreaterThan(initialCalls);
  });

  it('should reuse the stored native build input for reheat', async () => {
    const worker = createConfiguredWorker({ filesystem: stableFileSystem() });

    const customParams = { radius: 42, height: 10 };
    await openDocument(worker, customParams, createGeometryFile('test.ts'));

    const artifact = documentArtifact(worker);
    expect(artifact?.identity.nativeBuildInput?.parameters).toEqual(customParams);
    artifact!.serializedNativeHandleSlot = undefined;
    vi.spyOn(
      worker as unknown as { isNativeHandleValidForOwner: (...args: unknown[]) => Promise<boolean> },
      'isNativeHandleValidForOwner',
    ).mockResolvedValue(false);
    const replay = vi.spyOn(
      worker as unknown as { onCreateGeometryForOwner: (...args: unknown[]) => Promise<unknown> },
      'onCreateGeometryForOwner',
    );

    const result = await exportDocument(worker, 'gltf');
    expect(result.success).toBe(true);
    expect(replay).toHaveBeenCalledOnce();
    expect(replay.mock.calls[0]?.[1]).toEqual(artifact?.identity.nativeBuildInput);
  });

  it('fails export when a stale handle cannot be reheated from its captured input', async () => {
    const worker = createConfiguredWorker({ filesystem: stableFileSystem() });
    await openDocument(worker, { radius: 42 }, createGeometryFile('test.ts'));
    const artifact = documentArtifact(worker);
    artifact!.serializedNativeHandleSlot = undefined;
    vi.spyOn(
      worker as unknown as { isNativeHandleValidForOwner: (...args: unknown[]) => Promise<boolean> },
      'isNativeHandleValidForOwner',
    ).mockResolvedValue(false);
    const replay = vi
      .spyOn(
        worker as unknown as { onCreateGeometryForOwner: (...args: unknown[]) => Promise<unknown> },
        'onCreateGeometryForOwner',
      )
      .mockRejectedValue(new Error('generation unavailable'));

    const result = await exportDocument(worker, 'gltf');
    expect(result.success).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('HANDLE_MISSING');
    expect(replay.mock.calls[0]?.[1]).toEqual(artifact?.identity.nativeBuildInput);
  });
});

// =============================================================================
// Render option validation
// =============================================================================

describe('render option validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error result when render options fail validation', async () => {
    const renderSchema = z.object({ quality: z.number().min(0).max(1) });
    const worker = createConfiguredWorker({ renderZodSchema: renderSchema });

    await openDocument(worker, {}, createGeometryFile('test.ts'));
    const result = await openView(worker, { quality: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error' })]));
  });

  it('should return validated options when render options pass validation', async () => {
    const renderSchema = z.object({ quality: z.number().default(0.8) });
    const worker = createConfiguredWorker({ renderZodSchema: renderSchema });

    await openDocument(worker, {}, createGeometryFile('test.ts'));
    const result = await openView(worker, { quality: 0.5 });
    expect(result.success).toBe(true);
  });

  it('should pass through options when no render schema exists', async () => {
    const worker = createConfiguredWorker();

    await openDocument(worker, {}, createGeometryFile('test.ts'));
    const result = await openView(worker, { arbitrary: 'value' });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Export schema hard-fail
// =============================================================================

describe('export schema hard-fail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail export when kernel has schemas but format is undeclared and options are provided', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: z.object({ binary: z.boolean().default(true) }) },
    });

    await openDocument(worker);

    const result = await exportDocument(worker, 'stl', { someOption: true });
    expect(result.success).toBe(false);
    expect(result.issues[0]!.message).toContain('No export schema for format');
    expect(result.issues[0]!.message).toContain('glb');
  });

  it('should reject keys absent from a strict kernel export schema', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: { stl: strictStlExportSchema },
    });

    await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });
    await openDocument(worker);

    const result = await exportDocument(worker, 'stl', { binary: false, futurePluginOption: true });
    expect(result).toMatchObject({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'EXPORT_OPTIONS_INVALID',
          message: expect.stringContaining('futurePluginOption') as string,
        }),
      ],
    });
  });

  it('aborts an export at the filesystem checkpoint', async () => {
    const filesystem = createMockFileSystem();
    filesystem.mocks.readFiles.mockResolvedValue({ 'main.ts': new Uint8Array([1, 2, 3]) });
    const readDuringExport = defineMiddleware({
      id: 'readsDuringExport',
      name: 'ReadsDuringExport',
      version: '1.0.0',
      async wrapExport(input, handler, runtime) {
        await runtime.filesystem.exists('main.ts');
        return handler(input);
      },
    });
    const worker = createConfiguredWorker({ filesystem, middleware: [readDuringExport] });
    // Initializing with an inline filesystem installs the worker's own
    // abort-checked filesystem facade over the mock.
    await worker.initialize({ callbacks: { onLog: noopLog }, transferables: { inlineFileSystem: filesystem } });

    await openDocument(worker);
    filesystem.mocks.exists.mockClear();

    const controller = new AbortController();
    controller.abort();

    await expect(
      worker.exportDocument(
        { documentId: 'test-document', operationId: 'aborted-export', target: 'glb' },
        controller.signal,
      ),
    ).rejects.toBeDefined();
    // The checkpoint fires before the read reaches the supplied filesystem.
    expect(filesystem.mocks.exists).not.toHaveBeenCalled();
    await worker.cleanup();
  });

  it('should allow export without options for undeclared format (transcoder route)', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: { glb: z.object({}) },
    });

    await openDocument(worker);

    const result = await exportDocument(worker, 'stl');
    expect(result.success).toBe(false);
    expect(result.issues[0]!.message).toContain('No export route found');
  });
});

// =============================================================================
// Capabilities Manifest target shape
// =============================================================================

describe('CapabilitiesManifest target shape', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should expose only the settled manifest fields', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    expect(Object.keys(manifest).sort()).toEqual(['registrations', 'renderCapabilities', 'routes']);
    expect('kernelExports' in manifest).toBe(false);
    expect('transcodeEdges' in manifest).toBe(false);
    expect('exportRoutes' in manifest).toBe(false);
    expect('renderOptions' in manifest).toBe(false);
  });

  it('should not include routeId on any route', async () => {
    const worker = createConfiguredWorker();

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    expect(manifest.routes.length).toBeGreaterThan(0);
    for (const route of manifest.routes) {
      expect('routeId' in route).toBe(false);
    }
  });

  it('should derive route fidelity from @taucad/types lookup table', async () => {
    const worker = createConfiguredWorker({
      exportZodSchemas: {
        step: z.object({}),
        iges: z.object({}),
        brep: z.object({}),
        glb: z.object({}),
      },
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const stepRoute = manifest.routes.find((route) => route.targetFormat === 'step');
    const igesRoute = manifest.routes.find((route) => route.targetFormat === 'iges');
    const brepRoute = manifest.routes.find((route) => route.targetFormat === 'brep');
    const glbRoute = manifest.routes.find((route) => route.targetFormat === 'glb');

    expect(stepRoute?.fidelity).toBe('brep');
    expect(igesRoute?.fidelity).toBe('brep');
    expect(brepRoute?.fidelity).toBe('brep');
    expect(glbRoute?.fidelity).toBe('mesh');
  });

  it('should expose renderCapabilities indexed by kernelId when render schemas are registered', async () => {
    const worker = createConfiguredWorker({
      renderZodSchema: tessellationSchema,
    });

    await worker.initialize({
      callbacks: { onLog: vi.fn() },
      transferables: {},
      options: {},
    });

    const manifest = worker.capabilitiesManifest;
    const renderOptions = manifest.renderCapabilities['mock-kernel']?.renderOptions;
    expect(renderOptions?.schema).toBeDefined();
    expect(renderOptions?.defaults).toMatchObject({
      tessellation: { linearTolerance: 0.1, angularTolerance: 15 },
    });
  });
});
