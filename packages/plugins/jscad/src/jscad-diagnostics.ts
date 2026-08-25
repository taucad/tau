import type { geometries as JscadGeometries } from '@jscad/modeling';

import type { KernelIssue } from '@taucad/runtime/types';
import { extractMeshDataFromJscadShape, normalizeJscadShapeForRenderMesh } from '#jscad-to-gltf.js';
import type { JscadMeshData } from '#jscad-to-gltf.js';

import { isRenderableJscadPart } from '#jscad-parts.js';
import type { JscadPartDescriptor } from '#jscad-parts.js';

import type { JscadModeling } from '#jscad-modeling.js';

type JscadGeom3 = JscadGeometries.geom3.Geom3;
type Vec3 = [number, number, number];

type ValidationResult = { valid: true } | { valid: false; message: string };

type JscadTopologySummary = {
  irregularEdges: number;
  openBoundaryEdges: number;
  nonManifoldEdges: number;
  totalEdges: number;
  boundaryCentroid: Vec3;
  aabb: {
    min: Vec3;
    max: Vec3;
    center: Vec3;
  };
};

const topologyHashPrecision = 10_000_000;
const jscadManifoldHint =
  '3D mesh CSG with overlapping, touching, or contained primitives can produce native non-manifold geom3s; prefer 2D profile composition followed by one extrudeLinear() for prismatic parts.';

const emptyTopologySummary = (): JscadTopologySummary => ({
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  totalEdges: 0,
  boundaryCentroid: [0, 0, 0],
  aabb: {
    min: [0, 0, 0],
    max: [0, 0, 0],
    center: [0, 0, 0],
  },
});

const issueMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]?.trim() ?? message;
};

const validateGeom3 = (shape: unknown, modeling: JscadModeling): ValidationResult => {
  try {
    modeling.geometries.geom3.validate(shape as JscadGeom3);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      message: issueMessage(error),
    };
  }
};

const polygonCount = (shape: unknown, modeling: JscadModeling): number | undefined => {
  try {
    return (modeling.geometries.geom3.toPolygons(shape as JscadGeom3) as unknown[]).length;
  } catch {
    return undefined;
  }
};

const hashPoint = (vertices: readonly number[], index: number): string => {
  const offset = index * 3;
  return `${Math.round((vertices[offset] ?? 0) * topologyHashPrecision)},${Math.round(
    (vertices[offset + 1] ?? 0) * topologyHashPrecision,
  )},${Math.round((vertices[offset + 2] ?? 0) * topologyHashPrecision)}`;
};

const pointAt = (vertices: readonly number[], index: number): Vec3 => {
  const offset = index * 3;
  return [vertices[offset] ?? 0, vertices[offset + 1] ?? 0, vertices[offset + 2] ?? 0];
};

const sortedEdgeKey = (left: string, right: string): string => (left < right ? `${left}|${right}` : `${right}|${left}`);

const topologySummaryFromMesh = (meshData: JscadMeshData): JscadTopologySummary => {
  if (meshData.vertices.length === 0) {
    return emptyTopologySummary();
  }

  const edgeCounts = new Map<string, { count: number; left: Vec3; right: Vec3 }>();
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let offset = 0; offset < meshData.vertices.length; offset += 3) {
    min[0] = Math.min(min[0], meshData.vertices[offset] ?? 0);
    min[1] = Math.min(min[1], meshData.vertices[offset + 1] ?? 0);
    min[2] = Math.min(min[2], meshData.vertices[offset + 2] ?? 0);
    max[0] = Math.max(max[0], meshData.vertices[offset] ?? 0);
    max[1] = Math.max(max[1], meshData.vertices[offset + 1] ?? 0);
    max[2] = Math.max(max[2], meshData.vertices[offset + 2] ?? 0);
  }

  for (const triangle of meshData.triangles) {
    const vertices = [triangle.index0, triangle.index1, triangle.index2] as const;
    const hashes = vertices.map((index) => hashPoint(meshData.vertices, index));
    if (hashes[0] === hashes[1] || hashes[1] === hashes[2] || hashes[2] === hashes[0]) {
      continue;
    }

    const edges = [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const;
    for (const [leftIndex, rightIndex] of edges) {
      const key = sortedEdgeKey(hashes[leftIndex]!, hashes[rightIndex]!);
      const existing = edgeCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        edgeCounts.set(key, {
          count: 1,
          left: pointAt(meshData.vertices, vertices[leftIndex]),
          right: pointAt(meshData.vertices, vertices[rightIndex]),
        });
      }
    }
  }

  let irregularEdges = 0;
  let openBoundaryEdges = 0;
  let nonManifoldEdges = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const edge of edgeCounts.values()) {
    if (edge.count !== 2) {
      irregularEdges += 1;
    }
    if (edge.count === 1) {
      openBoundaryEdges += 1;
      bx += (edge.left[0] + edge.right[0]) / 2;
      by += (edge.left[1] + edge.right[1]) / 2;
      bz += (edge.left[2] + edge.right[2]) / 2;
    } else if (edge.count > 2) {
      nonManifoldEdges += 1;
    }
  }

  return {
    irregularEdges,
    openBoundaryEdges,
    nonManifoldEdges,
    totalEdges: edgeCounts.size,
    boundaryCentroid:
      openBoundaryEdges > 0 ? [bx / openBoundaryEdges, by / openBoundaryEdges, bz / openBoundaryEdges] : [0, 0, 0],
    aabb: {
      min,
      max,
      center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    },
  };
};

const normalizedValidationEvidence = (
  part: JscadPartDescriptor,
  modeling: JscadModeling,
): {
  normalizedPolygonCount?: number;
  exportValidation: ValidationResult;
} => {
  try {
    const normalizedShape = normalizeJscadShapeForRenderMesh(part.shape, part.index, modeling);
    const exportValidation = validateGeom3(normalizedShape, modeling);
    return {
      normalizedPolygonCount: polygonCount(normalizedShape, modeling),
      exportValidation,
    };
  } catch (error) {
    return {
      exportValidation: {
        valid: false,
        message: issueMessage(error),
      },
    };
  }
};

const invalidGeometryIssue = (part: JscadPartDescriptor, modeling: JscadModeling): KernelIssue | undefined => {
  const nativeValidation = validateGeom3(part.shape, modeling);
  const evidence = normalizedValidationEvidence(part, modeling);
  if (nativeValidation.valid && evidence.exportValidation.valid) {
    return undefined;
  }

  let topology = emptyTopologySummary();
  try {
    topology = topologySummaryFromMesh(extractMeshDataFromJscadShape(part.shape, part.index, modeling));
  } catch {
    topology = emptyTopologySummary();
  }

  const primaryMessage = nativeValidation.valid
    ? evidence.exportValidation.valid
      ? `${topology.irregularEdges} irregular topology edges`
      : evidence.exportValidation.message
    : nativeValidation.message;

  return {
    code: 'GEOMETRY_INVALID',
    severity: 'warning',
    type: 'kernel',
    message: `JSCAD part '${part.name}' is not a closed oriented solid: ${primaryMessage}.`,
    details: {
      producer: {
        kernelId: 'jscad',
        validator: 'geom3.validate',
      },
      geometry: {
        partName: part.name,
        partIndex: part.index,
        sourceName: part.sourceName,
        polygonCount: polygonCount(part.shape, modeling),
        normalizedPolygonCount: evidence.normalizedPolygonCount,
        nativeValidation,
        exportValidation: evidence.exportValidation,
        topology,
        hints: [jscadManifoldHint],
      },
    },
  };
};

/**
 * Collect non-fatal JSCAD topology diagnostics.
 *
 * The diagnostics are intentionally export-only evidence: validation may clone
 * and normalize a shape, but it never mutates the returned nativeHandle.
 *
 * @param parts - normalized JSCAD parts returned by main()
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns warning issues suitable for createGeometry/exportGeometry success results
 * @internal
 */
export const collectJscadPartIssues = (
  parts: readonly JscadPartDescriptor[],
  modeling: JscadModeling,
): KernelIssue[] => {
  const issues: KernelIssue[] = [];

  for (const part of parts) {
    if (!isRenderableJscadPart(part, modeling)) {
      continue;
    }
    const invalidIssue = invalidGeometryIssue(part, modeling);
    if (invalidIssue) {
      issues.push(invalidIssue);
    }
  }

  return issues;
};
