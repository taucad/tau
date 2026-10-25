import { useDeferredValue, useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import {
  BackSide,
  CubeTexture,
  CubeCamera,
  Scene,
  CubeUVReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  PMREMGenerator,
  RenderTarget,
  RGBAFormat,
} from 'three';
import { CubeRenderTarget, PMREMGenerator as WebGpuPmremGenerator } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPortal, useThree, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  applyLightingForCamera,
  ambientBaseIntensity,
  headlampBaseIntensity,
  defaultHeadlampConfig,
  darkModeIntensityScale,
  darkModeAmbientBoost,
  defaultStudioLighting,
} from '#graphics/three/utils/lights.utils.js';
import type { StudioLightingSettings } from '#graphics/three/utils/lights.utils.js';
import { isViewportWebGpu } from '#graphics/three/viewport-cad-renderer.js';
import { isCoarsePointerDevice } from '#graphics/three/utils/device-tier.js';
import { useViewerEnvironment } from '#environment/viewer-environment.jsx';

type UpDirection = 'x' | 'y' | 'z';

/**
 * Environment cubemap resolution (px). Higher = sharper specular reflections.
 *
 * The filtered output is `3·r × 4·r` RGBA16F (24 MiB at 512, 6 MiB at 256) and the source cube
 * adds 12 MiB at 512, so a coarse-pointer device captures at 256: studio reflections are soft.
 */
const envResolution = 512;
const coarsePointerEnvResolution = 256;

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
  const { colorScheme } = useViewerEnvironment();
  const isDark = colorScheme === 'dark';

  // Lighting operates in normalized render units; use a neutral radius only before geometry loads.
  const clampedSceneRadius = sceneRadius > 0 ? sceneRadius : 1;

  useLayoutEffect(() => {
    // oxlint-disable-next-line react/immutability -- This effect owns the external Three renderer's exposure setting.
    gl.toneMappingExposure = lighting.exposure;
    invalidate();
  }, [gl, invalidate, lighting.exposure]);

  // Dark mode raises the ambient floor while preserving the key and reflections.
  const themeIntensityScale = isDark ? darkModeIntensityScale : 1;
  const themeAmbientBoost = isDark ? darkModeAmbientBoost : 1;

  // One configuration per input change, so a lighting frame allocates nothing.
  const { headlampIntensity, ambientIntensity, environmentIntensity } = lighting;
  const config = useMemo(
    () => ({
      sceneRadius: clampedSceneRadius,
      upDirection,
      headlampIntensity,
      ambientIntensity,
      environmentIntensity,
      headlampConfig: defaultHeadlampConfig,
      themeIntensityScale,
      themeAmbientBoost,
      webGpuPmrem: isViewportWebGpu(gl),
    }),
    [
      clampedSceneRadius,
      upDirection,
      headlampIntensity,
      ambientIntensity,
      environmentIntensity,
      themeIntensityScale,
      themeAmbientBoost,
      gl,
    ],
  );

  // Per-frame updates delegated to the shared camera-relative lighting utility.
  useFrame(() => {
    applyLightingForCamera({
      scene,
      camera,
      headlamp: cameraLightReference.current ?? undefined,
      ambient: ambientReference.current ?? undefined,
      config,
    });
  });

  const showEnvironment = useDeferredValue(!enableMatcap);
  const resolution = useMemo(() => (isCoarsePointerDevice() ? coarsePointerEnvResolution : envResolution), []);

  // Drei recaptures whenever its children change, so each environment is memoised on exactly
  // what it draws. The studio is also keyed on those values: new radiance remounts the capture
  // and its filter together. Only the environment's own geometry and radiance controls recapture.
  const roomEnvironment = useMemo(() => <RoomLightingEnvironment resolution={resolution} />, [resolution]);
  const whiteEnvironment = useMemo(
    () => (
      <OwnedLightingEnvironment resolution={resolution} near={0.01} far={20}>
        <mesh>
          <sphereGeometry args={[10, 32, 16]} />
          <meshBasicMaterial color='white' side={BackSide} toneMapped={false} />
        </mesh>
      </OwnedLightingEnvironment>
    ),
    [resolution],
  );
  const studioEnvironment = useMemo(
    () => (
      <OwnedLightingEnvironment
        key={[
          clampedSceneRadius,
          lighting.backgroundIntensity,
          lighting.fillIntensity,
          lighting.keyIntensity,
          lighting.keySize,
        ].join(':')}
        resolution={resolution}
        near={clampedSceneRadius * 0.01}
        far={clampedSceneRadius * 20}
      >
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
    [
      clampedSceneRadius,
      lighting.backgroundIntensity,
      lighting.fillIntensity,
      lighting.keyIntensity,
      lighting.keySize,
      resolution,
    ],
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
function RoomLightingEnvironment({ resolution }: { readonly resolution: number }): React.JSX.Element {
  const room = useMemo(() => new RoomEnvironment(), []);
  useLayoutEffect(
    () => () => {
      room.dispose();
    },
    [room],
  );
  return (
    <OwnedLightingEnvironment resolution={resolution} near={0.01} far={100}>
      <primitive object={room} />
    </OwnedLightingEnvironment>
  );
}

/** Capture node environments with the target recognized by both node backends. */
function NodeLightingEnvironment({
  children,
  resolution,
  near,
  far,
}: {
  readonly children: React.ReactNode;
  readonly resolution: number;
  readonly near: number;
  readonly far: number;
}): React.JSX.Element {
  const { scene, gl, invalidate } = useThree();
  const captureScene = useMemo(() => new Scene(), []);
  const target = useMemo(() => new CubeRenderTarget(resolution, { type: HalfFloatType }), [resolution]);
  const camera = useMemo(() => new CubeCamera(near, far, target), [near, far, target]);
  useLayoutEffect(
    () => () => {
      target.dispose();
    },
    [target],
  );
  useLayoutEffect(() => {
    if (!isViewportWebGpu(gl)) {
      return undefined;
    }
    const previous = scene.environment;
    const previousMrt = gl.getMRT();
    const previousTarget = gl.getRenderTarget();
    const previousFace = gl.getActiveCubeFace();
    const previousMip = gl.getActiveMipmapLevel();
    const previousXr = gl.xr.enabled;
    try {
      gl.setMRT(null);
      camera.update(gl, captureScene);
    } finally {
      gl.setMRT(previousMrt);
      gl.setRenderTarget(previousTarget, previousFace, previousMip);
      gl.xr.enabled = previousXr;
    }
    // oxlint-disable-next-line react/immutability -- Own this captured scene environment until replacement.
    scene.environment = target.texture;
    invalidate();
    return () => {
      scene.environment = previous;
    };
  }, [camera, captureScene, children, gl, invalidate, scene, target]);
  return <>{createPortal(children, captureScene)}</>;
}

/** Own the filtered target and use the appropriate source capture for each renderer family. */
function OwnedLightingEnvironment({
  children,
  resolution,
  near,
  far,
}: {
  readonly children: React.ReactNode;
  readonly resolution: number;
  readonly near: number;
  readonly far: number;
}): React.JSX.Element {
  const { scene, gl, invalidate } = useThree();
  useLayoutEffect(() => {
    // The child Environment's layout effect has captured and installed its cubemap.
    // Supplying the finished PMREM bypasses Three's implicit, unowned texture cache.
    const source = scene.environment;
    if (!(source instanceof CubeTexture)) {
      return undefined;
    }
    // A generator keeps a ping-pong target as large as its output until disposed, and is only
    // needed while filtering: each capture gets its own and releases it immediately.
    const generator = isViewportWebGpu(gl) ? new WebGpuPmremGenerator(gl) : new PMREMGenerator(gl);
    // Three r184's node PMREM defaults to a depth attachment although filtering only draws
    // fullscreen quads. Supply its public output target with the same CubeUV layout/format.
    const nodeTarget =
      generator instanceof WebGpuPmremGenerator
        ? new RenderTarget(3 * resolution, 4 * resolution, {
            magFilter: LinearFilter,
            minFilter: LinearFilter,
            generateMipmaps: false,
            type: HalfFloatType,
            format: RGBAFormat,
            colorSpace: LinearSRGBColorSpace,
            depthBuffer: false,
            stencilBuffer: false,
          })
        : undefined;
    if (nodeTarget) {
      nodeTarget.texture.mapping = CubeUVReflectionMapping;
      nodeTarget.texture.name = 'PMREM.cubeUv';
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's PMREM discriminator.
      Object.assign(nodeTarget.texture, { isPMREMTexture: true });
      nodeTarget.scissorTest = true;
    }
    let filtered: ReturnType<typeof generator.fromCubemap>;
    try {
      filtered =
        generator instanceof WebGpuPmremGenerator
          ? generator.fromCubemap(source, nodeTarget)
          : generator.fromCubemap(source);
    } catch (error) {
      nodeTarget?.dispose();
      throw error;
    } finally {
      generator.dispose();
    }
    // oxlint-disable-next-line react/immutability -- This effect owns the external Three scene's filtered environment and restores it on cleanup.
    scene.environment = filtered.texture;
    invalidate();
    return () => {
      if (scene.environment === filtered.texture) {
        scene.environment = source;
      }
      filtered.dispose();
    };
  }, [gl, invalidate, scene, resolution]);

  if (isViewportWebGpu(gl)) {
    return (
      <NodeLightingEnvironment resolution={resolution} near={near} far={far}>
        {children}
      </NodeLightingEnvironment>
    );
  }
  return (
    <Environment resolution={resolution} near={near} far={far}>
      {children}
    </Environment>
  );
}
