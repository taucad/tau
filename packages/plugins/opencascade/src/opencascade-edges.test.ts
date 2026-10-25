// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initOcct } from '@taucad/occt-core';
import type { OpenCascadeInstance, TopoDS_Shape } from 'libcascade/init';
import { extractShapeEdges } from '#opencascade-edges.js';
import type { ShapeEdges } from '#opencascade-edges.js';
import { createIncrementalMesh } from '#opencascade-mesh.js';

type Point = readonly [number, number, number];

let oc: OpenCascadeInstance;
const owned: Array<{ delete(): void }> = [];
const own = <T extends { delete(): void }>(value: T): T => {
  owned.push(value);
  return value;
};

beforeAll(async () => {
  const bindings = await import('libcascade/single/init');
  oc = await initOcct(new URL(import.meta.resolve('libcascade/wasm')).href, bindings.default);
});

afterAll(() => {
  for (const value of owned.reverse()) {
    value.delete();
  }
});

const tolerances = { linearTolerance: 0.05, angularTolerance: (12 * Math.PI) / 180 };

const meshed = (shape: TopoDS_Shape, options = tolerances): TopoDS_Shape => {
  own(createIncrementalMesh(oc, shape, options));
  return shape;
};

const box = (): TopoDS_Shape => meshed(own(own(new oc.BRepPrimAPI_MakeBox(10, 20, 30)).Shape()));
const cylinder = (): TopoDS_Shape => meshed(own(own(new oc.BRepPrimAPI_MakeCylinder(15, 18)).Shape()));
const sphere = (): TopoDS_Shape => meshed(own(own(new oc.BRepPrimAPI_MakeSphere(15)).Shape()));

/** One polyline per edge group, read back from the segment soup. */
const polylines = (edges: ShapeEdges): Point[][] =>
  edges.edgeGroups.map(({ start, count }) => {
    const points: Point[] = [];
    for (let index = start; index < start + count; index += 6) {
      const first: Point = [edges.lines[index]!, edges.lines[index + 1]!, edges.lines[index + 2]!];
      if (points.length === 0) {
        points.push(first);
      }
      points.push([edges.lines[index + 3]!, edges.lines[index + 4]!, edges.lines[index + 5]!]);
    }
    return points;
  });

const allPoints = (edges: ShapeEdges): Point[] => {
  const points: Point[] = [];
  for (let index = 0; index < edges.lines.length; index += 3) {
    points.push([edges.lines[index]!, edges.lines[index + 1]!, edges.lines[index + 2]!]);
  }
  return points;
};

/** Every node of every face triangulation, in the shape's frame, read without any edge polygon. */
const surfaceNodes = (shape: TopoDS_Shape): Point[] => {
  const nodes: Point[] = [];
  const unlocated = own(new oc.TopLoc_Location());
  const root = own(shape.Located(unlocated, false));
  const explorer = own(new oc.TopExp_Explorer(root, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  while (explorer.More()) {
    const face = own(oc.TopoDS.Face(explorer.Current()));
    explorer.Next();
    const location = own(new oc.TopLoc_Location());
    const triangulation = own(oc.BRep_Tool.Triangulation(face, location, 0));
    const transformation = location.Transformation();
    for (let index = 1; index <= triangulation.NbNodes(); index++) {
      const node = own(own(triangulation.Node(index)).Transformed(transformation));
      nodes.push([node.X(), node.Y(), node.Z()]);
    }
  }
  return nodes;
};

const distance = (first: Point, second: Point): number =>
  Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);

const nearest = (point: Point, candidates: readonly Point[]): number =>
  Math.min(...candidates.map((candidate) => distance(point, candidate)));

const key = (point: Point): string => point.map((value) => value.toFixed(6)).join(',');

describe('extractShapeEdges', () => {
  it('should emit one group per box edge whose polyline ends at box vertices', () => {
    const edges = extractShapeEdges(oc, box(), tolerances);
    const corners = [0, 10].flatMap((x) => [0, 20].flatMap((y) => [0, 30].map((z): Point => [x, y, z])));

    expect(edges.edgeGroups.map((group) => group.edgeId)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    for (const polyline of polylines(edges)) {
      expect(nearest(polyline[0]!, corners)).toBeLessThan(1e-9);
      expect(nearest(polyline.at(-1)!, corners)).toBeLessThan(1e-9);
    }
  });

  it('should emit a shared edge once', () => {
    const edges = extractShapeEdges(oc, box(), tolerances);
    const spans = polylines(edges).map((polyline) => [key(polyline[0]!), key(polyline.at(-1)!)].sort().join('|'));

    expect(new Set(spans).size).toBe(12);
  });

  it('should emit two circles and the seam for a cylinder', () => {
    const lines = polylines(extractShapeEdges(oc, cylinder(), tolerances));
    const closed = lines.filter((polyline) => distance(polyline[0]!, polyline.at(-1)!) < 1e-9);
    const seams = lines.filter((polyline) => distance(polyline[0]!, polyline.at(-1)!) > 1);

    expect(lines).toHaveLength(3);
    expect(closed.map((polyline) => Math.round(polyline[0]![2]))).toEqual(expect.arrayContaining([0, 18]));
    expect(closed.every((polyline) => polyline.length > 8)).toBe(true);
    expect(seams).toHaveLength(1);
  });

  it('should emit a sphere as its one seam polyline, without degenerate pole edges', () => {
    const lines = polylines(extractShapeEdges(oc, sphere(), tolerances));

    expect(lines).toHaveLength(1);
    expect(distance(lines[0]![0]!, lines[0]!.at(-1)!)).toBeCloseTo(30, 6);
  });

  it('should place every line vertex on the surface mesh within the linear tolerance', () => {
    for (const shape of [box(), cylinder(), sphere()]) {
      const nodes = surfaceNodes(shape);
      const points = allPoints(extractShapeEdges(oc, shape, tolerances));

      expect(points.length).toBeGreaterThan(0);
      expect(Math.max(...points.map((point) => nearest(point, nodes)))).toBeLessThanOrEqual(tolerances.linearTolerance);
    }
  });

  it('should return points in the shape frame, without its own location', () => {
    const shape = cylinder();
    const translation = own(new oc.gp_Trsf());
    translation.SetTranslation(own(new oc.gp_Vec(100, -40, 7)));
    const moved = own(shape.Moved(own(new oc.TopLoc_Location(translation)), false));

    const local = extractShapeEdges(oc, shape, tolerances);

    expect(local.edgeGroups).toHaveLength(3);
    expect([...extractShapeEdges(oc, moved, tolerances).lines]).toEqual([...local.lines]);
  });

  it('should sample a free edge from its curve at the angular and linear deflection', () => {
    const radius = 15;
    const axis = own(new oc.gp_Ax2());
    const circle = own(new oc.gp_Circ(axis, radius));
    const edge = own(own(new oc.BRepBuilderAPI_MakeEdge(circle)).Edge());
    const coarse = polylines(
      extractShapeEdges(oc, edge, { linearTolerance: 0.2, angularTolerance: (40 * Math.PI) / 180 }),
    );
    const fine = polylines(
      extractShapeEdges(oc, edge, { linearTolerance: 0.2, angularTolerance: (5 * Math.PI) / 180 }),
    );

    expect(coarse).toHaveLength(1);
    expect(fine).toHaveLength(1);
    expect(fine[0]!.length).toBeGreaterThan(coarse[0]!.length);
    for (const [polyline, degrees] of [
      [coarse[0]!, 40],
      [fine[0]!, 5],
    ] as const) {
      for (let index = 1; index < polyline.length; index++) {
        const chord = distance(polyline[index - 1]!, polyline[index]!);
        expect(2 * Math.asin(chord / (2 * radius))).toBeLessThanOrEqual((degrees * Math.PI) / 180 + 1e-8);
        expect(radius - Math.sqrt(radius * radius - (chord * chord) / 4)).toBeLessThanOrEqual(0.2 + 1e-8);
      }
    }
  });

  it('should sample the curves of a shape whose faces were never meshed', () => {
    const unmeshed = own(own(new oc.BRepPrimAPI_MakeBox(10, 20, 30)).Shape());
    const lines = polylines(extractShapeEdges(oc, unmeshed, tolerances));

    expect(lines).toHaveLength(12);
    expect(lines.every((polyline) => polyline.length >= 2)).toBe(true);
  });

  it('should emit nothing for a null shape', () => {
    const empty = own(new oc.TopoDS_Shape());

    expect(extractShapeEdges(oc, empty, tolerances)).toEqual({ lines: new Float64Array(), edgeGroups: [] });
  });
});
