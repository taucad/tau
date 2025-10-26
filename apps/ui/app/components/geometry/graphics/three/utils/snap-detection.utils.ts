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

export function detectSnapPoints(
  mesh: THREE.Mesh,
  raycaster: THREE.Raycaster,
  _camera: THREE.Camera,
  _snapDistancePx = 20,
): SnapPoint[] {
  const intersects = raycaster.intersectObject(mesh, true);
  if (intersects.length === 0) {
    return [];
  }

  const intersection = intersects[0];
  if (!intersection?.face) {
    return [];
  }

  const object = intersection.object as THREE.Mesh;
  const { geometry } = object;
  const triangles = getTriangleIndexArray(geometry);
  const worldPositions = computeWorldPositions(object, geometry);

  // Build canonical indices for vertices that occupy the same world-space position.
  // This merges edges of non-indexed geometries so adjacency works across triangles.
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

  // Reference plane from the hit triangle in world space

  const triIndex = (() => {
    // Determine the triangle index corresponding to the hit face (a,b,c) within our triangles list
    const { a } = intersection.face;
    const { b } = intersection.face;
    const { c } = intersection.face;
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
  })();

  const [pa, pb, pc] = getTriangleVertices(triangles[triIndex]!, worldPositions);
  const refNormal = triangleNormalWorld(pa, pb, pc).normalize();
  const refConstant = refNormal.dot(pa);

  // Collect contiguous coplanar face region
  const faceTriangleIndices = collectCoplanarContiguousFace({
    hitTriIndex: triIndex,
    triangles,
    worldPositions,
    refNormal,
    refConstant,
    canonicalIndex,
  });

  // Gather boundary edges: edges that appear only once among the region triangles
  const edgeCount = new Map<string, [number, number]>();
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
      edgeCount.set(k, edgeCount.get(k) ? edgeCount.get(k)! : [i, j]);
      // We store pair once; counting not required beyond presence across multiple triangles,
      // but we will remove if seen twice below
      // Use a second map to count
    }
  }

  // Proper counting of edges
  const edgeCounter = new Map<string, number>();
  for (const idx of faceTriangleIndices) {
    const t = triangles[idx]!;
    const ca = canonicalIndex[t.a]!;
    const cb = canonicalIndex[t.b]!;
    const cc = canonicalIndex[t.c]!;
    const keys = [edgeKey(ca, cb), edgeKey(cb, cc), edgeKey(cc, ca)];
    for (const k of keys) {
      edgeCounter.set(k, (edgeCounter.get(k) ?? 0) + 1);
    }
  }

  const boundaryEdges: Array<[number, number]> = [];
  const interiorEdges: Array<[number, number]> = [];
  for (const [k, count] of edgeCounter) {
    if (count === 1) {
      const pair = edgeCount.get(k)!;
      boundaryEdges.push(pair);
    } else if (count === 2) {
      // Interior shared edge between two triangles within the same coplanar region
      const pair = edgeCount.get(k)!;
      interiorEdges.push(pair);
    }
  }

  // Collect unique boundary vertices and edge midpoints
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
    const vi = worldPositions[i]!; // Canonical indices map to representative original index
    const vj = worldPositions[j]!;
    addPoint(vi, 'vertex');
    addPoint(vj, 'vertex');
    addPoint(new THREE.Vector3().addVectors(vi, vj).multiplyScalar(0.5), 'edge-midpoint');
  }

  // Add midpoints for interior shared edges
  for (const [i, j] of interiorEdges) {
    const vi = worldPositions[i]!;
    const vj = worldPositions[j]!;
    addPoint(new THREE.Vector3().addVectors(vi, vj).multiplyScalar(0.5), 'edge-midpoint');
  }

  return snapPoints;
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
