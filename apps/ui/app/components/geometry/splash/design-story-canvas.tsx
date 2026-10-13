import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { agentLane, assemblyStep, assemblySteps, explodeLift, partPose, printedPart } from '@taucad/planetary-gearbox';
import type { DesignStoryActor } from '#components/geometry/splash/design-story.machine.js';
import type { StoryBeat } from '#components/geometry/splash/design-story.constants.js';
import { storyFrame } from '#components/geometry/splash/design-story-timeline.js';
import { createTauR3fGlProp } from '@taucad/viewer/graphics/three/canvas-three-gl';
import { readGraphicsBackendQueryOverride } from '#utils/graphics-backend-override.js';
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
/** Millimetres between the three agent lanes, as on the homepage story. */
const laneSpacing = 120;
const { smoothstep, lerp, clamp } = THREE.MathUtils;
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
 * Scene state for one beat, all 0..1 unless noted. The chapters follow the homepage story: the
 * prompt holds a scatter of points; parts gather into three agent lanes; geometry turns each
 * cloud into a solid and brings the parts over the build point; assembly seats them in order and
 * turns the input; parameter widens the gears; evidence turns the finished gearbox slowly; print
 * grows the ring gear on the plate, then dissolves it for the loop.
 */
type BeatPose = {
  /** Spread of the parts into agent lanes. */
  lanes: number;
  /** Point morph from scatter (0) to the parts' surfaces (1). */
  progress: number;
  /** Point cloud opacity. */
  cloud: number;
  /** Solid opacity before per-part staggering; `solidStagger` spreads the fade-in across parts. */
  solid: number;
  solidStagger: number;
  /** Assembly progress across all steps. */
  seating: number;
  /** Radians. */
  sunAngle: number;
  /** `faceWidth` 14 → 18 morph influence. */
  variant: number;
  /** How far the scene has moved onto the print bed. */
  print: number;
  /** Printed height of the ring gear. */
  layer: number;
  /** Dissolve at the end of the loop. */
  exit: number;
};

const beatPose = (id: StoryBeat, age: number, exit: number): BeatPose => {
  const rest = {
    lanes: 0,
    progress: 1,
    cloud: 0,
    solid: 1,
    solidStagger: 0,
    seating: 1,
    sunAngle: 0,
    variant: 1,
    print: 0,
    layer: 1,
    exit: 0,
  };
  switch (id) {
    case 'prompt': {
      return { ...rest, lanes: 1, progress: 0, cloud: 1, solid: 0, seating: 0, variant: 0 };
    }
    case 'parts': {
      return { ...rest, lanes: 1, progress: smoothstep(age, 200, 2000), cloud: 1, solid: 0, seating: 0, variant: 0 };
    }
    case 'geometry': {
      return {
        ...rest,
        lanes: 1 - smoothstep(age, 3600, 5000),
        cloud: 1 - smoothstep(age, 800, 3800),
        solid: smoothstep(age, 300, 1200),
        solidStagger: 2400,
        seating: 0,
        variant: 0,
      };
    }
    case 'assembly': {
      return { ...rest, seating: (age - 400) / 3800, sunAngle: smoothstep(age, 4800, 6800) * 2 * Math.PI, variant: 0 };
    }
    case 'parameter': {
      return { ...rest, variant: smoothstep(age, 800, 2300) };
    }
    case 'evidence': {
      return { ...rest, sunAngle: (age * Math.PI) / 11_000 };
    }
    case 'print': {
      return {
        ...rest,
        print: smoothstep(age, 0, 1200),
        layer: clamp((age - 1400) / 4200, 0.025, 1),
        progress: 1 - exit,
        cloud: exit,
        exit,
      };
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
    const pose = beatPose(id, frame.age, id === 'print' ? frame.exit : 0);
    const isPrint = id === 'print';
    const exploded = 1 - smoothstep(pose.seating, 0.4, 1);
    // Lanes need the whole width; the print bed needs the whole height.
    scene.root.scale.setScalar(lerp(lerp(0.024, 0.017, pose.lanes), 0.018, pose.print));
    scene.root.position.set(0, lerp(-0.5 - exploded * 2 + pose.lanes, -2, pose.print), 0);
    scene.root.updateMatrixWorld(true);
    scene.printer.group.visible = pose.print > 0;
    scene.printer.nozzle.position.set(
      Math.sin(frame.age / 250) * 85,
      Math.cos(frame.age / 590) * 70,
      printedPart.base + printedPart.height * pose.layer + 14,
    );
    let cursor = 0;
    for (const [index, part] of parts.entries()) {
      const { name } = part;
      const home = partPose(name, pose.sunAngle);
      const seat = clamp(pose.seating * assemblySteps - assemblyStep(name), 0, 1);
      const isRing = part === scene.ring;
      part.visible = !isPrint || isRing;
      part.position.set(
        home.x + agentLane(name) * laneSpacing * pose.lanes,
        home.y + ((index % 3) - 1) * 10 * pose.lanes,
        isPrint ? 0 : explodeLift(name) * (1 - THREE.MathUtils.smootherstep(seat, 0, 1)),
      );
      part.rotation.z = home.rotation;
      part.scale.z = isPrint ? pose.layer : 1;
      part.morphTargetInfluences![0] = pose.variant;
      // Solids crystallise one part at a time, in assembly order, while the points fade.
      const stagger = (assemblyStep(name) / assemblySteps) * pose.solidStagger;
      part.material.opacity =
        (pose.solidStagger > 0 ? smoothstep(frame.age - stagger, 300, 1200) : pose.solid) * (1 - pose.exit);
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
    // Zero shader time keeps the scatter pose identical on both sides of the loop seam.
    if (scene.node) {
      scene.node.handles.uProgress.value = pose.progress;
      scene.node.handles.uTime.value = 0;
      scene.node.handles.uOpacity.value = pose.cloud;
    } else if (scene.material instanceof THREE.ShaderMaterial) {
      updateMorphProgress(scene.material, pose.progress);
      updateMorphTime(scene.material, 0);
      updateMorphOpacity(scene.material, pose.cloud);
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
  const gl = useMemo(() => createTauR3fGlProp(backend, [], { onCreateError: setError }), [backend]);
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
