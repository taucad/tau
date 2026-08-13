import { describe, expect, it } from 'vitest';
import {
  buildWindingTree,
  cachedWindingTree,
  createWindingOracle,
  fastWindingNumber,
  generalizedWindingNumber,
  isWithinSurface,
  signedSolidAngle,
  triangleDistanceSquared,
  windingTreeBreakEvenQueries,
} from '#proofs/winding-number.js';
import type { Triangle, WindingMesh } from '#proofs/winding-number.js';
import type { Vec3 } from '#mesh/types.js';

/** An axis-aligned box as an outward-oriented closed soup. */
const boxMesh = (min: Vec3, max: Vec3, flip = false): WindingMesh => {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const vertProperties = [
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x0,
    y1,
    z0,
    x0,
    y0,
    z1,
    x1,
    y0,
    z1,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
  ];
  const faces = [
    [0, 2, 1],
    [0, 3, 2], // -z
    [4, 5, 6],
    [4, 6, 7], // +z
    [0, 1, 5],
    [0, 5, 4], // -y
    [2, 3, 7],
    [2, 7, 6], // +y
    [0, 4, 7],
    [0, 7, 3], // -x
    [1, 2, 6],
    [1, 6, 5], // +x
  ];
  const triVerts = faces.flatMap((face) => (flip ? [face[0]!, face[2]!, face[1]!] : face));
  return { vertProperties, triVerts, stride: 3 };
};

/** A grid of small boxes, enough triangles to exercise the tree's splits. */
const boxGrid = (count: number): WindingMesh => {
  const vertProperties: number[] = [];
  const triVerts: number[] = [];
  for (let index = 0; index < count; index++) {
    const base = vertProperties.length / 3;
    const box = boxMesh([index * 10, 0, 0], [index * 10 + 4, 4, 4]);
    vertProperties.push(...(box.vertProperties as number[]));
    triVerts.push(...[...(box.triVerts as number[])].map((vertex) => vertex + base));
  }
  return { vertProperties, triVerts, stride: 3 };
};

const unitBox = boxMesh([0, 0, 0], [2, 2, 2]);

describe('signedSolidAngle', () => {
  it('should subtend a full sphere over a closed box and nothing outside it', () => {
    expect(generalizedWindingNumber([1, 1, 1], unitBox)).toBeCloseTo(1, 9);
    expect(generalizedWindingNumber([10, 10, 10], unitBox)).toBeCloseTo(0, 9);
  });

  it('should flip sign with orientation — which is what makes shells signed', () => {
    expect(generalizedWindingNumber([1, 1, 1], boxMesh([0, 0, 0], [2, 2, 2], true))).toBeCloseTo(-1, 9);
  });

  it('should be additive over surfaces, so a per-shell sum is a body identity', () => {
    const outer = boxMesh([0, 0, 0], [10, 10, 10]);
    const cavity = boxMesh([4, 4, 4], [6, 6, 6], true);
    const combined: WindingMesh = {
      vertProperties: [...(outer.vertProperties as number[]), ...(cavity.vertProperties as number[])],
      triVerts: [...(outer.triVerts as number[]), ...[...(cavity.triVerts as number[])].map((vertex) => vertex + 8)],
      stride: 3,
    };

    const inCavity: Vec3 = [5, 5, 5];
    expect(generalizedWindingNumber(inCavity, outer) + generalizedWindingNumber(inCavity, cavity)).toBeCloseTo(0, 9);
    expect(generalizedWindingNumber(inCavity, combined)).toBeCloseTo(0, 9);
    // Material between the shells still reads as inside.
    expect(generalizedWindingNumber([1, 1, 1], combined)).toBeCloseTo(1, 9);
  });

  it('should answer a half-open surface fractionally rather than refusing', () => {
    // One face of the box removed: no healing, no closure — still a number.
    const open: WindingMesh = { ...unitBox, triVerts: [...(unitBox.triVerts as number[])].slice(0, 30) };
    const winding = generalizedWindingNumber([1, 1, 1], open);
    expect(winding).toBeGreaterThan(0.5);
    expect(winding).toBeLessThan(1);
  });

  it('should contribute nothing from a triangle the point sits on a corner of', () => {
    expect(
      signedSolidAngle(
        [0, 0, 0],
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      ),
    ).toBe(0);
    expect(
      signedSolidAngle(
        [1, 0, 0],
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      ),
    ).toBe(0);
    expect(
      signedSolidAngle(
        [0, 1, 0],
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      ),
    ).toBe(0);
  });

  it('should be a pure function of the mesh, bit for bit', () => {
    expect(generalizedWindingNumber([0.7, 1.3, 0.4], unitBox)).toBe(generalizedWindingNumber([0.7, 1.3, 0.4], unitBox));
  });
});

describe('triangleDistanceSquared', () => {
  const triangle: Triangle = [
    [0, 0, 0],
    [4, 0, 0],
    [0, 4, 0],
  ];

  it('should measure straight down onto the face interior', () => {
    expect(triangleDistanceSquared([1, 1, 3], triangle)).toBeCloseTo(9, 12);
  });

  it('should reach every vertex Voronoi region', () => {
    expect(triangleDistanceSquared([-1, -1, 0], triangle)).toBeCloseTo(2, 12);
    expect(triangleDistanceSquared([6, -1, 0], triangle)).toBeCloseTo(5, 12);
    expect(triangleDistanceSquared([-1, 6, 0], triangle)).toBeCloseTo(5, 12);
  });

  it('should reach every edge Voronoi region', () => {
    // Edge ab, then ac, then the hypotenuse bc.
    expect(triangleDistanceSquared([2, -3, 0], triangle)).toBeCloseTo(9, 12);
    expect(triangleDistanceSquared([-3, 2, 0], triangle)).toBeCloseTo(9, 12);
    expect(triangleDistanceSquared([4, 4, 0], triangle)).toBeCloseTo(8, 12);
  });

  it('should never under-estimate, which is what makes the near-surface guard sound', () => {
    // A plane projection would report 0 here; the true distance is the edge one.
    expect(triangleDistanceSquared([10, 10, 0], triangle)).toBeCloseTo(128, 9);
  });
});

describe('isWithinSurface', () => {
  it('should see the surface it is standing on and not one far away', () => {
    expect(isWithinSurface([1, 1, 2.05], unitBox, 0.1)).toBe(true);
    expect(isWithinSurface([1, 1, 1], unitBox, 0.5)).toBe(false);
    expect(isWithinSurface([1, 1, 1], unitBox, 1.5)).toBe(true);
  });
});

describe('Barnes-Hut winding tree', () => {
  it('should reach the same membership verdict as the direct evaluation', () => {
    const mesh = boxGrid(12);
    const tree = buildWindingTree(mesh);
    for (const point of [
      [2, 2, 2],
      [52, 2, 2],
      [115, 2, 2],
      [-40, -40, -40],
      [60, 40, 40],
      [2, 2, 3.999],
    ] satisfies Vec3[]) {
      const exact = generalizedWindingNumber(point, mesh);
      // What the caller actually decides on: the rounded winding number. The
      // residual is the omitted quadrupole term — measured below 2e-3 on this
      // fixture, three orders below the 0.5 that could flip a membership.
      expect(Math.round(fastWindingNumber(tree, point)) + 0).toBe(Math.round(exact) + 0);
      expect(fastWindingNumber(tree, point)).toBeCloseTo(exact, 2);
    }
  });

  it('should expand to exact triangles for the node the query sits inside', () => {
    // One box only: the query is inside the root's radius, so nothing is
    // approximated and the answer is the exact one, bit for bit.
    const mesh = boxGrid(1);
    const tree = buildWindingTree(mesh);
    const near: Vec3 = [2, 2, 3.999];
    // Every triangle is evaluated exactly; only the summation order differs.
    expect(fastWindingNumber(tree, near)).toBeCloseTo(generalizedWindingNumber(near, mesh), 12);
  });

  it('should build a leaf-only tree for a small soup', () => {
    const tree = buildWindingTree({ vertProperties: [0, 0, 0, 1, 0, 0, 0, 1, 0], triVerts: [0, 1, 2], stride: 3 });
    expect(tree.root.children).toBeUndefined();
    expect(tree.root.end - tree.root.start).toBe(1);
  });

  it('should place a node of degenerate triangles at its plain centroid with a zero dipole', () => {
    // Nine zero-area triangles: no area to weight by, and nothing to radiate.
    const vertProperties: number[] = [];
    const triVerts: number[] = [];
    for (let index = 0; index < 9; index++) {
      const base = index * 3;
      vertProperties.push(index, 0, 0, index, 0, 0, index, 0, 0);
      triVerts.push(base, base + 1, base + 2);
    }
    const tree = buildWindingTree({ vertProperties, triVerts, stride: 3 });
    expect(tree.root.dipole).toEqual([0, 0, 0]);
    expect(tree.root.centre[0]).toBeCloseTo(4, 12);
    expect(fastWindingNumber(tree, [0, 0, 10])).toBe(0);
  });

  it('should split on the axis of greatest centroid spread, ties resolving x then y', () => {
    // The same 12 boxes laid out along each axis must produce the same tree
    // shape — the choice is a pure function of the geometry, never of order.
    const along = (axis: 0 | 1 | 2): number | undefined => {
      const vertProperties: number[] = [];
      const triVerts: number[] = [];
      for (let index = 0; index < 12; index++) {
        const base = vertProperties.length / 3;
        const offset: Vec3 = [axis === 0 ? index * 10 : 0, axis === 1 ? index * 10 : 0, axis === 2 ? index * 10 : 0];
        const box = boxMesh(offset, [offset[0] + 4, offset[1] + 4, offset[2] + 4]);
        vertProperties.push(...(box.vertProperties as number[]));
        triVerts.push(...[...(box.triVerts as number[])].map((vertex) => vertex + base));
      }
      const { root } = buildWindingTree({ vertProperties, triVerts, stride: 3 });
      return root.children?.[0].end;
    };
    expect(along(0)).toBeGreaterThan(0);
    expect(along(0)).toBe(along(1));
    expect(along(1)).toBe(along(2));
  });
});

describe('createWindingOracle', () => {
  it('should stay direct for a handful of probes and switch to the tree above the break-even', () => {
    const mesh = boxGrid(12);
    const direct = createWindingOracle(mesh, 4);
    const tree = createWindingOracle(mesh, windingTreeBreakEvenQueries + 1);
    const point: Vec3 = [2, 2, 2];

    expect(direct(point)).toBe(generalizedWindingNumber(point, mesh));
    expect(tree(point)).toBeCloseTo(generalizedWindingNumber(point, mesh), 2);
    expect(windingTreeBreakEvenQueries).toBeGreaterThanOrEqual(40);
    expect(windingTreeBreakEvenQueries).toBeLessThanOrEqual(50);
  });
});

describe('cachedWindingTree', () => {
  const tetra = {
    vertProperties: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    triVerts: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3],
    stride: 3,
  };

  it('should reuse the tree for the same vertex buffer', () => {
    const mesh = { ...tetra, vertProperties: Float64Array.from(tetra.vertProperties) };

    expect(cachedWindingTree(mesh)).toBe(cachedWindingTree({ ...mesh }));
  });

  it('should build a separate tree for a separate buffer', () => {
    // A different tessellation is a different buffer, so it can never replay
    // the previous soup's tree.
    expect(cachedWindingTree({ ...tetra, vertProperties: [...tetra.vertProperties] })).not.toBe(
      cachedWindingTree({ ...tetra, vertProperties: [...tetra.vertProperties] }),
    );
  });
});
