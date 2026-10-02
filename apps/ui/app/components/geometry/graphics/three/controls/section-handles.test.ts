import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { RenderFrame, SpatialBounds } from '@taucad/spatial';
import type { SectionCut } from '#components/geometry/graphics/section-cuts.js';
import {
  createSectionDragSteps,
  createSectionHandles,
  resolveSectionDragParameter,
  resolveSectionDragPatch,
  snapSectionAngle,
} from '#components/geometry/graphics/three/controls/section-handles.js';

const renderFrame: RenderFrame = { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 0.001 };
const bounds: SpatialBounds = { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] };

const planeCut = (offset: number): SectionCut => ({
  id: 'plane',
  kind: 'plane',
  plane: 'xy',
  offset,
  isFlipped: false,
});
const revolutionCut = (start: number, sweep: number): SectionCut => ({
  id: 'revolution',
  kind: 'revolution',
  axis: 'z',
  origin: [0, 0, 0],
  start,
  sweep,
});

type Resources = Readonly<{
  objects: THREE.Object3D[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}>;

// Guards, rather than `instanceof` inline, which would narrow to the classes' `any` type arguments.
const isMaterial = (value: unknown): value is THREE.Material => value instanceof THREE.Material;
const isGeometry = (value: unknown): value is THREE.BufferGeometry => value instanceof THREE.BufferGeometry;

const collect = (root: THREE.Object3D): Resources => {
  const objects: THREE.Object3D[] = [];
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    objects.push(object);
    if (!('material' in object) || !('geometry' in object)) {
      return;
    }
    const { material, geometry } = object;
    const list: readonly unknown[] = Array.isArray(material) ? material : [material];
    for (const each of list) {
      if (isMaterial(each)) {
        materials.add(each);
      }
    }
    if (isGeometry(geometry)) {
      geometries.add(geometry);
    }
  });
  return { objects, materials: [...materials], geometries: [...geometries] };
};

/** Identity, item by item: deep equality would pass for rebuilt copies. */
const expectSameItems = (after: readonly unknown[], before: readonly unknown[]): void => {
  expect(after).toHaveLength(before.length);
  for (const [index, item] of after.entries()) {
    expect(item).toBe(before[index]);
  }
};

const watchDisposal = ({ materials, geometries }: Resources): (() => number) => {
  let count = 0;
  const countDisposal = (): void => {
    count++;
  };
  for (const resource of [...materials, ...geometries]) {
    resource.addEventListener('dispose', countDisposal);
  }
  return () => count;
};

describe('createSectionHandles', () => {
  it('should keep every handle object, material and geometry while a plane cut is dragged', () => {
    const handles = createSectionHandles({ backend: 'webgl' });
    handles.update({ cuts: [planeCut(0)], selectedId: 'plane', bounds, renderFrame });
    const before = collect(handles.root);
    const [arrow] = handles.handles;
    const versions = before.materials.map((material) => material.version);
    const disposals = watchDisposal(before);

    for (const offset of [0.001, 0.002, 0.013]) {
      handles.update({ cuts: [planeCut(offset)], selectedId: 'plane', bounds, renderFrame });
    }

    const after = collect(handles.root);
    expectSameItems(after.objects, before.objects);
    expectSameItems(after.materials, before.materials);
    expectSameItems(after.geometries, before.geometries);
    expect(handles.handles[0]).toBe(arrow);
    // No material recompiles (a new program) and nothing is disposed (a released program).
    expect(after.materials.map((material) => material.version)).toEqual(versions);
    expect(disposals()).toBe(0);
    // The arrow moved with the cut, in render units.
    expect(arrow?.anchor.z).toBeCloseTo(13, 9);
  });

  it('should keep every handle object while a revolution cut is swept and turned', () => {
    const handles = createSectionHandles({ backend: 'webgpu' });
    handles.update({ cuts: [revolutionCut(30, 90)], selectedId: 'revolution', bounds, renderFrame });
    const before = collect(handles.root);
    const beforeHandles = handles.handles;
    const disposals = watchDisposal(before);

    handles.update({ cuts: [revolutionCut(45, 200)], selectedId: 'revolution', bounds, renderFrame });
    handles.update({ cuts: [revolutionCut(90, 355)], selectedId: 'revolution', bounds, renderFrame });

    expectSameItems(collect(handles.root).objects, before.objects);
    expectSameItems(handles.handles, beforeHandles);
    expect(disposals()).toBe(0);
  });

  it('should rebuild a cut on a selection change without disposing shared grip geometry', () => {
    const handles = createSectionHandles({ backend: 'webgl' });
    handles.update({ cuts: [planeCut(0)], selectedId: 'plane', bounds, renderFrame });
    const selected = collect(handles.root);
    const owned = new Set([...selected.materials, ...selected.geometries]);
    const disposed: unknown[] = [];
    for (const resource of owned) {
      resource.addEventListener('dispose', () => {
        disposed.push(resource);
      });
    }

    handles.update({ cuts: [planeCut(0)], selectedId: undefined, bounds, renderFrame });

    // The arrow's grip geometry is shared by every drawing; the drawing disposes only what it allocated.
    const arrowHead = selected.geometries.find((geometry) => geometry instanceof THREE.ConeGeometry);
    expect(arrowHead).toBeDefined();
    expect(disposed).not.toContain(arrowHead);
    expect(disposed.length).toBeGreaterThan(0);
    // An unselected plane has no handle: its area covers the model.
    expect(handles.handles).toHaveLength(0);
  });

  it('should give an unselected revolution only its fan, which selects it', () => {
    const handles = createSectionHandles({ backend: 'webgl' });
    handles.update({ cuts: [revolutionCut(0, 90)], selectedId: undefined, bounds, renderFrame });

    expect(handles.handles.map((handle) => handle.target.kind)).toEqual(['select']);
  });

  it('should scale grips to pixels and skip layout while nothing changed', () => {
    const handles = createSectionHandles({ backend: 'webgl' });
    handles.update({ cuts: [planeCut(0)], selectedId: 'plane', bounds, renderFrame });
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 10_000);
    camera.position.set(0, -1000, 0);
    camera.lookAt(0, 0, 0);
    const updateMatrixWorld = vi.spyOn(handles.root, 'updateMatrixWorld');

    handles.layout(camera, 600);
    const laidOut = updateMatrixWorld.mock.calls.length;
    handles.layout(camera, 600);

    expect(laidOut).toBeGreaterThan(0);
    expect(updateMatrixWorld).toHaveBeenCalledTimes(laidOut);
    const arrow = handles.handles[0]?.hits[0]?.parent;
    const expected = (2 * 1000 * Math.tan((25 * Math.PI) / 180)) / 600;
    expect(arrow?.scale.x).toBeCloseTo(expected, 6);

    camera.position.set(0, -2000, 0);
    handles.layout(camera, 600);

    expect(arrow?.scale.x).toBeCloseTo(expected * 2, 6);

    // Each input the layout reads on its own: the projection, then the viewport height.
    camera.fov = 25;
    camera.updateProjectionMatrix();
    handles.layout(camera, 600);

    const narrowed = (2 * 2000 * Math.tan((12.5 * Math.PI) / 180)) / 600;
    expect(arrow?.scale.x).toBeCloseTo(narrowed, 6);

    handles.layout(camera, 300);

    expect(arrow?.scale.x).toBeCloseTo(narrowed * 2, 6);
    const laidOutAgain = updateMatrixWorld.mock.calls.length;
    handles.layout(camera, 300);
    expect(updateMatrixWorld).toHaveBeenCalledTimes(laidOutAgain);
  });

  it('should raise a cut outline while its chip is hovered and fully while it is dragged', () => {
    const handles = createSectionHandles({ backend: 'webgl' });
    handles.update({ cuts: [planeCut(0)], selectedId: 'plane', bounds, renderFrame });
    const outline = collect(handles.root).materials.find((material) => material.type === 'LineMaterial');

    handles.paint({ hoveredCutId: undefined });
    expect(outline?.opacity).toBe(0.22);
    handles.paint({ hoveredCutId: 'plane' });
    expect(outline?.opacity).toBe(0.85);
    handles.paint({ active: handles.handles[0], hoveredCutId: undefined });
    expect(outline?.opacity).toBe(1);
  });
});

describe('section drag math', () => {
  it('should move a plane cut along its axis by the dragged distance in metres, to the millimetre', () => {
    expect(
      resolveSectionDragPatch({
        kind: 'plane',
        cut: planeCut(0.01),
        startParameter: 2,
        parameter: 5,
        metersPerRenderUnit: 0.001,
      }),
    ).toEqual({ offset: 0.013 });
    expect(
      resolveSectionDragPatch({
        kind: 'plane',
        cut: planeCut(0),
        startParameter: 0,
        parameter: 1.2345,
        metersPerRenderUnit: 0.001,
      }),
    ).toEqual({ offset: 0.001 });
  });

  it('should keep a dragged plane within the bounds centre ± 2 × radius along its axis, and open while unknown', () => {
    const drag = (
      parameter: number,
      modelBounds?: Parameters<typeof resolveSectionDragPatch>[0]['bounds'],
    ): ReturnType<typeof resolveSectionDragPatch> =>
      resolveSectionDragPatch({
        kind: 'plane',
        cut: { id: 'plane', kind: 'plane', plane: 'xz', offset: 0.25, isFlipped: false },
        startParameter: 0,
        parameter,
        metersPerRenderUnit: 0.001,
        bounds: modelBounds,
      });
    // The XZ plane's axis is Y, so the range is 0.25 ± 0.25 whatever the centre's X and Z.
    const known = { center: [9, 0.25, -9], radius: 0.125 } as const;

    expect([drag(500, known), drag(-500, known), drag(100, known)]).toEqual([
      { offset: 0.5 },
      { offset: 0 },
      { offset: 0.35 },
    ]);
    expect([drag(500, { ...known, radius: 0 }), drag(500)]).toEqual([{ offset: 0.75 }, { offset: 0.75 }]);
  });

  it('should read a plane drag as the axis point nearest the pointer ray', () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const rayAt = (z: number): THREE.Ray => new THREE.Ray(new THREE.Vector3(0, -100, z), new THREE.Vector3(0, 1, 0));
    const at = (z: number): number | undefined =>
      resolveSectionDragParameter({ ray: rayAt(z), cut: planeCut(0), anchor, renderFrame });

    const startParameter = at(2) ?? Number.NaN;
    const parameter = at(5) ?? Number.NaN;

    expect(startParameter).toBeCloseTo(2, 9);
    expect(
      resolveSectionDragPatch({
        kind: 'plane',
        cut: planeCut(0.01),
        startParameter,
        parameter,
        metersPerRenderUnit: 0.001,
      }),
    ).toEqual({ offset: 0.013 });
    // A ray along the axis has no nearest point to follow.
    expect(
      resolveSectionDragParameter({
        ray: new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1)),
        cut: planeCut(0),
        anchor,
        renderFrame,
      }),
    ).toBeUndefined();
  });

  it('should read a revolution drag as the angle about its axis on the fan plane', () => {
    const angle = resolveSectionDragParameter({
      ray: new THREE.Ray(new THREE.Vector3(0, 5, 20), new THREE.Vector3(0, 0, -1)),
      cut: revolutionCut(0, 90),
      anchor: new THREE.Vector3(3, 0, 10),
      renderFrame,
    });

    // Angle zero about Z is +X, and +Y is a quarter turn counter-clockwise.
    expect(angle).toBeCloseTo(90, 9);
  });

  it.each([
    // The cut runs from 30° to 120°.
    { start: 30, parameter: 60, patch: { start: 60, sweep: 60 } },
    { start: 30, parameter: 130, patch: { start: 130, sweep: 350 } },
    // Just short of the end or just past it, the knob stops at the narrowest or the widest cutaway.
    { start: 30, parameter: 118, patch: { start: 115, sweep: 5 } },
    { start: 30, parameter: 121, patch: { start: 125, sweep: 355 } },
    // From 4° to 94°, the narrowest start is 89°, which would snap to 90°.
    { start: 4, parameter: 89.5, patch: { start: 89, sweep: 5 } },
  ])(
    'should keep the end fixed when the start knob is dragged to $parameter degrees',
    ({ start, parameter, patch }) => {
      expect(
        resolveSectionDragPatch({
          kind: 'sweep-start',
          cut: revolutionCut(start, 90),
          startParameter: start,
          parameter,
          metersPerRenderUnit: 0.001,
        }),
      ).toEqual(patch);
    },
  );

  it.each([
    [200, 170],
    [32, 5],
    // Within 2° of the start, the narrowest cutaway, never a snap to the widest.
    [31.9, 5],
    [30.5, 5],
    [25, 355],
    [29, 355],
  ])('should set the sweep, clamped, when the end knob is dragged to %d degrees', (parameter, sweep) => {
    expect(
      resolveSectionDragPatch({
        kind: 'sweep-end',
        cut: revolutionCut(30, 90),
        startParameter: 120,
        parameter,
        metersPerRenderUnit: 0.001,
      }),
    ).toEqual({ sweep });
  });

  it('should turn the whole cut by the angle the band is dragged', () => {
    expect(
      resolveSectionDragPatch({
        kind: 'sweep-band',
        cut: revolutionCut(350, 90),
        startParameter: 100,
        parameter: 125,
        metersPerRenderUnit: 0.001,
      }),
    ).toEqual({ start: 15 });
  });

  it('should snap angles to 15 degrees within 2 and otherwise to whole degrees', () => {
    expect([snapSectionAngle(44.2), snapSectionAngle(46.5), snapSectionAngle(47.6)]).toEqual([45, 45, 48]);
  });
});

describe('createSectionDragSteps', () => {
  let frames: Map<number, FrameRequestCallback>;

  const runFrame = (): void => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) {
      callback(0);
    }
  };

  beforeEach(() => {
    frames = new Map();
    let nextId = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      nextId++;
      frames.set(nextId, callback);
      return nextId;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should apply a frame's first step at once", () => {
    const steps = createSectionDragSteps();
    const applied: string[] = [];

    steps.schedule(() => applied.push('first'));

    expect(applied).toEqual(['first']);
  });

  it('should apply only the latest waiting step on the frame', () => {
    const steps = createSectionDragSteps();
    const applied: string[] = [];

    steps.schedule(() => applied.push('first'));
    steps.schedule(() => applied.push('second'));
    steps.schedule(() => applied.push('third'));
    expect(applied).toEqual(['first']);
    runFrame();

    expect(applied).toEqual(['first', 'third']);
  });

  it('should apply the waiting step at once on release, and not again on the frame', () => {
    const steps = createSectionDragSteps();
    const applied: string[] = [];

    steps.schedule(() => applied.push('first'));
    steps.schedule(() => applied.push('release'));
    steps.flush();
    expect(applied).toEqual(['first', 'release']);
    runFrame();

    expect(applied).toEqual(['first', 'release']);
  });

  it('should drop the waiting step when the cut changes', () => {
    const steps = createSectionDragSteps();
    const applied: string[] = [];

    steps.schedule(() => applied.push('first'));
    steps.schedule(() => applied.push('stale'));
    steps.cancel();
    runFrame();

    expect(applied).toEqual(['first']);
  });
});
