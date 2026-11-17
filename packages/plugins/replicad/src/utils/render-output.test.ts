// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Solid, cast, getOC, makeBox, makeCylinder } from 'replicad';
import type { AnyShape } from 'replicad';
import type { OpenCascadeInstance, gp_Trsf } from 'replicad-opencascadejs';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';
import type { GeometryReplicad } from '#replicad.types.js';
import { render } from '#utils/render-output.js';
import type { NamedInputShape } from '#utils/render-output.js';
import { createReplicadOccurrenceReader, inspectReplicadShapeIdentity } from '#utils/tessellation-instancing.js';
import type { Meshable } from '#utils/tessellation-instancing.js';

const runtime = () => defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] });
const sphere = `import { makeSphere } from 'replicad'; export default function main() { return makeSphere(1); }`;
const client = createTestRuntimeClient({ runtime: runtime(), files: { 'main.ts': sphere } });

let oc: OpenCascadeInstance;
const owned: Array<{ delete: () => void }> = [];

const keep = <T extends { delete: () => void }>(value: T): T => {
  owned.push(value);
  return value;
};

const asSolid = (shape: AnyShape): Meshable => {
  if (!(shape instanceof Solid)) {
    throw new TypeError(`expected a solid, got ${shape.constructor.name}`);
  }
  return shape;
};

/** The same TShape placed through a raw location, which may mirror or scale (replicad's own transforms copy then). */
const placed = (shape: Meshable, configure: (transformation: gp_Trsf) => void): Meshable => {
  const transformation = new oc.gp_Trsf();
  configure(transformation);
  const location = new oc.TopLoc_Location(transformation);
  try {
    return keep(asSolid(cast(shape.wrapped.Moved(location, false))));
  } finally {
    location.delete();
    transformation.delete();
  }
};

const point = (x: number, y: number, z: number) => keep(new oc.gp_Pnt(x, y, z));
const direction = (x: number, y: number, z: number) => keep(new oc.gp_Dir(x, y, z));

const instancedScene = (): NamedInputShape[] => {
  const box = keep(makeBox([0, 0, 0], [10, 6, 4]));
  return [
    { name: 'box', shape: box },
    { name: 'translated', shape: keep(box.clone().translate([30, 0, 0])) },
    { name: 'rotated', shape: keep(box.clone().rotate(37, [1, 1, 1], [1, 2, 3])) },
    { name: 'cylinder', shape: keep(makeCylinder(3, 8)) },
  ];
};

const meshes = (geometries: ReturnType<typeof render>): GeometryReplicad[] =>
  geometries.filter((geometry): geometry is GeometryReplicad => geometry.format === 'replicad');

beforeAll(async () => {
  // Loads OpenCASCADE into the replicad module the direct calls below use.
  const document = client.open({ source: { path: 'main.ts' }, parameters: {} });
  const view = document.view('model', {});
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('Render was superseded');
  }
  assertRenderingSuccess(outcome.rendering);
  oc = getOC();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const value of owned.splice(0)) {
    value.delete();
  }
});

afterAll(async () => {
  await client.shutdown();
});

describe('tessellation instancing detection', () => {
  it('groups partners without serializing or hashing any BRep', () => {
    const inspect = vi.spyOn(oc.ReplicadShapeIdentity, 'Inspect');
    const prototypeHash = vi.spyOn(oc.ReplicadShapeIdentity, 'PrototypeHash');
    const onRenderMode = vi.fn();

    const geometries = render(instancedScene(), {
      openCascade: oc,
      tessellationInstancing: true,
      collectBrepEdges: true,
      onRenderMode,
    });

    expect(inspect).not.toHaveBeenCalled();
    expect(prototypeHash).not.toHaveBeenCalled();
    expect(onRenderMode).toHaveBeenCalledExactlyOnceWith('mixed');
    expect(meshes(geometries).map((geometry) => geometry.name)).toEqual(['box', 'translated', 'rotated', 'cylinder']);
  });

  it('reads the same partner grouping, orientation and placement as the native inspector', () => {
    const box = keep(makeBox([0, 0, 0], [10, 6, 4]));
    const shapes: Meshable[] = [
      box,
      keep(box.clone().translate([30, 0, 0])),
      keep(box.clone().rotate(37, [1, 1, 1], [1, 2, 3])),
      keep(asSolid(cast(box.wrapped.Reversed()))),
      placed(box, (transformation) => {
        transformation.SetMirror(keep(new oc.gp_Ax2(point(1, 2, 3), direction(0.3, -0.5, 0.8))));
      }),
      placed(box, (transformation) => {
        transformation.SetScale(point(-4, 5, 0.25), 2.5);
      }),
      placed(box, (transformation) => {
        transformation.SetRotation(keep(new oc.gp_Ax1(point(0.1, 0.2, 0.3), direction(1, -2, 0.5))), 0.7);
      }),
      keep(makeCylinder(3, 8)),
      keep(makeCylinder(3, 8)),
    ];

    const read = createReplicadOccurrenceReader(oc);
    const nativeToRead = new Map<string, string>();
    const readToNative = new Map<string, string>();
    for (const shape of shapes) {
      const { prototypeHash, ...native } = inspectReplicadShapeIdentity({ openCascade: oc, shape });
      const occurrence = read(shape);

      expect(prototypeHash).toMatch(/^[\da-f]{64}$/);
      expect({ ...occurrence, partnerKey: undefined }).toEqual({ ...native, partnerKey: undefined });
      for (const [index, value] of native.locationMatrix.entries()) {
        expect(Object.is(occurrence.locationMatrix[index], value)).toBe(true);
      }
      expect(Object.is(occurrence.determinant, native.determinant)).toBe(true);
      // Partner keys differ in form but must name the same partitions: a bijection across all shapes.
      expect(nativeToRead.get(native.partnerKey) ?? occurrence.partnerKey).toBe(occurrence.partnerKey);
      expect(readToNative.get(occurrence.partnerKey) ?? native.partnerKey).toBe(native.partnerKey);
      nativeToRead.set(native.partnerKey, occurrence.partnerKey);
      readToNative.set(occurrence.partnerKey, native.partnerKey);
    }

    // Seven placements of one box plus two separately built cylinders.
    expect(new Set(nativeToRead.values()).size).toBe(3);
  });

  it.each([
    ['partner detection', () => vi.spyOn(oc.ReplicadShapeHasher, 'HashCode')],
    ['prototype meshing', () => vi.spyOn(oc.ReplicadPrototypeMeshExtractor, 'ExtractFaces')],
  ])('surfaces a %s failure instead of silently rendering flat', (_stage, spy) => {
    spy().mockImplementation(() => {
      throw new Error('binding failed');
    });
    const onRenderMode = vi.fn();

    expect(() => render(instancedScene(), { openCascade: oc, tessellationInstancing: true, onRenderMode })).toThrow(
      'binding failed',
    );
    expect(onRenderMode).not.toHaveBeenCalled();
  });
});
