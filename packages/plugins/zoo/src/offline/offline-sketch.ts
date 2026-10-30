/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * Sketch geometry for the offline engine: path segments as libcascade edges, and planar arrangements that turn a
 * path's segments into the faces `create_region`, `extrude` and friends consume.
 */
import type { Frame, Vec2, Vec3 } from '#offline/offline-math.js';
import { directionToGlobal, dot, normalize, toGlobal, toLocal, vec3 } from '#offline/offline-math.js';
import type { Oc, TopoDS_Edge, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import {
  arrayToList,
  ax2,
  boundingBox,
  dir,
  edges,
  faces,
  listToArray,
  areaOf,
  pnt,
  subShapes,
} from '#offline/offline-occt.js';
import { helpersFor } from '#offline/offline-helpers.js';
import type { PathEntity, PathSegment } from '#offline/offline-scene.js';
import type { WireAngle, WirePoint2d, WirePoint3d } from '#offline/offline-engine.types.js';
import { OfflineEngineError, toRadians } from '#offline/offline-engine.types.js';

/** `PathSegment` as the wire carries it. */
export type WirePathSegment =
  | { type: 'line'; end: WirePoint3d; relative: boolean }
  | { type: 'arc'; center: WirePoint2d; radius: number; start: WireAngle; end: WireAngle; relative: boolean }
  | { type: 'bezier'; control1: WirePoint3d; control2: WirePoint3d; end: WirePoint3d; relative: boolean }
  | { type: 'tangential_arc'; radius: number; offset: WireAngle }
  | { type: 'tangential_arc_to'; to: WirePoint3d; angle_snap_increment: WireAngle | undefined }
  | { type: 'arc_to'; interior: WirePoint3d; end: WirePoint3d; relative: boolean }
  | { type: 'circular_involute'; start_radius: number; end_radius: number; angle: WireAngle; reverse: boolean }
  | {
      type: 'ellipse';
      center: WirePoint2d;
      major_axis: WirePoint2d;
      minor_radius: number;
      start_angle: WireAngle;
      end_angle: WireAngle;
    }
  | {
      type: 'conic_to';
      interior: WirePoint2d;
      end: WirePoint2d;
      start_tangent: WirePoint2d;
      end_tangent: WirePoint2d;
      relative: boolean;
    };

const twoPi = Math.PI * 2;
const v2 = (x: number, y: number): Vec2 => ({ x, y });
const distribution2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const unit2 = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-12 ? v2(1, 0) : v2(a.x / l, a.y / l);
};

const lineEdge = (oc: Oc, frame: Frame, a: Vec2, b: Vec2): TopoDS_Edge =>
  new oc.BRepBuilderAPI_MakeEdge(pnt(oc, toGlobal(frame, a.x, a.y)), pnt(oc, toGlobal(frame, b.x, b.y))).Edge();

/**
 * Circle arc through three plane-local points.
 *
 * @param oc - libcascade instance
 * @param frame - sketch frame
 * @param a - start
 * @param m - interior point
 * @param b - end
 * @returns edge
 */
const threePointArc = (oc: Oc, frame: Frame, a: Vec2, m: Vec2, b: Vec2): TopoDS_Edge => {
  const arc = new oc.GC_MakeArcOfCircle(
    pnt(oc, toGlobal(frame, a.x, a.y)),
    pnt(oc, toGlobal(frame, m.x, m.y)),
    pnt(oc, toGlobal(frame, b.x, b.y)),
  );
  if (!arc.IsDone()) {
    arc.delete();
    return lineEdge(oc, frame, a, b);
  }

  const edge = new oc.BRepBuilderAPI_MakeEdge(arc.Value()).Edge();
  arc.delete();
  return edge;
};

/**
 * Full circle starting at `startAngle`, counter-clockwise unless `clockwise`.
 *
 * @param oc - libcascade instance
 * @param frame - sketch frame
 * @param center - plane-local centre
 * @param radius - radius
 * @param startAngle - angle of the start point
 * @param clockwise - traversal direction
 * @returns closed edge
 */
const circleEdge = (
  oc: Oc,
  frame: Frame,
  center: Vec2,
  radius: number,
  startAngle: number,
  clockwise: boolean,
): TopoDS_Edge => {
  const axes = ax2(oc, { ...frame, origin: toGlobal(frame, center.x, center.y) });
  const circle = new oc.gp_Circ(axes, radius);
  const edge = new oc.BRepBuilderAPI_MakeEdge(circle, startAngle, startAngle + twoPi).Edge();
  return clockwise ? oc.TopoDS.Edge(edge.Reversed()) : edge;
};

const bsplineThrough = (oc: Oc, frame: Frame, points: Vec2[]): TopoDS_Edge => {
  const array = new oc.NCollection_Array1_gp_Pnt(1, points.length);
  for (const [index, p] of points.entries()) {
    array.SetValue(index + 1, pnt(oc, toGlobal(frame, p.x, p.y)));
  }

  const fit = new oc.GeomAPI_PointsToBSpline(array, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-6);
  const edge = new oc.BRepBuilderAPI_MakeEdge(fit.Curve()).Edge();
  fit.delete();
  array.delete();
  return edge;
};

/**
 * Builds the edge for one `extend_path` segment and advances the pen.
 *
 * @param oc - libcascade instance
 * @param path - path being extended
 * @param id - segment id (the command id)
 * @param segment - wire segment
 * @returns the new segment, or undefined when it has no length
 */
// oxlint-disable-next-line complexity -- one branch per wire segment type
export function buildSegment(oc: Oc, path: PathEntity, id: string, segment: WirePathSegment): PathSegment | undefined {
  const { frame } = path;
  const from = path.pen;
  const previous = path.segments.at(-1);
  const incoming = previous ? previous.endTangent : v2(1, 0);
  let edge: TopoDS_Edge | undefined;
  let to: Vec2 = from;
  let endTangent: Vec2 = incoming;

  switch (segment.type) {
    case 'line': {
      to = segment.relative ? v2(from.x + segment.end.x, from.y + segment.end.y) : v2(segment.end.x, segment.end.y);
      if (distribution2(from, to) < 1e-9) {
        return undefined;
      }

      edge = lineEdge(oc, frame, from, to);
      endTangent = unit2(v2(to.x - from.x, to.y - from.y));
      break;
    }

    case 'arc': {
      const center = segment.relative
        ? v2(from.x + segment.center.x, from.y + segment.center.y)
        : v2(segment.center.x, segment.center.y);
      const a0 = toRadians(segment.start);
      const a1 = toRadians(segment.end);
      const clockwise = a1 < a0;
      const r = segment.radius;
      to = v2(center.x + r * Math.cos(a1), center.y + r * Math.sin(a1));
      if (Math.abs(a1 - a0) >= twoPi - 1e-9) {
        edge = circleEdge(oc, frame, center, r, a0, clockwise);
      } else {
        const mid = (a0 + a1) / 2;
        const start =
          distribution2(from, center) > 1e-9 ? from : v2(center.x + r * Math.cos(a0), center.y + r * Math.sin(a0));
        edge = threePointArc(oc, frame, start, v2(center.x + r * Math.cos(mid), center.y + r * Math.sin(mid)), to);
      }

      endTangent = clockwise ? v2(Math.sin(a1), -Math.cos(a1)) : v2(-Math.sin(a1), Math.cos(a1));
      break;
    }

    case 'arc_to': {
      const base = segment.relative ? from : v2(0, 0);
      const interior = v2(base.x + segment.interior.x, base.y + segment.interior.y);
      to = v2(base.x + segment.end.x, base.y + segment.end.y);
      edge = threePointArc(oc, frame, from, interior, to);
      endTangent = tangentAtEnd(oc, frame, edge);
      break;
    }

    case 'tangential_arc': {
      const offset = toRadians(segment.offset);
      const r = segment.radius;
      const left = v2(-incoming.y, incoming.x);
      const side = offset >= 0 ? 1 : -1;
      const center = v2(from.x + left.x * r * side, from.y + left.y * r * side);
      const a0 = Math.atan2(from.y - center.y, from.x - center.x);
      const a1 = a0 + offset;
      to = v2(center.x + r * Math.cos(a1), center.y + r * Math.sin(a1));
      const mid = (a0 + a1) / 2;
      edge = threePointArc(oc, frame, from, v2(center.x + r * Math.cos(mid), center.y + r * Math.sin(mid)), to);
      endTangent = side > 0 ? v2(-Math.sin(a1), Math.cos(a1)) : v2(Math.sin(a1), -Math.cos(a1));
      break;
    }

    case 'tangential_arc_to': {
      to = v2(from.x + segment.to.x, from.y + segment.to.y);
      const arc = new oc.GC_MakeArcOfCircle(
        pnt(oc, toGlobal(frame, from.x, from.y)),
        new oc.gp_Vec(...vecTuple(directionToGlobal(frame, incoming.x, incoming.y))),
        pnt(oc, toGlobal(frame, to.x, to.y)),
      );
      edge = arc.IsDone() ? new oc.BRepBuilderAPI_MakeEdge(arc.Value()).Edge() : lineEdge(oc, frame, from, to);
      arc.delete();
      endTangent = tangentAtEnd(oc, frame, edge);
      break;
    }

    case 'bezier': {
      const base = segment.relative ? from : v2(0, 0);
      const c1 = v2(base.x + segment.control1.x, base.y + segment.control1.y);
      const c2 = v2(base.x + segment.control2.x, base.y + segment.control2.y);
      to = v2(base.x + segment.end.x, base.y + segment.end.y);
      const poles = new oc.NCollection_Array1_gp_Pnt(1, 4);
      for (const [index, p] of [from, c1, c2, to].entries()) {
        poles.SetValue(index + 1, pnt(oc, toGlobal(frame, p.x, p.y)));
      }

      edge = new oc.BRepBuilderAPI_MakeEdge(new oc.Geom_BezierCurve(poles)).Edge();
      poles.delete();
      endTangent = unit2(v2(to.x - c2.x, to.y - c2.y));
      break;
    }

    case 'circular_involute': {
      const r0 = segment.start_radius;
      const r1 = segment.end_radius;
      const angle = toRadians(segment.angle);
      const theta = Math.sqrt(Math.max(r1 * r1 - r0 * r0, 0)) / r0;
      const samples = 24;
      const points: Vec2[] = [];
      for (let index = 0; index <= samples; index++) {
        const t = (theta * index) / samples;
        const ix = r0 * (Math.cos(t) + t * Math.sin(t));
        const iy = r0 * (Math.sin(t) - t * Math.cos(t));
        let x = ix * Math.cos(angle) - iy * Math.sin(angle) - r0 * Math.cos(angle);
        const y = ix * Math.sin(angle) + iy * Math.cos(angle) - r0 * Math.sin(angle);
        if (segment.reverse) {
          x = -x;
        }

        points.push(v2(from.x + x, from.y + y));
      }

      to = points.at(-1)!;
      edge = bsplineThrough(oc, frame, points);
      endTangent = unit2(v2(to.x - points.at(-2)!.x, to.y - points.at(-2)!.y));
      break;
    }

    case 'ellipse': {
      const center = v2(segment.center.x, segment.center.y);
      const major = v2(segment.major_axis.x, segment.major_axis.y);
      const majorRadius = Math.hypot(major.x, major.y);
      const majorDirectory = unit2(major);
      const a0 = toRadians(segment.start_angle);
      const a1 = toRadians(segment.end_angle);
      const point = (a: number): Vec2 => {
        const u = majorRadius * Math.cos(a);
        const w = segment.minor_radius * Math.sin(a);
        return v2(
          center.x + majorDirectory.x * u - majorDirectory.y * w,
          center.y + majorDirectory.y * u + majorDirectory.x * w,
        );
      };

      to = point(a1);
      const ellipseFrame: Frame = {
        origin: toGlobal(frame, center.x, center.y),
        x: normalize(directionToGlobal(frame, majorDirectory.x, majorDirectory.y)),
        y: normalize(directionToGlobal(frame, -majorDirectory.y, majorDirectory.x)),
        z: frame.z,
      };
      const ellipse = new oc.gp_Elips(ax2(oc, ellipseFrame), majorRadius, segment.minor_radius);
      edge =
        Math.abs(a1 - a0) >= twoPi - 1e-9
          ? new oc.BRepBuilderAPI_MakeEdge(ellipse, a0, a0 + twoPi).Edge()
          : a1 > a0
            ? new oc.BRepBuilderAPI_MakeEdge(ellipse, a0, a1).Edge()
            : oc.TopoDS.Edge(new oc.BRepBuilderAPI_MakeEdge(ellipse, a1, a0).Edge().Reversed());
      endTangent = tangentAtEnd(oc, frame, edge);
      break;
    }

    case 'conic_to': {
      const base = segment.relative ? from : v2(0, 0);
      const interior = v2(base.x + segment.interior.x, base.y + segment.interior.y);
      to = v2(base.x + segment.end.x, base.y + segment.end.y);
      edge = bsplineThrough(oc, frame, [from, interior, to]);
      endTangent = unit2(v2(segment.end_tangent.x, segment.end_tangent.y));
      break;
    }

    default: {
      const unknown: { type: string } = segment;
      throw new OfflineEngineError(`Unsupported path segment ${unknown.type}`, 'bad_request');
    }
  }

  path.pen = to;
  return { id, edge, start: from, end: to, endTangent };
}

const vecTuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/**
 * The plane-local unit tangent at the end of an oriented edge.
 *
 * @param oc - libcascade instance
 * @param frame - sketch frame
 * @param edge - edge, its orientation respected
 * @returns unit tangent at the edge's end, in the frame's (u, v) coordinates
 */
export const tangentAtEnd = (oc: Oc, frame: Frame, edge: TopoDS_Edge): Vec2 => {
  const curve = new oc.BRepAdaptor_Curve(edge);
  const reversed = edge.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
  const u = reversed ? curve.FirstParameter() : curve.LastParameter();
  const p = new oc.gp_Pnt();
  const v = new oc.gp_Vec();
  curve.D1(u, p, v);
  const sign = reversed ? -1 : 1;
  const local = vec3(dot(vec3(v.X(), v.Y(), v.Z()), frame.x) * sign, dot(vec3(v.X(), v.Y(), v.Z()), frame.y) * sign, 0);
  curve.delete();
  return unit2(v2(local.x, local.y));
};

/** A planar arrangement of sketch segments: its bounded faces and the split pieces of each segment. */
export type Arrangement = {
  faces: TopoDS_Face[];
  /** Segment id → the pieces of that segment's edge after splitting. */
  pieces: Map<string, TopoDS_Edge[]>;
};

/**
 * Splits a sketch's segments against each other and returns the bounded faces they enclose.
 *
 * A large face on the sketch plane is split by every segment edge; faces that touch the large face's boundary are
 * the unbounded outside and are discarded.
 *
 * @param oc - libcascade instance
 * @param frame - sketch frame
 * @param segments - segments with edges
 * @returns bounded faces and segment pieces
 */
export function buildArrangement(
  oc: Oc,
  frame: Frame,
  segments: ReadonlyArray<{ id: string; edge: TopoDS_Shape }>,
): Arrangement {
  if (segments.length === 0) {
    return { faces: [], pieces: new Map() };
  }

  const all = segments.map((s) => s.edge);
  const box = boundingBox(oc, compoundOf(oc, all));
  if (!box) {
    return { faces: [], pieces: new Map() };
  }

  const corners = [box.min, box.max, vec3(box.min.x, box.max.y, box.min.z), vec3(box.max.x, box.min.y, box.max.z)].map(
    (p) => toLocal(frame, p),
  );
  const pad = 10 + Math.max(...corners.map((c) => Math.max(Math.abs(c.x), Math.abs(c.y))));
  const plane = new oc.gp_Pln(new oc.gp_Ax3(pnt(oc, frame.origin), dir(oc, frame.z), dir(oc, frame.x)));
  const sheet = new oc.BRepBuilderAPI_MakeFace(plane, -pad * 2, pad * 2, -pad * 2, pad * 2).Face();
  const sheetEdges = edges(oc, sheet);

  const splitter = new oc.BRepAlgoAPI_Splitter();
  splitter.SetArguments(arrayToList(oc, [sheet]));
  splitter.SetTools(arrayToList(oc, all));
  splitter.SetFuzzyValue(1e-4);
  splitter.Build();
  if (!splitter.IsDone()) {
    splitter.delete();
    throw new OfflineEngineError('Could not split sketch segments into regions', 'internal_engine');
  }

  const result = splitter.Shape();
  const imagesOf = (shape: TopoDS_Shape): TopoDS_Edge[] => {
    const modified = listToArray(oc, splitter.Modified(shape));
    if (modified.length > 0) {
      return modified.map((s) => oc.TopoDS.Edge(s));
    }

    return splitter.IsDeleted(shape) ? [] : [oc.TopoDS.Edge(shape)];
  };

  const pieces = new Map<string, TopoDS_Edge[]>();
  for (const segment of segments) {
    pieces.set(segment.id, [...(pieces.get(segment.id) ?? []), ...imagesOf(segment.edge)]);
  }

  const outer = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  for (const edge of sheetEdges) {
    for (const image of imagesOf(edge)) {
      outer.Add(image);
    }
  }

  const bounded = faces(oc, result).filter((face) => !edges(oc, face).some((edge) => outer.Contains(edge)));
  outer.delete();
  splitter.delete();
  // Segments that meet a hair off true (sampled involutes, pattern copies) leave zero-area loops: drop them as
  // faces, and as holes punched into their neighbours.
  const minArea = 1e-6 * Math.max(1, pad * pad);
  const cleaned = bounded.flatMap((face) => {
    if (areaOf(oc, face) < minArea) {
      return [];
    }

    return [withoutTinyHoles(oc, face, minArea)];
  });
  return { faces: cleaned, pieces };
}

/**
 * Rebuilds a planar face without inner wires that enclose a negligible area.
 *
 * @param oc - libcascade instance
 * @param face - planar face
 * @param minArea - area below which an inner wire is dropped
 * @returns the face, rebuilt only when a wire was dropped
 */
function withoutTinyHoles(oc: Oc, face: TopoDS_Face, minArea: number): TopoDS_Face {
  const outerWire = oc.BRepTools.OuterWire(face);
  const inner: Array<ReturnType<Oc['TopoDS']['Wire']>> = [];
  let dropped = false;
  const explorer = new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
  for (; explorer.More(); explorer.Next()) {
    const wire = oc.TopoDS.Wire(explorer.Current());
    if (wire.IsSame(outerWire)) {
      continue;
    }

    const loop = new oc.BRepBuilderAPI_MakeFace(wire, true);
    if (loop.IsDone() && areaOf(oc, loop.Face()) < minArea) {
      dropped = true;
    } else {
      inner.push(wire);
    }
  }

  explorer.delete();
  if (!dropped) {
    return face;
  }

  const surface = oc.BRep_Tool.Surface(face);
  const maker = new oc.BRepBuilderAPI_MakeFace(surface, outerWire, true);
  for (const wire of inner) {
    maker.Add(wire);
  }

  if (!maker.IsDone()) {
    return face;
  }

  const fixer = new oc.ShapeFix_Face(maker.Face());
  fixer.Perform();
  const rebuilt = oc.TopoDS.Face(fixer.Face());
  return rebuilt.Orientation() === face.Orientation() ? rebuilt : oc.TopoDS.Face(rebuilt.Reversed());
}

const compoundOf = (oc: Oc, shapes: readonly TopoDS_Shape[]): TopoDS_Shape => {
  const builder = new oc.BRep_Builder();
  const result = new oc.TopoDS_Compound();
  builder.MakeCompound(result);
  for (const shape of shapes) {
    builder.Add(result, shape);
  }

  builder.delete();
  return result;
};

/**
 * Oriented edges of a face, in wire order.
 *
 * @param oc - libcascade instance
 * @param face - face
 * @returns edges as the face's wires traverse them
 */
export function orientedFaceEdges(oc: Oc, face: TopoDS_Face): TopoDS_Edge[] {
  const out: TopoDS_Edge[] = [];
  const wires = new oc.TopExp_Explorer(face, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
  for (; wires.More(); wires.Next()) {
    const wire = oc.TopoDS.Wire(wires.Current());
    const walker = new oc.BRepTools_WireExplorer(wire, face);
    // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
    for (; walker.More(); walker.Next()) {
      out.push(walker.Current());
    }

    walker.delete();
  }

  wires.delete();
  return out;
}

/**
 * Chooses the region `create_region` describes: the bounded face traced from `segment` onto `intersection`
 * at their chosen intersection point, turning counter-clockwise unless `clockwise`.
 *
 * @param oc - libcascade instance
 * @param arrangement - the path's arrangement
 * @param firstSegmentId - first segment
 * @param intersectionId - second segment (may equal the first)
 * @param intersectionIndex - which intersection along the first segment; negative counts from the end
 * @param clockwise - traversal direction
 * @returns the chosen face
 */
// oxlint-disable-next-line max-params -- mirrors the wire command fields
export function selectRegion(
  oc: Oc,
  arrangement: Arrangement,
  firstSegmentId: string,
  intersectionId: string,
  intersectionIndex: number,
  clockwise: boolean,
): TopoDS_Face {
  let segmentId = firstSegmentId;
  let sPieces = arrangement.pieces.get(segmentId) ?? [];
  let tPieces = arrangement.pieces.get(intersectionId) ?? [];
  if (sPieces.length === 0 && tPieces.length > 0) {
    // The first segment is construction geometry the engine never received; trace from the second alone.
    sPieces = tPieces;
    tPieces = [];
    segmentId = intersectionId;
  }

  const contains = (list: readonly TopoDS_Edge[], edge: TopoDS_Shape): boolean =>
    list.some((piece) => piece.IsSame(edge));
  const candidates = arrangement.faces.filter((face) => edges(oc, face).some((edge) => contains(sPieces, edge)));
  if (candidates.length === 0) {
    throw new OfflineEngineError('Region segment does not bound any closed area', 'bad_request');
  }

  if (segmentId !== intersectionId && tPieces.length > 0) {
    const shared = intersectionVertices(oc, sPieces, tPieces);
    if (shared.length > 0) {
      const index = intersectionIndex < 0 ? shared.length + intersectionIndex : intersectionIndex;
      const point = shared[Math.min(Math.max(index, 0), shared.length - 1)]!;
      const matches = candidates.filter((face) => {
        const oriented = orientedFaceEdges(oc, face);
        return oriented.some((edge, position) => {
          if (!contains(sPieces, edge)) {
            return false;
          }

          const next = oriented[(position + 1) % oriented.length]!;
          const previous = oriented[(position - 1 + oriented.length) % oriented.length]!;
          const last = oc.TopExp.LastVertex(edge, true);
          const first = oc.TopExp.FirstVertex(edge, true);
          return clockwise
            ? first.IsSame(point) && contains(tPieces, previous)
            : last.IsSame(point) && contains(tPieces, next);
        });
      });
      if (matches.length > 0) {
        return matches[0]!;
      }

      const both = candidates.filter((face) => edges(oc, face).some((edge) => contains(tPieces, edge)));
      if (both.length > 0) {
        return both[0]!;
      }
    }
  }

  // One segment: the region lies left of the segment (counter-clockwise) or right of it (clockwise).
  const withSide = candidates.find((face) =>
    orientedFaceEdges(oc, face).some((edge) => {
      const piece = sPieces.find((p) => p.IsSame(edge));
      if (!piece) {
        return false;
      }

      const sameDirection = edge.Orientation() === piece.Orientation();
      return clockwise ? !sameDirection : sameDirection;
    }),
  );
  return (withSide ?? candidates[0])!;
}

const intersectionVertices = (
  oc: Oc,
  sPieces: readonly TopoDS_Edge[],
  tPieces: readonly TopoDS_Edge[],
): Array<InstanceType<Oc['TopoDS_Vertex']>> => {
  const found: Array<{ vertex: InstanceType<Oc['TopoDS_Vertex']>; parameter: number }> = [];
  for (const s of sPieces) {
    for (const vertexShape of [oc.TopExp.FirstVertex(s, false), oc.TopExp.LastVertex(s, false)]) {
      if (found.some((f) => f.vertex.IsSame(vertexShape))) {
        continue;
      }

      const onT = tPieces.some(
        (t) =>
          oc.TopExp.FirstVertex(t, false).IsSame(vertexShape) || oc.TopExp.LastVertex(t, false).IsSame(vertexShape),
      );
      if (onT) {
        found.push({ vertex: vertexShape, parameter: oc.BRep_Tool.Parameter(vertexShape, s) });
      }
    }
  }

  return found.sort((a, b) => a.parameter - b.parameter).map((f) => f.vertex);
};

/**
 * Finds the bounded face containing a plane-local point.
 *
 * @param oc - libcascade instance
 * @param arrangement - the path's arrangement
 * @param frame - sketch frame
 * @param point - plane-local query point
 * @returns the face
 */
export function regionAtPoint(oc: Oc, arrangement: Arrangement, frame: Frame, point: Vec2): TopoDS_Face {
  const p = pnt(oc, toGlobal(frame, point.x, point.y));
  let onBoundary: TopoDS_Face | undefined;
  for (const face of arrangement.faces) {
    const classifier = new oc.BRepClass_FaceClassifier(face, p, 1e-6, false, 1e-6);
    const state = classifier.State();
    classifier.delete();
    if (state === oc.TopAbs_State.TopAbs_IN) {
      return face;
    }

    if (state === oc.TopAbs_State.TopAbs_ON) {
      onBoundary ??= face;
    }
  }

  if (onBoundary) {
    // A point on a boundary edge (often a symmetry axis) picks the closed area beside it.
    return onBoundary;
  }

  throw new OfflineEngineError('Query point is not inside any closed region of the sketch', 'bad_request');
}

/**
 * Faces a path encloses: every bounded face of its arrangement, minus its holes.
 *
 * @param oc - libcascade instance
 * @param path - path
 * @param holes - hole paths
 * @returns profile faces and the segment pieces
 */
export function pathFaces(oc: Oc, path: PathEntity, holes: readonly PathEntity[]): Arrangement {
  // A path's regions are often created one command at a time; reuse its arrangement while the path is unchanged.
  const key = [path.segments.length, ...holes.map((hole) => `${hole.id}:${hole.segments.length}`)].join('|');
  const cached = arrangementCache.get(path);
  if (cached?.key === key) {
    return cached.arrangement;
  }

  const arrangement = simpleLoopArrangement(oc, path, holes) ?? splitArrangement(oc, path, holes);
  arrangementCache.set(path, { key, arrangement });
  return arrangement;
}

const arrangementCache = new WeakMap<PathEntity, { key: string; arrangement: Arrangement }>();

const splitArrangement = (oc: Oc, path: PathEntity, holes: readonly PathEntity[]): Arrangement => {
  const segments = [...path.segments, ...holes.flatMap((hole) => hole.segments)];
  const arrangement = buildArrangement(oc, path.frame, segments);
  return holes.length === 0 ? arrangement : dropHoleFaces(oc, arrangement, holes);
};

const samePoint = (a: Vec2, b: Vec2): boolean => Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9;

/**
 * The wire of one closed loop of segments, each segment's end meeting the next one's start, and each segment's edge
 * as it lies in the wire.
 *
 * @param oc - libcascade instance
 * @param segments - the loop's segments in order
 * @returns the wire and the segment pieces, or undefined when the segments are not one closed chain
 */
const loopWire = (
  oc: Oc,
  segments: readonly PathSegment[],
):
  | {
      wire: ReturnType<Oc['TopoDS']['Wire']>;
      pieces: Map<string, TopoDS_Edge[]>;
    }
  | undefined => {
  if (segments.length === 0 || !samePoint(segments.at(-1)!.end, segments[0]!.start)) {
    return undefined;
  }

  const maker = new oc.BRepBuilderAPI_MakeWire();
  const pieces = new Map<string, TopoDS_Edge[]>();
  try {
    for (const [index, segment] of segments.entries()) {
      if (index > 0 && !samePoint(segments[index - 1]!.end, segment.start)) {
        return undefined;
      }

      maker.Add(segment.edge);
      if (!maker.IsDone()) {
        return undefined;
      }

      // The wire may rebuild an edge to share its neighbour's vertex.
      pieces.set(segment.id, [...(pieces.get(segment.id) ?? []), maker.Edge()]);
    }

    return { wire: maker.Wire(), pieces };
  } finally {
    maker.delete();
  }
};

/**
 * The arrangement of a path that is one simple closed loop, with simple closed loops as holes, built directly as a
 * face instead of splitting a sheet with every segment. Most sketches are such loops, and the general splitter costs
 * tens of milliseconds per region. Anything else (several sub-paths, crossing or touching segments, a hole outside
 * the profile) returns undefined and takes the splitter.
 *
 * @param oc - libcascade instance
 * @param path - path
 * @param holes - hole paths
 * @returns the one face and the segment pieces, or undefined
 */
function simpleLoopArrangement(oc: Oc, path: PathEntity, holes: readonly PathEntity[]): Arrangement | undefined {
  const loops = [path, ...holes].map((loop) => loopWire(oc, loop.segments));
  if (loops.some((loop) => !loop)) {
    return undefined;
  }

  const plane = new oc.gp_Pln(new oc.gp_Ax3(pnt(oc, path.frame.origin), dir(oc, path.frame.z), dir(oc, path.frame.x)));
  // A loop running clockwise about the sketch normal makes a face of negative area; the outer boundary must run
  // counter-clockwise and holes clockwise, like the faces the splitter cuts from a sheet facing the normal.
  const oriented = (wire: ReturnType<Oc['TopoDS']['Wire']>, outer: boolean): ReturnType<Oc['TopoDS']['Wire']> => {
    const maker = new oc.BRepBuilderAPI_MakeFace(plane, wire, true);
    const area = maker.IsDone() ? areaOf(oc, maker.Face()) : 0;
    maker.delete();
    return area > 0 === outer ? wire : oc.TopoDS.Wire(wire.Reversed());
  };

  const [outer, ...inner] = loops as Array<NonNullable<(typeof loops)[number]>>;
  const maker = new oc.BRepBuilderAPI_MakeFace(plane, oriented(outer!.wire, true), true);
  if (!maker.IsDone()) {
    maker.delete();
    return undefined;
  }

  const outerFace = maker.Face();
  for (const hole of inner) {
    maker.Add(oriented(hole.wire, false));
  }

  const face = maker.Face();
  maker.delete();
  const insideOuter = inner.every((hole) => {
    const vertex = oc.TopExp.FirstVertex(oc.TopoDS.Edge(subShapes(oc, hole.wire, 'TopAbs_EDGE')[0]!), false);
    const classifier = new oc.BRepClass_FaceClassifier(outerFace, oc.BRep_Tool.Pnt(vertex), 1e-6, false, 1e-6);
    const state = classifier.State();
    classifier.delete();
    return state === oc.TopAbs_State.TopAbs_IN;
  });
  // The topology check catches self-crossing loops and holes that cross the boundary or each other.
  if (!insideOuter || !helpersFor(oc).isValid(face) || areaOf(oc, face) <= 0) {
    return undefined;
  }

  const pieces = new Map<string, TopoDS_Edge[]>();
  for (const loop of loops) {
    for (const [id, list] of loop!.pieces) {
      pieces.set(id, [...(pieces.get(id) ?? []), ...list]);
    }
  }

  return { faces: [face], pieces };
}

const dropHoleFaces = (oc: Oc, arrangement: Arrangement, holes: readonly PathEntity[]): Arrangement => {
  const holePieces = holes.flatMap((hole) =>
    hole.segments.flatMap((segment) => arrangement.pieces.get(segment.id) ?? []),
  );
  const kept = arrangement.faces.filter((face) => {
    const faceEdges = edges(oc, face);
    // A hole's own face has only hole edges on its outer boundary.
    const outerWire = oc.BRepTools.OuterWire(face);
    const outerEdges = edges(oc, outerWire);
    return !outerEdges.every((edge) => holePieces.some((piece) => piece.IsSame(edge))) || faceEdges.length === 0;
  });
  return { faces: kept, pieces: arrangement.pieces };
};
