import type { GeometrySubject, MeshTriangle, Vec3, WatertightResult } from '#mesh/types.js';

/**
 * Compact geometry kit for interference/pre-filter gates: axis-aligned box
 * soups (12 outward triangles), orientation inversion, and a synthetic
 * multi-component GeometrySubject whose named soups become the overlap
 * partition.
 *
 * @internal
 */

/**
 * Flat 12-triangle soup (9 floats per triangle) of an axis-aligned box.
 *
 * @param min - Box minimum corner.
 * @param max - Box maximum corner.
 * @returns Outward-oriented triangle soup values.
 */
export const boxSoup = (min: readonly [number, number, number], max: readonly [number, number, number]): number[] => {
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]],
  ];
  const faces: ReadonlyArray<readonly [number, number, number]> = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  return faces.flatMap(([a, b, c]) => [...corners[a]!, ...corners[b]!, ...corners[c]!]);
};

/**
 * Rotate a soup about the +Z axis around `center` (fat-AABB fixtures for the
 * tri-pair certificate: rotated faces have loose leaf boxes).
 *
 * @param soup - Flat triangle soup values.
 * @param degrees - Rotation angle in degrees.
 * @param center - Rotation centre.
 * @returns The rotated soup values.
 */
export const rotateSoupZ = (
  soup: readonly number[],
  degrees: number,
  center: readonly [number, number, number],
): number[] => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotated: number[] = [];
  for (let base = 0; base + 2 < soup.length; base += 3) {
    const x = soup[base]! - center[0];
    const y = soup[base + 1]! - center[1];
    rotated.push(center[0] + x * cos - y * sin, center[1] + x * sin + y * cos, soup[base + 2]!);
  }
  return rotated;
};

/**
 * Reverse every triangle's winding (an inward-facing shell, e.g. a cavity).
 *
 * @param soup - Flat triangle soup values.
 * @returns The soup with the second and third vertex of every triangle swapped.
 */
export const invertSoup = (soup: readonly number[]): number[] => {
  const inverted: number[] = [];
  for (let base = 0; base + 8 < soup.length; base += 9) {
    inverted.push(
      soup[base]!,
      soup[base + 1]!,
      soup[base + 2]!,
      soup[base + 6]!,
      soup[base + 7]!,
      soup[base + 8]!,
      soup[base + 3]!,
      soup[base + 4]!,
      soup[base + 5]!,
    );
  }
  return inverted;
};

const triangleArea = (a: Vec3, b: Vec3, c: Vec3): number => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross: [number, number, number] = [
    ab[1]! * ac[2]! - ab[2]! * ac[1]!,
    ab[2]! * ac[0]! - ab[0]! * ac[2]!,
    ab[0]! * ac[1]! - ab[1]! * ac[0]!,
  ];
  return Math.hypot(cross[0], cross[1], cross[2]) / 2;
};

const trianglesFromSoup = (primitive: string, values: readonly number[], startIndex: number): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  for (let offset = 0; offset + 8 < values.length; offset += 9) {
    const a: [number, number, number] = [values[offset]!, values[offset + 1]!, values[offset + 2]!];
    const b: [number, number, number] = [values[offset + 3]!, values[offset + 4]!, values[offset + 5]!];
    const c: [number, number, number] = [values[offset + 6]!, values[offset + 7]!, values[offset + 8]!];
    triangles.push({
      primitive,
      triangleIndex: startIndex + triangles.length,
      a,
      b,
      c,
      center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      area: triangleArea(a, b, c),
    });
  }
  return triangles;
};

const watertightResult = (): WatertightResult => ({
  watertight: true,
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
  irregularEdgeClusters: [],
  totalEdges: 0,
  irregularEdgeFraction: 0,
  perPrimitive: [],
});

/**
 * A synthetic multi-component subject: each named soup becomes one component
 * of the overlap partition (label = the part of the name before `#`). Carries
 * a content hash so the persistent pair/bundle caches key it.
 *
 * @param components - Named soups, one per component.
 * @param options - Optional provenance content hash.
 * @returns The synthetic geometry subject.
 * @internal
 */
export const subjectFromNamedSoups = (
  components: ReadonlyArray<{ name: string; soup: readonly number[] }>,
  options: { contentHash?: string } = {},
): GeometrySubject => {
  const triangles: MeshTriangle[] = [];
  for (const component of components) {
    triangles.push(...trianglesFromSoup(`${component.name}#0`, component.soup, triangles.length));
  }
  return {
    kind: 'geometry-subject',
    mesh: {
      format: 'mesh-buffer',
      stats: {
        vertexCount: triangles.length * 3,
        meshCount: components.length,
        triangleCount: triangles.length,
        connectedComponents: () => components.length,
        analyseConnectedComponents: () => ({ count: components.length, clusters: [], gaps: [] }),
        watertight: true,
        analyseWatertight: watertightResult,
        meshQuality: {
          triangleCount: triangles.length,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          triangles,
          surfaceArea: triangles.reduce((sum, triangle) => sum + triangle.area, 0),
          signedVolume: 1,
          centerOfMass: [0, 0, 0],
        },
      },
    },
    provenance: {
      source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'prefilter-fixture' },
      unit: 'mm',
      loader: 'in-memory',
      ...(options.contentHash ? { contentHash: options.contentHash } : {}),
    },
    capabilities: [{ kind: 'mesh', feature: 'component-overlap' }],
    diagnostics: [],
  };
};
