/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as IsolationModule from '@taucad/runtime/cross-origin-isolation';
import type { IsolationStatus } from '@taucad/runtime/cross-origin-isolation';
import type { KernelIssue } from '@taucad/runtime/types';
import { createMockKernelRuntime, glbToDocument } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { CreatePicoOptions, Mesh, Pico, Voxels } from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';

import type { PicovoxelNativeHandle } from '#picovoxel.geometry.js';
import { picovoxelBuiltinModuleNames, picovoxelKernel } from '#picovoxel.kernel.js';
import type { PicovoxelOptionsInput } from '#picovoxel.schemas.js';

const isolation = vi.hoisted(() => ({ status: undefined as IsolationStatus | undefined }));
const sessions = vi.hoisted(() => ({
  created: [] as Array<{ artifact: 'serial' | 'multi'; options: CreatePicoOptions; pico: Pico }>,
  memoryTotal: undefined as number | undefined,
}));

vi.mock('@taucad/runtime/cross-origin-isolation', async (importOriginal) => {
  const actual = await importOriginal<typeof IsolationModule>();
  return { ...actual, getIsolationStatus: () => isolation.status ?? actual.getIsolationStatus() };
});

const recordSessions = (artifact: 'serial' | 'multi', actual: typeof PicovoxelModule): typeof PicovoxelModule => ({
  ...actual,
  async createPico(options?: CreatePicoOptions) {
    const pico = await actual.createPico(options);
    const recorded =
      sessions.memoryTotal === undefined
        ? pico
        : new Proxy(pico, {
            get: (target, property) =>
              property === 'memory'
                ? { ...target.memory, total: sessions.memoryTotal }
                : (Reflect.get(target, property) as unknown),
          });
    sessions.created.push({ artifact, options: options ?? {}, pico: recorded });
    return recorded;
  },
});

vi.mock('picovoxel', async (importOriginal) => recordSessions('serial', await importOriginal()));
vi.mock('picovoxel/multi', async (importOriginal) => recordSessions('multi', await importOriginal()));

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
  sessions.created.length = 0;
  sessions.memoryTotal = undefined;
});

describe('picovoxel kernel', () => {
  describe('identity', () => {
    it('should key the kernel version on the PicoVoxel version and both artifact digests', () => {
      expect(definition.version).toMatch(/^1\.0\.0\+picovoxel\.0\.1\.0\.serial-[\da-f]{12}\.multi-[\da-f]{12}$/);
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
  });

  describe('initialize', () => {
    it('should register every author builtin at the PicoVoxel version', async () => {
      const runtime = createRuntime({});
      await initialize({ wasm: 'serial' }, runtime);

      expect(runtime.bundler.registerModule.mock.calls.map(([name, module]) => [name, module.version])).toEqual([
        ['picovoxel', '0.1.0'],
        ['picovoxel/latticelibrary', '0.1.0'],
        ['picovoxel/numerics', '0.1.0'],
        ['picovoxel/shapekernel', '0.1.0'],
        ['picovoxel/slicing', '0.1.0'],
      ]);
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

    it('should run the fast lane on the multi-threaded artifact in an isolated worker and stop its pool', async () => {
      const { runtime } = await createGeometry({ module: sphere(), wasm: 'multi' });
      const [session] = sessions.created;

      expect(session!.artifact).toBe('multi');
      expect(runtime.logger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/^PicoVoxel session variant=multi pthreads=[1-9]\d* lane=fast$/),
      );
      expect(session!.pico.module.PThread!.runningWorkers).toHaveLength(0);
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

    it('should load each artifact once per worker', async () => {
      const runtime = createRuntime(sphere());
      const context = await initialize({ wasm: 'multi' }, runtime);
      const render = async (lane: 'fast' | 'exact') =>
        definition.createGeometry({ entryPath: 'main.ts', parameters: {}, options: { lane } }, runtime, context);

      await render('exact');
      const serial = context.artifacts.get('serial');
      await render('fast');
      await render('exact');
      await render('fast');

      expect([...context.artifacts.keys()].sort()).toEqual(['multi', 'serial']);
      expect(context.artifacts.get('serial')).toBe(serial);
      expect(sessions.created.map(({ artifact }) => artifact)).toEqual(['serial', 'multi', 'serial', 'multi']);
    }, 60_000);
  });

  describe('results', () => {
    it('should keep a returned mesh and flat arrays of meshes and voxels as numbered shapes', async () => {
      const { result } = await createGeometry({
        module: { default: (pico: Pico) => [helloCube(pico), pico.createVoxels({ shape: 'sphere', radius: 2 })] },
      });

      expect(result.nativeHandle.shapes.map(({ name }) => name)).toEqual(['Shape 1', 'Shape 2']);
      expect([...result.nativeHandle.shapes[0]!.triangles.subarray(0, 3)]).toEqual([0, 2, 1]);
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
      [{ default: () => 42 }, 'PicoVoxel main() result 1 must be Mesh or Voxels; received number.'],
      [{ default: () => null }, 'received null.'],
      [{ default: () => [[]] }, 'received an array.'],
      [
        { default: (pico: Pico) => pico.createVoxels({ shape: 'empty' }) },
        'PicoVoxel Shape 1 is an empty Voxels field.',
      ],
      [
        { default: (pico: Pico) => pico.createMesh({ vertices: [], triangles: [] }) },
        'PicoVoxel Shape 1 is empty. Return [] for an empty scene.',
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

    it('should keep any other PicoVoxel code in the details of a runtime issue', async () => {
      const issues = await buildIssues(
        createGeometry({
          module: {
            default: (pico: Pico) =>
              pico.createVoxels({ shape: 'sphere', radius: 1 }).offset({ distance: 1, fastRenorm: true }),
          },
          lane: 'exact',
        }).then(({ result }) => result),
      );

      expect(issues[0]).toMatchObject({ code: 'RUNTIME', details: { picoCode: 'PICO_LANE_LOOSENED', lane: 'exact' } });
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
