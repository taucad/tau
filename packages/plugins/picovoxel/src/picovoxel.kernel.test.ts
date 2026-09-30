/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as IsolationModule from '@taucad/runtime/cross-origin-isolation';
import type { IsolationStatus } from '@taucad/runtime/cross-origin-isolation';
import type * as KernelModule from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/types';
import { RenderAbortedError } from '@taucad/runtime';
import { createMockKernelRuntime, glbToDocument } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { CreatePicoOptions, CreatePicoRuntimeOptions, Mesh, Pico, PicoRuntime, Voxels } from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';

import type { PicovoxelNativeHandle } from '#picovoxel.geometry.js';
import { picovoxelBuiltinModuleNames, picovoxelDetectPattern, picovoxelKernel } from '#picovoxel.kernel.js';
import type { PicovoxelOptionsInput } from '#picovoxel.schemas.js';

type Artifact = 'serial' | 'multi';

const isolation = vi.hoisted(() => ({ status: undefined as IsolationStatus | undefined }));
const abort = vi.hoisted(() => ({ after: Infinity, checks: 0 }));
const registered = vi.hoisted(() => new Map<string, unknown>());
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
        throw new RenderAbortedError();
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

type ExportInput = Parameters<typeof definition.exportGeometry>[0];

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

const createGeometry = async (input: {
  module: MainModule | (() => unknown);
  lane?: 'fast' | 'exact';
  wasm?: PicovoxelOptionsInput['wasm'];
  parameters?: Record<string, unknown>;
}) => {
  const runtime = createRuntime(input.module);
  const context = await initialize({ wasm: input.wasm ?? 'serial' }, runtime);
  const result = await definition.createGeometry(
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
        /^1\.2\.0\+picovoxel\.[\w.-]+\.serial-[\da-f]{12}\.multi-[\da-f]{12}\.scripts-[\da-f]{12}$/,
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
      const { result } = await createGeometry({ module: offsetSphere, parameters: { voxelSize: 1 } });

      expect(sessions.created).toHaveLength(1);
      expect(sessions.created[0]!.options).toEqual({ voxelSize: 1, lane: 'fast', memoryWarningBytes: 0 });
      // Only a Class-2 op (fastRenorm) gives an offset fast provenance.
      expect(result.nativeHandle.shapes[0]!.lane).toBe('fast');
    });

    it('should build exact geometry in an exact session on the serial artifact', async () => {
      const { result } = await createGeometry({ module: offsetSphere, lane: 'exact', wasm: 'multi' });

      expect(sessions.created.map(({ artifact, options }) => [artifact, options.lane])).toEqual([['serial', 'exact']]);
      expect(result.nativeHandle.shapes[0]!.lane).toBe('exact');
    });

    it('should run the fast lane on the multi-threaded artifact and keep its pool warm until cleanup', async () => {
      const { runtime, context } = await createGeometry({ module: sphere(), wasm: 'multi' });
      const [session] = sessions.created;
      const pthread = session!.pico.module.PThread;

      expect(session!.artifact).toBe('multi');
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^PicoVoxel session variant=multi pthreads=[1-9]\d* lane=fast$/),
      );
      expect(pthread!.runningWorkers.length).toBeGreaterThan(0);

      // DP10: cleanup terminates the pool; no pthread keeps running.
      await definition.cleanup!(context);
      expect(pthread!.runningWorkers).toHaveLength(0);
      expect(context.runtimes.size).toBe(0);
    }, 60_000);

    it('should report zero pthreads on the serial artifact', async () => {
      const { runtime } = await createGeometry({ module: sphere() });

      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel session variant=serial pthreads=0 lane=fast');
    });

    it('should fail a fast render visibly when an explicit multi request cannot run, and still build exact', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      isolation.status = { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-secure-context' };

      const issues = await buildIssues(
        definition.createGeometry(
          { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
          runtime,
          context,
        ),
      );
      expect(issues).toEqual([
        expect.objectContaining({
          code: 'KERNEL_CAPABILITY_MISSING',
          details: expect.objectContaining({ capability: 'PICOVOXEL_MULTI_UNAVAILABLE', reason: 'no-secure-context' }),
        }),
      ]);
      expect(sessions.created).toHaveLength(0);

      const exact = await definition.createGeometry(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } },
        runtime,
        context,
      );
      expect(exact.nativeHandle.shapes).toHaveLength(1);
    });

    it('should start one warm runtime per artifact and open a fresh session per render', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      const render = async (lane: 'fast' | 'exact') =>
        definition.createGeometry({ entryPath: 'main.ts', parameters: {}, options: { lane } }, runtime, context);

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
      await definition.cleanup!(context);
    }, 60_000);
  });

  describe('results', () => {
    it('should preserve authored labels for mixed descriptors and raw parts after session disposal', async () => {
      const { result } = await createGeometry({
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
      expect(result.nativeHandle.shapes.map(({ name }) => name)).toEqual([
        'Housing / 蓋 🧩',
        'Mesh',
        'Shape 3',
        'Housing / 蓋 🧩',
        'Shape 5',
        'Shape 6',
      ]);
      expect(result.nativeHandle.shapes[0]!.vertices).toEqual(result.nativeHandle.shapes[2]!.vertices);
      expect(result.nativeHandle.shapes[0]!.triangles).toEqual(result.nativeHandle.shapes[2]!.triangles);
      expect(() => sessions.created[0]!.pico.memory).toThrow('disposed');
    });

    it('should keep a returned mesh and flat arrays of meshes and voxels as numbered shapes', async () => {
      const { result } = await createGeometry({
        module: { default: (pico: Pico) => [helloCube(pico), pico.createVoxels({ shape: 'sphere', radius: 2 })] },
      });

      expect(result.nativeHandle.shapes.map(({ name }) => name)).toEqual(['Shape 1', 'Shape 2']);
      expect([...result.nativeHandle.shapes[0]!.triangles.subarray(0, 3)]).toEqual([0, 2, 1]);
    });

    it('should accept a single named part and retain generated-looking authored labels', async () => {
      for (const name of ['Geometry', 'Shape_0']) {
        // oxlint-disable-next-line no-await-in-loop -- builds share the recorded session list
        const { result } = await createGeometry({
          module: { default: (pico: Pico) => ({ shape: helloCube(pico), name }) },
        });
        expect(result.nativeHandle.shapes.map((shape) => shape.name)).toEqual([name]);
      }
    });

    it.each([
      [42, 'name must be a string'],
      [null, 'name must be a string'],
      [false, 'name must be a string'],
    ])('should reject descriptor name %j and release the session', async (name, message) => {
      const issues = await buildIssues(
        createGeometry({
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
      const issues = await buildIssues(createGeometry({ module: { default: () => [value] } }));
      expect(issues[0]).toMatchObject({ code: 'RUNTIME', message: expect.stringContaining(message) });
      expect(issues[0]!.message).toContain('result 1');
    });

    it('should identify the failing duplicate by label and output index', async () => {
      const issues = await buildIssues(
        createGeometry({
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
      const { result } = await createGeometry({
        module: {
          default: (pico: Pico) => {
            const cube = helloCube(pico);
            // Cube triangles plus one with a repeated index: 13 in, 12 out.
            return pico.createMesh({ vertices: cube.vertices, triangles: [...cube.triangles, 0, 0, 1] });
          },
        },
      });

      expect(result.nativeHandle.shapes[0]!.triangles).toHaveLength(36);
    });

    it('should refuse a shape whose every triangle has zero area as empty, not an index-less mesh', async () => {
      const issues = await buildIssues(
        createGeometry({
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
      const { result } = await createGeometry({ module: { default: () => [] } });

      expect(result.nativeHandle.shapes).toEqual([]);
    });

    it('should default the voxel size to half a millimetre', async () => {
      await createGeometry({ module: sphere() });

      expect(sessions.created[0]!.options.voxelSize).toBe(0.5);
    });

    it.each([
      [
        { default: () => 42 },
        'PicoVoxel main() result 1 must be Mesh, Voxels or { shape: Mesh | Voxels, name?: string }; received number.',
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
      const issues = await buildIssues(createGeometry({ module }).then(({ result }) => result));

      expect(issues[0]!.message).toContain(message);
    });

    it('should refuse source that evaluates to something other than a module', async () => {
      const issues = await buildIssues(createGeometry({ module: () => 'not a module' }).then(({ result }) => result));

      expect(issues[0]!.message).toBe('PicoVoxel source must default-export a main(pico, params) function.');
    });

    it('should unwrap a CommonJS-style default namespace', async () => {
      const { result } = await createGeometry({ module: { default: { default: () => [] } } });

      expect(result.nativeHandle.shapes).toEqual([]);
    });

    it.each([
      [{ voxelSize: -1 }, 'received -1'],
      [{ voxelSize: '1' }, 'received string'],
    ])('should refuse the voxel size %j', async (parameters, message) => {
      const issues = await buildIssues(createGeometry({ module: sphere(), parameters }).then(({ result }) => result));

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
      const issues = await buildIssues(createGeometry({ module }).then(({ result }) => result));

      expect(issues[0]!.message).toContain(message);
    });

    it('should fall back to the session lane when a mesh carries none', async () => {
      const { result } = await createGeometry({
        module: meshLike([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]),
        lane: 'exact',
      });

      expect(result.nativeHandle.shapes[0]!.lane).toBe('exact');
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
      const { result } = await createGeometry({
        module: {
          default: (pico: Pico) => ({ vertices, triangles, toVoxels: helloCube(pico).toVoxels }),
        },
      });
      const shape = result.nativeHandle.shapes[0]!;

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
      const { result } = await createGeometry({
        module: {
          default: (pico: Pico) => ({ vertices: shared, triangles: indices, toVoxels: helloCube(pico).toVoxels }),
        },
      });

      expect(result.nativeHandle.shapes[0]!.vertices.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.nativeHandle.shapes[0]!.triangles.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.nativeHandle.shapes[0]!.vertices.buffer).not.toBe(shared.buffer);
      expect(result.nativeHandle.shapes[0]!.triangles.buffer).not.toBe(indices.buffer);
    });
  });

  describe('issues', () => {
    it('should keep an out-of-memory code in the details and name the remedy', async () => {
      const picovoxelModule = await import('picovoxel');
      const issues = await buildIssues(
        createGeometry({
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
        createGeometry({
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
        createGeometry({ module: { default: (pico: Pico) => pico.meshFromStl(fastStl) }, lane: 'exact' }).then(
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
      const { result } = await createGeometry({ module: { default: (pico: Pico) => pico.meshFromStl(fastStl) } });

      expect(result.nativeHandle.shapes[0]!.lane).toBe('fast');
    });

    it.each([
      ['an Error', new Error('user bug'), 'user bug'],
      ['a coded non-PicoVoxel Error', Object.assign(new Error('fs bug'), { code: 'ENOENT' }), 'fs bug'],
      ['a thrown string', 'plain failure', 'plain failure'],
    ])('should report %s as a runtime issue without a PicoVoxel code', async (_name, thrown, message) => {
      const issues = await buildIssues(
        createGeometry({
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
        definition.createGeometry(
          { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
          runtime,
          context,
        ),
      );

      expect(issues[0]).toMatchObject({ message: 'syntax', code: 'BUNDLER_FAILED' });
    });
  });

  describe('memory', () => {
    it('should log memory through the runtime logger and warn above one GiB of native memory', async () => {
      sessions.memoryTotal = 2 ** 31;
      const { runtime } = await createGeometry({ module: sphere() });

      expect(runtime.logger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^PicoVoxel session memory native=2147483648 heap=\d+ variant=serial$/),
      );
      expect(runtime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PicoVoxel held 2147483648 bytes of native memory on the serial artifact.'),
        { data: expect.objectContaining({ nativeBytes: 2 ** 31, artifact: 'serial' }) },
      );
    });

    it('should not warn for an ordinary render', async () => {
      const { runtime } = await createGeometry({ module: sphere() });

      expect(runtime.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('runtime lifetime', () => {
    const renderTwice = async (module: MainModule) => {
      const runtime = createRuntime(module);
      const context = await initialize({ wasm: 'serial' }, runtime);
      const render = async () =>
        definition.createGeometry(
          { entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } },
          runtime,
          context,
        );
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
        await definition.cleanup!(context);
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
      await definition.cleanup!(context);
    });

    it('should load each artifact from its explicit asset URL, and the pthread glue by filesystem path (D20)', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      const render = async (lane: 'exact' | 'fast') =>
        definition.createGeometry({ entryPath: 'main.ts', parameters: {}, options: { lane } }, runtime, context);
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
      await definition.cleanup!(context);
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
      await definition.cleanup!(context);
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
      await definition.cleanup!(context);
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
      expect(next.nativeHandle.shapes).toHaveLength(1);
      expect(sessions.runtimes).toHaveLength(2);
      await definition.cleanup!(context);
    });

    it('should recycle the runtime when a session cannot be disposed', async () => {
      const { runtime, context, render } = await renderTwice(sphere());
      sessions.disposeThrows = true;
      const result = await render();

      expect(result.nativeHandle.shapes).toHaveLength(1);
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
      expect(recovered.nativeHandle.shapes).toHaveLength(1);
      await definition.cleanup!(context);
    });

    it('should have nothing to recycle when a runtime runs out of memory while starting', async () => {
      const { runtime, render } = await renderTwice(sphere());
      sessions.failStart = 'serial';
      sessions.failStartCode = 'PICO_OUT_OF_MEMORY';
      const issues = await buildIssues(render());

      expect(issues[0]).toMatchObject({ code: 'RESOURCE_LIMIT', details: { picoCode: 'PICO_OUT_OF_MEMORY' } });
      expect(runtime.logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('recycled'));
    });

    it('should release leftover author resources on cleanup and keep going when a teardown throws', async () => {
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

      await definition.cleanup!(context);

      expect(broken.dispose).toHaveBeenCalledOnce();
      expect(leftover.dispose).toHaveBeenCalledOnce();
      expect(context.authorResources.size).toBe(0);
      await expect(sessions.runtimes[0]!.runtime.createPico()).rejects.toMatchObject({ code: 'PICO_DISPOSED' });
    });

    it('should dispose every runtime on cleanup and skip one that never started', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      await definition.createGeometry(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'exact' } },
        runtime,
        context,
      );
      const failed = Promise.reject(new Error('never started'));
      // Observed here so the rejection is handled; cleanup must still skip it.
      await expect(failed).rejects.toThrow('never started');
      context.runtimes.set('multi', failed);

      await definition.cleanup!(context);

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
      const { runtime, context, result } = await createGeometry({ module: await outOfMemoryOnMulti(), wasm: 'multi' });

      expect(sessions.created.map(({ artifact, options }) => [artifact, options.lane])).toEqual([
        ['multi', 'fast'],
        ['serial', 'fast'],
      ]);
      expect(result.nativeHandle.shapes).toHaveLength(1);
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
      await definition.cleanup!(context);
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
        .createGeometry({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context)
        .catch((error: unknown) => error);

      expect(aborted).toBeInstanceOf(RenderAbortedError);
      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel stopped a superseded build after 1 PicoVoxel calls');
      await definition.cleanup!(context);
    }, 60_000);

    it('should rebuild on the serial build when the multi build cannot start', async () => {
      sessions.failStart = 'multi';
      const { context, result } = await createGeometry({ module: sphere(), wasm: 'multi' });

      expect(sessions.created.map(({ artifact }) => artifact)).toEqual(['serial']);
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'KERNEL_CAPABILITY_MISSING',
          severity: 'warning',
          message: expect.stringContaining('could not start'),
          details: expect.objectContaining({ picoCode: 'PICO_WASM_INIT_FAILED' }),
        }),
      ]);
      await definition.cleanup!(context);
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
      const result = await definition.createGeometry(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
        runtime,
        context,
      );

      expect(sessions.created.map(({ artifact }) => artifact)).toEqual(['serial']);
      expect(result.issues).toEqual([
        expect.objectContaining({ details: expect.objectContaining({ picoCode: 'PICO_WASM_INIT_FAILED' }) }),
      ]);
      await definition.cleanup!(context);
    });

    it('should report both the serial failure and the warning when the rebuild fails too', async () => {
      const issues = await buildIssues(createGeometry({ module: await outOfMemoryOnMulti(true), wasm: 'multi' }));

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
          createGeometry({
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
      const { result } = await createGeometry({ module: sphereMinusBeam });

      expect(result.nativeHandle.shapes).toHaveLength(1);
      // Two createVoxels calls, equals, subtract, then the kernel's toMesh.
      expect(abort.checks).toBe(5);
    });

    it('should stop a superseded build at its next call, free the session, and build cleanly next time', async () => {
      const runtime = createRuntime(sphereMinusBeam);
      const context = await initialize({ wasm: 'serial' }, runtime);
      const render = async () =>
        definition.createGeometry(
          { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
          runtime,
          context,
        );
      abort.after = 1;

      const aborted = await render().catch((error: unknown) => error);

      expect(aborted).toBeInstanceOf(RenderAbortedError);
      expect(abort.checks).toBe(2);
      // The evidence DP15 reads: where the cooperative check caught the build.
      expect(runtime.logger.debug).toHaveBeenCalledWith('PicoVoxel stopped a superseded build after 1 PicoVoxel calls');
      expect(() => sessions.created[0]!.pico.allocated).toThrow(expect.objectContaining({ code: 'PICO_DISPOSED' }));

      abort.after = Infinity;
      const next = await render();
      expect(next.nativeHandle.shapes).toHaveLength(1);
      expect(sessions.runtimes).toHaveLength(1);
      await definition.cleanup!(context);
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

      const result = await definition.createGeometry(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
        runtime,
        context,
      );

      expect(result.nativeHandle.shapes).toHaveLength(1);
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

      await definition.createGeometry(
        { entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } },
        runtime,
        context,
      );

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
        .createGeometry({ entryPath: 'main.ts', parameters: {}, options: { lane: 'fast' } }, runtime, context)
        .catch(() => undefined);

      // The session is gone, so everything it allocated is freed with its Library instance.
      expect(() => sessions.created[0]!.pico.allocated).toThrow(expect.objectContaining({ code: 'PICO_DISPOSED' }));
      // A fresh session on the same runtime starts from zero native objects.
      const serialRuntime = await loadRuntimeFor(context);
      const fresh = await serialRuntime.createPico();
      expect(Object.values(fresh.allocated).every((count) => count === 0)).toBe(true);
      fresh.dispose();
      await definition.cleanup!(context);
    });
  });

  describe('getParameters', () => {
    const getParameters = async (module: MainModule | (() => never), overrides = {}) => {
      const runtime = createRuntime(module, overrides);
      const context = await initialize({ wasm: 'serial' }, runtime);
      return definition.getParameters({ entryPath: 'main.ts' }, runtime, context);
    };

    it('should declare voxelSize as a positive length in millimetres', async () => {
      const result = await getParameters({ defaultParams: { voxelSize: 1, radius: 4 }, default: () => [] });

      expect(result.success).toBe(true);
      const declaration = result.success ? result.data : undefined;
      expect(declaration?.defaults).toEqual({ voxelSize: 1, radius: 4 });
      expect(declaration?.bindings?.['/voxelSize']).toEqual({
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      });
      expect(declaration?.schema).toMatchObject({
        properties: { voxelSize: { ucumUnit: 'mm', exclusiveMinimum: 0 } },
      });
    });

    it('should leave parameters without a voxel size unannotated', async () => {
      const result = await getParameters({ defaultParams: { radius: 4 }, default: () => [] });

      expect(result.success).toBe(true);
      expect(JSON.stringify(result)).not.toContain('ucumUnit');
    });

    it('should report bundle, execution and thrown failures', async () => {
      const failure: KernelIssue = { message: 'syntax', code: 'BUNDLER_FAILED', severity: 'error' };
      const bundle = await getParameters({}, { bundleIssues: [failure] });
      const execute = await getParameters({}, { executeIssues: [failure] });
      const thrown = await getParameters(() => {
        throw new Error('boom');
      });
      const thrownString = await getParameters(() => {
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
      input: { format: 'glb' | 'stl'; options?: Record<string, unknown>; lane?: 'fast' | 'exact' },
    ) => {
      const { runtime, context, result } = await createGeometry({ module, lane: input.lane ?? 'exact' });
      const options = { ...definition.exportFormats[input.format].optionsSchema.parse(input.options ?? {}) };
      return definition.exportGeometry(
        { format: input.format, options, nativeHandle: result.nativeHandle } as unknown as ExportInput,
        runtime,
        context,
      );
    };

    it('should write an unstamped STL per shape from an exact handle', async () => {
      const result = await exportFrom({ default: helloCube }, { format: 'stl' });

      expect(result.success).toBe(true);
      const [file] = result.success ? result.data : [];
      expect(file!.name).toBe('Shape 1.stl');
      expect(stlHeader(file!.bytes)).toBe('PicoGK UNITS=mm');
      expect(file!.bytes.byteLength).toBe(84 + 12 * 50);
      expect(new DataView(file!.bytes.buffer).getUint32(80, true)).toBe(12);
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
        { format: 'stl' },
      );
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error('STL export failed');
      }
      expect(result.data.map((file) => file.name)).toEqual([
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
      const raw = await exportFrom({ default: helloCube }, { format: 'stl' });
      expect(raw.success).toBe(true);
      for (const file of result.data) {
        expect(file.bytes).toEqual(raw.success && raw.data[0]!.bytes);
      }
    });

    it('should honour STL units, scale and offset', async () => {
      const result = await exportFrom(
        { default: helloCube },
        { format: 'stl', options: { unit: 'cm', scale: 2, offset: [1, 0, 0] } },
      );
      const bytes = result.success ? result.data[0]!.bytes : new Uint8Array();

      expect(stlHeader(bytes)).toBe('PicoGK UNITS=cm');
      // First triangle, first corner: vertex 0 = (0,0,0) → ((0+1)·2)/10 cm.
      expect(new DataView(bytes.buffer).getFloat32(84 + 12, true)).toBeCloseTo(0.2, 6);
    });

    it('should stamp an explicit fast STL export and any fast-provenance handle', async () => {
      const explicit = await exportFrom({ default: helloCube }, { format: 'stl', options: { lane: 'fast' } });
      const provenance = await exportFrom(offsetSphere, { format: 'stl', lane: 'fast' });

      expect(explicit.success && stlHeader(explicit.data[0]!.bytes)).toBe('PicoGK UNITS=mm LANE=fast');
      expect(provenance.success && stlHeader(provenance.data[0]!.bytes)).toBe('PicoGK UNITS=mm LANE=fast');
    });

    it('should refuse a fast GLB export with a typed issue', async () => {
      const explicit = await exportFrom({ default: helloCube }, { format: 'glb', options: { lane: 'fast' } });
      const provenance = await exportFrom(offsetSphere, { format: 'glb', lane: 'fast' });

      for (const result of [explicit, provenance]) {
        expect(result).toEqual({
          success: false,
          issues: [
            expect.objectContaining({
              code: 'REPRESENTATION_UNSUPPORTED',
              details: expect.objectContaining({ refusal: 'PICOVOXEL_LANE_EXPORT' }),
            }),
          ],
        });
      }
    });

    it('should export an exact GLB in the requested convention', async () => {
      const result = await exportFrom(
        { default: helloCube },
        { format: 'glb', options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } } },
      );
      const document = await glbToDocument(result.success ? result.data[0]!.bytes : new Uint8Array());

      expect(result.success && result.data[0]!.name).toBe('model.glb');
      expect(document.getRoot().listAccessors()[0]!.getMax([0, 0, 0])).toEqual([1, 1, 1]);
    });

    it('should export an empty GLB and refuse an empty STL', async () => {
      const glb = await exportFrom({ default: () => [] }, { format: 'glb' });
      const stl = await exportFrom({ default: () => [] }, { format: 'stl' });

      expect(glb.success).toBe(true);
      expect(stl).toEqual({
        success: false,
        issues: [
          expect.objectContaining({
            code: 'NO_RENDER_GEOMETRY',
            message: expect.stringContaining('no shapes to export'),
          }),
        ],
      });
    });

    it('should refuse an undeclared format', async () => {
      const { runtime, context, result } = await createGeometry({ module: { default: () => [] } });
      const refused = await definition.exportGeometry(
        { format: 'step', options: {}, nativeHandle: result.nativeHandle } as unknown as ExportInput,
        runtime,
        context,
      );

      expect(refused).toMatchObject({ success: false, issues: [{ code: 'KERNEL_CAPABILITY_MISSING' }] });
    });
  });

  describe('mesh and snapshots', () => {
    it('should mesh a handle to an indexed GLB without edges', async () => {
      const { runtime, context, result } = await createGeometry({ module: { default: helloCube } });
      const meshed = await definition.meshGeometry!(
        { nativeHandle: result.nativeHandle, options: { lane: 'fast' }, content: { includeEdges: true } },
        runtime,
        context,
      );
      const document = await glbToDocument(
        meshed.geometry.format === 'gltf' ? meshed.geometry.content : new Uint8Array(),
      );

      expect(
        document
          .getRoot()
          .listMeshes()[0]!
          .listPrimitives()
          .map((primitive) => primitive.getMode()),
      ).toEqual([4]);
    });

    it('should round-trip a native handle through its snapshot', async () => {
      const { runtime, context, result } = await createGeometry({ module: { default: helloCube } });
      const snapshot = structuredClone(
        definition.serializeNativeHandle!({ nativeHandle: result.nativeHandle }, runtime, context),
      );

      expect(definition.deserializeNativeHandle!({ serializedNativeHandle: snapshot }, runtime, context)).toEqual(
        result.nativeHandle,
      );
    });

    it('should preserve authored and legacy snapshot labels and repair blank restored names', async () => {
      const { runtime, context, result } = await createGeometry({ module: { default: helloCube } });
      const nativeHandle = definition.deserializeNativeHandle!(
        {
          serializedNativeHandle: {
            shapes: ['  蓋 / Lid  ', 'Mesh', 'Shape 1', ''].map((name) => ({
              ...result.nativeHandle.shapes[0]!,
              name,
            })),
          },
        },
        runtime,
        context,
      );
      expect(nativeHandle.shapes.map(({ name }) => name)).toEqual(['蓋 / Lid', 'Mesh', 'Shape 1', 'Shape 4']);
      const exported = await definition.exportGeometry(
        { format: 'glb', nativeHandle, options: definition.exportFormats.glb.optionsSchema.parse({}) },
        runtime,
        context,
      );
      expect(exported.success).toBe(true);
      // The cube has exact provenance in either session lane.
      if (!exported.success) {
        throw new Error('Restored GLB export failed');
      }
      const document = await glbToDocument(exported.data[0]!.bytes);
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
    ])('should refuse the malformed snapshot %j', async (snapshot, message) => {
      const { runtime, context } = await createGeometry({ module: { default: () => [] } });

      expect(() =>
        definition.deserializeNativeHandle!(
          { serializedNativeHandle: snapshot as unknown as PicovoxelNativeHandle },
          runtime,
          context,
        ),
      ).toThrow(message);
    });
  });
});
