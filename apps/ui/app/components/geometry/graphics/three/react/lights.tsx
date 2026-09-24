import { useDeferredValue, useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { BackSide, CubeTexture, PMREMGenerator } from 'three';
import { PMREMGenerator as WebGpuPmremGenerator } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useThree, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  applyLightingForCamera,
  ambientBaseIntensity,
  headlampBaseIntensity,
  defaultHeadlampConfig,
  darkModeIntensityScale,
  darkModeAmbientBoost,
  defaultStudioLighting,
} from '#components/geometry/graphics/three/utils/lights.utils.js';
import type { StudioLightingSettings } from '#components/geometry/graphics/three/utils/lights.utils.js';
import { isViewportWebGpu } from '#components/geometry/graphics/three/viewport-cad-renderer.js';
import { Theme, useTheme } from '#hooks/use-theme.js';

type UpDirection = 'x' | 'y' | 'z';

/** Environment cubemap resolution (px). Higher = sharper specular reflections. */
const envResolution = 512;

/** Broad, low-energy panels keep metallic and back-facing surfaces readable. */
const studioLeftFillIntensity = 1.2;
const studioTopIntensity = 0.25;
const studioGroundIntensity = 1.5;
const studioBackFillIntensity = 8;

type LightsProperties = {
  readonly settings?: Partial<StudioLightingSettings>;
  readonly enableMatcap?: boolean;
  readonly sceneRadius?: number;
  readonly upDirection?: UpDirection;
};

/** Camera-relative PBR lighting with owned environment reflections. */
export function Lights({
  settings,
  enableMatcap = false,
  sceneRadius = 0,
  upDirection = 'z',
}: LightsProperties): React.JSX.Element {
  const { camera, scene, gl, invalidate } = useThree();
  const lighting = { ...defaultStudioLighting, ...settings };
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

  useLayoutEffect(() => {
    // oxlint-disable-next-line react/immutability -- This effect owns the external Three renderer's exposure setting.
    gl.toneMappingExposure = lighting.exposure;
    invalidate();
  }, [gl, invalidate, lighting.exposure]);

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
        headlampIntensity: lighting.headlampIntensity,
        ambientIntensity: lighting.ambientIntensity,
        environmentIntensity: lighting.environmentIntensity,
        headlampConfig: defaultHeadlampConfig,
        themeIntensityScale,
        themeAmbientBoost,
      },
    });
  });

  const showEnvironment = useDeferredValue(!enableMatcap);

  // Drei captures when its children identity changes. Only the environment's own
  // geometry and radiance controls should recapture and filter all six faces.
  const roomEnvironment = useMemo(() => <RoomLightingEnvironment />, []);
  const whiteEnvironment = useMemo(
    () => (
      <OwnedLightingEnvironment near={0.01} far={20}>
        <mesh>
          <sphereGeometry args={[10, 32, 16]} />
          <meshBasicMaterial color='white' side={BackSide} toneMapped={false} />
        </mesh>
      </OwnedLightingEnvironment>
    ),
    [],
  );
  const studioEnvironment = useMemo(
    () => (
      <OwnedLightingEnvironment near={clampedSceneRadius * 0.01} far={clampedSceneRadius * 20}>
        <>
          <color attach='background' args={[0, 0, 0]} />
          {lighting.backgroundIntensity > 0 ? (
            <mesh>
              <boxGeometry args={[clampedSceneRadius * 20, clampedSceneRadius * 20, clampedSceneRadius * 20]} />
              {/* A shader writes HDR radiance; WebGL clearColor clamps a Color background to [0, 1]. */}
              <meshBasicMaterial
                color={[lighting.backgroundIntensity, lighting.backgroundIntensity, lighting.backgroundIntensity]}
                side={BackSide}
                toneMapped={false}
              />
            </mesh>
          ) : null}
          {/* Cards occlude the enclosure, so each carries the same base radiance plus its local contrast. */}
          <Lightformer
            form='rect'
            intensity={lighting.backgroundIntensity + lighting.keyIntensity}
            position={[clampedSceneRadius, clampedSceneRadius, clampedSceneRadius]}
            scale={[clampedSceneRadius * lighting.keySize, clampedSceneRadius * lighting.keySize, 1]}
          />
          <Lightformer
            form='rect'
            intensity={lighting.backgroundIntensity + studioLeftFillIntensity * lighting.fillIntensity}
            position={[-clampedSceneRadius * 3, clampedSceneRadius, clampedSceneRadius * 0.5]}
            rotation={[Math.PI / 8, Math.PI / 3, 0]}
            scale={[clampedSceneRadius * 4, clampedSceneRadius * 4, 1]}
          />
          <Lightformer
            form='rect'
            intensity={lighting.backgroundIntensity + studioTopIntensity * lighting.fillIntensity}
            position={[0, clampedSceneRadius * 3, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[clampedSceneRadius * 3, clampedSceneRadius * 3, 1]}
          />
          <Lightformer
            form='rect'
            intensity={lighting.backgroundIntensity + studioGroundIntensity * lighting.fillIntensity}
            position={[clampedSceneRadius * 2, -clampedSceneRadius * 3, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[clampedSceneRadius * 6, clampedSceneRadius * 6, 1]}
          />
          <Lightformer
            form='rect'
            intensity={lighting.backgroundIntensity + studioBackFillIntensity * lighting.fillIntensity}
            position={[clampedSceneRadius * 2, -clampedSceneRadius * 3, clampedSceneRadius * 4]}
            scale={[clampedSceneRadius * 2, clampedSceneRadius * 2, 1]}
          />
        </>
      </OwnedLightingEnvironment>
    ),
    [clampedSceneRadius, lighting.backgroundIntensity, lighting.fillIntensity, lighting.keyIntensity, lighting.keySize],
  );

  return (
    <>
      {/* Low diffuse fill; conductors receive illumination from the environment. */}
      <ambientLight ref={ambientReference} intensity={ambientBaseIntensity} />

      {/* Key direction stays upper-right in view space. */}
      <directionalLight ref={cameraLightReference} intensity={headlampBaseIntensity} color='white' />

      {showEnvironment && lighting.environment === 'room' ? roomEnvironment : null}
      {showEnvironment && lighting.environment === 'white' ? whiteEnvironment : null}
      {showEnvironment && lighting.environment === 'studio' ? studioEnvironment : null}
    </>
  );
}

/** Three.js's neutral room is a reproducible reference environment, owned by this mount. */
function RoomLightingEnvironment(): React.JSX.Element {
  const room = useMemo(() => new RoomEnvironment(), []);
  useLayoutEffect(
    () => () => {
      room.dispose();
    },
    [room],
  );
  return (
    <OwnedLightingEnvironment near={0.01} far={100}>
      <primitive object={room} />
    </OwnedLightingEnvironment>
  );
}

/** Own the filtered target while Drei owns the unchanged source cubemap capture. */
function OwnedLightingEnvironment({
  children,
  near,
  far,
}: {
  readonly children: React.ReactNode;
  readonly near: number;
  readonly far: number;
}): React.JSX.Element {
  const { gl, scene, invalidate } = useThree();
  const generator = useMemo(() => (isViewportWebGpu(gl) ? new WebGpuPmremGenerator(gl) : new PMREMGenerator(gl)), [gl]);
  useLayoutEffect(
    () => () => {
      generator.dispose();
    },
    [generator],
  );
  useLayoutEffect(() => {
    // The child Environment's layout effect has captured and installed its cubemap.
    // Supplying the finished PMREM bypasses Three's implicit, unowned texture cache.
    const source = scene.environment;
    if (!(source instanceof CubeTexture)) {
      return undefined;
    }
    const filtered = generator.fromCubemap(source);
    // oxlint-disable-next-line react/immutability -- This effect owns the external Three scene's filtered environment and restores it on cleanup.
    scene.environment = filtered.texture;
    invalidate();
    return () => {
      if (scene.environment === filtered.texture) {
        scene.environment = source;
      }
      filtered.dispose();
    };
  }, [children, generator, invalidate, scene]);

  return (
    <Environment resolution={envResolution} near={near} far={far}>
      {children}
    </Environment>
  );
}
