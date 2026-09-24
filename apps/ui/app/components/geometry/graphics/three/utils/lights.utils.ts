/**
 * Pure lighting utilities extracted from the Lights component.
 *
 * These functions encapsulate the live renderer's per-frame camera-relative
 * lighting logic.
 */

import * as THREE from 'three';

/** Output buffer for camera world rotation — reused by every `applyLightingForCamera` call. */
const scratchCameraWorldQuaternionForLighting = new THREE.Quaternion();

// ── Lighting constants ─────────────────────────────────────────────────────
/** Low diffuse fill; metallic readability comes from the room environment. */
export const ambientBaseIntensity = 0.1;

/**
 * Camera-relative diffuse key, calibrated with Neutral tone mapping at exposure 1.
 */
export const headlampBaseIntensity = 1.5;

/**
 * Environment reflections supplement the directional key without washing out
 * the surface gradient. Projection changes preserve the same light energy.
 */
export const environmentBaseIntensity = 1;

/** Explicit studio controls; material roughness and metalness remain authored properties. */
export type StudioLightingSettings = {
  environment: 'studio' | 'room' | 'white' | 'none';
  ambientIntensity: number;
  headlampIntensity: number;
  environmentIntensity: number;
  keyIntensity: number;
  keySize: number;
  fillIntensity: number;
  /** Minimum linear radiance across the studio; added to every reflection card. */
  backgroundIntensity: number;
  exposure: number;
};

export const defaultStudioLighting: StudioLightingSettings = {
  environment: 'room',
  ambientIntensity: ambientBaseIntensity,
  headlampIntensity: headlampBaseIntensity,
  environmentIntensity: environmentBaseIntensity,
  keyIntensity: 64,
  keySize: 1.2,
  fillIntensity: 1,
  backgroundIntensity: 0,
  exposure: 1,
};

// ── Dark-mode theme constants ──────────────────────────────────────────────

/** Overall intensity multiplier applied to all lights in dark mode. */
export const darkModeIntensityScale = 1;

/** Ambient floor boost in dark mode to prevent shadows from becoming unreadably dark. */
export const darkModeAmbientBoost = 1.15;

// ── Headlamp configuration ─────────────────────────────────────────────────

export type HeadlampConfig = {
  /** Camera-right offset (multiplier of sceneRadius). */
  rightOffset: number;
  /** Camera-up offset (multiplier of sceneRadius). */
  upOffset: number;
  /** Target camera-right skew (multiplier of sceneRadius). */
  targetRightSkew: number;
  /** Target camera-up skew (multiplier of sceneRadius). */
  targetUpSkew: number;
};

/** Default headlamp offset configuration matching the studio lighting rig. */
export const defaultHeadlampConfig: HeadlampConfig = {
  rightOffset: 2,
  upOffset: 2,
  targetRightSkew: 0,
  targetUpSkew: 0,
};

// ── Combined config for applyLightingForCamera ─────────────────────────────

export type LightingConfig = {
  sceneRadius: number;
  upDirection: 'x' | 'y' | 'z';
  headlampIntensity: number;
  ambientIntensity: number;
  environmentIntensity: number;
  headlampConfig: HeadlampConfig;
  /** Theme-based overall intensity scale. */
  themeIntensityScale?: number;
  /** Theme-based ambient floor boost to prevent crushed shadows (1.0 for light, ~1.15 for dark). */
  themeAmbientBoost?: number;
};

// ── Pure functions ─────────────────────────────────────────────────────────

/**
 * Rotates the studio environment with the complete camera orientation.
 * Three.js samples through the inverse of this rotation, keeping reflection
 * directions fixed in view space through orbit, pole crossings and roll.
 *
 * @param cameraWorldQuaternion - Camera orientation in world space.
 * @param upDirection - Scene up axis, used only to choose the Euler representation.
 * @returns Environment orientation in world space.
 */
export function computeEnvironmentRotation(
  cameraWorldQuaternion: THREE.Quaternion,
  upDirection: 'x' | 'y' | 'z',
): THREE.Euler {
  const order: THREE.EulerOrder = upDirection === 'y' ? 'YXZ' : upDirection === 'z' ? 'ZXY' : 'XZY';
  return new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, order);
}

/**
 * Computes the world-space position and target for a camera-relative
 * directional headlamp.
 *
 * The headlamp is offset in camera-up and camera-right directions so the
 * default light direction is normalize([1, 1, 1]) in view space, independent
 * of camera distance, scene scale, orbit, and projection.
 *
 * @param root0 - The headlamp transform parameters
 * @param root0.cameraPosition - The camera's world position.
 * @param root0.cameraMatrixWorld - The camera's world matrix (used for basis vectors).
 * @param root0.sceneRadius - The bounding sphere radius of the scene.
 * @param root0.config - Offset multipliers for headlamp placement.
 * @returns The world-space position and target position for the headlamp.
 */
export function computeHeadlampTransform({
  cameraPosition,
  cameraMatrixWorld,
  sceneRadius,
  config,
}: {
  cameraPosition: THREE.Vector3;
  cameraMatrixWorld: THREE.Matrix4;
  sceneRadius: number;
  config: HeadlampConfig;
}): { position: THREE.Vector3; targetPosition: THREE.Vector3 } {
  // Camera basis vectors in world space:
  // - column 0: camera-right (+X local)
  // - column 1: camera-up (+Y local)
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(cameraMatrixWorld, 0).normalize();
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(cameraMatrixWorld, 1).normalize();

  // Position: camera + up offset + right offset
  const position = cameraPosition.clone();
  position.addScaledVector(cameraUp, sceneRadius * config.upOffset);
  position.addScaledVector(cameraRight, sceneRadius * config.rightOffset);

  // Camera forward direction
  const cameraForward = new THREE.Vector3();
  // Extract forward from the matrix column instead of calling getWorldDirection
  // so this function remains standalone (no camera method dependency).
  cameraForward.setFromMatrixColumn(cameraMatrixWorld, 2).normalize().negate();

  // Target: forward of camera with skew offsets
  const targetPosition = cameraPosition.clone();
  targetPosition.addScaledVector(cameraForward, sceneRadius * 2);
  targetPosition.addScaledVector(cameraRight, -sceneRadius * config.targetRightSkew);
  targetPosition.addScaledVector(cameraUp, -sceneRadius * config.targetUpSkew);

  return { position, targetPosition };
}

// ── applyLightingForCamera options ──────────────────────────────────────────

export type ApplyLightingOptions = {
  /** The THREE.Scene to update. */
  scene: THREE.Scene;
  /** The camera whose orientation drives lighting. */
  camera: THREE.Camera;
  /** Optional directional light to position as headlamp. */
  headlamp: THREE.DirectionalLight | undefined;
  /** Optional ambient fill. */
  ambient: THREE.AmbientLight | undefined;
  /** Lighting configuration with base intensities and offsets. */
  config: LightingConfig;
};

/**
 * Applies camera-relative lighting to a scene for the given camera.
 *
 * Keeps light directions fixed in view space and light energy independent of
 * projection. Theme adaptation changes only the configured intensity factors.
 */
export function applyLightingForCamera({ scene, camera, headlamp, ambient, config }: ApplyLightingOptions): void {
  const themeScale = config.themeIntensityScale ?? 1;
  const themeAmbientBoost = config.themeAmbientBoost ?? 1;

  // Environment intensity
  scene.environmentIntensity = config.environmentIntensity * themeScale;

  // Camera-locked environment rotation
  camera.getWorldQuaternion(scratchCameraWorldQuaternionForLighting);
  const rotation = computeEnvironmentRotation(scratchCameraWorldQuaternionForLighting, config.upDirection);
  scene.environmentRotation.copy(rotation);

  if (ambient) {
    ambient.intensity = config.ambientIntensity * themeScale * themeAmbientBoost;
  }

  if (headlamp) {
    headlamp.intensity = config.headlampIntensity * themeScale;

    const transform = computeHeadlampTransform({
      cameraPosition: camera.position,
      cameraMatrixWorld: camera.matrixWorld,
      sceneRadius: config.sceneRadius,
      config: config.headlampConfig,
    });

    headlamp.position.copy(transform.position);
    headlamp.target.position.copy(transform.targetPosition);
    headlamp.target.updateMatrixWorld();
  }
}
