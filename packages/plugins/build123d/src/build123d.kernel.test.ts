/* oxlint-disable typescript/no-unsafe-assignment -- public test definitions intentionally erase private kernel context. */
// @vitest-environment node
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { build123dKernel } from '#build123d.kernel.js';
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
    isHandleGenerationValid: vi.fn().mockReturnValue(true),
    release: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined),
  },
  observedDependencies: [] as string[],
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
