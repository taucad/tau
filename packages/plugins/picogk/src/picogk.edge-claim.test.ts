// @vitest-environment node
import { createHash } from 'node:crypto';

import type * as NativeProcessCore from '@taucad/native-process-core';

import { gltfEdgeDetection } from '@taucad/middleware';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  createMockRuntime,
  createTestRuntimeClient,
  extractGltfFromResult,
  glbToDocument,
} from '@taucad/runtime-testing';
import { describe, expect, it, vi } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import type * as PicogkSessionModule from '#picogk-session.js';

/* A closed tetrahedron: every dihedral angle is about 70°, so the fallback detector would find all
 * six edges if it ran. Layout: 12 positions, 12 normals, 12 uint32 indices. */
const tetrahedron = (() => {
  const bytes = new Uint8Array(144);
  const view = new DataView(bytes.buffer);
  const third = 1 / Math.sqrt(3);
  const positions = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10];
  const normals = [-third, -third, -third, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
  for (const [index, value] of [...positions, ...normals].entries()) {
    view.setFloat32(index * 4, value, true);
  }
  for (const [index, value] of indices.entries()) {
    view.setUint32(96 + index * 4, value, true);
  }
  return bytes;
})();

const build = {
  artifactPath: '/private/model.tau-mesh',
  byteLength: tetrahedron.byteLength,
  sha256: createHash('sha256').update(tetrahedron).digest('hex'),
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
};

/* The native worker, its workspace mirror and the compute cache are process boundaries; the
 * runtime, the kernel definition and the middleware planner under test are real. */
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

    public async request({ method }: { readonly method: string }): Promise<unknown> {
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
      return build;
    }

    public async readArtifact(): Promise<Uint8Array<ArrayBuffer>> {
      return new Uint8Array(tetrahedron);
    }
  },
}));

const primitiveModeLines = 1;
const kernelOptions = {
  workerExecutable: '/worker',
  workerSha256: 'a'.repeat(64),
  resourceFiles: [{ path: '/resource', sha256: 'b'.repeat(64), label: 'resource' }],
};

const lineModes = async (bytes: Uint8Array<ArrayBuffer>): Promise<number[]> => {
  const document = await glbToDocument(bytes);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives().map((primitive) => primitive.getMode()))
    .filter((mode) => mode === primitiveModeLines);
};

describe('PicoGK native edge claim', () => {
  it('should render with includeEdges without running any fallback edge middleware', async () => {
    const probe = vi.fn();
    const fallbackProbe = defineMiddleware({
      id: 'fallbackEdgeProbe',
      name: 'FallbackEdgeProbe',
      version: '1.0.0',
      content: { views: { 'model/gltf-binary': ['includeEdges'] } },
      async wrapRender(input, handler) {
        probe(input);
        return handler(input);
      },
    });
    const client = createTestRuntimeClient({
      runtime: defineRuntime({
        kernels: [picogkKernel(kernelOptions)],
        middleware: [gltfEdgeDetection(), fallbackProbe()],
      }),
      files: { 'main.cs': 'class Model {}' },
    });
    try {
      const document = client.open({ source: { path: 'main.cs' }, watch: false });
      const view = document.view('model', { content: { includeEdges: true } });
      const outcome = await view.rendering();
      view.close();
      if (outcome.superseded) {
        throw new Error('Unexpected superseded PicoGK render');
      }
      expect(outcome.rendering.success ? [] : outcome.rendering.issues).toEqual([]);
      const bytes = extractGltfFromResult(outcome.rendering);
      if (!bytes) {
        throw new Error('PicoGK render returned no GLB');
      }

      // The planner skips every middleware whose only reason to run is a key the kernel owns.
      expect(probe).not.toHaveBeenCalled();
      // GltfEdgeDetection did not run either: a voxel mesh has no B-rep edges, so none are written.
      expect(await lineModes(bytes)).toEqual([]);

      // The same bytes would gain overlay lines had the fallback detector run, so the check above is not vacuous.
      const detector = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
      const fallback = await detector.wrapRender!(
        { view: 'model', mimeType: 'model/gltf-binary', options: {}, content: { includeEdges: true } },
        async () => ({ success: true, data: { mimeType: 'model/gltf-binary', content: bytes }, issues: [] }),
        createMockRuntime({ options: { thresholdDegrees: 30 } }),
      );
      expect(fallback.success && fallback.data.content instanceof Uint8Array).toBe(true);
      expect(
        await lineModes(fallback.success ? (fallback.data.content as Uint8Array<ArrayBuffer>) : bytes),
      ).not.toEqual([]);
    } finally {
      await client.shutdown();
    }
  });
});
