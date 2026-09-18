import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Group,
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
import { glassPrismStudios } from '#components/geometry/loader/glass-prism.constants.js';
import { spectralSamples, traceLightSheet } from '#components/geometry/loader/glass-prism-light-field.js';
import { createLightSheetGeometry } from '#components/geometry/loader/glass-prism-light-sheet.js';
import {
  createGlassPrismBodyMaterials,
  createLightRibbonMaterials,
  glassPrismRenderOrder,
} from '#components/geometry/loader/glass-prism-material.node.js';
import type { GlassPrismMaterialOptions } from '#components/geometry/loader/glass-prism-material.node.js';
import {
  getGlassPrismGeometryData,
  getGlassPrismSolid,
  glassPrismRestOrientations,
  glassPrismShapeIds,
  sampleSheetCrossSection,
} from '#components/geometry/loader/glass-prism-shapes.js';
import type {
  GlassPrismGeometryData,
  GlassPrismShapeId,
  MorphFront,
} from '#components/geometry/loader/glass-prism-shapes.js';
import { prefilterStudio } from '#components/geometry/loader/metal-morph-environment.js';
import type { StudioEnvironment } from '#components/geometry/loader/metal-morph-environment.js';
import { metalMorphShapeAttributeName } from '#components/geometry/loader/metal-morph-material.node.js';
import {
  createSeededRandom,
  defaultMorphTiming,
  pickNextShape,
  randomSeed,
  sampleMorphTimeline,
} from '#components/geometry/loader/metal-morph-sequence.js';
import type { MorphPhase, MorphTimingConfig } from '#components/geometry/loader/metal-morph-sequence.js';
import type { Vector3Tuple } from '#components/geometry/loader/metal-morph-shapes.js';
import { captureFrameThrough, resolveBackendInUse } from '#components/geometry/loader/showcase-capture.js';
import type { ShowcaseBackendInUse, ShowcaseFrameCapture } from '#components/geometry/loader/showcase-capture.js';
import { adaptiveLevels, createShowcaseFrameLoop } from '#components/geometry/loader/showcase-frame-loop.js';
import { createBloomPipeline, createCapturePipeline } from '#components/geometry/loader/showcase-post.js';
import type { ShowcaseBloomSettings, ShowcaseRenderPipeline } from '#components/geometry/loader/showcase-post.js';

/**
 * Cost tier. `inline` suits spinners under about 120 px (coarse body, a dozen rays, 30 fps, low-power
 * adapter); `balanced` mid-size surfaces; `high` hero surfaces with bloom, a dense ray bundle and the
 * adaptive governor.
 */
export type GlassPrismLoaderQuality = 'inline' | 'balanced' | 'high';
export type GlassPrismLoaderTheme = 'dark' | 'light';

export type GlassPrismSequenceState = Readonly<{
  phase: MorphPhase;
  currentShape: GlassPrismShapeId;
  nextShape: GlassPrismShapeId;
  /** Forms shown so far, oldest first, bounded to the last {@link historyLimit} entries. */
  history: readonly GlassPrismShapeId[];
  transitionCount: number;
}>;

export type GlassPrismLoaderStatistics = Readonly<{
  backend: ShowcaseBackendInUse;
  framesPerSecond: number;
  vertexCount: number;
  /** Light ribbons drawn in the last frame. */
  ribbonCount: number;
  isBloomEnabled: boolean;
  isPlaying: boolean;
  targetFrameRate: number;
  /** Governor step in effect: 0 none, 1 pixel ratio reduced, 2 bloom off, 3 frame rate halved. */
  adaptiveLevel: number;
  pixelRatio: number;
}>;

export type GlassPrismLoaderOptions = Readonly<{
  canvas: HTMLCanvasElement;
  backend: ResolvedGraphicsBackend;
  theme: GlassPrismLoaderTheme;
  quality?: GlassPrismLoaderQuality;
  /** Deterministic sequencing seed; omitted for a fresh random loop. */
  seed?: number;
  initialShape?: GlassPrismShapeId;
  /** Playback rate multiplier applied to the loop clock and the turn. */
  speed?: number;
  timing?: MorphTimingConfig;
  onSequenceChange?: (state: GlassPrismSequenceState) => void;
  /** Called synchronously after every completed frame; see the metal loader's `onFrame`. */
  onFrame?: (frame: { readonly time: number; readonly canvas: HTMLCanvasElement }) => void;
}>;

export type GlassPrismLoaderController = Readonly<{
  /** Resolves once the renderer, environment and pipelines are warm and the first frame is on the canvas. */
  ready: Promise<void>;
  play: () => void;
  pause: () => void;
  renderOnce: () => void;
  setSize: (size: { readonly width: number; readonly height: number; readonly pixelRatio: number }) => void;
  setTheme: (theme: GlassPrismLoaderTheme) => void;
  setSpeed: (speed: number) => void;
  /** Start flowing to `shape` now, or make it the next target when a morph is already under way. */
  jumpTo: (shape: GlassPrismShapeId) => void;
  getSequenceState: () => GlassPrismSequenceState;
  getStatistics: () => GlassPrismLoaderStatistics;
  /** Generated backend shader source for the body, for backend evidence. */
  getShaderSource: () => Promise<{ readonly vertexShader: string; readonly fragmentShader: string }>;
  captureFrame: () => Promise<ShowcaseFrameCapture>;
  dispose: () => void;
}>;

/** Camera distance in render units. */
const cameraDistance = 5.2;
/** Height of the camera above the sheet, so the fan on the sheet reads in perspective. */
const cameraHeight = 1.45;
/** Half-extent the camera frames along its tighter axis: beam in, body, spectrum out. */
const framedHalfExtent = 1.3;
/** Uniform scale the unit-framed body is drawn at, leaving room for the beam and the fan. */
const bodyScale = 0.64;
/** Half-width of the white beam's ribbons, in render units; see `glass-prism-light-sheet.ts`. */
const incidentHalfWidth = 0.04;
/** Radians per second of the resting turn about the sheet normal. */
const restingTurnRate = 0.3;
/** Additional radians per second at the peak of a flow. */
const flowingTurnRate = 1.1;
/** Amplitude, in radians, and rates of the slow nod that tilts the body through the sheet. */
const nod = { pitch: 0.5, pitchRate: 0.23, roll: 0.34, rollRate: 0.17 } as const;
/**
 * Where the white beam starts, how it drifts across the sheet and how wide it is, in render units. A wide
 * beam meets more of the body at once, so more of its faces contribute to the spectrum.
 */
const beam = { originX: -2.1, drift: 0.3, driftRate: 0.13, width: 0.34 } as const;
/** Distance a ray keeps travelling once it has left the body. */
const rayReach = 3.2;
/** The entry face's reflection is drawn dimmer than its Fresnel share, so the spectrum stays the subject. */
const strayLightScale = 0.3;
/** The split light is drawn brighter than its share of the beam, so the spectrum, not the beam, is the subject. */
const spectrumLift = 2.2;
const historyLimit = 16;
const reducedPixelRatioScale = 0.75;
/** Glass wants a stronger halo than chrome: the traced light is the picture. */
const glassBloom: ShowcaseBloomSettings = { strength: 0.4, radius: 0.5, threshold: 1, alphaGain: 1 };

type QualityProfile = Readonly<{
  detail: number;
  bloom: boolean;
  environmentSize: number;
  targetFrameRate: number;
  /** Parallel rays in the beam. */
  rayCount: number;
  /** Directions sampled around the cross-section. */
  sectionCount: number;
  /** Face interactions a ray may have inside the body. */
  maxInteractions: number;
  /** Radiant weight below which a branch is dropped. */
  minIntensity: number;
  /** Ribbon width multiplier; a spinner needs wider light to show any at all. */
  ribbonWidthScale: number;
  material: Omit<GlassPrismMaterialOptions, 'environment' | 'side'>;
  powerPreference: 'high-performance' | 'low-power';
}>;

const qualityProfiles: Readonly<Record<GlassPrismLoaderQuality, QualityProfile>> = {
  inline: {
    detail: 4,
    bloom: false,
    environmentSize: 64,
    targetFrameRate: 30,
    rayCount: 14,
    sectionCount: 32,
    maxInteractions: 2,
    minIntensity: 0.08,
    ribbonWidthScale: 2.2,
    // A spinner-sized body needs more coverage to read at all.
    material: { perturbNormals: false, filmStrength: 0.3, baseOpacity: 0.3 },
    powerPreference: 'low-power',
  },
  balanced: {
    detail: 5,
    bloom: false,
    environmentSize: 128,
    targetFrameRate: 60,
    rayCount: 32,
    sectionCount: 48,
    maxInteractions: 3,
    minIntensity: 0.05,
    ribbonWidthScale: 1.3,
    material: {},
    powerPreference: 'low-power',
  },
  high: {
    detail: 5,
    bloom: true,
    environmentSize: 256,
    targetFrameRate: 60,
    rayCount: 56,
    sectionCount: 64,
    maxInteractions: 4,
    minIntensity: 0.05,
    ribbonWidthScale: 1,
    material: {},
    powerPreference: 'high-performance',
  },
};

/** Upper bound on ribbons per frame; beyond it the faintest branches are simply not drawn. */
const ribbonCapacityFor = (profile: QualityProfile): number =>
  profile.rayCount * (1 + spectralSamples.length * (1 + profile.maxInteractions * 2));

const buildGeometry = (data: GlassPrismGeometryData): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.directions, 3));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  for (const [index, id] of glassPrismShapeIds.entries()) {
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

const shapeIndex = (shape: GlassPrismShapeId): number => glassPrismShapeIds.indexOf(shape);

const restQuaternions: Readonly<Record<GlassPrismShapeId, Quaternion>> = Object.fromEntries(
  glassPrismShapeIds.map((id) => {
    const { axis, angle } = glassPrismRestOrientations[id];
    return [id, new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(), angle)];
  }),
) as Record<GlassPrismShapeId, Quaternion>;

/**
 * Framework-agnostic driver for the glass prism loader: one node renderer, one glass body that flows between
 * five morphologies, and a light sheet in which a white beam is traced through the body's cross-section into
 * a spectrum, redrawn every frame.
 */
export const createGlassPrismLoader = (options: GlassPrismLoaderOptions): GlassPrismLoaderController => {
  const profile = qualityProfiles[options.quality ?? 'high'];
  const timing = options.timing ?? defaultMorphTiming;
  const random = createSeededRandom(options.seed ?? randomSeed());
  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.5, 40);
  camera.position.set(0, cameraHeight, Math.sqrt(cameraDistance * cameraDistance - cameraHeight * cameraHeight));
  camera.lookAt(0, -0.05, 0);
  const geometryData = getGlassPrismGeometryData(profile.detail);
  const geometry = buildGeometry(geometryData);
  const body = new Group();
  scene.add(body);
  const ribbon = createLightRibbonMaterials();
  // Rays overlap inside the beam; scale their light so the beam's energy does not grow with the ray count.
  // The Gaussian profile averages to about 0.4 of its peak across a ribbon.
  const overlap = (profile.rayCount * incidentHalfWidth * 2) / beam.width;
  ribbon.handles.uGain.value = 1 / Math.max(1, overlap * 0.4);
  const ribbons = createLightSheetGeometry(ribbonCapacityFor(profile), profile.ribbonWidthScale);
  const ribbonMesh = new Mesh(ribbons.geometry, ribbon.light);
  ribbonMesh.frustumCulled = false;
  ribbonMesh.renderOrder = glassPrismRenderOrder.ribbons;
  const inkMesh = new Mesh(ribbons.geometry, ribbon.ink);
  inkMesh.frustumCulled = false;
  inkMesh.renderOrder = glassPrismRenderOrder.ink;
  scene.add(inkMesh, ribbonMesh);

  /** A dark page adds the light; a light page prints it, and gains nothing from a bloom halo. */
  const applyThemeToScene = (): void => {
    inkMesh.visible = theme === 'light';
    ribbonMesh.visible = theme === 'dark';
    materials?.front.setTheme(theme);
    materials?.back.setTheme(theme);
  };

  let renderer: WebGPURenderer | undefined;
  let materials: ReturnType<typeof createGlassPrismBodyMaterials> | undefined;
  let pipeline: ShowcaseRenderPipeline | undefined;
  let capturePipeline: ShowcaseRenderPipeline | undefined;
  let environment: StudioEnvironment | undefined;
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
  let yaw = 0.6;
  let ribbonCount = 0;

  let currentShape: GlassPrismShapeId = options.initialShape ?? glassPrismShapeIds[0];
  let nextShape = currentShape;
  let forcedNext: GlassPrismShapeId | undefined;
  let phase: MorphPhase = 'rest';
  let morphCycle = -1;
  let restCycle = 0;
  let transitionCount = 0;
  const history: GlassPrismShapeId[] = [currentShape];
  const sweepAxis = new Vector3(0, 1, 0);
  const seedOffset = new Vector3();
  const tilt = new Quaternion();
  const turn = new Quaternion();
  const rest = new Quaternion();
  const inverseOrientation = new Quaternion();
  const scratch = new Vector3();
  const up = new Vector3(0, 1, 0);
  const pitchAxis = new Vector3(1, 0, 0);
  const rollAxis = new Vector3(0, 0, 1);
  const pitch = new Quaternion();
  const roll = new Quaternion();

  const sequenceState = (): GlassPrismSequenceState => ({
    phase,
    currentShape,
    nextShape,
    history: [...history],
    transitionCount,
  });

  const notify = (): void => {
    options.onSequenceChange?.(sequenceState());
  };

  const eachHandles = (apply: (handles: NonNullable<typeof materials>['front']['handles']) => void): void => {
    if (!materials) {
      return;
    }
    apply(materials.front.handles);
    apply(materials.back.handles);
  };

  const startTransition = (cycleIndex: number): void => {
    morphCycle = cycleIndex;
    phase = 'morph';
    nextShape = forcedNext ?? pickNextShape(history, glassPrismShapeIds, random);
    forcedNext = undefined;
    randomUnitVector(random, sweepAxis);
    seedOffset.set(random() * 100, random() * 100, random() * 100);
    eachHandles((handles) => {
      handles.uSweepAxis.value.copy(sweepAxis);
      handles.uSeedOffset.value.copy(seedOffset);
      handles.uFromIndex.value = shapeIndex(currentShape);
      handles.uToIndex.value = shapeIndex(nextShape);
    });
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
    eachHandles((handles) => {
      handles.uFromIndex.value = shapeIndex(currentShape);
    });
    notify();
  };

  const toObjectSpace = (direction: Vector3Tuple): Vector3Tuple => {
    scratch.set(direction[0], direction[1], direction[2]).applyQuaternion(inverseOrientation);
    return [scratch.x, scratch.y, scratch.z];
  };

  /** Slice the body with the sheet, trace the beam through the slice and refill the ribbons. */
  const traceSheet = (seconds: number, frontProgress: number, scale: number): void => {
    inverseOrientation.copy(body.quaternion).invert();
    const front: MorphFront | undefined =
      phase === 'morph'
        ? {
            sweepAxis: [sweepAxis.x, sweepAxis.y, sweepAxis.z],
            progress: frontProgress,
            band: profile.material.frontBand ?? 0.3,
            overshoot: profile.material.overshoot ?? 0.1,
          }
        : undefined;
    const polygon = sampleSheetCrossSection({
      from: getGlassPrismSolid(currentShape),
      to: getGlassPrismSolid(nextShape),
      front,
      toObjectSpace,
      scale,
      count: profile.sectionCount,
    });
    const segments = traceLightSheet({
      polygon,
      beam: {
        origin: [beam.originX, beam.drift * Math.sin(seconds * beam.driftRate)],
        direction: [1, 0],
        width: beam.width,
        rayCount: profile.rayCount,
      },
      maxInteractions: profile.maxInteractions,
      minIntensity: profile.minIntensity,
      strayScale: strayLightScale,
      spectrumGain: spectrumLift,
      reach: rayReach,
    });
    ribbonCount = ribbons.update(segments);
  };

  const advance = (deltaMilliseconds: number): void => {
    elapsed += deltaMilliseconds * speed;
    const sample = sampleMorphTimeline(elapsed, timing);
    if (sample.phase === 'morph' && morphCycle !== sample.cycleIndex) {
      startTransition(sample.cycleIndex);
    } else if (sample.phase === 'rest' && restCycle !== sample.cycleIndex) {
      finishTransition(sample.cycleIndex);
    }

    eachHandles((handles) => {
      handles.uProgress.value = sample.frontProgress;
      handles.uMolten.value = sample.molten;
      handles.uRing.value = sample.ring;
      handles.uTime.value = (elapsed / 1000) % 1000;
    });
    const scale = bodyScale * sample.scale;
    body.scale.setScalar(scale);

    const seconds = elapsed / 1000;
    yaw += ((restingTurnRate + sample.spinImpulse * flowingTurnRate) * deltaMilliseconds * speed) / 1000;
    turn.setFromAxisAngle(up, yaw);
    pitch.setFromAxisAngle(pitchAxis, nod.pitch * Math.sin(seconds * nod.pitchRate));
    roll.setFromAxisAngle(rollAxis, nod.roll * Math.sin(seconds * nod.rollRate + 1.3));
    tilt.copy(pitch).multiply(roll);
    // Each form lies in the sheet its own way; a morph carries the body from one pose to the next.
    rest.copy(restQuaternions[currentShape]);
    if (phase === 'morph') {
      rest.slerp(restQuaternions[nextShape], sample.frontProgress);
    }
    body.quaternion.copy(tilt).multiply(turn).multiply(rest).normalize();

    traceSheet(seconds, sample.frontProgress, scale);
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

  const applyAdaptiveLevel = (level: number): void => {
    if (requestedSize) {
      applySize(requestedSize);
    }
    const wantsBloom = profile.bloom && theme === 'dark' && level < adaptiveLevels.bloom;
    if (renderer && wantsBloom && !pipeline) {
      pipeline = createBloomPipeline(renderer, { scene, camera }, glassBloom);
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

  const buildEnvironment = (target: WebGPURenderer): StudioEnvironment =>
    prefilterStudio(target, glassPrismStudios[theme], { size: profile.environmentSize });

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
    environment = buildEnvironment(renderer);
    materials = createGlassPrismBodyMaterials({ ...profile.material, environment: environment.texture });
    const backMesh = new Mesh(geometry, materials.back.material);
    const frontMesh = new Mesh(geometry, materials.front.material);
    backMesh.renderOrder = glassPrismRenderOrder.backFaces;
    frontMesh.renderOrder = glassPrismRenderOrder.frontFaces;
    backMesh.frustumCulled = false;
    frontMesh.frustumCulled = false;
    body.add(backMesh, frontMesh);
    eachHandles((handles) => {
      handles.uFromIndex.value = shapeIndex(currentShape);
      handles.uToIndex.value = shapeIndex(nextShape);
    });
    applyThemeToScene();
    if (profile.bloom && theme === 'dark') {
      pipeline = createBloomPipeline(renderer, { scene, camera }, glassBloom);
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
      environment = buildEnvironment(renderer);
      materials?.front.setEnvironment(environment.texture);
      materials?.back.setEnvironment(environment.texture);
      applyThemeToScene();
      applyAdaptiveLevel(loop.getAdaptiveLevel());
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
      ribbonCount,
      isBloomEnabled: pipeline !== undefined,
      isPlaying: loop.isLooping(),
      targetFrameRate: loop.getTargetFrameRate(),
      adaptiveLevel: loop.getAdaptiveLevel(),
      pixelRatio: renderer?.getPixelRatio() ?? 1,
    }),
    getShaderSource: async () => {
      const frontMesh = body.children.at(-1);
      if (!renderer || !(frontMesh instanceof Mesh)) {
        throw new Error('The glass prism loader renderer is not ready.');
      }
      const source = await getGeneratedShaderSource({ camera, object: frontMesh, renderer, scene });
      if (!source.vertexShader || !source.fragmentShader) {
        throw new Error('Three did not generate both shader stages for the glass prism body.');
      }
      return { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader };
    },
    captureFrame: async () => {
      if (!renderer || !isReady) {
        throw new Error('The glass prism loader renderer is not ready.');
      }
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
      ribbons.dispose();
      ribbon.light.dispose();
      ribbon.ink.dispose();
      materials?.front.material.dispose();
      materials?.back.material.dispose();
      renderer?.dispose();
    },
  };
};
