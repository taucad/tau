import { useDeferredValue, useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  applyLightingForCamera,
  ambientBaseIntensity,
  headlampBaseIntensity,
  environmentBaseIntensity,
  defaultHeadlampConfig,
  darkModeIntensityScale,
  darkModeAmbientBoost,
} from '#components/geometry/graphics/three/utils/lights.utils.js';
import { Theme, useTheme } from '#hooks/use-theme.js';

type UpDirection = 'x' | 'y' | 'z';

/** Environment cubemap resolution (px). Higher = sharper specular reflections. */
const envResolution = 512;

/** Narrow reflection source near the camera; the directional light owns diffuse shading. */
const studioKeyIntensity = 64;
/** Broad, low-energy panels keep metallic and back-facing surfaces readable. */
const studioLeftFillIntensity = 1.2;
const studioTopIntensity = 0.25;
const studioGroundIntensity = 1.5;
const studioBackFillIntensity = 8;

type LightsProperties = {
  readonly enableMatcap?: boolean;
  readonly sceneRadius?: number;
  readonly upDirection?: UpDirection;
};

/** Camera-relative PBR studio: directional key, ambient floor, and reflection panels. */
export function Lights({
  enableMatcap = false,
  sceneRadius = 0,
  upDirection = 'z',
}: LightsProperties): React.JSX.Element {
  const { camera, scene } = useThree();
  const cameraLightReference = useRef<THREE.DirectionalLight>(null);
  const ambientReference = useRef<THREE.AmbientLight>(null);
  const { theme } = useTheme();
  const isDark = theme === Theme.DARK;

  // Lighting operates in normalized render units; use a neutral radius only before geometry loads.
  const clampedSceneRadius = sceneRadius > 0 ? sceneRadius : 1;

  // Keep clamped radius accessible in useFrame without re-subscribing
  const radiusRef = useRef(clampedSceneRadius);
  useLayoutEffect(() => {
    radiusRef.current = clampedSceneRadius;
  }, [clampedSceneRadius]);

  // Dark mode raises the ambient floor while preserving the key and reflections.
  const themeIntensityScale = isDark ? darkModeIntensityScale : 1;
  const themeAmbientBoost = isDark ? darkModeAmbientBoost : 1;

  // Per-frame updates delegated to the shared camera-relative lighting utility.
  useFrame(() => {
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

  const showEnvironment = useDeferredValue(!enableMatcap);

  return (
    <>
      {/* Base ambient fill -- always present for minimum illumination */}
      <ambientLight ref={ambientReference} intensity={ambientBaseIntensity} />

      {/* Key direction stays upper-right in view space. */}
      <directionalLight ref={cameraLightReference} intensity={headlampBaseIntensity} color='white' />

      {showEnvironment ? (
        <Environment resolution={envResolution} near={clampedSceneRadius * 0.01} far={clampedSceneRadius * 20}>
          <>
            <Lightformer
              form='rect'
              intensity={studioKeyIntensity}
              position={[clampedSceneRadius, clampedSceneRadius, clampedSceneRadius]}
              scale={[clampedSceneRadius * 1.2, clampedSceneRadius * 1.2, 1]}
            />
            <Lightformer
              form='rect'
              intensity={studioLeftFillIntensity}
              position={[-clampedSceneRadius * 3, clampedSceneRadius, clampedSceneRadius * 0.5]}
              rotation={[Math.PI / 8, Math.PI / 3, 0]}
              scale={[clampedSceneRadius * 4, clampedSceneRadius * 4, 1]}
            />
            <Lightformer
              form='rect'
              intensity={studioTopIntensity}
              position={[0, clampedSceneRadius * 3, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[clampedSceneRadius * 3, clampedSceneRadius * 3, 1]}
            />
            <Lightformer
              form='rect'
              intensity={studioGroundIntensity}
              position={[clampedSceneRadius * 2, -clampedSceneRadius * 3, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[clampedSceneRadius * 6, clampedSceneRadius * 6, 1]}
            />
            <Lightformer
              form='rect'
              intensity={studioBackFillIntensity}
              position={[clampedSceneRadius * 2, -clampedSceneRadius * 3, clampedSceneRadius * 4]}
              scale={[clampedSceneRadius * 2, clampedSceneRadius * 2, 1]}
            />
          </>
        </Environment>
      ) : null}
    </>
  );
}
