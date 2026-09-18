import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import { getGeneratedShaderSource } from '#components/geometry/graphics/three/utils/three-shader-debug.test-utils.js';
import { captureFrameThrough, resolveBackendInUse } from '#components/geometry/loader/showcase-capture.js';
import type { ShowcaseBackendInUse, ShowcaseFrameCapture } from '#components/geometry/loader/showcase-capture.js';
import { adaptiveLevels, createShowcaseFrameLoop } from '#components/geometry/loader/showcase-frame-loop.js';
import { createBloomPipeline, createCapturePipeline } from '#components/geometry/loader/showcase-post.js';
import type { ShowcaseRenderPipeline } from '#components/geometry/loader/showcase-post.js';
import { createMetalMorphEnvironment } from '#components/geometry/loader/metal-morph-environment.js';
import type { MetalMorphEnvironment } from '#components/geometry/loader/metal-morph-environment.js';
import {
  createMetalMorphNodeMaterial,
  metalMorphDirectionAttributeName,
  metalMorphShapeAttributeName,
} from '#components/geometry/loader/metal-morph-material.node.js';
import type { MetalMorphMaterialOptions } from '#components/geometry/loader/metal-morph-material.node.js';
import {
  createSeededRandom,
  defaultMorphTiming,
  pickNextShape,
  randomSeed,
  sampleMorphTimeline,
} from '#components/geometry/loader/metal-morph-sequence.js';
import type { MorphPhase, MorphTimingConfig } from '#components/geometry/loader/metal-morph-sequence.js';
import {
  getMetalMorphGeometryData,
  metalMorphDirectionOffset,
  metalMorphSampleStride,
  metalMorphShapeIds,
} from '#components/geometry/loader/metal-morph-shapes.js';
import type { MetalMorphGeometryData, MetalMorphShapeId } from '#components/geometry/loader/metal-morph-shapes.js';

/**
 * Cost tier. `balanced` suits spinners and mid-size surfaces (no bloom, no thin film, low-power adapter);
 * `high` hero surfaces with bloom, thin film, a finer body and an adaptive governor that steps pixel ratio,
 * bloom and frame rate down when frames run long. Both shade their ridges per fragment: a coarser tier than
 * these cannot hold a clean silhouette even at glyph size.
 */
export type MetalMorphLoaderQuality = 'balanced' | 'high';
export type MetalMorphLoaderTheme = 'dark' | 'light';
/** GPU API the node renderer ended up on after Three's own fallback. */
export type MetalMorphBackendInUse = ShowcaseBackendInUse;

export type MetalMorphSequenceState = Readonly<{
  phase: MorphPhase;
  currentShape: MetalMorphShapeId;
  nextShape: MetalMorphShapeId;
  /** Forms shown so far, oldest first, bounded to the last {@link historyLimit} entries. */
  history: readonly MetalMorphShapeId[];
  transitionCount: number;
}>;

export type MetalMorphLoaderStatistics = Readonly<{
  backend: MetalMorphBackendInUse;
  framesPerSecond: number;
  vertexCount: number;
  isBloomEnabled: boolean;
  isPlaying: boolean;
  /** Frames per second the loop currently aims for, after any adaptive cap. */
  targetFrameRate: number;
  /** Governor step in effect: 0 none, 1 pixel ratio reduced, 2 bloom off, 3 frame rate halved. */
  adaptiveLevel: number;
  /** Device pixel ratio the canvas currently renders at. */
  pixelRatio: number;
}>;

/** Pixel statistics of one frame read back from an offscreen target, independent of canvas presentation. */
export type MetalMorphFrameCapture = ShowcaseFrameCapture;

export type MetalMorphLoaderOptions = Readonly<{
  canvas: HTMLCanvasElement;
  backend: ResolvedGraphicsBackend;
  theme: MetalMorphLoaderTheme;
  /** Cost tier; see {@link MetalMorphLoaderQuality}. */
  quality?: MetalMorphLoaderQuality;
  /** Deterministic sequencing seed; omitted for a fresh random loop. */
  seed?: number;
  initialShape?: MetalMorphShapeId;
  /** Playback rate multiplier applied to the loop clock and the tumble. */
  speed?: number;
  timing?: MorphTimingConfig;
  onSequenceChange?: (state: MetalMorphSequenceState) => void;
  /**
   * Called synchronously after every completed frame, with the loop clock and the canvas the frame landed
   * on, so a shared surface can copy the pixels out before anything else touches the drawing buffer. Ticks
   * the frame cap skips never call it, and neither does a readback capture or a disposed controller.
   */
  onFrame?: (frame: { readonly time: number; readonly canvas: HTMLCanvasElement }) => void;
}>;

export type MetalMorphLoaderController = Readonly<{
  /** Resolves once the renderer, environment and pipelines are warm and the first frame is on the canvas. */
  ready: Promise<void>;
  play: () => void;
  pause: () => void;
  /** Draw one frame at the current clock without starting the loop (reduced-motion poster). */
  renderOnce: () => void;
  setSize: (size: { readonly width: number; readonly height: number; readonly pixelRatio: number }) => void;
  setTheme: (theme: MetalMorphLoaderTheme) => void;
  setSpeed: (speed: number) => void;
  /** Start morphing to `shape` now, or make it the next target when a morph is already under way. */
  jumpTo: (shape: MetalMorphShapeId) => void;
  getSequenceState: () => MetalMorphSequenceState;
  getStatistics: () => MetalMorphLoaderStatistics;
  /** Generated backend shader source for the body, for backend evidence. */
  getShaderSource: () => Promise<{ readonly vertexShader: string; readonly fragmentShader: string }>;
  /**
   * Draw the current pose into an offscreen target and read it back through the active backend, so pixel
   * evidence exists even where the canvas cannot present (headless WebGPU adapters).
   */
  captureFrame: () => Promise<MetalMorphFrameCapture>;
  dispose: () => void;
}>;

/** Camera distance in render units; the body's extremes sit near one unit from the origin. */
const cameraDistance = 5.4;
/** Half-extent the camera frames along its tighter axis, leaving air around spikes and overshoot. */
const framedHalfExtent = 1.22;
/** Radians per second of the resting tumble. */
const restingSpinRate = 0.45;
/** Additional radians per second at the peak of a bend. */
const bendingSpinRate = 1.4;
const historyLimit = 16;

type QualityProfile = Readonly<{
  /** Icosphere subdivisions; vertex count is `10 * 4^detail + 2`. */
  detail: number;
  bloom: boolean;
  /** PMREM cube face size for the studio environment. */
  environmentSize: number;
  targetFrameRate: number;
  material: MetalMorphMaterialOptions;
  powerPreference: 'high-performance' | 'low-power';
}>;

/**
 * Every tier keeps the silhouettes smooth: the shapes draw their samples into the fillets, so at these
 * tessellations the mesh stays within a fraction of a pixel of the rounded surface at the size the tier serves.
 * The hero tier spends one more subdivision on the in-between forms, where two shapes' fillets overlap.
 */
const qualityProfiles: Readonly<Record<MetalMorphLoaderQuality, QualityProfile>> = {
  balanced: {
    detail: 5,
    bloom: false,
    environmentSize: 128,
    targetFrameRate: 60,
    material: { iridescence: 0 },
    powerPreference: 'low-power',
  },
  high: {
    detail: 6,
    bloom: true,
    environmentSize: 256,
    targetFrameRate: 60,
    material: {},
    powerPreference: 'high-performance',
  },
};

const reducedPixelRatioScale = 0.75;
const initialOrientation = new Quaternion().setFromAxisAngle(new Vector3(0.55, 0.8, 0.25).normalize(), 0.9);

const buildGeometry = (data: MetalMorphGeometryData): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.directions, 3));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  // One interleaved buffer per shape carries both of its attributes: WebGPU binds at most eight vertex buffers,
  // and a buffer per attribute would need eleven.
  for (const [index, id] of metalMorphShapeIds.entries()) {
    const packed = new InterleavedBuffer(data.shapes[id], metalMorphSampleStride);
    geometry.setAttribute(metalMorphShapeAttributeName(index), new InterleavedBufferAttribute(packed, 4, 0));
    geometry.setAttribute(
      metalMorphDirectionAttributeName(index),
      new InterleavedBufferAttribute(packed, 3, metalMorphDirectionOffset),
    );
  }
  geometry.computeBoundingSphere();
  return geometry;
};

const frameCamera = (camera: PerspectiveCamera, width: number, height: number): void => {
  const aspect = width / Math.max(1, height);
  camera.aspect = aspect;
  camera.fov = (2 * Math.atan(framedHalfExtent / (cameraDistance * Math.min(1, aspect))) * 180) / Math.PI;
  camera.updateProjectionMatrix();
};

const randomUnitVector = (random: () => number, target: Vector3): Vector3 => {
  const z = random() * 2 - 1;
  const theta = random() * Math.PI * 2;
  const ring = Math.sqrt(Math.max(0, 1 - z * z));
  return target.set(ring * Math.cos(theta), ring * Math.sin(theta), z);
};

const shapeIndex = (shape: MetalMorphShapeId): number => metalMorphShapeIds.indexOf(shape);

/**
 * Framework-agnostic driver for the liquid-metal loader: one node renderer, one body, a procedural studio
 * environment and a continuous loop that flows the body between five forms.
 */
export const createMetalMorphLoader = (options: MetalMorphLoaderOptions): MetalMorphLoaderController => {
  const profile = qualityProfiles[options.quality ?? 'high'];
  const timing = options.timing ?? defaultMorphTiming;
  const random = createSeededRandom(options.seed ?? randomSeed());
  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.5, 40);
  camera.position.set(0, 0.3, cameraDistance);
  camera.lookAt(0, 0, 0);
  const geometryData = getMetalMorphGeometryData(profile.detail);
  const geometry = buildGeometry(geometryData);
  const { material, handles } = createMetalMorphNodeMaterial(profile.material);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.quaternion.copy(initialOrientation);
  scene.add(mesh);

  let renderer: WebGPURenderer | undefined;
  let pipeline: ShowcaseRenderPipeline | undefined;
  let capturePipeline: ShowcaseRenderPipeline | undefined;
  let environment: MetalMorphEnvironment | undefined;
  let { theme } = options;
  let speed = options.speed ?? 1;
  // Read through a function so a disposal that happened during an `await` is observed rather than narrowed away.
  const lifecycle = { disposed: false };
  const isDisposed = (): boolean => lifecycle.disposed;
  let isReady = false;
  let wantsPlayback = false;
  let pendingSize: { width: number; height: number; pixelRatio: number } | undefined;
  let requestedSize: { width: number; height: number; pixelRatio: number } | undefined;
  let elapsed = 0;

  let currentShape: MetalMorphShapeId = options.initialShape ?? metalMorphShapeIds[0];
  let nextShape = currentShape;
  let forcedNext: MetalMorphShapeId | undefined;
  let phase: MorphPhase = 'rest';
  let morphCycle = -1;
  let restCycle = 0;
  let transitionCount = 0;
  const history: MetalMorphShapeId[] = [currentShape];
  const sweepAxis = new Vector3(0, 1, 0);
  const spinAxis = new Vector3();
  const worldSweep = new Vector3();
  const spinStep = new Quaternion();

  handles.uFromIndex.value = shapeIndex(currentShape);
  handles.uToIndex.value = shapeIndex(currentShape);

  const sequenceState = (): MetalMorphSequenceState => ({
    phase,
    currentShape,
    nextShape,
    history: [...history],
    transitionCount,
  });

  const notify = (): void => {
    options.onSequenceChange?.(sequenceState());
  };

  const startTransition = (cycleIndex: number): void => {
    morphCycle = cycleIndex;
    phase = 'morph';
    nextShape = forcedNext ?? pickNextShape(history, metalMorphShapeIds, random);
    forcedNext = undefined;
    randomUnitVector(random, sweepAxis);
    handles.uSweepAxis.value.copy(sweepAxis);
    handles.uSeedOffset.value.set(random() * 100, random() * 100, random() * 100);
    handles.uFromIndex.value = shapeIndex(currentShape);
    handles.uToIndex.value = shapeIndex(nextShape);
    notify();
  };

  const finishTransition = (cycleIndex: number): void => {
    restCycle = cycleIndex;
    phase = 'rest';
    currentShape = nextShape;
    history.push(currentShape);
    if (history.length > historyLimit) {
      history.splice(0, history.length - historyLimit);
    }
    transitionCount += 1;
    handles.uFromIndex.value = shapeIndex(currentShape);
    notify();
  };

  const advance = (deltaMilliseconds: number): void => {
    elapsed += deltaMilliseconds * speed;
    const sample = sampleMorphTimeline(elapsed, timing);
    if (sample.phase === 'morph' && morphCycle !== sample.cycleIndex) {
      startTransition(sample.cycleIndex);
    } else if (sample.phase === 'rest' && restCycle !== sample.cycleIndex) {
      finishTransition(sample.cycleIndex);
    }

    handles.uProgress.value = sample.frontProgress;
    handles.uMolten.value = sample.molten;
    handles.uRing.value = sample.ring;
    handles.uTime.value = (elapsed / 1000) % 1000;
    mesh.scale.setScalar(sample.scale);

    const seconds = elapsed / 1000;
    spinAxis.set(Math.sin(seconds * 0.21) * 0.8, 1, Math.cos(seconds * 0.17) * 0.8).normalize();
    worldSweep.copy(sweepAxis).applyQuaternion(mesh.quaternion);
    spinAxis.lerp(worldSweep, sample.spinImpulse * 0.6).normalize();
    const angle = ((restingSpinRate + sample.spinImpulse * bendingSpinRate) * deltaMilliseconds * speed) / 1000;
    spinStep.setFromAxisAngle(spinAxis, angle);
    mesh.quaternion.premultiply(spinStep).normalize();
  };

  const draw = (): void => {
    if (!renderer || isDisposed()) {
      return;
    }
    if (pipeline) {
      pipeline.render();
    } else {
      renderer.render(scene, camera);
    }
    // Same task as the draw, so the drawing buffer still holds this frame for a subscriber to copy.
    options.onFrame?.({ time: elapsed, canvas: options.canvas });
  };

  const applySize = (size: { width: number; height: number; pixelRatio: number }): void => {
    requestedSize = size;
    if (!renderer) {
      pendingSize = size;
      return;
    }
    const pixelRatio =
      loop.getAdaptiveLevel() >= adaptiveLevels.pixelRatio
        ? Math.max(1, size.pixelRatio * reducedPixelRatioScale)
        : size.pixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.width, size.height, false);
    frameCamera(camera, size.width, size.height);
  };

  /** Apply a governor step: pixel ratio first, then the bloom chain; the loop caps its own frame rate. */
  const applyAdaptiveLevel = (level: number): void => {
    if (requestedSize) {
      applySize(requestedSize);
    }
    const wantsBloom = profile.bloom && level < adaptiveLevels.bloom;
    if (renderer && wantsBloom && !pipeline) {
      pipeline = createBloomPipeline(renderer, { scene, camera });
    } else if (!wantsBloom && pipeline) {
      pipeline.dispose();
      pipeline = undefined;
    }
  };

  const loop = createShowcaseFrameLoop({
    targetFrameRate: profile.targetFrameRate,
    onFrame: (delta) => {
      if (isDisposed()) {
        return;
      }
      advance(delta);
      draw();
    },
    onAdaptiveLevel: applyAdaptiveLevel,
  });

  const startLoop = (): void => {
    if (!renderer || isDisposed()) {
      return;
    }
    loop.start(renderer);
  };

  // A named function rather than an IIFE: TypeScript narrows captured flags inside immediately invoked
  // expressions, which would hide the playback request made while initialisation was still awaiting.
  const initialise = async (): Promise<void> => {
    const created = await createRenderer('showcase', options.backend, {
      canvas: options.canvas,
      powerPreference: profile.powerPreference,
    });
    if (isDisposed()) {
      created.dispose();
      return;
    }
    renderer = created;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x00_00_00, 0);
    applySize(pendingSize ?? { width: 256, height: 256, pixelRatio: 1 });
    pendingSize = undefined;
    environment = createMetalMorphEnvironment(renderer, theme, { size: profile.environmentSize });
    scene.environment = environment.texture;
    if (profile.bloom) {
      pipeline = createBloomPipeline(renderer, { scene, camera });
    }
    await renderer.compileAsync(scene, camera);
    if (isDisposed()) {
      return;
    }
    advance(0);
    draw();
    isReady = true;
    if (wantsPlayback) {
      startLoop();
    }
  };

  const ready = initialise();

  return {
    ready,
    play: () => {
      wantsPlayback = true;
      if (isReady) {
        startLoop();
      }
    },
    pause: () => {
      wantsPlayback = false;
      loop.stop();
    },
    renderOnce: () => {
      if (isReady) {
        advance(0);
        draw();
      }
    },
    setSize: applySize,
    setTheme: (nextTheme) => {
      if (nextTheme === theme) {
        return;
      }
      theme = nextTheme;
      if (!renderer) {
        return;
      }
      const previous = environment;
      environment = createMetalMorphEnvironment(renderer, theme, { size: profile.environmentSize });
      scene.environment = environment.texture;
      previous?.dispose();
      if (isReady && !loop.isLooping()) {
        draw();
      }
    },
    setSpeed: (nextSpeed) => {
      speed = Math.max(0, nextSpeed);
    },
    jumpTo: (shape) => {
      if (phase === 'rest' && shape === currentShape) {
        return;
      }
      forcedNext = shape;
      if (phase === 'rest') {
        const cycleDuration = timing.restDuration + timing.morphDuration;
        elapsed = Math.floor(elapsed / cycleDuration) * cycleDuration + timing.restDuration;
        if (isReady && !loop.isLooping()) {
          advance(0);
          draw();
        }
      }
    },
    getSequenceState: sequenceState,
    getStatistics: () => ({
      backend: renderer ? resolveBackendInUse(renderer) : 'webgl2',
      framesPerSecond: loop.getFramesPerSecond(),
      vertexCount: geometryData.vertexCount,
      isBloomEnabled: pipeline !== undefined,
      isPlaying: loop.isLooping(),
      targetFrameRate: loop.getTargetFrameRate(),
      adaptiveLevel: loop.getAdaptiveLevel(),
      pixelRatio: renderer?.getPixelRatio() ?? 1,
    }),
    getShaderSource: async () => {
      if (!renderer) {
        throw new Error('The metal morph loader renderer is not ready.');
      }
      const source = await getGeneratedShaderSource({ camera, object: mesh, renderer, scene });
      if (!source.vertexShader || !source.fragmentShader) {
        throw new Error('Three did not generate both shader stages for the metal morph body.');
      }
      return { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader };
    },
    captureFrame: async () => {
      if (!renderer || !isReady) {
        throw new Error('The metal morph loader renderer is not ready.');
      }
      // A plain scene pass with the renderer's output transform draws the same tone-mapped, display-encoded
      // body the canvas shows, whatever the governor has done to bloom.
      capturePipeline ??= createCapturePipeline(renderer, { scene, camera });
      advance(0);
      return captureFrameThrough(renderer, capturePipeline);
    },
    dispose: () => {
      if (isDisposed()) {
        return;
      }
      lifecycle.disposed = true;
      loop.stop();
      pipeline?.dispose();
      capturePipeline?.dispose();
      environment?.dispose();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
    },
  };
};
