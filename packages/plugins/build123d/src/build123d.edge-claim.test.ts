// @vitest-environment node
import { createHash } from 'node:crypto';

import { Document, NodeIO } from '@gltf-transform/core';
import type * as PythonKernelCore from '@taucad/python-kernel-core';
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

import { build123dKernel } from '#build123d.kernel.js';

const primitiveModeLines = 1;

/* A 10 mm cube as the worker writes it: one surface primitive with a flat-shaded face per side, and
 * one LINES primitive holding its twelve B-rep edges in `node/0/edges` with their `edgeGroups`. */
const corners = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 10, 0],
  [0, 10, 0],
  [0, 0, 10],
  [10, 0, 10],
  [10, 10, 10],
  [0, 10, 10],
] as const;
const faces = [
  { corners: [0, 3, 2, 1], normal: [0, 0, -1] },
  { corners: [4, 5, 6, 7], normal: [0, 0, 1] },
  { corners: [0, 1, 5, 4], normal: [0, -1, 0] },
  { corners: [2, 3, 7, 6], normal: [0, 1, 0] },
  { corners: [1, 2, 6, 5], normal: [1, 0, 0] },
  { corners: [0, 4, 7, 3], normal: [-1, 0, 0] },
] as const;
const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;
const workerLines = edges.flatMap(([from, to]) => [...corners[from], ...corners[to]]);
const workerEdgeGroups = edges.map((_edge, index) => ({
  start: index * 2,
  count: 2,
  edgeId: index + 1,
}));

const cubeGlb = await (async () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const surface = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(faces.flatMap((face) => face.corners.flatMap((corner) => [...corners[corner]]))))
        .setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(faces.flatMap((face) => face.corners.flatMap(() => [...face.normal]))))
        .setBuffer(buffer),
    )
    .setIndices(
      document
        .createAccessor()
        .setType('SCALAR')
        .setArray(
          new Uint32Array(faces.flatMap((_face, index) => [0, 1, 2, 0, 2, 3].map((corner) => index * 4 + corner))),
        )
        .setBuffer(buffer),
    )
    .setExtras({
      tauComponentId: 'component:part',
      tauComponentKind: 'body',
      tauComponentSelector: 'node/0/surface',
    });
  const lines = document
    .createPrimitive()
    .setMode(primitiveModeLines)
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(workerLines)).setBuffer(buffer),
    )
    .setIndices(
      document
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array(workerLines.length / 3).map((_value, index) => index))
        .setBuffer(buffer),
    )
    .setExtras({
      tauComponentId: 'component:part',
      tauComponentKind: 'line',
      tauComponentSelector: 'node/0/edges',
      edgeGroups: workerEdgeGroups,
    });
  const mesh = document.createMesh('Part').addPrimitive(surface).addPrimitive(lines);
  document.createScene().addChild(document.createNode('Part').setMesh(mesh));
  return new NodeIO().writeBinary(document);
})();

const meshRequests: unknown[] = [];
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
};
const kernelOptions = {
  pythonExecutable: '/python',
  workerPath: '/worker.py',
  pythonSha256: 'a'.repeat(64),
  workerSha256: 'b'.repeat(64),
  supportFiles: [
    'native_materials.py',
    'mechanisms.py',
    'tau_kernel/analyzer.py',
    'tau_kernel/glb.py',
    'tau_kernel/model.py',
    'tau_kernel/protocol.py',
  ].map((path) => ({ path: `/${path}`, sha256: 'c'.repeat(64) })),
};

/* The Python process, its workspace mirror and its closure binding are process boundaries; the
 * runtime, the kernel definition and the middleware planner under test are real. */
vi.mock('@taucad/python-kernel-core', async (importOriginal) => ({
  ...(await importOriginal<typeof PythonKernelCore>()),
  bindPythonKernel: vi.fn(async () => ({
    options: {
      pythonSha256: 'a'.repeat(64),
      workerSha256: 'b'.repeat(64),
      supportFiles: [],
    },
  })),
  createPythonWorkspaceMirror: vi.fn(async () => ({
    sync: vi.fn(async () => ['main.py']),
    cleanup: vi.fn(async () => undefined),
  })),
  createPythonSession: vi.fn(() => ({
    generation: 1,
    isHandleGenerationValid: () => true,
    release: vi.fn(),
    cleanup: vi.fn(async () => undefined),
    async request({ method, params }: { readonly method: string; readonly params: unknown }): Promise<unknown> {
      if (method === 'analyze') {
        return {
          defaultParameters: {},
          jsonSchema: { type: 'object', properties: {} },
          declaration: parameterDeclaration,
          resolved: ['main.py'],
          unresolved: [],
        };
      }
      if (method === 'build') {
        return { handleId: 'shape', observedDependencies: ['main.py'] };
      }
      if (method === 'measure') {
        return { diagonal: 17.32 };
      }
      if (method === 'mesh') {
        meshRequests.push(params);
        return {
          artifactPath: '/private/model.glb',
          byteLength: cubeGlb.byteLength,
          sha256: createHash('sha256').update(cubeGlb).digest('hex'),
          triangles: 12,
          vertices: 24,
        };
      }
      throw new Error(`Unexpected Build123d worker method ${method}`);
    },
    async readArtifact(): Promise<Uint8Array<ArrayBuffer>> {
      return new Uint8Array(cubeGlb);
    },
  })),
}));

const lineAttributes = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Array<{ positions: number[]; extras: Record<string, unknown> }>> => {
  const document = await glbToDocument(bytes);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .filter((primitive) => primitive.getMode() === primitiveModeLines)
    .map((primitive) => ({
      positions: [...(primitive.getAttribute('POSITION')?.getArray() ?? [])],
      extras: primitive.getExtras(),
    }));
};

describe('Build123d native edge claim', () => {
  it('should render with includeEdges from its own B-rep lines without running any fallback edge middleware', async () => {
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
        kernels: [build123dKernel({ closure: kernelOptions })],
        middleware: [gltfEdgeDetection(), fallbackProbe()],
      }),
      files: { 'main.py': 'def main(params):\n    return []\n' },
    });
    try {
      const document = client.open({
        source: { path: 'main.py' },
        watch: false,
      });
      const view = document.view('model', { content: { includeEdges: true } });
      const outcome = await view.rendering();
      view.close();
      if (outcome.superseded) {
        throw new Error('Unexpected superseded Build123d render');
      }
      expect(outcome.rendering.success ? [] : outcome.rendering.issues).toEqual([]);
      const bytes = extractGltfFromResult(outcome.rendering);
      if (!bytes) {
        throw new Error('Build123d render returned no GLB');
      }

      // The worker was asked for its own edge lines.
      expect(meshRequests).toEqual([expect.objectContaining({ handleId: 'shape', includeEdges: true })]);
      // The planner skips every middleware whose only reason to run is a key the kernel owns.
      expect(probe).not.toHaveBeenCalled();
      // The delivered lines are exactly the worker's: GltfEdgeDetection added no overlay of its own.
      expect(await lineAttributes(bytes)).toEqual([
        {
          positions: workerLines,
          extras: {
            tauComponentId: 'component:part',
            tauComponentKind: 'line',
            tauComponentSelector: 'node/0/edges',
            edgeGroups: workerEdgeGroups,
          },
        },
      ]);

      // The same bytes would gain overlay lines had the fallback detector run, so the check above is not vacuous.
      const detector = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
      const fallback = await detector.wrapRender!(
        {
          view: 'model',
          mimeType: 'model/gltf-binary',
          options: {},
          content: { includeEdges: true },
        },
        async () => ({
          success: true,
          data: { mimeType: 'model/gltf-binary', content: bytes },
          issues: [],
        }),
        createMockRuntime({ options: { thresholdDegrees: 30 } }),
      );
      expect(fallback.success && fallback.data.content instanceof Uint8Array).toBe(true);
      const overlaid = await lineAttributes(
        fallback.success ? (fallback.data.content as Uint8Array<ArrayBuffer>) : bytes,
      );
      expect(overlaid.length).toBeGreaterThan(1);
    } finally {
      await client.shutdown();
    }
  });
});
