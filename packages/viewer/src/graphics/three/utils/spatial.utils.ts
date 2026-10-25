import { OrthographicCamera } from 'three';
import type * as THREE from 'three';

export type PixelsToWorldUnitsInput = {
  // Accepts a loosely-typed viewport to avoid version-specific type coupling.
  viewport: unknown;
  camera: THREE.Camera;
  size: { width: number; height: number };
  at: THREE.Vector3;
  pixels: number;
};

// Convert a pixel measure to world units at a given world-space point.
export function pixelsToWorldUnits({ viewport, camera, size, at, pixels }: PixelsToWorldUnitsInput): number {
  if (camera instanceof OrthographicCamera) {
    // R3F's viewport helper assumes a pixel-sized orthographic frustum. Tau's
    // camera rig owns an explicit render-unit span, independent of CSS size.
    return (pixels * (camera.top - camera.bottom)) / (camera.zoom * size.height);
  }
  const { getCurrentViewport } = viewport as { getCurrentViewport: (...args: unknown[]) => unknown };
  const vp = getCurrentViewport(camera, at) as { width: number; height: number };
  const worldPerPixel = vp.height / size.height;
  return pixels * worldPerPixel;
}
