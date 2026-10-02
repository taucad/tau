import { useDeferredValue, useRef } from 'react';
import type * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  applyLightingForCamera,
  ambientBaseIntensity,
  headlampBaseIntensity,
  environmentBaseIntensity,
  defaultHeadlampConfig,
  lightingUserDataKeys,
  darkModeIntensityScale,
  darkModeAmbientBoost,
} from '#components/geometry/graphics/three/utils/lights.utils.js';
import type { SceneLightingConfig } from '#components/geometry/graphics/three/utils/lights.utils.js';
import { Theme, useTheme } from '#hooks/use-theme.js';

/** Environment cubemap resolution (px). Higher = sharper specular reflections. */
const envResolution = 512;

/** Reused every frame — avoid allocating a fresh object for screenshot `userData` consumers. */
const scratchSceneLightingUserData: SceneLightingConfig = {
  sceneRadius: 1,
  upDirection: 'z',
};

// Studio preset Lightformer intensities ──────────────────────────────────────
// Asymmetric camera-space rig matching Onshape's observed pattern.
// Key upper-left, fill right, top overhead, ground below, back-fill behind.

/** Key panel (right-upper in camera space) -- brightest light, creates NE-bright gradient. */
const studioKeyIntensity = 4;
/** Left-upper fill (left-upper in camera space) -- illuminates left-facing L sections (WNW/NW-left). */
const studioLeftFillIntensity = 1.2;
/** Top panel (overhead in camera space) -- subtle overhead accent on sloped surfaces. */
const studioTopIntensity = 0.25;
/** Ground panel (below in camera space) -- bright for bottom-view luminosity. */
const studioGroundIntensity = 1.5;
/** Specular highlight panel (upper-right for bottom face) -- creates focused off-center specular on flat faces. */
const studioBackFillIntensity = 8;

type UpDirection = 'x' | 'y' | 'z';

type LightsProperties = {
  readonly enableMatcap?: boolean;
  readonly sceneRadius?: number;
  readonly environmentPreset?: 'studio' | 'performance';
  readonly upDirection?: UpDirection;
};

/**
 * Professional CAD lighting setup matching Onshape's rendering style.
 *
 * Design principles:
 * 1. **Azimuth-locked environment** — `scene.environmentRotation` is driven from
 *    only the azimuthal (yaw) component of the inverse camera quaternion each
 *    frame, so Lightformers stay stable during horizontal orbit but shift
 *    naturally when the camera tilts up/down, producing lighting variation.
 *
 * 2. **Asymmetric camera-space lightformers** — Key panel upper-left, fill right,
 *    top overhead, ground below, and back-fill behind camera. This matches Onshape's
 *    observed lighting pattern (upper-left brightest, lower-right darkest).
 *
 * 3. **FOV compensation** — As FOV decreases toward orthographic, specular highlights
 *    wash out (parallel view rays → uniform reflection). A multi-lever system scales
 *    down `scene.environmentIntensity` at low FOV while boosting headlamp and ambient
 *    to compensate diffuse loss. No material changes.
 *
 * 4. **Camera-space headlamp** — A subtle directional light offset in camera-up
 *    and camera-right directions so the highlight remains biased toward screen
 *    upper-right.
 *
 * 5. **Scale-adaptive** — All Lightformer positions and scales are expressed as
 *    multiples of `sceneRadius` so lighting adapts to model size.
 */
export function Lights({
  enableMatcap = false,
  sceneRadius = 0,
  environmentPreset = 'performance',
  upDirection = 'z',
}: LightsProperties): React.JSX.Element {
  const { camera, scene } = useThree();
  const cameraLightReference = useRef<THREE.DirectionalLight>(null);
  const ambientReference = useRef<THREE.AmbientLight>(null);
  const { theme } = useTheme();
  const isDark = theme === Theme.DARK;

  // Clamp sceneRadius to avoid zero/tiny values before geometry loads
  const clampedSceneRadius = Math.max(sceneRadius, 1);

  // Keep clamped radius accessible in useFrame without re-subscribing
  const radiusRef = useRef(clampedSceneRadius);
  radiusRef.current = clampedSceneRadius;

  // Theme-based intensity factors (1.0 in light mode, reduced in dark mode)
  const themeIntensityScale = isDark ? darkModeIntensityScale : 1;
  const themeAmbientBoost = isDark ? darkModeAmbientBoost : 1;

  // Per-frame updates delegated to the shared applyLightingForCamera utility.
  // This ensures the live renderer and the offline screenshot renderer apply
  // identical lighting for any camera orientation.
  useFrame(() => {
    // Persist lighting config on scene.userData so the screenshot capture
    // system can read it from a cloned scene without prop-drilling.
    scratchSceneLightingUserData.sceneRadius = radiusRef.current;
    scratchSceneLightingUserData.upDirection = upDirection;
    scratchSceneLightingUserData.themeIntensityScale = themeIntensityScale;
    scene.userData[lightingUserDataKeys.config] = scratchSceneLightingUserData;

    applyLightingForCamera({
      scene,
      camera,
      headlamp: cameraLightReference.current ?? undefined,
      ambient: ambientReference.current ?? undefined,
      config: {
        sceneRadius: radiusRef.current,
        upDirection,
        headlampIntensity: headlampBaseIntensity,
        ambientIntensity: ambientBaseIntensity,
        environmentIntensity: environmentBaseIntensity,
        headlampConfig: defaultHeadlampConfig,
        themeIntensityScale,
        themeAmbientBoost,
      },
    });
  });

  const showEnvironment = useDeferredValue(!enableMatcap && environmentPreset === 'studio');

  return (
    <>
      {/* Base ambient fill -- always present for minimum illumination */}
      <ambientLight
        ref={ambientReference}
        intensity={ambientBaseIntensity}
        userData={{ [lightingUserDataKeys.ambient]: true }}
      />

      {/* Headlamp -- positioned above camera in world space for top-down gradients */}
      <directionalLight
        ref={cameraLightReference}
        intensity={headlampBaseIntensity}
        color='white'
        userData={{ [lightingUserDataKeys.headlamp]: true }}
      />

      {showEnvironment ? (
        <Environment resolution={envResolution} near={clampedSceneRadius * 0.01} far={clampedSceneRadius * 20}>
          <>
            {/* ── Key panel (right-upper in camera space) ── */}
            {/* Brightest side light. Positioned primarily to the right of the
                  camera with moderate upward offset. Creates the NE-bright
                  gradient (NNE, ENE lit) while keeping NNW dark. */}
            <Lightformer
              form='rect'
              intensity={studioKeyIntensity}
              position={[clampedSceneRadius * 4, clampedSceneRadius * 1.5, clampedSceneRadius]}
              rotation={[Math.PI / 8, -Math.PI / 3, 0]}
              scale={[clampedSceneRadius * 4, clampedSceneRadius * 4, 1]}
            />
            {/* ── Left-upper fill (left-upper in camera space) ── */}
            {/* Illuminates left-facing L sections (WNW = NW-left) that the
                  rightward key cannot reach. Env_x dominant negative with moderate
                  +env_y so WNW (env_y=0.38) gets more than WSW (env_y=-0.38). */}
            <Lightformer
              form='rect'
              intensity={studioLeftFillIntensity}
              position={[-clampedSceneRadius * 3, clampedSceneRadius, clampedSceneRadius * 0.5]}
              rotation={[Math.PI / 8, Math.PI / 3, 0]}
              scale={[clampedSceneRadius * 4, clampedSceneRadius * 4, 1]}
            />
            {/* ── Top panel (overhead in camera space) ── */}
            {/* Reduced overhead accent — kept low to avoid over-brightening
                  NNW (D section) which has high env_y normal component. */}
            <Lightformer
              form='rect'
              intensity={studioTopIntensity}
              position={[0, clampedSceneRadius * 3, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[clampedSceneRadius * 3, clampedSceneRadius * 3, 1]}
            />
            {/* ── Ground panel (below-right in camera space) ── */}
            {/* Bright ground for bottom-view luminosity. Offset in +X so that
                  the bottom-face specular shifts toward the right (matching the
                  asymmetric rig's "brighter on right" pattern). */}
            <Lightformer
              form='rect'
              intensity={studioGroundIntensity}
              position={[clampedSceneRadius * 2, -clampedSceneRadius * 3, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[clampedSceneRadius * 6, clampedSceneRadius * 6, 1]}
            />
            {/* ── Specular highlight panel (upper-right in camera space) ── */}
            {/* Positioned in the (+X, -Y, +Z) octant to create a focused specular
                  highlight in the upper-right area of bottom-facing surfaces when
                  viewed from below. In Z-up screen coords for the bottom face:
                  +X → screen right, -Y → screen top, +Z → close to the reflection
                  pole. Equal X and -Y offsets place the specular at 45° toward the
                  top-right corner. Negligible contribution to front/side face
                  speculars (~61° from front reflection direction). */}
            <Lightformer
              form='rect'
              intensity={studioBackFillIntensity}
              position={[clampedSceneRadius * 2, -clampedSceneRadius * 3, clampedSceneRadius * 4]}
              scale={[clampedSceneRadius * 2, clampedSceneRadius * 2, 1]}
            />
          </>
        </Environment>
      ) : null}

      {/* Performance preset: minimal lights, no environment (equivalent to legacy setup) */}
      {!enableMatcap && environmentPreset === 'performance' ? (
        <>
          {/* oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js light color */}
          <hemisphereLight args={['#ffffff', '#444444', themeIntensityScale]} />
          <directionalLight color='white' intensity={2 * themeIntensityScale} position={[-1, -3, 5]} />
          <directionalLight color='white' intensity={2 * themeIntensityScale} position={[1, 3, 5]} />
        </>
      ) : null}
    </>
  );
}
