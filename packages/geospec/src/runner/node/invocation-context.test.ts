import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it, vi } from 'vitest';
import { GeoSpecModelLoadError } from '#model/index.js';
import {
  createGeoSpecNodeInvocationContext,
  createGeoSpecNodeInvocationContextStats,
} from '#runner/node/invocation-context.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import type { ModelRuntimeClientResult } from '#model/runtime.js';
import type { GeoSpecRuntimeClient } from '#model/types.js';

const createTriangleGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([0, 0, 0, 50, 0, 0, 0, 50, 0]));
  const indices = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint16Array([0, 1, 2]));
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh().addPrimitive(primitive);
  document.createScene().addChild(document.createNode().setMesh(mesh));
  return new WebIO().writeBinary(document);
};

describe('GeoSpec Node invocation context', () => {
  it('should lazily create one default runtime client, reuse it, and terminate it once', async () => {
    const bytes = await createTriangleGlb();
    const runtime = {
      connect: vi.fn(async () => undefined),
      export: vi.fn(async () => ({
        success: true,
        data: { bytes, name: 'main.glb' },
      })),
      terminate: vi.fn(),
    } as unknown as GeoSpecRuntimeClient;
    const stats = createGeoSpecNodeInvocationContextStats();
    const createRuntimeClient = vi.fn(
      async (): Promise<ModelRuntimeClientResult> => ({
        success: true,
        runtime,
      }),
    );
    const context = createGeoSpecNodeInvocationContext({
      projectPath: '/project',
      createRuntimeClient,
      stats,
    });

    expect(createRuntimeClient).not.toHaveBeenCalled();
    await context.modelLoader({ file: 'main.ts', format: 'glb' });
    await context.modelLoader({ file: 'other.ts', format: 'glb' });
    await context.dispose();
    await context.dispose();

    expect(createRuntimeClient).toHaveBeenCalledTimes(1);
    expect(createRuntimeClient).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'default', projectPath: '/project' }),
    );
    expect(stats.runtimeCreations).toEqual({ default: 1 });
    expect(runtime.export).toHaveBeenCalledTimes(2);
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it('should route adapter-backed source loads to a source-adapter runtime key and preserve diagnostics', async () => {
    const diagnostics: GeometryDiagnostic[] = [
      {
        code: 'RUNTIME_UNAVAILABLE',
        severity: 'error',
        message: 'adapter runtime is unavailable in this test.',
        suggestion: 'Check the configured source adapter.',
      },
    ];
    const createRuntimeClient = vi.fn(
      async (): Promise<ModelRuntimeClientResult> => ({
        success: false,
        diagnostics,
      }),
    );
    const context = createGeoSpecNodeInvocationContext({
      projectPath: '/project',
      createRuntimeClient,
      sourceAdapters: [
        {
          id: 'openscad',
          extensions: ['scad'],
          createRuntime: vi.fn(),
        },
      ],
    });

    await expect(context.modelLoader({ file: 'main.scad', format: 'glb' })).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics,
    });
    await expect(context.modelLoader({ file: 'main.scad', format: 'glb' })).rejects.toBeInstanceOf(
      GeoSpecModelLoadError,
    );

    expect(createRuntimeClient).toHaveBeenCalledTimes(1);
    expect(createRuntimeClient).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'source-adapter:openscad', projectPath: '/project', file: 'main.scad' }),
    );
    await context.dispose();
  });

  it('should reuse and terminate one source-adapter runtime client for repeated adapter-backed loads', async () => {
    const bytes = await createTriangleGlb();
    const runtime = {
      connect: vi.fn(async () => undefined),
      export: vi.fn(async () => ({
        success: true,
        data: { bytes, name: 'main.glb' },
      })),
      terminate: vi.fn(),
    } as unknown as GeoSpecRuntimeClient;
    const stats = createGeoSpecNodeInvocationContextStats();
    const createRuntimeClient = vi.fn(
      async (): Promise<ModelRuntimeClientResult> => ({
        success: true,
        runtime,
      }),
    );
    const context = createGeoSpecNodeInvocationContext({
      projectPath: '/project',
      createRuntimeClient,
      stats,
      sourceAdapters: [
        {
          id: 'openscad',
          extensions: ['scad'],
          createRuntime: vi.fn(),
        },
      ],
    });

    await context.modelLoader({ file: 'main.scad', format: 'glb' });
    await context.modelLoader({ file: 'other.scad', format: 'glb' });
    await context.dispose();

    expect(createRuntimeClient).toHaveBeenCalledTimes(1);
    expect(createRuntimeClient).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'source-adapter:openscad', projectPath: '/project' }),
    );
    expect(stats.runtimeCreations).toEqual({
      default: 0,
      'source-adapter:openscad': 1,
    });
    expect(runtime.export).toHaveBeenCalledTimes(2);
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it('should let loadModel report generic source-adapter diagnostics when no adapter is configured', async () => {
    const createRuntimeClient = vi.fn();
    const context = createGeoSpecNodeInvocationContext({
      projectPath: '/project',
      createRuntimeClient,
    });

    await expect(context.modelLoader({ file: 'main.scad', format: 'glb' })).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_RUNTIME_SOURCE_ADAPTER_UNAVAILABLE',
          severity: 'error',
          details: {
            file: 'main.scad',
            extension: 'scad',
          },
        }),
      ],
    });
    expect(createRuntimeClient).not.toHaveBeenCalled();
    await context.dispose();
  });
});
