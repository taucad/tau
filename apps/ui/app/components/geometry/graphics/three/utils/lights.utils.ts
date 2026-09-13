/**
 * Pure lighting utilities extracted from the Lights component.
 *
 * These functions encapsulate the per-frame camera-relative lighting logic so
 * that both the live renderer (via `useFrame`) and the offline screenshot
 * renderer can apply identical lighting for any camera orientation.
 */

import * as THREE from 'three';
import { calculateFovLightingCompensation } from '#components/geometry/graphics/three/utils/math.utils.js';

/** Output buffer for camera world rotation — reused by every `applyLightingForCamera` call (live + screenshot). */
const scratchCameraWorldQuaternionForLighting = new THREE.Quaternion();

// ── Lighting constants ─────────────────────────────────────────────────────
// Exported so that both the Lights component and the screenshot capture
// system reference the same tuning values.

/** Ambient fill -- provides base illumination floor so no surface is fully dark. */
export const ambientBaseIntensity = 0.05;

/**
 * Camera-relative headlamp base intensity.
 *
 * Reduced from 0.5 since the camera-relative environment now provides
 * directional variation. The headlamp is retained primarily as part of
 * the FOV diffuse compensation system (its intensity is boosted at low FOV).
 */
export const headlampBaseIntensity = 0.8;

/**
 * Scene-level environment intensity (base value) -- the primary illumination
 * source. This base value is scaled per-frame by the FOV compensation factor.
 */
export const environmentBaseIntensity = 0.9;

// ── Dark-mode theme constants ──────────────────────────────────────────────
// ~30% luminance reduction matches typical dark-mode surround adaptation.

/** Overall intensity multiplier applied to all lights in dark mode. */
export const darkModeIntensityScale = 0.5;

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
  rightOffset: -0.1,
  upOffset: 2.1,
  targetRightSkew: 0.2,
  targetUpSkew: 0.1,
};

// ── userData tag constants ─────────────────────────────────────────────────
// Used to identify lights in a cloned scene for screenshot rendering.

export const lightingUserDataKeys = {
  headlamp: 'isScreenshotHeadlamp',
  ambient: 'isScreenshotAmbient',
  config: 'lightingConfig',
} as const;

// ── Lighting config stored on scene.userData ───────────────────────────────

export type SceneLightingConfig = {
  sceneRadius: number;
  upDirection: 'x' | 'y' | 'z';
  /** Theme intensity scale persisted for screenshot system consumption. */
  themeIntensityScale?: number;
};

// ── Combined config for applyLightingForCamera ─────────────────────────────

export type LightingConfig = {
  sceneRadius: number;
  upDirection: 'x' | 'y' | 'z';
  headlampIntensity: number;
  ambientIntensity: number;
  environmentIntensity: number;
  headlampConfig: HeadlampConfig;
  /** Theme-based overall intensity scale (1.0 for light, ~0.7 for dark). */
  themeIntensityScale?: number;
  /** Theme-based ambient floor boost to prevent crushed shadows (1.0 for light, ~1.15 for dark). */
  themeAmbientBoost?: number;
};

// ── Pure functions ─────────────────────────────────────────────────────────

/**
 * Angle (in radians) from either pole within which the yaw compensation
 * fades to zero. At the equator the blend is 1 (full compensation); inside
 * this cap the blend smoothsteps to 0 so the environment becomes world-
 * fixed and small camera perturbations don't swing the lighting wildly.
 *
 * 15° keeps standard top/bottom views stable while leaving the vast
 * majority of the viewing sphere (150° out of 180°) fully compensated.
 */
export const poleFadeAngleDeg = 15;

/** `sin²(poleFadeAngle)` — precomputed threshold for the smoothstep ramp. */
const poleFadeThreshold = Math.sin((poleFadeAngleDeg * Math.PI) / 180) ** 2;

/**
 * Computes the environment rotation Euler that cancels only the azimuthal
 * (yaw) component of the camera's world orientation around the up axis.
 *
 * By not compensating for polar (pitch) or roll changes, the Lightformers
 * remain stable during horizontal orbit but shift relative to the camera
 * when tilting up/down — producing natural lighting variation at different
 * viewing elevations instead of a uniformly locked rig.
 *
 * **Swing-twist decomposition** extracts yaw in quaternion space, avoiding
 * the gimbal-lock discontinuity of Euler decomposition that caused 180°
 * lighting hops at the equatorial plane.
 *
 * **Pole-proximity fade** attenuates the yaw compensation smoothly to zero
 * within {@link poleFadeAngleDeg}° of either pole (top/bottom view). Near
 * the poles azimuth is geometrically ill-defined and tiny camera movements
 * would otherwise cause wild lighting swings. The fade uses a smoothstep
 * over `sin²(polar_angle)` which is symmetric around both poles.
 *
 * Three.js internally negates all Euler components of `environmentRotation`
 * (WebGLMaterials.js "accommodate left-handed frame"), so the returned yaw
 * angle is provided with the sign that compensates for this negation.
 *
 * @param cameraWorldQuaternion - The camera's world quaternion.
 * @param upDirection - The configured up axis ('x', 'y', or 'z').
 * @returns An Euler suitable for assigning to `scene.environmentRotation`.
 */
export function computeEnvironmentRotation(
  cameraWorldQuaternion: THREE.Quaternion,
  upDirection: 'x' | 'y' | 'z',
): THREE.Euler {
  const order: THREE.EulerOrder = upDirection === 'y' ? 'YXZ' : upDirection === 'z' ? 'ZXY' : 'XZY';

  // ── Swing-twist decomposition ───────────────────────────────────────────
  // For quaternion Q = (x, y, z, w) the twist around the up axis keeps only
  // the scalar (w) and the component aligned with the up axis. The yaw angle
  // is 2·atan2(axisComponent, w).
  const { x, y, z, w } = cameraWorldQuaternion;
  const axisComponent = upDirection === 'z' ? z : upDirection === 'y' ? y : x;

  const twistLengthSq = axisComponent * axisComponent + w * w;

  // Hard safety net: both twist components ≈ 0 → azimuth truly undefined.
  if (twistLengthSq < 1e-10) {
    return new THREE.Euler(0, 0, 0, order);
  }

  const yaw = 2 * Math.atan2(axisComponent, w);

  // ── Pole-proximity fade ─────────────────────────────────────────────────
  // sin²(polar_angle) = 4 · twistLen² · swingLen². This equals 0 at both
  // poles and 1 at the equator. We smoothstep from 0 → 1 over the
  // [0, poleFadeThreshold] range so the yaw compensation fades out
  // gracefully within ~15° of either pole.
  const swingLengthSq = Math.max(0, 1 - twistLengthSq); // Clamp for float drift
  const sinPolarSq = 4 * twistLengthSq * swingLengthSq;

  const t = Math.min(1, sinPolarSq / poleFadeThreshold);
  const blend = t * t * (3 - 2 * t); // Smoothstep

  const effectiveYaw = yaw * blend;

  if (upDirection === 'z') {
    return new THREE.Euler(0, 0, effectiveYaw, order);
  }

  if (upDirection === 'y') {
    return new THREE.Euler(0, effectiveYaw, 0, order);
  }

  // UpDirection === 'x'
  return new THREE.Euler(effectiveYaw, 0, 0, order);
}

/**
 * Computes the world-space position and target for a camera-relative
 * directional headlamp.
 *
 * The headlamp is offset in camera-up and camera-right directions so the
 * highlight remains biased toward screen upper-right. The target is placed
 * forward of the camera with slight lower-left skew.
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
  /** Optional ambient light whose intensity to compensate. */
  ambient: THREE.AmbientLight | undefined;
  /** Lighting configuration with base intensities and offsets. */
  config: LightingConfig;
};

/**
 * Applies camera-relative lighting to a scene for the given camera.
 *
 * This function is the single source of truth for per-camera lighting setup.
 * It is called by:
 * - The `Lights` component's `useFrame` callback (live rendering)
 * - The `captureScreenshots` function (offline screenshot rendering)
 *
 * It performs:
 * 1. FOV-dependent intensity compensation
 * 2. Theme-based intensity scaling (dark mode dims all lights uniformly)
 * 3. Camera-locked environment rotation
 * 4. Headlamp positioning (if headlamp provided)
 * 5. Ambient intensity update (if ambient light provided)
 */
export function applyLightingForCamera({ scene, camera, headlamp, ambient, config }: ApplyLightingOptions): void {
  // FOV compensation
  const currentFov = (camera as THREE.PerspectiveCamera).fov;
  const compensation = calculateFovLightingCompensation(currentFov);

  // Theme scaling (applied after FOV compensation to preserve lighting ratios)
  const themeScale = config.themeIntensityScale ?? 1;
  const themeAmbientBoost = config.themeAmbientBoost ?? 1;

  // Environment intensity
  scene.environmentIntensity = config.environmentIntensity * compensation.envFactor * themeScale;

  // Camera-locked environment rotation
  camera.getWorldQuaternion(scratchCameraWorldQuaternionForLighting);
  const rotation = computeEnvironmentRotation(scratchCameraWorldQuaternionForLighting, config.upDirection);
  scene.environmentRotation.copy(rotation);

  // Ambient intensity with FOV compensation + theme boost
  if (ambient) {
    ambient.intensity = config.ambientIntensity * compensation.ambientFactor * themeScale * themeAmbientBoost;
  }

  // Headlamp positioning with FOV compensation + theme scaling
  if (headlamp) {
    headlamp.intensity = config.headlampIntensity * compensation.headlampFactor * themeScale;

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

/**
 * Discovers tagged lights in a scene graph by traversing and checking
 * `userData` markers. Used by the screenshot capture system to find the
 * headlamp and ambient light in a cloned scene.
 *
 * @param scene - The scene to search.
 * @returns The tagged headlamp and ambient light, or undefined if not found.
 */
export function findTaggedLights(scene: THREE.Scene): {
  headlamp: THREE.DirectionalLight | undefined;
  ambient: THREE.AmbientLight | undefined;
} {
  let headlamp: THREE.DirectionalLight | undefined;
  let ambient: THREE.AmbientLight | undefined;

  scene.traverse((object) => {
    if (object.userData[lightingUserDataKeys.headlamp]) {
      headlamp = object as THREE.DirectionalLight;
    }

    if (object.userData[lightingUserDataKeys.ambient]) {
      ambient = object as THREE.AmbientLight;
    }
  });

  return { headlamp, ambient };
}
