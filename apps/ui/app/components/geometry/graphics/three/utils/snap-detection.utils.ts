import * as THREE from 'three';

export type SnapPoint = {
  position: THREE.Vector3;
  type: 'vertex' | 'edge-midpoint';
};

// Epsilon constants for coplanar face detection
const normalEpsilonCos = 0.9995; // Cos(theta) where theta ~ 1.8°
const planeDistanceEpsilon = 1e-4; // World units

type Triangle = {
  a: number;
  b: number;
  c: number;
};

function getTriangleIndexArray(geometry: THREE.BufferGeometry): Triangle[] {
  const triangles: Triangle[] = [];
  const index = geometry.getIndex();
  if (index) {
    const array = index.array as ArrayLike<number>;
    for (let i = 0; i < array.length; i += 3) {
      triangles.push({ a: array[i]!, b: array[i + 1]!, c: array[i + 2]! });
    }
  } else {
    const positionCount = geometry.getAttribute('position').count;
    for (let i = 0; i < positionCount; i += 3) {
      triangles.push({ a: i, b: i + 1, c: i + 2 });
    }
  }

  return triangles;
}

function computeWorldPositions(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const position = geometry.getAttribute('position');
  const worldPositions: THREE.Vector3[] = Array.from({ length: position.count });
  for (let i = 0; i < position.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(position, i);
    v.applyMatrix4(mesh.matrixWorld);
    worldPositions[i] = v;
  }

  return worldPositions;
}

function getTriangleVertices(
  tri: Triangle,
  worldPositions: THREE.Vector3[],
): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  return [worldPositions[tri.a]!, worldPositions[tri.b]!, worldPositions[tri.c]!];
}

function triangleNormalWorld(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  return new THREE.Vector3().crossVectors(ab, ac).normalize();
}

function pointPlaneDistance(normal: THREE.Vector3, constant: number, p: THREE.Vector3): number {
  return normal.dot(p) - constant;
}

function edgeKey(i: number, j: number): string {
  return i < j ? `${i}|${j}` : `${j}|${i}`;
}

type CoplanarFaceParameters = {
  hitTriIndex: number;
  triangles: Triangle[];
  worldPositions: THREE.Vector3[];
  refNormal: THREE.Vector3;
  refConstant: number;
  canonicalIndex: number[];
};

function collectCoplanarContiguousFace(parameters: CoplanarFaceParameters): number[] {
  const { hitTriIndex, triangles, worldPositions, refNormal, refConstant, canonicalIndex } = parameters;
  const candidateFlags = Array.from({ length: triangles.length }).fill(false);
  // Pre-filter triangles by plane distance and normal similarity
  for (const [i, triangle] of triangles.entries()) {
    const t = triangle;
    const [a, b, c] = getTriangleVertices(t, worldPositions);
    const n = triangleNormalWorld(a, b, c);
    if (Math.abs(n.dot(refNormal)) < normalEpsilonCos) {
      continue;
    }

    const d1 = Math.abs(pointPlaneDistance(refNormal, refConstant, a));
    const d2 = Math.abs(pointPlaneDistance(refNormal, refConstant, b));
    const d3 = Math.abs(pointPlaneDistance(refNormal, refConstant, c));
    if (d1 < planeDistanceEpsilon && d2 < planeDistanceEpsilon && d3 < planeDistanceEpsilon) {
      candidateFlags[i] = true;
    }
  }

  // Build adjacency for candidate triangles via shared edges
  const edgeToTriangles = new Map<string, number[]>();
  for (const [i, triangle] of triangles.entries()) {
    if (!candidateFlags[i]) {
      continue;
    }

    const t = triangle;
    const ca = canonicalIndex[t.a]!;
    const cb = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const edges: Array<[string, number, number]> = [
      [edgeKey(ca, cb), ca, cb],
      [edgeKey(cb, cc), cb, cc],
      [edgeKey(cc, ca), cc, ca],
    ];
    for (const [k] of edges) {
      const list = edgeToTriangles.get(k) ?? [];
      list.push(i);
      edgeToTriangles.set(k, list);
    }
  }

  // BFS from hitTriIndex to collect contiguous region
  const visited = new Set<number>();
  const queue: number[] = [];
  if (candidateFlags[hitTriIndex]) {
    queue.push(hitTriIndex);
    visited.add(hitTriIndex);
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const t = triangles[idx]!;
    const ca = canonicalIndex[t.a]!;
    const cb = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const keys = [edgeKey(ca, cb), edgeKey(cb, cc), edgeKey(cc, ca)];
    for (const k of keys) {
      const neighbors = edgeToTriangles.get(k) ?? [];
      for (const nIdx of neighbors) {
        if (candidateFlags[nIdx] && !visited.has(nIdx)) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }

  return [...visited];
}

type ReferencePlane = {
  normal: THREE.Vector3;
  constant: number;
  point: THREE.Vector3;
};

type BoundaryEdgeResult = {
  boundaryEdges: Array<[number, number]>;
  interiorEdges: Array<[number, number]>;
};

function getRaycastIntersection(
  mesh: THREE.Mesh,
  raycaster: THREE.Raycaster,
): THREE.Intersection<THREE.Mesh> | undefined {
  const intersects = raycaster.intersectObject(mesh, true);
  if (intersects.length === 0) {
    return undefined;
  }

  const intersection = intersects[0];
  if (!intersection?.face) {
    return undefined;
  }

  return intersection as THREE.Intersection<THREE.Mesh>;
}

function buildCanonicalVertexIndices(worldPositions: THREE.Vector3[]): number[] {
  const positionKey = (v: THREE.Vector3): string => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
  const keyToCanonical = new Map<string, number>();
  const canonicalIndex: number[] = Array.from({ length: worldPositions.length });

  let idx = 0;
  for (const wp of worldPositions) {
    const key = positionKey(wp);
    if (!keyToCanonical.has(key)) {
      keyToCanonical.set(key, idx);
    }

    canonicalIndex[idx] = keyToCanonical.get(key)!;
    idx++;
  }

  return canonicalIndex;
}

function findHitTriangleIndex(face: THREE.Face, triangles: Triangle[]): number {
  const { a, b, c } = face;
  for (const [i, triangle] of triangles.entries()) {
    const t = triangle;
    if (
      (t.a === a && t.b === b && t.c === c) ||
      (t.a === b && t.b === c && t.c === a) ||
      (t.a === c && t.b === a && t.c === b)
    ) {
      return i;
    }
  }

  return 0; // Fallback
}

function computeReferencePlane(triangle: Triangle, worldPositions: THREE.Vector3[]): ReferencePlane {
  const [pa, pb, pc] = getTriangleVertices(triangle, worldPositions);
  const normal = triangleNormalWorld(pa, pb, pc).normalize();
  const constant = normal.dot(pa);

  return { normal, constant, point: pa };
}

function gatherBoundaryEdges(
  faceTriangleIndices: number[],
  triangles: Triangle[],
  canonicalIndex: number[],
): BoundaryEdgeResult {
  const edgeCount = new Map<string, [number, number]>();
  const edgeCounter = new Map<string, number>();

  for (const idx of faceTriangleIndices) {
    const t = triangles[idx]!;
    const ca = canonicalIndex[t.a]!;
    const cb = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const edges: Array<[number, number]> = [
      [ca, cb],
      [cb, cc],
      [cc, ca],
    ];

    for (const [i, j] of edges) {
      const k = edgeKey(i, j);
      if (!edgeCount.has(k)) {
        edgeCount.set(k, [i, j]);
      }

      edgeCounter.set(k, (edgeCounter.get(k) ?? 0) + 1);
    }
  }

  const boundaryEdges: Array<[number, number]> = [];
  const interiorEdges: Array<[number, number]> = [];

  for (const [k, count] of edgeCounter) {
    const pair = edgeCount.get(k)!;
    if (count === 1) {
      boundaryEdges.push(pair);
    } else if (count === 2) {
      interiorEdges.push(pair);
    }
  }

  return { boundaryEdges, interiorEdges };
}

function tryDetectCircularFace(
  boundaryEdges: Array<[number, number]>,
  worldPositions: THREE.Vector3[],
  faceNormal: THREE.Vector3,
  planePoint: THREE.Vector3,
): SnapPoint[] | undefined {
  const boundaryVertexIndices = new Set<number>();
  for (const [i, j] of boundaryEdges) {
    boundaryVertexIndices.add(i);
    boundaryVertexIndices.add(j);
  }

  const boundaryVerticesWorld: THREE.Vector3[] = [...boundaryVertexIndices].map((idx) => worldPositions[idx]!);
  return detectCircleOnFace(boundaryVerticesWorld, faceNormal, planePoint);
}

function collectBoundarySnapPoints(
  boundaryEdges: Array<[number, number]>,
  worldPositions: THREE.Vector3[],
): { snapPoints: SnapPoint[]; addPoint: (v: THREE.Vector3, type: SnapPoint['type']) => void } {
  const snapPoints: SnapPoint[] = [];
  const seen = new Set<string>();

  const addPoint = (v: THREE.Vector3, type: SnapPoint['type']): void => {
    const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
    if (!seen.has(key)) {
      snapPoints.push({ position: v.clone(), type });
      seen.add(key);
    }
  };

  for (const [i, j] of boundaryEdges) {
    const vi = worldPositions[i]!;
    const vj = worldPositions[j]!;
    addPoint(vi, 'vertex');
    addPoint(vj, 'vertex');
    addPoint(new THREE.Vector3().addVectors(vi, vj).multiplyScalar(0.5), 'edge-midpoint');
  }

  return { snapPoints, addPoint };
}

function orderBoundaryVertices(boundaryEdges: Array<[number, number]>): {
  ordered: number[];
  boundaryVertexIndexSet: Set<number>;
} {
  const boundaryVertexIndexSet = new Set<number>();
  const boundaryAdj = new Map<number, number[]>();

  for (const [i, j] of boundaryEdges) {
    boundaryVertexIndexSet.add(i);
    boundaryVertexIndexSet.add(j);

    const ai = boundaryAdj.get(i) ?? [];
    ai.push(j);
    boundaryAdj.set(i, ai);

    const aj = boundaryAdj.get(j) ?? [];
    aj.push(i);
    boundaryAdj.set(j, aj);
  }

  const boundaryIndexList = [...boundaryVertexIndexSet];
  const ordered: number[] = [];

  if (boundaryIndexList.length >= 3) {
    const start = boundaryIndexList[0]!;
    let previous = -1;
    let curr = start;
    const maxSteps = boundaryIndexList.length + 5;

    for (let step = 0; step < maxSteps; step++) {
      ordered.push(curr);
      // eslint-disable-next-line @typescript-eslint/no-loop-func -- `previous` is always defined in the loop
      const neighbors = (boundaryAdj.get(curr) ?? []).filter((n) => n !== previous);
      if (neighbors.length === 0) {
        break;
      }

      const next = neighbors[0]!;
      previous = curr;
      curr = next;
      if (curr === start) {
        break;
      }
    }
  }

  return { ordered, boundaryVertexIndexSet };
}

type FaceCenterParameters = {
  ordered: number[];
  boundaryVertexIndexSet: Set<number>;
  worldPositions: THREE.Vector3[];
  refNormal: THREE.Vector3;
  refPoint: THREE.Vector3;
};

function computeFaceCenter(parameters: FaceCenterParameters): THREE.Vector3 {
  const { ordered, boundaryVertexIndexSet, worldPositions, refNormal, refPoint } = parameters;
  const { u: planeU, v: planeV } = constructPlaneAxes(refNormal);
  let center: THREE.Vector3 | undefined;

  if (ordered.length >= 3) {
    // Area-weighted centroid in 2D then map back to 3D
    let area = 0;
    let cx = 0;
    let cy = 0;

    const to2D = (idx: number): { x: number; y: number } => {
      const p = worldPositions[idx]!;
      const rel = new THREE.Vector3().subVectors(p, refPoint);
      return { x: rel.dot(planeU), y: rel.dot(planeV) };
    };

    for (let i = 0; i < ordered.length; i++) {
      const a = to2D(ordered[i]!);
      const b = to2D(ordered[(i + 1) % ordered.length]!);
      const cross = a.x * b.y - a.y * b.x;
      area += cross;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }

    area *= 0.5;
    if (Math.abs(area) > 1e-9) {
      cx /= 6 * area;
      cy /= 6 * area;
      center = new THREE.Vector3()
        .copy(refPoint)
        .add(new THREE.Vector3().copy(planeU).multiplyScalar(cx))
        .add(new THREE.Vector3().copy(planeV).multiplyScalar(cy));
    }
  }

  if (!center) {
    // Fallback: average of boundary vertices
    center = new THREE.Vector3();
    for (const idx of boundaryVertexIndexSet) {
      center.add(worldPositions[idx]!);
    }

    const boundaryIndexList = [...boundaryVertexIndexSet];
    center.multiplyScalar(1 / Math.max(1, boundaryIndexList.length));
  }

  return center;
}

export function detectSnapPoints(mesh: THREE.Mesh, raycaster: THREE.Raycaster): SnapPoint[] {
  // 1. Get raycast intersection
  const intersection = getRaycastIntersection(mesh, raycaster);
  if (!intersection) {
    return [];
  }

  // 2. Extract geometry data
  const { object } = intersection;
  const { geometry } = object;
  const triangles = getTriangleIndexArray(geometry);
  const worldPositions = computeWorldPositions(object, geometry);

  // 3. Build canonical vertex indices to merge coincident vertices
  const canonicalIndex = buildCanonicalVertexIndices(worldPositions);

  // 4. Find the hit triangle
  const triIndex = findHitTriangleIndex(intersection.face!, triangles);

  // 5. Compute reference plane from hit triangle
  const {
    normal: refNormal,
    constant: refConstant,
    point: refPoint,
  } = computeReferencePlane(triangles[triIndex]!, worldPositions);

  // 6. Collect contiguous coplanar face region
  const faceTriangleIndices = collectCoplanarContiguousFace({
    hitTriIndex: triIndex,
    triangles,
    worldPositions,
    refNormal,
    refConstant,
    canonicalIndex,
  });

  // 7. Gather boundary edges
  const { boundaryEdges } = gatherBoundaryEdges(faceTriangleIndices, triangles, canonicalIndex);

  // 8. Try circular face detection first
  const maybeCircle = tryDetectCircularFace(boundaryEdges, worldPositions, refNormal, refPoint);
  if (maybeCircle) {
    return maybeCircle;
  }

  // 9. Collect boundary snap points
  const { snapPoints, addPoint } = collectBoundarySnapPoints(boundaryEdges, worldPositions);

  // 10. Compute and add face center
  const { ordered, boundaryVertexIndexSet } = orderBoundaryVertices(boundaryEdges);
  const center = computeFaceCenter({
    ordered,
    boundaryVertexIndexSet,
    worldPositions,
    refNormal,
    refPoint,
  });
  addPoint(center, 'vertex');

  return snapPoints;
}

// ---------------------- Circle detection helpers ----------------------

function constructPlaneAxes(normal: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const tryAxis = (axis: THREE.Vector3): THREE.Vector3 => {
    const proj = axis.clone().addScaledVector(normal, -axis.dot(normal));
    if (proj.lengthSq() < 1e-10) {
      return proj;
    }

    return proj.normalize();
  };

  let u = tryAxis(new THREE.Vector3(1, 0, 0));
  if (u.lengthSq() < 1e-10) {
    u = tryAxis(new THREE.Vector3(0, 1, 0));
  }

  if (u.lengthSq() < 1e-10) {
    const temporary = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    u = tryAxis(temporary);
  }

  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  return { u, v };
}

function fitCircle2D(points: Array<{ x: number; y: number }>): { cx: number; cy: number; r: number } | undefined {
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sx = 0;
  let sy = 0;
  let szz = 0;
  let sxz = 0;
  let syz = 0;

  for (const p of points) {
    const z = p.x * p.x + p.y * p.y;
    sxx += p.x * p.x;
    syy += p.y * p.y;
    sxy += p.x * p.y;
    sx += p.x;
    sy += p.y;
    szz += z;
    sxz += p.x * z;
    syz += p.y * z;
  }

  const n = points.length;

  const aMatrix = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];

  const bVector = [sxz * 0.5, syz * 0.5, szz * 0.5];
  const sol = solveSymmetric3(aMatrix, bVector);
  if (!sol) {
    return undefined;
  }

  const [cx, cy, c] = sol;
  const r = Math.sqrt(Math.max(0, cx * cx + cy * cy + c));
  if (!Number.isFinite(r)) {
    return undefined;
  }

  return { cx, cy, r };
}

function solveSymmetric3(aMatrix: number[][], bVector: number[]): [number, number, number] | undefined {
  const m: number[][] = [[...aMatrix[0]!], [...aMatrix[1]!], [...aMatrix[2]!]];
  const b = [...bVector];

  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(m[r]![i]!) > Math.abs(m[pivot]![i]!)) {
        pivot = r;
      }
    }

    if (Math.abs(m[pivot]![i]!) < 1e-12) {
      return undefined;
    }

    if (pivot !== i) {
      [m[i], m[pivot]] = [m[pivot]!, m[i]!];
      [b[i], b[pivot]] = [b[pivot]!, b[i]!];
    }

    for (let r = i + 1; r < 3; r++) {
      const factor = m[r]![i]! / m[i]![i]!;
      for (let c = i; c < 3; c++) {
        m[r]![c]! -= factor * m[i]![c]!;
      }

      b[r]! -= factor * b[i]!;
    }
  }

  const x: [number, number, number] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let sum = b[i]!;
    for (let c = i + 1; c < 3; c++) {
      sum -= m[i]![c]! * x[c]!;
    }

    x[i] = sum / m[i]![i]!;
  }

  return [x[0], x[1], x[2]];
}

function detectCircleOnFace(
  boundaryVerticesWorld: THREE.Vector3[],
  faceNormal: THREE.Vector3,
  planePoint: THREE.Vector3,
): SnapPoint[] | undefined {
  const minSamples = 12;
  if (boundaryVerticesWorld.length < minSamples) {
    return undefined;
  }

  const { u, v } = constructPlaneAxes(faceNormal.clone().normalize());

  const pts2D = boundaryVerticesWorld.map((p) => {
    const rel = new THREE.Vector3().subVectors(p, planePoint);
    return { x: rel.dot(u), y: rel.dot(v) };
  });

  const fit = fitCircle2D(pts2D);
  if (!fit) {
    return undefined;
  }

  const { cx, cy, r } = fit;
  if (!Number.isFinite(r) || r <= 0) {
    return undefined;
  }

  let r2sum = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts2D) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const di = Math.hypot(dx, dy);
    r2sum += (di - r) * (di - r);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const rms = Math.sqrt(r2sum / pts2D.length);
  const relRms = rms / r;
  const width = maxX - minX;
  const height = maxY - minY;
  const aspect = Math.max(width, height) / Math.max(1e-9, Math.min(width, height));
  if (!(relRms <= 0.03 && aspect <= 1.05)) {
    return undefined;
  }

  const centerWorld = planePoint.clone().addScaledVector(u, cx).addScaledVector(v, cy);

  const result: SnapPoint[] = [
    { position: centerWorld.clone().addScaledVector(u, r), type: 'edge-midpoint' },
    { position: centerWorld.clone().addScaledVector(u, -r), type: 'edge-midpoint' },
    { position: centerWorld.clone().addScaledVector(v, r), type: 'edge-midpoint' },
    { position: centerWorld.clone().addScaledVector(v, -r), type: 'edge-midpoint' },
    { position: centerWorld, type: 'vertex' },
  ];
  return result;
}

export function findClosestSnapPoint(
  snapPoints: SnapPoint[],
  options: {
    mousePos: THREE.Vector2;
    camera: THREE.Camera;
    canvas: HTMLCanvasElement;
    snapDistancePx: number;
    snapPointBufferPx?: number;
  },
): SnapPoint | undefined {
  const { mousePos, camera, canvas, snapDistancePx, snapPointBufferPx = 15 } = options;
  let closest: SnapPoint | undefined;
  let minDistance = snapDistancePx + snapPointBufferPx;

  for (const snapPoint of snapPoints) {
    const screenPos = snapPoint.position.clone().project(camera);
    const canvasX = (screenPos.x + 1) * 0.5 * canvas.width;
    const canvasY = (-screenPos.y + 1) * 0.5 * canvas.height;

    const mouseCanvasX = (mousePos.x + 1) * 0.5 * canvas.width;
    const mouseCanvasY = (-mousePos.y + 1) * 0.5 * canvas.height;

    const distance = Math.hypot(canvasX - mouseCanvasX, canvasY - mouseCanvasY);

    if (distance < minDistance) {
      minDistance = distance;
      closest = snapPoint;
    }
  }

  return closest;
}
