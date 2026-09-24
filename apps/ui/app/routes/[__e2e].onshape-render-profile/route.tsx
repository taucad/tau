import { uint8ArrayToBase64 } from 'uint8array-extras';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, HalfFloatType, REVISION, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { Scene } from 'three';
import { applyCanonicalGltfBounds } from '#components/geometry/graphics/three/gltf-world.js';
import { z } from 'zod';
import type { Geometry } from '@taucad/types';
import { ModelComponentMaterialSummary } from '#components/geometry/cad/model-component-action-menu.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { ThreeProvider } from '#components/geometry/graphics/three/three-context.js';
import { defaultStudioLighting } from '#components/geometry/graphics/three/utils/lights.utils.js';
import type { StudioLightingSettings } from '#components/geometry/graphics/three/utils/lights.utils.js';
import {
  defaultPostProcessingSettings,
  resolveAoRadiusCssPixels,
} from '#components/geometry/graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { GraphicsProvider, useCameraRig, useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';
import { ThemeProvider } from '#hooks/use-theme.js';
import { createFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';
import type { FrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';
import { getEnvironment } from '#environment.config.js';

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
type BenchmarkKind = 'orbit' | 'projection';
type FrameSample = {
  frameInterval: number;
  cpuSubmission: number;
  calls: number;
  triangles: number;
  lines: number;
  projectionSwitch: boolean;
};

async function compressCapture(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const compressed = new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
  );
  return uint8ArrayToBase64(compressed);
}

/** Capture WebGL pixels alongside the PNG to verify their shared straight-alpha contract. */
async function captureFramebuffer(renderer: WebGLRenderer): Promise<Record<string, unknown>> {
  const context = renderer.getContext();
  const { drawingBufferWidth: width, drawingBufferHeight: height } = context;
  const pixels = new Uint8Array(width * height * 4);
  context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
  const topDown = new Uint8Array(pixels.length);
  for (let row = 0; row < height; row++) {
    topDown.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), (height - row - 1) * width * 4);
  }
  return { width, height, format: 'rgba8-srgb-framebuffer', compression: 'gzip', data: await compressCapture(topDown) };
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
  mad: number;
  samples: number;
} {
  const ordered = [...values].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  return {
    median,
    p95: ordered[Math.floor(ordered.length * 0.95)] ?? 0,
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
  capture,
  metadata,
  onReport,
}: {
  readonly fixture: Fixture;
  readonly cameraSettings: CameraSettings;
  readonly pixelRatio: number;
  readonly benchmark: number;
  readonly benchmarkKind: BenchmarkKind;
  readonly capture: { sequence: number; name: string };
  readonly metadata: Record<string, unknown> & { post: Partial<PostProcessingSettings> };
  readonly onReport: (report: Record<string, unknown>) => void;
}): undefined {
  const { gl, scene, invalidate, size, setDpr } = useThree();
  const gpuTimer = useRef<FrameGpuTimer | undefined>(undefined);
  const rig = useCameraRig();
  const viewerBounds = useMemo(
    () => applyCanonicalGltfBounds(new Box3(new Vector3(...fixture.bounds.min), new Vector3(...fixture.bounds.max))),
    [fixture],
  );
  const renderFrame = useRenderFrame();
  const presented = useGraphicsSelector((state) => state.context.gltfPresentation.presentedRevision);
  const requested = useGraphicsSelector((state) => state.context.gltfPresentation.requestedRevision);
  const state = useRef({
    frame: 0,
    pendingFrames: 0,
    projectionSwitch: false,
    start: 0,
    previous: 0,
    appliedCamera: -1,
    benchmark,
    capture: capture.sequence,
    samples: [] as FrameSample[],
    gpuSamples: [] as number[],
    benchmarkResult: undefined as Record<string, unknown> | undefined,
    saved: undefined as unknown,
    gpuPendingPeak: 0,
    drainStarted: 0,
  });
  const report = useCallback((): Record<string, unknown> => {
    const context = gl instanceof WebGLRenderer ? gl.getContext() : undefined;
    const debug = context?.getExtension('WEBGL_debug_renderer_info');
    const radiusCssPixels = resolveAoRadiusCssPixels(
      metadata.post.radiusCssPixels ?? defaultPostProcessingSettings.radiusCssPixels,
      { width: size.width, height: size.height, dpr: gl.getPixelRatio() },
    );
    return {
      ...metadata,
      geometryHash: fixture.sha256,
      ready:
        state.current.appliedCamera === cameraSettings.revision &&
        requested === presented &&
        gl.getPixelRatio() === pixelRatio,
      fixture: { id: fixture.id, sha256: fixture.sha256, stats: fixture.stats },
      threeRevision: REVISION,
      userAgent: navigator.userAgent,
      viewport: size,
      pixelRatio: gl.getPixelRatio(),
      aoRadius: { cssPixels: radiusCssPixels, physicalPixels: radiusCssPixels * gl.getPixelRatio() },
      exposure: gl.toneMappingExposure,
      renderer: debug ? context?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      gpuTimer: gpuTimer.current?.support ?? 'unavailable',
      webglCapabilities: context
        ? {
            maxSamples:
              context instanceof WebGL2RenderingContext ? Number(context.getParameter(context.MAX_SAMPLES)) : 0,
            multisampledRenderToTexture: Boolean(context.getExtension('WEBGL_multisampled_render_to_texture')),
          }
        : undefined,
      timingDefinitions:
        'CPU submission covers frame callbacks; GPU elapsed queries cover the GPU timeline interval, including scheduling/preemption, not exclusive GPU utilization.',
      benchmark: state.current.benchmarkResult,
      benchmarkRunning: benchmark !== state.current.benchmark,
      saved: state.current.saved,
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
    const timer = gl instanceof WebGLRenderer ? createFrameGpuTimer(gl) : undefined;
    gpuTimer.current = timer;
    state.current.benchmarkResult = undefined;
    state.current.samples = [];
    state.current.gpuSamples = [];
    state.current.gpuPendingPeak = 0;
    state.current.drainStarted = 0;
    return () => {
      timer?.dispose();
    };
  }, [benchmark, gl]);
  useEffect(() => {
    state.current.benchmarkResult = undefined;
    state.current.saved = undefined;
  }, [metadata, cameraSettings, pixelRatio]);
  useEffect(() => {
    state.current.frame = 0;
    state.current.pendingFrames = 0;
    setDpr(pixelRatio);
    invalidate();
  }, [benchmark, cameraSettings, capture, invalidate, metadata, pixelRatio, presented, setDpr]);
  useFrame(() => {
    const { current } = state;
    current.start = performance.now();
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
        gpuTimer.current?.begin();
      }
      if (benchmarkKind === 'orbit') {
        const angle = (current.frame * Math.PI) / 150;
        const { view } = rig.actorRef.getSnapshot().context;
        rig.actorRef.send({
          ...view,
          type: 'setView',
          direction: [Math.cos(angle), Math.sin(angle), 0.65],
        });
      } else if (current.frame >= 30 && current.frame < 330 && (current.frame - 30) % 60 === 0) {
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
    gpuTimer.current?.end();
    const gpu = gpuTimer.current?.poll();
    if (benchmark !== current.benchmark && gpu) {
      current.gpuSamples.push(...gpu.milliseconds);
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
        current.samples.push({
          frameInterval: now - current.previous,
          projectionSwitch: current.projectionSwitch,
          cpuSubmission: now - current.start,
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          lines: gl.info.render.lines,
        });
      }
      if (current.samples.length === 300 && current.drainStarted === 0) {
        current.drainStarted = now;
      }
      if (current.samples.length === 300 && (gpu?.pending ?? 0) === 0) {
        current.benchmark = benchmark;
        current.benchmarkResult = {
          kind: benchmarkKind,
          sequence: benchmark,
          projectionSwitchFrames: current.samples.filter((sample) => sample.projectionSwitch),
          frameInterval: summarize(current.samples.map((sample) => sample.frameInterval)),
          cpuSubmission: summarize(current.samples.map((sample) => sample.cpuSubmission)),
          gpuElapsed: summarize(current.gpuSamples),
          gpuPendingPeak: current.gpuPendingPeak,
          gpuDrainMilliseconds: now - current.drainStarted,
          gpuDisjointDiscarded: gpu?.disjointDiscarded ?? 0,
          draws: summarize(current.samples.map((sample) => sample.calls)),
          frameBudgetMilliseconds: 1000 / 60,
          framesOverBudget: current.samples.filter((sample) => sample.frameInterval > 1000 / 60).length,
          samples: current.samples,
        };
        onReport(report());
      } else {
        invalidate();
      }
    }
    current.previous = now;
    if (capture.sequence !== current.capture && current.frame > 8 && requested === presented) {
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
          onReport({ ...captureMetadata, saved: current.saved });
        } catch (error) {
          onReport({ error: String(error) });
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
    graphicsRef.send({
      type: 'updateGeometry',
      geometry,
      units: { length: 'm' },
    });
  }, [geometry, graphicsRef]);
  return (
    <GraphicsProvider graphicsRef={graphicsRef} initialVerticalFieldOfView={0}>
      <ThreeProvider
        graphicsBackend={backend}
        upDirection='z'
        enablePan
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
          capture={capture}
          metadata={metadata}
          onReport={onReport}
        />
      </ThreeProvider>
    </GraphicsProvider>
  );
});

export function RenderingProfile(): React.JSX.Element {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixtureId, setFixtureId] = useState('f6-authored-planetary');
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
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [captureName, setCaptureName] = useState('baseline');
  const [capture, setCapture] = useState({ sequence: 0, name: 'baseline' });
  const [report, setReport] = useState<Record<string, unknown>>({});
  const graphicsRef = useActorRef(graphicsMachine, {
    input: {
      ...defaultGraphicsSettings,
      measureSnapDistance: 40,
      enablePostProcessing: true,
      enableMatcap: false,
      upDirection: 'z',
      graphicsBackend: 'webgl',
    },
  });
  const backend = useSelector(graphicsRef, (snapshot) => snapshot.context.resolvedGraphicsBackend);
  const fixture = fixtures.find((entry) => entry.id === fixtureId) ?? fixtures[0];
  const captureReady = Boolean(
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
              Save PNG + metadata
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
          className='absolute top-[78px] left-[452px] h-[798px] w-[1276px] bg-white'
        >
          {fixture && geometry?.hash === fixture.sha256 ? (
            <CalibrationCanvas
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
