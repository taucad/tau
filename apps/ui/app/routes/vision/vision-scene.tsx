import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createTauR3fGlProp } from '@taucad/viewer/graphics/three/canvas-three-gl';
import { readGraphicsBackendQueryOverride } from '#utils/graphics-backend-override.js';
import { explodeLift, partPose, printedPart } from '@taucad/planetary-gearbox';
import { createPrintVolume } from '#components/geometry/gearbox/gearbox.js';
import type { GearboxPart } from '#components/geometry/gearbox/gearbox.js';
import { useGearboxParts } from '#components/geometry/gearbox/use-gearbox-parts.js';
import { PreviewLights } from '#components/geometry/splash/preview-lights.js';
import { visionFrame } from '#routes/vision/vision-story.js';

type VisionSceneProperties = {
  readonly clock: RefObject<number>;
  readonly time: number;
  readonly isRunning: boolean;
  readonly rotation: number;
  readonly onReady: () => void;
};

/* oxlint-disable react/immutability -- R3F updates exclusively owned scene objects in place. */
const Gearbox = ({
  parts,
  clock,
  time,
  isRunning,
  rotation,
}: Omit<VisionSceneProperties, 'onReady'> & { readonly parts: GearboxPart[] }): React.JSX.Element => {
  'use no memo';
  const { invalidate } = useThree();
  const lastPose = useRef('');
  const scene = useMemo(() => {
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    const printer = createPrintVolume();
    root.add(printer.group);
    return { root, printer };
  }, []);

  useEffect(
    () => () => {
      scene.printer.dispose();
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
    // The ring gear is printed layer by layer from its base to its face.
    const layer = Math.max(0.025, Math.min(1, age / 9));
    // The printer's build volume is drawn at a smaller scale so the whole frame stays in view.
    scene.root.scale.setScalar(isPrint ? 0.022 : 0.03);
    scene.root.position.set(0, isPrint ? -2.25 : -0.3 - exploded * 2.6, 0);
    scene.root.rotation.z = rotation + Math.sin(elapsed * 0.12) * 0.12;
    scene.printer.group.visible = isPrint;
    scene.printer.nozzle.position.set(
      Math.sin(age * 4) * 85,
      Math.cos(age * 1.7) * 70,
      printedPart.base + printedPart.height * layer + 14,
    );
    for (const part of parts) {
      const { name } = part;
      const pose = partPose(name, sunAngle);
      part.visible = !isPrint || name === printedPart.name;
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
  const [error, setError] = useState<Error>();
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const renderer = useMemo(() => createTauR3fGlProp(backend, [], { onCreateError: setError }), [backend]);
  const parts = useGearboxParts(properties.onReady, setError);
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
