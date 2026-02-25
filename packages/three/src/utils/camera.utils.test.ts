import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { computeViewFittingZoom, updateCameraFov, resetCamera } from '#utils/camera.utils.js';
import { calculateFovFromAngle, calculateFovDistanceCompensation, tanEpsilon } from '#utils/math.utils.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a PerspectiveCamera with sensible defaults. */
function createTestCamera(fov = 54, distance = 10): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Creates an axis-aligned bounding box centred at `center` with given half-extents. */
// eslint-disable-next-line max-params -- test helper, simple positional args are clearer here
function makeBox(center: THREE.Vector3, hx: number, hy: number, hz: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(center.x - hx, center.y - hy, center.z - hz),
    new THREE.Vector3(center.x + hx, center.y + hy, center.z + hz),
  );
}

/** Builds the default perspective config used by resetCamera tests. */
function defaultPerspective(
  overrides?: Partial<{
    offsetRatio: number;
    zoomLevel: number;
    nearPlane: number;
    minimumFarPlane: number;
    farPlaneRadiusMultiplier: number;
  }>,
): {
  offsetRatio: number;
  zoomLevel: number;
  nearPlane: number;
  minimumFarPlane: number;
  farPlaneRadiusMultiplier: number;
} {
  return {
    offsetRatio: 2,
    zoomLevel: 1,
    nearPlane: 1e-3,
    minimumFarPlane: 10_000_000_000,
    farPlaneRadiusMultiplier: 5,
    ...overrides,
  };
}

// ── computeViewFittingZoom ──────────────────────────────────────────────────

describe('computeViewFittingZoom', () => {
  const fov = 45;
  const squareAspect = 1;

  describe('perspective correctness', () => {
    it('should produce lower zoom for a tall box viewed from below than orthographic formula', () => {
      const distance = 20;
      const halfZ = 8;
      const halfXy = 2;
      const tallBox = makeBox(new THREE.Vector3(0, 0, 0), halfXy, halfXy, halfZ);
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, -distance),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: tallBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Orthographic would give d * tan / halfXY
      const orthographicZoom = (distance * tanHalf) / halfXy;
      // Perspective: closest corners at z = -halfZ, forward distance = distance - halfZ = 12
      const perspectiveZoom = ((distance - halfZ) * tanHalf) / halfXy;

      expect(zoom).toBeCloseTo(perspectiveZoom, 5);
      expect(zoom).toBeLessThan(orthographicZoom);
    });

    it('should match orthographic formula for a flat box with no depth along viewing axis', () => {
      const distance = 10;
      const halfExtent = 3;
      const flatBox = makeBox(new THREE.Vector3(0, 0, 0), halfExtent, halfExtent, 0.001);
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, distance),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: flatBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      const orthographicZoom = (distance * tanHalf) / halfExtent;
      expect(zoom).toBeCloseTo(orthographicZoom, 1);
    });
  });

  describe('symmetric cube at target', () => {
    it('should agree with perspective formula for cube centered at target', () => {
      const distance = 10;
      const halfExtent = 1;
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));
      // Closest corners at forward distance (d - halfExtent)
      const expectedZoom = ((distance - halfExtent) * tanHalf) / halfExtent;

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, distance),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), halfExtent, halfExtent, halfExtent),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      expect(zoom).toBeCloseTo(expectedZoom, 5);
    });
  });

  describe('aspect ratio', () => {
    it('should produce higher zoom for landscape than portrait', () => {
      const box = makeBox(new THREE.Vector3(0, 0, 0), 2, 1, 1);
      const camera = new THREE.Vector3(0, 0, 10);
      const target = new THREE.Vector3(0, 0, 0);

      const landscapeZoom = computeViewFittingZoom({
        cameraPosition: camera,
        target,
        boundingBox: box,
        fovDeg: fov,
        aspectRatio: 16 / 9,
        paddingFactor: 1,
      });

      const portraitZoom = computeViewFittingZoom({
        cameraPosition: camera,
        target,
        boundingBox: box,
        fovDeg: fov,
        aspectRatio: 9 / 16,
        paddingFactor: 1,
      });

      expect(landscapeZoom).toBeGreaterThan(portraitZoom);
    });

    it('should be constrained horizontally for a wide object with square aspect', () => {
      const wideBox = makeBox(new THREE.Vector3(0, 0, 0), 4, 1, 1);
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: wideBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Closest corners at forward distance 9, horizontal tangent = 4/9
      // zoomH = aspect * tanHalf / (4/9) = 9 * tanHalf / 4
      const closestForward = 9;
      const zoomH = (squareAspect * closestForward * tanHalf) / 4;
      expect(zoom).toBeCloseTo(zoomH, 5);
    });
  });

  describe('viewpoint dependence', () => {
    it('should zoom in more from the top than from the side for a tall box', () => {
      const tallBox = makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 5);
      const target = new THREE.Vector3(0, 0, 0);

      const sideZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(10, 0, 0),
        target,
        boundingBox: tallBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      const topZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target,
        boundingBox: tallBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Top view sees a small X x Y face -> higher zoom
      expect(topZoom).toBeGreaterThan(sideZoom);
    });
  });

  describe('off-center geometry', () => {
    it('should produce the same zoom when camera + target + bbox are shifted together', () => {
      const halfExtent = 2;

      const centeredZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), halfExtent, halfExtent, halfExtent),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      const offset = new THREE.Vector3(100, 50, -30);
      const offCenterZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(offset.x, offset.y, 10 + offset.z),
        target: offset.clone(),
        boundingBox: makeBox(offset.clone(), halfExtent, halfExtent, halfExtent),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      expect(offCenterZoom).toBeCloseTo(centeredZoom, 5);
    });
  });

  describe('padding factor', () => {
    it('should scale linearly with padding factor', () => {
      const baseParameters = {
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      };

      const zoomFull = computeViewFittingZoom({ ...baseParameters, paddingFactor: 1 });
      const zoomPadded = computeViewFittingZoom({ ...baseParameters, paddingFactor: 0.8 });

      expect(zoomPadded / zoomFull).toBeCloseTo(0.8, 5);
    });

    it('should default to 0.9 when not specified', () => {
      const baseParameters = {
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      };

      const zoomDefault = computeViewFittingZoom(baseParameters);
      const zoomExplicit = computeViewFittingZoom({ ...baseParameters, paddingFactor: 0.9 });

      expect(zoomDefault).toBeCloseTo(zoomExplicit, 10);
    });
  });

  describe('degenerate cases', () => {
    it('should return 1 when camera is at the target', () => {
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(5, 5, 5),
        target: new THREE.Vector3(5, 5, 5),
        boundingBox: makeBox(new THREE.Vector3(5, 5, 5), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      });

      expect(zoom).toBe(1);
    });

    it('should return 1 for a zero-extent bounding box', () => {
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)),
        fovDeg: fov,
        aspectRatio: squareAspect,
      });

      expect(zoom).toBe(1);
    });

    it('should handle camera looking straight down the up axis without error', () => {
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 2, 3, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      expect(zoom).toBeGreaterThan(0);
      expect(Number.isFinite(zoom)).toBe(true);
    });

    it('should gracefully handle bbox corners behind the camera', () => {
      // Camera very close; some bbox corners behind the camera plane
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 2),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 5),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Corners at z = +5 are behind camera at z = 2 looking toward z = 0.
      // Should still produce a valid positive zoom based on the visible corners.
      expect(zoom).toBeGreaterThan(0);
      expect(Number.isFinite(zoom)).toBe(true);
    });
  });
});

// ── updateCameraFov ─────────────────────────────────────────────────────────

describe('updateCameraFov', () => {
  it('should set the camera FOV from the given angle', () => {
    const camera = createTestCamera(54, 10);
    const invalidate = vi.fn();

    updateCameraFov({ camera, cameraFovAngle: 60, invalidate });

    expect(camera.fov).toBeCloseTo(calculateFovFromAngle(60), 10);
  });

  it('should adjust distance to maintain perceived size', () => {
    const camera = createTestCamera(54, 10);
    const invalidate = vi.fn();
    const oldDistance = camera.position.length();
    const oldFov = camera.fov;

    updateCameraFov({ camera, cameraFovAngle: 30, invalidate });

    const newFov = camera.fov;
    const expectedDistance = calculateFovDistanceCompensation(oldFov, newFov, oldDistance);
    expect(camera.position.length()).toBeCloseTo(expectedDistance, 5);
  });

  it('should preserve camera direction after FOV change', () => {
    const camera = createTestCamera(54, 10);
    camera.position.set(3, 4, 5);
    camera.updateMatrixWorld(true);
    const invalidate = vi.fn();

    const directionBefore = camera.position.clone().normalize();

    updateCameraFov({ camera, cameraFovAngle: 75, invalidate });

    const directionAfter = camera.position.clone().normalize();
    expect(directionAfter.x).toBeCloseTo(directionBefore.x, 10);
    expect(directionAfter.y).toBeCloseTo(directionBefore.y, 10);
    expect(directionAfter.z).toBeCloseTo(directionBefore.z, 10);
  });

  it('should call invalidate', () => {
    const camera = createTestCamera(54, 10);
    const invalidate = vi.fn();

    updateCameraFov({ camera, cameraFovAngle: 45, invalidate });

    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('should not modify a non-PerspectiveCamera', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const invalidate = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    updateCameraFov({ camera, cameraFovAngle: 45, invalidate });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should not adjust distance when camera is at origin', () => {
    const camera = createTestCamera(54, 0);
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    const invalidate = vi.fn();

    updateCameraFov({ camera, cameraFovAngle: 60, invalidate });

    // Position should remain at origin (no direction to scale)
    expect(camera.position.length()).toBeLessThan(tanEpsilon);
  });
});

// ── resetCamera ─────────────────────────────────────────────────────────────

describe('resetCamera', () => {
  const origin = new THREE.Vector3(0, 0, 0);
  const defaultRotation = { side: -Math.PI / 4, vertical: Math.PI / 6 };

  it('should position camera at geometryCenter + spherical offset', () => {
    const camera = createTestCamera();
    const center = new THREE.Vector3(10, 5, 3);
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: center,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
    });

    // Camera should be at some offset from the center, not at the origin
    const distFromCenter = camera.position.distanceTo(center);
    expect(distFromCenter).toBeGreaterThan(0);
  });

  it('should set FOV from the cameraFovAngle', () => {
    const camera = createTestCamera();
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 45,
    });

    expect(camera.fov).toBeCloseTo(calculateFovFromAngle(45), 10);
  });

  it('should set zoom from perspective.zoomLevel', () => {
    const camera = createTestCamera();
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective({ zoomLevel: 2.5 }),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
    });

    expect(camera.zoom).toBe(2.5);
  });

  it('should look at geometry center, not origin', () => {
    const camera = createTestCamera();
    const center = new THREE.Vector3(50, 50, 50);
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: center,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
    });

    // After lookAt(center), the forward vector should point toward center
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toCenter = center.clone().sub(camera.position).normalize();
    expect(forward.dot(toCenter)).toBeCloseTo(1, 3);
  });

  it('should update orbit controls target and call update', () => {
    const camera = createTestCamera();
    const center = new THREE.Vector3(10, 20, 30);
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
    };

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: center,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
      controls,
    });

    expect(controls.target.x).toBeCloseTo(center.x);
    expect(controls.target.y).toBeCloseTo(center.y);
    expect(controls.target.z).toBeCloseTo(center.z);
    expect(controls.update).toHaveBeenCalledOnce();
  });

  it('should increase distance for portrait viewport aspect', () => {
    const camera1 = createTestCamera();
    const camera2 = createTestCamera();
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    // Landscape
    resetCamera({
      camera: camera1,
      geometryRadius: 100,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
      viewportAspect: 16 / 9,
    });

    // Portrait
    resetCamera({
      camera: camera2,
      geometryRadius: 100,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
      viewportAspect: 9 / 16,
    });

    const distLandscape = camera1.position.distanceTo(origin);
    const distPortrait = camera2.position.distanceTo(origin);
    expect(distPortrait).toBeGreaterThan(distLandscape);
  });

  it('should maintain current direction when enableConfiguredAngles is false', () => {
    const camera = createTestCamera(54, 10);
    camera.position.set(5, 5, 5);
    camera.updateMatrixWorld(true);
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();
    const directionBefore = camera.position.clone().normalize();

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
      enableConfiguredAngles: false,
    });

    const directionAfter = camera.position.clone().normalize();
    expect(directionAfter.x).toBeCloseTo(directionBefore.x, 5);
    expect(directionAfter.y).toBeCloseTo(directionBefore.y, 5);
    expect(directionAfter.z).toBeCloseTo(directionBefore.z, 5);
  });

  it('should default geometry radius to 1000 when radius is 0', () => {
    const camera = createTestCamera();
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    resetCamera({
      camera,
      geometryRadius: 0,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
    });

    // Camera should be positioned far out (distance proportional to 1000)
    const dist = camera.position.distanceTo(origin);
    expect(dist).toBeGreaterThan(500);
  });

  it('should not modify a non-PerspectiveCamera', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    resetCamera({
      camera,
      geometryRadius: 100,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
    });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should call invalidate and setSceneRadius', () => {
    const camera = createTestCamera();
    const invalidate = vi.fn();
    const setSceneRadius = vi.fn();

    resetCamera({
      camera,
      geometryRadius: 42,
      geometryCenter: origin,
      rotation: defaultRotation,
      perspective: defaultPerspective(),
      setSceneRadius,
      invalidate,
      cameraFovAngle: 60,
    });

    expect(invalidate).toHaveBeenCalledOnce();
    expect(setSceneRadius).toHaveBeenCalledWith(42);
  });
});
