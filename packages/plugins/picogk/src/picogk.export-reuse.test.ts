// @vitest-environment node
import { createHash } from 'node:crypto';

import type * as NativeProcessCore from '@taucad/native-process-core';

import { defineRuntime } from '@taucad/runtime/worker';
import { createTestRuntimeClient, extractGltfFromResult } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import type * as PicogkSessionModule from '#picogk-session.js';

/* A closed tetrahedron at a given scale. Layout: 12 positions, 12 normals, 12 uint32 indices. The worker fake
 * answers an adaptive build with the half-size one, so an export that reused an adaptive mesh shows in its bytes. */
const tetrahedron = (scale: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(144);
  const view = new DataView(bytes.buffer);
  const third = 1 / Math.sqrt(3);
  const positions = [0, 0, 0, scale, 0, 0, 0, scale, 0, 0, 0, scale];
  const normals = [-third, -third, -third, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
  for (const [index, value] of [...positions, ...normals].entries()) {
    view.setFloat32(index * 4, value, true);
  }
  for (const [index, value] of indices.entries()) {
    view.setUint32(96 + index * 4, value, true);
  }
  return bytes;
};
const meshes = { uniform: tetrahedron(10), adaptive: tetrahedron(5) };

const worker = vi.hoisted(() => ({
  // Whether the worker meshes adaptively and echoes the meshing it applied (otherwise it predates adaptive meshing).
  capable: false,
  builds: [] as Array<{ readonly meshing?: { readonly adaptivity: number; readonly relax: boolean } }>,
}));

const buildResult = (
  mesh: keyof typeof meshes,
  meshing?: { readonly adaptivity: number; readonly relax: boolean },
) => ({
  artifactPath: `/private/${mesh}.tau-mesh`,
  byteLength: meshes[mesh].byteLength,
  sha256: createHash('sha256').update(meshes[mesh]).digest('hex'),
  prototypes: [
    {
      id: 'prototype:1',
      kind: 'triangles',
      positionOffset: 0,
      positionCount: 12,
      normalOffset: 48,
      normalCount: 12,
      indexOffset: 96,
      indexCount: 12,
      indexComponentType: 5125,
    },
  ],
  occurrences: [
    {
      id: 'component:picogk-1',
      prototypeId: 'prototype:1',
      name: 'Part',
      color: [0.5, 0.5, 0.5, 1],
      metallic: 0,
      roughness: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ],
  recycleAfterResponse: false,
  timings: {
    compileCacheHit: true,
    sourceRead: 0,
    parse: 0,
    analyze: 0,
    emit: 0,
    libraryInitialize: 0,
    entryPointInvoke: 0,
    meshConstruction: 3,
    meshExtraction: 2,
    normalGeneration: 1,
    artifactWrite: 0,
    unload: 0,
  },
  metrics: { managedHeapBytes: 0, picoGkNativeBytes: 0, processWorkingSetBytes: 0 },
  voxelSize: 0.5,
  ...(meshing ? { meshing } : {}),
});

/* The native worker, its workspace mirror and the compute cache are process boundaries; the runtime, the kernel
 * definition and the export path under test are real. */
vi.mock('@taucad/native-process-core', async (importOriginal) => ({
  ...(await importOriginal<typeof NativeProcessCore>()),
  createWorkspaceMirror: vi.fn(async () => ({
    artifactPath: '/private',
    sync: vi.fn(async () => ['main.cs']),
    cleanup: vi.fn(async () => undefined),
  })),
}));
vi.mock('#compute-worker-transport.js', () => ({
  createComputeWorkerTransport: () => ({
    open: vi.fn(async () => {
      throw new Error('compute cache not under test');
    }),
    dispose: vi.fn(),
  }),
}));
vi.mock('#picogk-session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PicogkSessionModule>()),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- replaces the module's exported class by name.
  PicogkSession: class {
    public readonly recycle = vi.fn(async () => undefined);

    public readonly cleanup = vi.fn(async () => undefined);

    public async request({
      method,
      params,
    }: {
      readonly method: string;
      readonly params?: { readonly meshing?: { readonly adaptivity: number; readonly relax: boolean } };
    }): Promise<unknown> {
      if (method === 'resolve') {
        return { sources: ['main.cs'] };
      }
      if (method === 'analyze') {
        return {
          defaultParameters: {},
          jsonSchema: { type: 'object', properties: {} },
          timings: { cacheHit: false, sourceRead: 0, parse: 0, analyze: 0, emit: 0 },
        };
      }
      worker.builds.push(params?.meshing ? { meshing: params.meshing } : {});
      // A worker that predates adaptive meshing ignores the request and builds the uniform mesh, echoing nothing.
      return worker.capable && params?.meshing ? buildResult('adaptive', params.meshing) : buildResult('uniform');
    }

    public async readArtifact({ artifactPath }: { readonly artifactPath: string }): Promise<Uint8Array<ArrayBuffer>> {
      return new Uint8Array(artifactPath.includes('adaptive') ? meshes.adaptive : meshes.uniform);
    }
  },
}));

const kernelOptions = {
  workerExecutable: '/worker',
  workerSha256: 'a'.repeat(64),
  resourceFiles: [{ path: '/resource', sha256: 'b'.repeat(64), label: 'resource' }],
};

/**
 * Open one document, render its model view, then export it as GLB, as a host does after a preview.
 *
 * @param evaluateOptions - The view's construction options; unset is the Balanced default.
 * @returns The view's GLB and the exported GLB.
 */
const previewThenExport = async (
  evaluateOptions?: Record<string, unknown>,
): Promise<{ view: Uint8Array<ArrayBuffer>; exported: Uint8Array<ArrayBuffer> }> => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [picogkKernel({ closure: kernelOptions })] }),
    files: { 'main.cs': 'class Model {}' },
  });
  try {
    const document = client.open({
      source: { path: 'main.cs' },
      watch: false,
      ...(evaluateOptions ? { evaluateOptions } : {}),
    });
    const outcome = await document.view('model').rendering();
    if (outcome.superseded) {
      throw new Error('Unexpected superseded PicoGK render');
    }
    const view = extractGltfFromResult(outcome.rendering);
    if (!view) {
      throw new Error('PicoGK render returned no GLB');
    }
    const exported = await document.export('glb');
    if (!exported.success) {
      throw new Error(`PicoGK export failed: ${JSON.stringify(exported.issues)}`);
    }
    return { view, exported: exported.files[0].bytes };
  } finally {
    await client.shutdown();
  }
};

/**
 * The GLB a fresh uniform build exports: what every export must match byte for byte.
 *
 * @returns The exported GLB.
 */
const freshUniformExport = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const { exported } = await previewThenExport({ meshAdaptivity: 0 });
  worker.builds.length = 0;
  return exported;
};

describe('PicoGK export after a preview', () => {
  afterEach(() => {
    worker.capable = false;
    worker.builds.length = 0;
  });

  it('reuses the uniform build of a worker without adaptive meshing for a default view: one build', async () => {
    const expected = await freshUniformExport();

    const { view, exported } = await previewThenExport();

    // The view asked for Balanced, the worker built the uniform mesh, and the export took that build.
    expect(worker.builds).toEqual([{ meshing: { adaptivity: 0.25, relax: false } }]);
    expect(exported).toEqual(expected);
    expect(view.byteLength).toBeGreaterThan(0);
  });

  it('builds the uniform mesh again to export an adaptive view of a capable worker', async () => {
    worker.capable = true;
    const expected = await freshUniformExport();

    const { view, exported } = await previewThenExport();

    // The adaptive view never reaches the export: the export builds uniformly and its bytes are the uniform export's.
    expect(worker.builds).toEqual([{ meshing: { adaptivity: 0.25, relax: false } }, {}]);
    expect(exported).toEqual(expected);
    const uniform = await previewThenExport({ meshAdaptivity: 0 });
    expect(view).not.toEqual(uniform.view);
  });

  it('exports an explicit uniform view from its own build', async () => {
    worker.capable = true;

    await previewThenExport({ meshAdaptivity: 0 });

    expect(worker.builds).toEqual([{}]);
  });
});
