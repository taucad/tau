import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { RenderPipeline as ThreeRenderPipeline } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { luminance, pass, saturate, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import { getGeneratedShaderSource } from '#components/geometry/graphics/three/utils/three-shader-debug.test-utils.js';
import { createMetalMorphEnvironment } from '#components/geometry/loader/metal-morph-environment.js';
import type { MetalMorphEnvironment } from '#components/geometry/loader/metal-morph-environment.js';
import {
  createMetalMorphNodeMaterial,
  metalMorphShapeAttributeName,
} from '#components/geometry/loader/metal-morph-material.node.js';
import {
  createSeededRandom,
  defaultMorphTiming,
  pickNextShape,
  randomSeed,
  sampleMorphTimeline,
} from '#components/geometry/loader/metal-morph-sequence.js';
import type { MorphPhase, MorphTimingConfig } from '#components/geometry/loader/metal-morph-sequence.js';
import { getMetalMorphGeometryData, metalMorphShapeIds } from '#components/geometry/loader/metal-morph-shapes.js';
import type { MetalMorphGeometryData, MetalMorphShapeId } from '#components/geometry/loader/metal-morph-shapes.js';

export type MetalMorphLoaderQuality = 'balanced' | 'high';
export type MetalMorphLoaderTheme = 'dark' | 'light';
/** GPU API the node renderer ended up on after Three's own fallback. */
export type MetalMorphBackendInUse = 'webgpu' | 'webgl2';

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
}>;

export type MetalMorphLoaderOptions = Readonly<{
  canvas: HTMLCanvasElement;
  backend: ResolvedGraphicsBackend;
  theme: MetalMorphLoaderTheme;
  /** `high` tessellates finer and adds bloom; `balanced` suits small inline spinners. */
  quality?: MetalMorphLoaderQuality;
  /** Deterministic sequencing seed; omitted for a fresh random loop. */
  seed?: number;
  initialShape?: MetalMorphShapeId;
  /** Playback rate multiplier applied to the loop clock and the tumble. */
  speed?: number;
  timing?: MorphTimingConfig;
  onSequenceChange?: (state: MetalMorphSequenceState) => void;
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
/** Milliseconds; frame deltas above this (tab switches, debugger pauses) are clamped so the loop never leaps. */
const maximumFrameDelta = 100;
/** Milliseconds between frames-per-second estimates. */
const statisticsWindow = 500;
const historyLimit = 16;
const icosphereDetailByQuality: Readonly<Record<MetalMorphLoaderQuality, number>> = { balanced: 5, high: 6 };
const bloomSettings = { strength: 0.22, radius: 0.3, threshold: 1.3, alphaGain: 0.9 } as const;
const initialOrientation = new Quaternion().setFromAxisAngle(new Vector3(0.55, 0.8, 0.25).normalize(), 0.9);

const buildGeometry = (data: MetalMorphGeometryData): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.directions, 3));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  for (const [index, id] of metalMorphShapeIds.entries()) {
    geometry.setAttribute(metalMorphShapeAttributeName(index), new BufferAttribute(data.shapes[id], 4));
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

const resolveBackendInUse = (renderer: WebGPURenderer): MetalMorphBackendInUse =>
  Reflect.get(renderer.backend, 'isWebGPUBackend') === true ? 'webgpu' : 'webgl2';

const createBloomPipeline = (
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): InstanceType<typeof ThreeRenderPipeline> => {
  const scenePass = pass(scene, camera);
  /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder is typed as `any` in `@types/three`; the graph is verified by the backend e2e spec. */
  const scenePassColor = scenePass.getTextureNode('output');
  const glow = bloom(scenePassColor, bloomSettings.strength, bloomSettings.radius, bloomSettings.threshold);
  const composed = scenePassColor.add(glow);
  // The canvas is transparent and premultiplied: give the halo coverage so it composites over the page.
  const alpha = scenePassColor.a.max(saturate(luminance(glow.rgb).mul(bloomSettings.alphaGain)));
  const post = new ThreeRenderPipeline(renderer);
  post.outputNode = vec4(composed.rgb, alpha);
  /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
  return post;
};

/**
 * Framework-agnostic driver for the liquid-metal loader: one node renderer, one body, a procedural studio
 * environment and a continuous loop that flows the body between five forms.
 */
export const createMetalMorphLoader = (options: MetalMorphLoaderOptions): MetalMorphLoaderController => {
  const quality = options.quality ?? 'high';
  const timing = options.timing ?? defaultMorphTiming;
  const random = createSeededRandom(options.seed ?? randomSeed());
  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.5, 40);
  camera.position.set(0, 0.3, cameraDistance);
  camera.lookAt(0, 0, 0);
  const geometryData = getMetalMorphGeometryData(icosphereDetailByQuality[quality]);
  const geometry = buildGeometry(geometryData);
  const { material, handles } = createMetalMorphNodeMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.quaternion.copy(initialOrientation);
  scene.add(mesh);

  let renderer: WebGPURenderer | undefined;
  let pipeline: InstanceType<typeof ThreeRenderPipeline> | undefined;
  let environment: MetalMorphEnvironment | undefined;
  let { theme } = options;
  let speed = options.speed ?? 1;
  // Read through a function so a disposal that happened during an `await` is observed rather than narrowed away.
  const lifecycle = { disposed: false };
  const isDisposed = (): boolean => lifecycle.disposed;
  let isReady = false;
  let wantsPlayback = false;
  let isLooping = false;
  let pendingSize: { width: number; height: number; pixelRatio: number } | undefined;
  let elapsed = 0;
  let lastFrameTime: number | undefined;
  let framesInWindow = 0;
  let windowElapsed = 0;
  let framesPerSecond = 0;

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
    if (!renderer) {
      return;
    }
    if (pipeline) {
      pipeline.render();
    } else {
      renderer.render(scene, camera);
    }
  };

  const frame = (time: number): void => {
    if (isDisposed() || !isLooping) {
      return;
    }
    const delta = lastFrameTime === undefined ? 0 : Math.min(maximumFrameDelta, Math.max(0, time - lastFrameTime));
    lastFrameTime = time;
    advance(delta);
    draw();
    framesInWindow += 1;
    windowElapsed += delta;
    if (windowElapsed >= statisticsWindow) {
      framesPerSecond = (framesInWindow * 1000) / windowElapsed;
      framesInWindow = 0;
      windowElapsed = 0;
    }
  };

  const applySize = (size: { width: number; height: number; pixelRatio: number }): void => {
    if (!renderer) {
      pendingSize = size;
      return;
    }
    renderer.setPixelRatio(size.pixelRatio);
    renderer.setSize(size.width, size.height, false);
    frameCamera(camera, size.width, size.height);
  };

  const startLoop = (): void => {
    if (!renderer || isLooping || isDisposed()) {
      return;
    }
    isLooping = true;
    lastFrameTime = undefined;
    void renderer.setAnimationLoop(frame);
  };

  const stopLoop = (): void => {
    if (!renderer || !isLooping) {
      return;
    }
    isLooping = false;
    void renderer.setAnimationLoop(null);
  };

  // A named function rather than an IIFE: TypeScript narrows captured flags inside immediately invoked
  // expressions, which would hide the playback request made while initialisation was still awaiting.
  const initialise = async (): Promise<void> => {
    const created = await createRenderer('showcase', options.backend, options.canvas);
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
    environment = createMetalMorphEnvironment(renderer, theme);
    scene.environment = environment.texture;
    if (quality === 'high') {
      pipeline = createBloomPipeline(renderer, scene, camera);
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
      stopLoop();
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
      environment = createMetalMorphEnvironment(renderer, theme);
      scene.environment = environment.texture;
      previous?.dispose();
      if (isReady && !isLooping) {
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
        if (isReady && !isLooping) {
          advance(0);
          draw();
        }
      }
    },
    getSequenceState: sequenceState,
    getStatistics: () => ({
      backend: renderer ? resolveBackendInUse(renderer) : 'webgl2',
      framesPerSecond,
      vertexCount: geometryData.vertexCount,
      isBloomEnabled: pipeline !== undefined,
      isPlaying: isLooping,
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
    dispose: () => {
      if (isDisposed()) {
        return;
      }
      lifecycle.disposed = true;
      stopLoop();
      pipeline?.dispose();
      environment?.dispose();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
    },
  };
};
