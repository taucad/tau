import { Plane, Vector2, Vector3 } from 'three';
import type { Camera, Raycaster } from 'three';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';

export type KinematicsPointerPoint = Readonly<{ clientX: number; clientY: number }>;

const cameraDirection = new Vector3();

/**
 * The drag plane passes through the grab point and faces the camera (normal = view direction), so
 * the pointer moves the target parallel to the screen at the grab depth in both camera modes.
 */
export function createKinematicsDragPlane(camera: Camera, grabPoint: Vector3, target = new Plane()): Plane {
  return target.setFromNormalAndCoplanarPoint(camera.getWorldDirection(cameraDirection), grabPoint);
}

/** Maps a client point into normalized device coordinates of an element's box. */
export function toKinematicsPointerNdc(
  rect: Readonly<{ left: number; top: number; width: number; height: number }>,
  point: KinematicsPointerPoint,
  target = new Vector2(),
): Vector2 {
  return target.set(
    ((point.clientX - rect.left) / rect.width) * 2 - 1,
    -((point.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

/** Intersects the pointer ray with the drag plane in world space; `undefined` when the ray misses it. */
export function intersectKinematicsDragPlane({
  raycaster,
  camera,
  plane,
  ndc,
  target = new Vector3(),
}: Readonly<{ raycaster: Raycaster; camera: Camera; plane: Plane; ndc: Vector2; target?: Vector3 }>):
  | Vector3
  | undefined {
  setRaycasterFromCamera(raycaster, ndc, camera);
  return raycaster.ray.intersectPlane(plane, target) ?? undefined;
}
