import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeEnvironmentRotation,
  computeHeadlampTransform,
  applyLightingForCamera,
  defaultHeadlampConfig,
  ambientBaseIntensity,
  headlampBaseIntensity,
  environmentBaseIntensity,
  poleFadeAngleDeg,
  darkModeIntensityScale,
  darkModeAmbientBoost,
} from '#components/geometry/graphics/three/utils/lights.utils.js';
import type { HeadlampConfig, LightingConfig } from '#components/geometry/graphics/three/utils/lights.utils.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a PerspectiveCamera positioned along +Z looking at origin. */
function createTestCamera(fov = 54, distance = 10): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Creates a minimal Scene with environment rotation support. */
function createTestScene(): THREE.Scene {
  const scene = new THREE.Scene();
  return scene;
}

/** Creates the default lighting config used in most tests. */
function createDefaultLightingConfig(overrides?: Partial<LightingConfig>): LightingConfig {
  return {
    sceneRadius: 5,
    upDirection: 'z',
    headlampIntensity: headlampBaseIntensity,
    ambientIntensity: ambientBaseIntensity,
    environmentIntensity: environmentBaseIntensity,
    headlampConfig: defaultHeadlampConfig,
    ...overrides,
  };
}

// ── computeEnvironmentRotation ──────────────────────────────────────────────

/**
 * Builds an orbit-camera quaternion: Q_yaw(azimuth) * Q_pitch(polar).
 *
 * For Z-up the orbit is: rotate around Z by `azimuth`, then tilt around
 * the resulting local X by `polar`.
 */
function orbitQuaternion(azimuth: number, polar: number, up: 'x' | 'y' | 'z' = 'z'): THREE.Quaternion {
  const upAxis =
    up === 'z' ? new THREE.Vector3(0, 0, 1) : up === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);

  const pitchAxis =
    up === 'z' ? new THREE.Vector3(1, 0, 0) : up === 'y' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);

  const qYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, azimuth);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(pitchAxis, polar);
  return qYaw.multiply(qPitch);
}

/** Polar angle (from top) within which the pole-fade is fully active (yaw → 0). */
const poleFadeRad = (poleFadeAngleDeg * Math.PI) / 180;

describe('computeEnvironmentRotation', () => {
  // ── Basic identity and order ────────────────────────────────────────────

  describe('identity camera', () => {
    it('should produce a near-zero Euler for an identity quaternion', () => {
      // Identity quaternion sits at the top pole — pole fade drives yaw to 0.
      const identityQuat = new THREE.Quaternion(); // (0, 0, 0, 1)
      const euler = computeEnvironmentRotation(identityQuat, 'z');

      expect(euler.x).toBeCloseTo(0, 6);
      expect(euler.y).toBeCloseTo(0, 6);
      expect(euler.z).toBeCloseTo(0, 6);
    });
  });

  describe('euler order selection', () => {
    it('should use ZXY order for z-up', () => {
      const quat = new THREE.Quaternion();
      const euler = computeEnvironmentRotation(quat, 'z');
      expect(euler.order).toBe('ZXY');
    });

    it('should use YXZ order for y-up', () => {
      const quat = new THREE.Quaternion();
      const euler = computeEnvironmentRotation(quat, 'y');
      expect(euler.order).toBe('YXZ');
    });

    it('should use XZY order for x-up', () => {
      const quat = new THREE.Quaternion();
      const euler = computeEnvironmentRotation(quat, 'x');
      expect(euler.order).toBe('XZY');
    });
  });

  // ── Azimuth extraction (non-pole cameras) ───────────────────────────────

  describe('azimuth-only extraction', () => {
    it('should extract correct yaw for each up direction at equatorial polar', () => {
      // Use polar = π/2 (equator) where blend = 1 → full yaw
      const angle = Math.PI / 3;

      const eulerZ = computeEnvironmentRotation(orbitQuaternion(angle, Math.PI / 2, 'z'), 'z');
      expect(eulerZ.z).toBeCloseTo(angle, 4);
      expect(eulerZ.x).toBeCloseTo(0, 6);
      expect(eulerZ.y).toBeCloseTo(0, 6);

      const eulerY = computeEnvironmentRotation(orbitQuaternion(angle, Math.PI / 2, 'y'), 'y');
      expect(eulerY.y).toBeCloseTo(angle, 4);
      expect(eulerY.x).toBeCloseTo(0, 6);
      expect(eulerY.z).toBeCloseTo(0, 6);

      const eulerX = computeEnvironmentRotation(orbitQuaternion(angle, Math.PI / 2, 'x'), 'x');
      expect(eulerX.x).toBeCloseTo(angle, 4);
      expect(eulerX.y).toBeCloseTo(0, 6);
      expect(eulerX.z).toBeCloseTo(0, 6);
    });

    it('should only populate the up-axis Euler component (pitch/roll zeroed)', () => {
      // Polar π/3 (60°) — well away from both poles, blend ≈ 1
      const quat = orbitQuaternion(Math.PI / 4, Math.PI / 3, 'z');
      const euler = computeEnvironmentRotation(quat, 'z');

      expect(euler.z).toBeCloseTo(Math.PI / 4, 4);
      expect(euler.x).toBeCloseTo(0, 6);
      expect(euler.y).toBeCloseTo(0, 6);
    });
  });

  // ── Polar-angle independence (mid-latitude band only) ───────────────────

  describe('polar-angle independence (outside pole caps)', () => {
    it('should return the same rotation for polar angles in the mid-latitude band (z-up)', () => {
      const azimuth = Math.PI / 4;
      // Stay well outside the pole-fade caps (poleFadeAngleDeg from each pole)
      const safeMargin = poleFadeRad + 0.05;
      const polarAngles = [
        safeMargin,
        Math.PI / 4,
        Math.PI / 3,
        Math.PI / 2,
        (2 * Math.PI) / 3,
        (3 * Math.PI) / 4,
        Math.PI - safeMargin,
      ];

      const results = polarAngles.map((polar) => {
        const quat = orbitQuaternion(azimuth, polar, 'z');
        return computeEnvironmentRotation(quat, 'z');
      });

      for (const euler of results) {
        expect(euler.z).toBeCloseTo(azimuth, 3);
        expect(euler.x).toBeCloseTo(0, 6);
        expect(euler.y).toBeCloseTo(0, 6);
      }
    });

    it('should return the same rotation for polar angles in the mid-latitude band (y-up)', () => {
      const azimuth = -Math.PI / 3;
      const safeMargin = poleFadeRad + 0.05;
      const polarAngles = [safeMargin, Math.PI / 4, Math.PI / 2, Math.PI - safeMargin];

      const results = polarAngles.map((polar) => {
        const quat = orbitQuaternion(azimuth, polar, 'y');
        return computeEnvironmentRotation(quat, 'y');
      });

      for (const euler of results) {
        expect(euler.y).toBeCloseTo(azimuth, 3);
        expect(euler.x).toBeCloseTo(0, 6);
        expect(euler.z).toBeCloseTo(0, 6);
      }
    });
  });

  // ── Continuity ──────────────────────────────────────────────────────────

  describe('continuity across equatorial plane', () => {
    it('should be continuous sweeping polar through 90° (z-up)', () => {
      const azimuth = Math.PI / 3;
      const steps = 100;
      const polarStart = Math.PI / 4;
      const polarEnd = (3 * Math.PI) / 4;

      let previousZ: number | undefined;
      for (let index = 0; index <= steps; index++) {
        const polar = polarStart + (index / steps) * (polarEnd - polarStart);
        const quat = orbitQuaternion(azimuth, polar, 'z');
        const euler = computeEnvironmentRotation(quat, 'z');

        if (previousZ !== undefined) {
          const delta = Math.abs(euler.z - previousZ);
          expect(delta).toBeLessThan(0.1);
        }

        previousZ = euler.z;
      }
    });

    it('should be continuous sweeping polar through 90° (y-up)', () => {
      const azimuth = -Math.PI / 6;
      const steps = 100;
      const polarStart = Math.PI / 4;
      const polarEnd = (3 * Math.PI) / 4;

      let previousY: number | undefined;
      for (let index = 0; index <= steps; index++) {
        const polar = polarStart + (index / steps) * (polarEnd - polarStart);
        const quat = orbitQuaternion(azimuth, polar, 'y');
        const euler = computeEnvironmentRotation(quat, 'y');

        if (previousY !== undefined) {
          const delta = Math.abs(euler.y - previousY);
          expect(delta).toBeLessThan(0.1);
        }

        previousY = euler.y;
      }
    });
  });

  describe('full azimuth sweep is continuous', () => {
    it('should have no jumps across the full −π→+π azimuth range', () => {
      const polar = Math.PI / 3; // 60° — well away from poles
      const steps = 360;

      let previousZ: number | undefined;
      for (let index = 0; index <= steps; index++) {
        const azimuth = (index / steps) * 2 * Math.PI - Math.PI;
        const quat = orbitQuaternion(azimuth, polar, 'z');
        const euler = computeEnvironmentRotation(quat, 'z');

        if (previousZ !== undefined) {
          let delta = Math.abs(euler.z - previousZ);
          if (delta > Math.PI) {
            delta = 2 * Math.PI - delta;
          }

          expect(delta).toBeLessThan(0.1);
        }

        previousZ = euler.z;
      }
    });
  });

  // ── Pole-proximity fade ─────────────────────────────────────────────────

  describe('pole-proximity fade', () => {
    it('should return near-zero yaw at the top pole (polar ≈ 0)', () => {
      // Top pole: polar = 0° → camera looking straight down along up axis
      const quat = orbitQuaternion(Math.PI / 2, 0, 'z');
      const euler = computeEnvironmentRotation(quat, 'z');
      expect(Math.abs(euler.z)).toBeLessThan(0.01);
    });

    it('should return near-zero yaw at the bottom pole (polar ≈ π)', () => {
      // Bottom pole: polar = π → camera looking straight up from below
      const quat = orbitQuaternion(Math.PI / 2, Math.PI - 0.001, 'z');
      const euler = computeEnvironmentRotation(quat, 'z');
      expect(Math.abs(euler.z)).toBeLessThan(0.01);
    });

    it('should return full yaw at the equator (polar = π/2)', () => {
      const azimuth = Math.PI / 3;
      const quat = orbitQuaternion(azimuth, Math.PI / 2, 'z');
      const euler = computeEnvironmentRotation(quat, 'z');
      expect(euler.z).toBeCloseTo(azimuth, 4);
    });

    it('should return full yaw well outside the pole cap', () => {
      const azimuth = Math.PI / 4;
      // 30° from top pole — outside the 15° cap
      const quat = orbitQuaternion(azimuth, Math.PI / 6, 'z');
      const euler = computeEnvironmentRotation(quat, 'z');
      expect(euler.z).toBeCloseTo(azimuth, 2);
    });

    it('should be symmetric between top and bottom poles', () => {
      const azimuth = Math.PI / 4;
      // 5° from top pole
      const topQuat = orbitQuaternion(azimuth, 0.087, 'z');
      const topEuler = computeEnvironmentRotation(topQuat, 'z');

      // 5° from bottom pole
      const bottomQuat = orbitQuaternion(azimuth, Math.PI - 0.087, 'z');
      const bottomEuler = computeEnvironmentRotation(bottomQuat, 'z');

      // Both should have heavily attenuated yaw (blend close to 0)
      expect(Math.abs(topEuler.z)).toBeLessThan(Math.abs(azimuth) * 0.3);
      expect(Math.abs(bottomEuler.z)).toBeLessThan(Math.abs(azimuth) * 0.3);
    });

    it('should produce a monotonically increasing blend from pole to equator', () => {
      const azimuth = Math.PI / 3;
      const steps = 50;
      // Sweep from top pole (polar = 0) to equator (polar = π/2)
      let previousAbsZ = -1;
      for (let index = 1; index <= steps; index++) {
        const polar = (index / steps) * (Math.PI / 2);
        const quat = orbitQuaternion(azimuth, polar, 'z');
        const euler = computeEnvironmentRotation(quat, 'z');
        const absZ = Math.abs(euler.z);
        expect(absZ).toBeGreaterThanOrEqual(previousAbsZ - 1e-6);
        previousAbsZ = absZ;
      }
    });
  });

  describe('continuity through pole-fade transition (no lighting hop)', () => {
    it('should be continuous sweeping from equator through bottom pole cap (z-up)', () => {
      const azimuth = Math.PI / 3;
      const steps = 500;
      // Sweep from π/3 (60°) all the way to near-bottom pole
      const polarStart = Math.PI / 3;
      const polarEnd = Math.PI - 0.01;

      let previousZ: number | undefined;
      for (let index = 0; index <= steps; index++) {
        const polar = polarStart + (index / steps) * (polarEnd - polarStart);
        const quat = orbitQuaternion(azimuth, polar, 'z');
        const euler = computeEnvironmentRotation(quat, 'z');

        if (previousZ !== undefined) {
          // A genuine hop (the original bug) would produce a delta of ~π.
          // The smoothstep fade may produce up to ~0.04 rad per step at
          // 500 steps, well within the 0.1 rad threshold.
          const delta = Math.abs(euler.z - previousZ);
          expect(delta).toBeLessThan(0.1);
        }

        previousZ = euler.z;
      }
    });

    it('should be continuous sweeping from equator through top pole cap (z-up)', () => {
      const azimuth = -Math.PI / 4;
      const steps = 500;
      const polarStart = (2 * Math.PI) / 3;
      const polarEnd = 0.01;

      let previousZ: number | undefined;
      for (let index = 0; index <= steps; index++) {
        const polar = polarStart + (index / steps) * (polarEnd - polarStart);
        const quat = orbitQuaternion(azimuth, polar, 'z');
        const euler = computeEnvironmentRotation(quat, 'z');

        if (previousZ !== undefined) {
          const delta = Math.abs(euler.z - previousZ);
          expect(delta).toBeLessThan(0.1);
        }

        previousZ = euler.z;
      }
    });
  });

  describe('near-pole perturbation stability', () => {
    it('should produce small yaw changes for small camera perturbations near bottom pole', () => {
      // At 3° from the bottom pole, perturb the azimuth by 90° (worst case).
      // Without pole-fade this would be a massive lighting change; with it
      // the effective yaw should be heavily attenuated.
      const polar = Math.PI - 0.05; // ~3° from bottom pole
      const euler1 = computeEnvironmentRotation(orbitQuaternion(0, polar, 'z'), 'z');
      const euler2 = computeEnvironmentRotation(orbitQuaternion(Math.PI / 2, polar, 'z'), 'z');

      // The effective yaw difference should be much smaller than π/2 (the raw difference)
      const effectiveDelta = Math.abs(euler2.z - euler1.z);
      expect(effectiveDelta).toBeLessThan(0.15); // < ~9°
    });

    it('should produce small yaw changes for small camera perturbations near top pole', () => {
      const polar = 0.05; // ~3° from top pole
      const euler1 = computeEnvironmentRotation(orbitQuaternion(0, polar, 'z'), 'z');
      const euler2 = computeEnvironmentRotation(orbitQuaternion(Math.PI / 2, polar, 'z'), 'z');

      const effectiveDelta = Math.abs(euler2.z - euler1.z);
      expect(effectiveDelta).toBeLessThan(0.15);
    });
  });

  // ── Degenerate / edge cases ─────────────────────────────────────────────

  describe('degenerate cases', () => {
    it('should return identity for exact bottom-pole quaternion (q.z = q.w = 0)', () => {
      const degenerate = new THREE.Quaternion(0, 1, 0, 0); // 180° around Y
      const euler = computeEnvironmentRotation(degenerate, 'z');

      expect(euler.x).toBeCloseTo(0, 6);
      expect(euler.y).toBeCloseTo(0, 6);
      expect(euler.z).toBeCloseTo(0, 6);
    });

    it('should return identity for exact top-pole quaternion (q.x = q.y = 0)', () => {
      // Pure yaw with no pitch → top pole. Pole-fade drives effective yaw to 0.
      const topPole = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      const euler = computeEnvironmentRotation(topPole, 'z');

      expect(euler.x).toBeCloseTo(0, 6);
      expect(euler.y).toBeCloseTo(0, 6);
      // At top pole, blend = 0 so effective yaw = 0
      expect(euler.z).toBeCloseTo(0, 6);
    });

    it('should handle near-zero-length quaternion gracefully', () => {
      // Edge case: quaternion is nearly zero (shouldn't happen but protect against it)
      const nearZero = new THREE.Quaternion(1e-8, 1e-8, 1e-8, 1e-8);
      expect(() => computeEnvironmentRotation(nearZero, 'z')).not.toThrow();
    });
  });

  // ── Input immutability ──────────────────────────────────────────────────

  describe('does not mutate input', () => {
    it('should not modify the input quaternion', () => {
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3);
      const originalW = quat.w;
      const originalX = quat.x;
      const originalY = quat.y;
      const originalZ = quat.z;

      computeEnvironmentRotation(quat, 'z');

      expect(quat.x).toBe(originalX);
      expect(quat.y).toBe(originalY);
      expect(quat.z).toBe(originalZ);
      expect(quat.w).toBe(originalW);
    });
  });
});

// ── computeHeadlampTransform ────────────────────────────────────────────────

describe('computeHeadlampTransform', () => {
  describe('identity camera matrix', () => {
    it('should offset position in camera-up (+Y) and camera-right (+X) directions', () => {
      const cameraPosition = new THREE.Vector3(0, 0, 10);
      const cameraMatrix = new THREE.Matrix4().identity();
      const radius = 5;

      const { position } = computeHeadlampTransform({
        cameraPosition,
        cameraMatrixWorld: cameraMatrix,
        sceneRadius: radius,
        config: defaultHeadlampConfig,
      });

      // With identity matrix:
      // camera-right = column 0 = (1,0,0)
      // camera-up = column 1 = (0,1,0)
      // Expected position: (0,0,10) + (0,1,0) * 5 * 2.1 + (1,0,0) * 5 * -0.1
      const expectedX = 0 + radius * defaultHeadlampConfig.rightOffset;
      const expectedY = 0 + radius * defaultHeadlampConfig.upOffset;
      const expectedZ = 10;

      expect(position.x).toBeCloseTo(expectedX, 6);
      expect(position.y).toBeCloseTo(expectedY, 6);
      expect(position.z).toBeCloseTo(expectedZ, 6);
    });

    it('should place the target forward of camera with skew offsets', () => {
      const cameraPosition = new THREE.Vector3(0, 0, 10);
      const cameraMatrix = new THREE.Matrix4().identity();
      const radius = 5;

      const { targetPosition } = computeHeadlampTransform({
        cameraPosition,
        cameraMatrixWorld: cameraMatrix,
        sceneRadius: radius,
        config: defaultHeadlampConfig,
      });

      // With identity matrix:
      // camera-forward = -column2 = (0,0,-1) negated = (0,0,1)... actually
      // column 2 of identity = (0,0,1), negated = (0,0,-1)
      // forward direction = -column2 = (0,0,-1)
      // target = camera_pos + forward * radius * 2 + right * (-radius * skew) + up * (-radius * skew)
      const expectedZ = 10 + -1 * radius * 2;
      const expectedX = 0 + -radius * defaultHeadlampConfig.targetRightSkew;
      const expectedY = 0 + -radius * defaultHeadlampConfig.targetUpSkew;

      expect(targetPosition.x).toBeCloseTo(expectedX, 6);
      expect(targetPosition.y).toBeCloseTo(expectedY, 6);
      expect(targetPosition.z).toBeCloseTo(expectedZ, 6);
    });
  });

  describe('scaling with sceneRadius', () => {
    it('should produce proportionally larger offsets with larger radius', () => {
      const cameraPosition = new THREE.Vector3(0, 0, 10);
      const cameraMatrix = new THREE.Matrix4().identity();

      const small = computeHeadlampTransform({
        cameraPosition,
        cameraMatrixWorld: cameraMatrix,
        sceneRadius: 1,
        config: defaultHeadlampConfig,
      });
      const large = computeHeadlampTransform({
        cameraPosition,
        cameraMatrixWorld: cameraMatrix,
        sceneRadius: 10,
        config: defaultHeadlampConfig,
      });

      // The offset from camera position should be 10x larger
      const smallOffset = small.position.clone().sub(cameraPosition);
      const largeOffset = large.position.clone().sub(cameraPosition);

      expect(largeOffset.length()).toBeCloseTo(smallOffset.length() * 10, 4);
    });
  });

  describe('custom config', () => {
    it('should respect custom offset values', () => {
      const cameraPosition = new THREE.Vector3(0, 0, 0);
      const cameraMatrix = new THREE.Matrix4().identity();
      const radius = 1;
      const config: HeadlampConfig = {
        rightOffset: 1,
        upOffset: 1,
        targetRightSkew: 0,
        targetUpSkew: 0,
      };

      const { position } = computeHeadlampTransform({
        cameraPosition,
        cameraMatrixWorld: cameraMatrix,
        sceneRadius: radius,
        config,
      });

      // Camera-right = (1,0,0), camera-up = (0,1,0)
      // position = (0,0,0) + (0,1,0)*1*1 + (1,0,0)*1*1 = (1, 1, 0)
      expect(position.x).toBeCloseTo(1, 6);
      expect(position.y).toBeCloseTo(1, 6);
      expect(position.z).toBeCloseTo(0, 6);
    });
  });

  describe('does not mutate input', () => {
    it('should not modify the input camera position', () => {
      const cameraPosition = new THREE.Vector3(1, 2, 3);
      const originalX = cameraPosition.x;
      const originalY = cameraPosition.y;
      const originalZ = cameraPosition.z;
      const cameraMatrix = new THREE.Matrix4().identity();

      computeHeadlampTransform({
        cameraPosition,
        cameraMatrixWorld: cameraMatrix,
        sceneRadius: 5,
        config: defaultHeadlampConfig,
      });

      expect(cameraPosition.x).toBe(originalX);
      expect(cameraPosition.y).toBe(originalY);
      expect(cameraPosition.z).toBe(originalZ);
    });
  });
});

// ── applyLightingForCamera ──────────────────────────────────────────────────

describe('applyLightingForCamera', () => {
  describe('environment rotation', () => {
    it('should set scene.environmentRotation based on camera orientation', () => {
      const scene = createTestScene();
      const camera = createTestCamera();
      const config = createDefaultLightingConfig();

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient: undefined,
        config,
      });

      // EnvironmentRotation should have been set (not identity if camera is looking at origin from +Z)
      const euler = scene.environmentRotation;
      expect(euler).toBeDefined();
      // The Euler order should match z-up
      expect(euler.order).toBe('ZXY');
    });
  });

  describe('environment intensity', () => {
    it('should set scene.environmentIntensity using FOV compensation', () => {
      const scene = createTestScene();
      const camera = createTestCamera(54); // Reference FOV
      const config = createDefaultLightingConfig();

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient: undefined,
        config,
      });

      // At reference FOV (54), envFactor ≈ 1.0, so intensity ≈ base
      expect(scene.environmentIntensity).toBeCloseTo(environmentBaseIntensity, 2);
    });

    it('should reduce environment intensity at low FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(10); // Low FOV
      const config = createDefaultLightingConfig();

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient: undefined,
        config,
      });

      expect(scene.environmentIntensity).toBeLessThan(environmentBaseIntensity);
    });
  });

  describe('headlamp positioning', () => {
    it('should update headlamp position and intensity when provided', () => {
      const scene = createTestScene();
      const camera = createTestCamera();
      const headlamp = new THREE.DirectionalLight('white', 1);
      scene.add(headlamp);
      scene.add(headlamp.target);
      const config = createDefaultLightingConfig();

      const originalPosition = headlamp.position.clone();

      applyLightingForCamera({
        scene,
        camera,
        headlamp,
        ambient: undefined,
        config,
      });

      // Position should have changed
      expect(headlamp.position.equals(originalPosition)).toBe(false);
      // Intensity should be set (at reference FOV, headlampFactor ≈ 1.0)
      expect(headlamp.intensity).toBeCloseTo(headlampBaseIntensity, 2);
    });

    it('should not throw when headlamp is undefined', () => {
      const scene = createTestScene();
      const camera = createTestCamera();
      const config = createDefaultLightingConfig();

      expect(() => {
        applyLightingForCamera({
          scene,
          camera,
          headlamp: undefined,
          ambient: undefined,
          config,
        });
      }).not.toThrow();
    });
  });

  describe('ambient light', () => {
    it('should update ambient intensity with FOV compensation when provided', () => {
      const scene = createTestScene();
      const camera = createTestCamera(54); // Reference FOV
      const ambient = new THREE.AmbientLight('white', 1);
      scene.add(ambient);
      const config = createDefaultLightingConfig();

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient,
        config,
      });

      // At reference FOV, ambientFactor ≈ 1.0
      expect(ambient.intensity).toBeCloseTo(ambientBaseIntensity, 2);
    });

    it('should boost ambient intensity at low FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(10); // Low FOV
      const ambient = new THREE.AmbientLight('white', 1);
      scene.add(ambient);
      const config = createDefaultLightingConfig();

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient,
        config,
      });

      // At low FOV, ambientFactor > 1.0
      expect(ambient.intensity).toBeGreaterThan(ambientBaseIntensity);
    });

    it('should not throw when ambient is undefined', () => {
      const scene = createTestScene();
      const camera = createTestCamera();
      const config = createDefaultLightingConfig();

      expect(() => {
        applyLightingForCamera({
          scene,
          camera,
          headlamp: undefined,
          ambient: undefined,
          config,
        });
      }).not.toThrow();
    });
  });

  describe('consistency across camera angles', () => {
    it('should produce different environment rotations for different azimuthal positions', () => {
      const scene1 = createTestScene();
      const scene2 = createTestScene();
      const config = createDefaultLightingConfig();

      // Camera 1: azimuth 0°, polar 45°
      const camera1 = createTestCamera();
      camera1.quaternion.copy(orbitQuaternion(0, Math.PI / 4, 'z'));
      camera1.updateMatrixWorld(true);

      // Camera 2: azimuth 90°, polar 45°
      const camera2 = createTestCamera();
      camera2.quaternion.copy(orbitQuaternion(Math.PI / 2, Math.PI / 4, 'z'));
      camera2.updateMatrixWorld(true);

      applyLightingForCamera({
        scene: scene1,
        camera: camera1,
        headlamp: undefined,
        ambient: undefined,
        config,
      });
      applyLightingForCamera({
        scene: scene2,
        camera: camera2,
        headlamp: undefined,
        ambient: undefined,
        config,
      });

      // Different azimuths should produce different environment rotations
      const rot1 = scene1.environmentRotation;
      const rot2 = scene2.environmentRotation;
      const isIdentical =
        Math.abs(rot1.x - rot2.x) < 1e-6 && Math.abs(rot1.y - rot2.y) < 1e-6 && Math.abs(rot1.z - rot2.z) < 1e-6;
      expect(isIdentical).toBe(false);
    });
  });

  describe('theme intensity scaling', () => {
    it('should scale environment intensity by themeIntensityScale at reference FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(54);
      const config = createDefaultLightingConfig({
        themeIntensityScale: darkModeIntensityScale,
      });

      applyLightingForCamera({ scene, camera, headlamp: undefined, ambient: undefined, config });

      expect(scene.environmentIntensity).toBeCloseTo(environmentBaseIntensity * darkModeIntensityScale, 2);
    });

    it('should scale headlamp intensity by themeIntensityScale at reference FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(54);
      const headlamp = new THREE.DirectionalLight('white', 1);
      scene.add(headlamp);
      scene.add(headlamp.target);
      const config = createDefaultLightingConfig({
        themeIntensityScale: darkModeIntensityScale,
      });

      applyLightingForCamera({ scene, camera, headlamp, ambient: undefined, config });

      expect(headlamp.intensity).toBeCloseTo(headlampBaseIntensity * darkModeIntensityScale, 2);
    });

    it('should scale ambient intensity by themeIntensityScale × themeAmbientBoost at reference FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(54);
      const ambient = new THREE.AmbientLight('white', 1);
      scene.add(ambient);
      const config = createDefaultLightingConfig({
        themeIntensityScale: darkModeIntensityScale,
        themeAmbientBoost: darkModeAmbientBoost,
      });

      applyLightingForCamera({ scene, camera, headlamp: undefined, ambient, config });

      const expected = ambientBaseIntensity * darkModeIntensityScale * darkModeAmbientBoost;
      expect(ambient.intensity).toBeCloseTo(expected, 4);
    });

    it('should default to 1.0 when theme fields are undefined (backward compatible)', () => {
      const scene = createTestScene();
      const camera = createTestCamera(54);
      const headlamp = new THREE.DirectionalLight('white', 1);
      scene.add(headlamp);
      scene.add(headlamp.target);
      const ambient = new THREE.AmbientLight('white', 1);
      scene.add(ambient);
      const config = createDefaultLightingConfig();

      applyLightingForCamera({ scene, camera, headlamp, ambient, config });

      expect(scene.environmentIntensity).toBeCloseTo(environmentBaseIntensity, 2);
      expect(headlamp.intensity).toBeCloseTo(headlampBaseIntensity, 2);
      expect(ambient.intensity).toBeCloseTo(ambientBaseIntensity, 2);
    });

    it('should compose theme scaling with FOV compensation at low FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(10);
      const config = createDefaultLightingConfig({
        themeIntensityScale: darkModeIntensityScale,
      });

      applyLightingForCamera({ scene, camera, headlamp: undefined, ambient: undefined, config });

      // At low FOV with dark mode: environment should be less than both the
      // base value AND the dark-mode-only value (both FOV and theme dim it)
      expect(scene.environmentIntensity).toBeLessThan(environmentBaseIntensity * darkModeIntensityScale);
    });
  });
});
