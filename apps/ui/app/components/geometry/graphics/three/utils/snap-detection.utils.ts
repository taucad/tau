import * as THREE from 'three';
import { getMeshMeasurementFeatures } from '#components/geometry/graphics/three/utils/measurement-features.js';

/** Compatibility points for callers still using the original two-point ruler. */
export type SnapPoint = {
  position: THREE.Vector3;
  type: 'vertex' | 'edge-midpoint';
};

export function detectSnapPoints(mesh: THREE.Mesh, intersection: THREE.Intersection<THREE.Mesh>): SnapPoint[] {
  if (intersection.faceIndex === null || intersection.faceIndex === undefined) {
    return [];
  }
  const graph = getMeshMeasurementFeatures(mesh);
  const region = graph.triangleRegion[intersection.faceIndex];
  if (region === undefined || region < 0) {
    return [];
  }
  mesh.updateWorldMatrix(true, false);
  const points: SnapPoint[] = [];
  const seen = new Set<string>();
  const add = (point: THREE.Vector3, type: SnapPoint['type']): void => {
    const key = `${point.x}:${point.y}:${point.z}:${type}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    points.push({ position: point.clone().applyMatrix4(mesh.matrixWorld), type });
  };
  for (const feature of graph.features) {
    if (feature.kind === 'edge' && feature.regionId === `face:${region}`) {
      if (!feature.closed) {
        add(feature.points[0]!, 'vertex');
        add(feature.points.at(-1)!, 'vertex');
      }
      add(feature.points[0]!.clone().lerp(feature.points.at(-1)!, 0.5), 'edge-midpoint');
    }
    if (feature.kind === 'circle' && feature.regionId === `face:${region}`) {
      add(feature.center, 'vertex');
    }
    if (feature.kind === 'face' && feature.id === `face:${region}`) {
      add(feature.centroid, 'vertex');
    }
  }
  return points;
}

/** Select an eligible projected point in CSS pixels; active retention belongs to the caller. */
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
  const { mousePos, camera, canvas, snapDistancePx, snapPointBufferPx = 0 } = options;
  camera.updateWorldMatrix(true, false);
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  let closest: SnapPoint | undefined;
  let minDistance = snapDistancePx + snapPointBufferPx;
  for (const point of snapPoints) {
    const clip = new THREE.Vector4(point.position.x, point.position.y, point.position.z, 1)
      .applyMatrix4(camera.matrixWorldInverse)
      .applyMatrix4(camera.projectionMatrix);
    if (!(clip.w > 0) || Math.abs(clip.x) > clip.w || Math.abs(clip.y) > clip.w || Math.abs(clip.z) > clip.w) {
      continue;
    }
    const distance = Math.hypot(
      (clip.x / clip.w - mousePos.x) * width * 0.5,
      (clip.y / clip.w - mousePos.y) * height * 0.5,
    );
    if (distance < minDistance) {
      minDistance = distance;
      closest = point;
    }
  }
  return closest;
}
