/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* eslint-disable @typescript-eslint/naming-convention -- structural types mirror libcascade method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * Face and edge id bookkeeping across libcascade operations.
 *
 * kcl-lib keeps the face and edge ids the engine returned and uses them in later commands (sketch on a face,
 * fillet a tagged edge, shell a face). Every operation that rebuilds a shape remaps those ids through the
 * operation's history so they keep pointing at the right sub-shapes.
 */
import type { Frame, Vec3 } from '#offline/offline-math.js';
import { cross, dot, frameFromAxes, length, normalize, sub, vec3 } from '#offline/offline-math.js';
import type { Oc, TopoDS_Edge, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import { ShapeIndex, edges, faces, listToArray, planarFaceFrame, pnt, vertices } from '#offline/offline-occt.js';
import type { SolidEntity } from '#offline/offline-scene.js';
import { OfflineEngineError } from '#offline/offline-engine.types.js';

/** The error an edge reference that names no edge fails with. */
export const noEdgeMatches = 'No edge matches the edge reference';

/** History of one operation: images of a sub-shape, or undefined when it was deleted. */
export type ShapeHistory = (shape: TopoDS_Shape) => TopoDS_Shape[] | undefined;

/** Anything with libcascade's `Modified` / `IsDeleted` history. */
type HistoryAlgo = {
  Modified(shape: TopoDS_Shape): ReturnType<Oc['BRepBuilderAPI_MakeShape']['prototype']['Modified']>;
  IsDeleted(shape: TopoDS_Shape): boolean;
};

/**
 * History adapter for a `BRepBuilderAPI_MakeShape` or `BRepAlgoAPI_*` operation.
 *
 * @param oc - libcascade instance
 * @param algo - finished operation
 * @returns history function
 */
export function algoHistory(oc: Oc, algo: HistoryAlgo): ShapeHistory {
  return (shape) => {
    const modified = listToArray(oc, algo.Modified(shape));
    if (modified.length > 0) {
      return modified;
    }

    return algo.IsDeleted(shape) ? undefined : [shape];
  };
}

/**
 * Remaps an id → sub-shape table into a new result shape.
 *
 * @param ids - current table
 * @param history - operation history
 * @param index - sub-shapes of the result
 * @returns remapped table; ids whose sub-shape vanished are dropped
 */
export function remapIds(
  ids: ReadonlyMap<string, TopoDS_Shape>,
  history: ShapeHistory,
  index: ShapeIndex,
): Map<string, TopoDS_Shape> {
  const out = new Map<string, TopoDS_Shape>();
  for (const [id, shape] of ids) {
    // A sub-shape that is still in the result survived, whatever the history says: libcascade's fillet and chamfer
    // report every edge they did not rebuild as deleted.
    const image = history(shape)?.find((candidate) => index.has(candidate)) ?? (index.has(shape) ? shape : undefined);
    if (image) {
      out.set(id, image);
    }
  }

  return out;
}

/**
 * Rebuilds a solid's face and edge tables after its shape changed.
 *
 * @param oc - libcascade instance
 * @param solid - solid whose tables are remapped in place
 * @param shape - the new shape
 * @param history - history from old sub-shapes to new
 */
export function rebaseSolid(oc: Oc, solid: SolidEntity, shape: TopoDS_Shape, history: ShapeHistory): void {
  const index = new ShapeIndex(oc, shape, ['TopAbs_FACE', 'TopAbs_EDGE']);
  solid.faces = remapIds(solid.faces, history, index);
  solid.edges = remapIds(solid.edges, history, index);
  index.delete();
  solid.shape = shape;
}

/**
 * Finds the id of a sub-shape in an id table, minting and recording a new one when the sub-shape has none.
 *
 * @param table - id to sub-shape table
 * @param shape - sub-shape to look up
 * @param mint - id factory
 * @returns face id
 */
export function idForSubShape(table: Map<string, TopoDS_Shape>, shape: TopoDS_Shape, mint: () => string): string {
  for (const [id, candidate] of table) {
    if (candidate.IsSame(shape)) {
      return id;
    }
  }

  const id = mint();
  table.set(id, shape);
  return id;
}

/**
 * Looks up a face of a solid by id.
 *
 * @param oc - libcascade instance
 * @param solid - solid
 * @param faceId - face id
 * @returns the face
 */
export function requireFace(oc: Oc, solid: SolidEntity, faceId: string): TopoDS_Face {
  const face = solid.faces.get(faceId);
  if (!face) {
    throw new OfflineEngineError(`Face ${faceId} is not on solid ${solid.id}`, 'bad_request');
  }

  return oc.TopoDS.Face(face);
}

/**
 * Looks up an edge of a solid by id.
 *
 * @param oc - libcascade instance
 * @param solid - solid
 * @param edgeId - edge id
 * @returns the edge
 */
export function requireEdge(oc: Oc, solid: SolidEntity, edgeId: string): TopoDS_Edge {
  const edge = solid.edges.get(edgeId);
  if (!edge) {
    throw new OfflineEngineError(`Edge ${edgeId} is not on solid ${solid.id}`, 'bad_request');
  }

  return oc.TopoDS.Edge(edge);
}

/**
 * Faces of a shape that contain an edge.
 *
 * @param oc - libcascade instance
 * @param shape - solid shape
 * @param edge - edge
 * @returns adjacent faces
 */
export function facesOfEdge(oc: Oc, shape: TopoDS_Shape, edge: TopoDS_Shape): TopoDS_Face[] {
  return faces(oc, shape).filter((face) => edges(oc, face).some((candidate) => candidate.IsSame(edge)));
}

/**
 * Edges shared by every face in a set, optionally restricted to edges touching every end face.
 *
 * @param oc - libcascade instance
 * @param sideFaces - faces the edge lies on
 * @param endFaces - faces the edge's ends touch
 * @returns candidate edges
 */
export function edgesBetween(
  oc: Oc,
  sideFaces: readonly TopoDS_Face[],
  endFaces: readonly TopoDS_Face[],
): TopoDS_Edge[] {
  if (sideFaces.length === 0) {
    return [];
  }

  let candidates = edges(oc, sideFaces[0]!);
  for (const face of sideFaces.slice(1)) {
    const faceEdges = edges(oc, face);
    candidates = candidates.filter((edge) => faceEdges.some((candidate) => candidate.IsSame(edge)));
  }

  if (sideFaces.length === 1 && endFaces.length > 0) {
    // One side face: the edge is the one bounded by the end faces.
    const endFaceEdges = endFaces.map((face) => edges(oc, face));
    candidates = candidates.filter((edge) => endFaceEdges.every((list) => !list.some((other) => other.IsSame(edge))));
  }

  for (const end of endFaces) {
    const endVertices = vertices(oc, end);
    candidates = candidates.filter((edge) =>
      vertices(oc, edge).some((vertex) => endVertices.some((candidate) => candidate.IsSame(vertex))),
    );
  }

  return candidates;
}

/**
 * The edge of a shape nearest a point; the first in exploration order wins a tie.
 *
 * @param oc - libcascade instance
 * @param shape - solid shape
 * @param point - query point
 * @returns the nearest edge, or undefined when the shape has no edges
 */
export function closestEdge(oc: Oc, shape: TopoDS_Shape, point: Vec3): TopoDS_Edge | undefined {
  const probe = new oc.BRepBuilderAPI_MakeVertex(pnt(oc, point)).Vertex();
  let best: { edge: TopoDS_Edge; distance: number } | undefined;
  for (const edge of edges(oc, shape)) {
    const extrema = new oc.BRepExtrema_DistShapeShape(
      probe,
      edge,
      oc.Extrema_ExtFlag.Extrema_ExtFlag_MIN,
      oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad,
    );
    if (extrema.IsDone() && (!best || extrema.Value() < best.distance - 1e-9)) {
      best = { edge, distance: extrema.Value() };
    }

    extrema.delete();
  }

  return best?.edge;
}

const shareVertex = (oc: Oc, a: TopoDS_Shape, b: TopoDS_Shape): boolean => {
  const av = vertices(oc, a);
  return vertices(oc, b).some((vertex) => av.some((candidate) => candidate.IsSame(vertex)));
};

/**
 * The edge across a face from `edge`: the face's edge that shares no vertex with it.
 *
 * @param oc - libcascade instance
 * @param face - face
 * @param edge - edge on the face
 * @returns the opposite edge
 */
export function oppositeEdge(oc: Oc, face: TopoDS_Face, edge: TopoDS_Edge): TopoDS_Edge {
  const candidate = edges(oc, face).find(
    (item) => !item.IsSame(edge) && !shareVertex(oc, item, edge) && !oc.BRep_Tool.IsClosed(item, face),
  );
  const fallback = edges(oc, face).filter(
    (candidate) => !candidate.IsSame(edge) && !oc.BRep_Tool.IsClosed(candidate, face),
  );
  const found = candidate ?? fallback.at(-1);
  if (!found) {
    throw new OfflineEngineError('No opposite edge on this face', 'bad_request');
  }

  return found;
}

/**
 * The face edge that meets `edge` at its last (`next`) or first (`previous`) vertex.
 *
 * @param oc - libcascade instance
 * @param face - face
 * @param edge - edge on the face, oriented as tracked
 * @param which - `next` or `previous`
 * @returns the adjacent edge, or undefined
 */
export function adjacentEdge(
  oc: Oc,
  face: TopoDS_Face,
  edge: TopoDS_Edge,
  which: 'next' | 'previous',
): TopoDS_Edge | undefined {
  const vertex = which === 'next' ? oc.TopExp.LastVertex(edge, true) : oc.TopExp.FirstVertex(edge, true);
  return edges(oc, face).find(
    (candidate) =>
      !candidate.IsSame(edge) &&
      vertices(oc, candidate).some((v) => v.IsSame(vertex)) &&
      !oc.BRep_Tool.IsClosed(candidate, face),
  );
}

/**
 * The local frame the engine uses for a planar face: z along the outward normal, origin at the global origin's
 * projection, and y along the extrusion on an extrusion's side face (x = y × z). Other faces take x horizontal, so
 * that y points up on vertical faces.
 *
 * @param oc - libcascade instance
 * @param face - planar face
 * @param sweepDirection - extrusion direction when the face is an extrusion's side face
 * @returns the face frame
 */
export function faceSketchFrame(oc: Oc, face: TopoDS_Face, sweepDirection?: Vec3): Frame {
  const plane = planarFaceFrame(oc, face);
  if (!plane) {
    throw new OfflineEngineError('Cannot sketch on a non-planar face', 'bad_request');
  }

  const { z } = plane;
  const offset = dot(plane.origin, z);
  const origin = vec3(z.x * offset, z.y * offset, z.z * offset);
  if (sweepDirection) {
    // An extrusion's side face: y runs along the extrusion, x = y × z.
    const along = sub(
      sweepDirection,
      vec3(z.x * dot(sweepDirection, z), z.y * dot(sweepDirection, z), z.z * dot(sweepDirection, z)),
    );
    if (length(along) > 1e-6) {
      const y = normalize(along);
      return frameFromAxes(origin, cross(y, z), y);
    }
  }

  const up = vec3(0, 0, 1);
  let x = cross(up, z);
  if (length(x) < 1e-6) {
    // A horizontal face, seen from outside with +Y up: x is +X on a top face and -X on a bottom face.
    x = vec3(z.z > 0 ? 1 : -1, 0, 0);
  }

  x = normalize(sub(x, vec3(z.x * dot(x, z), z.y * dot(x, z), z.z * dot(x, z))));
  const y = cross(z, x);
  return frameFromAxes(origin, x, y);
}
