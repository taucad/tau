import * as THREE from 'three';

export type SnapPoint = {
  position: THREE.Vector3;
  type: 'vertex' | 'edge-midpoint';
};

// Dimensionless angular tolerance for coplanar face detection.
const normalEpsilonCos = 0.9995; // Cos(theta) where theta ~ 1.8°

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

function computeLocalPositions(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const position = geometry.getAttribute('position');
  const localPositions: THREE.Vector3[] = Array.from({ length: position.count });
  for (let i = 0; i < position.count; i++) {
    localPositions[i] = new THREE.Vector3().fromBufferAttribute(position, i);
  }

  return localPositions;
}

function getTriangleVertices(tri: Triangle, positions: THREE.Vector3[]): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  return [positions[tri.a]!, positions[tri.b]!, positions[tri.c]!];
}

function triangleNormalWorld(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  return new THREE.Vector3().crossVectors(ab, ac).normalize();
}

function pointPlaneDistance(normal: THREE.Vector3, constant: number, p: THREE.Vector3): number {
  return normal.dot(p) - constant;
}

function edgeKey(i: number, index: number): string {
  return i < index ? `${i}|${index}` : `${index}|${i}`;
}

type CoplanarFaceParameters = {
  hitTriIndex: number;
  triangles: Triangle[];
  positions: THREE.Vector3[];
  refNormal: THREE.Vector3;
  refConstant: number;
  canonicalIndex: number[];
  positionTolerance: number;
};

function collectCoplanarContiguousFace(parameters: CoplanarFaceParameters): number[] {
  const { hitTriIndex, triangles, positions, refNormal, refConstant, canonicalIndex, positionTolerance } = parameters;
  const planeDistanceTolerance = positionTolerance * 4;
  const candidateFlags = Array.from({ length: triangles.length }).fill(false);
  // Pre-filter triangles by plane distance and normal similarity
  for (const [i, triangle] of triangles.entries()) {
    const t = triangle;
    const [a, b, c] = getTriangleVertices(t, positions);
    const n = triangleNormalWorld(a, b, c);
    if (Math.abs(n.dot(refNormal)) < normalEpsilonCos) {
      continue;
    }

    const d1 = Math.abs(pointPlaneDistance(refNormal, refConstant, a));
    const d2 = Math.abs(pointPlaneDistance(refNormal, refConstant, b));
    const d3 = Math.abs(pointPlaneDistance(refNormal, refConstant, c));
    if (d1 <= planeDistanceTolerance && d2 <= planeDistanceTolerance && d3 <= planeDistanceTolerance) {
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
    const callback = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const edges: Array<[string, number, number]> = [
      [edgeKey(ca, callback), ca, callback],
      [edgeKey(callback, cc), callback, cc],
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
    const index = queue.shift()!;
    const t = triangles[index]!;
    const ca = canonicalIndex[t.a]!;
    const callback = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const keys = [edgeKey(ca, callback), edgeKey(callback, cc), edgeKey(cc, ca)];
    for (const k of keys) {
      const neighbors = edgeToTriangles.get(k) ?? [];
      for (const nIndex of neighbors) {
        if (candidateFlags[nIndex] && !visited.has(nIndex)) {
          visited.add(nIndex);
          queue.push(nIndex);
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

function resolvePositionTolerance(geometry: THREE.BufferGeometry, positions: THREE.Vector3[]): number {
  const bounds = new THREE.Box3().setFromPoints(positions);
  const diagonal = bounds.getSize(new THREE.Vector3()).length();
  const maximumCoordinate = Math.max(
    Math.abs(bounds.min.x),
    Math.abs(bounds.min.y),
    Math.abs(bounds.min.z),
    Math.abs(bounds.max.x),
    Math.abs(bounds.max.y),
    Math.abs(bounds.max.z),
  );
  const { array } = geometry.getAttribute('position');
  const storageEpsilon = array instanceof Float32Array ? 2 ** -23 : Number.EPSILON;
  return Math.max(diagonal, maximumCoordinate, Number.MIN_VALUE) * storageEpsilon * 4;
}

function buildCanonicalVertexIndices(positions: THREE.Vector3[], tolerance: number): number[] {
  const buckets = new Map<string, number[]>();
  const canonicalIndex = Array.from<number>({ length: positions.length });
  const toleranceSquared = tolerance * tolerance;

  for (const [index, position] of positions.entries()) {
    const cell = [
      Math.floor(position.x / tolerance),
      Math.floor(position.y / tolerance),
      Math.floor(position.z / tolerance),
    ] as const;
    let canonical: number | undefined;
    for (let x = -1; x <= 1 && canonical === undefined; x++) {
      for (let y = -1; y <= 1 && canonical === undefined; y++) {
        for (let z = -1; z <= 1 && canonical === undefined; z++) {
          const neighbors = buckets.get(`${cell[0] + x}|${cell[1] + y}|${cell[2] + z}`) ?? [];
          canonical = neighbors.find(
            (candidate) => positions[candidate]!.distanceToSquared(position) <= toleranceSquared,
          );
        }
      }
    }

    canonicalIndex[index] = canonical ?? index;
    if (canonical === undefined) {
      const key = `${cell[0]}|${cell[1]}|${cell[2]}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(index);
      buckets.set(key, bucket);
    }
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

function computeReferencePlane(triangle: Triangle, positions: THREE.Vector3[]): ReferencePlane {
  const [pa, pb, pc] = getTriangleVertices(triangle, positions);
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

  for (const index of faceTriangleIndices) {
    const t = triangles[index]!;
    const ca = canonicalIndex[t.a]!;
    const callback = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const edges: Array<[number, number]> = [
      [ca, callback],
      [callback, cc],
      [cc, ca],
    ];

    for (const [i, index] of edges) {
      const k = edgeKey(i, index);
      if (!edgeCount.has(k)) {
        edgeCount.set(k, [i, index]);
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

function tryDetectCircularFace({
  boundaryEdges,
  positions,
  faceNormal,
  planePoint,
}: {
  boundaryEdges: Array<[number, number]>;
  positions: THREE.Vector3[];
  faceNormal: THREE.Vector3;
  planePoint: THREE.Vector3;
}): SnapPoint[] | undefined {
  const boundaryVertexIndices = new Set<number>();
  for (const [i, index] of boundaryEdges) {
    boundaryVertexIndices.add(i);
    boundaryVertexIndices.add(index);
  }

  const boundaryVertices: THREE.Vector3[] = [...boundaryVertexIndices].map((index) => positions[index]!);
  return detectCircleOnFace(boundaryVertices, faceNormal, planePoint);
}

function collectBoundarySnapPoints(
  boundaryEdges: Array<[number, number]>,
  positions: THREE.Vector3[],
  positionTolerance: number,
): {
  snapPoints: SnapPoint[];
  addPoint: (v: THREE.Vector3, type: SnapPoint['type']) => void;
} {
  const snapPoints: SnapPoint[] = [];
  const seenVertices = new Set<number>();

  const addPoint = (v: THREE.Vector3, type: SnapPoint['type']): void => {
    if (snapPoints.every(({ position }) => position.distanceTo(v) > positionTolerance)) {
      snapPoints.push({ position: v.clone(), type });
    }
  };

  for (const [i, index] of boundaryEdges) {
    const vi = positions[i]!;
    const vj = positions[index]!;
    if (!seenVertices.has(i)) {
      snapPoints.push({ position: vi.clone(), type: 'vertex' });
      seenVertices.add(i);
    }
    if (!seenVertices.has(index)) {
      snapPoints.push({ position: vj.clone(), type: 'vertex' });
      seenVertices.add(index);
    }
    snapPoints.push({ position: new THREE.Vector3().addVectors(vi, vj).multiplyScalar(0.5), type: 'edge-midpoint' });
  }

  return { snapPoints, addPoint };
}

function orderBoundaryVertices(boundaryEdges: Array<[number, number]>): {
  ordered: number[];
  boundaryVertexIndexSet: Set<number>;
} {
  const boundaryVertexIndexSet = new Set<number>();
  const boundaryAdj = new Map<number, number[]>();

  for (const [i, index] of boundaryEdges) {
    boundaryVertexIndexSet.add(i);
    boundaryVertexIndexSet.add(index);

    const ai = boundaryAdj.get(i) ?? [];
    ai.push(index);
    boundaryAdj.set(i, ai);

    const aj = boundaryAdj.get(index) ?? [];
    aj.push(i);
    boundaryAdj.set(index, aj);
  }

  const boundaryIndexList = [...boundaryVertexIndexSet];
  const ordered: number[] = [];

  if (boundaryIndexList.length >= 3) {
    const start = boundaryIndexList[0]!;
    let previous = -1;
    let current = start;
    const maxSteps = boundaryIndexList.length + 5;

    for (let step = 0; step < maxSteps; step++) {
      ordered.push(current);

      // oxlint-disable-next-line no-loop-func -- references loop variable intentionally
      const neighbors = (boundaryAdj.get(current) ?? []).filter((n) => n !== previous);
      if (neighbors.length === 0) {
        break;
      }

      const next = neighbors[0]!;
      previous = current;
      current = next;
      if (current === start) {
        break;
      }
    }
  }

  return { ordered, boundaryVertexIndexSet };
}

type FaceCenterParameters = {
  ordered: number[];
  boundaryVertexIndexSet: Set<number>;
  positions: THREE.Vector3[];
  refNormal: THREE.Vector3;
  refPoint: THREE.Vector3;
};

function computeFaceCenter(parameters: FaceCenterParameters): THREE.Vector3 {
  const { ordered, boundaryVertexIndexSet, positions, refNormal, refPoint } = parameters;
  const { u: planeU, v: planeV } = constructPlaneAxes(refNormal);
  let center: THREE.Vector3 | undefined;

  if (ordered.length >= 3) {
    // Area-weighted centroid in 2D then map back to 3D
    let area = 0;
    let cx = 0;
    let cy = 0;

    const rawPoints = ordered.map((index) => {
      const p = positions[index]!;
      const relative = new THREE.Vector3().subVectors(p, refPoint);
      return { x: relative.dot(planeU), y: relative.dot(planeV) };
    });
    const characteristicLength = Math.max(
      Math.max(...rawPoints.map(({ x }) => x)) - Math.min(...rawPoints.map(({ x }) => x)),
      Math.max(...rawPoints.map(({ y }) => y)) - Math.min(...rawPoints.map(({ y }) => y)),
    );
    const points2D = rawPoints.map(({ x, y }) => ({ x: x / characteristicLength, y: y / characteristicLength }));

    for (let i = 0; i < ordered.length; i++) {
      const a = points2D[i]!;
      const b = points2D[(i + 1) % ordered.length]!;
      const cross = a.x * b.y - a.y * b.x;
      area += cross;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }

    area *= 0.5;
    if (Math.abs(area) > Number.EPSILON * 64) {
      cx /= 6 * area;
      cy /= 6 * area;
      center = new THREE.Vector3()
        .copy(refPoint)
        .add(new THREE.Vector3().copy(planeU).multiplyScalar(cx * characteristicLength))
        .add(new THREE.Vector3().copy(planeV).multiplyScalar(cy * characteristicLength));
    }
  }

  if (!center) {
    // Fallback: average of boundary vertices
    center = new THREE.Vector3();
    for (const index of boundaryVertexIndexSet) {
      center.add(positions[index]!);
    }

    const boundaryIndexList = [...boundaryVertexIndexSet];
    center.multiplyScalar(1 / Math.max(1, boundaryIndexList.length));
  }

  return center;
}

export function detectSnapPoints(mesh: THREE.Mesh, intersection: THREE.Intersection<THREE.Mesh>): SnapPoint[] {
  if (!intersection.face) {
    return [];
  }

  // 1. Extract geometry data
  const { geometry } = mesh;
  const triangles = getTriangleIndexArray(geometry);
  const positions = computeLocalPositions(geometry);
  const positionTolerance = resolvePositionTolerance(geometry, positions);

  // 2. Build canonical vertex indices to merge coincident vertices
  const canonicalIndex = buildCanonicalVertexIndices(positions, positionTolerance);

  // 3. Find the hit triangle
  const triIndex = findHitTriangleIndex(intersection.face, triangles);

  // 4. Compute reference plane from hit triangle
  const {
    normal: referenceNormal,
    constant: referenceConstant,
    point: referencePoint,
  } = computeReferencePlane(triangles[triIndex]!, positions);

  // 5. Collect contiguous coplanar face region
  const faceTriangleIndices = collectCoplanarContiguousFace({
    hitTriIndex: triIndex,
    triangles,
    positions,
    refNormal: referenceNormal,
    refConstant: referenceConstant,
    canonicalIndex,
    positionTolerance,
  });

  // 6. Gather boundary edges
  const { boundaryEdges } = gatherBoundaryEdges(faceTriangleIndices, triangles, canonicalIndex);

  // 7. Try circular face detection first
  const maybeCircle = tryDetectCircularFace({
    boundaryEdges,
    positions,
    faceNormal: referenceNormal,
    planePoint: referencePoint,
  });
  if (maybeCircle) {
    return maybeCircle.map(({ position, type }) => ({ position: position.applyMatrix4(mesh.matrixWorld), type }));
  }

  // 8. Collect boundary snap points
  const { snapPoints, addPoint } = collectBoundarySnapPoints(boundaryEdges, positions, positionTolerance);

  // 9. Compute and add face center
  const { ordered, boundaryVertexIndexSet } = orderBoundaryVertices(boundaryEdges);
  const center = computeFaceCenter({
    ordered,
    boundaryVertexIndexSet,
    positions,
    refNormal: referenceNormal,
    refPoint: referencePoint,
  });
  addPoint(center, 'vertex');

  return snapPoints.map(({ position, type }) => ({ position: position.applyMatrix4(mesh.matrixWorld), type }));
}

// ---------------------- Circle detection helpers ----------------------

function constructPlaneAxes(normal: THREE.Vector3): {
  u: THREE.Vector3;
  v: THREE.Vector3;
} {
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

    if (Math.abs(m[pivot]![i]!) < Number.EPSILON * 64) {
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
  boundaryVertices: THREE.Vector3[],
  faceNormal: THREE.Vector3,
  planePoint: THREE.Vector3,
): SnapPoint[] | undefined {
  const minSamples = 12;
  if (boundaryVertices.length < minSamples) {
    return undefined;
  }

  const { u, v } = constructPlaneAxes(faceNormal.clone().normalize());

  const rawPoints = boundaryVertices.map((p) => {
    const relative = new THREE.Vector3().subVectors(p, planePoint);
    return { x: relative.dot(u), y: relative.dot(v) };
  });
  const characteristicLength = Math.max(
    Math.max(...rawPoints.map(({ x }) => x)) - Math.min(...rawPoints.map(({ x }) => x)),
    Math.max(...rawPoints.map(({ y }) => y)) - Math.min(...rawPoints.map(({ y }) => y)),
  );
  if (!(characteristicLength > 0)) {
    return undefined;
  }
  const pts2D = rawPoints.map(({ x, y }) => ({ x: x / characteristicLength, y: y / characteristicLength }));

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
  const relativeRms = rms / r;
  const width = maxX - minX;
  const height = maxY - minY;
  const aspect = Math.max(width, height) / Math.max(Number.EPSILON, Math.min(width, height));
  if (!(relativeRms <= 0.03 && aspect <= 1.05)) {
    return undefined;
  }

  const center = planePoint
    .clone()
    .addScaledVector(u, cx * characteristicLength)
    .addScaledVector(v, cy * characteristicLength);
  const radius = r * characteristicLength;

  const result: SnapPoint[] = [
    {
      position: center.clone().addScaledVector(u, radius),
      type: 'edge-midpoint',
    },
    {
      position: center.clone().addScaledVector(u, -radius),
      type: 'edge-midpoint',
    },
    {
      position: center.clone().addScaledVector(v, radius),
      type: 'edge-midpoint',
    },
    {
      position: center.clone().addScaledVector(v, -radius),
      type: 'edge-midpoint',
    },
    { position: center, type: 'vertex' },
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
