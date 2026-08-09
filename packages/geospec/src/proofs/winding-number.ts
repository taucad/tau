/**
 * Generalized winding number — the point-in-solid oracle (research V3, Barill
 * et al. 2018, "Fast Winding Numbers for Soups and Clouds").
 *
 * For a query point `p` and an oriented triangle mesh, the winding number is the
 * sum of the signed solid angles each triangle subtends at `p`, over 4π. For a
 * closed outward-oriented surface it is +1 inside, 0 outside (−1 inside an
 * inward-oriented shell), and — the property the void engine needs — it is
 * ROBUST on the raw per-face OCCT soup: no watertight healing, no closed-mesh
 * requirement, a smooth field whose 0.5 level set is the surface.
 *
 * Two uses in the topological void engine (`void-topology.ts`):
 * - Openness: the winding number is ADDITIVE over surfaces, so the signed sum
 *   over the void's decompose shells is `GWN(p, ∂void)` — 1 inside the void, 0 in
 *   material. This replaces the probe-cube ∩ void-solid test.
 * - Body identity: the per-shell sign vector names the connected void body.
 *
 * Two evaluators are exported:
 * - {@link generalizedWindingNumber} — direct, O(triangles) per query. Right for
 *   small meshes (local void claims); the void engine's default.
 * - {@link buildWindingTree} + {@link fastWindingNumber} — Barnes-Hut, O(log n)
 *   per query after an O(n log n) build. Right when one query sweeps 10⁵⁺
 *   triangles, where the direct cost (~60 ns/triangle) makes membership the
 *   bottleneck. A node far from the query (distance > β·radius) contributes its
 *   aggregated dipole (area-weighted normal) in O(1) instead of recursing; near
 *   nodes fall back to exact leaves. Query points in the void engine are cell
 *   interiors (far from the surface), where the first-order approximation is
 *   accurate to well within the ±0.5 rounding margin the sign-vector needs. The
 *   build only amortises above ~log(n) query points, so the direct evaluator
 *   stays optimal for the engine's typical few-point claims.
 *
 * @module
 */

import type { Vec3 } from '#mesh/types.js';

/**
 * An indexed triangle mesh for winding-number evaluation: `vertProperties`
 * strided by `stride` (first three properties are position), `triVerts` three
 * vertex indices per triangle. Matches Manifold's `Mesh` (pass its `numProp` as
 * `stride`).
 *
 * @public
 */
export type WindingMesh = {
  vertProperties: Float32Array | Float64Array;
  triVerts: Uint32Array;
  stride: number;
};

/**
 * Signed solid angle (as an `atan2` half-angle term, i.e. Ω/2) of one triangle
 * at the query point, by Van Oosterom & Strackee (1983). The winding number of
 * one triangle is `2·this / 4π = this / 2π`.
 *
 * @param point - The query point.
 * @param mesh - The indexed triangle mesh.
 * @param triangle - The triangle index.
 * @returns The signed half-solid-angle term.
 */
const triangleHalfSolidAngle = (point: Vec3, mesh: WindingMesh, triangle: number): number => {
  const { vertProperties, triVerts, stride } = mesh;
  const px = point[0];
  const py = point[1];
  const pz = point[2];
  const ia = triVerts[triangle * 3]! * stride;
  const ib = triVerts[triangle * 3 + 1]! * stride;
  const ic = triVerts[triangle * 3 + 2]! * stride;
  const ax = vertProperties[ia]! - px;
  const ay = vertProperties[ia + 1]! - py;
  const az = vertProperties[ia + 2]! - pz;
  const bx = vertProperties[ib]! - px;
  const by = vertProperties[ib + 1]! - py;
  const bz = vertProperties[ib + 2]! - pz;
  const cx = vertProperties[ic]! - px;
  const cy = vertProperties[ic + 1]! - py;
  const cz = vertProperties[ic + 2]! - pz;
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  const lc = Math.hypot(cx, cy, cz);
  const crossX = by * cz - bz * cy;
  const crossY = bz * cx - bx * cz;
  const crossZ = bx * cy - by * cx;
  const numerator = ax * crossX + ay * crossY + az * crossZ;
  const ab = ax * bx + ay * by + az * bz;
  const bc = bx * cx + by * cy + bz * cz;
  const ca = cx * ax + cy * ay + cz * az;
  const denominator = la * lb * lc + ab * lc + bc * la + ca * lb;
  return Math.atan2(numerator, denominator);
};

/**
 * Generalized winding number of `point` with respect to an indexed triangle
 * mesh, computed directly (O(triangles)).
 *
 * @param point - The query point (subject frame).
 * @param mesh - The indexed triangle mesh.
 * @returns The winding number (~1 inside a closed outward mesh, ~0 outside).
 * @public
 */
export const generalizedWindingNumber = (point: Vec3, mesh: WindingMesh): number => {
  const triangleCount = mesh.triVerts.length / 3;
  let total = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    total += triangleHalfSolidAngle(point, mesh, triangle);
  }
  return total / (2 * Math.PI);
};

/**
 * One Barnes-Hut cluster node. Exported for the R13 build's bit-identity gate.
 *
 * @public
 */
export type WindingTreeNode = {
  // Expansion centre (area-weighted centroid) and aggregated dipole (Σ area·normal).
  centreX: number;
  centreY: number;
  centreZ: number;
  dipoleX: number;
  dipoleY: number;
  dipoleZ: number;
  // Radius of the cluster from its centre (far-field acceptance uses β·radius).
  radius: number;
  left: WindingTreeNode | undefined;
  right: WindingTreeNode | undefined;
  // Leaf triangle indices, else undefined.
  triangles: Uint32Array | undefined;
};

/**
 * A Barnes-Hut hierarchy over a mesh's triangles for {@link fastWindingNumber}.
 *
 * @public
 */
export type WindingTree = {
  mesh: WindingMesh;
  root: WindingTreeNode;
  beta: number;
};

/**
 * Build a Barnes-Hut tree over `mesh` (O(n log n)). Each node caches its
 * aggregated dipole (Σ area·normal) and area-weighted centre so a far query can
 * approximate the whole cluster in O(1).
 *
 * @param mesh - The indexed triangle mesh.
 * @param options - `leafSize` (exact below it, default 16) and `beta` (far-field
 *   acceptance factor: a node is approximated when the query is farther than
 *   `beta · radius`, default 2 — larger is more accurate and slower).
 * @returns The tree for {@link fastWindingNumber}.
 * @public
 */
export const buildWindingTree = (mesh: WindingMesh, options?: { leafSize?: number; beta?: number }): WindingTree => {
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
    // Area-weighted normal = ½ (B−A) × (C−A).
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
  // R13 (suite audit): one index buffer + one scratch, stably merge-sorted in
  // place per node — the previous per-node `[...indices].sort().slice()`
  // construction allocated O(n log n) garbage per tree. A stable sort's output
  // is uniquely determined by its input sequence and comparator, so every node
  // still receives the exact subsequence the old construction produced:
  // identical topology, identical accumulation order, bit-identical sums.
  const order = new Uint32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) {
    order[index] = index;
  }
  const scratch = new Uint32Array(triangleCount);
  const sortRange = (lo: number, hi: number, axis: number): void => {
    for (let width = 1; width < hi - lo; width *= 2) {
      for (let start = lo; start < hi; start += width * 2) {
        const middle = Math.min(start + width, hi);
        const end = Math.min(start + width * 2, hi);
        if (middle >= end) {
          continue;
        }
        let left = start;
        let right = middle;
        let out = start;
        while (left < middle && right < end) {
          const leftTriangle = order[left]!;
          const rightTriangle = order[right]!;
          // Stable: the right run overtakes only on a strictly smaller key.
          if (centroid[rightTriangle * 3 + axis]! < centroid[leftTriangle * 3 + axis]!) {
            scratch[out] = rightTriangle;
            right += 1;
          } else {
            scratch[out] = leftTriangle;
            left += 1;
          }
          out += 1;
        }
        while (left < middle) {
          scratch[out] = order[left]!;
          left += 1;
          out += 1;
        }
        while (right < end) {
          scratch[out] = order[right]!;
          right += 1;
          out += 1;
        }
        order.set(scratch.subarray(start, end), start);
      }
    }
  };

  const build = (lo: number, hi: number): WindingTreeNode => {
    let dipoleX = 0;
    let dipoleY = 0;
    let dipoleZ = 0;
    let weight = 0;
    let cwx = 0;
    let cwy = 0;
    let cwz = 0;
    for (let index = lo; index < hi; index += 1) {
      const triangle = order[index]!;
      dipoleX += areaNormal[triangle * 3]!;
      dipoleY += areaNormal[triangle * 3 + 1]!;
      dipoleZ += areaNormal[triangle * 3 + 2]!;
      const a = area[triangle]!;
      weight += a;
      cwx += a * centroid[triangle * 3]!;
      cwy += a * centroid[triangle * 3 + 1]!;
      cwz += a * centroid[triangle * 3 + 2]!;
    }
    const first = order[lo]!;
    const centreX = weight > 0 ? cwx / weight : centroid[first * 3]!;
    const centreY = weight > 0 ? cwy / weight : centroid[first * 3 + 1]!;
    const centreZ = weight > 0 ? cwz / weight : centroid[first * 3 + 2]!;
    let radius = 0;
    for (let index = lo; index < hi; index += 1) {
      const triangle = order[index]!;
      for (let corner = 0; corner < 3; corner += 1) {
        const iv = triVerts[triangle * 3 + corner]! * stride;
        const dx = vertProperties[iv]! - centreX;
        const dy = vertProperties[iv + 1]! - centreY;
        const dz = vertProperties[iv + 2]! - centreZ;
        radius = Math.max(radius, Math.hypot(dx, dy, dz));
      }
    }
    if (hi - lo <= leafSize) {
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
        // The leaf owns its slice; the shared buffer keeps mutating below it.
        triangles: order.slice(lo, hi),
      };
    }
    // Split at the median centroid along the longest centroid-bbox axis.
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = lo; index < hi; index += 1) {
      const triangle = order[index]!;
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
    sortRange(lo, hi, axis);
    const mid = lo + Math.floor((hi - lo) / 2);
    return {
      centreX,
      centreY,
      centreZ,
      dipoleX,
      dipoleY,
      dipoleZ,
      radius,
      left: build(lo, mid),
      right: build(mid, hi),
      triangles: undefined,
    };
  };

  return {
    mesh,
    root: build(0, triangleCount),
    beta: options?.beta ?? 2,
  };
};

/**
 * Winding number of `point` via the Barnes-Hut tree (O(log n) for query points
 * away from the surface). Bit-comparable to {@link generalizedWindingNumber}
 * after rounding for cell-interior points; the far-field acceptance factor
 * (`tree.beta`) trades accuracy for speed.
 *
 * @param point - The query point (subject frame).
 * @param tree - A tree from {@link buildWindingTree}.
 * @returns The approximate winding number.
 * @public
 */
export const fastWindingNumber = (point: Vec3, tree: WindingTree): number => {
  const [px, py, pz] = point;
  const { beta } = tree;
  const fourPi = 4 * Math.PI;
  const twoPi = 2 * Math.PI;
  let winding = 0;
  const stack: WindingTreeNode[] = [tree.root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const dx = node.centreX - px;
    const dy = node.centreY - py;
    const dz = node.centreZ - pz;
    const r = Math.hypot(dx, dy, dz);
    if (r > beta * node.radius) {
      // Order-0 (dipole) far field: (d · Σ area·normal) / r³ / 4π.
      winding += (dx * node.dipoleX + dy * node.dipoleY + dz * node.dipoleZ) / (r * r * r) / fourPi;
      continue;
    }
    if (node.triangles) {
      for (const triangle of node.triangles) {
        winding += triangleHalfSolidAngle(point, tree.mesh, triangle) / twoPi;
      }
      continue;
    }
    stack.push(node.left!);
    stack.push(node.right!);
  }
  return winding;
};

/**
 * Squared distance from `point` to triangle `triangle` of an indexed mesh
 * (Ericson, Real-Time Collision Detection §5.1.5 — closest point by Voronoi
 * region classification, exact over all seven regions). The near-surface `on`
 * band the contact classifier needs: the winding number alone is a knife edge
 * at the surface (≈0.5 → 1 within one mesh triangle), so a coincident seat point
 * can read as deeply inside; a true distance-to-surface disambiguates it.
 */
const triangleDistanceSquared = (point: Vec3, mesh: WindingMesh, triangle: number): number => {
  const { vertProperties, triVerts, stride } = mesh;
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
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = point[0] - ax;
  const apy = point[1] - ay;
  const apz = point[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return apx * apx + apy * apy + apz * apz;
  }
  const bpx = point[0] - bx;
  const bpy = point[1] - by;
  const bpz = point[2] - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return bpx * bpx + bpy * bpy + bpz * bpz;
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d3 === d1 ? 0 : d1 / (d1 - d3);
    const dx = apx - t * abx;
    const dy = apy - t * aby;
    const dz = apz - t * abz;
    return dx * dx + dy * dy + dz * dz;
  }
  const cpx = point[0] - cx;
  const cpy = point[1] - cy;
  const cpz = point[2] - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return cpx * cpx + cpy * cpy + cpz * cpz;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d6 === d2 ? 0 : d2 / (d2 - d6);
    const dx = apx - t * acx;
    const dy = apy - t * acy;
    const dz = apz - t * acz;
    return dx * dx + dy * dy + dz * dz;
  }
  const va = d3 * d6 - d5 * d4;
  const d43 = d4 - d3;
  const d56 = d5 - d6;
  if (va <= 0 && d43 >= 0 && d56 >= 0) {
    const t = d43 + d56 === 0 ? 0 : d43 / (d43 + d56);
    const ex = point[0] - (bx + t * (cx - bx));
    const ey = point[1] - (by + t * (cy - by));
    const ez = point[2] - (bz + t * (cz - bz));
    return ex * ex + ey * ey + ez * ez;
  }
  const denominator = va + vb + vc;
  if (denominator === 0) {
    const aSq = apx * apx + apy * apy + apz * apz;
    const bSq = bpx * bpx + bpy * bpy + bpz * bpz;
    const cSq = cpx * cpx + cpy * cpy + cpz * cpz;
    return Math.min(aSq, bSq, cSq);
  }
  const v = vb / denominator;
  const w = vc / denominator;
  const qx = ax + abx * v + acx * w;
  const qy = ay + aby * v + acy * w;
  const qz = az + abz * v + acz * w;
  const fx = point[0] - qx;
  const fy = point[1] - qy;
  const fz = point[2] - qz;
  return fx * fx + fy * fy + fz * fz;
};

/**
 * Whether `point` lies within `distance` of the mesh surface, using the
 * {@link WindingTree}'s bounding spheres to prune (a node whose nearest possible
 * point is beyond `distance` is skipped). Early-exits on the first triangle
 * inside the band, so a near-surface query is `O(log n)`. The contact classifier
 * calls this to hold coincident seat points at `on` instead of letting the
 * winding number misread them as inside.
 *
 * @param point - The query point (subject frame).
 * @param tree - A tree from {@link buildWindingTree}.
 * @param distance - The `on`-band half-width (mm).
 * @returns True when a triangle lies within `distance` of `point`.
 * @public
 */
export const isWithinSurface = (point: Vec3, tree: WindingTree, distance: number): boolean => {
  const [px, py, pz] = point;
  const distanceSquared = distance * distance;
  const stack: WindingTreeNode[] = [tree.root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const dx = node.centreX - px;
    const dy = node.centreY - py;
    const dz = node.centreZ - pz;
    const lower = Math.hypot(dx, dy, dz) - node.radius;
    if (lower > 0 && lower * lower > distanceSquared) {
      continue; // Whole cluster is farther than the band.
    }
    if (node.triangles) {
      for (const triangle of node.triangles) {
        if (triangleDistanceSquared(point, tree.mesh, triangle) <= distanceSquared) {
          return true;
        }
      }
      continue;
    }
    stack.push(node.left!);
    stack.push(node.right!);
  }
  return false;
};
