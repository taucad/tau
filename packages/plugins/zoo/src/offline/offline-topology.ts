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
import {
  ShapeIndex,
  compound,
  edges,
  fromPnt,
  listToArray,
  planarFaceFrame,
  pnt,
  vertices,
} from '#offline/offline-occt.js';
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

type ShapeMap = InstanceType<Oc['NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher']>;

/**
 * An id table's shapes in a libcascade indexed map. `ids` and `shapes` are the table entries it was built from;
 * `firstIds[index - 1]` is the first id whose shape has map index `index`.
 */
type IdLookup = {
  readonly map: ShapeMap;
  readonly ids: string[];
  readonly shapes: TopoDS_Shape[];
  readonly firstIds: string[];
};

const idLookups = new WeakMap<ReadonlyMap<string, TopoDS_Shape>, IdLookup>();
// A lookup's map lives on the libcascade heap: free it once its table is gone.
const releaseLookup = new FinalizationRegistry<ShapeMap>((map) => {
  map.delete();
});

const addToLookup = (lookup: IdLookup, id: string, shape: TopoDS_Shape): void => {
  // `Add` returns the shape's existing index when the table already lists it, so the first id keeps it.
  if (lookup.map.Add(shape) > lookup.firstIds.length) {
    lookup.firstIds.push(id);
  }

  lookup.ids.push(id);
  lookup.shapes.push(shape);
};

/**
 * The indexed map of an id table, rebuilt only when the table's entries changed since the last lookup.
 *
 * @param oc - libcascade instance
 * @param table - id to sub-shape table
 * @returns the table's lookup
 */
function idLookupFor(oc: Oc, table: ReadonlyMap<string, TopoDS_Shape>): IdLookup {
  const cached = idLookups.get(table);
  if (cached?.ids.length === table.size) {
    let position = 0;
    let unchanged = true;
    for (const [id, shape] of table) {
      if (cached.ids[position] !== id || cached.shapes[position] !== shape) {
        unchanged = false;
        break;
      }

      position++;
    }

    if (unchanged) {
      return cached;
    }
  }

  if (cached) {
    releaseLookup.unregister(cached);
    cached.map.delete();
  }

  const lookup: IdLookup = {
    map: new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher(),
    ids: [],
    shapes: [],
    firstIds: [],
  };
  for (const [id, shape] of table) {
    addToLookup(lookup, id, shape);
  }

  idLookups.set(table, lookup);
  releaseLookup.register(table, lookup.map, lookup);
  return lookup;
}

/**
 * Finds the id of a sub-shape in an id table, minting and recording a new one when the sub-shape has none.
 *
 * The table's shapes are kept in a libcascade indexed map, which matches shapes as `IsSame` does, so a lookup is one
 * hash probe; the map is rebuilt only when the table changed since its previous lookup.
 *
 * @param oc - libcascade instance
 * @param table - id to sub-shape table
 * @param shape - sub-shape to look up
 * @param mint - id factory
 * @returns face id
 */
export function idForSubShape(
  oc: Oc,
  table: Map<string, TopoDS_Shape>,
  shape: TopoDS_Shape,
  mint: () => string,
): string {
  const lookup = idLookupFor(oc, table);
  const index = lookup.map.FindIndex(shape);
  if (index > 0) {
    return lookup.firstIds[index - 1]!;
  }

  const id = mint();
  table.set(id, shape);
  addToLookup(lookup, id, shape);
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

type AncestorMap = InstanceType<
  Oc['NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher']
>;

/**
 * Maps each vertex of a shape to the edges that meet there.
 *
 * @param oc - libcascade instance
 * @param shape - shape whose edges are mapped
 * @returns vertex to edges map; the caller deletes it
 */
function edgesByVertex(oc: Oc, shape: TopoDS_Shape): AncestorMap {
  const map = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapesAndUniqueAncestors(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    map,
    false,
  );
  return map;
}

/**
 * The ancestors an ancestor map lists for a sub-shape.
 *
 * @param oc - libcascade instance
 * @param map - ancestor map
 * @param shape - mapped sub-shape
 * @returns its ancestors in exploration order, or none when it is not mapped; the caller deletes them
 */
function ancestorsOf(oc: Oc, map: AncestorMap, shape: TopoDS_Shape): TopoDS_Shape[] {
  const index = map.FindIndex(shape);
  if (index === 0) {
    return [];
  }

  const list = map.FindFromIndex(index);
  const found = listToArray(oc, list);
  list.delete();
  return found;
}

/**
 * Faces of a shape that contain an edge, in the shape's face exploration order.
 *
 * @param oc - libcascade instance
 * @param shape - solid shape
 * @param edge - edge
 * @returns adjacent faces
 */
export function facesOfEdge(oc: Oc, shape: TopoDS_Shape, edge: TopoDS_Shape): TopoDS_Face[] {
  // One native pass maps every edge to its faces, each listed once in exploration order.
  const ancestors =
    new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
  try {
    oc.TopExp.MapShapesAndUniqueAncestors(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      ancestors,
      false,
    );
    return ancestorsOf(oc, ancestors, edge).map((face) => {
      const typed = oc.TopoDS.Face(face);
      face.delete();
      return typed;
    });
  } finally {
    ancestors.delete();
  }
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
  const keep = (test: (edge: TopoDS_Edge) => boolean): void => {
    candidates = candidates.filter((edge) => {
      if (test(edge)) {
        return true;
      }

      edge.delete();
      return false;
    });
  };

  // Each face's sub-shapes go in one indexed map, so membership is a hash probe instead of an `IsSame` scan.
  const withIndex = (shape: TopoDS_Shape, kind: 'TopAbs_EDGE' | 'TopAbs_VERTEX', use: (index: ShapeIndex) => void) => {
    const index = new ShapeIndex(oc, shape, [kind]);
    try {
      use(index);
    } finally {
      index.delete();
    }
  };

  for (const face of sideFaces.slice(1)) {
    withIndex(face, 'TopAbs_EDGE', (faceEdges) => {
      keep((edge) => faceEdges.has(edge));
    });
  }

  if (sideFaces.length === 1 && endFaces.length > 0) {
    // One side face: the edge is the one bounded by the end faces.
    const endFaceEdges = endFaces.map((face) => new ShapeIndex(oc, face, ['TopAbs_EDGE']));
    try {
      keep((edge) => endFaceEdges.every((index) => !index.has(edge)));
    } finally {
      for (const index of endFaceEdges) {
        index.delete();
      }
    }
  }

  for (const end of endFaces) {
    withIndex(end, 'TopAbs_VERTEX', (endVertices) => {
      keep((edge) => {
        const edgeVertices = vertices(oc, edge);
        const touches = edgeVertices.some((vertex) => endVertices.has(vertex));
        for (const vertex of edgeVertices) {
          vertex.delete();
        }

        return touches;
      });
    });
  }

  return candidates;
}

/**
 * The edge of a shape nearest a point; the first in exploration order wins a tie.
 *
 * One distance computation measures the point against a compound of the shape's edges. Every solution's support is
 * an edge, or a vertex that stands for each edge meeting there; the nearest of those, scanned in exploration order
 * with the same 1e-9 tie tolerance as a per-edge scan, wins.
 *
 * @param oc - libcascade instance
 * @param shape - solid shape
 * @param point - query point
 * @returns the nearest edge, or undefined when the shape has no edges
 */
export function closestEdge(oc: Oc, shape: TopoDS_Shape, point: Vec3): TopoDS_Edge | undefined {
  const edgeIndex = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, edgeIndex);
  const edgeCount = edgeIndex.Extent();
  if (edgeCount === 0) {
    edgeIndex.delete();
    return undefined;
  }

  const edgeShapes = Array.from({ length: edgeCount }, (_, index) => edgeIndex.FindKey(index + 1));
  const wire = compound(oc, edgeShapes);
  for (const edge of edgeShapes) {
    edge.delete();
  }

  const probePoint = pnt(oc, point);
  const probeBuilder = new oc.BRepBuilderAPI_MakeVertex(probePoint);
  const probe = probeBuilder.Vertex();
  const extrema = new oc.BRepExtrema_DistShapeShape(
    probe,
    wire,
    oc.Extrema_ExtFlag.Extrema_ExtFlag_MIN,
    oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad,
  );
  let vertexEdges: AncestorMap | undefined;
  try {
    if (!extrema.IsDone()) {
      return undefined;
    }

    // Nearest distance per edge index among the solutions.
    const distances = new Map<number, number>();
    const record = (index: number, distance: number): void => {
      const known = distances.get(index);
      if (index > 0 && (known === undefined || distance < known)) {
        distances.set(index, distance);
      }
    };
    const solutionCount = extrema.NbSolution();
    for (let solution = 1; solution <= solutionCount; solution++) {
      const onShape = extrema.PointOnShape2(solution);
      const at = fromPnt(onShape);
      onShape.delete();
      const distance = Math.hypot(at.x - point.x, at.y - point.y, at.z - point.z);
      const support = extrema.SupportOnShape2(solution);
      if (extrema.SupportTypeShape2(solution) === oc.BRepExtrema_SupportType.BRepExtrema_IsVertex) {
        vertexEdges ??= edgesByVertex(oc, wire);
        for (const edge of ancestorsOf(oc, vertexEdges, support)) {
          record(edgeIndex.FindIndex(edge), distance);
          edge.delete();
        }
      } else {
        record(edgeIndex.FindIndex(support), distance);
      }

      support.delete();
    }

    // The per-edge scan this replaces: a later edge wins only when it is more than 1e-9 nearer.
    let best: { index: number; distance: number } | undefined;
    for (const [index, distance] of [...distances].sort(([left], [right]) => left - right)) {
      if (!best || distance < best.distance - 1e-9) {
        best = { index, distance };
      }
    }

    if (!best) {
      return undefined;
    }

    const found = edgeIndex.FindKey(best.index);
    const edge = oc.TopoDS.Edge(found);
    found.delete();
    return edge;
  } finally {
    vertexEdges?.delete();
    extrema.delete();
    probe.delete();
    probeBuilder.delete();
    probePoint.delete();
    wire.delete();
    edgeIndex.delete();
  }
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
