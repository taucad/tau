/* oxlint-disable typescript/no-unsafe-assignment -- public test definitions intentionally erase private kernel context. */
// @vitest-environment node
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { sha256StringSync } from '@taucad/utils/hash';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { build123dKernel } from '#build123d.kernel.js';
import { build123dComputeDescriptorLimit } from '#build123d.protocol.js';
import { Build123dWorkerError } from '#python-session.js';

const runtime = createMockKernelRuntime();
const renderOptions = { tessellation: { linearTolerance: 0.05, angularTolerance: 0.1 } } as const;
const kernelOptions = {
  pythonExecutable: '/python',
  workerPath: '/worker.py',
  trustFile: '/trust.json',
  pythonSha256: 'a'.repeat(64),
  workerSha256: 'b'.repeat(64),
  supportFiles: [
    { path: '/analyzer.py', sha256: 'c'.repeat(64) },
    { path: '/glb.py', sha256: 'd'.repeat(64) },
  ],
};

const createContext = () => ({
  mirror: { sync: vi.fn().mockResolvedValue(['main.py']), cleanup: vi.fn().mockResolvedValue(undefined) },
  session: {
    generation: 2,
    request: vi.fn(),
    readArtifact: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    observeResidentBytes: vi.fn(),
    isHandleGenerationValid: vi.fn().mockReturnValue(true),
    release: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined),
  },
  resident: {
    contains: vi.fn().mockReturnValue(false),
    track: vi.fn(),
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

const workerError = (type: 'syntax' | 'validation' | 'runtime' | 'kernel' = 'syntax') =>
  new Build123dWorkerError([
    {
      message: `${type} failed`,
      code: 'PYTHON_TEST',
      type,
      severity: 'error',
      location: { fileName: 'main.py', startLineNumber: 2, startColumn: 3 },
    },
  ]);

describe('Build123d kernel lifecycle errors', () => {
  let definition: AnyKernelDefinition;

  beforeEach(async () => {
    definition = await resolveRuntimePluginDefinition('kernel', build123dKernel(kernelOptions));
  });

  it('preserves Python issue provenance for dependencies and parameters', async () => {
    const context = createContext();
    context.session.request.mockRejectedValueOnce(workerError('syntax'));
    await expect(definition.getDependencies({ entryPath: 'main.py' }, runtime, context)).rejects.toMatchObject({
      name: 'Build123dKernelError',
      issues: [
        expect.objectContaining({ type: 'compilation', details: { pythonCode: 'PYTHON_TEST', pythonType: 'syntax' } }),
      ],
    });

    context.session.request.mockRejectedValueOnce(workerError('validation'));
    await expect(definition.getParameters({ entryPath: 'main.py' }, runtime, context)).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ type: 'compilation' })],
    });

    context.session.request.mockRejectedValueOnce(workerError('runtime'));
    await expect(
      definition.createGeometry({ entryPath: 'main.py', parameters: {}, options: renderOptions }, runtime, context),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ type: 'runtime' })],
    });
  });

  it('returns structured generic and stale-handle failures', async () => {
    const context = createContext();
    context.session.request.mockRejectedValueOnce('plain failure');
    const parameters = await definition.getParameters({ entryPath: 'main.py' }, runtime, context);
    expect(parameters).toMatchObject({
      success: false,
      issues: [{ message: 'plain failure', location: { fileName: 'main.py' } }],
    });

    context.session.isHandleGenerationValid.mockReturnValue(false);
    await expect(
      definition.meshGeometry?.(
        { nativeHandle: { sessionGeneration: 1, handleId: 'stale' }, options: renderOptions },
        runtime,
        context,
      ),
    ).rejects.toThrow(/stale/);
    await expect(
      definition.exportGeometry(
        { format: 'step', nativeHandle: { sessionGeneration: 1, handleId: 'stale' }, options: {} },
        runtime,
        context,
      ),
    ).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ message: expect.stringContaining('stale') })],
    });
  });

  it('handles mesh/export worker failures and GLB export naming', async () => {
    const context = createContext();
    const handle = { sessionGeneration: 2, handleId: 'shape' };
    context.session.request.mockRejectedValueOnce(new Error('mesh failed'));
    await expect(
      definition.meshGeometry?.({ nativeHandle: handle, options: renderOptions }, runtime, context),
    ).rejects.toThrow(/mesh failed/);

    context.session.request.mockResolvedValueOnce({ artifactPath: '/private/model.glb', byteLength: 3 });
    const exported = await definition.exportGeometry(
      {
        format: 'glb',
        nativeHandle: handle,
        options: { ...renderOptions, coordinateSystem: 'y-up', unit: { length: 'meter' } },
      },
      runtime,
      context,
    );
    expect(exported).toMatchObject({ success: true, data: [{ name: 'model.glb', bytes: new Uint8Array([1, 2, 3]) }] });
    expect(context.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'mesh',
        params: expect.objectContaining({ linearTolerance: 0.05 }),
        signal: runtime.signal,
      }),
    );

    context.session.request.mockRejectedValueOnce(new Error('export failed'));
    await expect(
      definition.exportGeometry({ format: 'step', nativeHandle: handle, options: {} }, runtime, context),
    ).resolves.toMatchObject({ success: false, issues: [expect.objectContaining({ message: 'export failed' })] });
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
      definition.createGeometry({ entryPath: 'main.py', parameters: {}, options: renderOptions }, runtime, context),
    ).resolves.toEqual({ nativeHandle: { sessionGeneration: 2, handleId: 'shape' } });
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
    expect(context.session.observeResidentBytes).toHaveBeenCalledWith(4096);

    // The next build warms from the refreshed candidate set before it executes.
    context.session.request.mockResolvedValueOnce({ handleId: 'again', observedDependencies: [] });
    await definition.createGeometry({ entryPath: 'main.py', parameters: {}, options: renderOptions }, runtime, context);
    expect(context.resident.importEntries).toHaveBeenCalled();

    // C2/EQ14 off arm: no scope, and the worker is asked to build with no compute configuration at all.
    const off = createContext();
    const offRuntime = { ...runtime, compute: { status: 'off' } } as unknown as typeof runtime;
    off.session.request.mockResolvedValueOnce({ handleId: 'plain', observedDependencies: [] });
    await expect(
      definition.createGeometry({ entryPath: 'main.py', parameters: {}, options: renderOptions }, offRuntime, off),
    ).resolves.toEqual({ nativeHandle: { sessionGeneration: 2, handleId: 'plain' } });
    expect(off.session.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: { entryPath: 'main.py', parameters: {} } }),
    );
    expect(off.resident.track).not.toHaveBeenCalled();
    expect(openScope).toHaveBeenCalledTimes(2);
    expect(warm).toHaveBeenCalledOnce();
    openScope.mockRestore();
  });

  it('delegates handle validity/disposal and always removes the mirror', async () => {
    const context = createContext();
    expect(
      definition.isNativeHandleValid?.({ nativeHandle: { sessionGeneration: 2, handleId: 'shape' } }, runtime, context),
    ).toBe(true);
    definition.disposeNativeHandle?.({ nativeHandle: { sessionGeneration: 2, handleId: 'shape' } }, runtime, context);
    expect(context.session.release).toHaveBeenCalledWith('shape', 2);

    context.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.cleanup?.(context)).rejects.toThrow(/cleanup failed/);
    expect(context.mirror.cleanup).toHaveBeenCalled();
  });
});
