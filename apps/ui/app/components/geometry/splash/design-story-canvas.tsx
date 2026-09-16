/* oxlint-disable no-await-in-loop -- Load two large assets sequentially to bound peak decoding memory. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons';
import { z } from 'zod';
import type { DesignStoryActor } from '#components/geometry/splash/design-story.machine.js';
import { storyFrame, partLift } from '#components/geometry/splash/design-story-timeline.js';
import { storyColors } from '#components/geometry/splash/design-story.constants.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import {
  createMorphingPointsGeometry,
  createMorphingPointsMaterial,
  updateMorphProgress,
  updateMorphTime,
  updateMorphOpacity,
  updateMorphViewport,
} from '#components/geometry/splash/morphing-points-material.js';
import { createMorphingPointsNodeMaterial } from '#components/geometry/splash/morphing-points-material.node.js';
import { PreviewLights } from '#components/geometry/splash/preview-lights.js';
import { generateScatterPoints } from '#components/geometry/splash/scatter-points.js';
import evidenceJson from '#components/geometry/splash/assets/design-story-evidence.json?raw';
import source from '#components/geometry/splash/planetary/main.js?raw';
import spec from '#components/geometry/splash/planetary/main.geospec.js?raw';
import smallUrl from '#components/geometry/splash/assets/planetary.glb?url';
import largeUrl from '#components/geometry/splash/assets/planetary-oversized.glb?url';
import smallPointsUrl from '#components/geometry/splash/assets/planetary.points.json?url';
import largePointsUrl from '#components/geometry/splash/assets/planetary-oversized.points.json?url';

const pointCount = 3000;
const requiredChecks = [
  'fits the declared printer envelope',
  ...['housing', 'ring', 'sun', 'planet', 'carrier', 'cover', 'bolt'].map((part) => `${part} is one closed solid`),
  ...[0, 5, 10, 15, 20].map((angle) => `has no interference at input angle ${angle}`),
];
const scale = 0.023;
const names = [
  'Housing',
  'Ring',
  'Sun',
  'Planet 1',
  'Planet 2',
  'Planet 3',
  'Carrier',
  'Cover',
  ...Array.from({ length: 6 }, (_, index) => `Bolt ${index + 1}`),
];
const pointsSchema = z.record(z.string(), z.array(z.number()));
const evidence = z
  .object({
    version: z.number(),
    unit: z.string(),
    usableBed: z.number(),
    sourceDigest: z.string(),
    specDigest: z.string(),
    variants: z.array(
      z.object({
        module: z.number(),
        fits: z.boolean(),
        geometryDigest: z.string(),
        pointsDigest: z.string(),
        tests: z.array(z.object({ name: z.string(), status: z.string() })),
      }),
    ),
  })
  .parse(JSON.parse(evidenceJson));
type StoryAsset = {
  module: number;
  parts: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>;
  points: Record<string, number[]>;
};
type StoryProperties = { readonly actor: DesignStoryActor; readonly isPlaying: boolean; readonly onReady: () => void };
const hash = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
const colorFor = (name: string) =>
  name === 'Sun'
    ? storyColors.teal
    : name.startsWith('Planet')
      ? storyColors.blue
      : name === 'Ring'
        ? storyColors.ring
        : name === 'Carrier'
          ? storyColors.carrier
          : name.startsWith('Bolt')
            ? storyColors.bolt
            : storyColors.housing;
const disposeAsset = (asset: StoryAsset) => {
  for (const mesh of asset.parts) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
};

async function loadAssets(signal: AbortSignal): Promise<StoryAsset[]> {
  const encoder = new TextEncoder();
  if (
    evidence.version !== 1 ||
    evidence.unit !== 'mm' ||
    evidence.usableBed !== 236 ||
    (await hash(encoder.encode(source))) !== evidence.sourceDigest ||
    (await hash(encoder.encode(spec))) !== evidence.specDigest
  ) {
    throw new Error('Design story evidence is stale or unsupported.');
  }
  const assets: StoryAsset[] = [];
  try {
    for (const [index, urls] of [
      [largeUrl, largePointsUrl],
      [smallUrl, smallPointsUrl],
    ].entries()) {
      const receipt = evidence.variants[index];
      const expectedFit = index === 1;
      if (
        !receipt ||
        receipt.fits !== expectedFit ||
        receipt.module !== (expectedFit ? 3 : 3.5) ||
        receipt.tests.length !== requiredChecks.length ||
        requiredChecks.some((name) => {
          const checks = receipt.tests.filter((test) => test.name === name);
          return (
            checks.length !== 1 ||
            checks[0]?.status !== (name === requiredChecks[0] && !expectedFit ? 'failed' : 'passed')
          );
        })
      ) {
        throw new Error('Design story geometry has not passed qualification.');
      }
      const [geometry, sampled] = await Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url, { signal });
          if (!response.ok) {
            throw new Error('Design story asset unavailable.');
          }
          return new Uint8Array(await response.arrayBuffer());
        }),
      );
      if (
        !geometry ||
        !sampled ||
        (await hash(geometry)) !== receipt.geometryDigest ||
        (await hash(sampled)) !== receipt.pointsDigest
      ) {
        throw new Error('Design story asset identity does not match its evidence.');
      }
      const points = pointsSchema.parse(JSON.parse(new TextDecoder().decode(sampled)));
      if (
        names.some((name) => points[name]?.length !== (name === 'Housing' ? 660 : 180) * 3) ||
        points['printHousing']?.length !== pointCount * 3
      ) {
        throw new Error('Design story point allocation is invalid.');
      }
      const gltf = await new GLTFLoader().parseAsync(geometry.buffer, '');
      gltf.scene.updateMatrixWorld(true);
      const asset: StoryAsset = { module: receipt.module, parts: [], points };
      assets.push(asset);
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const original = object as THREE.Mesh;
          // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- Empty scene names are not part identities.
          const name = (object.parent?.name || object.name).replaceAll('_', ' ');
          const mesh = new THREE.Mesh(
            original.geometry.clone().applyMatrix4(object.matrixWorld),
            new THREE.MeshStandardMaterial({
              color: colorFor(name),
              roughness: 0.42,
              metalness: 0.24,
              transparent: true,
            }),
          );
          mesh.name = name;
          if (name.startsWith('Planet')) {
            const angle = ((Number(name.slice(-1)) - 1) * Math.PI * 2) / 3;
            mesh.geometry.translate(-receipt.module * 18 * Math.cos(angle), -receipt.module * 18 * Math.sin(angle), 0);
          }
          asset.parts.push(mesh);
        }
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          const original = object as THREE.Mesh;
          original.geometry.dispose();
          for (const material of Array.isArray(original.material) ? original.material : [original.material]) {
            material.dispose();
          }
        }
      });
      if (asset.parts.length !== 14 || names.some((name) => !asset.parts.some((part) => part.name === name))) {
        throw new Error('Design story lost a named part.');
      }
    }
    return assets;
  } catch (error) {
    for (const asset of assets) {
      disposeAsset(asset);
    }
    throw error;
  }
}

/* oxlint-disable react/immutability -- This uncompiled R3F boundary intentionally mutates its exclusively owned Three.js scene. */
function StoryScene({
  actor,
  isPlaying,
  assets,
  backend,
}: Omit<StoryProperties, 'onReady'> & {
  readonly assets: StoryAsset[];
  readonly backend: 'webgl' | 'webgpu';
}): React.JSX.Element {
  'use no memo'; // R3F owns imperative Three.js poses, buffers and uniforms.
  const { invalidate, size } = useThree();
  const hasPlayingFrame = useRef(false);
  const scene = useMemo(() => {
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    root.position.y = -1.5;
    root.scale.setScalar(scale);
    for (const asset of assets) {
      for (const part of asset.parts) {
        root.add(part);
      }
    }
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
      color: storyColors.teal,
      targetColor: storyColors.blue,
      pointSize: 0.15,
      explosionStrength: 0.45,
    };
    const node = backend === 'webgpu' ? createMorphingPointsNodeMaterial(options) : undefined;
    const material = node?.material ?? createMorphingPointsMaterial(options);
    const cloud = new THREE.Mesh(geometry, material);
    cloud.frustumCulled = false;
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(256, 256, 3),
      new THREE.MeshStandardMaterial({ color: storyColors.bed, transparent: true, opacity: 0.18 }),
    );
    bed.position.z = -4;
    root.add(bed);
    const usable = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-118, -118, -1),
        new THREE.Vector3(118, -118, -1),
        new THREE.Vector3(118, 118, -1),
        new THREE.Vector3(-118, 118, -1),
        new THREE.Vector3(-118, -118, -1),
      ]),
      new THREE.LineBasicMaterial({ color: storyColors.teal, transparent: true }),
    );
    root.add(usable);
    const nozzle = new THREE.Mesh(
      new THREE.BoxGeometry(14, 14, 18),
      new THREE.MeshStandardMaterial({ color: storyColors.printer, transparent: true }),
    );
    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(276, 3, 3),
      new THREE.MeshStandardMaterial({ color: storyColors.printer, transparent: true }),
    );
    root.add(nozzle, gantry);
    // One fixed 3,000-particle budget; print shares it between housing and frame.
    const printer = Array.from({ length: 1000 }, (_, index) => {
      const t = (index % 100) / 99;
      const edge = Math.floor(index / 100);
      if (edge < 4) {
        return [edge % 2 ? 138 : -138, edge < 2 ? -125 : 125, t * 245];
      }
      if (edge < 8) {
        return [edge % 2 ? 138 : -138, -125 + t * 250, edge < 6 ? 245 : -6];
      }
      return [-138 + t * 276, edge === 8 ? -125 : 125, 245];
    });
    return {
      root,
      cloud,
      geometry,
      material,
      node,
      target,
      bed,
      usable,
      nozzle,
      gantry,
      printer,
      vector: new THREE.Vector3(),
    };
  }, [assets, backend]);

  useEffect(() => {
    hasPlayingFrame.current = false;
    invalidate();
  }, [invalidate, isPlaying]);
  useEffect(
    () => () => {
      scene.geometry.dispose();
      scene.material.dispose();
      scene.bed.geometry.dispose();
      scene.bed.material.dispose();
      scene.usable.geometry.dispose();
      scene.usable.material.dispose();
      scene.nozzle.geometry.dispose();
      scene.nozzle.material.dispose();
      scene.gantry.geometry.dispose();
      scene.gantry.material.dispose();
    },
    [scene],
  );

  useFrame((_, delta) => {
    scene.root.updateMatrixWorld(true);
    if (isPlaying && hasPlayingFrame.current) {
      actor.send({ type: 'advance', delta: delta * 1000 });
    }
    hasPlayingFrame.current = isPlaying;
    const frame = storyFrame(actor.getSnapshot().context.elapsed);
    const { id } = frame.step;
    const single = id === 'check' || id === 'print';
    const active = assets[id === 'create' || id === 'check' ? 0 : 1]!;
    const morph = Math.min(frame.entrance, 1 - frame.exit);
    const meshOpacity = THREE.MathUtils.smoothstep(morph, 0.55, 1);
    const input = id === 'assemble' ? (Math.max(0, frame.age - 700) * Math.PI) / 5000 : 0;
    const insert = id === 'assemble' ? 1 - Math.min(1, frame.age / 500) : 1;
    const printProgress = THREE.MathUtils.clamp((frame.age - 1200) / 4000, 0, 1);
    const printLift = id === 'print' ? THREE.MathUtils.smoothstep(frame.age, 5500, 6000) * 15 : 0;
    let cursor = 0;
    for (const asset of assets) {
      for (const part of asset.parts) {
        const { name } = part;
        part.visible = asset === active && (!single || name === 'Housing');
        part.position.set(
          0,
          0,
          single
            ? printLift
            : name === 'Cover' || name.startsWith('Bolt')
              ? partLift(name)
              : name === 'Housing' && id === 'refine'
                ? 0
                : partLift(name) * insert,
        );
        part.rotation.z =
          name === 'Sun' ? input : name === 'Carrier' ? input / 4 : name.startsWith('Planet') ? -input / 2 : 0;
        if (name.startsWith('Planet')) {
          const base = ((Number(name.slice(-1)) - 1) * Math.PI * 2) / 3;
          part.position.x = asset.module * 18 * Math.cos(base + input / 4);
          part.position.y = asset.module * 18 * Math.sin(base + input / 4);
        }
        part.material.opacity = meshOpacity * (id === 'print' ? THREE.MathUtils.smoothstep(printProgress, 0.94, 1) : 1);
        if (!part.visible || single) {
          continue;
        }
        part.updateMatrixWorld(true);
        const sampled = asset.points[name]!;
        const base = name.startsWith('Planet') ? ((Number(name.slice(-1)) - 1) * Math.PI * 2) / 3 : 0;
        for (let index = 0; index < sampled.length; index += 3) {
          scene.vector.set(sampled[index]!, sampled[index + 1]!, sampled[index + 2]!);
          if (name.startsWith('Planet')) {
            scene.vector.x -= asset.module * 18 * Math.cos(base);
            scene.vector.y -= asset.module * 18 * Math.sin(base);
          }
          scene.vector.applyMatrix4(part.matrixWorld).toArray(scene.target, cursor);
          cursor += 3;
        }
      }
    }
    if (single) {
      const sampled = active.points['printHousing']!;
      const housingCount = id === 'print' ? 2000 : pointCount;
      for (let index = 0; index < housingCount; index++) {
        scene.vector.set(
          sampled[index * 3]!,
          sampled[index * 3 + 1]!,
          Math.min(sampled[index * 3 + 2]!, id === 'print' ? printProgress * 32 : 32) + printLift,
        );
        scene.vector.applyMatrix4(scene.root.matrixWorld).toArray(scene.target, index * 3);
      }
      if (id === 'print') {
        for (const [index, point] of scene.printer.entries()) {
          scene.vector
            .fromArray(point)
            .applyMatrix4(scene.root.matrixWorld)
            .toArray(scene.target, (2000 + index) * 3);
        }
      }
    }
    scene.bed.visible = id === 'check' || id === 'refine' || id === 'print';
    scene.usable.visible = scene.bed.visible;
    scene.bed.material.opacity = meshOpacity * 0.18;
    scene.usable.material.opacity = meshOpacity * 0.7;
    scene.nozzle.visible = id === 'print';
    scene.gantry.visible = id === 'print';
    const printing = printProgress > 0 && printProgress < 1;
    scene.nozzle.position.set(
      printing ? Math.sin(frame.age / 130) * 96 : 125,
      printing ? Math.cos(frame.age / 420) * 72 : 0,
      printProgress * 32 + 15,
    );
    scene.gantry.position.set(0, scene.nozzle.position.y, scene.nozzle.position.z + 4);
    scene.nozzle.material.opacity = meshOpacity;
    scene.gantry.material.opacity = meshOpacity * 0.4;
    scene.geometry.getAttribute('aTargetPosition').needsUpdate = true;
    const opacity = id === 'print' ? 1 : 1 - meshOpacity;
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
      <primitive object={scene.root} />
      <primitive object={scene.cloud} />
    </>
  );
}

/* oxlint-enable react/immutability */
/** Loads verified offline assets only; no CAD runtime or machine connection. */
export function DesignStoryCanvas({ actor, isPlaying, onReady }: StoryProperties): React.JSX.Element {
  const [assets, setAssets] = useState<StoryAsset[]>();
  const [error, setError] = useState<Error>();
  // Public viewers stay on WebGL; the existing internal override is used for parity checks.
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const gl = useMemo(() => createTauR3fGlProp(backend), [backend]);
  useEffect(() => {
    const controller = new AbortController();
    let loaded: StoryAsset[] | undefined;
    // async-iife: bootstrap — abort and dispose assets when this canvas leaves the page.
    void (async () => {
      try {
        const result = await loadAssets(controller.signal);
        if (controller.signal.aborted) {
          for (const asset of result) {
            disposeAsset(asset);
          }
        } else {
          loaded = result;
          setAssets(result);
          onReady();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    })();
    return () => {
      controller.abort();
      for (const asset of loaded ?? []) {
        disposeAsset(asset);
      }
    };
  }, [onReady]);
  if (error) {
    throw error;
  }
  return assets ? (
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
      <StoryScene actor={actor} isPlaying={isPlaying} assets={assets} backend={backend} />
    </Canvas>
  ) : (
    <div className='flex size-full items-center justify-center text-xs text-muted-foreground'>
      Preparing the design story…
    </div>
  );
}
