// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRuntimeParameterAgentClient } from '@taucad/agent-tools/runtime';
import { validateTauCadTopology } from '@taucad/geometry-core';
import { evaluatePose } from '@taucad/kinematics';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import {
  createTestRuntimeClient,
  extractGltfFromResult,
  getBoundingBoxFromInspect,
  getGeometryStatsFromInspect,
  getInspectReport,
  glbToDocument,
  getSignedVolumeFromGlb,
  validateGlbData,
} from '@taucad/runtime-testing';
import { readParameterRecord } from '@taucad/parameters';
import { loadParameterSnapshot, commitParameterChange } from '@taucad/parameters/authority';
import type { ParameterAuthority } from '@taucad/parameters/authority';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { parameterSetMachine } from '@taucad/parameters/set-machine';
import { defineRuntime } from '@taucad/runtime/worker';
import { asKnownArtifact } from '@taucad/runtime';
import { installFetchTripwire } from '@taucad/runtime-testing/preparation';
import { beforeAll, describe, expect, it } from 'vitest';

import { prepareFromSeed, seedPresent } from '#build123d-closure.fixture.js';
import { build123d, build123dOptionsFromClosure } from '#index.js';
import type { ParameterSetActors } from '@taucad/parameters/set-machine';

// The kernels run from a closure already on disk: no request may leave this file (charter D27 tripwire).
beforeAll(() => installFetchTripwire());

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The closure `tau prepare build123d` installs, prepared from the payload seed (`pnpm nx run build123d:seed`).
const receipt = seedPresent ? await prepareFromSeed() : undefined;

const runtime = defineRuntime({
  plugins:
    receipt === undefined
      ? []
      : [
          build123d({
            kernels: { default: { closure: build123dOptionsFromClosure(receipt), requestTimeout: 120_000 } },
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
const planetarySource = readFileSync(
  resolve(workspaceRoot, 'libs/tau-examples/src/kernels/build123d/planetary-gear-system/main.py'),
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

// Column-major point application; expected landmarks below are authored geometry, not joint frames.
const transformPoint = (matrix: readonly number[], point: readonly number[]): number[] =>
  [0, 1, 2].map(
    (axis) =>
      matrix[axis]! * point[0]! + matrix[axis + 4]! * point[1]! + matrix[axis + 8]! * point[2]! + matrix[axis + 12]!,
  );

describe.runIf(seedPresent)('Build123d native kernel', () => {
  it('should preserve independently derived nested box corners in GLB and STEP-reimported GLB', async () => {
    const client = createTestRuntimeClient({
      runtime,
      files: {
        'main.py': `from dataclasses import dataclass
from build123d import Box, Compound, Location

@dataclass(frozen=True)
class Params:
    width: float = 12.0

def main(params):
    leaf = Box(params.width, 18, 24).located(Location((3, 4, 5), (0, 0, 90)))
    module = Compound(children=[leaf]).located(Location((48, -12, 7), (0, 90, 0)))
    return Compound(children=[module]).located(Location((-31, 9, 17), (90, 0, 0)))
`,
      },
    });
    const document = client.open({ source: { path: 'main.py' } });
    // Rz90/local, then Ry90/module, then Rx90/root give (z+22, 5-y, x+9) in native mm.
    const corners = [-6, 6].flatMap((x) =>
      [-9, 9].flatMap((y) => [-12, 12].map((z) => [(z + 22) / 1000, (x + 9) / 1000, (y - 5) / 1000])),
    );
    const assertCorners = async (bytes: Uint8Array<ArrayBuffer>) => {
      const reopened = await glbToDocument(bytes);
      const seenModes = new Set<number>();
      for (const node of reopened.getRoot().listNodes()) {
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
          seenModes.add(primitive.getMode());
          const positions = primitive.getAttribute('POSITION')!;
          const seenCorners = new Set<number>();
          for (let vertex = 0; vertex < positions.getCount(); vertex += 1) {
            const point = transformPoint(node.getWorldMatrix(), positions.getElement(vertex, []));
            const distances = corners.map((corner) => Math.hypot(...point.map((value, axis) => value - corner[axis]!)));
            const nearest = Math.min(...distances);
            expect(nearest, JSON.stringify({ point, corners })).toBeLessThan(1e-8);
            seenCorners.add(distances.indexOf(nearest));
          }
          expect(seenCorners.size).toBe(8);
        }
      }
      expect(seenModes).toEqual(new Set([4, 1]));
    };
    try {
      const exported = await document.export('glb');
      assert.ok(exported.success);
      await assertCorners(Uint8Array.from(exported.files[0].bytes));
      const step = await document.export('step');
      assert.ok(step.success);
      const restored = client.open({
        source: {
          entry: 'restored.py',
          files: {
            'model.step': Uint8Array.from(step.files[0].bytes),
            'restored.py': `from dataclasses import dataclass
from pathlib import Path
from build123d import Location, import_step

@dataclass(frozen=True)
class Params:
    offset: float = 0.0

__tau__ = {"dependencies": ["model.step"]}

def main(params):
    return import_step(Path(__file__).with_name("model.step")).moved(Location((params.offset, 0, 0)))
`,
          },
        },
      });
      try {
        const restoredGlb = await restored.export('glb');
        assert.ok(restoredGlb.success);
        await assertCorners(Uint8Array.from(restoredGlb.files[0].bytes));
      } finally {
        restored.close();
      }
    } finally {
      document.close();
      await client.shutdown();
    }
  }, 180_000);

  it.each([0, 30])(
    'should keep exported planetary bore axes on their pins from authored input %s°',
    async (inputAngle) => {
      const client = createTestRuntimeClient({
        runtime,
        files: { 'main.py': planetarySource },
      });
      const document = client.open({
        source: { path: 'main.py' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Native Python parameter names are the public model contract.
        parameters: { input_angle: inputAngle },
      });
      try {
        const exported = await document.export('glb');
        assert.ok(exported.success);
        const bytes = Uint8Array.from(exported.files[0].bytes);
        const { json, payload } = readTopology(bytes);
        expect(payload.components.filter(({ kind }) => kind === 'part')).toHaveLength(34);
        expect(payload.components.filter(({ kind }) => kind === 'assembly')).toHaveLength(5);
        expect(payload.mechanismDiagnostics ?? []).toEqual([]);
        expect(payload.mechanismIntent?.connections.length).toBeGreaterThanOrEqual(5);
        expect(
          payload.mechanism?.couplings
            ?.map((coupling) => ('ratio' in coupling ? coupling.ratio : 0))
            .toSorted((left, right) => left - right),
        ).toEqual([-0.75, -0.75, -0.75, 0.25]);
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
        const reopened = await glbToDocument(bytes);
        const { mechanism } = payload;
        assert.ok(mechanism);
        const driver = Object.entries(mechanism.joints).find(([, joint]) => joint.name === 'sun')?.[0];
        assert.ok(driver);
        for (const angle of [0, 61.21, -84.18, -720, 1440]) {
          const outcome = evaluatePose({
            mechanism,
            coordinates: { [driver]: angle },
          });
          assert.equal(outcome.status, 'posed');
          for (let planet = 1; planet <= 3; planet += 1) {
            const orbit = (((planet - 1) * 120 + (inputAngle + angle) / 4) * Math.PI) / 180;
            const expected = [0.048 * Math.cos(orbit), 0.007, -0.048 * Math.sin(orbit)];
            const centers = ['gear', 'pin'].map((role) => {
              const id = `occurrence:path/0/2/${planet + 1}/${role === 'gear' ? 0 : 1}`;
              const component = payload.components.find((candidate) => candidate.id === id);
              assert.ok(component?.primitiveRefs);
              const linkId = Object.entries(mechanism.links).find(([, body]) => body.components.includes(id))?.[0];
              assert.ok(linkId);
              const delta = outcome.pose.linkTransforms[linkId];
              assert.ok(delta);
              const minimum = [Infinity, Infinity, Infinity];
              const maximum = [-Infinity, -Infinity, -Infinity];
              for (const reference of component.primitiveRefs) {
                const node = reopened.getRoot().listNodes()[reference.nodeIndex]!;
                const primitive = node.getMesh()!.listPrimitives()[reference.primitiveIndex]!;
                if (primitive.getMode() !== 4) {
                  continue;
                }
                const positions = primitive.getAttribute('POSITION')!;
                for (let vertex = 0; vertex < positions.getCount(); vertex += 1) {
                  const point = transformPoint(
                    delta,
                    transformPoint(node.getWorldMatrix(), positions.getElement(vertex, [])),
                  );
                  for (let axis = 0; axis < 3; axis += 1) {
                    minimum[axis] = Math.min(minimum[axis]!, point[axis]!);
                    maximum[axis] = Math.max(maximum[axis]!, point[axis]!);
                  }
                }
              }
              // This 24-tooth gear and axisymmetric pin are centrally symmetric about their shared bore midpoint.
              const center = minimum.map((value, axis) => (value + maximum[axis]!) / 2);
              const error = Math.hypot(...center.map((value, axis) => value - expected[axis]!));
              expect(error, JSON.stringify({ inputAngle, angle, id, center, expected })).toBeLessThan(1e-7);
              return center;
            });
            expect(Math.hypot(...centers[0]!.map((value, axis) => value - centers[1]![axis]!))).toBeLessThan(1e-7);
          }
        }
      } finally {
        document.close();
        await client.shutdown();
      }
    },
    180_000,
  );

  it('should round-trip all 34 native planetary STEP solids and their placements', async () => {
    const client = createTestRuntimeClient({
      runtime,
      files: { 'main.py': planetarySource },
    });
    const document = client.open({ source: { path: 'main.py' } });
    try {
      const step = await document.export('step');
      assert.ok(step.success);
      const restored = client.open({
        source: {
          entry: 'main.py',
          files: {
            'model.step': Uint8Array.from(step.files[0].bytes),
            'planetary.py': planetarySource,
            'main.py': `from dataclasses import dataclass
from math import isclose
from pathlib import Path
from build123d import Location, import_step
from planetary import main as original_model, Params as PlanetParams

@dataclass(frozen=True)
class Params:
    bounds_tolerance: float = 1e-5

__tau__ = {"dependencies": ["model.step"]}

def main(params):
    assembly = import_step(Path(__file__).with_name("model.step"))
    if len(assembly.solids()) != 34:
        raise ValueError("STEP round-trip must preserve exactly 34 native solids")
    original = original_model(PlanetParams())
    def leaves(model):
        return {tuple(part.label.replace(" ", "_") for part in node.path[1:]): node
                for node in model.descendants if not node.children}
    expected, actual = leaves(original), leaves(assembly)
    if expected.keys() != actual.keys() or len(actual) != 34:
        raise ValueError("STEP must preserve every named occurrence path")
    for path, before in expected.items():
        after = actual[path]
        if not isclose(before.volume, after.volume, rel_tol=1e-8, abs_tol=1e-6):
            raise ValueError(f"STEP changed native leaf volume: {path}")
        for row in range(1, 4):
            for column in range(1, 5):
                left = before.global_location.wrapped.Transformation().Value(row, column)
                right = after.global_location.wrapped.Transformation().Value(row, column)
                if not isclose(left, right, rel_tol=1e-9, abs_tol=1e-7):
                    raise ValueError(f"STEP changed occurrence placement: {path}")
        def bounds(shape):
            world = Location()
            for ancestor in shape.path:
                world = world * ancestor.location
            box = shape.located(world).bounding_box()
            return (*box.min, *box.max)
        if any(abs(left - right) > params.bounds_tolerance for left, right in zip(bounds(before), bounds(after), strict=True)):
            raise ValueError(f"STEP changed world-space native bounds: {path}")
    return assembly
`,
          },
        },
      });
      try {
        const outcome = await restored.view('model').rendering();
        expect(outcome.superseded).toBe(false);
        if (outcome.superseded) {
          throw new Error('STEP reimport was superseded');
        }
        assert.ok(outcome.rendering.success, outcome.rendering.success ? undefined : JSON.stringify(outcome.rendering));
        const restoredBytes = extractGltfFromResult(outcome.rendering);
        assert.ok(restoredBytes);
        expect(readTopology(restoredBytes).payload.components.filter(({ kind }) => kind === 'part')).toHaveLength(34);
      } finally {
        restored.close();
      }
    } finally {
      document.close();
      await client.shutdown();
    }
  }, 180_000);

  it('reopens exported native assembly intent and invalidates an imported part on an image-only edit', async () => {
    const red = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8zwACTGCSAQANHQEDgslx/wAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const blue = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNkYPjPwMDAxAAGAAsfAQMU4wsAAAAAAElFTkSuQmCC',
        'base64',
      ),
    );
    const files = {
      'main.py': `from dataclasses import dataclass
from build123d import Axis, Box, Compound, RevoluteJoint, RigidJoint
from reusable import textured_part

@dataclass(frozen=True)
class Params:
    size: float = 10.0

def main(params):
    base = Box(params.size, params.size, 2)
    rotor = textured_part(params.size)
    RevoluteJoint("shaft", base, Axis.Z, angle_reference=(1, 1, 0))
    RigidJoint("mount", rotor)
    base.joints["shaft"].connect_to(rotor.joints["mount"], angle=22.5)
    return Compound(children=[base, rotor], label="Module")

def motion(model):
    base, rotor = model.children
    joint = base.joints["shaft"]
    return {"ground": base,
            "animations": [{"id": "turn", "duration": 1, "keyframes": [
                {"time": 0, "coordinates": {(joint, "angle"): 22.5}},
                {"time": 1, "coordinates": {(joint, "angle"): 112.5}}]}]}
`,
      'reusable.py': `from pathlib import Path
from build123d import Box
from bd_materials import FinishedMaterial, metals
from threejs_materials import PbrProperties, PbrMaps, PbrValues

__tau__ = {"dependencies": ["finish.png"]}

def textured_part(size):
    result = Box(size, 2, 2)
    result.label = "Reusable rotor"
    result.material = FinishedMaterial(metals.aluminum().material, pbr=PbrProperties(
        "finish", "Finish", "test", "", "CC0", values=PbrValues(roughness=0.4),
        maps=PbrMaps(color="finish.png"), maps_dir=Path(__file__).parent))
    return result
`,
      'finish.png': red,
    };
    const client = createTestRuntimeClient({ runtime, files });
    const exportAssembly = async (image: Uint8Array<ArrayBuffer>) => {
      const document = client.open({ source: { files: { ...files, 'finish.png': image }, entry: 'main.py' } });
      try {
        const exported = await document.export('glb');
        assert.ok(exported.success);
        const bytes = Uint8Array.from(exported.files[0].bytes);
        const reopened = await glbToDocument(bytes);
        const payload = reopened.getRoot().getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload();
        expect(payload).toMatchObject({
          mechanismIntent: { schemaVersion: 1, ground: 'occurrence:path/0/0', connections: [expect.any(Object)] },
          mechanism: { animations: [{ id: 'turn' }] },
        });
        const textures = reopened.getRoot().listTextures();
        expect(textures).toHaveLength(1);
        expect(textures[0]!.getImage()).toEqual(image);
        expect(
          reopened
            .getRoot()
            .listMaterials()
            .some((material) => material.getBaseColorTexture() !== null),
        ).toBe(true);
        expect(
          reopened
            .getRoot()
            .listMeshes()
            .flatMap((mesh) => mesh.listPrimitives())
            .some((primitive) => primitive.getAttribute('TEXCOORD_0') !== null),
        ).toBe(true);
        return { bytes, payload };
      } finally {
        document.close();
      }
    };
    try {
      const initial = await exportAssembly(red);
      const edited = await exportAssembly(blue);
      expect(edited.bytes).not.toEqual(initial.bytes);
      expect(edited.payload?.['mechanismIntent']).toEqual(initial.payload?.['mechanismIntent']);
      expect(edited.payload?.['mechanism']).toEqual(initial.payload?.['mechanism']);
      expect(await getSignedVolumeFromGlb(edited.bytes)).toBeCloseTo(await getSignedVolumeFromGlb(initial.bytes), 12);
    } finally {
      await client.shutdown();
    }
  }, 180_000);

  it('admits declared units without changing native values or geometry', async () => {
    const previousPath = process.env['PATH'];
    // Only the system directories the sandbox wrapper resolves `which` from: no user or tool PATH.
    process.env['PATH'] = '/usr/bin:/bin';
    const client = createTestRuntimeClient({ runtime, files: { 'main.py': source } });
    try {
      const baselineDescription = await client.describe({ source: { path: 'main.py' } });
      assert.ok(baselineDescription.success);
      const baselineManifest = baselineDescription.parameters;
      const baselineDocument = client.open({ source: { path: 'main.py' }, parameters: { width: 50, angle: 15 } });
      const baselineOutcome = await baselineDocument.view('model').rendering();
      expect(baselineOutcome.superseded).toBe(false);
      if (baselineOutcome.superseded) {
        throw new Error('Native Build123d baseline render was unexpectedly superseded.');
      }
      const baseline = baselineOutcome.rendering;
      expect(baselineManifest.defaults).toEqual({ width: 40, depth: 30, height: 20, angle: 30 });
      expect(Object.keys(baselineManifest.bindings).sort()).toEqual(['/angle', '/depth', '/height', '/width']);
      for (const binding of Object.values(baselineManifest.bindings)) {
        expect(binding).not.toHaveProperty('unit');
      }

      const declaredSourceInput = { files: { 'main.py': declaredSource } };
      const declaredDescription = await client.describe({ source: declaredSourceInput });
      assert.ok(declaredDescription.success);
      const declared = declaredDescription.parameters;
      const declaredDocument = client.open({ source: declaredSourceInput, parameters: { width: 50, angle: 15 } });
      const renderedOutcome = await declaredDocument.view('model').rendering();
      expect(renderedOutcome.superseded).toBe(false);
      if (renderedOutcome.superseded) {
        throw new Error('Native Build123d render was unexpectedly superseded.');
      }
      const rendered = renderedOutcome.rendering;
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

      assert.ok(baseline.success);
      assert.ok(rendered.success);
      const baselineArtifact = asKnownArtifact(baseline.artifact);
      const renderedArtifact = asKnownArtifact(rendered.artifact);
      if (baselineArtifact?.mimeType !== 'model/gltf-binary' || renderedArtifact?.mimeType !== 'model/gltf-binary') {
        throw new Error('Expected GLB geometry');
      }
      const glb = renderedArtifact.content;
      expect(glb).toEqual(baselineArtifact.content);
      validateGlbData(glb);
      expect(await getSignedVolumeFromGlb(glb)).toBeCloseTo(30e-6, 10);
      const { json, payload } = readTopology(glb);
      expect(payload.components).toEqual([
        expect.objectContaining({
          id: 'occurrence:path/0',
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

      const step = await declaredDocument.export('step');
      assert.ok(step.success);
      expect(Buffer.from(step.files[0].bytes).subarray(0, 13).toString()).toBe('ISO-10303-21;');
      baselineDocument.close();
      declaredDocument.close();
    } finally {
      process.env['PATH'] = previousPath;
      await client.shutdown();
    }
  }, 180_000);

  it('preserves real geometry through an admitted source-unit record', async () => {
    const client = createTestRuntimeClient({ runtime, files: { 'main.py': declaredSource } });
    try {
      const baselineDescription = await client.describe({ source: { path: 'main.py' } });
      assert.ok(baselineDescription.success);
      const admitted = baselineDescription.parameters;
      const baselineDocument = client.open({ source: { path: 'main.py' }, parameters: { width: 50, angle: 15 } });
      const baselineOutcome = await baselineDocument.view('model').rendering();
      expect(baselineOutcome.superseded).toBe(false);
      if (baselineOutcome.superseded) {
        throw new Error('Build123d baseline render was unexpectedly superseded');
      }
      const baseline = baselineOutcome.rendering;
      const width = admitted.bindings['/width'];
      expect(width?.sourceUnitCapability).toBe('change-source-unit:preserve-size:v1');
      if (!width) {
        throw new Error('Expected admitted width binding');
      }
      type ByteState = Awaited<ReturnType<ParameterAuthority['read']>>;
      let recordBytes: ByteState = null;
      const sourceBytes = encoder.encode(declaredSource);
      const sameBytes = (left: ByteState | string, right: ByteState | string): boolean => {
        if (left === null || right === null) {
          return left === right;
        }
        const leftBytes = typeof left === 'string' ? encoder.encode(left) : left;
        const rightBytes = typeof right === 'string' ? encoder.encode(right) : right;
        return (
          leftBytes.byteLength === rightBytes.byteLength &&
          leftBytes.every((value, index) => value === rightBytes[index])
        );
      };
      const authority: ParameterAuthority = {
        path: () => '.tau/parameters/main.py.json',
        read: async () => recordBytes?.slice() ?? null,
        writeChecked: async (input) => {
          const sourcePrecondition = input.preconditions.find(({ path }) => path === 'main.py');
          if (sourcePrecondition !== undefined && !sameBytes(sourceBytes, sourcePrecondition.expected)) {
            return { status: 'conflict', conflicts: [{ path: 'main.py', actual: Uint8Array.from(sourceBytes) }] };
          }
          if (
            !sameBytes(
              recordBytes,
              input.preconditions.find(({ path }) => path === '.tau/parameters/main.py.json')?.expected ?? null,
            )
          ) {
            return {
              status: 'conflict',
              conflicts: [
                {
                  path: '.tau/parameters/main.py.json',
                  actual: recordBytes === null ? null : Uint8Array.from(recordBytes),
                },
              ],
            };
          }
          const status = sameBytes(recordBytes, input.data) ? 'unchanged' : 'applied';
          recordBytes = typeof input.data === 'string' ? encoder.encode(input.data) : Uint8Array.from(input.data);
          return { status, content: Uint8Array.from(recordBytes) };
        },
      };
      const target = { authority: 'memory', root: '/project', entry: 'main.py' };
      const actor = createActor(
        parameterSetMachine.provide({
          actors: {
            loadParameterSet: createAsyncLogic({
              run: async ({ signal }) =>
                loadParameterSnapshot({ target, authority, manifest: async () => admitted, signal }),
            }),
            commitParameterSet: createAsyncLogic({
              run: async ({ input: change, signal }) => commitParameterChange({ change, authority, signal }),
            }),
          } satisfies Partial<ParameterSetActors>,
        }),
        { input: { target } },
      );
      actor.start();
      const agent = createRuntimeParameterAgentClient({
        parameterActorFor: async () => actor,
        mapRuntimeError: (error) => ({ success: false, errorCode: 'UNKNOWN', message: String(error) }),
      });
      const resolved = await agent.getParameters({ targetFile: 'main.py' }, { signal: AbortSignal.timeout(30_000) });
      if (!resolved.success || resolved.status !== 'resolved' || resolved.current === undefined) {
        throw new Error('Expected the agent to resolve Build123d parameters');
      }
      const sourceUnitOperation = {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        pointer: '/width',
        unit: 'cm',
        producerCapability: {
          producer: 'build123d',
          sourceRevision: admitted.source.revision,
          capability: 'change-source-unit:preserve-size:v1',
        },
        dependencies: admitted.identity.sourceFiles,
      } as const;
      const cancelledProposal = await agent.applyParameterOperation(
        {
          action: 'propose',
          targetFile: 'main.py',
          requestId: 'build123d-agent:cancel',
          expected: resolved.current.identity,
          pressure: 'final',
          operation: sourceUnitOperation,
        },
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!cancelledProposal.success || cancelledProposal.outcome.status !== 'confirmation-required') {
        throw new Error('Expected a cancellable source-unit proposal');
      }
      await expect(
        agent.applyParameterOperation(
          {
            action: 'cancel',
            targetFile: 'main.py',
            requestId: 'build123d-agent:cancel',
          },
          { signal: AbortSignal.timeout(30_000) },
        ),
      ).resolves.toMatchObject({ success: true, outcome: { status: 'cancelled-before-apply' } });
      const proposal = await agent.applyParameterOperation(
        {
          action: 'propose',
          targetFile: 'main.py',
          requestId: 'build123d-agent:confirm',
          expected: resolved.current.identity,
          pressure: 'final',
          operation: sourceUnitOperation,
        },
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!proposal.success || proposal.outcome.status !== 'confirmation-required') {
        throw new Error('Expected a source-unit confirmation plan');
      }
      await expect(
        agent.applyParameterOperation(
          {
            action: 'confirm',
            targetFile: 'main.py',
            requestId: 'build123d-agent:confirm',
            planFingerprint: proposal.outcome.planFingerprint,
          },
          { signal: AbortSignal.timeout(30_000) },
        ),
      ).resolves.toMatchObject({ success: true, outcome: { status: 'committed', write: 'applied' } });
      const committedBytes = await authority.read(target, new AbortController().signal);
      if (committedBytes === null) {
        throw new Error('Expected a committed parameter record');
      }
      const sourceUnitRecord = decoder.decode(committedBytes);
      const decoded = readParameterRecord(committedBytes);
      if (decoded.status !== 'current') {
        throw new Error('Expected a current parameter record');
      }
      // The record carries only the authored claim; the producer to convert back for is the live manifest's.
      expect(decoded.record.groups['default']).toEqual({
        values: { width: 4 },
        units: { '/width': 'cm' },
        sourceUnits: { '/width': 'cm' },
      });
      const convertedDocument = client.open({
        source: {
          files: {
            'main.py': declaredSource,
            '.tau/parameters/main.py.json': sourceUnitRecord,
          },
          entry: 'main.py',
        },
        // A caller's number is in the producer's declared unit; a value in another unit is unit-bearing text.
        parameters: { width: '5 cm', angle: 15 },
      });
      const convertedOutcome = await convertedDocument.view('model').rendering();
      expect(convertedOutcome.superseded).toBe(false);
      if (convertedOutcome.superseded) {
        throw new Error('Build123d source-unit render was unexpectedly superseded');
      }
      const converted = convertedOutcome.rendering;
      assert.ok(baseline.success);
      assert.ok(converted.success);
      const baselineArtifact = asKnownArtifact(baseline.artifact);
      const convertedArtifact = asKnownArtifact(converted.artifact);
      if (baselineArtifact?.mimeType !== 'model/gltf-binary' || convertedArtifact?.mimeType !== 'model/gltf-binary') {
        throw new Error('Expected GLB geometry');
      }
      expect(convertedArtifact.content).toEqual(baselineArtifact.content);
      expect(await getSignedVolumeFromGlb(convertedArtifact.content)).toBeCloseTo(30e-6, 10);
      baselineDocument.close();
      convertedDocument.close();
      actor.send({ type: 'close' });
      await waitFor(actor, (snapshot) => snapshot.status === 'done');
    } finally {
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
      const document = client.open({ source: { files: nextFiles, entry: 'main.py' } });
      try {
        const outcome = await document.view('model').rendering();
        expect(outcome.superseded).toBe(false);
        if (outcome.superseded) {
          throw new Error('Native Build123d render was unexpectedly superseded.');
        }
        const rendered = outcome.rendering;
        assert.ok(rendered.success);
        const glb = extractGltfFromResult(rendered);
        if (!glb) {
          throw new Error('Expected GLB geometry');
        }
        return glb;
      } finally {
        document.close();
      }
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
          id: 'occurrence:path/0',
          name: 'Assembly',
          kind: 'assembly',
          childIds: ['occurrence:path/0/0', 'occurrence:path/0/1'],
        }),
        expect.objectContaining({
          id: 'occurrence:path/0/0',
          parentId: 'occurrence:path/0',
          color: [1, 0, 0, 1],
          faceGroups: expect.any(Array),
          edgeGroups: expect.any(Array),
        }),
        expect.objectContaining({
          id: 'occurrence:path/0/1',
          parentId: 'occurrence:path/0',
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

      const failedDocument = client.open({
        source: {
          files: { ...files, 'dimensions.py': dimensionsSource("(_ for _ in ()).throw(RuntimeError('broken'))") },
          entry: 'main.py',
        },
      });
      const failedOutcome = await failedDocument.view('model').rendering();
      expect(failedOutcome.superseded).toBe(false);
      if (!failedOutcome.superseded) {
        expect(failedOutcome.rendering).toEqual(
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
      failedDocument.close();

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
      const document = client.open({ source: { path: 'main.py' } });
      const outcome = await document
        .view('model', {
          options: { tessellation: { linearTolerance: 0.25, angularTolerance: 20 } },
        })
        .rendering();
      expect(outcome.superseded).toBe(false);
      if (outcome.superseded) {
        throw new Error('Native Build123d V8 render was unexpectedly superseded.');
      }
      const rendered = outcome.rendering;
      assert.ok(rendered.success);
      const glb = extractGltfFromResult(rendered);
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
      document.close();
    } finally {
      process.env['PATH'] = previousPath;
      await client.shutdown();
    }
  }, 180_000);
});
/* oxlint-enable typescript/no-unsafe-assignment */
