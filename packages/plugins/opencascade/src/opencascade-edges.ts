/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * B-rep edge polylines for the OpenCascade kernel's native edge overlay.
 *
 * Mirrors Build123d's `_edge_points`: an edge on a meshed face reads the face's own boundary samples
 * (`PolygonOnTriangulation`), so line vertices coincide with surface vertices; an edge without one
 * is sampled from its curve with the same tolerances the surface was meshed at.
 */

import { createOcScope } from '@taucad/occt-core';
import type { OcScope } from '@taucad/occt-core';
import type {
  OpenCascadeInstance,
  Poly_PolygonOnTriangulation,
  Poly_Triangulation,
  TopLoc_Location,
  TopoDS_Edge,
  TopoDS_Shape,
} from 'libcascade/init';

/** One B-rep edge's span of {@link ShapeEdges.lines}, counted in XYZ scalars like replicad's `xyz-scalars-v1`. */
export type ShapeEdgeGroup = { start: number; count: number; edgeId: number };

/**
 * A shape's edges as a de-indexed segment soup in the shape's own frame (millimetres, Z-up, without
 * the shape's root location), and one group per drawn edge.
 */
export type ShapeEdges = { lines: Float64Array; edgeGroups: ShapeEdgeGroup[] };

/** Linear deflection in millimetres and angular deflection in radians, as the mesher takes them. */
export type EdgeTolerances = { linearTolerance: number; angularTolerance: number };

/** OCCT's discretizer arguments Build123d uses: at least two points, parametric and minimum-length tolerances. */
const curveMinimumPoints = 2;
const curveParameterTolerance = 1e-9;
const curveMinimumLength = 1e-7;

type Transform = (x: number, y: number, z: number) => [number, number, number];

const locationTransform = (scope: OcScope, location: TopLoc_Location): Transform => {
  const trsf = scope.track(location.Transformation());
  const m = [1, 2, 3].map((row) => [1, 2, 3, 4].map((column) => trsf.Value(row, column)));
  return (x, y, z) => [
    m[0]![0]! * x + m[0]![1]! * y + m[0]![2]! * z + m[0]![3]!,
    m[1]![0]! * x + m[1]![1]! * y + m[1]![2]! * z + m[1]![3]!,
    m[2]![0]! * x + m[2]![1]! * y + m[2]![2]! * z + m[2]![3]!,
  ];
};

/**
 * The edge's samples on a face triangulation. Both faces of a shared edge hold the same 3D nodes, so
 * the first polygon serves.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param scope - Owns every handle read for this edge.
 * @param edge - The edge, in the frame of the shape being extracted.
 * @returns Flat XYZ samples, or `undefined` when no meshed face keeps a polygon for the edge.
 */
const polygonPoints = (oc: OpenCascadeInstance, scope: OcScope, edge: TopoDS_Edge): number[] | undefined => {
  const location = scope.track(new oc.TopLoc_Location());
  // Embind returns a missing OCCT handle as `null`, which the generated declarations do not express.
  const found = oc.BRep_Tool.PolygonOnTriangulation(edge, location) as Partial<{
    P: Poly_PolygonOnTriangulation;
    T: Poly_Triangulation;
  }>;
  if (!found.P) {
    return undefined;
  }
  const polygon = scope.track(found.P);
  // A polygon on triangulation always comes with the triangulation it indexes.
  const triangulation = scope.track(found.T!);
  const transform = locationTransform(scope, location);
  const points: number[] = [];
  for (let index = 1; index <= polygon.NbNodes(); index++) {
    const node = triangulation.Node(polygon.Node(index));
    points.push(...transform(node.X(), node.Y(), node.Z()));
    node.delete();
  }
  return points;
};

/**
 * The edge sampled from its curve with OCCT's angular-and-chordal discretizer.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param scope - Owns every handle read for this edge.
 * @param edge - The edge and the tolerances to sample it at.
 * @returns Flat XYZ samples, at least two points.
 */
const curvePoints = (
  oc: OpenCascadeInstance,
  scope: OcScope,
  edge: { edge: TopoDS_Edge; tolerances: EdgeTolerances },
): number[] => {
  const curve = scope.track(new oc.BRepAdaptor_Curve(edge.edge));
  const sampler = scope.track(
    // The eight-argument overload: the six-argument one is ambiguous with the parameter-range form.
    new oc.GCPnts_TangentialDeflection(
      curve,
      curve.FirstParameter(),
      curve.LastParameter(),
      edge.tolerances.angularTolerance,
      edge.tolerances.linearTolerance,
      curveMinimumPoints,
      curveParameterTolerance,
      curveMinimumLength,
    ),
  );
  const points: number[] = [];
  for (let index = 1; index <= sampler.NbPoints(); index++) {
    const point = sampler.Value(index);
    points.push(point.X(), point.Y(), point.Z());
    point.delete();
  }
  return points;
};

/**
 * Extract a meshed shape's B-rep edges as line segments. Each edge is emitted once (OCCT `IsSame`),
 * degenerate edges such as sphere poles are skipped, and the shape's root location is left out
 * because the glTF writer moves it onto the node.
 *
 * @param oc - OpenCASCADE WASM instance
 * @param shape - A shape already meshed with `tolerances`.
 * @param tolerances - The effective tolerances the surface was meshed at, used for edges without a face polygon.
 * @returns The segment soup and one group per drawn edge, in B-rep edge order.
 */
export function extractShapeEdges(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tolerances: EdgeTolerances,
): ShapeEdges {
  if (shape.IsNull()) {
    return { lines: new Float64Array(), edgeGroups: [] };
  }
  const scope = createOcScope();
  try {
    const root = scope.track(shape.Located(scope.track(new oc.TopLoc_Location()), false));
    const edgeMap = scope.track(new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher());
    oc.TopExp.MapShapes(root, oc.TopAbs_ShapeEnum.TopAbs_EDGE, edgeMap);
    const lines: number[] = [];
    const edgeGroups: ShapeEdgeGroup[] = [];
    for (let index = 1; index <= edgeMap.Extent(); index++) {
      // Each edge frees its handles before the next, so a large model never holds every sample's handle.
      const edgeScope = createOcScope();
      try {
        const edge = edgeScope.track(oc.TopoDS.Edge(edgeScope.track(edgeMap.FindKey(index))));
        if (oc.BRep_Tool.Degenerated(edge)) {
          continue;
        }
        const points = polygonPoints(oc, edgeScope, edge) ?? curvePoints(oc, edgeScope, { edge, tolerances });
        const start = lines.length;
        for (let point = 3; point < points.length; point += 3) {
          lines.push(...points.slice(point - 3, point + 3));
        }
        // Both samplers return at least two points, so every drawn edge has a segment.
        edgeGroups.push({ start, count: lines.length - start, edgeId: edgeGroups.length });
      } finally {
        edgeScope.dispose();
      }
    }
    return { lines: Float64Array.from(lines), edgeGroups };
  } finally {
    scope.dispose();
  }
}
