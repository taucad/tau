import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { assemblyStep, assemblySteps, explodeLift, partPose, printedPart } from '@taucad/planetary-gearbox';
import type { DesignStoryActor } from '#components/geometry/splash/design-story.machine.js';
import type { StoryBeat } from '#components/geometry/splash/design-story.constants.js';
import { storyFrame } from '#components/geometry/splash/design-story-timeline.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import { createPrintVolume, gearboxColors } from '#components/geometry/gearbox/gearbox.js';
import type { GearboxPart } from '#components/geometry/gearbox/gearbox.js';
import { useGearboxParts } from '#components/geometry/gearbox/use-gearbox-parts.js';
import {
  createMorphingPointsGeometry,
  createMorphingPointsMaterial,
  updateMorphProgress,
  updateMorphTime,
  updateMorphOpacity,
  updateMorphViewport,
} from '#components/geometry/splash/morphing-points-material.js';
import { createMorphingPointsNodeMaterial } from '#components/geometry/splash/morphing-points-material.node.js';
import { sampleGeometrySurface } from '#components/geometry/splash/point-sampler.js';
import { PreviewLights } from '#components/geometry/splash/preview-lights.js';
import { generateScatterPoints } from '#components/geometry/splash/scatter-points.js';

const pointCount = 3000;
type StoryProperties = { readonly actor: DesignStoryActor; readonly isPlaying: boolean; readonly onReady: () => void };

/** Share the fixed point budget by vertex count, so the toothed gears read densest; the ring takes the remainder. */
const samplePoints = (parts: readonly GearboxPart[]): Float32Array[] => {
  const vertices = parts.map((part) => part.geometry.getAttribute('position').count);
  const total = vertices.reduce((sum, count) => sum + count, 0);
  const counts = vertices.map((count) => Math.floor((pointCount * count) / total));
  const ring = parts.findIndex((part) => part.name === printedPart.name);
  counts[ring] = counts[ring]! + pointCount - counts.reduce((sum, count) => sum + count, 0);
  return parts.map((part, index) => sampleGeometrySurface(part.geometry, counts[index]!).positions);
};

/**
 * Mechanism state for a beat. Create holds the exploded stack; assemble seats it in order, then
 * turns the input once; refine widens the gears; check turns slowly; print grows the ring gear.
 */
const beatPose = (
  id: StoryBeat,
  age: number,
): { seating: number; sunAngle: number; variant: number; layer: number } => {
  switch (id) {
    case 'create': {
      return { seating: 0, sunAngle: 0, variant: 0, layer: 1 };
    }
    case 'assemble': {
      return {
        seating: (age - 500) / 3000,
        sunAngle: THREE.MathUtils.smoothstep(age, 3800, 5400) * 2 * Math.PI,
        variant: 0,
        layer: 1,
      };
    }
    case 'refine': {
      return { seating: 1, sunAngle: 0, variant: THREE.MathUtils.smoothstep(age, 1000, 2500), layer: 1 };
    }
    case 'check': {
      return { seating: 1, sunAngle: (age * Math.PI) / 10_000, variant: 1, layer: 1 };
    }
    case 'print': {
      return { seating: 1, sunAngle: 0, variant: 1, layer: THREE.MathUtils.clamp((age - 900) / 4500, 0.025, 1) };
    }
  }
};

/* oxlint-disable react/immutability -- This uncompiled R3F boundary intentionally mutates its exclusively owned Three.js scene. */
function StoryScene({
  actor,
  isPlaying,
  parts,
  backend,
}: Omit<StoryProperties, 'onReady'> & {
  readonly parts: GearboxPart[];
  readonly backend: 'webgl' | 'webgpu';
}): React.JSX.Element {
  'use no memo'; // R3F owns imperative Three.js poses, buffers and uniforms.
  const { invalidate, size } = useThree();
  const hasPlayingFrame = useRef(false);
  const scene = useMemo(() => {
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    for (const part of parts) {
      part.material.transparent = true;
    }
    const printer = createPrintVolume();
    root.add(printer.group);
    let seed = 7;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return seed / 4_294_967_296;
    };
    const scatter = generateScatterPoints(pointCount, 3.5, random);
    const target = new Float32Array(pointCount * 3);
    const geometry = createMorphingPointsGeometry({
      sourcePositions: scatter.positions,
      targetPositions: target,
      randomOffsets: scatter.randomOffsets,
    });
    const options = {
      color: gearboxColors.teal,
      targetColor: gearboxColors.blue,
      pointSize: 0.15,
      explosionStrength: 0.45,
    };
    const node = backend === 'webgpu' ? createMorphingPointsNodeMaterial(options) : undefined;
    const material = node?.material ?? createMorphingPointsMaterial(options);
    const cloud = new THREE.Mesh(geometry, material);
    cloud.frustumCulled = false;
    const ring = parts.find((part) => part.name === printedPart.name)!;
    return {
      root,
      printer,
      cloud,
      geometry,
      material,
      node,
      target,
      samples: samplePoints(parts),
      // The print beat spends the whole budget on the one printed part.
      ring,
      ringSamples: sampleGeometrySurface(ring.geometry, pointCount).positions,
      vector: new THREE.Vector3(),
      dispose() {
        geometry.dispose();
        material.dispose();
        printer.dispose();
      },
    };
  }, [parts, backend]);

  useEffect(() => {
    // Playback's first frame has no earlier playing frame to measure its delta from.
    if (isPlaying) {
      hasPlayingFrame.current = false;
    }
    invalidate();
  }, [invalidate, isPlaying]);
  useEffect(
    () => () => {
      scene.dispose();
    },
    [scene],
  );

  useFrame((_, delta) => {
    if (isPlaying && hasPlayingFrame.current) {
      actor.send({ type: 'advance', delta: delta * 1000 });
    }
    hasPlayingFrame.current = isPlaying;
    const frame = storyFrame(actor.getSnapshot().context.elapsed);
    const { id } = frame.step;
    const { age } = frame;
    const isPrint = id === 'print';
    const morph = Math.min(frame.entrance, 1 - frame.exit);
    const meshOpacity = THREE.MathUtils.smoothstep(morph, 0.55, 1);
    const { seating, sunAngle, variant, layer } = beatPose(id, age);
    const exploded = 1 - THREE.MathUtils.smoothstep(seating, 0.4, 1);
    scene.root.scale.setScalar(isPrint ? 0.018 : 0.024);
    scene.root.position.set(0, isPrint ? -2 : -0.5 - exploded * 2, 0);
    scene.root.updateMatrixWorld(true);
    scene.printer.group.visible = isPrint;
    scene.printer.nozzle.position.set(
      Math.sin(age / 250) * 85,
      Math.cos(age / 590) * 70,
      printedPart.base + printedPart.height * layer + 14,
    );
    let cursor = 0;
    for (const [index, part] of parts.entries()) {
      const { name } = part;
      const pose = partPose(name, sunAngle);
      const seat = THREE.MathUtils.clamp(seating * assemblySteps - assemblyStep(name), 0, 1);
      part.visible = !isPrint || part === scene.ring;
      part.position.set(
        pose.x,
        pose.y,
        isPrint ? 0 : explodeLift(name) * (1 - THREE.MathUtils.smootherstep(seat, 0, 1)),
      );
      part.rotation.z = pose.rotation;
      part.scale.z = isPrint ? layer : 1;
      part.morphTargetInfluences![0] = variant;
      part.material.opacity = meshOpacity;
      part.updateMatrixWorld(true);
      if (isPrint) {
        continue;
      }
      const sampled = scene.samples[index]!;
      for (let offset = 0; offset < sampled.length; offset += 3) {
        scene.vector.fromArray(sampled, offset).applyMatrix4(part.matrixWorld).toArray(scene.target, cursor);
        cursor += 3;
      }
    }
    if (isPrint) {
      for (let offset = 0; offset < scene.ringSamples.length; offset += 3) {
        scene.vector
          .fromArray(scene.ringSamples, offset)
          .applyMatrix4(scene.ring.matrixWorld)
          .toArray(scene.target, offset);
      }
    }
    scene.geometry.getAttribute('aTargetPosition').needsUpdate = true;
    const opacity = 1 - meshOpacity;
    // Zero shader time makes the exact scatter pose identical on both sides of every boundary.
    if (scene.node) {
      scene.node.handles.uProgress.value = morph;
      scene.node.handles.uTime.value = 0;
      scene.node.handles.uOpacity.value = opacity;
    } else if (scene.material instanceof THREE.ShaderMaterial) {
      updateMorphProgress(scene.material, morph);
      updateMorphTime(scene.material, 0);
      updateMorphOpacity(scene.material, opacity);
      updateMorphViewport(scene.material, size.width, size.height);
    }
    if (isPlaying) {
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
      <primitive object={scene.cloud} dispose={null} />
    </>
  );
}

/* oxlint-enable react/immutability */
/** Loads the frozen authored gearbox only; no CAD runtime or machine connection. */
export function DesignStoryCanvas({ actor, isPlaying, onReady }: StoryProperties): React.JSX.Element {
  const [error, setError] = useState<Error>();
  // Public viewers stay on WebGL; the existing internal override is used for parity checks.
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const gl = useMemo(() => createTauR3fGlProp(backend, [], setError), [backend]);
  const parts = useGearboxParts(onReady, setError);
  if (error) {
    throw error;
  }
  return parts ? (
    <Canvas
      key={backend}
      gl={gl}
      data-graphics-backend={backend}
      frameloop='demand'
      dpr={[1, 1.5]}
      camera={{ position: [7.5, 6.5, 10], fov: 38, near: 0.1, far: 100 }}
      onCreated={({ gl: renderer }) => {
        renderer.domElement.addEventListener(
          'webglcontextlost',
          () => {
            setError(new Error('The design story graphics context was lost.'));
          },
          { once: true },
        );
      }}
    >
      <StoryScene actor={actor} isPlaying={isPlaying} parts={parts} backend={backend} />
    </Canvas>
  ) : (
    <div className='flex size-full items-center justify-center text-xs text-muted-foreground'>
      Preparing the design story…
    </div>
  );
}
