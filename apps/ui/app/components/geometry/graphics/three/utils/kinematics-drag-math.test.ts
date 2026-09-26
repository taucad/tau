import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import {
  createKinematicsDragPlane,
  hasExceededKinematicsDragThreshold,
  intersectKinematicsDragPlane,
  toKinematicsPointerNdc,
} from '#components/geometry/graphics/three/utils/kinematics-drag-math.js';

describe('kinematics drag math', () => {
  describe('threshold', () => {
    it('should keep a press below 4 px a click and start a drag at 4 px', () => {
      const start = { clientX: 100, clientY: 100 };

      expect(hasExceededKinematicsDragThreshold(start, { clientX: 102, clientY: 102 })).toBe(false);
      expect(hasExceededKinematicsDragThreshold(start, { clientX: 100, clientY: 104 })).toBe(true);
    });
  });

  describe('pointer to drag-plane target', () => {
    it('should map the canvas centre and edges into normalized device coordinates', () => {
      const rect = { left: 10, top: 20, width: 200, height: 100 };

      expect(toKinematicsPointerNdc(rect, { clientX: 110, clientY: 70 }).toArray()).toEqual([0, 0]);
      expect(toKinematicsPointerNdc(rect, { clientX: 210, clientY: 20 }).toArray()).toEqual([1, 1]);
    });

    it('should hit the camera-facing plane through the grab point with a perspective camera', () => {
      const camera = new PerspectiveCamera(90, 1, 0.1, 100);
      camera.position.set(0, 0, 10);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const plane = createKinematicsDragPlane(camera, new Vector3(1, 2, 0));

      const target = intersectKinematicsDragPlane({
        raycaster: new Raycaster(),
        camera,
        plane,
        ndc: new Vector2(0.5, 0),
      });

      // The plane is z = 0 (facing the camera); at depth 10 with a 90° field of view NDC 0.5 is 5 units right.
      expect(plane.normal.z).toBe(-1);
      expect(target?.x).toBeCloseTo(5);
      expect(target?.y).toBeCloseTo(0);
      expect(target?.z).toBeCloseTo(0);
    });

    it('should hit the camera-facing plane at the grab depth with an orthographic camera', () => {
      const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
      camera.position.set(0, 0, 10);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const plane = createKinematicsDragPlane(camera, new Vector3(0, 0, -3));

      const target = intersectKinematicsDragPlane({
        raycaster: new Raycaster(),
        camera,
        plane,
        ndc: new Vector2(-0.5, 0.25),
      });

      expect(target?.x).toBeCloseTo(-5);
      expect(target?.y).toBeCloseTo(2.5);
      expect(target?.z).toBeCloseTo(-3);
    });
  });
});
