// @vitest-environment node
/* oxlint-disable max-lines -- one case per family of the library's exports */
/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Box, Pos), as in build123d. */
/**
 * The whole runtime surface of `@classcad/smlibwasm`, called directly. Every export must be named
 * by a case's `covers`, so a library upgrade that adds an export fails here until it is exercised.
 * The kernel suite covers the same library through Tau's runtime.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import * as smlib from '@classcad/smlibwasm';
import type { Face, Part, Shell, Sketch } from '@classcad/smlibwasm';

vi.setConfig({ testTimeout: 30_000 });

type Export = keyof typeof smlib;
type ApiCase = { name: string; covers: readonly Export[]; run: () => void };

const directory = mkdtempSync(join(tmpdir(), 'smlibwasm-api-'));
const file = (name: string): string => join(directory, name);
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Equal within a relative tolerance (absolute below magnitude 1). */
const near = (actual: number, expected: number, tolerance = 1e-6): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));
};

const s = smlib;
/** 20 × 10 × 5 mm, centred on the origin: volume 1000 mm³. */
const box = (): Part => s.Box(20, 10, 5);
/** A 4 × 4 bicubic grid of points with a bump in the middle. */
const grid = (): Array<Array<[number, number, number]>> =>
  [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j): [number, number, number] => [i * 10, j * 10, i % 3 && j % 3 ? 3 : 0]));
const sheetOf = (sketch: Sketch): Shell => sketch.faces()[0]!.toShell();
const asPart = (shape: unknown): Part => {
  expect(shape).toBeInstanceOf(s.Part);
  return shape as Part;
};
const asShell = (shape: unknown): Shell => {
  expect(shape).toBeInstanceOf(s.Shell);
  return shape as Shell;
};

const cases: readonly ApiCase[] = [
  {
    name: 'version and tolerances',
    covers: ['version', 'TOLERANCE', 'ACCURACY'],
    run() {
      expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(s.TOLERANCE).toBeGreaterThan(0);
      expect(s.ACCURACY).toBeGreaterThan(0);
    },
  },
  {
    name: 'vectors, axes, planes and locations',
    covers: ['Vector', 'Axis', 'X', 'Y', 'Z', 'Plane', 'Location', 'Pos', 'Rot', 'Locations'],
    run() {
      const vector = new s.Vector(3, 4, 0);
      near(vector.length, 5);
      near(vector.add(new s.Vector(1, 0, 0)).x, 4);
      for (const axis of [s.X, s.Y, s.Z]) {
        expect(axis).toBeInstanceOf(s.Axis);
      }
      expect(s.Plane.XY).toBeInstanceOf(s.Plane);
      expect(s.Pos(1, 2, 3)).toBeInstanceOf(s.Location);
      near(
        s
          .Pos(10, 0, 0)
          .mul(s.Rot(0, 0, 90))
          .mul(box())
          .bbox().center.x,
        10,
      );
      expect(new s.Locations(s.Pos(0, 0, 0), s.Pos(5, 0, 0)).points).toHaveLength(2);
    },
  },
  {
    name: 'location patterns',
    covers: ['GridLocations', 'PolarLocations', 'HexLocations'],
    run() {
      expect(s.GridLocations(10, 10, 3, 2)).toHaveLength(6);
      expect(s.PolarLocations(20, 8)).toHaveLength(8);
      expect(s.HexLocations(5, 2, 2)).toHaveLength(4);
    },
  },
  {
    name: 'alignment',
    covers: ['Align'],
    run() {
      near(s.Box(10, 10, 10, { align: [s.Align.MIN, s.Align.MIN, s.Align.MIN] }).bbox().min.x, 0);
    },
  },
  {
    name: 'primitive parts and holes',
    covers: [
      'Box',
      'Cylinder',
      'Cone',
      'Sphere',
      'Torus',
      'Wedge',
      'Pyramid',
      'AnnularSector',
      'Hole',
      'CounterBoreHole',
      'CounterSinkHole',
      'Part',
    ],
    run() {
      near(box().volume, 1000);
      near(s.Cylinder(1, 1).volume, Math.PI, 1e-4);
      near(s.Sphere(1).volume, (4 / 3) * Math.PI, 1e-4);
      for (const part of [
        s.Cone(5, 2, 10),
        s.Torus(10, 2),
        s.Wedge(10, 10, 10, 5),
        s.Pyramid(10, 10, 10),
        s.AnnularSector(5, 10, 3, 90),
      ]) {
        expect(part).toBeInstanceOf(s.Part);
        expect(part.volume).toBeGreaterThan(0);
      }
      const plate = s.Box(40, 40, 10);
      for (const hole of [s.Hole(2, 10), s.CounterBoreHole(2, 4, 2, 10), s.CounterSinkHole(2, 4, 10)]) {
        expect(plate.cut(hole).volume).toBeLessThan(plate.volume);
      }
    },
  },
  {
    name: 'booleans',
    covers: ['fuse', 'cut', 'intersect', 'xor', 'merge'],
    run() {
      const a = s.Box(10, 10, 10);
      const b = s.Pos(5, 0, 0).mul(s.Box(10, 10, 10));
      near(s.fuse(a, b).volume, 1500, 1e-4);
      near(s.cut(a, b).volume, 500, 1e-4);
      near(s.intersect(a, b).volume, 500, 1e-4);
      near(s.xor(s.Rectangle(10, 10), s.Pos(5, 0, 0).mul(s.Rectangle(10, 10))).area, 100, 1e-4);
      near(s.merge(a, s.Pos(20, 0, 0).mul(s.Box(10, 10, 10))).volume, 2000, 1e-4);
    },
  },
  {
    name: 'topology and selection',
    covers: ['Shape', 'ShapeList', 'Vertex', 'Edge', 'Wire', 'Face', 'Shell'],
    run() {
      const part = box();
      expect(part).toBeInstanceOf(s.Shape);
      expect(part.faces()).toBeInstanceOf(s.ShapeList);
      expect(part.faces()).toHaveLength(6);
      expect(part.edges()).toHaveLength(12);
      expect(part.vertices()).toHaveLength(8);
      expect(part.vertices()[0]).toBeInstanceOf(s.Vertex);
      expect(part.edges()[0]).toBeInstanceOf(s.Edge);
      expect(part.faces()[0]).toBeInstanceOf(s.Face);
      expect(part.wires()[0]).toBeInstanceOf(s.Wire);
      expect(part.faces()[0]!.toShell()).toBeInstanceOf(s.Shell);
      expect(part.edges().parallelTo(s.Z)).toHaveLength(4);
      near(part.faces().sortBy(s.Z).at(-1)!.center().z, 2.5);
    },
  },
  {
    name: 'measurement',
    covers: ['BoundBox', 'MassProperties', 'SectionProperties', 'ClosestPoints', 'Problem', 'Hit'],
    run() {
      const part = box();
      const bounds = part.bbox();
      expect(bounds).toBeInstanceOf(s.BoundBox);
      near(bounds.max.x - bounds.min.x, 20);
      const mass = part.massProperties(2);
      expect(mass).toBeInstanceOf(s.MassProperties);
      near(mass.mass, 2000, 1e-4);
      const section = s.Rectangle(10, 20).sectionProperties();
      expect(section).toBeInstanceOf(s.SectionProperties);
      near(section.area, 200, 1e-4);
      const closest = part.closestPoints(s.Pos(50, 0, 0).mul(box()));
      expect(closest).toBeInstanceOf(s.ClosestPoints);
      near(closest.distance, 30, 1e-4);
      expect(part.check()).toEqual([]);
      const sliver = s.Box(10, 10, 10).fuse(s.Pos(5 + 1e-5, 0, 0).mul(s.Box(10, 10, 10)));
      expect(sliver.check(2).every((problem) => problem instanceof s.Problem)).toBe(true);
      const [hit] = part.raycast([-50, 0, 0], [1, 0, 0]);
      expect(hit).toBeInstanceOf(s.Hit);
      near(hit!.point.x, -10);
    },
  },
  {
    name: 'curves',
    covers: [
      'Line',
      'PolarLine',
      'Polyline',
      'CenterArc',
      'ThreePointArc',
      'RadiusArc',
      'SagittaArc',
      'TangentArc',
      'EllipticalArc',
      'ParabolicArc',
      'HyperbolicArc',
      'ConicArc',
      'Spline',
      'Bezier',
      'Helix',
      'Spiral',
      'FilletPolyline',
      'fitCurve',
      'makeCompatible',
    ],
    run() {
      near(s.Line([0, 0, 0], [10, 0, 0]).length, 10);
      near(s.PolarLine([0, 0, 0], 10, 90).length, 10);
      near(s.Polyline([0, 0], [10, 0], [10, 10]).length, 20);
      near(s.CenterArc([0, 0, 0], 10, 0, 180).length, 10 * Math.PI, 1e-4);
      for (const curve of [
        s.ThreePointArc([0, 0], [5, 5], [10, 0]),
        s.RadiusArc([0, 0], [10, 0], 10),
        s.SagittaArc([0, 0], [10, 0], 2),
        s.TangentArc([0, 0], [10, 0], [0, 1]),
        s.EllipticalArc([0, 0], 10, 5, 0, 90),
        s.ParabolicArc([0, 0], 2, -5, 5),
        s.HyperbolicArc([0, 0], 5, 3, -1, 1),
        s.ConicArc([0, 0], [5, 5], [10, 0]),
        s.Spline([0, 0], [5, 5], [10, 0]),
        s.Bezier([0, 0], [5, 10], [10, 0]),
        s.Helix(2, 10, 5),
        s.Spiral(1, 10, 3),
        s.FilletPolyline([0, 0], [10, 0], [10, 10], { radius: 2 }),
        s.fitCurve([
          [0, 0, 0],
          [3, 2, 0],
          [6, 1, 0],
          [10, 4, 0],
        ]),
      ]) {
        expect(curve.length).toBeGreaterThan(0);
      }
      expect(
        s.makeCompatible(s.Spline([0, 0], [5, 5], [10, 0]), s.Spline([0, 1], [3, 4], [7, 3], [10, 1])),
      ).toHaveLength(2);
    },
  },
  {
    name: 'curve and surface geometry',
    covers: ['Nurbs', 'NurbsSurface', 'Curvature', 'Continuity'],
    run() {
      expect(s.CenterArc([0, 0, 0], 10, 0, 90).nurbs()).toBeInstanceOf(s.Nurbs);
      expect(s.Box(1, 1, 1).faces()[0]!.nurbs()).toBeInstanceOf(s.NurbsSurface);
      const curvature = s.Sphere(5).faces()[0]!.curvatureAt();
      expect(curvature).toBeInstanceOf(s.Curvature);
      expect(s.Polyline([0, 0], [10, 0], [10, 10]).continuity()).toBeInstanceOf(s.Continuity);
    },
  },
  {
    name: 'sketches, profiles and text',
    covers: [
      'Sketch',
      'Rectangle',
      'RoundedRectangle',
      'Circle',
      'Ellipse',
      'Polygon',
      'RegularPolygon',
      'Triangle',
      'Trapezoid',
      'Slot',
      'ArcSlot',
      'Stroke',
      'Hull',
      'makeFace',
      'Text',
      'Profile',
    ],
    run() {
      near(s.Rectangle(10, 20).area, 200);
      near(s.Circle(1).area, Math.PI, 1e-4);
      for (const sketch of [
        s.RoundedRectangle(10, 20, 2),
        s.Ellipse(10, 5),
        s.Polygon([0, 0], [10, 0], [5, 8]),
        s.RegularPolygon(5, 6),
        s.Triangle(10, 8),
        s.Trapezoid(10, 5, 60),
        s.Slot(20, 5),
        s.ArcSlot(20, 4, 90),
        s.Stroke(s.Line([0, 0], [10, 0]), 2),
        s.Hull(s.Circle(2), s.Pos(10, 0, 0).mul(s.Circle(3))),
        s.makeFace(s.Polyline([0, 0], [10, 0], [10, 10], { close: true })),
        s.Text('Tau', 10),
        new s.Profile().forward(10).turn(90).forward(5).close(),
      ]) {
        expect(sketch).toBeInstanceOf(s.Sketch);
        expect(sketch.area).toBeGreaterThan(0);
      }
    },
  },
  {
    name: 'fonts',
    covers: ['DEFAULT_FONT', 'Font', 'FontError', 'loadFont'],
    run() {
      expect(s.DEFAULT_FONT.byteLength).toBeGreaterThan(0);
      const font = s.loadFont();
      expect(font).toBeInstanceOf(s.Font);
      expect(font.glyphIndex('A')).not.toBeNull();
      expect(() => new s.Font(new Uint8Array([1, 2, 3]))).toThrow(s.FontError);
    },
  },
  {
    name: 'feature operations',
    covers: [
      'extrude',
      'revolve',
      'loft',
      'sweep',
      'swing',
      'fillet',
      'chamfer',
      'shell',
      'offset',
      'mirror',
      'split',
      'section',
      'thicken',
      'scale',
    ],
    run() {
      const profile = s.Pos(10, 0, 0).mul(s.Rot(90, 0, 0).mul(s.Rectangle(2, 2)));
      near(s.extrude(s.Rectangle(10, 10), 5).volume, 500, 1e-4);
      near(s.revolve(profile, s.Axis.Z).volume, 2 * Math.PI * 10 * 4, 1e-3);
      expect(s.loft([s.Rectangle(10, 10), s.Pos(0, 0, 10).mul(s.Circle(3))]).volume).toBeGreaterThan(0);
      near(s.sweep(s.Rot(0, 90, 0).mul(s.Circle(1)), s.Line([0, 0, 0], [20, 0, 0])).volume, 20 * Math.PI, 1e-3);
      expect(s.swing(profile, s.Circle(10)).volume).toBeGreaterThan(0);
      const part = box();
      expect(asPart(s.fillet(part.edges(), 1)).volume).toBeLessThan(part.volume);
      expect(asPart(s.chamfer(part.edges(), 1)).volume).toBeLessThan(part.volume);
      expect(s.shell(part, -1, part.faces().sortBy(s.Z).at(-1)).volume).toBeLessThan(part.volume);
      expect(asPart(s.offset(part, 1)).volume).toBeGreaterThan(part.volume);
      near(s.mirror(s.Pos(10, 0, 0).mul(box()), s.Plane.YZ).bbox().center.x, -10);
      near(s.split(part, s.Plane.XY).volume, 500, 1e-4);
      near(s.section(part).area, 200, 1e-4);
      near(s.thicken(s.Rectangle(10, 10).faces()[0]!, 2).volume, 200, 1e-4);
      near(s.scale(part, 2).volume, 8000, 1e-4);
    },
  },
  {
    name: 'face editing and defeaturing',
    covers: [
      'draft',
      'moveFaces',
      'offsetFaces',
      'removeFaces',
      'removeFillets',
      'push',
      'imprint',
      'filletPreview',
      'GUARD_BOOLEANS',
      'GUARD_SECONDS',
      'setGuardBooleans',
      'setGuardSeconds',
    ],
    run() {
      const part = box();
      const top = part.faces().sortBy(s.Z).at(-1)!;
      const sides = part.faces().filter((face) => Math.abs(face.normalAt().z) < 1e-9);
      expect(s.draft(part, sides, 5, s.Plane.XY).volume).not.toBeCloseTo(part.volume);
      near(s.moveFaces(part, top, [0, 0, 5]).volume, 2000, 1e-4);
      near(s.offsetFaces(part, top, 5).volume, 2000, 1e-4);
      const pocketed = part.cut(s.Pos(0, 0, 2.5).mul(s.Box(4, 4, 4)));
      const pocket = pocketed.faces().filter((face) => face.center().z > 0 && face.center().z < 2.5 - 1e-6);
      near(s.removeFaces(pocketed, pocket).volume, 1000, 1e-4);
      near(s.removeFillets(asPart(s.fillet(part.edges().parallelTo(s.Z), 2))).volume, 1000, 1e-3);
      expect(s.push(part, top, top.center(), { by: 2 }).volume).toBeGreaterThan(part.volume);
      expect(s.imprint(part, s.Line([-10, 0, 2.5], [10, 0, 2.5])).faces()).toHaveLength(7);
      expect(s.filletPreview(part.edges(), 1)).toBeTruthy();
      expect(typeof s.GUARD_BOOLEANS).toBe('boolean');
      expect(typeof s.GUARD_SECONDS).toBe('number');
      expect(s.setGuardSeconds(s.GUARD_SECONDS)).toBe(s.GUARD_SECONDS);
      expect(s.setGuardBooleans(s.GUARD_BOOLEANS)).toBe(s.GUARD_BOOLEANS);
    },
  },
  {
    name: 'sheet and curve operations',
    covers: [
      'warp',
      'flatten',
      'extend',
      'trim',
      'matchEdge',
      'mergeFaces',
      'project',
      'outline',
      'silhouette',
      'intersectionCurves',
      'partingLine',
      'slices',
    ],
    run() {
      const flat = sheetOf(s.Rectangle(30, 30));
      const warped = s.warp(flat, flat.faces()[0]!, s.Circle(5), 3);
      expect(warped.area).toBeGreaterThan(flat.area);
      near(s.flatten(warped, warped.faces()[0]!, s.Circle(5), s.Plane.XY).area, flat.area, 1e-3);
      near(s.extend(s.Line([0, 0], [10, 0]), 5).length, 15, 1e-4);
      near(s.trim(s.Line([0, 0], [10, 0]), 0.2, 0.8).length, 6, 1e-4);
      const left = sheetOf(s.Rectangle(10, 10));
      const right = sheetOf(s.Pos(10, 0, 0).mul(s.Rectangle(10, 10)));
      expect(s.matchEdge(left, left.edges().sortBy(s.X).at(-1)!, right.edges().sortBy(s.X)[0]!)).toBeInstanceOf(
        s.Shell,
      );
      const pair = asShell(s.stitch(left, right));
      expect(s.mergeFaces(pair, pair.faces()[0]!, pair.faces()[1]!).faces()).toHaveLength(1);
      const circle = s.Pos(0, 0, 10).mul(s.Circle(3)).edges()[0]!;
      expect(s.project(s.Box(20, 20, 5), circle, [0, 0, -1]).length).toBeGreaterThan(0);
      expect(s.outline(box()).length).toBeGreaterThan(0);
      expect(s.silhouette(s.Sphere(5), s.Z).length).toBeGreaterThan(0);
      expect(s.intersectionCurves(box(), s.Plane.XY)).toHaveLength(4);
      expect(s.partingLine(s.Sphere(5), s.Z).length).toBeGreaterThan(0);
      expect(s.slices(box(), 1).length).toBeGreaterThanOrEqual(4);
    },
  },
  {
    name: 'deformations',
    covers: ['twist', 'taper', 'bend', 'unroll', 'Lattice', 'deform'],
    run() {
      const bar = s.Box(4, 4, 40);
      near(s.twist(bar, 45).volume, bar.volume, 1e-2);
      expect(s.taper(bar, 0.5).volume).toBeLessThan(bar.volume);
      expect(s.bend(s.Box(40, 4, 4), 90).volume).toBeGreaterThan(0);
      expect(s.unroll(s.AnnularSector(10, 11, 5, 90), { radius: 10.5 }).volume).toBeGreaterThan(0);
      near(s.deform(bar, new s.Lattice(bar.bbox())).volume, bar.volume, 1e-3);
    },
  },
  {
    name: 'surfaces',
    covers: [
      'surface',
      'nurbsSurface',
      'ruled',
      'stitch',
      'surfaceFillet',
      'blend',
      'fill',
      'network',
      'FitReport',
      'StitchReport',
    ],
    run() {
      expect(s.surface(grid()).area).toBeGreaterThan(900);
      expect(s.nurbsSurface(grid()).area).toBeGreaterThan(900);
      near(s.ruled(s.Line([0, 0, 0], [10, 0, 0]), s.Line([0, 0, 5], [10, 0, 5])).area, 50, 1e-4);
      near(
        asPart(
          s.stitch(
            ...box()
              .faces()
              .map((face: Face) => face.toShell()),
          ),
        ).volume,
        1000,
        1e-4,
      );
      expect(s.FitReport).toBeTypeOf('function');
      expect(s.StitchReport).toBeTypeOf('function');
      const floor = sheetOf(s.Rectangle(20, 20));
      const wall = sheetOf(s.Rot(90, 0, 0).mul(s.Rectangle(20, 20)));
      expect(s.surfaceFillet(floor, wall, 2)).toBeTruthy();
      const lower = s.ruled(s.Line([0, -5, 0], [10, -5, 0]), s.Line([0, 0, 0], [10, 0, 0]));
      const upper = s.ruled(s.Line([0, 10, 5], [10, 10, 5]), s.Line([0, 15, 5], [10, 15, 5]));
      expect(s.blend(lower.edges().sortBy(s.Y).at(-1)!, upper.edges().sortBy(s.Y)[0]!).area).toBeGreaterThan(0);
      near(s.fill(s.Circle(5).edges()).area, 25 * Math.PI, 1e-2);
      const u = [s.Line([0, 0, 0], [0, 10, 0]), s.Line([10, 0, 0], [10, 10, 0])];
      const v = [s.Line([0, 0, 0], [10, 0, 0]), s.Line([0, 10, 0], [10, 10, 0])];
      near(s.network(u, v).area, 100, 1e-3);
    },
  },
  {
    name: 'sheet metal',
    covers: [
      'Bend',
      'FlatPattern',
      'bendAllowance',
      'bendDeduction',
      'developedLength',
      'flange',
      'flatPattern',
      'fold',
      'unfold',
    ],
    run() {
      expect(s.bendAllowance(90, { radius: 2, thickness: 1 })).toBeGreaterThan(0);
      expect(s.bendDeduction(90, { radius: 2, thickness: 1 })).toBeGreaterThan(0);
      expect(s.developedLength(20, 20, { radius: 2, thickness: 1 })).toBeGreaterThan(0);
      const plate = s.Box(40, 20, 1);
      expect(s.flange(plate, plate.edges().sortBy(s.X).at(-1)!, 30, { radius: 2 }).volume).toBeGreaterThan(
        plate.volume,
      );
      const folded = s.fold(plate, new s.Axis([0, 0, 0.5], [0, 1, 0]), 90, {
        radius: 2,
      });
      near(s.unfold(folded).volume, plate.volume, 1e-2);
      const pattern = s.flatPattern(folded);
      expect(pattern).toBeInstanceOf(s.FlatPattern);
      expect(pattern.bends[0]).toBeInstanceOf(s.Bend);
    },
  },
  {
    name: 'meshes',
    covers: ['Mesh', 'tessellate', 'faceMeshes', 'RepairReport'],
    run() {
      const mesh = s.tessellate(box());
      expect(mesh).toBeInstanceOf(s.Mesh);
      expect(mesh.isClosed()).toBe(true);
      near(mesh.volume, 1000);
      expect(s.faceMeshes(box())).toHaveLength(6);
      expect(mesh.repaired()[1]).toBeInstanceOf(s.RepairReport);
      expect(s.tessellate(s.Pos(34, -17, 9).mul(s.Torus(10, 3))).isClosed()).toBe(true);
    },
  },
  {
    name: 'exchange formats in memory',
    covers: [
      'toStep',
      'fromStep',
      'StepModel',
      'fromStepModel',
      'StepFrame',
      'StepCurve',
      'StepPoint',
      'toStl',
      'fromStl',
      'toObj',
      'toGlb',
      'toGltf',
      'toSmb',
      'fromSmb',
      'toSmp',
      'fromSmp',
      'toFile',
      'fromFile',
      'toDxf',
      'fromDxf',
      'fromDxfWires',
      'toUsd',
      'fromUsd',
      'toBrep',
      'fromBrep',
      'fromIges',
      'toSvg',
    ],
    run() {
      const part = box();
      const step = s.toStep(part);
      near(asPart(s.fromStep(step)).volume, 1000, 1e-4);
      expect(s.fromStepModel(step)).toBeInstanceOf(s.StepModel);
      near(new s.StepPoint('p', new s.Vector(1, 2, 3)).point.y, 2);
      near(new s.StepFrame('f', s.Plane.XY).plane.origin.z, 0);
      near(new s.StepCurve('c', s.Line([0, 0], [4, 0])).shape.length, 4);
      near(s.fromStl(s.toStl(part)).volume, 1000, 1e-4);
      expect(s.toObj(part)).toMatch(/^v /m);
      expect(new TextDecoder().decode(s.toGlb(part).slice(0, 4))).toBe('glTF');
      expect(JSON.parse(s.toGltf(part))).toMatchObject({
        asset: { version: '2.0' },
      });
      near(asPart(s.fromSmb(s.toSmb(part))).volume, 1000, 1e-9);
      expect(s.fromSmp(s.toSmp(part))).toBeTruthy();
      near(asPart(s.fromFile(s.toFile(part, 'part.step'), 'part.step')).volume, 1000, 1e-4);
      const square = s.Rectangle(10, 10);
      near(s.fromDxf(s.toDxf(square)).area, 100, 1e-4);
      expect(s.fromDxfWires(s.toDxf(square))).toHaveLength(1);
      near(asPart(s.fromUsd(s.toUsd(part))).volume, 1000, 1e-4);
      near(asPart(s.fromBrep(s.toBrep(part))).volume, 1000, 1e-4);
      // The library reads IGES but writes none; a malformed file must fail cleanly.
      expect(() => s.fromIges('not an IGES file')).toThrow();
      expect(s.toSvg(square)).toMatch(/<svg/);
    },
  },
  {
    name: 'exchange formats on disk',
    covers: [
      'exportStep',
      'importStep',
      'readStep',
      'exportStl',
      'importStl',
      'exportObj',
      'exportGlb',
      'exportGltf',
      'exportFile',
      'save',
      'load',
      'exportDxf',
      'importDxf',
      'importDxfWires',
      'exportUsd',
      'importUsd',
      'exportBrep',
      'importBrep',
      'importIges',
      'exportSvg',
    ],
    run() {
      const part = box();
      s.exportStep(part, file('part.step'));
      near(asPart(s.importStep(file('part.step'))).volume, 1000, 1e-4);
      expect(s.readStep(file('part.step'))).toBeInstanceOf(s.StepModel);
      s.exportStl(part, file('part.stl'));
      near(s.importStl(file('part.stl')).volume, 1000, 1e-4);
      s.exportObj(part, file('part.obj'));
      s.exportGlb(part, file('part.glb'));
      s.exportGltf(part, file('part.gltf'));
      s.exportFile(part, file('copy.step'));
      near(asPart(s.importStep(file('copy.step'))).volume, 1000, 1e-4);
      s.save(part, file('part.smb'));
      near(asPart(s.load(file('part.smb'))).volume, 1000, 1e-9);
      s.exportDxf(s.Rectangle(10, 10), file('square.dxf'));
      near(s.importDxf(file('square.dxf')).area, 100, 1e-4);
      expect(s.importDxfWires(file('square.dxf'))).toHaveLength(1);
      s.exportUsd(part, file('part.usda'));
      near(asPart(s.importUsd(file('part.usda'))).volume, 1000, 1e-4);
      s.exportBrep(part, file('part.brep'));
      near(asPart(s.importBrep(file('part.brep'))).volume, 1000, 1e-4);
      expect(() => s.importIges(file('missing.igs'))).toThrow();
      s.exportSvg(s.Rectangle(10, 10), file('square.svg'));
      expect(readFileSync(file('square.svg'), 'utf8')).toMatch(/<svg/);
      for (const name of ['part.obj', 'part.glb', 'part.gltf']) {
        expect(readFileSync(file(name)).byteLength).toBeGreaterThan(0);
      }
    },
  },
  {
    name: 'drawings, pictures and viewer pages',
    covers: [
      'DrawingView',
      'drawingViews',
      'Picture',
      'ImageDiff',
      'VIEWS',
      'render',
      'diffImages',
      'htmlPage',
      'show',
    ],
    run() {
      expect(s.drawingViews(box())[0]).toBeInstanceOf(s.DrawingView);
      expect(s.VIEWS).toHaveProperty('iso');
      const picture = s.render(box(), { size: [64, 64] });
      expect(picture).toBeInstanceOf(s.Picture);
      const diff = s.diffImages(picture, picture);
      expect(diff).toBeInstanceOf(s.ImageDiff);
      expect(diff.changed).toBe(0);
      expect(s.htmlPage(box())).toMatch(/<html/i);
      const page = s.show(box(), {
        path: file('viewer.html'),
        openBrowser: false,
      });
      expect(readFileSync(page, 'utf8')).toMatch(/<html/i);
    },
  },
  {
    name: 'kernel memory, scopes and errors',
    covers: ['memoryUsage', 'scope', 'setWarningHandler', 'KernelError', 'ModelingError'],
    run() {
      expect(s.memoryUsage()).toBeTruthy();
      near(
        s.scope(() => s.Box(1, 2, 3).volume),
        6,
      );
      const warnings: string[] = [];
      s.setWarningHandler((message) => warnings.push(message));
      expect(warnings).toEqual([]);
      const cube = s.Box(1, 1, 1);
      let failure: unknown;
      try {
        cube.fillet(cube.edges(), 5);
      } catch (error) {
        failure = error;
      }
      expect(failure instanceof s.ModelingError || failure instanceof s.KernelError).toBe(true);
      expect(s.KernelError.prototype).toBeInstanceOf(Error);
      expect(s.ModelingError.prototype).toBeInstanceOf(Error);
    },
  },
];

describe('@classcad/smlibwasm API surface', () => {
  it('names every runtime export in exactly the cases below', () => {
    const covered = cases.flatMap(({ covers }) => covers);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual(Object.keys(smlib).sort());
  });

  it.each(cases)('$name', ({ run }) => {
    run();
  });
});
