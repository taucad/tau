/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as IsolationModule from '@taucad/runtime/cross-origin-isolation';
import type { IsolationStatus } from '@taucad/runtime/cross-origin-isolation';
import type * as KernelModule from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/types';
import { createNodeIo } from '@taucad/geometry-core';
import type { TauCadTopologyRoot } from '@taucad/geometry-core';
import { createMockKernelRuntime, expectKernelProjectionOrder, glbToDocument } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { CreatePicoOptions, CreatePicoRuntimeOptions, Mesh, Pico, PicoRuntime, Voxels } from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';

import { picovoxelBuiltinModuleNames, picovoxelDetectPattern, picovoxelKernel } from '#picovoxel.kernel.js';
import type { PicovoxelOptionsInput } from '#picovoxel.schemas.js';

type Artifact = 'serial' | 'multi';

const isolation = vi.hoisted(() => ({ status: undefined as IsolationStatus | undefined }));
const abort = vi.hoisted(() => ({ after: Infinity, checks: 0 }));
const registered = vi.hoisted(() => new Map<string, unknown>());
const renderAborted = () => Object.assign(new Error('Render aborted'), { name: 'RenderAbortedError' });
const sessions = vi.hoisted(() => ({
  created: [] as Array<{ artifact: 'serial' | 'multi'; options: CreatePicoOptions; pico: Pico }>,
  runtimes: [] as Array<{ artifact: 'serial' | 'multi'; runtime: PicoRuntime; options: CreatePicoRuntimeOptions }>,
  author: [] as Array<{ options: CreatePicoOptions; pico: Pico }>,
  memoryTotal: undefined as number | undefined,
  heapBytes: undefined as number | undefined,
  disposeThrows: false,
  runtimeDisposeThrows: false,
  failStart: undefined as 'serial' | 'multi' | undefined,
  failStartCode: 'PICO_WASM_INIT_FAILED' as 'PICO_WASM_INIT_FAILED' | 'PICO_OUT_OF_MEMORY',
}));

vi.mock('@taucad/runtime/cross-origin-isolation', async (importOriginal) => {
  const actual = await importOriginal<typeof IsolationModule>();
  return { ...actual, getIsolationStatus: () => isolation.status ?? actual.getIsolationStatus() };
});

// Cooperative cancellation: the framework's abort context is worker-internal, so the test counts the
// kernel's checks and aborts after `abort.after` of them.
vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof KernelModule>();
  return {
    ...actual,
    registerKernelModule(...arguments_: Parameters<typeof actual.registerKernelModule>) {
      registered.set(arguments_[1].name, arguments_[1].exports);
      actual.registerKernelModule(...arguments_);
    },
    checkAbort() {
      abort.checks++;
      if (abort.checks > abort.after) {
        throw renderAborted();
      }
    },
  };
});

/** A session whose memory, heap size or dispose the test overrides; the real one otherwise. */
const recordSession = (artifact: Artifact, pico: Pico, options: CreatePicoOptions): Pico => {
  const recorded = new Proxy(pico, {
    get(target, property) {
      if (property === 'memory' && sessions.memoryTotal !== undefined) {
        return { ...target.memory, total: sessions.memoryTotal };
      }
      if (property === 'module' && sessions.heapBytes !== undefined) {
        const heap = { byteLength: sessions.heapBytes };
        return new Proxy(target.module, {
          get: (module, key) => (key === 'HEAPU8' ? heap : (Reflect.get(module, key) as unknown)),
        });
      }
      if (property === 'dispose' && sessions.disposeThrows) {
        return () => {
          target.dispose();
          throw new Error('dispose failed');
        };
      }
      return Reflect.get(target, property) as unknown;
    },
  });
  sessions.created.push({ artifact, options, pico: recorded });
  return recorded;
};

const recordArtifact = (artifact: Artifact, actual: typeof PicovoxelModule): typeof PicovoxelModule => ({
  ...actual,
  async createPico(options?: CreatePicoOptions) {
    const pico = await actual.createPico(options);
    sessions.author.push({ options: options ?? {}, pico });
    return pico;
  },
  async createPicoRuntime(options = {}) {
    if (sessions.failStart === artifact) {
      throw new actual.PicoError(sessions.failStartCode, 'The shared memory could not be allocated.');
    }
    const runtime = await actual.createPicoRuntime(options);
    const createSession = runtime.createPico.bind(runtime);
    const dispose = runtime.dispose.bind(runtime);
    const recorded = Object.assign(runtime, {
      async createPico(sessionOptions: CreatePicoOptions = {}) {
        return recordSession(artifact, await createSession(sessionOptions), sessionOptions);
      },
      dispose() {
        dispose();
        if (sessions.runtimeDisposeThrows) {
          throw new Error('teardown failed');
        }
      },
    });
    sessions.runtimes.push({ artifact, runtime: recorded, options });
    return recorded;
  },
});

vi.mock('picovoxel', async (importOriginal) => recordArtifact('serial', await importOriginal()));
vi.mock('picovoxel/multi', async (importOriginal) => recordArtifact('multi', await importOriginal()));

type MainModule = Record<string, unknown>;

type ExportInput = Parameters<NonNullable<typeof definition.export>>[0];

const definition = await resolveRuntimePluginDefinition('kernel', picovoxelKernel());

/**
 * A kernel runtime whose bundler and executor hand the kernel `module` directly, so each test states
 * its model as a JavaScript `main(pico, params)` instead of source text.
 */
const createRuntime = (
  module: MainModule | (() => unknown),
  overrides: { bundleIssues?: KernelIssue[]; executeIssues?: KernelIssue[] } = {},
) => {
  const runtime = createMockKernelRuntime();
  const registerModule = vi.fn<typeof runtime.bundler.registerModule>();
  return Object.assign(runtime, {
    bundler: {
      ...runtime.bundler,
      registerModule,
      bundle: vi.fn(async () =>
        overrides.bundleIssues
          ? { code: '', issues: overrides.bundleIssues, success: false, dependencies: [], unresolvedPaths: [] }
          : { code: 'bundled', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
      ),
    },
    execute: vi.fn(async () => {
      if (overrides.executeIssues) {
        return { success: false, issues: overrides.executeIssues } as const;
      }
      return { success: true, value: typeof module === 'function' ? module() : module } as const;
    }),
  });
};

const initialize = async (options: PicovoxelOptionsInput, runtime = createRuntime({})) =>
  definition.initialize(definition.optionsSchema!.parse(options), runtime);

const evaluate = async (input: {
  module: MainModule | (() => unknown);
  lane?: 'fast' | 'exact';
  wasm?: PicovoxelOptionsInput['wasm'];
  parameters?: Record<string, unknown>;
}) => {
  const runtime = createRuntime(input.module);
  const context = await initialize({ wasm: input.wasm ?? 'serial' }, runtime);
  const result = await definition.evaluate(
    { entryPath: 'main.ts', parameters: input.parameters ?? {}, options: { lane: input.lane ?? 'fast' } },
    runtime,
    context,
  );
  return { runtime, context, result };
};

const buildIssues = async (promise: Promise<unknown>): Promise<readonly KernelIssue[]> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as { issues: readonly KernelIssue[] }).issues;
  }
  throw new Error('Expected the build to fail.');
};

/** The context's serial runtime, started if a failed render recycled it. */
const loadRuntimeFor = async (context: Awaited<ReturnType<typeof initialize>>): Promise<PicoRuntime> => {
  const { createPicoRuntime } = await import('picovoxel');
  return context.runtimes.get('serial') ?? createPicoRuntime();
};

const sphere = (radius = 3) => ({
  defaultParams: { voxelSize: 1 },
  default: (pico: Pico): Voxels => pico.createVoxels({ shape: 'sphere', radius }),
});

const offsetSphere = {
  default: (pico: Pico): Voxels => pico.createVoxels({ shape: 'sphere', radius: 3 }).offset({ distance: 0.5 }),
};

const helloCube = (pico: Pico): Mesh =>
  pico.createMesh({
    vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    triangles: [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ],
  });

const buildFailure: KernelIssue = { message: 'syntax', code: 'BUNDLER_FAILED', severity: 'error' };

const stlHeader = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes.subarray(0, 80)).trimEnd();

beforeEach(() => {
  isolation.status = undefined;
  abort.after = Infinity;
  abort.checks = 0;
  sessions.created.length = 0;
  sessions.runtimes.length = 0;
  sessions.author.length = 0;
  sessions.memoryTotal = undefined;
  sessions.heapBytes = undefined;
  sessions.disposeThrows = false;
  sessions.runtimeDisposeThrows = false;
  sessions.failStart = undefined;
  sessions.failStartCode = 'PICO_WASM_INIT_FAILED';
});

describe('picovoxel kernel', () => {
  describe('identity', () => {
    it('should key the kernel version on the PicoVoxel version, both artifact digests and its scripts', () => {
      expect(definition.version).toMatch(
        /^1\.4\.0\+picovoxel\.[\w.-]+\.serial-[\da-f]{12}\.multi-[\da-f]{12}\.scripts-[\da-f]{12}$/,
      );
    });

    it('should expose neither the session factories nor three to author code', () => {
      expect(picovoxelBuiltinModuleNames).toEqual([
        'picovoxel',
        'picovoxel/latticelibrary',
        'picovoxel/numerics',
        'picovoxel/shapekernel',
        'picovoxel/slicing',
      ]);
    });
    it.each([
      ["import { createMesh } from 'picovoxel';", true],
      ["import { BaseBox } from 'picovoxel/shapekernel';", true],
      ["const pico = await import('picovoxel');", true],
      ["import { TorusKnotGeometry } from 'three';", false],
      ["import { makeBaseBox } from 'replicad';", false],
    ])('should claim %s only when it imports picovoxel (%s)', (source, claimed) => {
      expect(picovoxelDetectPattern.test(source)).toBe(claimed);
    });
  });

  describe('initialize', () => {
    it('should register every author builtin at the PicoVoxel version', async () => {
      const runtime = createRuntime({});
      await initialize({ wasm: 'serial' }, runtime);

      const { version } = JSON.parse(
        readFileSync(fileURLToPath(import.meta.resolve('picovoxel/package.json')), 'utf8'),
      ) as {
        version: string;
      };
      expect(runtime.bundler.registerModule.mock.calls.map(([name, module]) => [name, module.version])).toEqual(
        picovoxelBuiltinModuleNames.map((name) => [name, version]),
      );
      expect(runtime.logger.log).toHaveBeenCalledWith('PicoVoxel fast-lane WASM variant: serial');
    });

    it('should log why the multi-threaded build is unavailable when auto resolves to serial', async () => {
      isolation.status = { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-coep' };
      const runtime = createRuntime({});
      const context = await initialize({ wasm: 'auto' }, runtime);

      expect(context.wasm).toBe('serial');
      expect(runtime.logger.log).toHaveBeenCalledWith(
        'PicoVoxel fast-lane WASM variant: serial (multi-threaded build unavailable: no-coep)',
      );
    });
  });

  describe('lanes and artifacts', () => {
    it('should open a fast session without an explicit fastRenorm so the lane bundle turns it on', async () => {
      const { result } = await evaluate({ module: offsetSphere, parameters: { voxelSize: 1 } });

      expect(sessions.created).toHaveLength(1);
      expect(sessions.created[0]!.options).toEqual({ voxelSize: 1, lane: 'fast', memoryWarningBytes: 0 });
      // Only a Class-2 op (fastRenorm) gives an offset fast provenance.
      expect(result.handle.shapes[0]!.lane).toBe('fast');
    });

    it('should build exact geometry in an exact session on the serial artifact', async () => {
      const { result } = await evaluate({ module: offsetSphere, lane: 'exact', wasm: 'multi' });

      expect(sessions.created.map(({ artifact, options }) => [artifact, options.lane])).toEqual([['serial', 'exact']]);
      expect(result.handle.shapes[0]!.lane).toBe('exact');
    });

    it('should run the fast lane on the multi-threaded artifact and keep its pool warm until onDispose', async () => {
      const { runtime, context } = await evaluate({ module: sphere(), wasm: 'multi' });
      const [session] = sessions.created;
      const pthread = session!.pico.module.PThread;

      expect(session!.artifact).toBe('multi');
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^PicoVoxel session variant=multi pthreads=[1-9]\d* lane=fast$/),
      );
      expect(pthread!.runningWorkers.length).toBeGreaterThan(0);

      // DP10: onDispose terminates the pool; no pthread keeps running.
      await definition.onDispose!(context);
      expect(pthread!.runningWorkers).toHaveLength(0);
      expect(context.runtimes.size).toBe(0);
    }, 60_000);

    it('should report zero pthreads on the serial artifact', async () => {
      const { runtime } = await evaluate({ module: sphere() });

      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel session variant=serial pthreads=0 lane=fast');
    });

    it('should fail a fast render visibly when an explicit multi request cannot run, and still build exact', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      isolation.status = { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-secure-context' };

      const issues = await buildIssues(
        definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context),
      );
      expect(issues).toEqual([
        expect.objectContaining({
          code: 'KERNEL_CAPABILITY_MISSING',
          details: expect.objectContaining({ capability: 'PICOVOXEL_MULTI_UNAVAILABLE', reason: 'no-secure-context' }),
        }),
      ]);
      expect(sessions.created).toHaveLength(0);

      const exact = await definition.evaluate(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } },
        runtime,
        context,
      );
      expect(exact.handle.shapes).toHaveLength(1);
    });

    it('should start one warm runtime per artifact and open a fresh session per render', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      const render = async (lane: 'fast' | 'exact') =>
        definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane } }, runtime, context);

      await render('exact');
      const serial = context.runtimes.get('serial');
      await render('fast');
      await render('exact');
      await render('fast');

      expect([...context.runtimes.keys()].sort()).toEqual(['multi', 'serial']);
      expect(context.runtimes.get('serial')).toBe(serial);
      expect(sessions.runtimes.map(({ artifact }) => artifact)).toEqual(['serial', 'multi']);
      expect(sessions.created.map(({ artifact }) => artifact)).toEqual(['serial', 'multi', 'serial', 'multi']);
      const handles = (artifact: 'serial' | 'multi') =>
        new Set(sessions.created.filter((session) => session.artifact === artifact).map(({ pico }) => pico.handle));
      // Each render opens its own Library instance on the shared module; handles are never reused.
      expect([handles('serial').size, handles('multi').size]).toEqual([2, 2]);
      await definition.onDispose!(context);
    }, 60_000);
  });

  describe('results', () => {
    it.each([
      // eslint-disable-next-line @typescript-eslint/naming-convention -- JSON.stringify invokes this standardized hook name.
      { toJSON: () => null },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- JSON.stringify invokes this standardized hook name.
      { toJSON: () => ({ pbrMetallicRoughness: { roughnessFactor: 2 } }) },
    ])('should reject invalid material produced by JSON serialization %#', async (material) => {
      const issues = await buildIssues(
        evaluate({ module: { default: (pico: Pico) => ({ shape: helloCube(pico), name: 'Pin', material }) } }),
      );
      expect(issues[0]!.message).toMatch(
        /Pin \(output 1\): (material must be an object|material\.pbrMetallicRoughness\.roughnessFactor must be within \[0, 1])/,
      );
    });

    it('should reject invalid resources produced by JSON serialization', async () => {
      const issues = await buildIssues(
        evaluate({
          // eslint-disable-next-line @typescript-eslint/naming-convention -- JSON.stringify invokes this standardized hook name.
          module: { default: () => ({ shapes: [], samplers: [{ wrapS: 10_497, toJSON: () => ({ wrapS: 1 }) }] }) },
        }),
      );
      expect(issues[0]!.message).toContain('model resources: samplers[0].wrapS must be a standard glTF sampler value');
    });

    it('should own JSON metadata and image bytes while omitting undefined object fields', async () => {
      const extras = { nested: { value: 1 }, omitted: undefined, array: [undefined, 2] };
      const data = new Uint8Array([1, 2, 3]);
      const sampler = { wrapS: 10_497, extras };
      const { runtime, context, result } = await evaluate({
        module: { default: () => ({ shapes: [], images: [{ mimeType: 'image/png', data }], samplers: [sampler] }) },
      });
      try {
        expect(result.handle.samplers).toEqual([{ wrapS: 10_497, extras: { nested: { value: 1 }, array: [null, 2] } }]);
        expect(result.handle.images?.[0]?.data).toEqual(data);
        expect(result.handle.images?.[0]?.data).not.toBe(data);
        expect(extras).toHaveProperty('omitted', undefined);
        extras.nested.value = 9;
        data[0] = 9;
        expect(result.handle.samplers?.[0]?.extras).toEqual({ nested: { value: 1 }, array: [null, 2] });
        expect(result.handle.images?.[0]?.data).toEqual(new Uint8Array([1, 2, 3]));
      } finally {
        await definition.onDispose!(context);
        expect(runtime.logger.error).not.toHaveBeenCalled();
      }
    });

    it('should reject a malformed model envelope before capturing its parts', async () => {
      const issues = await buildIssues(evaluate({ module: { default: () => ({ shapes: {} }) } }));

      expect(issues[0]!.message).toContain('model.shapes must be a flat array');
    });

    it.each([null, [], 42])('should reject non-object material %j with its part context', async (material) => {
      const issues = await buildIssues(
        evaluate({ module: { default: (pico: Pico) => ({ shape: helloCube(pico), name: 'Pin', material }) } }),
      );

      expect(issues[0]!.message).toContain('Pin (output 1): material must be an object.');
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, 1n, Symbol('metadata'), () => 1])(
      'should reject unsupported material metadata %# before taking a cache snapshot',
      async (value) => {
        const issues = await buildIssues(
          evaluate({
            module: { default: (pico: Pico) => ({ shape: helloCube(pico), material: { extras: { value } } }) },
          }),
        );

        expect(issues[0]!.message).toContain('Shape 1 (output 1):');
        expect(issues[0]!.message).toContain('must contain finite JSON values.');
      },
    );

    it('should reject a material made invalid by toJSON before caching its snapshot', async () => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: (pico: Pico) => ({
              shape: helloCube(pico),
              name: 'Pin',
              material: {
                pbrMetallicRoughness: { roughnessFactor: 0.5 },
                // eslint-disable-next-line @typescript-eslint/naming-convention -- JSON.stringify requires this method name.
                toJSON() {
                  return { pbrMetallicRoughness: { roughnessFactor: 2 } };
                },
              },
            }),
          },
        }),
      );

      expect(issues.map((issue) => issue.message)).toContainEqual(
        expect.stringContaining('Pin (output 1): material.pbrMetallicRoughness.roughnessFactor'),
      );
    });

    it('should reject a sampler made invalid by toJSON before caching its snapshot', async () => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: () => ({
              shapes: [],
              samplers: [
                {
                  wrapS: 10_497,
                  // eslint-disable-next-line @typescript-eslint/naming-convention -- JSON.stringify requires this method name.
                  toJSON() {
                    return { wrapS: 42 };
                  },
                },
              ],
            }),
          },
        }),
      );

      expect(issues.map((issue) => issue.message)).toContainEqual(
        expect.stringContaining('model resources: samplers[0].wrapS'),
      );
    });

    it('should retain context when user-authored metadata getters throw non-errors', async () => {
      const materialIssues = await buildIssues(
        evaluate({
          module: {
            default: (pico: Pico) => ({
              shape: helloCube(pico),
              material: {
                get extras() {
                  // oxlint-disable-next-line typescript/only-throw-error -- User-authored getters can throw non-errors; preserve their diagnostic context.
                  throw 'material getter failed';
                },
              },
            }),
          },
        }),
      );
      expect(materialIssues[0]!.message).toContain('Shape 1 (output 1): material getter failed');

      const resourceIssues = await buildIssues(
        evaluate({
          module: {
            default: () => ({
              shapes: [],
              get images() {
                // oxlint-disable-next-line typescript/only-throw-error -- User-authored getters can throw non-errors; preserve their diagnostic context.
                throw 'resource getter failed';
              },
            }),
          },
        }),
      );
      expect(resourceIssues[0]!.message).toContain('model resources: resource getter failed');
    });

    it('should preserve authored labels for mixed descriptors and raw parts after session disposal', async () => {
      const { result } = await evaluate({
        module: {
          default: (pico: Pico) => {
            const mesh = helloCube(pico);
            return [
              { shape: mesh, name: '  Housing / 蓋 🧩  ' },
              { shape: pico.createVoxels({ shape: 'sphere', radius: 2 }), name: 'Mesh' },
              mesh,
              { shape: mesh, name: 'Housing / 蓋 🧩' },
              { shape: mesh, name: '  ' },
              { shape: mesh },
            ];
          },
        },
      });
      expect(result.handle.shapes.map(({ name }) => name)).toEqual([
        'Housing / 蓋 🧩',
        'Mesh',
        'Shape 3',
        'Housing / 蓋 🧩',
        'Shape 5',
        'Shape 6',
      ]);
      expect(result.handle.shapes[0]!.vertices).toEqual(result.handle.shapes[2]!.vertices);
      expect(result.handle.shapes[0]!.triangles).toEqual(result.handle.shapes[2]!.triangles);
      expect(() => sessions.created[0]!.pico.memory).toThrow('disposed');
    });

    it('should keep a returned mesh and flat arrays of meshes and voxels as numbered shapes', async () => {
      const { result } = await evaluate({
        module: { default: (pico: Pico) => [helloCube(pico), pico.createVoxels({ shape: 'sphere', radius: 2 })] },
      });

      expect(result.handle.shapes.map(({ name }) => name)).toEqual(['Shape 1', 'Shape 2']);
      expect([...result.handle.shapes[0]!.triangles.subarray(0, 3)]).toEqual([0, 2, 1]);
    });

    it('should accept a single named part and retain generated-looking authored labels', async () => {
      for (const name of ['Geometry', 'Shape_0']) {
        // oxlint-disable-next-line no-await-in-loop -- builds share the recorded session list
        const { result } = await evaluate({
          module: { default: (pico: Pico) => ({ shape: helloCube(pico), name }) },
        });
        expect(result.handle.shapes.map((shape) => shape.name)).toEqual([name]);
      }
    });

    it.each([
      [42, 'name must be a string'],
      [null, 'name must be a string'],
      [false, 'name must be a string'],
    ])('should reject descriptor name %j and release the session', async (name, message) => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: (pico: Pico) => [helloCube(pico), { shape: helloCube(pico), name }],
          },
        }),
      );
      expect(issues[0]).toMatchObject({ code: 'RUNTIME', message: expect.stringContaining(`result 2 ${message}`) });
      expect(() => sessions.created[0]!.pico.allocated).toThrow(expect.objectContaining({ code: 'PICO_DISPOSED' }));
    });

    it.each([
      [{ shape: null }, 'received null'],
      [{ name: 'Missing' }, 'received undefined'],
      [{ shape: [] }, 'received an array'],
      [{ shape: { shape: null, name: 'Nested' } }, 'received object'],
      [{ children: [] }, 'cannot contain children. Return a flat array of parts'],
    ])('should reject malformed descriptor %j', async (value, message) => {
      const issues = await buildIssues(evaluate({ module: { default: () => [value] } }));
      expect(issues[0]).toMatchObject({ code: 'RUNTIME', message: expect.stringContaining(message) });
      expect(issues[0]!.message).toContain('result 1');
    });

    it('should identify the failing duplicate by label and output index', async () => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: (pico: Pico) => [
              { shape: helloCube(pico), name: 'Pin' },
              { shape: pico.createVoxels({ shape: 'empty' }), name: 'Pin' },
            ],
          },
        }),
      );
      expect(issues[0]).toMatchObject({
        code: 'RUNTIME',
        message: 'PicoVoxel Pin (output 2) is an empty Voxels field. Return [] for an empty scene.',
      });
    });

    it('should drop exactly-zero-area triangles once, for the viewer and every export (D36)', async () => {
      const { result } = await evaluate({
        module: {
          default: (pico: Pico) => {
            const cube = helloCube(pico);
            // Cube triangles plus one with a repeated index: 13 in, 12 out.
            return pico.createMesh({ vertices: cube.vertices, triangles: [...cube.triangles, 0, 0, 1] });
          },
        },
      });

      expect(result.handle.shapes[0]!.triangles).toHaveLength(36);
    });

    it('should refuse a shape whose every triangle has zero area as empty, not an index-less mesh', async () => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: (pico: Pico) =>
              pico.createMesh({ vertices: [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0], triangles: [0, 0, 3, 0, 1, 2] }),
          },
        }),
      );

      expect(issues[0]!.message).toBe(
        'PicoVoxel Shape 1 (output 1) is empty: every triangle has zero area. Return [] for an empty scene.',
      );
    });

    it('should treat an empty array as an empty scene', async () => {
      const { result } = await evaluate({ module: { default: () => [] } });

      expect(result.handle.shapes).toEqual([]);
    });

    it('should default the voxel size to half a millimetre', async () => {
      await evaluate({ module: sphere() });

      expect(sessions.created[0]!.options.voxelSize).toBe(0.5);
    });

    it.each([
      [
        { default: () => 42 },
        'PicoVoxel main() result 1 must be Mesh, Voxels or { shape: Mesh | Voxels, name?: string, material?: Material }; received number.',
      ],
      [{ default: () => null }, 'received null.'],
      [{ default: () => [[]] }, 'received an array.'],
      [
        { default: (pico: Pico) => pico.createVoxels({ shape: 'empty' }) },
        'PicoVoxel Shape 1 (output 1) is an empty Voxels field.',
      ],
      [
        { default: (pico: Pico) => pico.createMesh({ vertices: [], triangles: [] }) },
        'PicoVoxel Shape 1 (output 1) is empty. Return [] for an empty scene.',
      ],
      [{ main: () => [] }, 'PicoVoxel source must default-export a main(pico, params) function.'],
    ])('should refuse an invalid result %#', async (module, message) => {
      const issues = await buildIssues(evaluate({ module }).then(({ result }) => result));

      expect(issues[0]!.message).toContain(message);
    });

    it('should refuse source that evaluates to something other than a module', async () => {
      const issues = await buildIssues(evaluate({ module: () => 'not a module' }).then(({ result }) => result));

      expect(issues[0]!.message).toBe('PicoVoxel source must default-export a main(pico, params) function.');
    });

    it('should unwrap a CommonJS-style default namespace', async () => {
      const { result } = await evaluate({ module: { default: { default: () => [] } } });

      expect(result.handle.shapes).toEqual([]);
    });

    it.each([
      [{ voxelSize: -1 }, 'received -1'],
      [{ voxelSize: '1' }, 'received string'],
    ])('should refuse the voxel size %j', async (parameters, message) => {
      const issues = await buildIssues(evaluate({ module: sphere(), parameters }).then(({ result }) => result));

      expect(issues[0]!.message).toBe(
        `PicoVoxel voxelSize must be a positive finite number of millimetres; ${message}.`,
      );
    });
  });

  describe('snapshot validation', () => {
    const meshLike = (vertices: number[], triangles: number[], lane?: string) => ({
      default: (pico: Pico) => {
        const mesh = helloCube(pico);
        return {
          vertices: new Float32Array(vertices),
          triangles: new Uint32Array(triangles),
          toVoxels: mesh.toVoxels,
          ...(lane === undefined ? {} : { lane }),
        };
      },
    });

    it.each([
      [meshLike([0, 0, 0, 1], [0, 0, 0]), 'must contain vertex and triangle triples.'],
      [meshLike([0, 0, 0, 1, 0, Number.NaN, 0, 1, 0], [0, 1, 2]), 'contains a non-finite vertex coordinate.'],
      [meshLike([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 3]), 'triangle index 3 is outside its 3 vertices.'],
    ])('should refuse a malformed mesh %#', async (module, message) => {
      const issues = await buildIssues(evaluate({ module }).then(({ result }) => result));

      expect(issues[0]!.message).toContain(message);
    });

    it('should fall back to the session lane when a mesh carries none', async () => {
      const { result } = await evaluate({
        module: meshLike([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]),
        lane: 'exact',
      });

      expect(result.handle.shapes[0]!.lane).toBe('exact');
    });

    it('should retain an owned buffer without widening an offset mesh view', async () => {
      const vertices = new Float32Array(
        new ArrayBuffer(13 * Float32Array.BYTES_PER_ELEMENT),
        2 * Float32Array.BYTES_PER_ELEMENT,
        9,
      );
      vertices.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const triangles = new Uint32Array(
        new ArrayBuffer(5 * Uint32Array.BYTES_PER_ELEMENT),
        Uint32Array.BYTES_PER_ELEMENT,
        3,
      );
      triangles.set([0, 1, 2]);
      const { result } = await evaluate({
        module: {
          default: (pico: Pico) => ({ vertices, triangles, toVoxels: helloCube(pico).toVoxels }),
        },
      });
      const shape = result.handle.shapes[0]!;

      expect(shape.vertices.buffer).toBe(vertices.buffer);
      expect(shape.vertices.byteOffset).toBe(vertices.byteOffset);
      expect(shape.vertices.length).toBe(vertices.length);
      expect([...shape.vertices]).toEqual([...vertices]);
      expect(shape.triangles.buffer).toBe(triangles.buffer);
      expect(shape.triangles.byteOffset).toBe(triangles.byteOffset);
      expect(shape.triangles.length).toBe(triangles.length);
      expect([...shape.triangles]).toEqual([...triangles]);
    });

    it('should copy vertices that live in a shared buffer', async () => {
      const shared = new Float32Array(new SharedArrayBuffer(36));
      shared.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint32Array(new SharedArrayBuffer(12));
      indices.set([0, 1, 2]);
      const { result } = await evaluate({
        module: {
          default: (pico: Pico) => ({ vertices: shared, triangles: indices, toVoxels: helloCube(pico).toVoxels }),
        },
      });

      expect(result.handle.shapes[0]!.vertices.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.handle.shapes[0]!.triangles.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.handle.shapes[0]!.vertices.buffer).not.toBe(shared.buffer);
      expect(result.handle.shapes[0]!.triangles.buffer).not.toBe(indices.buffer);
    });
  });

  describe('issues', () => {
    it('should keep an out-of-memory code in the details and name the remedy', async () => {
      const picovoxelModule = await import('picovoxel');
      const issues = await buildIssues(
        evaluate({
          module: {
            default: () => {
              throw new picovoxelModule.PicoError('PICO_OUT_OF_MEMORY', 'Failed to allocate.');
            },
          },
        }).then(({ result }) => result),
      );

      expect(issues[0]).toMatchObject({
        code: 'RESOURCE_LIMIT',
        message: expect.stringContaining('increase voxelSize'),
        details: {
          producer: { kernelId: 'picovoxel' },
          picoCode: 'PICO_OUT_OF_MEMORY',
          lane: 'fast',
          artifact: 'serial',
        },
      });
    });

    it('should refuse fast-lane data in an exact build with a typed issue and the Tau remedy', async () => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: (pico: Pico) =>
              pico.createVoxels({ shape: 'sphere', radius: 1 }).offset({ distance: 1, fastRenorm: true }),
          },
          lane: 'exact',
        }).then(({ result }) => result),
      );

      expect(issues[0]).toMatchObject({
        code: 'REPRESENTATION_UNSUPPORTED',
        message: expect.stringContaining("Regenerate the input with an exact export (lane: 'exact', the default)"),
        details: {
          picoCode: 'PICO_LANE_LOOSENED',
          refusal: 'PICOVOXEL_LANE_LOOSENED',
          picoMessage: expect.stringContaining('fastRenorm'),
          lane: 'exact',
        },
      });
    });

    it('should refuse a LANE=fast STL read by an exact build', async () => {
      const picovoxelModule = await import('picovoxel');
      const fastStl = picovoxelModule.meshToStlBytes(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
        { acceptLane: 'fast' },
        'fast',
      );
      const issues = await buildIssues(
        evaluate({ module: { default: (pico: Pico) => pico.meshFromStl(fastStl) }, lane: 'exact' }).then(
          ({ result }) => result,
        ),
      );

      expect(issues[0]).toMatchObject({
        code: 'REPRESENTATION_UNSUPPORTED',
        details: { picoCode: 'PICO_LANE_LOOSENED', refusal: 'PICOVOXEL_LANE_LOOSENED' },
      });
    });

    it('should accept the same LANE=fast STL in a fast build', async () => {
      const picovoxelModule = await import('picovoxel');
      const fastStl = picovoxelModule.meshToStlBytes(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
        { acceptLane: 'fast' },
        'fast',
      );
      const { result } = await evaluate({ module: { default: (pico: Pico) => pico.meshFromStl(fastStl) } });

      expect(result.handle.shapes[0]!.lane).toBe('fast');
    });

    it.each([
      ['an Error', new Error('user bug'), 'user bug'],
      ['a coded non-PicoVoxel Error', Object.assign(new Error('fs bug'), { code: 'ENOENT' }), 'fs bug'],
      ['a thrown string', 'plain failure', 'plain failure'],
    ])('should report %s as a runtime issue without a PicoVoxel code', async (_name, thrown, message) => {
      const issues = await buildIssues(
        evaluate({
          module: {
            default: () => {
              // oxlint-disable-next-line typescript/only-throw-error -- author code may throw a non-Error.
              throw thrown;
            },
          },
        }).then(({ result }) => result),
      );

      expect(issues[0]).toMatchObject({ code: 'RUNTIME', message });
      expect(issues[0]!.details).not.toHaveProperty('picoCode');
    });

    it.each([
      ['bundle', { bundleIssues: [buildFailure] }],
      ['execution', { executeIssues: [buildFailure] }],
    ])('should surface %s failures as build issues', async (_stage, overrides) => {
      const runtime = createRuntime({}, overrides);
      const context = await initialize({ wasm: 'serial' }, runtime);
      const issues = await buildIssues(
        definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context),
      );

      expect(issues[0]).toMatchObject({ message: 'syntax', code: 'BUNDLER_FAILED' });
    });
  });

  describe('memory', () => {
    it('should log memory through the runtime logger and warn above one GiB of native memory', async () => {
      sessions.memoryTotal = 2 ** 31;
      const { runtime } = await evaluate({ module: sphere() });

      expect(runtime.logger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^PicoVoxel session memory native=2147483648 heap=\d+ variant=serial$/),
      );
      expect(runtime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PicoVoxel held 2147483648 bytes of native memory on the serial artifact.'),
        { data: expect.objectContaining({ nativeBytes: 2 ** 31, artifact: 'serial' }) },
      );
    });

    it('should not warn for an ordinary render', async () => {
      const { runtime } = await evaluate({ module: sphere() });

      expect(runtime.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('runtime lifetime', () => {
    const renderTwice = async (module: MainModule) => {
      const runtime = createRuntime(module);
      const context = await initialize({ wasm: 'serial' }, runtime);
      const render = async () =>
        definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } }, runtime, context);
      return { runtime, context, render };
    };

    it('should compile and instantiate the WebAssembly module once for two renders (DP9)', async () => {
      const instantiate = vi.spyOn(WebAssembly, 'instantiate');
      const instantiateStreaming = vi.spyOn(WebAssembly, 'instantiateStreaming');
      try {
        const { context, render } = await renderTwice(sphere());
        await render();
        await render();

        expect(instantiate.mock.calls.length + instantiateStreaming.mock.calls.length).toBe(1);
        expect(sessions.runtimes).toHaveLength(1);
        expect(sessions.created).toHaveLength(2);
        await definition.onDispose!(context);
      } finally {
        instantiate.mockRestore();
        instantiateStreaming.mockRestore();
      }
    });

    it('should hand a recycled runtime the module it already compiled (D20, D31)', async () => {
      const { context, render } = await renderTwice(sphere());
      sessions.heapBytes = 2 ** 31;
      await render();
      sessions.heapBytes = undefined;
      await render();

      const [first, second] = sessions.runtimes;
      expect(second).toBeDefined();
      expect(first!.options.wasmModule).toBeInstanceOf(WebAssembly.Module);
      expect(second!.options.wasmModule).toBe(first!.options.wasmModule);
      await definition.onDispose!(context);
    });

    it('should load each artifact from its explicit asset URL, and the pthread glue by filesystem path (D20)', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      const render = async (lane: 'exact' | 'fast') =>
        definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane } }, runtime, context);
      await render('exact');
      await render('fast');

      const [serial, multi] = sessions.runtimes.map(({ options }) => options.wasm as Record<string, unknown>);
      const locate = (overrides: Record<string, unknown> | undefined, path: string): unknown =>
        (overrides!['locateFile'] as (path: string, directory: string) => string)(path, '/glue/');
      expect(locate(serial, 'pico.wasm')).toBe(import.meta.resolve('picovoxel/wasm'));
      expect(locate(serial, 'pico.worker.js')).toBe('/glue/pico.worker.js');
      expect(serial).not.toHaveProperty('mainScriptUrlOrBlob');
      expect(locate(multi, 'pico-multi.wasm')).toBe(import.meta.resolve('picovoxel/multi/wasm'));
      expect(multi!['mainScriptUrlOrBlob']).toBe(fileURLToPath(import.meta.resolve('picovoxel/multi/worker')));
      await definition.onDispose!(context);
    }, 60_000);

    it('should instantiate a module the host compiled instead of compiling its own', async () => {
      const wasmUrl = import.meta.resolve('picovoxel/wasm');
      const hostModule = await WebAssembly.compile(readFileSync(fileURLToPath(wasmUrl)));
      const { runtime, context, render } = await renderTwice(sphere());
      const getCompiledWasmModule = vi.fn((url: string) => (url === wasmUrl ? hostModule : undefined));
      Object.assign(runtime, { getCompiledWasmModule });
      await render();

      expect(getCompiledWasmModule).toHaveBeenCalledWith(wasmUrl);
      expect(sessions.runtimes[0]!.options.wasmModule).toBe(hostModule);
      await definition.onDispose!(context);
    });

    it.each([
      ['an error', new Error('fetch refused')],
      ['a thrown value', 'fetch refused'],
    ])(
      'should report an artifact that cannot be loaded (%s) as a PicoVoxel initialization failure',
      async (_name, thrown) => {
        const { runtime, context, render } = await renderTwice(sphere());
        Object.assign(runtime, {
          getCompiledWasmModule: () => {
            // oxlint-disable-next-line typescript/only-throw-error -- a host may reject with a non-Error value.
            throw thrown;
          },
        });
        const issues = await buildIssues(render());

        expect(issues[0]).toMatchObject({
          message: "PicoVoxel's serial build could not be loaded: fetch refused",
          details: { picoCode: 'PICO_WASM_INIT_FAILED', artifact: 'serial' },
        });
        expect(context.runtimes.size).toBe(0);
      },
    );

    it('should recycle a runtime whose heap passed the threshold and start a fresh one next render', async () => {
      const { runtime, context, render } = await renderTwice(sphere());
      sessions.heapBytes = 2 ** 31;
      await render();
      const [first] = sessions.runtimes;

      expect(context.runtimes.size).toBe(0);
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        'PicoVoxel recycled the serial runtime: its heap reached 2147483648 bytes',
      );
      await expect(first!.runtime.createPico()).rejects.toMatchObject({ code: 'PICO_DISPOSED' });

      sessions.heapBytes = undefined;
      await render();
      expect(sessions.runtimes).toHaveLength(2);
      expect(context.runtimes.size).toBe(1);
      await definition.onDispose!(context);
    });

    it.each([
      ['a WebAssembly trap', () => new WebAssembly.RuntimeError('unreachable')],
      ['an error caused by a trap', () => new Error('failed', { cause: new WebAssembly.RuntimeError('unreachable') })],
    ])('should recycle the runtime after %s and build cleanly on the next render', async (_name, trap) => {
      let trapped = false;
      const { runtime, context, render } = await renderTwice({
        default: (pico: Pico) => {
          if (!trapped) {
            trapped = true;
            throw trap();
          }
          return pico.createVoxels({ shape: 'sphere', radius: 2 });
        },
      });

      const issues = await buildIssues(render());
      expect(issues[0]!.code).toBe('RUNTIME');
      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel recycled the serial runtime: the build trapped');

      const next = await render();
      expect(next.handle.shapes).toHaveLength(1);
      expect(sessions.runtimes).toHaveLength(2);
      await definition.onDispose!(context);
    });

    it('should recycle the runtime when a session cannot be disposed', async () => {
      const { runtime, context, render } = await renderTwice(sphere());
      sessions.disposeThrows = true;
      const result = await render();

      expect(result.handle.shapes).toHaveLength(1);
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        'PicoVoxel recycled the serial runtime: a session could not be disposed',
      );
      expect(context.runtimes.size).toBe(0);
    });

    it('should drop a recycled runtime even when its teardown throws', async () => {
      const { runtime, context, render } = await renderTwice(sphere());
      sessions.heapBytes = 2 ** 31;
      sessions.runtimeDisposeThrows = true;
      await render();

      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel runtime teardown failed: Error: teardown failed');
      expect(context.runtimes.size).toBe(0);
    });

    it('should not keep a runtime that failed to start', async () => {
      const { context, render } = await renderTwice(sphere());
      sessions.failStart = 'serial';
      const issues = await buildIssues(render());

      expect(issues[0]).toMatchObject({ details: { picoCode: 'PICO_WASM_INIT_FAILED', artifact: 'serial' } });
      expect(context.runtimes.size).toBe(0);

      sessions.failStart = undefined;
      const recovered = await render();
      expect(recovered.handle.shapes).toHaveLength(1);
      await definition.onDispose!(context);
    });

    it('should have nothing to recycle when a runtime runs out of memory while starting', async () => {
      const { runtime, render } = await renderTwice(sphere());
      sessions.failStart = 'serial';
      sessions.failStartCode = 'PICO_OUT_OF_MEMORY';
      const issues = await buildIssues(render());

      expect(issues[0]).toMatchObject({ code: 'RESOURCE_LIMIT', details: { picoCode: 'PICO_OUT_OF_MEMORY' } });
      expect(runtime.logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('recycled'));
    });

    it('should release leftover author resources on onDispose and keep going when a teardown throws', async () => {
      const { context, render } = await renderTwice(sphere());
      await render();
      const leftover = { dispose: vi.fn() };
      const broken = {
        dispose: vi.fn(() => {
          throw new Error('teardown failed');
        }),
      };
      context.authorResources.add(broken).add(leftover);
      sessions.runtimeDisposeThrows = true;

      await definition.onDispose!(context);

      expect(broken.dispose).toHaveBeenCalledOnce();
      expect(leftover.dispose).toHaveBeenCalledOnce();
      expect(context.authorResources.size).toBe(0);
      await expect(sessions.runtimes[0]!.runtime.createPico()).rejects.toMatchObject({ code: 'PICO_DISPOSED' });
    });

    it('should dispose every runtime on onDispose and skip one that never started', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      await definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } }, runtime, context);
      const failed = Promise.reject(new Error('never started'));
      // Observed here so the rejection is handled; onDispose must still skip it.
      await expect(failed).rejects.toThrow('never started');
      context.runtimes.set('multi', failed);

      await definition.onDispose!(context);

      expect(context.runtimes.size).toBe(0);
      await expect(sessions.runtimes[0]!.runtime.createPico()).rejects.toMatchObject({ code: 'PICO_DISPOSED' });
    });
  });

  describe('serial retry (D21)', () => {
    const outOfMemoryOnMulti = async (always = false) => {
      const picovoxelModule = await import('picovoxel');
      return {
        default: (pico: Pico) => {
          if (always || pico.module.PThread) {
            throw new picovoxelModule.PicoError(
              'PICO_OUT_OF_MEMORY',
              'Voxels_hCreateSphere aborted inside WebAssembly.',
            );
          }
          return pico.createVoxels({ shape: 'sphere', radius: 2 });
        },
      };
    };

    it('should rebuild a fast multi render that ran out of memory on the serial build, with a visible warning', async () => {
      const { runtime, context, result } = await evaluate({ module: await outOfMemoryOnMulti(), wasm: 'multi' });

      expect(sessions.created.map(({ artifact, options }) => [artifact, options.lane])).toEqual([
        ['multi', 'fast'],
        ['serial', 'fast'],
      ]);
      expect(result.handle.shapes).toHaveLength(1);
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'RESOURCE_LIMIT',
          severity: 'warning',
          message: expect.stringContaining(
            'ran out of WebAssembly memory, so this render was rebuilt on the single-threaded build. Increase voxelSize',
          ),
          details: expect.objectContaining({ picoCode: 'PICO_OUT_OF_MEMORY', retry: 'PICOVOXEL_SERIAL_RETRY' }),
        }),
      ]);
      expect(runtime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('rebuilt on the single-threaded build'),
        {
          data: { picoCode: 'PICO_OUT_OF_MEMORY' },
        },
      );
      // The trap recycled the multi runtime.
      expect([...context.runtimes.keys()]).toEqual(['serial']);
      await definition.onDispose!(context);
    }, 60_000);

    it('should count only the calls of the serial retry when a superseded retry stops', async () => {
      const picovoxelModule = await import('picovoxel');
      const runtime = createRuntime({
        default: (pico: Pico): Voxels => {
          const sphere = pico.createVoxels({ shape: 'sphere', radius: 4 });
          if (pico.module.PThread) {
            throw new picovoxelModule.PicoError('PICO_OUT_OF_MEMORY', 'Voxels_hOffset aborted inside WebAssembly.');
          }
          return sphere.subtract(pico.createVoxels({ shape: 'sphere', radius: 1 }));
        },
      });
      const context = await initialize({ wasm: 'multi' }, runtime);
      // Check 1 is the multi attempt's call; checks 2 and 3 are the retry's, and check 3 aborts.
      abort.after = 2;

      const aborted = await definition
        .evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context)
        .catch((error: unknown) => error);

      expect(aborted).toMatchObject({ name: 'RenderAbortedError' });
      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel stopped a superseded build after 1 PicoVoxel calls');
      await definition.onDispose!(context);
    }, 60_000);

    it('should rebuild on the serial build when the multi build cannot start', async () => {
      sessions.failStart = 'multi';
      const { context, result } = await evaluate({ module: sphere(), wasm: 'multi' });

      expect(sessions.created.map(({ artifact }) => artifact)).toEqual(['serial']);
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'KERNEL_CAPABILITY_MISSING',
          severity: 'warning',
          message: expect.stringContaining('could not start'),
          details: expect.objectContaining({ picoCode: 'PICO_WASM_INIT_FAILED' }),
        }),
      ]);
      await definition.onDispose!(context);
    });

    it('should rebuild on the serial build when the multi artifact cannot even be loaded', async () => {
      const runtime = createRuntime(sphere());
      const multiUrl = import.meta.resolve('picovoxel/multi/wasm');
      Object.assign(runtime, {
        getCompiledWasmModule: (url: string) => {
          if (url === multiUrl) {
            throw new Error('fetch refused');
          }
          return undefined;
        },
      });
      const context = await initialize({ wasm: 'multi' }, runtime);
      const result = await definition.evaluate(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
        runtime,
        context,
      );

      expect(sessions.created.map(({ artifact }) => artifact)).toEqual(['serial']);
      expect(result.issues).toEqual([
        expect.objectContaining({ details: expect.objectContaining({ picoCode: 'PICO_WASM_INIT_FAILED' }) }),
      ]);
      await definition.onDispose!(context);
    });

    it('should report both the serial failure and the warning when the rebuild fails too', async () => {
      const issues = await buildIssues(evaluate({ module: await outOfMemoryOnMulti(true), wasm: 'multi' }));

      expect(issues).toEqual([
        expect.objectContaining({ severity: 'error', details: expect.objectContaining({ artifact: 'serial' }) }),
        expect.objectContaining({
          severity: 'warning',
          details: expect.objectContaining({ retry: 'PICOVOXEL_SERIAL_RETRY' }),
        }),
      ]);
    }, 60_000);

    it.each([
      ['an author error on the multi build', 'multi', () => new Error('author bug')],
      ['a serial out-of-memory', 'serial', undefined],
    ] as const)(
      'should not retry %s',
      async (_name, wasm, thrown) => {
        const picovoxelModule = await import('picovoxel');
        const error = thrown?.() ?? new picovoxelModule.PicoError('PICO_OUT_OF_MEMORY', 'aborted');
        const issues = await buildIssues(
          evaluate({
            module: {
              default: () => {
                throw error;
              },
            },
            wasm,
          }),
        );

        expect(issues).toHaveLength(1);
        expect(sessions.created.map(({ artifact }) => artifact)).toEqual([wasm]);
      },
      60_000,
    );
  });

  describe('cooperative cancellation (D21)', () => {
    const sphereMinusBeam = {
      default: (pico: Pico): Voxels => {
        const sphere = pico.createVoxels({ shape: 'sphere', radius: 4 });
        const beam = pico.createVoxels({ shape: 'beam', start: [-5, 0, 0], end: [5, 0, 0], radius: 1 });
        // `equals` returns a primitive; `subtract` takes an operand that must keep its identity.
        expect(sphere.equals(beam)).toBe(false);
        return sphere.subtract(beam);
      },
    };

    it('should check for cancellation before every PicoVoxel call and keep operand identity', async () => {
      const { result } = await evaluate({ module: sphereMinusBeam });

      expect(result.handle.shapes).toHaveLength(1);
      // Two createVoxels calls, equals, subtract, then the kernel's toMesh.
      expect(abort.checks).toBe(5);
    });

    it('should stop a superseded build at its next call, free the session, and build cleanly next time', async () => {
      const runtime = createRuntime(sphereMinusBeam);
      const context = await initialize({ wasm: 'serial' }, runtime);
      const render = async () =>
        definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context);
      abort.after = 1;

      const aborted = await render().catch((error: unknown) => error);

      expect(aborted).toMatchObject({ name: 'RenderAbortedError' });
      expect(abort.checks).toBe(2);
      // The evidence DP15 reads: where the cooperative check caught the build.
      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel stopped a superseded build after 1 PicoVoxel calls');
      expect(() => sessions.created[0]!.pico.allocated).toThrow(expect.objectContaining({ code: 'PICO_DISPOSED' }));

      abort.after = Infinity;
      const next = await render();
      expect(next.handle.shapes).toHaveLength(1);
      expect(sessions.runtimes).toHaveLength(1);
      await definition.onDispose!(context);
    });
  });

  describe('author sessions (D21)', () => {
    const authorExports = () => registered.get('picovoxel') as typeof PicovoxelModule;

    it('should track, check and dispose sessions author code creates through the picovoxel builtin', async () => {
      const runtime = createRuntime({});
      const context = await initialize({ wasm: 'serial' }, runtime);
      const { createPico } = authorExports();
      let own: Pico | undefined;
      runtime.execute.mockResolvedValue({
        success: true,
        value: {
          default: async () => {
            own = await createPico({ voxelSize: 1 });
            return own.createVoxels({ shape: 'sphere', radius: 2 });
          },
        },
      });

      const result = await definition.evaluate(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
        runtime,
        context,
      );

      expect(result.handle.shapes).toHaveLength(1);
      expect(sessions.author[0]!.options).toEqual({ memoryWarningBytes: 0, voxelSize: 1 });
      expect(abort.checks).toBe(2);
      expect(() => own!.allocated).toThrow(expect.objectContaining({ code: 'PICO_DISPOSED' }));
      expect(context.authorResources.size).toBe(0);
    });

    it('should track author runtimes and check the sessions they open', async () => {
      const runtime = createRuntime({});
      const context = await initialize({ wasm: 'serial' }, runtime);
      const { createPicoRuntime } = authorExports();
      let ownRuntime: PicoRuntime | undefined;
      runtime.execute.mockResolvedValue({
        success: true,
        value: {
          default: async () => {
            ownRuntime = await createPicoRuntime();
            const own = await ownRuntime.createPico({ voxelSize: 1 });
            return own.createVoxels({ shape: 'sphere', radius: 2 });
          },
        },
      });

      await definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context);

      expect(abort.checks).toBe(2);
      await expect(ownRuntime!.createPico()).rejects.toMatchObject({ code: 'PICO_DISPOSED' });
    });
  });

  describe('leak oracle (DP12)', () => {
    it.each([
      ['success', sphere()],
      [
        'an author throw',
        {
          default: () => {
            throw new Error('author bug');
          },
        },
      ],
      ['an invalid result', { default: () => 42 }],
      [
        'an out-of-memory failure',
        {
          default: (pico: Pico) => {
            pico.createVoxels({ shape: 'sphere', radius: 2 });
            throw new WebAssembly.RuntimeError('unreachable');
          },
        },
      ],
    ])('should free every native object after %s', async (_name, module) => {
      const runtime = createRuntime(module);
      const context = await initialize({ wasm: 'serial' }, runtime);
      await definition
        .evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context)
        .catch(() => undefined);

      // The session is gone, so everything it allocated is freed with its Library instance.
      expect(() => sessions.created[0]!.pico.allocated).toThrow(expect.objectContaining({ code: 'PICO_DISPOSED' }));
      // A fresh session on the same runtime starts from zero native objects.
      const serialRuntime = await loadRuntimeFor(context);
      const fresh = await serialRuntime.createPico();
      expect(Object.values(fresh.allocated).every((count) => count === 0)).toBe(true);
      fresh.dispose();
      await definition.onDispose!(context);
    });
  });

  describe('describe', () => {
    const describe = async (module: MainModule | (() => never), overrides = {}) => {
      const runtime = createRuntime(module, overrides);
      const context = await initialize({ wasm: 'serial' }, runtime);
      return definition.describe({ entryPath: 'main.ts' }, runtime, context);
    };

    it('should declare voxelSize as a positive length in millimetres', async () => {
      const result = await describe({ defaultParams: { voxelSize: 1, radius: 4 }, default: () => [] });

      expect(result.success).toBe(true);
      const declaration = result.success ? result.data.parameters : undefined;
      expect(declaration?.defaults).toEqual({ voxelSize: 1, radius: 4 });
      expect(declaration?.bindings?.['/voxelSize']).toEqual({
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      });
      expect(declaration?.schema).toMatchObject({
        properties: { voxelSize: { ucumUnit: 'mm', exclusiveMinimum: 0 } },
      });
    });

    it('should leave parameters without a voxel size unannotated', async () => {
      const result = await describe({ defaultParams: { radius: 4 }, default: () => [] });

      expect(result.success).toBe(true);
      expect(JSON.stringify(result)).not.toContain('ucumUnit');
    });

    it('should report bundle, execution and thrown failures', async () => {
      const failure: KernelIssue = { message: 'syntax', code: 'BUNDLER_FAILED', severity: 'error' };
      const bundle = await describe({}, { bundleIssues: [failure] });
      const execute = await describe({}, { executeIssues: [failure] });
      const thrown = await describe(() => {
        throw new Error('boom');
      });
      const thrownString = await describe(() => {
        // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- a thrown non-Error.
        throw 'boom';
      });

      expect([bundle, execute].map((result) => !result.success && result.issues[0]!.message)).toEqual([
        'syntax',
        'syntax',
      ]);
      expect(!thrown.success && thrown.issues[0]!.message).toBe('boom');
      expect(!thrownString.success && thrownString.issues[0]!.message).toBe('Failed to extract PicoVoxel parameters.');
    });
  });

  describe('export', () => {
    const exportFrom = async (
      module: MainModule,
      input: { exportId: 'glb' | 'gltf' | 'stl'; options?: Record<string, unknown>; lane?: 'fast' | 'exact' },
    ) => {
      const { runtime, context, result } = await evaluate({ module, lane: input.lane ?? 'exact' });
      const options = { ...definition.exports[input.exportId].optionsSchema.parse(input.options ?? {}) };
      return definition.export!(
        { exportId: input.exportId, options, handle: result.handle } as ExportInput,
        runtime,
        context,
      );
    };

    it('should export an unstamped STL per shape from an exact handle', async () => {
      const result = await exportFrom({ default: helloCube }, { exportId: 'stl' });

      expect(result.files).toHaveLength(1);
      const [file] = result.files;
      expect(file.name).toBe('Shape 1.stl');
      expect(stlHeader(file.bytes)).toBe('PicoGK UNITS=mm');
      expect(file.bytes.byteLength).toBe(84 + 12 * 50);
      expect(new DataView(file.bytes.buffer).getUint32(80, true)).toBe(12);
    });

    it('should make safe unique STL filenames without changing labels or STL geometry', async () => {
      const names = [
        '../Housing',
        'A/B',
        String.raw`a\b`,
        'A_B 2',
        'CON.txt',
        'lpt²',
        'aux',
        '... ',
        'NUL',
        '蓋 🧩',
        'é',
        'e\u0301',
        'x'.repeat(121),
        'x'.repeat(120),
        '🧩'.repeat(31),
        'control\u0000<>:"|?*',
        'NUL .txt',
        'CONIN$',
        'conout$.log',
      ];
      const result = await exportFrom(
        {
          default: (pico: Pico) => {
            const shape = helloCube(pico);
            return names.map((name) => ({ shape, name }));
          },
        },
        { exportId: 'stl' },
      );
      expect(result.files.map((file) => file.name)).toEqual([
        '.._Housing.stl',
        'A_B.stl',
        'a_b 2.stl',
        'A_B 2 2.stl',
        '_CON.txt.stl',
        '_lpt².stl',
        '_aux.stl',
        'Shape 8.stl',
        '_NUL.stl',
        '蓋 🧩.stl',
        'é.stl',
        'e\u0301 2.stl',
        `${'x'.repeat(120)}.stl`,
        `${'x'.repeat(120)} 2.stl`,
        `${'🧩'.repeat(30)}.stl`,
        'control________.stl',
        '_NUL .txt.stl',
        '_CONIN$.stl',
        '_conout$.log.stl',
      ]);
      const raw = await exportFrom({ default: helloCube }, { exportId: 'stl' });
      for (const file of result.files) {
        expect(file.bytes).toEqual(raw.files[0].bytes);
      }
    });

    it('should honour STL units, scale and offset', async () => {
      const result = await exportFrom(
        { default: helloCube },
        { exportId: 'stl', options: { unit: 'cm', scale: 2, offset: [1, 0, 0] } },
      );
      const { bytes } = result.files[0];

      expect(stlHeader(bytes)).toBe('PicoGK UNITS=cm');
      // First triangle, first corner: vertex 0 = (0,0,0) → ((0+1)·2)/10 cm.
      expect(new DataView(bytes.buffer).getFloat32(84 + 12, true)).toBeCloseTo(0.2, 6);
    });

    it('should stamp an explicit fast STL export and any fast-provenance handle', async () => {
      const explicit = await exportFrom({ default: helloCube }, { exportId: 'stl', options: { lane: 'fast' } });
      const provenance = await exportFrom(offsetSphere, { exportId: 'stl', lane: 'fast' });

      expect(stlHeader(explicit.files[0].bytes)).toBe('PicoGK UNITS=mm LANE=fast');
      expect(stlHeader(provenance.files[0].bytes)).toBe('PicoGK UNITS=mm LANE=fast');
    });

    it('should refuse a fast GLB export with a typed issue', async () => {
      const explicit = exportFrom({ default: helloCube }, { exportId: 'glb', options: { lane: 'fast' } });
      const provenance = exportFrom(offsetSphere, { exportId: 'glb', lane: 'fast' });

      await Promise.all(
        [explicit, provenance].map(async (result) =>
          expect(result).rejects.toMatchObject({
            issues: [{ code: 'REPRESENTATION_UNSUPPORTED', details: { refusal: 'PICOVOXEL_LANE_EXPORT' } }],
          }),
        ),
      );
    });

    it('should export an exact GLB in the requested convention', async () => {
      const result = await exportFrom(
        { default: helloCube },
        { exportId: 'glb', options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } } },
      );
      const document = await glbToDocument(result.files[0].bytes);

      expect(result.files[0].name).toBe('model.glb');
      expect(document.getRoot().listAccessors()[0]!.getMax([0, 0, 0])).toEqual([1, 1, 1]);
    });

    it('should export an empty GLB and refuse an empty STL', async () => {
      const glb = await exportFrom({ default: () => [] }, { exportId: 'glb' });
      const stl = exportFrom({ default: () => [] }, { exportId: 'stl' });

      expect(glb.files).toHaveLength(1);
      await expect(stl).rejects.toMatchObject({
        issues: [{ code: 'RENDER_ARTIFACT_MISSING', message: expect.stringContaining('no shapes to export') }],
      });
    });

    it('should refuse an undeclared format', async () => {
      const { runtime, context, result } = await evaluate({ module: { default: () => [] } });
      const refused = definition.export!(
        { exportId: 'step', options: {}, handle: result.handle } as unknown as ExportInput,
        runtime,
        context,
      );

      await expect(refused).rejects.toMatchObject({ issues: [{ code: 'KERNEL_CAPABILITY_MISSING' }] });
    });
  });

  describe('mesh and snapshots', () => {
    it.each(['exact', 'fast'] as const)('keeps %s handle projections stable across content requests', async (lane) => {
      const { runtime, context, result } = await evaluate({ module: { default: helloCube }, lane });
      const snapshot = structuredClone(definition.serializeHandle!({ handle: result.handle }, runtime, context));
      const fresh = definition.deserializeHandle!({ serialized: snapshot }, runtime, context);
      const project = async (handle: typeof result.handle, includeEdges: boolean) => {
        const rendered = await definition.render!(
          { handle, view: 'model', options: {}, content: { includeEdges } },
          runtime,
          context,
        );
        return rendered.content;
      };
      const exportModel = async () => {
        const exported = await definition.export!(
          { exportId: 'glb', options: definition.exports.glb.optionsSchema.parse({}), handle: result.handle },
          runtime,
          context,
        );
        return exported.files[0].bytes;
      };
      await expectKernelProjectionOrder({
        renderA: async () => project(result.handle, false),
        renderB: async () => project(result.handle, true),
        freshB: async () => project(fresh, true),
        ...(lane === 'exact' ? { export: exportModel } : {}),
      });
    });

    it('keeps an empty snapshot projection stable', async () => {
      const { runtime, context, result } = await evaluate({ module: { default: () => [] }, lane: 'exact' });
      const fresh = definition.deserializeHandle!(
        { serialized: structuredClone(definition.serializeHandle!({ handle: result.handle }, runtime, context)) },
        runtime,
        context,
      );
      const project = async (handle: typeof result.handle) => {
        const rendered = await definition.render!({ handle, view: 'model', options: {} }, runtime, context);
        return rendered.content;
      };
      await expectKernelProjectionOrder({
        renderA: async () => project(result.handle),
        renderB: async () => project(result.handle),
        freshB: async () => project(fresh),
      });
    });

    it('should mesh a handle to an indexed GLB without edges', async () => {
      const { runtime, context, result } = await evaluate({ module: { default: helloCube } });
      const meshed = await definition.render!(
        { handle: result.handle, view: 'model', options: {}, content: { includeEdges: true } },
        runtime,
        context,
      );
      if (typeof meshed.content === 'string') {
        throw new TypeError('Expected binary PicoVoxel GLB content');
      }
      const document = await glbToDocument(meshed.content);

      expect(
        document
          .getRoot()
          .listMeshes()[0]!
          .listPrimitives()
          .map((primitive) => primitive.getMode()),
      ).toEqual([4]);
    });

    it('should round-trip a native handle through its snapshot', async () => {
      const { runtime, context, result } = await evaluate({ module: { default: helloCube } });
      const snapshot = structuredClone(definition.serializeHandle!({ handle: result.handle }, runtime, context));

      expect(snapshot.shapes[0]?.vertices).toBeInstanceOf(Uint8Array);
      expect(snapshot.shapes[0]?.triangles).toBeInstanceOf(Uint8Array);
      expect(definition.deserializeHandle!({ serialized: snapshot }, runtime, context)).toEqual(result.handle);
    });

    it('should preserve authored and legacy snapshot labels and repair blank restored names', async () => {
      const { runtime, context, result } = await evaluate({ module: { default: helloCube } });
      const snapshot = definition.serializeHandle!({ handle: result.handle }, runtime, context);
      const nativeHandle = definition.deserializeHandle!(
        {
          serialized: {
            shapes: ['  蓋 / Lid  ', 'Mesh', 'Shape 1', ''].map((name) => ({
              ...snapshot.shapes[0]!,
              name,
            })),
          },
        },
        runtime,
        context,
      );
      expect(nativeHandle.shapes.map(({ name }) => name)).toEqual(['蓋 / Lid', 'Mesh', 'Shape 1', 'Shape 4']);
      const exported = await definition.export!(
        { exportId: 'glb', handle: nativeHandle, options: definition.exports.glb.optionsSchema.parse({}) },
        runtime,
        context,
      );
      // The cube has exact provenance in either session lane.
      const document = await glbToDocument(exported.files[0].bytes);
      expect(
        document
          .getRoot()
          .listNodes()
          .map((node) => node.getName()),
      ).toEqual(['蓋 / Lid', 'Mesh', 'Shape 1', 'Shape 4']);
    });

    it.each([
      [undefined, 'expected a shapes array.'],
      [{ shapes: {} }, 'expected a shapes array.'],
      [{ shapes: [{ name: 'Shape 1', vertices: [], triangles: new Uint32Array(), lane: 'exact' }] }, 'shape 0'],
      [
        { shapes: [{ name: 'Shape 1', vertices: new Float32Array(), triangles: new Uint32Array(), lane: 'open' }] },
        'shape 0',
      ],
      [
        { shapes: [{ name: 'Shape 1', vertices: new Uint8Array(3), triangles: new Uint8Array(), lane: 'exact' }] },
        'vertices byte length must be divisible by four',
      ],
      [
        { shapes: [{ name: 'Shape 1', vertices: new Uint8Array(4), triangles: new Uint8Array(), lane: 'exact' }] },
        'vertex/triangle bytes must contain scalar triples',
      ],
    ])('should refuse the malformed snapshot %j', async (snapshot, message) => {
      const { runtime, context } = await evaluate({ module: { default: () => [] } });

      expect(() =>
        definition.deserializeHandle!(
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Deliberately malformed cache bytes exercise restoration's trust boundary.
          {
            serialized: snapshot as Parameters<NonNullable<typeof definition.deserializeHandle>>[0]['serialized'],
          },
          runtime,
          context,
        ),
      ).toThrow(message);
    });
  });
});

describe('PicoVoxel mechanism snapshots and binding', () => {
  const hinge = (base = 'Base', lid = 'Lid') => ({
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'base',
    links: { base: { shapes: [base] }, lid: { shapes: [lid] } },
    joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [2, 3, 4], axis: [1, 0, 0] } },
  });
  const readTopology = async (bytes: Uint8Array<ArrayBuffer>) => {
    const io = await createNodeIo();
    const document = await io.readBinary(bytes);
    return document.getRoot().getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload();
  };
  it.each([
    { label: 'generated', name: undefined, reference: 'Shape 1', valid: false },
    { label: 'blank', name: ' ', reference: 'Shape 1', valid: false },
    { label: 'authored fallback-looking', name: 'Shape 1', reference: 'Shape 1', valid: true },
    { label: 'trimmed Unicode', name: '  蓋 / Lid  ', reference: '蓋 / Lid', valid: true },
  ] as const)('should bind $label labels only with explicit name evidence', async ({ name, reference, valid }) => {
    const { runtime, context, result } = await evaluate({
      module: {
        default: (pico: Pico) => [
          { shape: helloCube(pico), ...(name === undefined ? {} : { name }) },
          { shape: helloCube(pico), name: 'Lid' },
        ],
        mechanism: hinge(reference),
      },
    });
    try {
      const snapshot = structuredClone(definition.serializeHandle!({ handle: result.handle }, runtime, context));
      const restored = definition.deserializeHandle!({ serialized: snapshot }, runtime, context);
      expect(restored).toEqual(result.handle);
      expect(restored.mechanism).not.toBe(result.handle.mechanism);
      const meshed = await definition.render!(
        { handle: restored, view: 'model', options: {}, content: { includeTopology: true } },
        runtime,
        context,
      );
      if (typeof meshed.content === 'string') {
        throw new TypeError('Expected binary topology view');
      }
      const payload = await readTopology(meshed.content);
      expect(payload?.['components']).toHaveLength(2);
      if (valid) {
        expect(payload?.['mechanism']).toMatchObject({ links: { base: { components: ['component:node-0'] } } });
        expect(meshed.issues).toEqual([]);
      } else {
        expect(payload?.['mechanism']).toBeUndefined();
        expect(meshed.issues).toMatchObject([{ code: 'INVALID_REFERENCE', severity: 'warning' }]);
      }
    } finally {
      await definition.onDispose!(context);
    }
  });

  it.each([true, false])(
    'should preserve duplicate parts and reject only an ambiguous referenced name (%s)',
    async (referenced) => {
      const { runtime, context, result } = await evaluate({
        module: {
          default: (pico: Pico) =>
            ['Base', 'Lid', 'Duplicate', 'Duplicate'].map((name) => ({ shape: helloCube(pico), name })),
          mechanism: hinge('Base', referenced ? 'Duplicate' : 'Lid'),
        },
      });
      try {
        const meshed = await definition.render!(
          { handle: result.handle, view: 'model', options: {}, content: { includeTopology: true } },
          runtime,
          context,
        );
        if (typeof meshed.content === 'string') {
          throw new TypeError('Expected binary topology view');
        }
        const payload = await readTopology(meshed.content);
        expect(payload?.['components']).toHaveLength(4);
        expect(result.handle.shapes.map(({ name }) => name)).toEqual(['Base', 'Lid', 'Duplicate', 'Duplicate']);
        if (referenced) {
          expect(payload?.['mechanism']).toBeUndefined();
          expect(meshed.issues).toMatchObject([
            {
              message: expect.stringContaining('More than one returned shape'),
              details: { mechanism: { recovery: 'Give each referenced part a distinct authored name.' } },
            },
          ]);
        } else {
          expect(payload?.['mechanism']).toBeDefined();
          expect(meshed.issues).toEqual([]);
        }
      } finally {
        await definition.onDispose!(context);
      }
    },
  );

  it.each([42, '', 'Wrong'])('should refuse forged authored name evidence %j', async (authoredName) => {
    const { runtime, context, result } = await evaluate({ module: { default: helloCube } });
    try {
      const snapshot = definition.serializeHandle!({ handle: result.handle }, runtime, context);
      // oxlint-disable-next-line typescript/consistent-type-assertions -- Deliberately corrupted cache payload exercises the restoration trust boundary.
      const corrupted = { ...snapshot, shapes: [{ ...snapshot.shapes[0]!, authoredName }] } as typeof snapshot;
      expect(() => definition.deserializeHandle!({ serialized: corrupted }, runtime, context)).toThrow(
        'authoredName must match',
      );
    } finally {
      await definition.onDispose!(context);
    }
  });

  it('should own reader warnings across snapshots and emit them once per preview and export', async () => {
    const { runtime, context, result } = await evaluate({
      module: { default: helloCube, mechanism: { invalid: 1n } },
      lane: 'exact',
    });
    try {
      expect(result.issues).toHaveLength(1);
      const snapshot = definition.serializeHandle!({ handle: result.handle }, runtime, context);
      const restored = definition.deserializeHandle!({ serialized: snapshot }, runtime, context);
      expect(restored.mechanismIssues).toEqual(result.issues);
      expect(restored.mechanismIssues).not.toBe(result.issues);
      const mesh = await definition.render!(
        { handle: restored, view: 'model', options: {}, content: { includeTopology: true } },
        runtime,
        context,
      );
      expect(mesh.issues).toEqual([]);
      const inputs: ExportInput[] = [
        { exportId: 'glb', handle: restored, options: definition.exports.glb.optionsSchema.parse({}) },
        { exportId: 'gltf', handle: restored, options: definition.exports.gltf.optionsSchema.parse({}) },
        { exportId: 'stl', handle: restored, options: definition.exports.stl.optionsSchema.parse({}) },
      ];
      for (const input of inputs) {
        // oxlint-disable-next-line no-await-in-loop -- Exports share one kernel context.
        const exported = await definition.export!(input, runtime, context);
        expect(exported.issues).toEqual(result.issues);
      }
      for (const mechanismIssues of [
        {},
        [{ code: 'RUNTIME', message: 'bad', severity: 'error' }],
        [{ code: 'invented', message: 'bad', severity: 'warning' }],
      ]) {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- Deliberately corrupted cache payload exercises warning-envelope validation.
        const corrupted = { ...snapshot, mechanismIssues } as typeof snapshot;
        expect(() => definition.deserializeHandle!({ serialized: corrupted }, runtime, context)).toThrow();
      }
    } finally {
      await definition.onDispose!(context);
    }
  });
});

it('should recycle a mechanism trap and propagate mechanism cancellation after freeing the session', async () => {
  const runtime = createRuntime({
    default: helloCube,
    mechanism: () => {
      throw new WebAssembly.RuntimeError('mechanism trap');
    },
  });
  const context = await initialize({ wasm: 'serial' }, runtime);
  try {
    const result = await definition.evaluate(
      { entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } },
      runtime,
      context,
    );
    expect(result.issues).toMatchObject([{ severity: 'warning', message: expect.stringContaining('mechanism trap') }]);
    expect(context.runtimes.size).toBe(0);
    expect(() => sessions.created[0]!.pico.memory).toThrow(/already been disposed/);
    const aborted = createRuntime({
      default: helloCube,
      mechanism: () => {
        throw renderAborted();
      },
    });
    await expect(
      definition.evaluate({ entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } }, aborted, context),
    ).rejects.toMatchObject({ name: 'RenderAbortedError' });
    expect(() => sessions.created[1]!.pico.memory).toThrow(/already been disposed/);
  } finally {
    await definition.onDispose!(context);
  }
});
