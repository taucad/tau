/* oxlint-disable typescript/no-unsafe-assignment -- public test definitions intentionally erase private kernel context. */
// @vitest-environment node
import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { sha256StringSync } from '@taucad/utils/hash';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { PythonWorkerError } from '@taucad/python-kernel-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { build123dKernel } from '#build123d.kernel.js';
import { build123dComputeDescriptorLimit } from '#build123d.protocol.js';

const runtime = createMockKernelRuntime();
const renderOptions = { tessellation: { linearTolerance: 0.05, angularTolerance: 20 } } as const;
const kernelOptions = {
  pythonExecutable: '/python',
  workerPath: '/worker.py',
  pythonSha256: 'a'.repeat(64),
  workerSha256: 'b'.repeat(64),
  supportFiles: [
    { path: '/native_materials.py', sha256: 'c'.repeat(64) },
    { path: '/mechanisms.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/analyzer.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/glb.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/model.py', sha256: 'd'.repeat(64) },
    { path: '/tau_kernel/protocol.py', sha256: 'd'.repeat(64) },
  ],
};
const parameterDeclaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:build123d:parameters',
    $uses: ['JSONSchemaUnits'],
    name: 'Build123dParameters',
    type: 'object',
    properties: { width: { type: 'double', default: 25.4, ucumUnit: 'mm' } },
  },
  defaults: { width: 25.4 },
  bindings: {
    '/width': {
      unit: 'mm',
      quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
      space: 'linear',
      sourceUnitCapability: 'change-source-unit:preserve-size:v1',
    },
  },
};

const createContextData = () => ({
  mirror: { sync: vi.fn().mockResolvedValue(['main.py']), cleanup: vi.fn().mockResolvedValue(undefined) },
  session: {
    generation: 2,
    request: vi.fn(),
    readArtifact: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
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
    id: '@taucad/build123d',
    version: 'test',
    implementationAssets: [contentDigest({ value: `sha256:${'a'.repeat(64)}` })],
  },
});

/**
 * The worker methods a session fake was asked for, in order.
 *
 * @param request - The session's `request` spy.
 * @returns Each call's `method`.
 */
const requestedMethods = (request: ReturnType<typeof vi.fn>): string[] =>
  request.mock.calls.map(([call]) => (call as { readonly method: string }).method);

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

const loadDefinition = async () =>
  resolveRuntimePluginDefinition('kernel', build123dKernel({ closure: kernelOptions }));
// The hook tests use focused session/mirror doubles; this is their checked context boundary.
const createContext = () =>
  createContextData() as ReturnType<typeof createContextData> &
    Parameters<Awaited<ReturnType<typeof loadDefinition>>['evaluate']>[2];

describe('Build123d kernel lifecycle errors', () => {
  let definition: Awaited<ReturnType<typeof loadDefinition>>;

  beforeEach(async () => {
    definition = await loadDefinition();
  });

  it('preserves Python issue provenance for dependencies and parameters', async () => {
    const context = createContext();
    context.session.request.mockRejectedValueOnce(workerError('syntax'));
    await expect(definition.resolve({ entryPath: 'main.py' }, runtime, context)).rejects.toMatchObject({
      name: 'Build123dKernelError',
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
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ type: 'runtime' })],
    });
  });

  it('should not request analyze during createGeometry', async () => {
    const context = createContext();
    context.session.request.mockResolvedValueOnce({ handleId: 'shape', observedDependencies: [] });

    await definition.evaluate({ entryPath: 'main.py', parameters: { width: 20 }, options: {} }, runtime, context);

    expect(context.session.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'analyze' }));
  });

  it('reports an analyzer response that omits the required parameter declaration', async () => {
    const context = createContext();
    context.session.request.mockResolvedValueOnce({ resolved: ['main.py'], unresolved: [] });
    await expect(definition.describe({ entryPath: 'main.py' }, runtime, context)).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ message: 'Build123d analyzer omitted its parameter declaration.' })],
    });
  });

  it('closes the compute scope as cancelled when the build is interrupted', async () => {
    const context = createContext();
    const cancellation = new AbortController();
    const capability = runtime.compute as Extract<typeof runtime.compute, { status: 'on' }>;
    const scope = capability.openScope({
      namespace: 'build123d.operation.v1',
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

  it('analyzes the entry once per runtime operation and scopes each mirror sync to it', async () => {
    const context = createContext();
    context.session.request.mockImplementation(async ({ method }: { method: string }) =>
      method === 'analyze'
        ? { declaration: parameterDeclaration, resolved: ['main.py'], unresolved: [] }
        : { handleId: 'shape', observedDependencies: ['main.py'] },
    );
    const render = { ...runtime, operationId: 1 };
    const input = { entryPath: 'main.py' };

    await definition.resolve(input, render, context);
    await definition.describe(input, render, context);
    await definition.evaluate({ ...input, parameters: {}, options: {} }, render, context);

    // The mirror reuses its own walk per operation id.
    expect(context.mirror.sync.mock.calls.map((call): unknown => call[2])).toEqual([1, 1, 1]);
    expect(requestedMethods(context.session.request)).toEqual(['analyze', 'build']);

    // The next operation observes the workspace afresh.
    await definition.describe(input, { ...runtime, operationId: 2 }, context);
    expect(requestedMethods(context.session.request)).toEqual(['analyze', 'build', 'analyze']);
  });

  it('spans the native analyze so its wire time is attributed', async () => {
    const context = createContext();
    context.session.request.mockResolvedValueOnce({
      defaultParameters: { width: 25.4 },
      jsonSchema: { type: 'object' },
      declaration: parameterDeclaration,
      resolved: ['main.py'],
      unresolved: [],
    });

    await definition.describe({ entryPath: 'main.py' }, runtime, context);

    /* D8: a native kernel's time is in the trace, not only in its own process. */
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('build123d.analyze', { entryPath: 'main.py' });
  });

  it('returns structured generic and stale-handle failures', async () => {
    const context = createContext();
    context.session.request.mockResolvedValueOnce({
      defaultParameters: { width: 25.4 },
      jsonSchema: { type: 'object' },
      declaration: parameterDeclaration,
      resolved: ['main.py'],
      unresolved: [],
    });
    await expect(definition.describe({ entryPath: 'main.py' }, runtime, context)).resolves.toEqual({
      success: true,
      data: { parameters: parameterDeclaration },
      issues: [],
    });

    context.session.request.mockRejectedValueOnce('plain failure');
    const parameters = await definition.describe({ entryPath: 'main.py' }, runtime, context);
    expect(parameters).toMatchObject({
      success: false,
      issues: [{ message: 'plain failure', location: { fileName: 'main.py' } }],
    });

    context.session.isHandleGenerationValid.mockReturnValue(false);
    await expect(
      definition.render?.(
        { view: 'model', handle: { sessionGeneration: 1, handleId: 'stale' }, options: renderOptions },
        runtime,
        context,
      ),
    ).rejects.toThrow(/stale/);
    await expect(
      definition.export!(
        { exportId: 'step', handle: { sessionGeneration: 1, handleId: 'stale' }, options: {} },
        runtime,
        context,
      ),
    ).rejects.toThrow(/stale/);
  });

  it('should surface preserved unsupported mechanism intent in the Kinematics pane', async () => {
    const context = createContext();
    const diagnostic = {
      code: 'UNSUPPORTED_MECHANISM',
      path: '/mechanismIntent/connections',
      message: 'Closed graph',
      recovery: 'Inspect the retained intent.',
    };
    context.session.request.mockResolvedValue({
      artifactPath: '/private/model.glb',
      byteLength: 3,
      mechanismDiagnostics: [diagnostic],
      mechanismIntent: { connections: [{}] },
    });
    const result = await definition.render?.(
      { view: 'model', handle: { sessionGeneration: 2, handleId: 'shape' }, options: renderOptions },
      runtime,
      context,
    );
    expect(result).toMatchObject({
      content: new Uint8Array([1, 2, 3]),
      issues: [
        {
          code: 'INVALID_ANNOTATION',
          severity: 'warning',
          details: { producer: { kernelId: 'build123d' }, mechanism: diagnostic },
        },
      ],
    });
  });

  it('rejects invalid native coupling ratios, cycles and clip timing before render or export delivery', async () => {
    const joints = {
      first: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 1, 0] },
      second: { type: 'revolute', parent: 'arm', child: 'tool', origin: [0, 0, 0], axis: [0, 1, 0] },
    };
    const base = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'deg' },
      root: 'base',
      links: { base: { components: [] }, arm: { components: ['arm'] }, tool: { components: ['tool'] } },
      joints,
    };
    const checkProjection = async (projection: Record<string, unknown>) => {
      const context = createContext();
      context.session.request.mockResolvedValue({ artifactPath: '/private/model.glb', byteLength: 3, ...projection });
      const handle = { sessionGeneration: 2, handleId: 'shape' };
      const rejection = {
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'INVALID_ANNOTATION',
            severity: 'error',
            details: expect.objectContaining({ producer: { kernelId: 'build123d' } }),
          }),
        ]),
      };
      await Promise.all([
        expect(
          definition.render?.({ view: 'model', handle, options: renderOptions }, runtime, context),
        ).rejects.toMatchObject(rejection),
        expect(
          definition.export!(
            {
              exportId: 'glb',
              handle,
              options: { ...renderOptions, coordinateSystem: 'y-up', unit: { length: 'meter' } },
            },
            runtime,
            context,
          ),
        ).rejects.toMatchObject(rejection),
      ]);
    };
    const checks: Array<Promise<void>> = [];
    for (const invalid of [
      { ...base, couplings: [{ driver: 'first', follower: 'second', ratio: 'invalid' }] },
      {
        ...base,
        couplings: [
          { driver: 'first', follower: 'second', ratio: 1 },
          { driver: 'second', follower: 'first', ratio: 1 },
        ],
      },
      { ...base, animations: [{ id: 'turn', duration: 1, keyframes: [{ time: 2, coordinates: { first: 1 } }] }] },
    ]) {
      for (const projection of [
        { mechanism: invalid },
        {
          mechanismIntent: {
            ...invalid,
            connections: [{ playbackCoordinates: { angle: 'first', distance: 'second' } }],
          },
          mechanismDiagnostics: [
            {
              code: 'UNSUPPORTED_MECHANISM',
              path: '/mechanismIntent',
              message: 'Unsupported graph',
              recovery: 'Inspect the retained intent.',
            },
          ],
        },
      ]) {
        checks.push(checkProjection(projection));
      }
    }
    await Promise.all(checks);
  });

  it('handles mesh/export worker failures and GLB export naming', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockRejectedValueOnce(new Error('mesh failed'));
    await expect(
      definition.render?.({ view: 'model', handle, options: renderOptions }, runtime, context),
    ).rejects.toThrow(/mesh failed/);

    context.session.request.mockResolvedValueOnce({
      artifactPath: '/private/model.glb',
      byteLength: 3,
      triangles: 12,
      vertices: 36,
    });
    const exported = await definition.export!(
      {
        exportId: 'glb',
        handle,
        options: { ...renderOptions, coordinateSystem: 'y-up', unit: { length: 'meter' } },
      },
      runtime,
      context,
    );
    expect(exported).toMatchObject({ files: [{ name: 'model.glb', bytes: new Uint8Array([1, 2, 3]) }] });
    expect(context.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'mesh',
        params: { handleId: 'shape', linearTolerance: 0.05, angularTolerance: 20, maxTriangles: 20_000_000 },
        signal: runtime.signal,
      }),
    );

    context.session.request.mockRejectedValueOnce(new Error('export failed'));
    await expect(definition.export!({ exportId: 'step', handle, options: {} }, runtime, context)).rejects.toThrow(
      /export failed/,
    );
  });

  it('meshes a preset render from the measured diagonal and reports its cost', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request
      .mockResolvedValueOnce({ diagonal: 2000 })
      .mockResolvedValueOnce({ artifactPath: '/private/model.glb', byteLength: 3, triangles: 8, vertices: 24 });

    const rendered = await definition.render?.(
      { view: 'model', handle, options: { tessellation: 'medium' } },
      runtime,
      context,
    );

    expect(context.session.request.mock.calls.map(([call]) => call as unknown)).toEqual([
      expect.objectContaining({ method: 'measure', params: { handleId: 'shape' } }),
      expect.objectContaining({
        method: 'mesh',
        params: { handleId: 'shape', linearTolerance: 1, angularTolerance: 20, maxTriangles: 2_000_000 },
      }),
    ]);
    expect(rendered).toMatchObject({
      content: new Uint8Array([1, 2, 3]),
      tessellation: { triangles: 8, vertices: 24, requested: 'medium', linearTolerance: 1, downgraded: 0 },
      issues: [],
    });
  });

  it('coarsens an over-budget render and delivers its last step unbounded', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    const overBudget = { triangles: 3_000_000, vertices: 9_000_000 };
    context.session.request
      .mockResolvedValueOnce(overBudget)
      .mockResolvedValueOnce(overBudget)
      .mockResolvedValueOnce(overBudget)
      .mockResolvedValueOnce({ ...overBudget, artifactPath: '/private/model.glb', byteLength: 3 });

    const rendered = await definition.render?.(
      { view: 'model', handle, options: { tessellation: { linearTolerance: 0.5, angularTolerance: 20 } } },
      runtime,
      context,
    );

    expect(context.session.request.mock.calls.map(([call]) => (call as { params: unknown }).params)).toEqual([
      { handleId: 'shape', linearTolerance: 0.5, angularTolerance: 20, maxTriangles: 2_000_000 },
      { handleId: 'shape', linearTolerance: 1, angularTolerance: 24, maxTriangles: 2_000_000 },
      { handleId: 'shape', linearTolerance: 2, angularTolerance: 28, maxTriangles: 2_000_000 },
      { handleId: 'shape', linearTolerance: 4, angularTolerance: 32 },
    ]);
    expect(rendered).toMatchObject({
      tessellation: { requested: 'explicit', linearTolerance: 4, angularTolerance: 32, downgraded: 3 },
      issues: [expect.objectContaining({ code: 'TESSELLATION_DOWNGRADED' })],
    });
  });

  it('exports STEP from the retained shapes', async () => {
    const context = createContext();
    context.session.request.mockResolvedValueOnce({ artifactPath: '/private/assembly.step', byteLength: 3 });

    const exported = await definition.export!(
      { exportId: 'step', handle: { sessionGeneration: 2, handleId: 'shape' }, options: {} },
      runtime,
      context,
    );

    expect(context.session.request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: 'export', params: { handleId: 'shape', format: 'step' } }),
    );
    expect(exported).toMatchObject({ files: [{ name: 'assembly.step', bytes: new Uint8Array([1, 2, 3]) }] });
  });

  it('refuses an over-budget GLB export with RESOURCE_LIMIT', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockResolvedValueOnce({ triangles: 30_000_000, vertices: 90_000_000 });

    await expect(
      definition.export!(
        {
          exportId: 'glb',
          handle,
          options: {
            tessellation: { linearTolerance: 0.01 },
            coordinateSystem: 'y-up',
            unit: { length: 'meter' },
          },
        },
        runtime,
        context,
      ),
    ).rejects.toMatchObject({
      name: 'Build123dKernelError',
      issues: [
        expect.objectContaining({
          code: 'RESOURCE_LIMIT',
          details: expect.objectContaining({
            producer: 'build123d',
            suggested: { linearTolerance: 0.015, angularTolerance: 20 },
          }),
        }),
      ],
    });
    expect(context.session.readArtifact).not.toHaveBeenCalled();
  });

  it('announces verified worker admissions, refreshes warm candidates and skips the off arm', async () => {
    const context = createContext();
    const action = {
      schemaVersion: 1,
      namespace: 'build123d.operation.v1',
      producer: context.computeProducer,
      operation: 'Shape.cut',
      inputs: [],
      arguments: { length: 1, width: 2, height: 3 },
      environment: { platform: 'test' },
      codec: { id: 'build123d.bintools-brep', version: '1' },
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
    const capability = runtime.compute as Extract<typeof runtime.compute, { status: 'on' }> & {
      openScope: Extract<typeof runtime.compute, { status: 'on' }>['openScope'];
    };

    // A fresh worker has no exact digests, but discovery can still supply another worker's prefix.
    const discovered = {
      action,
      actionDigest: digest,
      bytes: new Uint8Array([1]),
      mediaType: 'application/octet-stream',
    };
    const discoveryScope = capability.openScope({
      namespace: 'build123d.operation.v1',
      producer: context.computeProducer,
      environment: {},
      resident: context.resident,
    });
    const warm = vi.spyOn(discoveryScope, 'warm').mockImplementation(async () => {
      await context.resident.importEntries({ entries: [discovered], signal: runtime.signal });
      return { status: 'imported', imported: [digest], omitted: [], bytes: 1 } as const;
    });
    const openScope = vi.spyOn(capability, 'openScope').mockReturnValueOnce(discoveryScope);

    await expect(
      definition.evaluate({ entryPath: 'main.py', parameters: {}, options: renderOptions }, runtime, context),
    ).resolves.toEqual({ handle: { sessionGeneration: 2, handleId: 'shape' }, issues: [] });
    expect(openScope).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'build123d.operation.v1', admissionFloor: 5, resident: context.resident }),
    );
    expect(warm).toHaveBeenCalledWith({ digests: [], maxEntries: build123dComputeDescriptorLimit });
    expect(context.resident.importEntries).toHaveBeenCalledWith(expect.objectContaining({ entries: [discovered] }));
    expect(context.session.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'build',
        params: expect.objectContaining({
          compute: expect.objectContaining({ namespace: 'build123d.operation.v1' }),
        }),
      }),
    );
    // A worker digest that disagrees with the runtime's own canonicalization is never announced.
    expect(context.resident.track).toHaveBeenCalledWith([digest]);
    expect(context.warmCandidates).toEqual([digest]);
    expect(context.resident.observeResidentBytes).toHaveBeenCalledWith(4096);

    // The next build warms from the refreshed candidate set before it executes.
    context.session.request.mockResolvedValueOnce({ handleId: 'again', observedDependencies: [] });
    await definition.evaluate({ entryPath: 'main.py', parameters: {}, options: {} }, runtime, context);
    expect(context.resident.importEntries).toHaveBeenCalled();

    // C2/EQ14 off arm: no scope, and the worker is asked to build with no compute configuration at all.
    const off = createContext();
    const offRuntime = { ...runtime, compute: { status: 'off' } } as unknown as typeof runtime;
    off.session.request.mockResolvedValueOnce({ handleId: 'plain', observedDependencies: [] });
    await expect(
      definition.evaluate({ entryPath: 'main.py', parameters: {}, options: renderOptions }, offRuntime, off),
    ).resolves.toEqual({ handle: { sessionGeneration: 2, handleId: 'plain' }, issues: [] });
    expect(off.session.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: { entryPath: 'main.py', parameters: {} } }),
    );
    expect(off.resident.track).not.toHaveBeenCalled();
    expect(openScope).toHaveBeenCalledTimes(2);
    expect(warm).toHaveBeenCalledOnce();
    openScope.mockRestore();
  });

  it('warns when pyproject.toml pins build123d at a version the kernel does not run', async () => {
    const context = createContext();
    context.mirror.sync.mockResolvedValueOnce(['main.py', 'pyproject.toml']);
    context.session.request.mockResolvedValueOnce({ handleId: 'plain', observedDependencies: [] });
    const project = createMockKernelRuntime({
      filesystemOverrides: {
        readFileResult: (path) =>
          path === 'pyproject.toml' ? '[project]\nname = "plate"\ndependencies = ["build123d==0.12.0"]\n' : '',
      },
    });
    const offRuntime = { ...project, compute: { status: 'off' } } as unknown as typeof runtime;

    const result = await definition.evaluate(
      { entryPath: 'main.py', parameters: {}, options: renderOptions },
      offRuntime,
      context,
    );

    expect(result).toMatchObject({
      handle: { handleId: 'plain' },
      issues: [
        {
          code: 'LIBRARY_VERSION_MISMATCH',
          severity: 'warning',
          location: { fileName: 'pyproject.toml', startLineNumber: 3 },
          details: { library: 'build123d', declared: '0.12.0', runs: '0.13.0' },
        },
      ],
    });
    expect(project.filesystem.mocks.readFile).toHaveBeenCalledWith('pyproject.toml', 'utf8');
  });

  it('delegates handle validity/disposal and always removes the mirror', async () => {
    const context = createContext();
    expect(definition.isHandleValid?.({ handle: { sessionGeneration: 2, handleId: 'shape' } }, runtime, context)).toBe(
      true,
    );
    definition.releaseHandle?.({ handle: { sessionGeneration: 2, handleId: 'shape' } }, runtime, context);
    expect(context.session.release).toHaveBeenCalledWith('shape', 2);

    context.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.onDispose?.(context)).rejects.toThrow(/cleanup failed/);
    expect(context.mirror.cleanup).toHaveBeenCalled();
  });
});
