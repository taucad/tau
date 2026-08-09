import { beforeAll, describe, expect, it } from 'vitest';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import type { Vec3 } from '#mesh/types.js';
import { buildWindingTree, fastWindingNumber, generalizedWindingNumber } from '#proofs/winding-number.js';
import type { WindingMesh, WindingTree, WindingTreeNode } from '#proofs/winding-number.js';

describe('generalizedWindingNumber', () => {
  let vertProperties: Float64Array;
  let triVerts: Uint32Array;
  let stride: number;

  beforeAll(async () => {
    // A [-1,1]^3 cube via Manifold (guaranteed outward orientation) — also
    // exercises the exact getMesh -> GWN pipeline the void engine uses.
    const wasm = await ensureManifoldModule();
    const cube = wasm.Manifold.cube([2, 2, 2], true);
    const mesh = cube.getMesh();
    vertProperties = new Float64Array(mesh.vertProperties);
    triVerts = new Uint32Array(mesh.triVerts);
    stride = mesh.numProp;
    cube.delete();
  });

  it('should read ~1 for points inside a closed outward mesh', () => {
    expect(generalizedWindingNumber([0, 0, 0], { vertProperties, triVerts, stride })).toBeCloseTo(1, 3);
    expect(generalizedWindingNumber([0.5, -0.5, 0.5], { vertProperties, triVerts, stride })).toBeCloseTo(1, 3);
  });

  it('should read ~0 for points outside the mesh', () => {
    expect(generalizedWindingNumber([5, 0, 0], { vertProperties, triVerts, stride })).toBeCloseTo(0, 3);
    expect(generalizedWindingNumber([1.5, 1.5, 1.5], { vertProperties, triVerts, stride })).toBeCloseTo(0, 3);
  });

  it('should flip sign for an inward-oriented (reversed) mesh', () => {
    const reversed = new Uint32Array(triVerts.length);
    for (let t = 0; t < triVerts.length; t += 3) {
      reversed[t] = triVerts[t]!;
      reversed[t + 1] = triVerts[t + 2]!;
      reversed[t + 2] = triVerts[t + 1]!;
    }
    expect(generalizedWindingNumber([0, 0, 0], { vertProperties, triVerts: reversed, stride })).toBeCloseTo(-1, 3);
  });
});

describe('fastWindingNumber (Barnes-Hut)', () => {
  it('should match the direct winding number across near and far points', async () => {
    // A 64-segment cylinder (~250 triangles > leafSize) so the tree has internal
    // nodes and the far-field approximation is actually exercised.
    const wasm = await ensureManifoldModule();
    const cylinder = wasm.Manifold.cylinder(4, 1, 1, 64, true);
    const mesh = cylinder.getMesh();
    const windingMesh = {
      vertProperties: new Float64Array(mesh.vertProperties),
      triVerts: new Uint32Array(mesh.triVerts),
      stride: mesh.numProp,
    };
    cylinder.delete();
    const tree = buildWindingTree(windingMesh);

    // Points at varying distances: interiors, far exterior (approximation), and
    // near-wall (leaf recursion). Cell-interior points are the void-query regime.
    const points: Vec3[] = [
      [0, 0, 0], // Inside.
      [0.5, 0.2, 1], // Inside.
      [8, 0, 0], // Far outside (radial) → far-field.
      [0, 0, 12], // Far outside (axial) → far-field.
      [0.9, 0, 0], // Inside, near wall → leaf.
      [1.4, 0, 0], // Just outside wall.
    ];
    for (const point of points) {
      const exact = generalizedWindingNumber(point, windingMesh);
      const fast = fastWindingNumber(point, tree);
      expect(fast).toBeCloseTo(exact, 2);
      expect(Math.round(fast)).toBe(Math.round(exact));
    }
  });
});

// === R13 golden gate: the in-place build must be bit-identical to the ======
// === original spread/sort/slice construction it replaced ===================

/**
 * The pre-R13 construction, verbatim: per-node `[...indices].sort()` on the
 * received subsequence with stable-slice children. The production build must
 * reproduce its trees bit-for-bit (topology, accumulation order, leaf
 * membership) — a stable sort's output is unique, so any divergence is a bug.
 */
const referenceBuildWindingTree = (mesh: WindingMesh, options?: { leafSize?: number; beta?: number }): WindingTree => {
  const { vertProperties, triVerts, stride } = mesh;
  const triangleCount = triVerts.length / 3;
  const centroid = new Float64Array(triangleCount * 3);
  const areaNormal = new Float64Array(triangleCount * 3);
  const area = new Float64Array(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = triVerts[triangle * 3]! * stride;
    const ib = triVerts[triangle * 3 + 1]! * stride;
    const ic = triVerts[triangle * 3 + 2]! * stride;
    const ax = vertProperties[ia]!;
    const ay = vertProperties[ia + 1]!;
    const az = vertProperties[ia + 2]!;
    const bx = vertProperties[ib]!;
    const by = vertProperties[ib + 1]!;
    const bz = vertProperties[ib + 2]!;
    const cx = vertProperties[ic]!;
    const cy = vertProperties[ic + 1]!;
    const cz = vertProperties[ic + 2]!;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = 0.5 * (uy * vz - uz * vy);
    const ny = 0.5 * (uz * vx - ux * vz);
    const nz = 0.5 * (ux * vy - uy * vx);
    areaNormal[triangle * 3] = nx;
    areaNormal[triangle * 3 + 1] = ny;
    areaNormal[triangle * 3 + 2] = nz;
    area[triangle] = Math.hypot(nx, ny, nz);
    centroid[triangle * 3] = (ax + bx + cx) / 3;
    centroid[triangle * 3 + 1] = (ay + by + cy) / 3;
    centroid[triangle * 3 + 2] = (az + bz + cz) / 3;
  }
  const leafSize = options?.leafSize ?? 16;
  const build = (indices: Uint32Array): WindingTreeNode => {
    let dipoleX = 0;
    let dipoleY = 0;
    let dipoleZ = 0;
    let weight = 0;
    let cwx = 0;
    let cwy = 0;
    let cwz = 0;
    for (const triangle of indices) {
      dipoleX += areaNormal[triangle * 3]!;
      dipoleY += areaNormal[triangle * 3 + 1]!;
      dipoleZ += areaNormal[triangle * 3 + 2]!;
      const a = area[triangle]!;
      weight += a;
      cwx += a * centroid[triangle * 3]!;
      cwy += a * centroid[triangle * 3 + 1]!;
      cwz += a * centroid[triangle * 3 + 2]!;
    }
    const first = indices[0]!;
    const centreX = weight > 0 ? cwx / weight : centroid[first * 3]!;
    const centreY = weight > 0 ? cwy / weight : centroid[first * 3 + 1]!;
    const centreZ = weight > 0 ? cwz / weight : centroid[first * 3 + 2]!;
    let radius = 0;
    for (const triangle of indices) {
      for (let corner = 0; corner < 3; corner += 1) {
        const iv = triVerts[triangle * 3 + corner]! * stride;
        const dx = vertProperties[iv]! - centreX;
        const dy = vertProperties[iv + 1]! - centreY;
        const dz = vertProperties[iv + 2]! - centreZ;
        radius = Math.max(radius, Math.hypot(dx, dy, dz));
      }
    }
    if (indices.length <= leafSize) {
      return {
        centreX,
        centreY,
        centreZ,
        dipoleX,
        dipoleY,
        dipoleZ,
        radius,
        left: undefined,
        right: undefined,
        triangles: indices,
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const triangle of indices) {
      minX = Math.min(minX, centroid[triangle * 3]!);
      maxX = Math.max(maxX, centroid[triangle * 3]!);
      minY = Math.min(minY, centroid[triangle * 3 + 1]!);
      maxY = Math.max(maxY, centroid[triangle * 3 + 1]!);
      minZ = Math.min(minZ, centroid[triangle * 3 + 2]!);
      maxZ = Math.max(maxZ, centroid[triangle * 3 + 2]!);
    }
    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const extentZ = maxZ - minZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
    const sorted = [...indices].sort((left, right) => centroid[left * 3 + axis]! - centroid[right * 3 + axis]!);
    const mid = Math.floor(sorted.length / 2);
    return {
      centreX,
      centreY,
      centreZ,
      dipoleX,
      dipoleY,
      dipoleZ,
      radius,
      left: build(Uint32Array.from(sorted.slice(0, mid))),
      right: build(Uint32Array.from(sorted.slice(mid))),
      triangles: undefined,
    };
  };
  return {
    mesh,
    root: build(Uint32Array.from({ length: triangleCount }, (_, index) => index)),
    beta: options?.beta ?? 2,
  };
};

const expectBitIdenticalNodes = (actual: WindingTreeNode | undefined, expected: WindingTreeNode | undefined): void => {
  expect(actual === undefined).toBe(expected === undefined);
  if (!actual || !expected) {
    return;
  }
  for (const field of ['centreX', 'centreY', 'centreZ', 'dipoleX', 'dipoleY', 'dipoleZ', 'radius'] as const) {
    expect(Object.is(actual[field], expected[field]), field).toBe(true);
  }
  expect(actual.triangles === undefined).toBe(expected.triangles === undefined);
  if (actual.triangles && expected.triangles) {
    expect([...actual.triangles]).toEqual([...expected.triangles]);
  }
  expectBitIdenticalNodes(actual.left, expected.left);
  expectBitIdenticalNodes(actual.right, expected.right);
};

/** Deterministic Park–Miller LCG so the random soup is identical on every run. */
const seededSoup = (triangleCount: number): WindingMesh => {
  let state = 624_388_753;
  const next = (): number => {
    // 16807 × state stays far below 2^53, so the arithmetic is exact.
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };
  const vertProperties = new Float64Array(triangleCount * 9);
  for (let index = 0; index < vertProperties.length; index += 1) {
    vertProperties[index] = next() * 100 - 50;
  }
  const triVerts = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < triVerts.length; index += 1) {
    triVerts[index] = index;
  }
  return { vertProperties, triVerts, stride: 3 };
};

/** Regular XY quad grid: every centroid ties on z and many tie per row/column. */
const gridSoup = (cells: number): WindingMesh => {
  const vertProperties: number[] = [];
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const x = column;
      const y = row;
      vertProperties.push(x, y, 0, x + 1, y, 0, x, y + 1, 0);
      vertProperties.push(x + 1, y, 0, x + 1, y + 1, 0, x, y + 1, 0);
    }
  }
  const triVerts = new Uint32Array(vertProperties.length / 3);
  for (let index = 0; index < triVerts.length; index += 1) {
    triVerts[index] = index;
  }
  return { vertProperties: new Float64Array(vertProperties), triVerts, stride: 3 };
};

describe('winding-tree in-place build bit-identity (R13)', () => {
  it('should reproduce the reference tree bit-for-bit on a tie-heavy grid', () => {
    const mesh = gridSoup(12);
    expectBitIdenticalNodes(buildWindingTree(mesh).root, referenceBuildWindingTree(mesh).root);
  });

  it('should reproduce the reference tree bit-for-bit on a seeded random soup', () => {
    const mesh = seededSoup(1000);
    expectBitIdenticalNodes(buildWindingTree(mesh).root, referenceBuildWindingTree(mesh).root);
  });

  it('should reproduce the reference tree at the leaf-size boundaries', () => {
    for (const triangleCount of [1, 15, 16, 17, 33]) {
      const mesh = seededSoup(triangleCount);
      expectBitIdenticalNodes(buildWindingTree(mesh).root, referenceBuildWindingTree(mesh).root);
    }
  });

  it('should reproduce the reference tree under a custom leaf size', () => {
    const mesh = seededSoup(64);
    expectBitIdenticalNodes(
      buildWindingTree(mesh, { leafSize: 4 }).root,
      referenceBuildWindingTree(mesh, { leafSize: 4 }).root,
    );
  });
});
