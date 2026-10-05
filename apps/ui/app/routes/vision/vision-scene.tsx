import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import { PreviewLights } from '#components/geometry/splash/preview-lights.js';
import { partLift } from '#components/geometry/splash/design-story-timeline.js';
import { storyColors } from '#components/geometry/splash/design-story.constants.js';
import { visionFrame } from '#routes/vision/vision-story.js';
import modelUrl from '#components/geometry/splash/assets/planetary.glb?url';

type ModelPart = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
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

/** Load the existing authored model into exclusively owned scene resources. */
const loadParts = async (signal: AbortSignal): Promise<ModelPart[]> => {
  const response = await fetch(modelUrl, { signal });
  if (!response.ok) {
    throw new Error(`The gearbox model could not load (${response.status}).`);
  }
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  gltf.scene.updateMatrixWorld(true);
  const parts: ModelPart[] = [];
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const original = object as THREE.Mesh;
    // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- An empty mesh name falls back to the parent part identity.
    const name = (original.name || original.parent?.name || '').replaceAll('_', ' ');
    const geometry = original.geometry.clone().applyMatrix4(original.matrixWorld);
    if (name.startsWith('Planet')) {
      const angle = ((Number(name.slice(-1)) - 1) * Math.PI * 2) / 3;
      geometry.translate(-54 * Math.cos(angle), -54 * Math.sin(angle), 0);
    }
    const part = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color:
          name === 'Sun'
            ? storyColors.teal
            : name.startsWith('Planet')
              ? storyColors.blue
              : name === 'Ring'
                ? storyColors.ring
                : name.startsWith('Bolt')
                  ? storyColors.bolt
                  : storyColors.carrier,
        metalness: 0.62,
        roughness: 0.3,
      }),
    );
    part.name = name;
    parts.push(part);
    original.geometry.dispose();
    for (const material of Array.isArray(original.material) ? original.material : [original.material]) {
      material.dispose();
    }
  });
  if (parts.length !== 14) {
    disposeParts(parts);
    throw new Error(`Expected the authored 14-part gearbox; loaded ${parts.length} parts.`);
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
    root.scale.setScalar(0.024);

    const printer = new THREE.Group();
    const bedGeometry = new THREE.BoxGeometry(260, 260, 6);
    const bedMaterial = new THREE.MeshStandardMaterial({ color: storyColors.ring, metalness: 0.5, roughness: 0.5 });
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    bed.position.z = -8;
    const frameBox = new THREE.BoxGeometry(290, 290, 235);
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
    frame.position.z = 105;
    const nozzleGeometry = new THREE.BoxGeometry(22, 22, 28);
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
    const input = hasMotion ? age * 1.1 : 0;
    const isPrint = index === 5;
    scene.root.position.set(0, isPrint ? -2.25 : -0.4 - exploded * 1.8, 0);
    scene.root.rotation.z = rotation + Math.sin(elapsed * 0.12) * 0.12;
    scene.printer.visible = isPrint;
    scene.nozzle.position.set(Math.sin(age * 4) * 85, Math.cos(age * 1.7) * 70, 25 + (age / 12) * 32);
    for (const part of parts) {
      const { name } = part;
      const isLid = name === 'Cover' || name.startsWith('Bolt');
      part.visible = isPrint ? name === 'Housing' : !(hasMotion && isLid);
      part.position.set(0, 0, isPrint ? 0 : partLift(name) * exploded);
      part.scale.z = isPrint ? Math.max(0.025, Math.min(1, age / 9)) : 1;
      part.rotation.z =
        name === 'Sun' ? input : name === 'Carrier' ? input / 4 : name.startsWith('Planet') ? -input / 2 : 0;
      if (name.startsWith('Planet')) {
        const base = ((Number(name.slice(-1)) - 1) * Math.PI * 2) / 3;
        part.position.x = 54 * Math.cos(base + input / 4);
        part.position.y = 54 * Math.sin(base + input / 4);
      }
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
