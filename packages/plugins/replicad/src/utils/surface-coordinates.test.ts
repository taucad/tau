/* oxlint-disable eslint/new-cap -- OCCT methods retain their native C++ names. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { draw, drawCircle, getOC, makeBox, makeCylinder, makeEllipsoid, makeSphere, setOC } from 'replicad';
import type { AnyShape, Sketch } from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';
import type { GeometryReplicad } from '#replicad.types.js';
import {
  addSurfaceCoordinates,
  nativeSurfaceCoordinates,
  surfaceCoordinatesInJavaScript,
} from '#utils/surface-coordinates.js';
import { extractPrototypeFaces } from '#utils/tessellation-instancing.js';
import type { Meshable } from '#utils/tessellation-instancing.js';

const runtime = () => defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] });
const sphere = `import { makeSphere } from 'replicad'; export default function main() { return makeSphere(1); }`;
const client = createTestRuntimeClient({ runtime: runtime(), files: { 'main.ts': sphere } });

/* eslint-disable @typescript-eslint/naming-convention -- glTF extension name */
const brushed = { extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } } };
/* eslint-enable @typescript-eslint/naming-convention -- end of glTF extension names */

type NativeOc = Parameters<typeof nativeSurfaceCoordinates>[0];

let oc: OpenCascadeInstance;
const owned: Array<{ delete: () => void }> = [];

const keep = <T extends { delete: () => void }>(value: T): T => {
  owned.push(value);
  return value;
};

const meshable = (shape: AnyShape): Meshable => keep(shape) as unknown as Meshable;

/** The copper lampshade's shade: a revolved arc profile, shelled with both openings removed (poles and seams). */
const lampshade = (): Meshable =>
  meshable(
    draw([0, 0])
      .lineTo([140, 0])
      .threePointsArcTo([20, 145], [112, 94.25])
      .lineTo([0, 145])
      .close()
      .sketchOnPlane('XZ')
      .revolve()
      .shell(-1.2, (finder) =>
        finder.either([(face) => face.inPlane('XY', 0), (face) => face.inPlane('XY', 145)]),
      ) as AnyShape,
  );

/** Planes, cylinders, a sphere's poles, a torus, an ellipsoid, a fillet's blend surfaces and a lofted B-spline. */
const mixedSurfaces = (): Meshable[] => [
  meshable(makeBox([0, 0, 0], [10, 6, 4]).fillet(1)),
  meshable(makeCylinder(3, 8).translate([20, 0, 0])),
  meshable(makeSphere(4).translate([0, 20, 0])),
  meshable(drawCircle(1.5).translate([6, 0]).sketchOnPlane('XZ').revolve().translate([20, 20, 0]) as AnyShape),
  meshable(makeEllipsoid(6, 4, 3).translate([-20, 0, 0])),
  meshable(
    (drawCircle(4).sketchOnPlane('XY') as Sketch).loftWith([
      drawCircle(2).sketchOnPlane('XY', 6) as Sketch,
      drawCircle(3.5).sketchOnPlane('XY', 12) as Sketch,
    ]) as AnyShape,
  ),
];

/** A placed copy of a fillet box, which instancing meshes unplaced (tangents brought back through its location). */
const placedPrototype = (): Meshable =>
  meshable(makeBox([0, 0, 0], [10, 6, 4]).fillet(1.5).rotate(37, [1, 2, 3], [1, 1, 1]).translate([30, -5, 7]));

const flatMesh = (shape: Meshable, tolerance = 0.05): GeometryReplicad['faces'] =>
  shape.mesh({ tolerance, angularTolerance: 0.2 });

const prototypeMesh = (shape: Meshable): GeometryReplicad['faces'] =>
  extractPrototypeFaces({ openCascade: oc, shape, tessellation: { linearTolerance: 0.05, angularTolerance: 12 } });

/** Every element of both arrays, compared with `Object.is` (so -0 and +0, and each NaN, count). */
const differences = (left: ArrayLike<number>, right: ArrayLike<number>): number[] => {
  const indices: number[] = [];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (!Object.is(left[index], right[index])) {
      indices.push(index);
    }
  }
  return indices;
};

const expectSameCoordinates = (shape: Meshable, mesh: GeometryReplicad['faces'], prototype: boolean): void => {
  const javascript = surfaceCoordinatesInJavaScript(oc, { shape, normals: mesh.normals, prototype });
  const native = nativeSurfaceCoordinates(oc as NativeOc, { shape, normals: mesh.normals, prototype });

  expect(javascript.texCoords.length).toBe((mesh.vertices.length / 3) * 2);
  expect(native.texCoords).toHaveLength(javascript.texCoords.length);
  expect(native.tangents).toHaveLength(javascript.tangents.length);
  expect(differences(native.texCoords, javascript.texCoords)).toEqual([]);
  expect(differences(native.tangents, javascript.tangents)).toEqual([]);
};

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

// The lampshade's shell takes a few seconds on a loaded runner: its two tests get 30 s.
describe('native surface coordinates', () => {
  it('is in this OpenCascade build', () => {
    expect(typeof Reflect.get(oc, 'ReplicadSurfaceCoordinates')).toBe('function');
  });

  it('returns the same doubles as the JavaScript loop on the lampshade', () => {
    const shape = lampshade();
    expectSameCoordinates(shape, flatMesh(shape, 0.5), false);
  }, 30_000);

  it('returns the same doubles as the JavaScript loop on planes, quadrics, blends and B-splines', () => {
    for (const shape of mixedSurfaces()) {
      expectSameCoordinates(shape, flatMesh(shape), false);
    }
  });

  it('returns the same doubles as the JavaScript loop for a placed prototype and a pole-only normal', () => {
    const shape = placedPrototype();
    expectSameCoordinates(shape, prototypeMesh(shape), true);
    const pole = meshable(makeSphere(2).rotate(90, [0, 0, 0], [1, 0, 0]));
    expectSameCoordinates(pole, prototypeMesh(pole), true);
  });

  it('reads NaN past the end of the normals, as the JavaScript loop does', () => {
    const shape = meshable(makeCylinder(3, 8));
    const mesh = flatMesh(shape);
    expectSameCoordinates(shape, { ...mesh, normals: mesh.normals.slice(0, -7) }, false);
  });

  it('adds the native coordinates to a mesh whose material needs them', () => {
    const shape = lampshade();
    const mesh = flatMesh(shape, 0.5);
    const extract = vi.spyOn((oc as NativeOc).ReplicadSurfaceCoordinates, 'Extract');
    const expected = surfaceCoordinatesInJavaScript(oc, { shape, normals: mesh.normals, prototype: false });

    addSurfaceCoordinates(shape, mesh, { material: brushed });

    expect(extract).toHaveBeenCalledOnce();
    expect(differences(mesh.texCoords!, expected.texCoords)).toEqual([]);
    expect(differences(mesh.tangents!, expected.tangents)).toEqual([]);
  }, 30_000);

  it('falls back to the JavaScript loop on a build without the native extractor', () => {
    const shape = meshable(makeCylinder(3, 8));
    const mesh = flatMesh(shape);
    const expected = surfaceCoordinatesInJavaScript(oc, { shape, normals: mesh.normals, prototype: false });
    // An older build: the same instance without the binding.
    const older = new Proxy(oc, {
      get: (target, property) =>
        property === 'ReplicadSurfaceCoordinates' ? undefined : (Reflect.get(target, property) as unknown),
    });
    setOC(older);
    try {
      addSurfaceCoordinates(shape, mesh, { material: brushed });
    } finally {
      setOC(oc);
    }

    expect(mesh.texCoords).toEqual(expected.texCoords);
    expect(mesh.tangents).toEqual(expected.tangents);
  });

  it('throws when a triangulated face has no UV nodes, freeing the native result', () => {
    const shape = meshable(makeCylinder(3, 8));
    const mesh = flatMesh(shape);
    const extractor = (oc as NativeOc).ReplicadSurfaceCoordinates;
    const free = vi.fn();
    vi.spyOn(extractor, 'Extract').mockReturnValue({
      getStatus: () => 1,
      getTexCoordsPtr: () => 0,
      getTexCoordsSize: () => 0,
      getTangentsPtr: () => 0,
      getTangentsSize: () => 0,
      delete: free,
    });

    expect(() => {
      addSurfaceCoordinates(shape, mesh, { material: brushed });
    }).toThrow('Replicad material requires native surface UV coordinates.');
    expect(free).toHaveBeenCalledOnce();
    expect(mesh.texCoords).toBeUndefined();
  });
});
