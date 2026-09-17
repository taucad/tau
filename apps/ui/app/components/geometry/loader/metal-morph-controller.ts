import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  RenderTarget,
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
  /** Frames per second the loop currently aims for, after any adaptive cap. */
  targetFrameRate: number;
  /** Governor step in effect: 0 none, 1 pixel ratio reduced, 2 bloom off, 3 frame rate halved. */
  adaptiveLevel: number;
  /** Device pixel ratio the canvas currently renders at. */
  pixelRatio: number;
}>;

/** Pixel statistics of one frame read back from an offscreen target, independent of canvas presentation. */
export type MetalMorphFrameCapture = Readonly<{
  backend: MetalMorphBackendInUse;
  /** Side length of the square readback, in pixels. */
  size: number;
  /** Fraction of pixels the body covers (alpha above half). */
  coverage: number;
  /** Mean display-referred luminance of the covered pixels, 0 to 1. */
  bodyLuminance: number;
  /** Standard deviation of luminance across the covered pixels. */
  bodyContrast: number;
  /** Fraction of covered pixels brighter than the highlight threshold. */
  highlightShare: number;
  /** Fraction of covered pixels darker than the shadow threshold. */
  shadowShare: number;
  /** Distinct 5-bit RGB buckets across the covered pixels. */
  distinctColors: number;
  /** Highest alpha, 0 to 1, inside the four corner blocks the body never reaches. */
  cornerAlpha: number;
}>;

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
/** Milliseconds; frame deltas above this (tab switches, debugger pauses) are clamped so the loop never leaps. */
const maximumFrameDelta = 100;
/** Milliseconds between frames-per-second estimates. */
const statisticsWindow = 500;
const historyLimit = 16;
const bloomSettings = { strength: 0.18, radius: 0.3, threshold: 1.35, alphaGain: 0.8 } as const;

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

/** Frames per second the loop settles to once the governor caps it. */
const reducedFrameRate = 30;
const reducedPixelRatioScale = 0.75;
/** Milliseconds of slack under the frame cap, so a display tick just short of the interval still draws. */
const frameCapTolerance = 3;
/** Average frame interval, relative to the target, above which a statistics window counts as slow. */
const adaptiveSlowRatio = 1.35;
/** Average frame interval, relative to the target, below which a window counts as having headroom. */
const adaptiveFastRatio = 1.05;
const adaptiveSlowWindows = 2;
/** Windows of headroom before a governor step is undone; doubles each time a step has to be repeated. */
const adaptiveRecoveryWindows = 8;
const adaptiveRecoveryWindowsLimit = 64;
/** Governor steps, least visible first. */
const adaptiveLevels = { pixelRatio: 1, bloom: 2, frameRate: 3 } as const;
/** Side length of the square readback; a multiple of 64 texels keeps WebGPU copy rows unpadded. */
const captureSize = 256;
/** WebGPU aligns copied rows to this many bytes; a padded readback is unpacked with this stride. */
const readbackRowAlignment = 256;
/** Side length, in pixels, of the corner blocks whose alpha the capture reports. */
const captureCornerReach = 12;
/** Alpha, 0 to 255, from which a capture pixel counts as body. */
const coverageAlpha = 128;
const highlightLuminance = 0.85;
const shadowLuminance = 0.25;
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

const resolveBackendInUse = (renderer: WebGPURenderer): MetalMorphBackendInUse =>
  Reflect.get(renderer.backend, 'isWebGPUBackend') === true ? 'webgpu' : 'webgl2';

const analyseCapture = (pixels: ArrayLike<number>, backend: MetalMorphBackendInUse): MetalMorphFrameCapture => {
  const size = captureSize;
  const tightRow = size * 4;
  const rowStride =
    pixels.length === size * tightRow ? tightRow : Math.ceil(tightRow / readbackRowAlignment) * readbackRowAlignment;
  const buckets = new Set<number>();
  let covered = 0;
  let luminanceSum = 0;
  let luminanceSquares = 0;
  let highlights = 0;
  let shadows = 0;
  let cornerAlpha = 0;
  for (let y = 0; y < size; y += 1) {
    const isCornerRow = y < captureCornerReach || y >= size - captureCornerReach;
    for (let x = 0; x < size; x += 1) {
      const offset = y * rowStride + x * 4;
      const alpha = pixels[offset + 3]!;
      if (isCornerRow && (x < captureCornerReach || x >= size - captureCornerReach)) {
        cornerAlpha = Math.max(cornerAlpha, alpha);
      }
      if (alpha < coverageAlpha) {
        continue;
      }
      covered += 1;
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      luminanceSum += luminance;
      luminanceSquares += luminance * luminance;
      if (luminance > highlightLuminance) {
        highlights += 1;
      }
      if (luminance < shadowLuminance) {
        shadows += 1;
      }
      buckets.add(Math.floor(red / 8) * 1024 + Math.floor(green / 8) * 32 + Math.floor(blue / 8));
    }
  }
  const mean = covered > 0 ? luminanceSum / covered : 0;
  const variance = covered > 0 ? Math.max(0, luminanceSquares / covered - mean * mean) : 0;
  return {
    backend,
    size,
    coverage: covered / (size * size),
    bodyLuminance: mean,
    bodyContrast: Math.sqrt(variance),
    highlightShare: covered > 0 ? highlights / covered : 0,
    shadowShare: covered > 0 ? shadows / covered : 0,
    distinctColors: buckets.size,
    cornerAlpha: cornerAlpha / 255,
  };
};

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

/** Scene pass only, with the renderer's tone mapping and output encoding, for offscreen readbacks. */
const createCapturePipeline = (
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): InstanceType<typeof ThreeRenderPipeline> => {
  /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder is typed as `any` in `@types/three`. */
  const post = new ThreeRenderPipeline(renderer);
  post.outputNode = pass(scene, camera).getTextureNode('output');
  /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  return post;
};

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
  let pipeline: InstanceType<typeof ThreeRenderPipeline> | undefined;
  let capturePipeline: InstanceType<typeof ThreeRenderPipeline> | undefined;
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
  let requestedSize: { width: number; height: number; pixelRatio: number } | undefined;
  let elapsed = 0;
  let lastFrameTime: number | undefined;
  let framesInWindow = 0;
  let windowElapsed = 0;
  let windowStartedAt: number | undefined;
  let framesPerSecond = 0;
  let adaptiveLevel = 0;
  let slowWindows = 0;
  let headroomWindows = 0;
  let recoveryWindows = adaptiveRecoveryWindows;

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

  const effectiveFrameRate = (): number =>
    adaptiveLevel >= adaptiveLevels.frameRate
      ? Math.min(reducedFrameRate, profile.targetFrameRate)
      : profile.targetFrameRate;

  const applySize = (size: { width: number; height: number; pixelRatio: number }): void => {
    requestedSize = size;
    if (!renderer) {
      pendingSize = size;
      return;
    }
    const pixelRatio =
      adaptiveLevel >= adaptiveLevels.pixelRatio
        ? Math.max(1, size.pixelRatio * reducedPixelRatioScale)
        : size.pixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.width, size.height, false);
    frameCamera(camera, size.width, size.height);
  };

  const setAdaptiveLevel = (level: number): void => {
    const next = Math.max(0, Math.min(adaptiveLevels.frameRate, level));
    if (next === adaptiveLevel) {
      return;
    }
    adaptiveLevel = next;
    slowWindows = 0;
    headroomWindows = 0;
    if (requestedSize) {
      applySize(requestedSize);
    }
    const wantsBloom = profile.bloom && adaptiveLevel < adaptiveLevels.bloom;
    if (renderer && wantsBloom && !pipeline) {
      pipeline = createBloomPipeline(renderer, scene, camera);
    } else if (!wantsBloom && pipeline) {
      pipeline.dispose();
      pipeline = undefined;
    }
  };

  /** Step the cost down while frames run long, and back up, more cautiously each time, once there is headroom. */
  const govern = (averageInterval: number, frameInterval: number): void => {
    if (averageInterval > frameInterval * adaptiveSlowRatio) {
      headroomWindows = 0;
      slowWindows += 1;
      if (slowWindows >= adaptiveSlowWindows && adaptiveLevel < adaptiveLevels.frameRate) {
        setAdaptiveLevel(adaptiveLevel + 1);
        recoveryWindows = Math.min(recoveryWindows * 2, adaptiveRecoveryWindowsLimit);
      }
      return;
    }
    slowWindows = 0;
    if (averageInterval < frameInterval * adaptiveFastRatio && adaptiveLevel > 0) {
      headroomWindows += 1;
      if (headroomWindows >= recoveryWindows) {
        setAdaptiveLevel(adaptiveLevel - 1);
      }
      return;
    }
    headroomWindows = 0;
  };

  const frame = (time: number): void => {
    if (isDisposed() || !isLooping) {
      return;
    }
    const frameInterval = 1000 / effectiveFrameRate();
    if (lastFrameTime !== undefined && time - lastFrameTime < frameInterval - frameCapTolerance) {
      // Under the frame cap this display tick is skipped; the clock catches up on the next drawn frame.
      return;
    }
    const delta = lastFrameTime === undefined ? 0 : Math.min(maximumFrameDelta, Math.max(0, time - lastFrameTime));
    lastFrameTime = time;
    windowStartedAt ??= time;
    advance(delta);
    draw();
    framesInWindow += 1;
    windowElapsed += delta;
    if (windowElapsed >= statisticsWindow) {
      // Statistics use wall-clock time, not the clamped loop deltas, so a struggling device reads truthfully.
      const windowDuration = Math.max(1, time - windowStartedAt);
      framesPerSecond = (framesInWindow * 1000) / windowDuration;
      govern(windowDuration / framesInWindow, frameInterval);
      framesInWindow = 0;
      windowElapsed = 0;
      windowStartedAt = time;
    }
  };

  const startLoop = (): void => {
    if (!renderer || isLooping || isDisposed()) {
      return;
    }
    isLooping = true;
    lastFrameTime = undefined;
    windowStartedAt = undefined;
    framesInWindow = 0;
    windowElapsed = 0;
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
      environment = createMetalMorphEnvironment(renderer, theme, { size: profile.environmentSize });
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
      targetFrameRate: effectiveFrameRate(),
      adaptiveLevel,
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
      // body the canvas shows, whatever the governor has done to bloom; the target is released before the
      // readback awaits.
      capturePipeline ??= createCapturePipeline(renderer, scene, camera);
      const target = new RenderTarget(captureSize, captureSize, { depthBuffer: false });
      try {
        renderer.setRenderTarget(target);
        advance(0);
        capturePipeline.render();
        renderer.setRenderTarget(null);
        const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, captureSize, captureSize);
        return analyseCapture(pixels, resolveBackendInUse(renderer));
      } finally {
        renderer.setRenderTarget(null);
        target.dispose();
      }
    },
    dispose: () => {
      if (isDisposed()) {
        return;
      }
      lifecycle.disposed = true;
      stopLoop();
      pipeline?.dispose();
      capturePipeline?.dispose();
      environment?.dispose();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
    },
  };
};
