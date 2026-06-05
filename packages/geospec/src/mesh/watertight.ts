import type { Document } from '@gltf-transform/core';
import type { WatertightPrimitiveBreakdown, WatertightResult } from '#mesh/types.js';
import { buildMeshNodeNameMap } from '#mesh/connected-components.js';
import { weldPositions } from '#mesh/_internal/spatial-welding.js';

/**
 * Maximum fraction of edges allowed to be boundary (shared by 1 triangle) or
 * non-manifold (shared by >2 triangles) before the mesh is considered open.
 *
 * Real CAD tessellation can produce a handful of singular vertices at poles or
 * tiny gaps along intersection curves. A strict zero-tolerance check rejects
 * meshes that are physically watertight for fabrication purposes, so we allow
 * a small percentage of imperfect edges.
 */
const irregularEdgeTolerance = 0.01;

type EdgeTopology = {
  irregularEdges: number;
  totalEdges: number;
  boundaryEdges: number;
  boundaryCentroid: [number, number, number];
};

const emptyCentroid = (): [number, number, number] => [0, 0, 0];

const classifyEdges = (
  allPositions: Array<[number, number, number]>,
  allTriangles: Array<[number, number, number]>,
): EdgeTopology => {
  if (allTriangles.length === 0) {
    return { irregularEdges: 0, totalEdges: 0, boundaryEdges: 0, boundaryCentroid: emptyCentroid() };
  }

  const vertexMap = weldPositions(allPositions);

  const edgeCounts = new Map<string, number>();

  for (const tri of allTriangles) {
    const v0 = vertexMap[tri[0]]!;
    const v1 = vertexMap[tri[1]]!;
    const v2 = vertexMap[tri[2]]!;

    const edges: Array<[number, number]> = [
      [Math.min(v0, v1), Math.max(v0, v1)],
      [Math.min(v1, v2), Math.max(v1, v2)],
      [Math.min(v0, v2), Math.max(v0, v2)],
    ];

    for (const [a, b] of edges) {
      const key = `${a},${b}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let irregularEdges = 0;
  let boundaryEdges = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;

  for (const [key, count] of edgeCounts) {
    if (count !== 2) {
      irregularEdges++;
    }
    if (count === 1) {
      boundaryEdges++;
      const parts = key.split(',');
      const a = Number.parseInt(parts[0] ?? '0', 10);
      const b = Number.parseInt(parts[1] ?? '0', 10);
      const [ax, ay, az] = allPositions[a]!;
      const [bx2, by2, bz2] = allPositions[b]!;
      bx += (ax + bx2) / 2;
      by += (ay + by2) / 2;
      bz += (az + bz2) / 2;
    }
  }

  const centroid: [number, number, number] =
    boundaryEdges > 0 ? [bx / boundaryEdges, by / boundaryEdges, bz / boundaryEdges] : emptyCentroid();

  return {
    irregularEdges,
    totalEdges: edgeCounts.size,
    boundaryEdges,
    boundaryCentroid: centroid,
  };
};

type WatertightPrimSlice = { name: string; start: number; triCount: number };

const collectWatertightGeometry = (
  document: Document,
): {
  allPositions: Array<[number, number, number]>;
  allTriangles: Array<[number, number, number]>;
  slices: WatertightPrimSlice[];
} => {
  const meshes = document.getRoot().listMeshes();
  const meshNodeNames = buildMeshNodeNameMap(document);

  const allPositions: Array<[number, number, number]> = [];
  const allTriangles: Array<[number, number, number]> = [];
  let vertexOffset = 0;
  const slices: WatertightPrimSlice[] = [];

  for (const mesh of meshes) {
    const trimmedMeshName = mesh.getName().trim();
    const nodeMappedName = meshNodeNames.get(mesh);
    const resolvedMeshName =
      trimmedMeshName === ''
        ? nodeMappedName !== undefined && nodeMappedName !== ''
          ? nodeMappedName
          : undefined
        : trimmedMeshName;
    const fallbackName = resolvedMeshName ?? `Mesh_${slices.length}`;
    let primOrdinal = 0;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }

      const posAccessor = primitive.getAttribute('POSITION');
      const indexAccessor = primitive.getIndices();
      if (!posAccessor) {
        continue;
      }

      const vCount = posAccessor.getCount();
      const indexCount = indexAccessor?.getCount() ?? vCount;
      const name =
        resolvedMeshName && resolvedMeshName.length > 0 ? resolvedMeshName : `${fallbackName}#${primOrdinal}`;
      primOrdinal += 1;

      const start = allTriangles.length;
      for (let i = 0; i < vCount; i++) {
        allPositions.push(posAccessor.getElement(i, [0, 0, 0]));
      }

      for (let i = 0; i < indexCount; i += 3) {
        allTriangles.push([
          (indexAccessor?.getScalar(i) ?? i) + vertexOffset,
          (indexAccessor?.getScalar(i + 1) ?? i + 1) + vertexOffset,
          (indexAccessor?.getScalar(i + 2) ?? i + 2) + vertexOffset,
        ]);
      }

      slices.push({ name, start, triCount: indexCount / 3 });
      vertexOffset += vCount;
    }
  }

  return { allPositions, allTriangles, slices };
};

const buildPerPrimitiveBreakdowns = (
  slices: readonly WatertightPrimSlice[],
  allPositions: Array<[number, number, number]>,
  allTriangles: Array<[number, number, number]>,
): WatertightPrimitiveBreakdown[] => {
  const perPrimitive: WatertightPrimitiveBreakdown[] = [];
  for (const slice of slices) {
    const endTri = slice.start + slice.triCount;
    const localPositions: Array<[number, number, number]> = [];
    const localTriangles: Array<[number, number, number]> = [];
    let minV = Infinity;
    let maxV = -1;
    for (let t = slice.start; t < endTri; t++) {
      const tri = allTriangles[t]!;
      for (const vi of tri) {
        if (vi < minV) {
          minV = vi;
        }
        if (vi > maxV) {
          maxV = vi;
        }
      }
    }
    if (minV === Infinity) {
      continue;
    }
    for (let i = minV; i <= maxV; i++) {
      localPositions.push(allPositions[i]!);
    }
    const offset = minV;
    for (let t = slice.start; t < endTri; t++) {
      const [a, b, c] = allTriangles[t]!;
      localTriangles.push([a - offset, b - offset, c - offset]);
    }
    const local = classifyEdges(localPositions, localTriangles);
    perPrimitive.push({
      name: slice.name,
      boundaryEdges: local.boundaryEdges,
      loopCentroid: local.boundaryCentroid,
    });
  }

  perPrimitive.sort((a, b) => b.boundaryEdges - a.boundaryEdges);
  return perPrimitive;
};

/**
 * Global watertight analysis plus per-primitive local boundary breakdown.
 *
 * @param document - A glTF-Transform document to analyse.
 * @returns Watertight verdict, global edge counts, and per-primitive boundary diagnostics.
 * @public
 */
export const analyseWatertight = (document: Document): WatertightResult => {
  const { allPositions, allTriangles, slices } = collectWatertightGeometry(document);

  if (allTriangles.length === 0) {
    return {
      watertight: false,
      irregularEdges: 0,
      openBoundaryEdges: 0,
      totalEdges: 0,
      irregularEdgeFraction: 1,
      perPrimitive: [],
    };
  }

  const global = classifyEdges(allPositions, allTriangles);
  const irregularEdgeFraction = global.totalEdges > 0 ? global.irregularEdges / global.totalEdges : 0;
  const watertight = irregularEdgeFraction <= irregularEdgeTolerance;

  const perPrimitive = buildPerPrimitiveBreakdowns(slices, allPositions, allTriangles);

  return {
    watertight,
    irregularEdges: global.irregularEdges,
    openBoundaryEdges: global.boundaryEdges,
    totalEdges: global.totalEdges,
    irregularEdgeFraction,
    perPrimitive,
  };
};

/**
 * Determines whether a mesh is watertight (closed/manifold).
 *
 * A mesh is watertight when every triangle edge is shared by exactly two
 * triangles. Boundary edges (shared by only one triangle) indicate gaps,
 * and non-manifold edges (shared by three or more) indicate self-intersections.
 *
 * Returns true when the fraction of irregular edges is within tolerance, so
 * CAD-tessellated meshes with minor pole or seam artifacts are still recognized
 * as watertight for downstream fabrication checks.
 *
 * @param document - A glTF-Transform Document
 * @returns `true` if the mesh is watertight, `false` otherwise
 * @public
 */
export const isWatertight = (document: Document): boolean => {
  return analyseWatertight(document).watertight;
};
