import { Matrix4, Vector4 } from 'three';
import type { Camera } from 'three';
import type { SilhouetteMaskSize } from '#graphics/three/materials/model-emphasis-silhouette.js';

/**
 * Integer native-pixel crop; retain capacity during motion and reset on viewport resize or release.
 * @returns Owned crop state; an undefined region keeps the original full-frame camera.
 */
export function createEmphasisMaskCrop(): {
  pixels: Vector4;
  uv: Vector4;
  update: (camera: Camera, region: Vector4 | undefined, size: SilhouetteMaskSize) => Camera;
  reset: () => void;
} {
  const pixels = new Vector4(0, 0, 1, 1);
  const uv = new Vector4(0, 0, 1, 1);
  const crop = new Matrix4();
  let capacityWidth = 0;
  let capacityHeight = 0;
  let width = 0;
  let height = 0;
  let sourceCamera: Camera | undefined;
  let cropCamera: Camera | undefined;
  const reset = (): void => {
    capacityWidth = 0;
    capacityHeight = 0;
  };
  return {
    pixels,
    uv,
    reset,
    update: (camera, region, size) => {
      if (width !== size.width || height !== size.height) {
        reset();
        width = size.width;
        height = size.height;
      }
      pixels.set(0, 0, width, height);
      uv.set(0, 0, 1, 1);
      if (!region) {
        return camera;
      }
      let left = Math.round(((region.x + 1) * width) / 2);
      let top = Math.round(((1 - region.w) * height) / 2);
      const right = Math.round(((region.z + 1) * width) / 2);
      const bottom = Math.round(((1 - region.y) * height) / 2);
      capacityWidth = Math.min(width, Math.max(capacityWidth, 2 ** Math.ceil(Math.log2(Math.max(1, right - left)))));
      capacityHeight = Math.min(height, Math.max(capacityHeight, 2 ** Math.ceil(Math.log2(Math.max(1, bottom - top)))));
      left = Math.min(left, width - capacityWidth);
      top = Math.min(top, height - capacityHeight);
      pixels.set(left, top, capacityWidth, capacityHeight);
      uv.set(left / width, top / height, capacityWidth / width, capacityHeight / height);
      if (capacityWidth === width && capacityHeight === height) {
        return camera;
      }
      if (sourceCamera !== camera || !cropCamera) {
        sourceCamera = camera;
        cropCamera = camera.clone();
      }
      cropCamera.copy(camera, false);
      // The detached clone borrows the source's already-resolved world/view matrices.
      // Recomputing them from local pose would drop a source camera rig's transform.
      cropCamera.matrixAutoUpdate = false;
      cropCamera.matrixWorldAutoUpdate = false;
      // Only XY changes: retain the original geometric depth and homogeneous W.
      crop.set(
        width / capacityWidth,
        0,
        0,
        (width - 2 * left - capacityWidth) / capacityWidth,
        0,
        height / capacityHeight,
        0,
        (2 * top + capacityHeight - height) / capacityHeight,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
      );
      cropCamera.projectionMatrix.multiplyMatrices(crop, camera.projectionMatrix);
      cropCamera.projectionMatrixInverse.copy(cropCamera.projectionMatrix).invert();
      return cropCamera;
    },
  };
}
