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

describe('computeEnvironmentRotation', () => {
  it('keeps the studio reflection direction fixed in view space through tilt and roll', () => {
    const panelDirection = new THREE.Vector3(1, 1, 1).normalize();
    for (const angles of [
      [0, 0, 0],
      [0.8, -0.4, 0.2],
      [Math.PI, 0.1, 0.7],
    ]) {
      const cameraRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles));
      for (const up of ['x', 'y', 'z'] as const) {
        const environmentRotation = new THREE.Quaternion().setFromEuler(computeEnvironmentRotation(cameraRotation, up));
        const viewDirection = panelDirection
          .clone()
          .applyQuaternion(environmentRotation)
          .applyQuaternion(cameraRotation.clone().invert());
        expect(viewDirection.distanceTo(panelDirection)).toBeLessThan(1e-10);
      }
    }
  });
});

// ── computeHeadlampTransform ────────────────────────────────────────────────

describe('computeHeadlampTransform', () => {
  it('preserves the reference key direction through orbit, roll and scene scaling', () => {
    const expected = new THREE.Vector3(1, 1, 1).normalize();
    for (const radius of [0.001, 1, 1000]) {
      const camera = createTestCamera(54, radius * 10);
      camera.quaternion.setFromEuler(new THREE.Euler(0.8, -0.4, 0.6));
      camera.updateMatrixWorld(true);
      const { position, targetPosition } = computeHeadlampTransform({
        cameraPosition: camera.position,
        cameraMatrixWorld: camera.matrixWorld,
        sceneRadius: radius,
        config: defaultHeadlampConfig,
      });
      const viewDirection = position
        .sub(targetPosition)
        .normalize()
        .applyQuaternion(camera.quaternion.clone().invert());
      expect(viewDirection.distanceTo(expected)).toBeLessThan(1e-10);
    }
  });

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
  it('preserves light energy when switching projection or changing field of view', () => {
    const scene = new THREE.Scene();
    const headlamp = new THREE.DirectionalLight();
    const ambient = new THREE.AmbientLight();
    const config = createDefaultLightingConfig();
    for (const camera of [
      new THREE.OrthographicCamera(),
      createTestCamera(10),
      createTestCamera(54),
      createTestCamera(90),
    ]) {
      applyLightingForCamera({ scene, camera, headlamp, ambient, config });
      expect([headlamp.intensity, ambient.intensity, scene.environmentIntensity]).toEqual([
        config.headlampIntensity,
        config.ambientIntensity,
        config.environmentIntensity,
      ]);
    }
  });

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

    it('samples the WebGPU PMREM in the direction WebGL samples, through its y flip', () => {
      // Three r184 samples a PMREM at rotᵀ·d on WebGL and at rotᵀ·F·d on WebGPU, whose layout
      // needs F·(rotᵀ·d). A camera tilted off the y axis exposes the difference.
      const camera = new THREE.PerspectiveCamera();
      camera.up.set(0, 0, 1);
      camera.position.set(1, -1, 0.7);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      /** The lookup direction each backend's sampler forms from the rotation Tau sets. */
      const sampleDirection = (
        backend: 'webgl' | 'webgpu',
        webGpuPmrem: boolean,
        direction: THREE.Vector3,
      ): THREE.Vector3 => {
        const scene = createTestScene();
        const config = createDefaultLightingConfig({ webGpuPmrem });
        applyLightingForCamera({ scene, camera, headlamp: undefined, ambient: undefined, config });
        const rotation = new THREE.Matrix4().makeRotationFromEuler(scene.environmentRotation).transpose();
        return (backend === 'webgpu' ? flipY(direction) : direction.clone()).applyMatrix4(rotation);
      };
      const flipY = (vector: THREE.Vector3): THREE.Vector3 => vector.clone().setY(-vector.y);

      for (const direction of [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0.3, -0.5, 0.8),
      ]) {
        const webGl = flipY(sampleDirection('webgl', false, direction));
        expect(sampleDirection('webgpu', true, direction).distanceTo(webGl)).toBeLessThan(1e-9);
        // Uncompensated, the WebGPU lookup points elsewhere.
        expect(sampleDirection('webgpu', false, direction).distanceTo(webGl)).toBeGreaterThan(0.1);
      }
    });
  });

  describe('environment intensity', () => {
    it('should set scene.environmentIntensity from the configured profile', () => {
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

      expect(scene.environmentIntensity).toBeCloseTo(environmentBaseIntensity, 2);
    });

    it('should preserve environment intensity at low FOV', () => {
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

      expect(scene.environmentIntensity).toBe(environmentBaseIntensity);
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
    it('should update ambient intensity when provided', () => {
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

      expect(ambient.intensity).toBeCloseTo(ambientBaseIntensity, 2);
    });

    it('should preserve ambient intensity at low FOV', () => {
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

      expect(ambient.intensity).toBe(ambientBaseIntensity);
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

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient: undefined,
        config,
      });

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

      applyLightingForCamera({
        scene,
        camera,
        headlamp,
        ambient: undefined,
        config,
      });

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

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient,
        config,
      });

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

    it('should preserve theme scaling at low FOV', () => {
      const scene = createTestScene();
      const camera = createTestCamera(10);
      const config = createDefaultLightingConfig({
        themeIntensityScale: darkModeIntensityScale,
      });

      applyLightingForCamera({
        scene,
        camera,
        headlamp: undefined,
        ambient: undefined,
        config,
      });

      expect(scene.environmentIntensity).toBe(environmentBaseIntensity * darkModeIntensityScale);
    });
  });
});
