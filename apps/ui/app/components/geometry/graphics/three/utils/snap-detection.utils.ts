import * as THREE from 'three';

export type SnapPoint = {
  position: THREE.Vector3;
  type: 'vertex' | 'edge-midpoint';
};

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

  const { geometry } = intersection.object as THREE.Mesh;
  const positionAttribute = geometry.getAttribute('position');

  const snapPoints: SnapPoint[] = [];
  const addedPositions = new Set<string>();

  // Get face vertices
  const { face } = intersection;
  const faceVertices = [face.a, face.b, face.c] as number[];

  // Add vertices
  for (const vertexIndex of faceVertices) {
    const vertex = new THREE.Vector3();
    vertex.fromBufferAttribute(positionAttribute, vertexIndex);
    vertex.applyMatrix4((intersection.object as THREE.Mesh).matrixWorld);

    const key = `${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`;
    if (!addedPositions.has(key)) {
      snapPoints.push({ position: vertex, type: 'vertex' });
      addedPositions.add(key);
    }
  }

  // Add edge midpoints
  for (let i = 0; i < faceVertices.length; i++) {
    const vertexIndex1 = faceVertices[i];
    const vertexIndex2 = faceVertices[(i + 1) % faceVertices.length];
    if (vertexIndex1 === undefined || vertexIndex2 === undefined) {
      continue;
    }

    const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex1);
    const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex2);

    v1.applyMatrix4((intersection.object as THREE.Mesh).matrixWorld);
    v2.applyMatrix4((intersection.object as THREE.Mesh).matrixWorld);

    const midpoint = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
    const key = `${midpoint.x.toFixed(6)},${midpoint.y.toFixed(6)},${midpoint.z.toFixed(6)}`;

    if (!addedPositions.has(key)) {
      snapPoints.push({ position: midpoint, type: 'edge-midpoint' });
      addedPositions.add(key);
    }
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
