import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { downloadBlob } from '@taucad/utils/file';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, HalfFloatType, REVISION, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { WebGPUBackend, WebGPURenderer } from 'three/webgpu';
import type { Scene } from 'three';
import { applyCanonicalGltfBounds } from '@taucad/viewer/graphics/three/gltf-world';
import { z } from 'zod';
import type { Geometry } from '@taucad/types';
import { ModelComponentMaterialSummary } from '@taucad/workbench-panes/component-menu/component-action-menu';
import { buildGltfComponentManifest } from '@taucad/viewer/graphics/metadata/gltf-component-manifest';
import { GltfMesh } from '@taucad/viewer/graphics/three/react/gltf-mesh';
import { ThreeProvider } from '@taucad/viewer/graphics/three/three-context';
import { defaultStudioLighting } from '@taucad/viewer/graphics/three/utils/lights.utils';
import type { StudioLightingSettings } from '@taucad/viewer/graphics/three/utils/lights.utils';
import {
  defaultPostProcessingSettings,
  resolveAoRadiusCssPixels,
} from '@taucad/viewer/graphics/three/post-processing-settings';
import type { PostProcessingSettings } from '@taucad/viewer/graphics/three/post-processing-settings';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import {
  GraphicsProvider,
  useCameraRig,
  useGraphics,
  useGraphicsSelector,
  useKinematicsRef,
  useRenderFrame,
} from '@taucad/viewer/hooks/use-graphics';
import { ThemeProvider } from '#hooks/use-theme.js';
import { createCameraCompilationTiming } from '#routes/[__e2e].onshape-render-profile/camera-compilation-timing.js';
import { createNodeFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-node-timing.js';
import { correlateGpuFrames, createFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';
import type { FrameGpuTimer, GpuPassRange } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';
import { getEnvironment } from '#environment.config.js';
import {
  advanceBenchmarkPlayback,
  prepareBenchmarkPlayback,
  sampleBenchmarkPlayback,
  finishBenchmarkPlayback,
} from '#routes/[__e2e].onshape-render-profile/benchmark-playback.js';
import type { PlaybackMeasurement } from '#routes/[__e2e].onshape-render-profile/benchmark-playback.js';

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router route control-flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const vectorSchema = z.tuple([z.number(), z.number(), z.number()]);
const fixtureSchema = z.looseObject({
  id: z.string().regex(/^[\da-z-]+$/),
  label: z.string(),
  file: z.string().regex(/^fixtures\/[\w.-]+\.glb$/),
  sha256: z.string(),
  bounds: z.object({ min: vectorSchema, max: vectorSchema }),
  stats: z.record(z.string(), z.number()),
  materials: z.array(z.record(z.string(), z.unknown())),
});
const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  fixtures: z.array(fixtureSchema),
});
type Fixture = z.infer<typeof fixtureSchema>;
const views = {
  iso: [1, -1, 1],
  front: [0, -1, 0],
  left: [-1, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  underside: [
    Math.cos(Math.asin(1 / Math.sqrt(3)) - (5 * Math.PI) / 12) / Math.sqrt(2),
    -Math.cos(Math.asin(1 / Math.sqrt(3)) - (5 * Math.PI) / 12) / Math.sqrt(2),
    Math.sin(Math.asin(1 / Math.sqrt(3)) - (5 * Math.PI) / 12),
  ],
  back: [0, 1, 0],
} as const;
type ViewName = keyof typeof views;
type CameraSettings = {
  view: ViewName;
  span: number;
  fov: number;
  revision: number;
};
type BenchmarkKind = 'orbit' | 'projection' | 'playback' | 'combined';
type MeasurementMode = 'natural' | 'gpu';
type FrameSample = {
  gpuQueryStarted: boolean;
  frameInterval: number;
  cpuSubmission: number;
  calls: number;
  triangles: number;
  lines: number;
  projectionSwitch: boolean;
  nodeCompilation?: ReturnType<ReturnType<typeof createCameraCompilationTiming>['read']>;
  cameraWorld: number[];
  cameraProjection: number[];
  playbackPose: Array<{ unitId: string; time: number; coordinates: Record<string, number> }>;
};

async function compressCapture(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const compressed = new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
  );
  return uint8ArrayToBase64(compressed);
}

/**
 * Read the premultiplied sRGB drawing buffer before canvas PNG conversion unpremultiplies and
 * requantizes it. These are the bytes the compositor shows: `rgb + background × (1 − a)`.
 */
async function captureFramebuffer(renderer: WebGLRenderer): Promise<Record<string, unknown>> {
  const context = renderer.getContext();
  const { drawingBufferWidth: width, drawingBufferHeight: height } = context;
  const pixels = new Uint8Array(width * height * 4);
  context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
  const topDown = new Uint8Array(pixels.length);
  for (let row = 0; row < height; row++) {
    topDown.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), (height - row - 1) * width * 4);
  }
  return {
    width,
    height,
    format: 'rgba8-srgb-premultiplied-framebuffer',
    compression: 'gzip',
    data: await compressCapture(topDown),
  };
}

/** Export the actual filtered lighting texture without changing its pixels or the live scene. */
async function captureEnvironment(renderer: WebGLRenderer, scene: Scene): Promise<Record<string, unknown>> {
  const source = scene.environment;
  if (!source || source.type !== HalfFloatType) {
    throw new Error('Select a filtered room environment before exporting lighting.');
  }
  const { width, height } = source.image as { width: number; height: number };
  const target = new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: false });
  try {
    renderer.initRenderTarget(target);
    renderer.copyTextureToTexture(source, target.texture);
    const pixels = new Uint16Array(width * height * 4);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, pixels);
    const red = new Uint16Array(width * height);
    for (let index = 0; index < red.length; index++) {
      const start = index * 4;
      if (pixels[start] !== pixels[start + 1] || pixels[start] !== pixels[start + 2]) {
        throw new Error('The neutral room must have equal RGB channels.');
      }
      red[index] = pixels[start]!;
    }
    return {
      width,
      height,
      format: 'r16float-le',
      compression: 'gzip',
      data: await compressCapture(new Uint8Array(red.buffer)),
      threeRevision: REVISION,
    };
  } finally {
    target.dispose();
  }
}

function summarize(values: number[]): {
  median: number;
  p95: number;
  p99: number;
  mad: number;
  samples: number;
} {
  const ordered = [...values].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  return {
    median,
    p95: ordered[Math.floor(ordered.length * 0.95)] ?? 0,
    p99: ordered[Math.floor(ordered.length * 0.99)] ?? 0,
    mad: deviations[Math.floor(values.length / 2)] ?? 0,
    samples: values.length,
  };
}

/** Measures the production frame, including post-processing and overlays. */
function CalibrationProbe({
  fixture,
  cameraSettings,
  pixelRatio,
  benchmark,
  benchmarkKind,
  measurementMode,
  capture,
  metadata,
  onReport,
}: {
  readonly fixture: Fixture;
  readonly cameraSettings: CameraSettings;
  readonly pixelRatio: number;
  readonly benchmark: number;
  readonly benchmarkKind: BenchmarkKind;
  readonly measurementMode: MeasurementMode;
  readonly capture: { sequence: number; name: string };
  readonly metadata: Record<string, unknown> & { post: Partial<PostProcessingSettings> };
  readonly onReport: (report: Record<string, unknown>) => void;
}): undefined {
  const { gl, scene, invalidate, size, setDpr } = useThree();
  const gpuTimer = useRef<FrameGpuTimer | undefined>(undefined);
  const startup = useRef({
    mounted: performance.now(),
    firstReady: undefined as number | undefined,
    firstReadyCpu: undefined as number | undefined,
  });
  const compilationTiming = useRef<ReturnType<typeof createCameraCompilationTiming> | undefined>(undefined);
  useEffect(() => {
    if (!(gl instanceof WebGPURenderer) || !new URLSearchParams(location.search).has('cameraCompile')) {
      return;
    }
    const timing = createCameraCompilationTiming(gl, new URLSearchParams(location.search).has('cameraSources'));
    compilationTiming.current = timing;
    return () => {
      timing.dispose();
      compilationTiming.current = undefined;
    };
  }, [gl]);
  const rig = useCameraRig();
  const graphics = useGraphics();
  const kinematicsRef = useKinematicsRef();
  const viewerBounds = useMemo(
    () => applyCanonicalGltfBounds(new Box3(new Vector3(...fixture.bounds.min), new Vector3(...fixture.bounds.max))),
    [fixture],
  );
  const renderFrame = useRenderFrame();
  const presented = useGraphicsSelector((state) => state.context.gltfPresentation.presentedRevision);
  const requested = useGraphicsSelector((state) => state.context.gltfPresentation.requestedRevision);
  const sectionCuts = useGraphicsSelector((snapshot) => snapshot.context.sectionCuts);
  const committedSectionCuts = useGraphicsSelector((snapshot) => snapshot.context.committedSectionCuts);
  /* What the probe is asked to measure. The frame loop restarts when this changes. */
  const measurement = useMemo(
    () => ({
      benchmark,
      cameraSettings,
      capture,
      metadata,
      pixelRatio,
      presented,
      sectionCuts,
      committedSectionCuts,
      measurementMode,
      width: size.width,
      height: size.height,
    }),
    [
      benchmark,
      cameraSettings,
      capture,
      metadata,
      pixelRatio,
      presented,
      sectionCuts,
      committedSectionCuts,
      measurementMode,
      size.width,
      size.height,
    ],
  );
  const state = useRef({
    measurement,
    measured: undefined as typeof measurement | undefined,
    frame: 0,
    pendingFrames: 0,
    projectionSwitch: false,
    start: 0,
    previous: 0,
    appliedCamera: -1,
    benchmark,
    capture: capture.sequence,
    // A new renderer inherits completed capture requests; only a new sequence requests another capture.
    completedCapture: capture.sequence,
    interruptions: [] as string[],
    samples: [] as FrameSample[],
    gpuSamples: [] as number[],
    gpuPassRanges: [] as GpuPassRange[][],
    benchmarkResult: undefined as Record<string, unknown> | undefined,
    saved: undefined as unknown,
    gpuPendingPeak: 0,
    gpuQueryStarted: false,
    drainStarted: 0,
    playbackStarted: false,
    playbackMeasurements: [] as PlaybackMeasurement[],
    hiddenFrames: 0,
    unfocusedFrames: 0,
  });
  const report = useCallback((): Record<string, unknown> => {
    const section = graphics.getSnapshot().context;
    const sectionReady =
      !section.isSectionViewActive ||
      JSON.stringify(section.sectionCuts) === JSON.stringify(section.committedSectionCuts);
    const capCompleteness: unknown[] = [];
    scene.traverse((object) => {
      if (object.userData['sectionCapCompleteness']) {
        capCompleteness.push(object.userData['sectionCapCompleteness']);
      }
    });
    const context = gl instanceof WebGLRenderer ? gl.getContext() : undefined;
    const debug = context?.getExtension('WEBGL_debug_renderer_info');
    const nodeRenderer = gl instanceof WebGPURenderer ? gl : undefined;
    const nativeGpu = nodeRenderer?.backend instanceof WebGPUBackend ? nodeRenderer.backend : undefined;
    const radiusCssPixels = resolveAoRadiusCssPixels(
      metadata.post.radiusCssPixels ?? defaultPostProcessingSettings.radiusCssPixels,
      { width: size.width, height: size.height, dpr: gl.getPixelRatio() },
    );
    return {
      ...metadata,
      startup: { ...startup.current },
      geometryHash: fixture.sha256,
      section: {
        active: section.isSectionViewActive,
        requested: section.sectionCuts,
        committed: section.committedSectionCuts,
        ready: sectionReady,
        caps: capCompleteness,
      },
      ready:
        state.current.appliedCamera === cameraSettings.revision &&
        requested === presented &&
        gl.getPixelRatio() === pixelRatio &&
        sectionReady,
      fixture: { id: fixture.id, sha256: fixture.sha256, stats: fixture.stats },
      threeRevision: REVISION,
      buildId: typeof tauBuildId === 'number' ? String(tauBuildId) : undefined,
      userAgent: navigator.userAgent,
      viewport: size,
      drawingBuffer: { width: gl.domElement.width, height: gl.domElement.height },
      documentState: { visibility: document.visibilityState, focused: document.hasFocus() },
      screen: { width: screen.width, height: screen.height, devicePixelRatio: globalThis.devicePixelRatio },
      measurementMode,
      pixelRatio: gl.getPixelRatio(),
      aoRadius: { cssPixels: radiusCssPixels, physicalPixels: radiusCssPixels * gl.getPixelRatio() },
      exposure: gl.toneMappingExposure,
      renderer: debug ? context?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      effectiveBackend: context ? 'webgl' : nativeGpu ? 'webgpu' : 'webgl2-node',
      webgpuCapabilities: nodeRenderer
        ? {
            samples: nodeRenderer.samples,
            canvasDepth: nodeRenderer.depth,
            canvasStencil: nodeRenderer.stencil,
            canvasDepthTexture: {
              width: nodeRenderer.getCanvasTarget().depthTexture.image.width,
              height: nodeRenderer.getCanvasTarget().depthTexture.image.height,
              type: nodeRenderer.getCanvasTarget().depthTexture.type,
              format: nodeRenderer.getCanvasTarget().depthTexture.format,
            },
            native: Boolean(nativeGpu),
            compatibilityMode: nativeGpu && 'compatibilityMode' in nativeGpu ? nativeGpu.compatibilityMode : undefined,
          }
        : undefined,
      gpuTimer:
        measurementMode === 'natural' ? 'disabled-for-natural-cadence' : (gpuTimer.current?.support ?? 'unavailable'),
      webglCapabilities: context
        ? {
            maxSamples:
              context instanceof WebGL2RenderingContext ? Number(context.getParameter(context.MAX_SAMPLES)) : 0,
            multisampledRenderToTexture: Boolean(context.getExtension('WEBGL_multisampled_render_to_texture')),
          }
        : undefined,
      timingDefinitions:
        'Frame interval is start-to-start render callback cadence, not independently confirmed display presentation. CPU submission covers frame callbacks; Native GPU diagnostics retain overlapping render-pass ranges: gpuElapsed is their non-additive sum, gpuPassSpan is earliest start to latest end. They exclude commands outside those boundaries and presentation. WebGL queries enclose the submitted frame. They can perturb scheduling and include preemption; they are not exclusive utilization or uninstrumented headroom.',
      benchmark: state.current.benchmarkResult,
      benchmarkSequence: benchmark,
      benchmarkRunning: benchmark !== state.current.benchmark,
      saved: state.current.saved,
      completedCaptureSequence: state.current.completedCapture,
      camera: rig.readState(),
      geometryBounds: rig.actorRef.getSnapshot().context.view.bounds,
      renderFrame,
      memory: { ...gl.info.memory },
      programs: gl.info.programs?.length,
      render: { ...gl.info.render },
    };
  }, [
    benchmark,
    cameraSettings.revision,
    fixture,
    gl,
    metadata,
    graphics,
    scene,
    measurementMode,
    pixelRatio,
    presented,
    renderFrame,
    requested,
    rig,
    size,
  ]);
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previous;
    };
  }, [gl]);
  useEffect(() => {
    // A new renderer restarts the measurement on its own GPU timer.
    gpuTimer.current =
      measurementMode === 'gpu'
        ? gl instanceof WebGLRenderer
          ? createFrameGpuTimer(gl)
          : createNodeFrameGpuTimer(gl)
        : undefined;
    state.current.measured = undefined;
    return () => {
      gpuTimer.current?.dispose();
      gpuTimer.current = undefined;
    };
  }, [gl, measurementMode]);
  useEffect(() => {
    state.current.measurement = measurement;
    setDpr(measurement.pixelRatio);
    invalidate();
  }, [invalidate, measurement, setDpr]);
  useEffect(() => {
    const recordInterruption = (event: Event): void => {
      const { current } = state;
      if (
        current.measurement.benchmark !== current.benchmark &&
        (event.type === 'blur' || document.visibilityState !== 'visible')
      ) {
        current.interruptions.push(event.type);
      }
    };
    document.addEventListener('visibilitychange', recordInterruption);
    window.addEventListener('blur', recordInterruption);
    return () => {
      document.removeEventListener('visibilitychange', recordInterruption);
      window.removeEventListener('blur', recordInterruption);
    };
  }, []);
  useFrame(() => {
    const { current } = state;
    const { measurement: next, measured } = current;
    if (next !== measured) {
      const configurationChanged =
        next.metadata !== measured?.metadata ||
        next.cameraSettings !== measured.cameraSettings ||
        next.pixelRatio !== measured.pixelRatio ||
        next.width !== measured.width ||
        next.height !== measured.height ||
        next.measurementMode !== measured.measurementMode ||
        next.presented !== measured.presented;
      if (next.benchmark !== measured?.benchmark || configurationChanged) {
        // Resize/settings changes restart the full sample window, including outstanding queries.
        gpuTimer.current?.dispose();
        gpuTimer.current =
          measurementMode === 'gpu'
            ? gl instanceof WebGLRenderer
              ? createFrameGpuTimer(gl)
              : createNodeFrameGpuTimer(gl)
            : undefined;
        current.benchmarkResult = undefined;
        current.samples = [];
        current.gpuSamples = [];
        current.gpuPassRanges = [];
        current.gpuPendingPeak = 0;
        current.drainStarted = 0;
        current.playbackStarted = false;
        current.playbackMeasurements = [];
        current.hiddenFrames = 0;
        current.unfocusedFrames = 0;
        current.interruptions = [];
        current.appliedCamera = -1;
        current.saved = undefined;
      }
      current.frame = 0;
      current.pendingFrames = 0;
      current.measured = next;
    }
    current.gpuQueryStarted = false;
    current.start = performance.now();
    compilationTiming.current?.reset();
    current.projectionSwitch = false;
    // Renderer remounts restore the production DPR; keep diagnostic captures at their selected DPR.
    if (gl.getPixelRatio() !== pixelRatio) {
      setDpr(pixelRatio);
      invalidate();
      return;
    }
    gl.info.reset();
    if (requested !== presented) {
      return;
    }
    const { bounds } = rig.actorRef.getSnapshot().context.view;
    if (
      !([0, 1, 2] as const).every(
        (axis) =>
          Math.abs(bounds.min[axis] - viewerBounds.min.getComponent(axis)) < cameraSettings.span * 0.001 &&
          Math.abs(bounds.max[axis] - viewerBounds.max.getComponent(axis)) < cameraSettings.span * 0.001,
      )
    ) {
      return;
    }
    if (current.appliedCamera !== cameraSettings.revision) {
      const target = viewerBounds.getCenter(new Vector3()).toArray();
      rig.actorRef.send({
        type: 'setVerticalFieldOfView',
        verticalFieldOfView: cameraSettings.fov,
      });
      rig.actorRef.send({
        type: 'setView',
        target,
        direction: views[cameraSettings.view],
        up: cameraSettings.view === 'top' ? [0, 1, 0] : cameraSettings.view === 'bottom' ? [0, -1, 0] : [0, 0, 1],
        verticalSpan: cameraSettings.span,
      });
      current.appliedCamera = cameraSettings.revision;
      current.frame = 0;
    }
    if (benchmark !== current.benchmark) {
      if (current.frame >= 30 && current.samples.length < 300) {
        current.gpuQueryStarted = gpuTimer.current?.begin() ?? false;
      }
      if (!current.playbackStarted) {
        const withPlayback = benchmarkKind === 'playback' || benchmarkKind === 'combined';
        current.playbackMeasurements = prepareBenchmarkPlayback(kinematicsRef, withPlayback, 'fixed-step');
        if (withPlayback && current.playbackMeasurements.length === 0) {
          current.benchmark = benchmark;
          current.benchmarkResult = {
            kind: benchmarkKind,
            validWorkload: false,
            reason: 'No playable mechanism unit.',
          };
          onReport(report());
          return;
        }
        current.playbackStarted = true;
      }
      advanceBenchmarkPlayback(kinematicsRef, current.playbackMeasurements, Math.min(current.frame, 329));
      if (benchmarkKind === 'orbit' || benchmarkKind === 'combined') {
        const angle = (Math.min(current.frame, 329) * Math.PI) / 150;
        const { view } = rig.actorRef.getSnapshot().context;
        rig.actorRef.send({
          ...view,
          type: 'setView',
          direction: [Math.cos(angle), Math.sin(angle), 0.65],
        });
      } else if (
        benchmarkKind === 'projection' &&
        current.frame >= 30 &&
        current.frame < 330 &&
        (current.frame - 30) % 60 === 0
      ) {
        current.projectionSwitch = true;
        rig.actorRef.send({
          type: 'setVerticalFieldOfView',
          verticalFieldOfView: (current.frame - 30) % 120 === 0 ? 35 : 0,
        });
      }
    }
  }, -100);
  useFrame(() => {
    const { current } = state;
    const now = performance.now();
    if (
      startup.current.firstReady === undefined &&
      requested === presented &&
      state.current.appliedCamera === cameraSettings.revision
    ) {
      startup.current.firstReady = now - startup.current.mounted;
      startup.current.firstReadyCpu = now - state.current.start;
    }
    gpuTimer.current?.end();
    const gpu = gpuTimer.current?.poll();
    if (benchmark !== current.benchmark && gpu) {
      current.gpuSamples.push(...gpu.milliseconds);
      current.gpuPassRanges.push(...(gpu.passRanges ?? []));
    }
    current.gpuPendingPeak = Math.max(current.gpuPendingPeak, gpu?.pending ?? 0);
    if (current.appliedCamera !== cameraSettings.revision || requested !== presented) {
      current.pendingFrames += 1;
      if (current.pendingFrames === 60) {
        onReport({
          ...report(),
          pending: 'Waiting for geometry bounds and presentation.',
        });
      }
      if (current.pendingFrames < 120) {
        invalidate();
      }
      return;
    }
    current.frame += 1;
    if (benchmark !== current.benchmark) {
      if (current.frame > 30 && current.samples.length < 300) {
        sampleBenchmarkPlayback(kinematicsRef, current.playbackMeasurements);
        current.samples.push({
          gpuQueryStarted: current.gpuQueryStarted,
          cameraWorld: rig.activeCamera.matrixWorld.toArray(),
          cameraProjection: rig.activeCamera.projectionMatrix.toArray(),
          playbackPose: current.playbackMeasurements.map(({ unitId }) => {
            const unit = kinematicsRef.getSnapshot().context.unitsById[unitId]!;
            return { unitId, time: unit.playback.time, coordinates: { ...unit.coordinates } };
          }),
          frameInterval: current.start - current.previous,
          projectionSwitch: current.projectionSwitch,
          nodeCompilation: compilationTiming.current?.read(),
          cpuSubmission: now - current.start,
          // WebGPU's `calls` is lifetime render submissions; only `drawCalls` resets per frame.
          calls:
            'drawCalls' in gl.info.render && typeof gl.info.render.drawCalls === 'number'
              ? gl.info.render.drawCalls
              : gl.info.render.calls,
          triangles: gl.info.render.triangles,
          lines: gl.info.render.lines,
        });
      }
      current.hiddenFrames += Number(document.visibilityState !== 'visible');
      current.unfocusedFrames += Number(!document.hasFocus());
      if (current.samples.length === 300 && current.drainStarted === 0) {
        current.drainStarted = now;
      }
      if (current.samples.length === 300 && ((gpu?.pending ?? 0) === 0 || now - current.drainStarted > 5000)) {
        current.benchmark = benchmark;
        const playback = finishBenchmarkPlayback(kinematicsRef, current.playbackMeasurements, current.samples.length);
        current.benchmarkResult = {
          kind: benchmarkKind,
          playback,
          validWorkload:
            benchmarkKind === 'playback' || benchmarkKind === 'combined'
              ? playback.length > 0 && playback.every((unit) => unit.valid)
              : true,
          sequence: benchmark,
          measurementMode,
          poseSchedule: { kind: 'fixed-step', secondsPerFrame: 1 / 60, firstFrame: 30, lastFrame: 329 },
          validForeground:
            current.hiddenFrames === 0 && current.unfocusedFrames === 0 && current.interruptions.length === 0,
          interruptions: current.interruptions,
          hiddenFrames: current.hiddenFrames,
          unfocusedFrames: current.unfocusedFrames,
          gpuPendingAtEnd: gpu?.pending ?? 0,
          cadenceFps:
            (current.samples.length * 1000) / current.samples.reduce((sum, sample) => sum + sample.frameInterval, 0),
          framesOver25ms: current.samples.filter((sample) => sample.frameInterval > 25).length,
          framesOver50ms: current.samples.filter((sample) => sample.frameInterval > 50).length,
          kinematics: Object.entries(kinematicsRef.getSnapshot().context.unitsById).map(([unitId, unit]) => ({
            unitId,
            revision: unit.revision,
            playback: unit.playback,
            links: Object.keys(unit.mechanism?.links ?? {}).length,
          })),
          projectionSwitchFrames: current.samples.filter((sample) => sample.projectionSwitch),
          frameInterval: summarize(current.samples.map((sample) => sample.frameInterval)),
          cpuSubmission: summarize(current.samples.map((sample) => sample.cpuSubmission)),
          gpuStatus:
            measurementMode === 'natural'
              ? 'disabled'
              : gpuTimer.current
                ? (gpu?.pending ?? 0) > 0
                  ? 'timeout'
                  : (gpu?.failedSamples ?? 0) > 0
                    ? 'invalid-samples-discarded'
                    : (gpu?.disjointDiscarded ?? 0) > 0
                      ? 'disjoint-samples-discarded'
                      : current.gpuSamples.length > 0
                        ? 'available'
                        : 'no-valid-samples'
                : 'unsupported',
          gpuElapsed: current.gpuSamples.length > 0 ? summarize(current.gpuSamples) : undefined,
          gpuElapsedSamples: [...current.gpuSamples],
          gpuElapsedFrameIndices: correlateGpuFrames(current.samples, {
            samples: current.gpuSamples.length,
            pending: gpu?.pending ?? 0,
            disjointDiscarded: gpu?.disjointDiscarded ?? 0,
            failedSamples: gpu?.failedSamples,
          }),
          gpuPassSpanFrameIndices: correlateGpuFrames(current.samples, {
            samples: current.gpuPassRanges.length,
            pending: gpu?.pending ?? 0,
            disjointDiscarded: gpu?.disjointDiscarded ?? 0,
            failedSamples: gpu?.failedSamples,
          }),
          gpuPassSpanSamples: current.gpuPassRanges.map((passes) => Math.max(...passes.map((pass) => pass.end))),
          gpuPassRanges: current.gpuPassRanges.slice(0, 16),
          gpuPassSpan:
            current.gpuPassRanges.length > 0
              ? summarize(current.gpuPassRanges.map((passes) => Math.max(...passes.map((pass) => pass.end))))
              : undefined,
          gpuPendingPeak: current.gpuPendingPeak,
          gpuDrainMilliseconds: now - current.drainStarted,
          gpuDisjointDiscarded: gpu?.disjointDiscarded ?? 0,
          gpuFailedSamples: gpu?.failedSamples ?? 0,
          draws: summarize(current.samples.map((sample) => sample.calls)),
          // Report both diagnostics without silently choosing a new product acceptance target.
          frameBudgets: [60, 120].map((fps) => ({
            fps,
            milliseconds: 1000 / fps,
            framesOverBudget: current.samples.filter((sample) => sample.frameInterval > 1000 / fps).length,
          })),
          samples: current.samples,
        };
        for (const unitId of Object.keys(kinematicsRef.getSnapshot().context.unitsById)) {
          kinematicsRef.send({ type: 'pause', unitId });
        }
        onReport(report());
      } else {
        invalidate();
      }
    }
    current.previous = current.start;
    if (capture.sequence !== current.capture && current.frame > 8 && requested === presented) {
      const section = graphics.getSnapshot().context;
      if (
        section.isSectionViewActive &&
        JSON.stringify(section.sectionCuts) !== JSON.stringify(section.committedSectionCuts)
      ) {
        invalidate();
        return;
      }
      current.capture = capture.sequence;
      const captureMetadata = report();
      const saveCapture = async (): Promise<void> => {
        try {
          const image = gl.domElement.toDataURL('image/png');
          const framebufferCapture = gl instanceof WebGLRenderer ? await captureFramebuffer(gl) : undefined;
          const environmentCapture =
            capture.name === 'lighting-assets' && gl instanceof WebGLRenderer
              ? await captureEnvironment(gl, scene)
              : undefined;
          if (globalThis.location.protocol === 'app:') {
            // The packaged app has no calibration HTTP server. Use the same
            // local download owner as ordinary exports; no data leaves the app.
            const bytes = base64ToUint8Array(image.split(',')[1]!);
            downloadBlob(new Blob([bytes], { type: 'image/png' }), `${capture.name}.png`);
            current.saved = { downloadRequested: capture.name };
            current.completedCapture = capture.sequence;
            onReport({ ...captureMetadata, saved: current.saved, completedCaptureSequence: capture.sequence });
            return;
          }
          const response = await fetch('/calibration-capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: capture.name,
              image,
              metadata: { ...captureMetadata, environmentCapture, framebufferCapture },
            }),
          });
          if (!response.ok) {
            throw new Error(await response.text());
          }
          current.saved = await response.json();
          current.completedCapture = capture.sequence;
          onReport({ ...captureMetadata, saved: current.saved, completedCaptureSequence: capture.sequence });
        } catch (error) {
          current.completedCapture = capture.sequence;
          onReport({ ...captureMetadata, error: String(error), completedCaptureSequence: capture.sequence });
        }
      };
      void saveCapture();
    }
    if (current.frame < 12) {
      invalidate();
    }
    if (current.frame === 12) {
      onReport(report());
    }
  }, 4);
  return undefined;
}

const CalibrationCanvas = memo(function CalibrationCanvas({
  geometry,
  fixture,
  graphicsRef,
  cameraSettings,
  pixelRatio,
  lighting,
  post,
  edges,
  matcap,
  overlay,
  benchmark,
  benchmarkKind,
  measurementMode,
  capture,
  onReport,
}: {
  readonly geometry: Geometry;
  readonly fixture: Fixture;
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly cameraSettings: CameraSettings;
  readonly pixelRatio: number;
  readonly lighting: StudioLightingSettings;
  readonly post: Partial<PostProcessingSettings>;
  readonly edges: boolean;
  readonly matcap: boolean;
  readonly overlay: boolean;
  readonly benchmark: number;
  readonly benchmarkKind: BenchmarkKind;
  readonly measurementMode: MeasurementMode;
  readonly capture: { sequence: number; name: string };
  readonly onReport: (report: Record<string, unknown>) => void;
}): React.JSX.Element {
  const requested = useSelector(graphicsRef, (snapshot) => snapshot.context.gltfPresentation.requestedRevision);
  const backend = useSelector(graphicsRef, (snapshot) => snapshot.context.resolvedGraphicsBackend);
  const stageOptions = useMemo(() => ({ lighting }), [lighting]);
  const metadata = useMemo(
    () => ({ lighting, post, edges, matcap, overlay, backend }),
    [lighting, post, edges, matcap, overlay, backend],
  );
  useEffect(() => {
    if (geometry.format === 'gltf') {
      graphicsRef.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'model/gltf-binary', content: geometry.content },
        hash: geometry.hash,
      });
    } else {
      graphicsRef.send({ type: 'clearArtifact' });
    }
  }, [geometry, graphicsRef]);
  return (
    <GraphicsProvider graphicsRef={graphicsRef} initialVerticalFieldOfView={0}>
      <ThreeProvider
        graphicsBackend={backend}
        upDirection='z'
        enablePan
        enableGizmo={new URLSearchParams(location.search).has('gizmo')}
        enableZoom
        enableGrid={overlay}
        enableAxes={overlay}
        stageOptions={stageOptions}
        postProcessingSettings={post}
      >
        {geometry.format === 'gltf' ? (
          <GltfMesh
            gltfFile={geometry.content}
            geometryHash={geometry.hash}
            presentationRevision={requested}
            enableLines={edges}
            enableMatcap={matcap}
            enableSurfaces
          />
        ) : null}
        <CalibrationProbe
          key={fixture.id}
          fixture={fixture}
          cameraSettings={cameraSettings}
          pixelRatio={pixelRatio}
          benchmark={benchmark}
          benchmarkKind={benchmarkKind}
          measurementMode={measurementMode}
          capture={capture}
          metadata={metadata}
          onReport={onReport}
        />
      </ThreeProvider>
    </GraphicsProvider>
  );
});

export function RenderingProfile(): React.JSX.Element {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- SSR has no location despite the DOM declaration.
  const packagedCapture = globalThis.location?.protocol === 'app:';
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixtureId, setFixtureId] = useState('f6-authored-planetary');
  const [viewerRevision, setViewerRevision] = useState(0);
  const [geometry, setGeometry] = useState<Geometry>();
  const [showMaterials, setShowMaterials] = useState(false);
  const componentManifest = useMemo(
    () => (showMaterials && geometry?.format === 'gltf' ? buildGltfComponentManifest(geometry.content) : undefined),
    [geometry, showMaterials],
  );
  const [error, setError] = useState('');
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    view: 'iso',
    span: 0.22,
    fov: 0,
    revision: 0,
  });
  const [lighting, setLighting] = useState(defaultStudioLighting);
  const [post, setPost] = useState<Partial<PostProcessingSettings>>(defaultPostProcessingSettings);
  const [pixelRatio, setPixelRatio] = useState(Math.min(Number(globalThis.devicePixelRatio) || 1, 2));
  const [edges, setEdges] = useState(true);
  const [matcap, setMatcap] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [benchmark, setBenchmark] = useState(0);
  const [benchmarkKind, setBenchmarkKind] = useState<BenchmarkKind>('orbit');
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>('natural');
  const [viewportWidth, setViewportWidth] = useState(1276);
  const [viewportHeight, setViewportHeight] = useState(798);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [captureName, setCaptureName] = useState('baseline');
  const [capture, setCapture] = useState({ sequence: 0, name: 'baseline' });
  const [report, setReport] = useState<Record<string, unknown>>({});
  const graphicsRef = useActorRef(graphicsMachine, {
    input: {
      ...defaultGraphicsSettings,
      enablePostProcessing: true,
      enableMatcap: false,
      upDirection: 'z',
      graphicsBackend: 'webgl',
    },
  });
  const backend = useSelector(graphicsRef, (snapshot) => snapshot.context.resolvedGraphicsBackend);
  const fixture = fixtures.find((entry) => entry.id === fixtureId) ?? fixtures[0];
  const isCapturing = capture.sequence !== (report['completedCaptureSequence'] ?? 0);
  const captureReady =
    !isCapturing &&
    Boolean(
      fixture?.sha256 &&
      geometry?.hash === fixture.sha256 &&
      report['geometryHash'] === fixture.sha256 &&
      report['backend'] === backend &&
      report['ready'],
    );
  useEffect(() => {
    const controller = new AbortController();
    const loadCatalog = async (): Promise<void> => {
      try {
        const response = await fetch('/calibration-data/catalog.json', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const catalog = catalogSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setFixtures(catalog.fixtures);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(String(error));
        }
      }
    };
    void loadCatalog();
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!fixture) {
      return;
    }
    const controller = new AbortController();
    const loadFixture = async (): Promise<void> => {
      try {
        const response = await fetch(`/calibration-data/${fixture.file}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const content = new Uint8Array(await response.arrayBuffer());
        if (controller.signal.aborted) {
          return;
        }
        setGeometry({ format: 'gltf', content, hash: fixture.sha256 });
        const span =
          Math.max(...([0, 1, 2] as const).map((axis) => fixture.bounds.max[axis] - fixture.bounds.min[axis])) * 1.3;
        setCameraSettings((previous) => ({
          ...previous,
          span,
          revision: previous.revision + 1,
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(String(error));
        }
      }
    };
    void loadFixture();
    return () => {
      controller.abort();
    };
  }, [fixture]);
  const onReport = useCallback((next: Record<string, unknown>) => {
    setReport(next);
    if (typeof next['benchmarkRunning'] === 'boolean') {
      setIsBenchmarking(next['benchmarkRunning']);
    }
  }, []);
  return (
    <ThemeProvider specifiedTheme='light' themeAction='/action/set-theme'>
      <main className='fixed inset-0 overflow-auto bg-background text-foreground'>
        <aside className='absolute top-0 left-0 h-screen w-[440px] space-y-3 overflow-auto bg-muted p-4 text-sm [&_button]:rounded [&_button]:border [&_button]:bg-background [&_button]:px-2 [&_button]:py-1 [&_input]:w-24 [&_input]:border [&_input]:bg-background [&_select]:border [&_select]:bg-background'>
          <h1 className='text-lg font-semibold'>PBR rendering calibration</h1>
          <p aria-label='Initialized renderer summary'>
            {JSON.stringify({
              backend: report['effectiveBackend'],
              buffer: report['drawingBuffer'],
              ready: report['ready'],
            })}
          </p>
          <button
            type='button'
            onClick={() => {
              setReport({});
              setViewerRevision((value) => value + 1);
            }}
          >
            Remount viewer
          </button>
          <button
            type='button'
            onClick={() => {
              downloadBlob(
                new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
                'renderer-report.json',
              );
            }}
          >
            Download report
          </button>
          <div>
            {(['off', 'xz', 'xz+yz'] as const).map((cut) => (
              <button
                key={cut}
                type='button'
                onClick={() => {
                  graphicsRef.send({
                    type: 'adoptSectionView',
                    section: {
                      active: cut !== 'off',
                      cuts:
                        cut === 'off'
                          ? []
                          : [
                              { kind: 'plane', plane: 'xz', offset: 0.01, isFlipped: false },
                              ...(cut === 'xz+yz'
                                ? [{ kind: 'plane', plane: 'yz', offset: 0, isFlipped: false } as const]
                                : []),
                            ],
                    },
                  });
                }}
              >
                Section {cut}
              </button>
            ))}
          </div>
          <fieldset disabled={isBenchmarking || isCapturing} className='contents'>
            <label className='block'>
              Measurement mode{' '}
              <select
                aria-label='Measurement mode'
                value={measurementMode}
                disabled={isBenchmarking}
                onChange={(event) => {
                  setMeasurementMode(event.target.value === 'gpu' ? 'gpu' : 'natural');
                }}
              >
                <option value='natural'>Natural cadence (no GPU queries)</option>
                <option value='gpu'>GPU diagnostics</option>
              </select>
            </label>
            <label className='block'>
              Viewport CSS width{' '}
              <input
                aria-label='Viewport CSS width'
                type='number'
                min='64'
                max='8192'
                value={viewportWidth}
                onChange={(event) => {
                  setViewportWidth(Math.max(64, Math.min(8192, Number(event.target.value))));
                }}
              />
            </label>
            <label className='block'>
              Viewport CSS height{' '}
              <input
                aria-label='Viewport CSS height'
                type='number'
                min='64'
                max='8192'
                value={viewportHeight}
                onChange={(event) => {
                  setViewportHeight(Math.max(64, Math.min(8192, Number(event.target.value))));
                }}
              />
            </label>
            <label className='block'>
              Fixture{' '}
              <select
                aria-label='Fixture'
                value={fixture?.id ?? ''}
                onChange={(event) => {
                  setFixtureId(event.target.value);
                }}
              >
                {fixtures.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p role='alert'>{error}</p> : null}
            <div className='flex flex-wrap gap-1'>
              {Object.keys(views).map((name) => (
                <button
                  type='button'
                  key={name}
                  onClick={() => {
                    setCameraSettings((previous) => ({
                      ...previous,
                      view: name as ViewName,
                      revision: previous.revision + 1,
                    }));
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <label className='block'>
              Vertical span (m){' '}
              <input
                aria-label='Vertical span'
                type='number'
                min='0.000001'
                step='0.01'
                value={cameraSettings.span}
                onChange={(event) => {
                  const span = Number(event.target.value);
                  if (span > 0) {
                    setCameraSettings((previous) => ({
                      ...previous,
                      span,
                      revision: previous.revision + 1,
                    }));
                  }
                }}
              />
            </label>
            <label className='block'>
              Field of view (0 = ortho){' '}
              <input
                aria-label='Field of view'
                type='number'
                min='0'
                max='120'
                value={cameraSettings.fov}
                onChange={(event) => {
                  setCameraSettings((previous) => ({
                    ...previous,
                    fov: Number(event.target.value),
                    revision: previous.revision + 1,
                  }));
                }}
              />
            </label>
            <label className='block'>
              Diagnostic pixel ratio{' '}
              <select
                aria-label='Pixel ratio'
                value={pixelRatio}
                onChange={(event) => {
                  setPixelRatio(Number(event.target.value));
                }}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <label className='block'>
              Backend{' '}
              <select
                aria-label='Backend'
                value={backend}
                onChange={(event) => {
                  graphicsRef.send({
                    type: 'setGraphicsBackendPreference',
                    payload: event.target.value === 'webgpu' ? 'webgpu' : 'webgl',
                  });
                }}
              >
                <option value='webgl'>WebGL</option>
                <option value='webgpu'>WebGPU (validation)</option>
              </select>
            </label>
            <div className='flex gap-1'>
              <button
                type='button'
                onClick={() => {
                  setEdges((value) => !value);
                }}
              >
                BRep edges {edges ? 'on' : 'off'}
              </button>
              <button
                type='button'
                onClick={() => {
                  setMatcap((value) => !value);
                  graphicsRef.send({
                    type: 'setMatcapVisibility',
                    payload: !matcap,
                  });
                }}
              >
                {matcap ? 'MatCap' : 'PBR'}
              </button>
              <button
                type='button'
                onClick={() => {
                  setOverlay((value) => !value);
                }}
              >
                Grid {overlay ? 'on' : 'off'}
              </button>
            </div>
            <fieldset className='space-y-1'>
              <legend className='font-semibold'>Lighting</legend>
              <label className='block'>
                Environment{' '}
                <select
                  aria-label='Environment'
                  value={lighting.environment}
                  onChange={(event) => {
                    setLighting((previous) => ({
                      ...previous,
                      environment: event.target.value as StudioLightingSettings['environment'],
                    }));
                  }}
                >
                  <option value='studio'>Tau studio</option>
                  <option value='room'>Neutral room</option>
                  <option value='white'>White furnace</option>
                  <option value='none'>Black / direct only</option>
                </select>
              </label>
              {(
                [
                  'ambientIntensity',
                  'headlampIntensity',
                  'environmentIntensity',
                  'keyIntensity',
                  'keySize',
                  'fillIntensity',
                  'backgroundIntensity',
                  'exposure',
                ] as const
              ).map((name) => (
                <label key={name} className='flex justify-between'>
                  {name}
                  <input
                    aria-label={name}
                    type='number'
                    min='0'
                    step={name === 'keyIntensity' ? 1 : 0.05}
                    value={lighting[name]}
                    onChange={(event) => {
                      setLighting((previous) => ({
                        ...previous,
                        [name]: Math.max(0, Number(event.target.value)),
                      }));
                    }}
                  />
                </label>
              ))}
              <button
                type='button'
                onClick={() => {
                  setLighting(defaultStudioLighting);
                  setPost(defaultPostProcessingSettings);
                }}
              >
                Editing profile
              </button>
              <button
                type='button'
                onClick={() => {
                  setLighting({
                    ...defaultStudioLighting,
                    environment: 'studio',
                    environmentIntensity: 0.09,
                    ambientIntensity: 0.6,
                    headlampIntensity: 2.5,
                    exposure: 0.5,
                  });
                  setPost({
                    ...defaultPostProcessingSettings,
                    toneMapping: 'aces',
                    aoCompositeStage: 'scene',
                    radiusCssPixels: 12,
                    intensity: 1,
                    webglDenoiseRadiusCssPixels: 12 / pixelRatio,
                  });
                }}
              >
                Previous studio
              </button>
              <button
                type='button'
                onClick={() => {
                  setLighting({
                    ...defaultStudioLighting,
                    environment: 'room',
                    environmentIntensity: 1,
                    ambientIntensity: 0.3,
                    headlampIntensity: 2.5,
                    exposure: 1,
                  });
                  setPost((previous) => ({
                    ...previous,
                    toneMapping: 'linear',
                    displayMode: 'no-ao',
                  }));
                }}
              >
                Viewer reference
              </button>
              <button
                type='button'
                onClick={() => {
                  setLighting({
                    ...defaultStudioLighting,
                    environment: 'white',
                    environmentIntensity: 1,
                    ambientIntensity: 0,
                    headlampIntensity: 0,
                    exposure: 1,
                  });
                  setPost((previous) => ({
                    ...previous,
                    toneMapping: 'none',
                    displayMode: 'no-ao',
                  }));
                  setEdges(false);
                }}
              >
                Furnace reference
              </button>
            </fieldset>
            <fieldset className='space-y-1'>
              <legend className='font-semibold'>Output and AO</legend>
              <label className='block'>
                <input
                  type='checkbox'
                  aria-label='AO enabled'
                  checked={post.aoEnabled ?? true}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      aoEnabled: event.target.checked,
                    }));
                  }}
                />
                AO enabled (estimator cost)
              </label>
              <label className='block'>
                <input
                  type='checkbox'
                  aria-label='WebGL half resolution AO'
                  checked={post.webglHalfResolution ?? false}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      webglHalfResolution: event.target.checked,
                    }));
                  }}
                />
                WebGL half resolution AO (diagnostic)
              </label>
              <label className='block'>
                Tone mapping{' '}
                <select
                  aria-label='Tone mapping'
                  value={post.toneMapping}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      toneMapping: event.target.value as PostProcessingSettings['toneMapping'],
                    }));
                  }}
                >
                  {['aces', 'neutral', 'linear', 'none'].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className='block'>
                AO display{' '}
                <select
                  aria-label='AO display'
                  value={post.displayMode}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      displayMode: event.target.value as PostProcessingSettings['displayMode'],
                    }));
                  }}
                >
                  {['combined', 'ao', 'no-ao'].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className='block'>
                AO composite stage{' '}
                <select
                  aria-label='AO composite stage'
                  value={post.aoCompositeStage ?? defaultPostProcessingSettings.aoCompositeStage}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      aoCompositeStage: event.target.value as PostProcessingSettings['aoCompositeStage'],
                    }));
                  }}
                >
                  <option value='scene'>Before tone mapping</option>
                  <option value='display'>After tone mapping, before sRGB</option>
                </select>
              </label>
              <label className='block'>
                AO radius mode{' '}
                <select
                  aria-label='AO radius mode'
                  value={post.radiusCssPixels === 'viewport' ? 'viewport' : 'css'}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      radiusCssPixels: event.target.value === 'viewport' ? 'viewport' : 12,
                    }));
                  }}
                >
                  <option value='css'>Explicit CSS pixels</option>
                  <option value='viewport'>1% of viewport diagonal</option>
                </select>
              </label>
              <label className='flex justify-between'>
                radiusCssPixels
                <input
                  aria-label='radiusCssPixels'
                  type='number'
                  min='0'
                  step='0.1'
                  disabled={post.radiusCssPixels === 'viewport'}
                  value={post.radiusCssPixels === 'viewport' ? '' : post.radiusCssPixels}
                  onChange={(event) => {
                    setPost((previous) => ({
                      ...previous,
                      radiusCssPixels: Math.max(0, Number(event.target.value)),
                    }));
                  }}
                />
              </label>
              {(
                [
                  'intensity',
                  'gtaoIntensity',
                  'distanceFalloff',
                  'gtaoDistanceFalloff',
                  'webglDenoiseRadiusCssPixels',
                ] as const
              ).map((name) => (
                <label key={name} className='flex justify-between'>
                  {name}
                  <input
                    aria-label={name}
                    type='number'
                    min='0'
                    step='0.1'
                    value={post[name]}
                    onChange={(event) => {
                      setPost((previous) => ({
                        ...previous,
                        [name]: Math.max(0, Number(event.target.value)),
                      }));
                    }}
                  />
                </label>
              ))}
            </fieldset>
            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                disabled={!captureReady || isBenchmarking}
                onClick={() => {
                  setBenchmarkKind('orbit');
                  setIsBenchmarking(true);
                  setBenchmark((value) => value + 1);
                }}
              >
                Benchmark 300 frames
              </button>
              {(['playback', 'combined'] as const).map((kind) => (
                <button
                  key={kind}
                  type='button'
                  disabled={!captureReady || isBenchmarking}
                  onClick={() => {
                    setBenchmarkKind(kind);
                    setIsBenchmarking(true);
                    setBenchmark((value) => value + 1);
                  }}
                >
                  Benchmark {kind}
                </button>
              ))}
              <button
                type='button'
                disabled={!captureReady || isBenchmarking}
                onClick={() => {
                  setCameraSettings((previous) => ({
                    ...previous,
                    fov: 0,
                    revision: previous.revision + 1,
                  }));
                  setBenchmarkKind('projection');
                  setIsBenchmarking(true);
                  setBenchmark((value) => value + 1);
                }}
              >
                Benchmark projection changes
              </button>
              <label>
                Capture{' '}
                <input
                  aria-label='Capture name'
                  value={captureName}
                  onChange={(event) => {
                    setCaptureName(event.target.value);
                  }}
                />
              </label>
              <button
                type='button'
                disabled={!captureReady}
                onClick={() => {
                  setCapture((previous) => ({
                    sequence: previous.sequence + 1,
                    name: captureName,
                  }));
                }}
              >
                {packagedCapture ? 'Save PNG (report separately)' : 'Save PNG + metadata'}
              </button>
              <button
                type='button'
                disabled={!captureReady || backend !== 'webgl'}
                onClick={() => {
                  setCapture((previous) => ({ sequence: previous.sequence + 1, name: 'lighting-assets' }));
                }}
              >
                Save lighting assets
              </button>
            </div>
          </fieldset>
          <details
            onToggle={(event) => {
              setShowMaterials(event.currentTarget.open);
            }}
          >
            <summary>Authored materials ({fixture?.materials.length ?? 0})</summary>
            {Object.values(componentManifest?.nodesById ?? {})
              .filter((node) => node.appearance?.materials?.length)
              .map((node) => (
                <div key={node.id}>
                  <h2 className='px-3 font-medium'>{node.name}</h2>
                  <ModelComponentMaterialSummary node={node} />
                </div>
              ))}
          </details>
          <details open>
            <summary>Capture and performance report</summary>
            <pre aria-label='Calibration report' className='text-xs whitespace-pre-wrap'>
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
        </aside>
        <div
          aria-label='Calibration viewport'
          inert={isBenchmarking}
          className='absolute top-[78px] left-[452px] bg-white'
          style={{ width: viewportWidth, height: viewportHeight }}
        >
          {fixture && geometry?.hash === fixture.sha256 ? (
            <CalibrationCanvas
              key={viewerRevision}
              geometry={geometry}
              fixture={fixture}
              graphicsRef={graphicsRef}
              cameraSettings={cameraSettings}
              pixelRatio={pixelRatio}
              lighting={lighting}
              post={post}
              edges={edges}
              matcap={matcap}
              overlay={overlay}
              benchmark={benchmark}
              benchmarkKind={benchmarkKind}
              measurementMode={measurementMode}
              capture={capture}
              onReport={onReport}
            />
          ) : null}
        </div>
      </main>
    </ThemeProvider>
  );
}

export default RenderingProfile;
