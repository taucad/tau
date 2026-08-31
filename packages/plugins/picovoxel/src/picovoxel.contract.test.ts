// @vitest-environment node
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- malformed wire values deliberately exercise runtime validation. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { getModuleRegistry } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { KernelIssue } from '@taucad/runtime/types';
import { picovoxelKernel } from '#picovoxel.kernel.js';
import type { PicovoxelContext } from '#picovoxel.kernel.js';
import type { PicovoxelNativeHandle, PicovoxelShapeSnapshot } from '#picovoxel.geometry.js';
import { picovoxelExportSchemas, picovoxelOptionsSchema, picovoxelRenderSchema } from '#picovoxel.schemas.js';

const renderOptions = picovoxelRenderSchema.parse({});
const triangle: Omit<PicovoxelShapeSnapshot, 'name'> = {
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  triangles: new Uint32Array([0, 1, 2]),
  lane: 'exact',
};
const handle: PicovoxelNativeHandle = {
  shapes: [{ name: 'Shape 1', ...triangle }],
};
const issue = (message: string): KernelIssue => ({
  message,
  code: 'RUNTIME',
  type: 'runtime',
  severity: 'error',
});

const definition = async () => resolveRuntimePluginDefinition('kernel', picovoxelKernel());
const successfulRuntime = (value: unknown) => {
  const runtime = createMockKernelRuntime();
  vi.spyOn(runtime.bundler, 'bundle').mockResolvedValue({
    code: 'export default 1',
    sourceMap: undefined,
    issues: [],
    success: true,
    dependencies: ['project/main.ts'],
    unresolvedPaths: [],
  });
  vi.spyOn(runtime, 'execute').mockResolvedValue({ success: true, value, entryUrl: 'project/main.ts' });
  return runtime;
};

const contextWith = (value: unknown) => {
  const dispose = vi.fn();
  const createPico = vi.fn(async () => ({ dispose }));
  const rootValue = { createPico, meshToStlBytes: vi.fn(() => new Uint8Array([1, 2, 3])) };
  const root = rootValue as unknown as PicovoxelContext['root'];
  const context: PicovoxelContext = { root };
  return { context, createPico, dispose, value };
};

const emptyContextValue = {};
const emptyContext = emptyContextValue as PicovoxelContext;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Picovoxel kernel contract', () => {
  it('publishes strict render/export defaults and rejects contradictory fast options', () => {
    expect(picovoxelOptionsSchema.parse({})).toEqual({ wasm: 'serial' });
    expect(picovoxelOptionsSchema.parse({ wasm: 'auto' })).toEqual({ wasm: 'auto' });
    expect(picovoxelOptionsSchema.parse({ wasm: 'multi' })).toEqual({ wasm: 'multi' });
    expect(() => picovoxelOptionsSchema.parse({ wasm: 'parallel' })).toThrow();
    expect(picovoxelRenderSchema.parse({})).toEqual({ lane: 'exact', fastRenorm: false, serialLattice: false });
    expect(picovoxelRenderSchema.parse({ lane: 'fast', fastRenorm: true })).toEqual({
      lane: 'fast',
      fastRenorm: true,
      serialLattice: false,
    });
    expect(() => picovoxelRenderSchema.parse({ lane: 'exact', fastRenorm: true })).toThrow(
      "fastRenorm requires lane: 'fast'",
    );
    expect(picovoxelExportSchemas.stl.parse({})).toEqual({ unit: 'mm', scale: 1, offset: [0, 0, 0] });
    expect(() => picovoxelExportSchemas.stl.parse({ scale: 0 })).toThrow();
  });

  it('initializes every serial module plus Three and exposes an actionable multi-module rejection', async () => {
    const kernel = await definition();
    const runtime = createMockKernelRuntime();
    const register = vi.spyOn(runtime.bundler, 'registerModule');
    await kernel.initialize(picovoxelOptionsSchema.parse({}), runtime);

    expect(register.mock.calls.map(([name]) => name)).toEqual([
      'picovoxel',
      'picovoxel/latticelibrary',
      'picovoxel/numerics',
      'picovoxel/raw',
      'picovoxel/shapekernel',
      'picovoxel/slicing',
      'picovoxel/three',
      'three',
      'picovoxel/multi',
    ]);
    const multi = getModuleRegistry().get('picovoxel/multi');
    const createPico = multi?.['createPico'] as undefined | (() => Promise<unknown>);
    expect(createPico).toBeTypeOf('function');
    await expect(createPico!()).rejects.toThrow('picovoxel/multi is not active');
    expect(runtime.logger.debug).toHaveBeenCalledWith('Initialized Picovoxel serial kernel');
  });

  it('loads and registers the pthread module for explicit and automatic multi selection', async () => {
    const kernel = await definition();
    const multi = await import('picovoxel/multi');

    await Promise.all(
      (['multi', 'auto'] as const).map(async (wasm) => {
        const runtime = createMockKernelRuntime();
        const context = await kernel.initialize(picovoxelOptionsSchema.parse({ wasm }), runtime);
        expect(context.root.createPico).toBe(multi.createPico);
        expect(getModuleRegistry().get('picovoxel/multi')?.['createPico']).toBe(multi.createPico);
        expect(runtime.logger.debug).toHaveBeenCalledWith('Initialized Picovoxel multi kernel');
        if (wasm === 'auto') {
          expect(runtime.logger.log).toHaveBeenCalledWith(
            'PicoVoxel WASM variant auto-selected: multi (SAB available)',
          );
        }
      }),
    );
  });

  it('auto-selects serial when pthread support is unavailable and rejects explicit multi', async () => {
    const kernel = await definition();
    const serial = await import('picovoxel');
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('crossOriginIsolated', false);

    const automaticRuntime = createMockKernelRuntime();
    const context = await kernel.initialize(picovoxelOptionsSchema.parse({ wasm: 'auto' }), automaticRuntime);
    expect(context.root.createPico).toBe(serial.createPico);
    expect(automaticRuntime.logger.log).toHaveBeenCalledWith(
      'PicoVoxel WASM variant auto-selected: serial (crossOriginIsolated=false (missing COOP/COEP headers))',
    );

    const explicitRuntime = createMockKernelRuntime();
    const register = vi.spyOn(explicitRuntime.bundler, 'registerModule');
    await expect(kernel.initialize(picovoxelOptionsSchema.parse({ wasm: 'multi' }), explicitRuntime)).rejects.toThrow(
      'Serve the browser with COOP/COEP headers',
    );
    expect(register).not.toHaveBeenCalled();
  });

  it('passes dependency resolution through to the configured bundler', async () => {
    const kernel = await definition();
    const runtime = createMockKernelRuntime();
    vi.spyOn(runtime.bundler, 'resolveDependencies').mockResolvedValue({
      resolved: ['project/main.ts'],
      unresolved: [],
    });
    await expect(kernel.getDependencies({ entryPath: 'project/main.ts' }, runtime, emptyContext)).resolves.toEqual({
      resolved: ['project/main.ts'],
      unresolved: [],
    });
  });

  it('extracts direct, nested-default, and empty parameter modules', async () => {
    const kernel = await definition();
    const direct = await kernel.getParameters(
      { entryPath: 'project/main.ts' },
      successfulRuntime({ defaultParams: { count: 2 } }),
      emptyContext,
    );
    const nested = await kernel.getParameters(
      { entryPath: 'project/main.ts' },
      successfulRuntime({ default: { defaultParameters: { radius: 3 } } }),
      emptyContext,
    );
    const empty = await kernel.getParameters({ entryPath: 'project/main.ts' }, successfulRuntime(4), emptyContext);
    expect(direct).toMatchObject({ success: true, data: { defaultParameters: { count: 2 } } });
    expect(nested).toMatchObject({ success: true, data: { defaultParameters: { radius: 3 } } });
    expect(empty).toMatchObject({ success: true, data: { defaultParameters: {} } });
  });

  it('returns authored bundle, execute, thrown Error, and thrown scalar parameter issues', async () => {
    const kernel = await definition();
    const bundleFailure = createMockKernelRuntime();
    vi.spyOn(bundleFailure.bundler, 'bundle').mockResolvedValue({
      code: '',
      issues: [issue('bundle failed')],
      success: false,
      dependencies: [],
      unresolvedPaths: [],
    });
    const executeFailure = successfulRuntime({});
    vi.spyOn(executeFailure, 'execute').mockResolvedValue({ success: false, issues: [issue('execute failed')] });
    const thrownError = createMockKernelRuntime();
    vi.spyOn(thrownError.bundler, 'bundle').mockRejectedValue(new Error('parameter boom'));
    const thrownScalar = createMockKernelRuntime();
    vi.spyOn(thrownScalar.bundler, 'bundle').mockRejectedValue('scalar boom');

    await Promise.all(
      (
        [
          [bundleFailure, 'bundle failed'],
          [executeFailure, 'execute failed'],
          [thrownError, 'parameter boom'],
          [thrownScalar, 'Failed to extract Picovoxel parameters.'],
        ] as const
      ).map(async ([runtime, message]) => {
        const result = await kernel.getParameters({ entryPath: 'project/main.ts' }, runtime, emptyContext);
        expect(result).toMatchObject({ success: false, issues: [expect.objectContaining({ message })] });
      }),
    );
  });

  it('accepts Mesh, Voxels, async functions, and mixed flat arrays while copying bytes before disposal', async () => {
    const kernel = await definition();
    const voxels = { isEmpty: false, lane: 'exact', toMesh: vi.fn(() => triangle) };
    const fastTriangle: Omit<PicovoxelShapeSnapshot, 'name'> = { ...triangle, lane: 'fast' };
    const fastVoxels = { isEmpty: false, lane: 'fast', toMesh: vi.fn(() => fastTriangle) };
    const authored = vi.fn(async () => [triangle, voxels, fastTriangle, fastVoxels]);
    const runtime = successfulRuntime({ default: authored });
    const { context, createPico, dispose } = contextWith(undefined);
    const result = await kernel.createGeometry(
      { entryPath: 'project/main.ts', parameters: { voxelSize: 1 }, options: renderOptions },
      runtime,
      context,
    );

    expect(createPico).toHaveBeenCalledWith({
      voxelSize: 1,
      lane: 'exact',
      fastRenorm: false,
      serialLattice: false,
    });
    expect(authored).toHaveBeenCalledOnce();
    expect(voxels.toMesh).toHaveBeenCalledOnce();
    expect(result.nativeHandle.shapes.map(({ name }) => name)).toEqual(['Shape 1', 'Shape 2', 'Shape 3', 'Shape 4']);
    expect(result.nativeHandle.shapes[0]?.vertices).not.toBe(triangle.vertices);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing main', {}, 'default-export a main'],
    ['empty array', { default: () => [] }, 'returned an empty array'],
    ['null', { default: () => null }, 'received null'],
    ['nested array', { default: () => [[triangle]] }, 'received an array'],
    ['scalar', { default: () => 2 }, 'received number'],
    ['empty voxels', { default: () => ({ isEmpty: true, lane: 'exact', toMesh: () => triangle }) }, 'empty Voxels'],
    ['empty mesh', { default: () => ({ ...triangle, vertices: new Float32Array() }) }, 'is empty'],
    ['bad triples', { default: () => ({ ...triangle, vertices: new Float32Array([0, 1]) }) }, 'triples'],
    ['bad index', { default: () => ({ ...triangle, triangles: new Uint32Array([0, 1, 4]) }) }, 'outside 3 vertices'],
    [
      'wrong arrays',
      { default: () => ({ vertices: [0, 0, 0], triangles: [0, 0, 0], lane: 'exact' }) },
      'must be Mesh or Voxels',
    ],
  ])('rejects %s results and still disposes the session', async (_name, value, message) => {
    const kernel = await definition();
    const { context, dispose } = contextWith(undefined);
    await expect(
      kernel.createGeometry(
        { entryPath: 'project/main.ts', parameters: {}, options: renderOptions },
        successfulRuntime(value),
        context,
      ),
    ).rejects.toThrow(message);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, '1'])(
    'rejects invalid voxelSize %s before creating a session',
    async (voxelSize) => {
      const kernel = await definition();
      const { context, createPico, dispose } = contextWith(undefined);
      await expect(
        kernel.createGeometry(
          { entryPath: 'project/main.ts', parameters: { voxelSize }, options: renderOptions },
          successfulRuntime({ default: () => triangle }),
          context,
        ),
      ).rejects.toThrow('positive finite number');
      expect(createPico).not.toHaveBeenCalled();
      expect(dispose).not.toHaveBeenCalled();
    },
  );

  it('preserves bundle/execute issues and maps authored Error and scalar throws', async () => {
    const kernel = await definition();
    const bundleFailure = createMockKernelRuntime();
    vi.spyOn(bundleFailure.bundler, 'bundle').mockResolvedValue({
      code: '',
      issues: [issue('bundle geometry failed')],
      success: false,
      dependencies: [],
      unresolvedPaths: [],
    });
    const executeFailure = successfulRuntime({});
    vi.spyOn(executeFailure, 'execute').mockResolvedValue({
      success: false,
      issues: [issue('execute geometry failed')],
    });
    const authoredScalar = successfulRuntime({});
    vi.spyOn(authoredScalar, 'execute').mockResolvedValue({
      success: true,
      value: {
        default: () => {
          // oxlint-disable-next-line typescript/only-throw-error -- Exercises the unknown authored-throw boundary.
          throw 'scalar authored boom';
        },
      },
    });
    const { context, dispose } = contextWith(undefined);

    await expect(
      kernel.createGeometry(
        { entryPath: 'project/main.ts', parameters: {}, options: renderOptions },
        bundleFailure,
        context,
      ),
    ).rejects.toThrow('bundle geometry failed');
    await expect(
      kernel.createGeometry(
        { entryPath: 'project/main.ts', parameters: {}, options: renderOptions },
        executeFailure,
        context,
      ),
    ).rejects.toThrow('execute geometry failed');
    await expect(
      kernel.createGeometry(
        { entryPath: 'project/main.ts', parameters: {}, options: renderOptions },
        successfulRuntime({
          default: () => {
            throw new Error('authored boom');
          },
        }),
        context,
      ),
    ).rejects.toThrow('authored boom');
    await expect(
      kernel.createGeometry(
        { entryPath: 'project/main.ts', parameters: {}, options: renderOptions },
        authoredScalar,
        context,
      ),
    ).rejects.toThrow('scalar authored boom');
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('round-trips durable handles with exact typed-array copies and rejects malformed snapshots', async () => {
    const kernel = await definition();
    const runtime = createMockKernelRuntime();
    const serialized = kernel.serializeNativeHandle!({ nativeHandle: handle }, runtime, emptyContext);
    const deserialize = (serializedNativeHandle: unknown) => {
      const input = { serializedNativeHandle } as unknown as Parameters<
        NonNullable<typeof kernel.deserializeNativeHandle>
      >[0];
      return kernel.deserializeNativeHandle!(input, runtime, emptyContext);
    };
    const restored = deserialize(serialized);
    expect(restored).toEqual(handle);
    expect(restored.shapes[0]?.vertices).not.toBe(handle.shapes[0]?.vertices);
    expect(deserialize({ shapes: [{ ...handle.shapes[0]!, lane: 'fast' }] })).toMatchObject({
      shapes: [{ lane: 'fast' }],
    });

    expect(() => deserialize([])).toThrow('expected a shapes array');
    expect(() => deserialize({ shapes: [null] })).toThrow('expected an object');
    expect(() => deserialize({ shapes: [{ name: 1, vertices: [], triangles: [], lane: 'open' }] })).toThrow(
      'expected name',
    );
  });

  it('exports GLB, exact/fast STL, and an unsupported-format issue', async () => {
    const kernel = await definition();
    const runtime = createMockKernelRuntime();
    const stl = vi.fn(() => new Uint8Array([1, 2, 3]));
    const context = { root: { meshToStlBytes: stl } } as unknown as PicovoxelContext;
    const glb = await kernel.exportGeometry(
      {
        format: 'glb',
        nativeHandle: handle,
        options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
        content: { includeEdges: true },
      },
      runtime,
      context,
    );
    expect(glb).toMatchObject({ success: true, data: [expect.objectContaining({ name: 'model.glb' })] });

    const exact = await kernel.exportGeometry(
      { format: 'stl', nativeHandle: handle, options: picovoxelExportSchemas.stl.parse({}) },
      runtime,
      context,
    );
    expect(exact).toMatchObject({ success: true, data: [expect.objectContaining({ name: 'Shape 1.stl' })] });
    expect(stl).toHaveBeenCalledWith(
      handle.shapes[0]?.vertices,
      handle.shapes[0]?.triangles,
      { unit: 'mm', scale: 1, offset: [0, 0, 0] },
      undefined,
    );

    const fastHandle: PicovoxelNativeHandle = {
      shapes: [{ ...handle.shapes[0]!, lane: 'fast' }],
    };
    const rejected = await kernel.exportGeometry(
      { format: 'stl', nativeHandle: fastHandle, options: picovoxelExportSchemas.stl.parse({}) },
      runtime,
      context,
    );
    expect(rejected).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ message: expect.stringContaining('acceptLane') })],
    });
    const accepted = await kernel.exportGeometry(
      {
        format: 'stl',
        nativeHandle: fastHandle,
        options: picovoxelExportSchemas.stl.parse({ unit: 'cm', scale: 2, offset: [1, 2, 3], acceptLane: 'fast' }),
      },
      runtime,
      context,
    );
    expect(accepted.success).toBe(true);
    expect(stl).toHaveBeenLastCalledWith(
      fastHandle.shapes[0]?.vertices,
      fastHandle.shapes[0]?.triangles,
      { unit: 'cm', scale: 2, offset: [1, 2, 3], acceptLane: 'fast' },
      'fast',
    );

    const unsupported = await kernel.exportGeometry(
      { format: 'step', nativeHandle: handle, options: {} } as unknown as Parameters<typeof kernel.exportGeometry>[0],
      runtime,
      context,
    );
    expect(unsupported).toMatchObject({
      success: false,
      issues: [expect.objectContaining({ code: 'KERNEL_CAPABILITY_MISSING' })],
    });
  });
});
