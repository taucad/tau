import type { geometries as JscadGeometries } from '@jscad/modeling';

import type { KernelIssue } from '@taucad/runtime/types';

import type { JscadPartDescriptor } from '#jscad-parts.js';

import type { JscadModeling } from '#jscad-modeling.js';

type JscadPoly3 = JscadGeometries.poly3.Poly3;
type Vec3 = [number, number, number];

/** Outcome of a JSCAD structural check, mirroring `geom3.validate`'s throw/pass contract. */
export type JscadValidation = { valid: true } | { valid: false; message: string };

/** Undirected topology counts derived from one directed half-edge ledger. */
export type JscadEdgeLedgerSummary = {
  irregularEdges: number;
  openBoundaryEdges: number;
  nonManifoldEdges: number;
  totalEdges: number;
  /**
   * Directed half-edges whose reverse does not carry the same count — upstream
   * `geom3.validate`'s manifold condition, reported as `non-manifold edges N`.
   */
  mismatchedDirectedEdges: number;
  boundaryCentroid: Vec3;
};

/** Everything the mesh phase already knows about one part's normalized surface. */
export type JscadMeshTopology = {
  summary: JscadEdgeLedgerSummary;
  /** Fan triangles rejected as zero-area, coincident, or non-finite while meshing. */
  degenerateTriangles: number;
  /** Polygon count of the normalized (`generalize`d) shape. */
  normalizedPolygonCount: number;
  /** Flat XYZ of the emitted surface, used for the diagnostic AABB. */
  vertices: readonly number[];
};

/** Coincident-vertex welding precision shared by every JSCAD topology pass. */
const topologyHashPrecision = 10_000_000;
/** Directed edge keys pack two vertex ids; 2**26 ids keeps the packed key a safe integer. */
const vertexIdStride = 2 ** 26;

const jscadManifoldHint =
  '3D mesh CSG with overlapping, touching, or contained primitives can produce native non-manifold geom3s; prefer 2D profile composition followed by one extrudeLinear() for prismatic parts.';

const emptyLedgerSummary = (): JscadEdgeLedgerSummary => ({
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  totalEdges: 0,
  mismatchedDirectedEdges: 0,
  boundaryCentroid: [0, 0, 0],
});

const issueMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]?.trim() ?? message;
};

/**
 * Accumulate directed half-edges over welded vertices.
 *
 * This is upstream `geom3.validate`'s manifold test (every half-edge matched by
 * its reverse) plus the undirected classification Tau reports, computed once per
 * shape instead of once per validation pass.
 *
 * The weld mode is not cosmetic. `exact` reproduces upstream's full-precision
 * vertex identity and is what a raw, un-snapped geom3 must be judged on — welding
 * a raw CSG result onto a grid silently repairs it and would delete its warning.
 * `grid` is the rounding Tau's mesh path already applies when it drops degenerate
 * triangles, so the meshed verdict stays consistent with the triangles actually
 * emitted; `generalize({ snap: true })` has already made coincident vertices
 * exactly equal by then, which is why both modes agree on a normalized shape.
 *
 * @internal
 *
 * @param weld - vertex identity: `exact` float equality, or the shared rounding grid
 * @returns a ledger that assigns vertex ids, records faces, and summarizes topology
 */
export const createJscadEdgeLedger = (
  weld: 'exact' | 'grid',
): {
  vertexId: (x: number, y: number, z: number) => number;
  addTriangle: (id0: number, id1: number, id2: number) => void;
  addFace: (vertices: ReadonlyArray<readonly number[]>) => void;
  summarize: () => JscadEdgeLedgerSummary;
} => {
  const vertexIds = new Map<string, number>();
  const points: number[] = [];
  const directedEdges = new Map<number, number>();

  const vertexId = (x: number, y: number, z: number): number => {
    const key =
      weld === 'exact'
        ? `${x},${y},${z}`
        : `${Math.round(x * topologyHashPrecision)},${Math.round(y * topologyHashPrecision)},${Math.round(
            z * topologyHashPrecision,
          )}`;
    const existing = vertexIds.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = vertexIds.size;
    vertexIds.set(key, id);
    points.push(x, y, z);
    return id;
  };

  const addEdge = (from: number, to: number): void => {
    const key = from * vertexIdStride + to;
    directedEdges.set(key, (directedEdges.get(key) ?? 0) + 1);
  };

  return {
    vertexId,

    addTriangle: (id0, id1, id2) => {
      addEdge(id0, id1);
      addEdge(id1, id2);
      addEdge(id2, id0);
    },

    addFace: (vertices) => {
      const count = vertices.length;
      if (count < 3) {
        return;
      }
      const last = vertices[count - 1]!;
      let previous = vertexId(last[0] ?? 0, last[1] ?? 0, last[2] ?? 0);
      for (let index = 0; index < count; index++) {
        const vertex = vertices[index]!;
        const current = vertexId(vertex[0] ?? 0, vertex[1] ?? 0, vertex[2] ?? 0);
        addEdge(previous, current);
        previous = current;
      }
    },

    summarize: () => {
      if (directedEdges.size === 0) {
        return emptyLedgerSummary();
      }

      let irregularEdges = 0;
      let openBoundaryEdges = 0;
      let nonManifoldEdges = 0;
      let mismatchedDirectedEdges = 0;
      let totalEdges = 0;
      let boundaryX = 0;
      let boundaryY = 0;
      let boundaryZ = 0;

      for (const [key, count] of directedEdges) {
        const from = Math.floor(key / vertexIdStride);
        const to = key - from * vertexIdStride;
        const reverse = directedEdges.get(to * vertexIdStride + from) ?? 0;
        if (reverse !== count) {
          mismatchedDirectedEdges += 1;
        }
        if (reverse > 0 && from > to) {
          // The undirected edge was already classified from its other half.
          continue;
        }

        totalEdges += 1;
        const shared = count + reverse;
        if (shared !== 2) {
          irregularEdges += 1;
        }
        if (shared === 1) {
          openBoundaryEdges += 1;
          boundaryX += ((points[from * 3] ?? 0) + (points[to * 3] ?? 0)) / 2;
          boundaryY += ((points[from * 3 + 1] ?? 0) + (points[to * 3 + 1] ?? 0)) / 2;
          boundaryZ += ((points[from * 3 + 2] ?? 0) + (points[to * 3 + 2] ?? 0)) / 2;
        } else if (shared > 2) {
          nonManifoldEdges += 1;
        }
      }

      return {
        irregularEdges,
        openBoundaryEdges,
        nonManifoldEdges,
        totalEdges,
        mismatchedDirectedEdges,
        boundaryCentroid:
          openBoundaryEdges > 0
            ? [boundaryX / openBoundaryEdges, boundaryY / openBoundaryEdges, boundaryZ / openBoundaryEdges]
            : [0, 0, 0],
      };
    },
  };
};

/**
 * Structural verdict for a JSCAD shape as `geom3.validate` defines it.
 *
 * Upstream spends 95 % of `geom3.validate` rebuilding a string-keyed edge map and
 * reversing every key; the ledger answers the same manifold question from one
 * numeric pass, and upstream's own `poly3.validate` still supplies the per-polygon
 * convexity, area, duplicate-vertex, finiteness and coplanarity messages verbatim.
 *
 * @param shape - the JSCAD geom3 to validate
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns the verdict plus the polygon count the diagnostic reports
 */
const validateJscadGeom3 = (
  shape: unknown,
  modeling: JscadModeling,
): { validation: JscadValidation; polygonCount?: number } => {
  const { geom3, poly3 } = modeling.geometries;
  if (!geom3.isA(shape)) {
    return { validation: { valid: false, message: 'invalid geom3 structure' } };
  }

  // Read the stored polygons rather than `geom3.toPolygons`, which applies pending
  // transforms in place: diagnostics never mutate the nativeHandle, and a rigid
  // transform cannot change the topology this pass measures. Upstream
  // `geom3.validate` reads the same untransformed array.
  const { polygons, transforms } = shape as { polygons: JscadPoly3[]; transforms: readonly number[] };
  const ledger = createJscadEdgeLedger('exact');
  for (const polygon of polygons) {
    try {
      poly3.validate(polygon);
    } catch (error) {
      return { validation: { valid: false, message: issueMessage(error) }, polygonCount: polygons.length };
    }
    ledger.addFace(polygon.vertices as ReadonlyArray<readonly number[]>);
  }

  const { mismatchedDirectedEdges } = ledger.summarize();
  if (mismatchedDirectedEdges > 0) {
    return {
      validation: { valid: false, message: `non-manifold edges ${mismatchedDirectedEdges}` },
      polygonCount: polygons.length,
    };
  }

  if (!transforms.every((value) => Number.isFinite(value))) {
    return {
      validation: { valid: false, message: `geom3 invalid transforms ${transforms.join(',')}` },
      polygonCount: polygons.length,
    };
  }

  return { validation: { valid: true }, polygonCount: polygons.length };
};

/**
 * The verdict `geom3.validate` would return for the normalized shape the mesh was
 * built from. After `generalize({ snap: true, triangulate: true })` every polygon
 * is a triangle, so upstream's convexity and coplanarity checks are vacuous and
 * only its zero-area and manifold conditions remain — both already measured while
 * meshing.
 *
 * @param topology - welded-edge evidence collected during triangulation
 * @returns the normalized shape's structural verdict
 */
const meshValidation = (topology: JscadMeshTopology): JscadValidation => {
  if (topology.degenerateTriangles > 0) {
    return { valid: false, message: 'poly3 area must be greater than zero' };
  }
  if (topology.summary.mismatchedDirectedEdges > 0) {
    return { valid: false, message: `non-manifold edges ${topology.summary.mismatchedDirectedEdges}` };
  }
  return { valid: true };
};

const meshAabb = (vertices: readonly number[]): { min: Vec3; max: Vec3; center: Vec3 } => {
  if (vertices.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0] };
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < vertices.length; offset += 3) {
    min[0] = Math.min(min[0], vertices[offset] ?? 0);
    min[1] = Math.min(min[1], vertices[offset + 1] ?? 0);
    min[2] = Math.min(min[2], vertices[offset + 2] ?? 0);
    max[0] = Math.max(max[0], vertices[offset] ?? 0);
    max[1] = Math.max(max[1], vertices[offset + 1] ?? 0);
    max[2] = Math.max(max[2], vertices[offset + 2] ?? 0);
  }

  return { min, max, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
};

/**
 * Non-fatal JSCAD topology diagnostic for one meshed part.
 *
 * The diagnostics are export-only evidence: nothing here mutates the part's
 * nativeHandle. The normalized verdict and the topology summary are read off the
 * mesh the GLB packer just built, so the display path normalizes exactly once.
 *
 * @internal
 *
 * @param input - the part, its meshed topology, and the resolved modeling API
 * @returns a warning issue when the part is not a closed oriented solid
 */
export const jscadPartIssue = (input: {
  part: JscadPartDescriptor;
  topology: JscadMeshTopology;
  modeling: JscadModeling;
}): KernelIssue | undefined => {
  const { part, topology, modeling } = input;
  const native = validateJscadGeom3(part.shape, modeling);
  const exportValidation = meshValidation(topology);
  if (native.validation.valid && exportValidation.valid) {
    return undefined;
  }

  return {
    code: 'GEOMETRY_INVALID',
    severity: 'warning',
    type: 'kernel',
    message: `JSCAD part '${part.name}' is not a closed oriented solid: ${
      native.validation.valid ? (exportValidation.valid ? '' : exportValidation.message) : native.validation.message
    }.`,
    details: {
      producer: {
        kernelId: 'jscad',
        validator: 'geom3.validate',
      },
      geometry: {
        partName: part.name,
        partIndex: part.index,
        sourceName: part.sourceName,
        polygonCount: native.polygonCount,
        normalizedPolygonCount: topology.normalizedPolygonCount,
        nativeValidation: native.validation,
        exportValidation,
        topology: {
          irregularEdges: topology.summary.irregularEdges,
          openBoundaryEdges: topology.summary.openBoundaryEdges,
          nonManifoldEdges: topology.summary.nonManifoldEdges,
          totalEdges: topology.summary.totalEdges,
          boundaryCentroid: topology.summary.boundaryCentroid,
          aabb: meshAabb(topology.vertices),
        },
        hints: [jscadManifoldHint],
      },
    },
  };
};
