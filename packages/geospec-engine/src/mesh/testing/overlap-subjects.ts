/**
 * Synthetic overlap subjects for the differential and census oracles.
 *
 * The overlap ladder consumes a {@link GeometrySubject}'s triangle records and
 * nothing else, so an adversarial fixture is just a named triangle soup. These
 * helpers build the shapes the parked oracles pin: closed boxes, inverted
 * (cavity) shells, and z-rotated copies whose axis-aligned leaf boxes overlap
 * while the surfaces clear.
 *
 * @module
 */

import type { GeometrySubject, MeshTriangle, Vec3, WatertightResult } from '#mesh/types.js';

/** The eight corners of an axis-aligned box, in a fixed order. */
const boxCorners = (min: Vec3, max: Vec3): Vec3[] => [
  [min[0], min[1], min[2]],
  [max[0], min[1], min[2]],
  [max[0], max[1], min[2]],
  [min[0], max[1], min[2]],
  [min[0], min[1], max[2]],
  [max[0], min[1], max[2]],
  [max[0], max[1], max[2]],
  [min[0], max[1], max[2]],
];

/** Outward-oriented triangle corner indices for {@link boxCorners}. */
const boxFaces: ReadonlyArray<readonly [number, number, number]> = [
  [0, 2, 1],
  [0, 3, 2],
  [4, 5, 6],
  [4, 6, 7],
  [0, 1, 5],
  [0, 5, 4],
  [3, 7, 6],
  [3, 6, 2],
  [0, 4, 7],
  [0, 7, 3],
  [1, 2, 6],
  [1, 6, 5],
];

/**
 * A closed, outward-oriented axis-aligned box as a flat triangle soup.
 *
 * @param min - Lower corner.
 * @param max - Upper corner.
 * @returns 12 triangles as `[ax,ay,az,bx,by,bz,cx,cy,cz]` triples.
 * @public
 */
export const boxSoup = (min: Vec3, max: Vec3): number[] => {
  const corners = boxCorners(min, max);
  const soup: number[] = [];
  for (const face of boxFaces) {
    for (const index of face) {
      soup.push(...corners[index]!);
    }
  }
  return soup;
};

/**
 * Flip a soup's orientation by swapping the second and third corner of every
 * triangle. An inverted shell nested in an outer shell is a cavity: winding
 * additivity reads exactly 0 inside it.
 *
 * @param soup - Flat triangle soup.
 * @returns The inverted soup.
 * @public
 */
export const invertSoup = (soup: readonly number[]): number[] => {
  const flipped: number[] = [];
  for (let offset = 0; offset + 8 < soup.length; offset += 9) {
    flipped.push(
      soup[offset]!,
      soup[offset + 1]!,
      soup[offset + 2]!,
      soup[offset + 6]!,
      soup[offset + 7]!,
      soup[offset + 8]!,
      soup[offset + 3]!,
      soup[offset + 4]!,
      soup[offset + 5]!,
    );
  }
  return flipped;
};

/**
 * Rotate a soup about the z axis through a centre.
 *
 * @param soup - Flat triangle soup.
 * @param degrees - Rotation angle.
 * @param centre - Point the axis passes through.
 * @returns The rotated soup.
 * @public
 */
export const rotateSoupZ = (soup: readonly number[], degrees: number, centre: Vec3): number[] => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotated: number[] = [];
  for (let offset = 0; offset + 2 < soup.length; offset += 3) {
    const x = soup[offset]! - centre[0];
    const y = soup[offset + 1]! - centre[1];
    rotated.push(centre[0] + x * cos - y * sin, centre[1] + x * sin + y * cos, soup[offset + 2]!);
  }
  return rotated;
};

const watertightSoup = (): WatertightResult => ({
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

const triangleArea = (a: Vec3, b: Vec3, c: Vec3): number => {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
};

/**
 * Build a mesh subject whose primitives are the named soups.
 *
 * @param components - Named flat triangle soups, in component order.
 * @param options - Optional provenance content hash (needed for R6 bundles).
 * @returns The subject.
 * @public
 */
export const subjectFromNamedSoups = (
  components: ReadonlyArray<{ name: string; soup: readonly number[] }>,
  options: { contentHash?: string } = {},
): GeometrySubject => {
  const triangles: MeshTriangle[] = [];
  let surfaceArea = 0;
  for (const component of components) {
    for (let offset = 0; offset + 8 < component.soup.length; offset += 9) {
      const a: [number, number, number] = [
        component.soup[offset]!,
        component.soup[offset + 1]!,
        component.soup[offset + 2]!,
      ];
      const b: [number, number, number] = [
        component.soup[offset + 3]!,
        component.soup[offset + 4]!,
        component.soup[offset + 5]!,
      ];
      const c: [number, number, number] = [
        component.soup[offset + 6]!,
        component.soup[offset + 7]!,
        component.soup[offset + 8]!,
      ];
      const area = triangleArea(a, b, c);
      surfaceArea += area;
      triangles.push({
        primitive: component.name,
        triangleIndex: triangles.length,
        a,
        b,
        c,
        center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
        area,
      });
    }
  }
  const watertight = watertightSoup();
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
        analyseWatertight: () => watertight,
        meshQuality: {
          triangleCount: triangles.length,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          triangles,
          surfaceArea,
          signedVolume: 0,
          centerOfMass: [0, 0, 0],
        },
      },
    },
    provenance: {
      source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'overlap-subject' },
      unit: 'mm',
      loader: 'in-memory',
      ...(options.contentHash === undefined ? {} : { contentHash: options.contentHash }),
    },
    capabilities: [{ kind: 'mesh', feature: 'component-overlap' }],
    diagnostics: [],
  };
};
