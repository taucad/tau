// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload } from '@taucad/geometry-core';
import {
  assertSuccess,
  createTestRuntimeClient,
  extractGltfFromResult,
  getBoundingBoxFromInspect,
  getGeometryStatsFromInspect,
  getInspectReport,
  getSignedVolumeFromGlb,
  validateGlbData,
} from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import type { ParameterManifest } from '@taucad/runtime/parameter';
import { describe, expect, it } from 'vitest';

import { build123d } from '#index.js';

type ResourceManifest = {
  readonly target: string;
  readonly pythonRelativePath: string;
  readonly pythonSha256: string;
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
};

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const targetRoot = resolve(workspaceRoot, `apps/desktop/resources/python/${process.platform}-${process.arch}`);
const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as ResourceManifest;

const runtime = defineRuntime({
  plugins: [
    build123d({
      kernels: {
        default: {
          pythonExecutable: resolve(targetRoot, manifest.pythonRelativePath),
          workerPath: resolve(targetRoot, manifest.workerPath),
          pythonSha256: manifest.pythonSha256,
          workerSha256: manifest.workerSha256,
          supportFiles: manifest.supportFiles.map(({ path, sha256 }) => ({ path: resolve(targetRoot, path), sha256 })),
          requestTimeout: 120_000,
        },
      },
    }),
  ],
});

const modelSource = (metadata: string): string => `from dataclasses import dataclass
from build123d import Axis, Box, Color

@dataclass(frozen=True)
class Params:
    width: float = 40.0
    depth: float = 30.0
    height: float = 20.0
    angle: float = 30.0

__tau__ = {"parameters": ${metadata}}

def main(params: Params):
    result = Box(params.width, params.depth, params.height).rotate(Axis.Z, params.angle)
    result.label = "Housing"
    result.color = Color("royalblue")
    return result
`;
const source = modelSource(
  '{"width": {"minimum": 1.0, "maximum": 200.0}, "angle": {"minimum": -180.0, "maximum": 180.0}}',
);
const declaredSource = modelSource(`{
  "width": {
    "minimum": 1.0,
    "maximum": 200.0,
    "ucumUnit": "mm",
    "quantityKind": "http://qudt.org/vocab/quantitykind/Length",
    "space": "linear"
  },
  "angle": {
    "minimum": -180.0,
    "maximum": 180.0,
    "ucumUnit": "deg",
    "quantityKind": "http://qudt.org/vocab/quantitykind/PlaneAngle",
    "space": "linear"
  }
}`);
const v8Source = readFileSync(
  resolve(workspaceRoot, 'libs/tau-examples/src/kernels/build123d/v8-engine-brep/main.py'),
  'utf8',
);
const assemblySource = `from dataclasses import dataclass
from build123d import Box, Color, Compound
from dimensions import width

@dataclass(frozen=True)
class Params:
    scale: float = 1.0

__tau__ = {"dependencies": ["width.txt"]}

def main(params: Params):
    left = Box(width() * params.scale, 2, 3)
    left.label = "Left"
    left.color = Color("red")
    right = Box(1, 2, 3).translate((10, 0, 0))
    right.label = "Right"
    right.color = Color("blue")
    result = Compound(children=[left, right])
    result.label = "Assembly"
    return result
`;
const dimensionsSource = (expression: string): string => `from pathlib import Path

def width():
    return ${expression}
`;

type GltfJson = {
  readonly nodes: ReadonlyArray<{ readonly mesh?: number }>;
  readonly meshes: ReadonlyArray<{
    readonly primitives: ReadonlyArray<{ readonly mode?: number; readonly indices?: number }>;
  }>;
  readonly accessors: ReadonlyArray<{ readonly count: number }>;
  readonly bufferViews: ReadonlyArray<{ readonly byteOffset?: number; readonly byteLength: number }>;
  readonly extensions: { readonly TAU_cad_topology: { readonly topologyBufferView: number } };
};

const readTopology = (
  bytes: Uint8Array<ArrayBuffer>,
): { readonly json: GltfJson; readonly payload: TauCadTopologyPayload } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson;
  const binaryStart = 20 + jsonLength + 8;
  const topologyView = json.bufferViews[json.extensions.TAU_cad_topology.topologyBufferView]!;
  const start = binaryStart + (topologyView.byteOffset ?? 0);
  const payload = JSON.parse(
    new TextDecoder().decode(bytes.subarray(start, start + topologyView.byteLength)),
  ) as TauCadTopologyPayload;
  return { json, payload };
};

describe('Build123d native kernel', () => {
  it('admits declared units without changing native values or geometry', async () => {
    const previousPath = process.env['PATH'];
    // Only the system directories the sandbox wrapper resolves `which` from: no user or tool PATH.
    process.env['PATH'] = '/usr/bin:/bin';
    const client = createTestRuntimeClient({ runtime, files: { 'main.py': source } });
    const nextManifest = async (): Promise<ParameterManifest> =>
      new Promise((resolve) => {
        client.on('parametersResolved', (result) => {
          if (result.success) {
            resolve(result.data);
          }
        });
      });
    try {
      const baselineParameters = nextManifest();
      const baseline = await client.render({
        source: { path: 'main.py' },
        parameters: { width: 50, angle: 15 },
      });
      const baselineManifest = await baselineParameters;
      expect(baselineManifest.defaults).toEqual({ width: 40, depth: 30, height: 20, angle: 30 });
      expect(baselineManifest.bindings).toEqual({});

      const declaredParameters = nextManifest();
      const rendered = await client.render({
        source: { files: { 'main.py': declaredSource }, entry: 'main.py' },
        parameters: { width: 50, angle: 15 },
      });
      const declared = await declaredParameters;
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native Build123d render was unexpectedly superseded.');
      }
      expect(declared.defaults).toEqual({ width: 40, depth: 30, height: 20, angle: 30 });
      expect(declared.source).toMatchObject({ id: 'build123d', capability: 'json-structure' });
      expect(declared.bindings).toMatchObject({
        '/width': {
          unit: 'mm',
          quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
          space: 'linear',
          constraints: { default: 40, minimum: 1, maximum: 200 },
        },
        '/angle': {
          unit: 'deg',
          quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
          space: 'linear',
          constraints: { default: 30, minimum: -180, maximum: 180 },
        },
      });
      expect(Object.values(declared.provenance)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'unit',
            origin: 'declared',
            producer: 'build123d',
            sourceRevision: declared.source.revision,
          }),
          expect.objectContaining({
            field: 'quantity-kind',
            origin: 'declared',
            producer: 'build123d',
            sourceRevision: declared.source.revision,
          }),
          expect.objectContaining({
            field: 'space',
            origin: 'declared',
            producer: 'build123d',
            sourceRevision: declared.source.revision,
          }),
        ]),
      );

      expect(baseline.superseded).toBe(false);
      if (baseline.superseded) {
        throw new Error('Native Build123d baseline render was unexpectedly superseded.');
      }
      assertSuccess(baseline.geometry);
      assertSuccess(rendered.geometry);
      expect(rendered.geometry.data.format).toBe('gltf');
      if (baseline.geometry.data.format !== 'gltf' || rendered.geometry.data.format !== 'gltf') {
        throw new Error('Expected GLB geometry');
      }
      const glb = rendered.geometry.data.content;
      expect(glb).toEqual(baseline.geometry.data.content);
      validateGlbData(glb);
      expect(await getSignedVolumeFromGlb(glb)).toBeCloseTo(30e-6, 10);
      const { json, payload } = readTopology(glb);
      expect(payload.components).toEqual([
        expect.objectContaining({
          id: 'component:housing',
          name: 'Housing',
          selector: 'node/0',
          color: expect.arrayContaining([expect.any(Number)]),
          faceGroups: expect.any(Array),
          edgeGroups: expect.any(Array),
        }),
      ]);
      expect(
        validateTauCadTopology(payload, {
          nodes: json.nodes.map(({ mesh }) => ({ meshIndex: mesh })),
          meshes: json.meshes.map(({ primitives }) =>
            primitives.map(({ mode = 4, indices }) => ({
              mode,
              indexCount: indices === undefined ? 0 : json.accessors[indices]!.count,
            })),
          ),
        }),
      ).toEqual([]);

      const step = await client.export('step');
      assertSuccess(step);
      expect(Buffer.from(step.data[0]!.bytes).subarray(0, 13).toString()).toBe('ISO-10303-21;');
    } finally {
      process.env['PATH'] = previousPath;
      await client.shutdown();
    }
  }, 180_000);

  it('keeps a warm process across local-module, data-dependency, failure, and recovery edits', async () => {
    const files = {
      'main.py': assemblySource,
      'dimensions.py': dimensionsSource("float(Path(__file__).with_name('width.txt').read_text())"),
      'width.txt': '2',
    };
    const client = createTestRuntimeClient({ runtime, files });
    const render = async (nextFiles: typeof files): Promise<Uint8Array<ArrayBuffer>> => {
      const rendered = await client.render({ source: { files: nextFiles, entry: 'main.py' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native Build123d render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected GLB geometry');
      }
      return glb;
    };

    try {
      const initial = await render(files);
      expect(await getSignedVolumeFromGlb(initial)).toBeCloseTo(18e-9, 14);
      const report = await getInspectReport(initial);
      expect(getGeometryStatsFromInspect(report).meshCount).toBe(2);
      expect(getBoundingBoxFromInspect(report)).toEqual({
        size: [expect.closeTo(11.5e-3, 10), expect.closeTo(0.003, 10), expect.closeTo(0.002, 10)],
        center: [expect.closeTo(4.75e-3, 10), 0, 0],
      });
      const { json, payload } = readTopology(initial);
      expect(payload.components).toEqual([
        expect.objectContaining({
          id: 'component:assembly',
          name: 'Assembly',
          kind: 'assembly',
          childIds: ['component:left', 'component:right'],
        }),
        expect.objectContaining({
          id: 'component:left',
          parentId: 'component:assembly',
          color: [1, 0, 0, 1],
          faceGroups: expect.any(Array),
          edgeGroups: expect.any(Array),
        }),
        expect.objectContaining({
          id: 'component:right',
          parentId: 'component:assembly',
          color: [0, 0, 1, 1],
          faceGroups: expect.any(Array),
          edgeGroups: expect.any(Array),
        }),
      ]);
      expect(
        validateTauCadTopology(payload, {
          nodes: json.nodes.map(({ mesh }) => ({ meshIndex: mesh })),
          meshes: json.meshes.map(({ primitives }) =>
            primitives.map(({ mode = 4, indices }) => ({
              mode,
              indexCount: indices === undefined ? 0 : json.accessors[indices]!.count,
            })),
          ),
        }),
      ).toEqual([]);

      const moduleEdit = await render({
        ...files,
        'dimensions.py': dimensionsSource("float(Path(__file__).with_name('width.txt').read_text()) * 2"),
      });
      expect(await getSignedVolumeFromGlb(moduleEdit)).toBeCloseTo(30e-9, 14);

      const dataEdit = await render({
        ...files,
        'dimensions.py': dimensionsSource("float(Path(__file__).with_name('width.txt').read_text()) * 2"),
        'width.txt': '3',
      });
      expect(await getSignedVolumeFromGlb(dataEdit)).toBeCloseTo(42e-9, 14);

      const failed = await client.render({
        source: {
          files: { ...files, 'dimensions.py': dimensionsSource("(_ for _ in ()).throw(RuntimeError('broken'))") },
          entry: 'main.py',
        },
      });
      expect(failed.superseded).toBe(false);
      if (!failed.superseded) {
        expect(failed.geometry).toEqual(
          expect.objectContaining({
            success: false,
            issues: [
              expect.objectContaining({
                message: 'broken',
                location: expect.objectContaining({ fileName: 'dimensions.py' }),
              }),
            ],
          }),
        );
      }

      const recovered = await render({ ...files, 'width.txt': '3' });
      expect(await getSignedVolumeFromGlb(recovered)).toBeCloseTo(24e-9, 14);
    } finally {
      await client.shutdown();
    }
  }, 180_000);

  it('renders the full Build123d V8 reference through the packaged Python topology path', async () => {
    const previousPath = process.env['PATH'];
    // Only the system directories the sandbox wrapper resolves `which` from: no user or tool PATH.
    process.env['PATH'] = '/usr/bin:/bin';
    const client = createTestRuntimeClient({ runtime, files: { 'main.py': v8Source } });
    try {
      const rendered = await client.render({
        source: { path: 'main.py' },
        renderOptions: { tessellation: { linearTolerance: 0.25, angularTolerance: 0.2 } },
      });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native Build123d V8 render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected GLB geometry');
      }
      validateGlbData(glb);
      const { payload } = readTopology(glb);
      expect(payload.components).toHaveLength(59);
      expect(payload.components.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['Crankshaft', 'Block', 'Piston 8', 'Cylinder Head L', 'Valve Cover R']),
      );
      expect(getBoundingBoxFromInspect(await getInspectReport(glb))).toEqual({
        size: [expect.closeTo(0.574, 10), expect.closeTo(491.61e-3, 10), expect.closeTo(639.22e-3, 10)],
        center: [expect.closeTo(0.253, 10), expect.closeTo(83.805e-3, 10), 0],
      });
      expect(await getSignedVolumeFromGlb(glb)).toBeCloseTo(47.51e-3, 5);
    } finally {
      process.env['PATH'] = previousPath;
      await client.shutdown();
    }
  }, 180_000);
});
/* oxlint-enable typescript/no-unsafe-assignment */
