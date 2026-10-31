/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * Shell fallback for prismatic bodies.
 *
 * `BRepOffsetAPI_MakeThickSolid` gives up, often silently, when a wall offset makes part of the profile vanish (a
 * leg thinner than twice the wall). For a body whose removed faces are parallel planar caps, the shell is the body
 * minus a cavity: the cap's profile offset inward in 2D, where `BRepOffsetAPI_MakeOffset` simply drops the parts
 * that vanish, then extruded back through the body to the floor.
 */
import type { Vec3 } from '#offline/offline-math.js';
import { dot, scale, sub } from '#offline/offline-math.js';
import type { Oc, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import { arrayToList, compound, edges, fromPnt, gvec, planarFaceFrame, pnt, vertices } from '#offline/offline-occt.js';
import { buildArrangement, interiorPoint } from '#offline/offline-sketch.js';

/**
 * Shells a prismatic body by cutting an inward-offset cavity through its removed caps.
 *
 * @param oc - libcascade instance
 * @param shape - the body
 * @param removed - removed faces: one planar cap, or two parallel opposite caps
 * @param thickness - wall thickness
 * @returns the shelled body, or undefined when the body does not fit this construction
 */
export function shellPrism(
  oc: Oc,
  shape: TopoDS_Shape,
  removed: readonly TopoDS_Face[],
  thickness: number,
): TopoDS_Shape | undefined {
  const cap = removed[0];
  const capFrame = cap && planarFaceFrame(oc, cap);
  if (!cap || !capFrame || removed.length > 2) {
    return undefined;
  }

  const normal = capFrame.z;
  const other = removed[1] ? planarFaceFrame(oc, removed[1]) : undefined;
  if (removed[1] && (!other || dot(other.z, normal) > -1 + 1e-9)) {
    return undefined;
  }

  // Depth of the body below the cap, along the cap's inward normal.
  const heights = vertices(oc, shape).map((vertex) =>
    dot(sub(fromPnt(oc.BRep_Tool.Pnt(vertex)), capFrame.origin), normal),
  );
  const depth = -Math.min(...heights);
  if (!(depth > thickness)) {
    return undefined;
  }

  const offset = new oc.BRepOffsetAPI_MakeOffset(cap, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
  try {
    offset.Perform(-thickness, 0);
  } catch {
    return undefined;
  }

  if (!offset.IsDone()) {
    return undefined;
  }

  const offsetEdges = edges(oc, offset.Shape());
  if (offsetEdges.length === 0) {
    return undefined;
  }

  // Faces of the offset curves' arrangement that lie inside the cap, at least a wall away from its boundary.
  const arrangement = buildArrangement(
    oc,
    capFrame,
    offsetEdges.map((edge, index) => ({ id: String(index), edge })),
  );
  const boundary = compound(oc, edges(oc, cap));
  const cavityFaces = arrangement.faces.filter((face) => {
    const point = interiorPoint(oc, face);
    if (!point) {
      return false;
    }

    const inCap =
      new oc.BRepClass_FaceClassifier(cap, pnt(oc, point), 1e-7, false, 1e-7).State() === oc.TopAbs_State.TopAbs_IN;
    if (!inCap) {
      return false;
    }

    const probe = new oc.BRepBuilderAPI_MakeVertex(pnt(oc, point)).Vertex();
    const distance = new oc.BRepExtrema_DistShapeShape(
      probe,
      boundary,
      oc.Extrema_ExtFlag.Extrema_ExtFlag_MIN,
      oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad,
    );
    return distance.IsDone() && distance.Value() > thickness * (1 - 1e-6);
  });
  if (cavityFaces.length === 0) {
    return undefined;
  }

  // Start the cavity just outside the cap so the cut never meets the cap coplanar; stop a wall short of the floor,
  // or run through when the opposite cap is removed too.
  const margin = Math.max(1, thickness);
  const length = (other ? depth : depth - thickness) + margin + (other ? margin : 0);
  const start = scale(normal, margin);
  const cavity = cavityFaces.map((face) => {
    const moved = new oc.BRepBuilderAPI_Transform(face, translation(oc, start), true).Shape();
    return new oc.BRepPrimAPI_MakePrism(moved, gvec(oc, scale(normal, -length)), false, true).Shape();
  });
  const cut = new oc.BRepAlgoAPI_Cut();
  cut.SetArguments(arrayToList(oc, [shape]));
  cut.SetTools(arrayToList(oc, cavity));
  cut.Build();
  return cut.IsDone() ? cut.Shape() : undefined;
}

const translation = (oc: Oc, delta: Vec3): InstanceType<Oc['gp_Trsf']> => {
  const trsf = new oc.gp_Trsf();
  trsf.SetTranslation(gvec(oc, delta));
  return trsf;
};
