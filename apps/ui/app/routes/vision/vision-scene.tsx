import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import { PreviewLights } from '#components/geometry/splash/preview-lights.js';
import { storyColors } from '#components/geometry/splash/design-story.constants.js';
import { visionFrame } from '#routes/vision/vision-story.js';
import manifestUrl from '#routes/vision/assets/planetary.json?url';
import geometryUrl from '#routes/vision/assets/planetary.bin.gz?url';

type ModelPart = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type BufferRange = { readonly offset: number; readonly length: number };
/** The homepage's frozen tessellation of the authored example (apps/www/public/planetary.json). */
type AssemblyManifest = {
  readonly parts: number;
  readonly meshes: ReadonlyArray<{
    readonly name: string;
    readonly color: string;
    readonly metalness: number;
    readonly roughness: number;
    readonly position: BufferRange;
    readonly normal: BufferRange;
    readonly index: BufferRange;
  }>;
};
type VisionSceneProperties = {
  readonly clock: RefObject<number>;
  readonly time: number;
  readonly isRunning: boolean;
  readonly rotation: number;
  readonly onReady: () => void;
};

const disposeParts = (parts: ModelPart[]) => {
  for (const part of parts) {
    part.geometry.dispose();
    part.material.dispose();
  }
};

/** Rigid pose at module 2: fixed ring, sun input, carrier output at a quarter of the sun's turn. */
const partPose = (name: string, sunAngle: number): { x: number; y: number; rotation: number } => {
  const planet = /^(?:Planet Gear|Flanged Bushing) (\d)$/u.exec(name);
  const carrierAngle = sunAngle / 4;
  if (planet) {
    const bearing = ((Number(planet[1]) - 1) * 2 * Math.PI) / 3 + carrierAngle;
    return { x: 48 * Math.cos(bearing), y: 48 * Math.sin(bearing), rotation: -sunAngle / 2 };
  }
  return { x: 0, y: 0, rotation: name.startsWith('Internal') ? 0 : name.startsWith('Sun') ? sunAngle : carrierAngle };
};

/**
 * The engineer's assembly order, each step's assembled axial extent in millimetres, as on the
 * homepage story (apps/www/src/story-timeline.mjs). Every step explodes one clear gap beyond the
 * previous one along the axis, so exploded parts never overlap; rear screws explode downwards.
 */
const assemblyOrder: ReadonlyArray<{ match: RegExp; z: readonly [number, number]; below?: boolean }> = [
  { match: /^Carrier Rear$/u, z: [-8, -3] },
  { match: /^Rear Thrust Spacer/u, z: [-3, -1.7] },
  { match: /^Planet Pin/u, z: [-7.9, 21.9] },
  { match: /^Thrust Washer/u, z: [-1.5, 0] },
  { match: /^(?:Flanged Bushing|Planet Gear)/u, z: [0, 15.5] },
  { match: /^Sun/u, z: [-28, 16] },
  { match: /^Front Thrust Spacer/u, z: [15.7, 17] },
  { match: /^Internal Ring/u, z: [-1, 15] },
  { match: /^Carrier Front/u, z: [17, 40] },
  { match: /^Front Screw Washer/u, z: [22, 23] },
  { match: /^Front Socket Screw/u, z: [11, 28] },
  { match: /^Rear Screw Washer/u, z: [-9, -8], below: true },
  { match: /^Rear Socket Screw/u, z: [-14, 3], below: true },
];
const explodeGap = 6;
const lifts = (() => {
  let top = -3;
  let bottom = -8;
  return assemblyOrder.map(({ z: [low, high], below }, step) => {
    if (step === 0) {
      return 0;
    }
    if (below) {
      const lift = bottom - explodeGap - high;
      bottom = low + lift;
      return lift;
    }
    const lift = top + explodeGap - low;
    top = high + lift;
    return lift;
  });
})();
const explodeLift = (name: string): number => lifts[assemblyOrder.findIndex(({ match }) => match.test(name))] ?? 0;

const fetchAsset = async (url: string, signal: AbortSignal): Promise<Response> => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`The gearbox model could not load (${response.status}).`);
  }
  return response;
};

/** Decode the frozen tessellation; a host may already have removed the gzip encoding. */
const loadGeometry = async (signal: AbortSignal): Promise<ArrayBuffer> => {
  const response = await fetchAsset(geometryUrl, signal);
  const bytes = await response.arrayBuffer();
  const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  return magic[0] === 0x1f && magic[1] === 0x8b
    ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
};

/** Load the authored 34-part example into exclusively owned scene resources. */
const loadParts = async (signal: AbortSignal): Promise<ModelPart[]> => {
  const [manifest, binary] = await Promise.all([
    fetchAsset(manifestUrl, signal).then(async (response) => (await response.json()) as AssemblyManifest),
    loadGeometry(signal),
  ]);
  const parts = manifest.meshes.map(({ name, color, metalness, roughness, position, normal, index }) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(binary, position.offset, position.length).slice(), 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(binary, normal.offset, normal.length), 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, index.offset, index.length), 1));
    // Geometry is authored in place; planets and their bushings turn about their own axes.
    const home = partPose(name, 0);
    geometry.translate(-home.x, -home.y, 0);
    // Softer metal than the homepage studio render: this scene has no studio environment to reflect.
    const material = new THREE.MeshStandardMaterial({ color, metalness: metalness * 0.6, roughness: roughness + 0.1 });
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    return part;
  });
  if (parts.length !== manifest.parts) {
    disposeParts(parts);
    throw new Error(`Expected the authored ${manifest.parts}-part gearbox; loaded ${parts.length} parts.`);
  }
  return parts;
};

/* oxlint-disable react/immutability -- R3F updates exclusively owned scene objects in place. */
const Gearbox = ({
  parts,
  clock,
  time,
  isRunning,
  rotation,
}: Omit<VisionSceneProperties, 'onReady'> & { readonly parts: ModelPart[] }): React.JSX.Element => {
  'use no memo';
  const { invalidate } = useThree();
  const lastPose = useRef('');
  const scene = useMemo(() => {
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;

    // A 256 mm build volume drawn as line art, as on the homepage: an illustration, not a machine.
    const printer = new THREE.Group();
    const bedGeometry = new THREE.BoxGeometry(256, 256, 3);
    const bedMaterial = new THREE.MeshStandardMaterial({ color: storyColors.bed, metalness: 0.15, roughness: 0.7 });
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    bed.position.z = -2.5;
    const frameBox = new THREE.BoxGeometry(256, 256, 256);
    const frameGeometry = new THREE.EdgesGeometry(frameBox);
    frameBox.dispose();
    const frameMaterial = new THREE.LineBasicMaterial({
      color: storyColors.printer,
      transparent: true,
      opacity: 0.6,
      depthTest: true,
      depthWrite: false,
    });
    const frame = new THREE.LineSegments(frameGeometry, frameMaterial);
    frame.position.z = 127;
    const nozzleGeometry = new THREE.BoxGeometry(22, 22, 26);
    const nozzleMaterial = new THREE.MeshStandardMaterial({ color: storyColors.teal, metalness: 0.4, roughness: 0.3 });
    const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
    printer.add(bed, frame, nozzle);
    root.add(printer);
    return {
      root,
      printer,
      nozzle,
      geometries: [bedGeometry, frameGeometry, nozzleGeometry],
      materials: [bedMaterial, frameMaterial, nozzleMaterial],
    };
  }, []);

  useEffect(
    () => () => {
      for (const geometry of scene.geometries) {
        geometry.dispose();
      }
      for (const material of scene.materials) {
        material.dispose();
      }
    },
    [scene],
  );

  useEffect(() => {
    lastPose.current = `${time}:${rotation}:${isRunning}:invalidate`;
    invalidate();
  }, [time, rotation, isRunning, invalidate]);

  useFrame(() => {
    const elapsed = clock.current;
    const key = `${elapsed}:${rotation}`;
    if (key === lastPose.current) {
      if (isRunning) {
        invalidate();
      }
      return;
    }
    lastPose.current = key;
    const { index, age } = visionFrame(elapsed);
    const targets = [0.78, 1, 0.5, 0, 0.55, 0, 0.8, 0, 0.45, 0.7];
    const transition = THREE.MathUtils.smoothstep(age, 11.5, 12);
    const exploded = THREE.MathUtils.lerp(
      targets[index]!,
      targets[Math.min(targets.length - 1, index + 1)]!,
      transition,
    );
    const hasMotion = index === 3 || index === 7;
    const sunAngle = hasMotion ? age * 1.1 : 0;
    const isPrint = index === 5;
    // The ring gear is printed layer by layer from its base at z = -1 to its 15 mm face.
    const layer = Math.max(0.025, Math.min(1, age / 9));
    // The printer's build volume is drawn at a smaller scale so the whole frame stays in view.
    scene.root.scale.setScalar(isPrint ? 0.022 : 0.03);
    scene.root.position.set(0, isPrint ? -2.25 : -0.3 - exploded * 2.6, 0);
    scene.root.rotation.z = rotation + Math.sin(elapsed * 0.12) * 0.12;
    scene.printer.visible = isPrint;
    scene.nozzle.position.set(Math.sin(age * 4) * 85, Math.cos(age * 1.7) * 70, -1 + 16 * layer + 14);
    for (const part of parts) {
      const { name } = part;
      const pose = partPose(name, sunAngle);
      part.visible = !isPrint || name === 'Internal Ring Gear';
      part.position.set(pose.x, pose.y, isPrint ? 0 : explodeLift(name) * exploded);
      part.rotation.z = pose.rotation;
      part.scale.z = isPrint ? layer : 1;
      const isWireframe = index === 1 && age < 4;
      if (part.material.wireframe !== isWireframe) {
        part.material.wireframe = isWireframe;
        part.material.needsUpdate = true;
      }
    }
    if (isRunning) {
      invalidate();
    }
  });

  return (
    <>
      <PreviewLights />
      <primitive object={scene.root} dispose={null}>
        {parts.map((part) => (
          <primitive key={part.name} object={part} dispose={null} />
        ))}
      </primitive>
    </>
  );
};
/* oxlint-enable react/immutability */

/** Isolated 3D illustration: no agent, CAD execution, purchase or device activity. */
export const VisionScene = memo(function VisionScene(properties: VisionSceneProperties): React.JSX.Element {
  const [parts, setParts] = useState<ModelPart[]>();
  const [error, setError] = useState<Error>();
  const { onReady } = properties;
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const renderer = useMemo(() => createTauR3fGlProp(backend, [], setError), [backend]);
  useEffect(() => {
    const controller = new AbortController();
    let owned: ModelPart[] = [];
    // async-iife: bootstrap — this effect owns cancellation and every loaded resource.
    void (async () => {
      try {
        const result = await loadParts(controller.signal);
        if (controller.signal.aborted) {
          disposeParts(result);
          return;
        }
        owned = result;
        setParts(result);
        onReady();
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    })();
    return () => {
      controller.abort();
      disposeParts(owned);
    };
  }, [onReady]);
  if (error) {
    throw error;
  }
  return (
    <Canvas
      key={backend}
      gl={renderer}
      frameloop='demand'
      dpr={[1, 1.5]}
      camera={{ position: [8, 7, 11], fov: 36, near: 0.1, far: 100 }}
      onCreated={({ gl: currentRenderer }) => {
        currentRenderer.domElement.addEventListener(
          'webglcontextlost',
          () => {
            setError(new Error('The 3D graphics context was lost.'));
          },
          { once: true },
        );
      }}
    >
      {parts ? <Gearbox {...properties} parts={parts} /> : undefined}
    </Canvas>
  );
});
