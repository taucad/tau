import { BatchedMesh, InstancedMesh, Matrix4, SkinnedMesh, Vector4 } from 'three';
import type { Camera, Mesh, PlaneGeometry } from 'three';
import { silhouetteTapDistance } from '#graphics/three/materials/model-emphasis-silhouette.js';
import type { SilhouetteMaskSize } from '#graphics/three/materials/model-emphasis-silhouette.js';

function lower(value: number, length: number, padding: number): number {
  return Math.max(-1, Math.min(1, (2 * (Math.floor(((value + 1) * length) / 2) - padding)) / length - 1));
}
function upper(value: number, length: number, padding: number): number {
  return Math.max(-1, Math.min(1, (2 * (Math.ceil(((value + 1) * length) / 2) + padding)) / length - 1));
}
type UpdateRegion = (sources: ReadonlyArray<{ source: Mesh }>, camera: Camera, size: SilhouetteMaskSize) => Vector4;

/**
 * Bound the node composite's raster area and return conservative device-pixel-aligned NDC bounds.
 * The owner retains all scratch state; unchanged bounds do not upload the four vertices again.
 * @param geometry - The owner's four-vertex clip-space composite plane.
 * @returns Updater returning owned scratch bounds; an empty source list restores the full-frame reference.
 */
export function createEmphasisCompositeRegion(geometry: PlaneGeometry): UpdateRegion {
  const projection = new Matrix4();
  const transform = new Matrix4();
  const corner = new Vector4();
  const region = new Vector4();
  const previous = new Vector4(-1, -1, 1, 1);
  return (sources: ReadonlyArray<{ source: Mesh }>, camera: Camera, size: SilhouetteMaskSize): Vector4 => {
    region.set(-1, -1, 1, 1);
    if (sources.length > 0) {
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      let left = Infinity;
      let bottom = Infinity;
      let right = -Infinity;
      let top = -Infinity;
      let valid = true;
      for (const { source } of sources) {
        if (source instanceof BatchedMesh || source instanceof InstancedMesh || source instanceof SkinnedMesh) {
          valid = false;
          break;
        }
        if (source.geometry.morphAttributes.position?.length) {
          valid = false;
          break;
        }
        if (!source.geometry.boundingBox) {
          source.geometry.computeBoundingBox();
        }
        const box = source.geometry.boundingBox;
        if (!box || box.isEmpty()) {
          valid = false;
          break;
        }
        transform.multiplyMatrices(projection, source.matrixWorld);
        for (let index = 0; index < 8; index++) {
          corner.set(
            index % 2 === 1 ? box.max.x : box.min.x,
            Math.floor(index / 2) % 2 === 1 ? box.max.y : box.min.y,
            index >= 4 ? box.max.z : box.min.z,
            1,
          );
          corner.applyMatrix4(transform);
          // Positive W throughout the convex box makes projected extrema occur at corners.
          // A box crossing the eye plane cannot be bounded by its projected corners.
          if (corner.w <= 0 || !Number.isFinite(corner.x + corner.y + corner.w)) {
            valid = false;
            break;
          }
          const x = corner.x / corner.w;
          const y = corner.y / corner.w;
          left = Math.min(left, x);
          right = Math.max(right, x);
          bottom = Math.min(bottom, y);
          top = Math.max(top, y);
        }
        if (!valid) {
          break;
        }
      }
      if (valid) {
        // Whole-pixel bounds plus the filter support and two conservative coverage pixels.
        const padding = silhouetteTapDistance(size.pixelRatio) + 2;
        region.set(
          lower(left, size.width, padding),
          lower(bottom, size.height, padding),
          upper(right, size.width, padding),
          upper(top, size.height, padding),
        );
      }
    }
    if (!region.equals(previous)) {
      const position = geometry.getAttribute('position');
      position.setXY(0, region.x, region.w);
      position.setXY(1, region.z, region.w);
      position.setXY(2, region.x, region.y);
      position.setXY(3, region.z, region.y);
      position.needsUpdate = true;
      previous.copy(region);
    }
    return region;
  };
}
