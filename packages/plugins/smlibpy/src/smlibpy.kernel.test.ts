/* oxlint-disable typescript/no-unsafe-assignment -- public test definitions intentionally erase private kernel context. */
// @vitest-environment node
import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { sha256StringSync } from '@taucad/utils/hash';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { PythonWorkerError } from '@taucad/python-kernel-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeMeshBundle, squareShape } from '#smlibpy-bundle.fixture.js';
import { smlibpyDetectPattern } from '#smlibpy.constants.js';
import { smlibpyKernel } from '#smlibpy.kernel.js';
import { smlibpyComputeDescriptorLimit } from '#smlibpy.protocol.js';

const runtime = createMockKernelRuntime();
const renderOptions = { tessellation: { linearTolerance: 0.05, angularTolerance: 20 } } as const;
const glbOptions = { ...renderOptions, coordinateSystem: 'y-up', unit: { length: 'meter' } } as const;
const kernelOptions = {
  pythonExecutable: '/python',
  workerPath: '/worker.py',
  pythonSha256: 'a'.repeat(64),
  workerSha256: 'b'.repeat(64),
  supportFiles: [
    { path: '/smlibpy_materials.py', sha256: 'c'.repeat(64) },
    { path: '/smlibpy_mechanisms.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/analyzer.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/glb.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/model.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/protocol.py', sha256: 'd'.repeat(64) },
  ],
};
const parameterDeclaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:smlibpy:parameters',
    name: 'SMLibPyParameters',
    type: 'object',
    properties: { width: { type: 'double', default: 25.4 } },
  },
  defaults: { width: 25.4 },
};
const analysis = {
  defaultParameters: { width: 25.4 },
  jsonSchema: { type: 'object' },
  declaration: parameterDeclaration,
  resolved: ['main.py'],
  unresolved: [],
};
const meshAnswer = { artifactPath: '/private/model.smlibpy-mesh.bin', byteLength: 3, triangles: 2, vertices: 4 };
const hinge = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: { base: { shapes: ['Base'] }, lid: { shapes: ['Lid'] } },
  joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 0], axis: [1, 0, 0] } },
};

const createContextData = () => ({
  mirror: { sync: vi.fn().mockResolvedValue(['main.py']), cleanup: vi.fn().mockResolvedValue(undefined) },
  session: {
    generation: 2,
    request: vi.fn(),
    readArtifact: vi.fn().mockResolvedValue(encodeMeshBundle([{ ...squareShape, name: 'Plate' }])),
    isHandleGenerationValid: vi.fn().mockReturnValue(true),
    release: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined),
  },
  resident: {
    contains: vi.fn().mockReturnValue(false),
    track: vi.fn(),
    observeResidentBytes: vi.fn(),
    importEntries: vi.fn().mockResolvedValue({ imported: [], omitted: [] }),
    exportEntries: vi.fn().mockResolvedValue({ entries: [], omitted: [] }),
    stats: vi.fn().mockReturnValue({
      entries: 0,
      logicalBytes: 0,
      encodedBytes: { status: 'unsupported' },
      evictions: 0,
      omissions: 0,
    }),
    clear: vi.fn(),
  },
  observedDependencies: [] as string[],
  warmCandidates: [] as ActionDigest[],
  computeProducer: {
    id: '@taucad/smlibpy',
    version: 'test',
    implementationAssets: [contentDigest({ value: `sha256:${'a'.repeat(64)}` })],
  },
});

const requestedMethods = (request: ReturnType<typeof vi.fn>): string[] =>
  request.mock.calls.map(([call]) => (call as { readonly method: string }).method);

const requestParams = (request: ReturnType<typeof vi.fn>): unknown[] =>
  request.mock.calls.map(([call]) => (call as { readonly params: unknown }).params);

const workerError = (type: 'syntax' | 'validation' | 'runtime' | 'kernel' = 'syntax') =>
  new PythonWorkerError([
    {
      message: `${type} failed`,
      code: 'PYTHON_TEST',
      type,
      severity: 'error',
      location: { fileName: 'main.py', startLineNumber: 2, startColumn: 3 },
    },
  ]);

const loadDefinition = async () => resolveRuntimePluginDefinition('kernel', smlibpyKernel({ closure: kernelOptions }));
const createContext = () =>
  createContextData() as ReturnType<typeof createContextData> &
    Parameters<Awaited<ReturnType<typeof loadDefinition>>['evaluate']>[2];

/**
 * Read the JSON chunk of a GLB.
 * @param bytes - The GLB.
 * @returns Its JSON.
 */
const glbJson = (bytes: Uint8Array<ArrayBuffer>): { nodes: Array<{ name: string }>; extensionsUsed?: string[] } => {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    nodes: Array<{ name: string }>;
    extensionsUsed?: string[];
  };
};

describe('SMLibPy kernel', () => {
  let definition: Awaited<ReturnType<typeof loadDefinition>>;

  beforeEach(async () => {
    definition = await loadDefinition();
  });

  it('declares the .py routing, the model view and four exports', () => {
    const kernel = smlibpyKernel();

    expect(kernel).toMatchObject({ id: 'smlibpy', extensions: ['py'] });
    expect(kernel.detectImport).toEqual({ source: smlibpyDetectPattern.source, flags: smlibpyDetectPattern.flags });
    expect(Object.keys(definition.exports)).toEqual(['glb', 'gltf', 'step', 'stl']);
  });

  it('binds an explicit closure, starts no worker and names its implementation assets', async () => {
    const context = await definition.initialize(definition.optionsSchema!.parse({ closure: kernelOptions }), runtime);

    try {
      expect(context.computeProducer).toMatchObject({ id: '@taucad/smlibpy' });
      expect(context.computeProducer.implementationAssets).toHaveLength(8);
      expect(context.warmCandidates).toEqual([]);
    } finally {
      await definition.onDispose?.(context);
    }
  });

  it('preserves Python issue provenance for dependencies, parameters and builds', async () => {
    const context = createContext();
    context.session.request.mockRejectedValueOnce(workerError('syntax'));
    await expect(definition.resolve({ entryPath: 'main.py' }, runtime, context)).rejects.toMatchObject({
      name: 'SmlibpyKernelError',
      issues: [
        expect.objectContaining({ type: 'compilation', details: { pythonCode: 'PYTHON_TEST', pythonType: 'syntax' } }),
      ],
    });

    context.session.request.mockRejectedValueOnce(workerError('validation'));
    await expect(definition.describe({ entryPath: 'main.py' }, runtime, context)).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ type: 'compilation' })],
    });

    context.session.request.mockRejectedValueOnce(workerError('runtime'));
    await expect(
      definition.evaluate({ entryPath: 'main.py', parameters: {}, options: {} }, runtime, context),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ type: 'runtime' })] });
  });

  it('analyzes the entry once per runtime operation and resolves its dependencies', async () => {
    const context = createContext();
    context.session.request.mockImplementation(async ({ method }: { method: string }) =>
      method === 'analyze' ? analysis : { handleId: 'shape', observedDependencies: ['main.py'] },
    );
    const render = { ...runtime, operationId: 1 };

    await expect(definition.resolve({ entryPath: 'main.py' }, render, context)).resolves.toEqual({
      resolved: ['main.py'],
      unresolved: [],
    });
    await expect(definition.describe({ entryPath: 'main.py' }, render, context)).resolves.toEqual({
      success: true,
      data: { parameters: parameterDeclaration },
      issues: [],
    });
    await definition.evaluate({ entryPath: 'main.py', parameters: {}, options: {} }, render, context);

    expect(requestedMethods(context.session.request)).toEqual(['analyze', 'build']);
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('smlibpy.analyze', { entryPath: 'main.py' });
    await definition.describe({ entryPath: 'main.py' }, { ...runtime, operationId: 2 }, context);
    await definition.describe({ entryPath: 'main.py' }, { ...runtime, operationId: undefined }, context);
    expect(requestedMethods(context.session.request)).toEqual(['analyze', 'build', 'analyze', 'analyze']);
  });

  it('returns structured generic and stale-handle failures', async () => {
    const context = createContext();
    context.session.request.mockRejectedValueOnce('plain failure');
    await expect(definition.describe({ entryPath: 'main.py' }, runtime, context)).resolves.toMatchObject({
      success: false,
      issues: [{ message: 'plain failure', location: { fileName: 'main.py' } }],
    });

    context.session.request.mockRejectedValueOnce(new Error('render failed'));
    await expect(
      definition.render?.(
        { view: 'model', handle: { sessionGeneration: 2, handleId: 'shape' }, options: renderOptions },
        runtime,
        context,
      ),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ message: 'render failed' })] });

    context.session.isHandleGenerationValid.mockReturnValue(false);
    const stale = { sessionGeneration: 1, handleId: 'stale' };
    await expect(
      definition.render?.({ view: 'model', handle: stale, options: renderOptions }, runtime, context),
    ).rejects.toThrow(/stale/);
    await expect(
      definition.export!({ exportId: 'step', handle: stale, options: { coordinateSystem: 'z-up' } }, runtime, context),
    ).rejects.toThrow(/stale/);
  });

  it('renders the mesh bundle as a GLB with names, edges and topology on request', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockResolvedValue(meshAnswer);

    const plain = await definition.render?.({ view: 'model', handle, options: renderOptions }, runtime, context);
    const rich = await definition.render?.(
      { view: 'model', handle, options: renderOptions, content: { includeEdges: true, includeTopology: true } },
      runtime,
      context,
    );

    expect(requestParams(context.session.request)).toEqual([
      { handleId: 'shape', linearTolerance: 0.05, angularTolerance: 20, edges: false, maxTriangles: 2_000_000 },
      { handleId: 'shape', linearTolerance: 0.05, angularTolerance: 20, edges: true, maxTriangles: 2_000_000 },
    ]);
    expect(context.session.readArtifact).toHaveBeenCalledWith({
      artifactPath: meshAnswer.artifactPath,
      byteLength: 3,
    });
    expect(plain).toMatchObject({ tessellation: { triangles: 2, vertices: 4, requested: 'explicit' }, issues: [] });
    expect(glbJson(plain!.content as Uint8Array<ArrayBuffer>).nodes.map(({ name }) => name)).toEqual(['Plate']);
    expect(glbJson(plain!.content as Uint8Array<ArrayBuffer>).extensionsUsed ?? []).not.toContain('TAU_cad_topology');
    expect(glbJson(rich!.content as Uint8Array<ArrayBuffer>).extensionsUsed).toEqual([
      'TAU_cad_topology',
      'KHR_materials_unlit',
    ]);
  });

  it('meshes a preset render from the measured diagonal and coarsens an over-budget mesh', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    const overBudget = { triangles: 3_000_000, vertices: 9_000_000 };
    context.session.request
      .mockResolvedValueOnce({ diagonal: 2000 })
      .mockResolvedValueOnce(overBudget)
      .mockResolvedValueOnce(overBudget)
      .mockResolvedValueOnce(overBudget)
      .mockResolvedValueOnce(meshAnswer);

    const rendered = await definition.render?.(
      { view: 'model', handle, options: { tessellation: 'medium' } },
      runtime,
      context,
    );

    expect(requestedMethods(context.session.request)).toEqual(['measure', 'mesh', 'mesh', 'mesh', 'mesh']);
    // The last coarser step is delivered whatever it costs, so it asks for no budget.
    expect(requestParams(context.session.request).at(-1)).not.toHaveProperty('maxTriangles');
    expect(rendered).toMatchObject({
      tessellation: { requested: 'medium', downgraded: 3 },
      issues: [expect.objectContaining({ code: 'TESSELLATION_DOWNGRADED' })],
    });
  });

  it('reports mechanism issues on render and writes a valid mechanism into the topology', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockResolvedValue(meshAnswer);
    context.session.readArtifact.mockResolvedValueOnce(
      encodeMeshBundle(
        [
          { ...squareShape, name: 'Base' },
          { ...squareShape, name: 'Lid' },
        ],
        { mechanism: 42 },
      ),
    );

    const invalid = await definition.render?.(
      { view: 'model', handle, options: renderOptions, content: { includeTopology: true } },
      runtime,
      context,
    );

    expect(invalid!.issues).toEqual([
      expect.objectContaining({
        code: 'INVALID_ANNOTATION',
        details: expect.objectContaining({ producer: { kernelId: 'smlibpy' } }),
      }),
    ]);

    context.session.readArtifact.mockResolvedValueOnce(
      encodeMeshBundle(
        [
          { ...squareShape, name: 'Base' },
          { ...squareShape, name: 'Lid' },
        ],
        { mechanism: hinge },
      ),
    );
    const valid = await definition.render?.(
      { view: 'model', handle, options: renderOptions, content: { includeTopology: true } },
      runtime,
      context,
    );
    expect(valid!.issues).toEqual([]);
  });

  it('exports GLB and glTF in the requested frame and unit within the export budget', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockResolvedValue(meshAnswer);

    const glb = await definition.export!({ exportId: 'glb', handle, options: glbOptions }, runtime, context);
    const gltf = await definition.export!(
      {
        exportId: 'gltf',
        handle,
        options: { ...glbOptions, coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
        content: { includeEdges: true },
      },
      runtime,
      context,
    );

    expect(glb).toMatchObject({ files: [{ name: 'model.glb' }], issues: [] });
    expect(gltf).toMatchObject({ files: [{ name: 'model.gltf' }] });
    const json = JSON.parse(new TextDecoder().decode(gltf.files[0].bytes)) as { asset: { version: string } };
    expect(json.asset.version).toBe('2.0');
    expect(requestParams(context.session.request)).toEqual([
      { handleId: 'shape', linearTolerance: 0.05, angularTolerance: 20, edges: false, maxTriangles: 20_000_000 },
      { handleId: 'shape', linearTolerance: 0.05, angularTolerance: 20, edges: true, maxTriangles: 20_000_000 },
    ]);
  });

  it('refuses an over-budget GLB export with RESOURCE_LIMIT', async () => {
    const context = createContext();
    context.session.request.mockResolvedValueOnce({ triangles: 30_000_000, vertices: 90_000_000 });

    await expect(
      definition.export!(
        { exportId: 'glb', handle: { sessionGeneration: 2, handleId: 'shape' }, options: glbOptions },
        runtime,
        context,
      ),
    ).rejects.toMatchObject({
      name: 'SmlibpyKernelError',
      issues: [
        expect.objectContaining({ code: 'RESOURCE_LIMIT', details: expect.objectContaining({ producer: 'smlibpy' }) }),
      ],
    });
    expect(context.session.readArtifact).not.toHaveBeenCalled();
  });

  it('exports STEP from the retained exact bodies in the requested frame', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockResolvedValue({ artifactPath: '/private/model.step', byteLength: 3 });
    context.session.readArtifact.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const zUp = await definition.export!(
      { exportId: 'step', handle, options: { coordinateSystem: 'z-up' } },
      runtime,
      context,
    );
    await definition.export!({ exportId: 'step', handle, options: { coordinateSystem: 'y-up' } }, runtime, context);

    expect(zUp).toMatchObject({ files: [{ name: 'assembly.step', bytes: new Uint8Array([1, 2, 3]) }] });
    expect(requestParams(context.session.request)).toEqual([
      { handleId: 'shape', format: 'step', coordinateSystem: 'z-up' },
      { handleId: 'shape', format: 'step', coordinateSystem: 'y-up' },
    ]);
  });

  it('exports binary and ASCII STL at resolved tolerances and refuses one over the export budget', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    const binary = new Uint8Array(84 + 50 * 2);
    new DataView(binary.buffer).setUint32(80, 2, true);
    const ascii = new TextEncoder().encode('solid a\n facet normal 0 0 1\n endfacet\nendsolid a\n');
    context.session.request
      .mockResolvedValueOnce({ diagonal: 8000 })
      .mockResolvedValue({ artifactPath: '/private/model.stl', byteLength: 3 });
    context.session.readArtifact
      .mockResolvedValueOnce(binary)
      .mockResolvedValueOnce(ascii)
      .mockResolvedValueOnce(new Uint8Array(10))
      .mockResolvedValueOnce(new TextEncoder().encode('solid empty\nendsolid empty\n'));

    const preset = await definition.export!(
      { exportId: 'stl', handle, options: { tessellation: 'high', binary: true, coordinateSystem: 'z-up' } },
      runtime,
      context,
    );
    const text = await definition.export!(
      { exportId: 'stl', handle, options: { ...renderOptions, binary: false, coordinateSystem: 'y-up' } },
      runtime,
      context,
    );
    await definition.export!(
      { exportId: 'stl', handle, options: { ...renderOptions, binary: true, coordinateSystem: 'z-up' } },
      runtime,
      context,
    );
    await definition.export!(
      { exportId: 'stl', handle, options: { ...renderOptions, binary: false, coordinateSystem: 'z-up' } },
      runtime,
      context,
    );

    expect(preset).toMatchObject({ files: [{ name: 'model.stl' }] });
    expect(text.files[0].bytes).toEqual(ascii);
    expect(requestParams(context.session.request).slice(0, 3)).toEqual([
      { handleId: 'shape' },
      {
        handleId: 'shape',
        format: 'stl',
        linearTolerance: expect.any(Number),
        angularTolerance: 12,
        binary: true,
        coordinateSystem: 'z-up',
      },
      {
        handleId: 'shape',
        format: 'stl',
        linearTolerance: 0.05,
        angularTolerance: 20,
        binary: false,
        coordinateSystem: 'y-up',
      },
    ]);

    const huge = new Uint8Array(84);
    new DataView(huge.buffer).setUint32(80, 30_000_000, true);
    context.session.readArtifact.mockResolvedValueOnce(huge);
    await expect(
      definition.export!(
        { exportId: 'stl', handle, options: { ...renderOptions, binary: true, coordinateSystem: 'z-up' } },
        runtime,
        context,
      ),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'RESOURCE_LIMIT' })] });
  });

  it('announces verified worker admissions, refreshes warm candidates and skips the off arm', async () => {
    const context = createContext();
    const action = {
      schemaVersion: 1,
      namespace: 'smlibpy.operation.v1',
      producer: context.computeProducer,
      operation: 'Box',
      inputs: [],
      arguments: { length: 1, width: 2, height: 3 },
      environment: { platform: 'test' },
      codec: { id: 'smlibpy.smb', version: '1' },
    } satisfies ComputeAction;
    const digest = actionDigest({ value: `sha256:${sha256StringSync(canonicalizeComputeAction(action))}` });
    const announcement = { action, actionDigest: digest, computeDuration: 24, estimatedBytes: 8192 };
    const forged = { ...announcement, actionDigest: `sha256:${'f'.repeat(64)}` };
    context.session.request.mockResolvedValueOnce({
      handleId: 'shape',
      observedDependencies: ['main.py'],
      compute: {
        announcements: [announcement, forged],
        hits: 0,
        stats: { entries: 1, logicalBytes: 4096, evictions: 0, omissions: 0 },
      },
    });
    const capability = runtime.compute as Extract<typeof runtime.compute, { status: 'on' }>;
    const scope = capability.openScope({
      namespace: 'smlibpy.operation.v1',
      producer: context.computeProducer,
      environment: {},
      resident: context.resident,
    });
    const warm = vi.spyOn(scope, 'warm');
    const announce = vi.spyOn(scope, 'announce');
    const openScope = vi.spyOn(capability, 'openScope').mockReturnValueOnce(scope);

    await expect(
      definition.evaluate({ entryPath: 'main.py', parameters: {}, options: renderOptions }, runtime, context),
    ).resolves.toEqual({ handle: { sessionGeneration: 2, handleId: 'shape' }, issues: [] });
    expect(openScope).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'smlibpy.operation.v1', admissionFloor: 5, resident: context.resident }),
    );
    expect(warm).toHaveBeenCalledWith({ digests: [], maxEntries: smlibpyComputeDescriptorLimit });
    expect(announce).toHaveBeenCalledWith({
      entries: [{ kind: 'action', action, digest, computeDuration: 24, estimatedBytes: 8192 }],
    });
    expect(context.resident.track).toHaveBeenCalledWith([digest]);
    expect(context.warmCandidates).toEqual([digest]);
    expect(context.resident.observeResidentBytes).toHaveBeenCalledWith(4096);

    // A build without compute admissions announces nothing.
    context.session.request.mockResolvedValueOnce({ handleId: 'again', observedDependencies: [] });
    await definition.evaluate({ entryPath: 'main.py', parameters: {}, options: {} }, runtime, context);
    expect(context.resident.track).toHaveBeenCalledOnce();

    const off = createContext();
    const offRuntime = { ...runtime, compute: { status: 'off' } } as unknown as typeof runtime;
    off.session.request.mockResolvedValueOnce({ handleId: 'plain', observedDependencies: [] });
    await expect(
      definition.evaluate({ entryPath: 'main.py', parameters: {}, options: renderOptions }, offRuntime, off),
    ).resolves.toEqual({ handle: { sessionGeneration: 2, handleId: 'plain' }, issues: [] });
    expect(off.session.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: { entryPath: 'main.py', parameters: {} } }),
    );
    openScope.mockRestore();
  });

  it('closes the compute scope as cancelled when the build is interrupted', async () => {
    const context = createContext();
    const cancellation = new AbortController();
    const capability = runtime.compute as Extract<typeof runtime.compute, { status: 'on' }>;
    const scope = capability.openScope({
      namespace: 'smlibpy.operation.v1',
      producer: context.computeProducer,
      environment: {},
      resident: context.resident,
    });
    const close = vi.spyOn(scope, 'close');
    const openScope = vi.spyOn(capability, 'openScope').mockReturnValueOnce(scope);
    context.session.request.mockImplementationOnce(async () => {
      cancellation.abort();
      throw new Error('build cancelled');
    });

    await expect(
      definition.evaluate(
        { entryPath: 'main.py', parameters: {}, options: {} },
        { ...runtime, signal: cancellation.signal },
        context,
      ),
    ).rejects.toThrow('build cancelled');
    expect(close).toHaveBeenCalledWith({ outcome: 'cancelled' });
    openScope.mockRestore();
  });

  it('warns when pyproject.toml pins smlibpy at a version the kernel does not run', async () => {
    const context = createContext();
    context.mirror.sync.mockResolvedValueOnce(['main.py', 'pyproject.toml']);
    context.session.request.mockResolvedValueOnce({ handleId: 'plain', observedDependencies: [] });
    const project = createMockKernelRuntime({
      filesystemOverrides: {
        readFileResult: (path) =>
          path === 'pyproject.toml' ? '[project]\nname = "plate"\ndependencies = ["smlibpy==0.3.0"]\n' : '',
      },
    });
    const offRuntime = { ...project, compute: { status: 'off' } } as unknown as typeof runtime;

    const result = await definition.evaluate(
      { entryPath: 'main.py', parameters: {}, options: renderOptions },
      offRuntime,
      context,
    );

    expect(result).toMatchObject({
      issues: [
        {
          code: 'LIBRARY_VERSION_MISMATCH',
          severity: 'warning',
          details: { library: 'smlibpy', declared: '0.3.0', runs: '0.3.5' },
        },
      ],
    });
  });

  it('delegates handle validity/disposal and always removes the mirror', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    expect(definition.isHandleValid?.({ handle }, runtime, context)).toBe(true);
    definition.releaseHandle?.({ handle }, runtime, context);
    expect(context.session.release).toHaveBeenCalledWith('shape', 2);

    context.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.onDispose?.(context)).rejects.toThrow(/cleanup failed/);
    expect(context.mirror.cleanup).toHaveBeenCalled();
  });
});
