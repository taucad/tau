/*
 * G11.0 characterisation of the GLB presentation pipeline as `gltf-mesh.tsx` runs it today.
 *
 * Each row locks the ordered events the viewer sends to graphics for one path through the pipeline
 * (full parse, in-place update, superseded revisions, failure, the section-analysis barrier,
 * teardown), plus the performance-visible seams: first-frame telemetry, capture admission and which
 * inputs restart preparation. The `presentation` actor (G11b) moves this pipeline out of React; it
 * must reproduce these traces, or change one deliberately and say so in its PR (charter D14).
 */
import { useLayoutEffect } from 'react';
import type { RenderFrame } from '@taucad/spatial';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Mesh, Object3D } from 'three';
import * as sectionTopology from '#graphics/three/utils/section-surface-topology.js';
import { awaitGeometryPresentation } from '#graphics/three/utils/geometry-presentation-admission.js';
import { clearRendererSpans, rendererSpans } from '#lib/renderer-telemetry.js';
import type { GltfPresentationTelemetry } from '#machines/graphics.machine.js';

const mocks = vi.hoisted(() => ({
  noHoveredComponentIds: [] as readonly string[],
  cameraRig: {
    actorRef: {
      getSnapshot: () => ({ context: { view: { bounds: { min: [-1, -1, -1], max: [1, 1, 1] } } } }),
      send: vi.fn(),
    },
    perspectiveCamera: { name: 'perspective', coordinateSystem: undefined, updateProjectionMatrix: vi.fn() },
    orthographicCamera: { name: 'orthographic', coordinateSystem: undefined, updateProjectionMatrix: vi.fn() },
  },
  graphicsActor: {
    send: vi.fn(),
    getSnapshot: () => ({
      context: {
        modelPointerClickSuppressionReasons: [],
        suppressNextModelPointerClick: false,
        viewerHoverSuppressionReasons: [] as string[],
      },
    }),
  },
  frameCallback: undefined as (() => void) | undefined,
  invalidate: vi.fn(),
  rootScene: { name: 'viewport-lighting-scene' },
  modelUnit: {
    focusedComponentId: undefined,
    hiddenComponentIds: [],
    hoveredComponentId: undefined,
    isolatedComponentIds: [],
    manifest: undefined,
    opacityByComponentId: {},
    selectedComponentIds: [],
  },
  renderFrame: {
    anchorFrameId: 'tau:root',
    originMeters: [0, 0, 0] as [number, number, number],
    metersPerRenderUnit: 1,
  },
  sectionView: { isActive: false },
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => {
    mocks.frameCallback = callback;
  },
  useThree: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      camera: { name: 'perspective' },
      controls: undefined,
      gl: Object.create(null) as Record<string, unknown>,
      invalidate: mocks.invalidate,
      scene: mocks.rootScene,
      size: { height: 768, width: 1024 },
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => mocks.cameraRig,
  useGraphics: () => mocks.graphicsActor,
  useGraphicsSelector: () => false,
  useRenderFrame: () => mocks.renderFrame,
  useRenderFrameRetarget: (handler: (frame: RenderFrame) => void) => {
    useLayoutEffect(() => {
      handler(mocks.renderFrame);
    }, [handler]);
  },
  useModelInteractionRef: () => mocks.graphicsActor,
  useModelInteractionSelector: (selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: {} }),
  useKinematicsSelector: () => mocks.noHoveredComponentIds,
}));

vi.mock('#machines/model-interaction.machine.js', () => ({
  deriveModelInteractionUnitId: ({ geometryHash }: { geometryHash?: string }) => `unit:${geometryHash ?? ''}`,
  getModelInteractionUnitState: () => mocks.modelUnit,
}));

vi.mock('#graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
  useSectionViewFlags: () => mocks.sectionView,
}));

vi.mock('#graphics/three/react/kinematics-viewer.js', () => ({
  useKinematicsViewer: () => () => undefined,
}));

const { GltfMesh } = await import('#graphics/three/react/gltf-mesh.jsx');

const surfaceMaterial: GlbMaterial = {
  doubleSided: false,
  alphaMode: 'OPAQUE',
  pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
};

/**
 * One part with a surface and its edges. `indices` changes the topology, `lift` only the positions and
 * `name` only the component the part becomes.
 */
function buildGlb({ lift = 0, indices = [0, 1, 2], name = 'Part' } = {}): Uint8Array<ArrayBuffer> {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]);
  return writeGlb({
    nodes: [
      {
        name,
        primitives: [
          {
            mode: 4,
            positions,
            normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            indices: Uint32Array.from(indices),
            material: surfaceMaterial,
          },
          { mode: 1, positions, indices: Uint32Array.from([0, 1, 1, 2]), material: surfaceMaterial },
        ],
      },
    ],
  });
}

function findSurface(scene: Object3D): Mesh {
  let found: Mesh | undefined;
  scene.traverse((object) => {
    if (!found && object.type === 'Mesh') {
      found = object as Mesh;
    }
  });
  if (!found) {
    throw new Error('Expected a surface mesh.');
  }
  return found;
}

/** Spy on the dispose of the first surface geometry `parseAsync` produced, the one on screen. */
async function spyOnPresentedGeometryDispose(
  parseAsync: MockInstance<typeof GLTFLoader.prototype.parseAsync>,
): Promise<MockInstance<() => void>> {
  const result = parseAsync.mock.results[0];
  if (result?.type !== 'return') {
    throw new Error('Expected a parsed presentation.');
  }
  const gltf = await result.value;
  return vi.spyOn(findSurface(gltf.scene).geometry, 'dispose');
}

/** Whether capture of `bytes` has been admitted; read `admitted` after flushing. */
function trackAdmission(bytes: Uint8Array<ArrayBuffer>): {
  readonly state: { admitted: boolean };
  readonly done: Promise<void>;
} {
  const state = { admitted: false };
  const done = (async (): Promise<void> => {
    await awaitGeometryPresentation(bytes, new AbortController().signal);
    state.admitted = true;
  })();
  return { state, done };
}

type SentEvent = {
  type: string;
  revision?: number;
  key?: string;
  barrier?: string;
  unitId?: string;
  componentId?: string;
  telemetry?: GltfPresentationTelemetry;
};

const sentEvents = (): SentEvent[] => mocks.graphicsActor.send.mock.calls.map((call) => call[0] as SentEvent);

/** One line per event the viewer sent graphics: its type, `revision:key` and the field that tells paths apart. */
const describeEvent = (event: SentEvent): string => {
  switch (event.type) {
    case 'gltfDisplayReady': {
      return `${event.type} ${event.revision}:${event.key} ${event.barrier}`;
    }
    case 'gltfPresentationCommitted': {
      return `${event.type} ${event.revision}:${event.key} ${event.unitId}`;
    }
    case 'gltfPresentationMeasured': {
      return `${event.type} ${event.telemetry?.revision}:${event.telemetry?.key} ${event.telemetry?.outcome}`;
    }
    case 'setHoveredModelComponent': {
      return `${event.type} ${event.unitId} ${event.componentId ?? 'none'}`;
    }
    default: {
      return `${event.type} ${event.revision}:${event.key}`;
    }
  }
};

/** The ordered trace from call `from` on; pass a previous trace's length to read only what came after it. */
const trace = (from = 0): string[] =>
  sentEvents()
    .slice(from)
    .map((event) => describeEvent(event));

const measuredTelemetry = (): GltfPresentationTelemetry[] =>
  sentEvents().flatMap((event) =>
    event.type === 'gltfPresentationMeasured' && event.telemetry ? [event.telemetry] : [],
  );

const committedKeys = (): string[] =>
  sentEvents().flatMap((event) => (event.type === 'gltfPresentationCommitted' ? [event.key ?? ''] : []));

/** Wait for these commits, then flush that commit's passive effects so they cannot leak into the next step. */
async function waitForCommits(keys: readonly string[]): Promise<void> {
  await waitFor(() => {
    expect(committedKeys()).toEqual(keys);
  });
  await act(async () => undefined);
}

/** Run the render-loop callback the viewer registered, as R3F does once per frame. */
const renderFrame = (): void => {
  if (!mocks.frameCallback) {
    throw new Error('Expected the viewer to register a frame callback.');
  }
  mocks.frameCallback();
};

describe('GltfMesh presentation protocol', () => {
  beforeEach(() => {
    clearRendererSpans();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.graphicsActor.send.mockReset();
    mocks.cameraRig.actorRef.send.mockClear();
    mocks.invalidate.mockClear();
    mocks.frameCallback = undefined;
    mocks.sectionView = { isActive: false };
  });

  describe('full presentation', () => {
    it('should send preparation, display-ready and commit in order, and measure only at the first frame', async () => {
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);

      expect(trace()).toEqual([
        'gltfPreparationStarted 1:a',
        'gltfDisplayReady 1:a display-ready',
        'gltfPresentationCommitted 1:a unit:a',
      ]);

      renderFrame();
      expect(trace(3)).toEqual(['gltfPresentationMeasured 1:a presented']);
      const [telemetry] = measuredTelemetry();
      expect(telemetry).toMatchObject({
        backend: 'webgl',
        barrier: 'display-ready',
        renderBoundary: 'submitted',
        modelEmptyFrames: 0,
        parsesStarted: 1,
        parsesDiscarded: 0,
        activeParses: 0,
        activeParseHighWaterMark: 1,
        candidateBundleHighWaterMark: 1,
        committedBundleHighWaterMark: 1,
        topologyJobsStarted: 0,
        topologyJobsDiscarded: 0,
      });
      expect(Object.keys(telemetry?.durations ?? {}).toSorted()).toEqual([
        'annotation',
        'commitToFirstFrame',
        'fatLines',
        'manifest',
        'materials',
        'parse',
        'receiptToFirstFrame',
        'receiptToPreparation',
      ]);

      // Later frames of the same presentation send nothing.
      renderFrame();
      renderFrame();
      expect(trace(4)).toEqual([]);
    });

    it('should count the frames rendered without a model before the first commit', async () => {
      const original = GLTFLoader.prototype.parseAsync;
      const gate = Promise.withResolvers<void>();
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async (data, path) => {
        await gate.promise;
        return original.call(new GLTFLoader(), data, path);
      });
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitFor(() => {
        expect(parseAsync).toHaveBeenCalledOnce();
      });

      renderFrame();
      renderFrame();
      gate.resolve();
      await waitForCommits(['a']);
      renderFrame();

      expect(measuredTelemetry()).toEqual([expect.objectContaining({ revision: 1, key: 'a', modelEmptyFrames: 2 })]);
    });

    it('should key every event with an empty key and revision 0 when neither prop is given', async () => {
      render(<GltfMesh gltfFile={buildGlb()} enableMatcap={false} />);
      await waitForCommits(['']);

      expect(trace()).toEqual([
        'gltfPreparationStarted 0:',
        'gltfDisplayReady 0: display-ready',
        'gltfPresentationCommitted 0: unit:',
      ]);
    });
  });

  describe('in-place update', () => {
    it('should send the full-presentation trace for a same-topology result without parsing it', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      const before = trace().length;

      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitForCommits(['a', 'b']);
      renderFrame();

      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b display-ready',
        'gltfPresentationCommitted 2:b unit:b',
        'gltfPresentationMeasured 2:b presented',
      ]);
      expect(parseAsync).toHaveBeenCalledOnce();
      const telemetry = measuredTelemetry().at(-1);
      expect(telemetry).toMatchObject({ parsesStarted: 1, committedBundleHighWaterMark: 1 });
      expect(Object.keys(telemetry?.durations ?? {}).toSorted()).toEqual([
        'annotation',
        'commitToFirstFrame',
        'inPlace',
        'manifest',
        'receiptToFirstFrame',
        'receiptToPreparation',
      ]);
    });

    it('should present the same bytes again in place when only the revision changes', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const source = buildGlb();
      const view = render(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      const before = trace().length;

      view.rerender(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={2} enableMatcap={false} />);
      await waitForCommits(['a', 'a']);

      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:a',
        'gltfDisplayReady 2:a display-ready',
        'gltfPresentationCommitted 2:a unit:a',
      ]);
      expect(parseAsync).toHaveBeenCalledOnce();
    });

    it('should parse again, with the same trace, when the topology changes', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      const before = trace().length;

      view.rerender(
        <GltfMesh
          gltfFile={buildGlb({ indices: [0, 2, 1] })}
          geometryHash='b'
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitForCommits(['a', 'b']);
      renderFrame();

      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b display-ready',
        'gltfPresentationCommitted 2:b unit:b',
        'gltfPresentationMeasured 2:b presented',
      ]);
      expect(parseAsync).toHaveBeenCalledTimes(2);
      expect(measuredTelemetry().at(-1)?.durations).toHaveProperty('parse');
      expect(measuredTelemetry().at(-1)?.durations).not.toHaveProperty('inPlace');
    });
  });

  describe('in-place eligibility', () => {
    it('should parse again when the same geometry belongs to a different component', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);

      view.rerender(
        <GltfMesh
          gltfFile={buildGlb({ name: 'Renamed' })}
          geometryHash='b'
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitForCommits(['a', 'b']);
      renderFrame();

      expect(parseAsync).toHaveBeenCalledTimes(2);
      expect(measuredTelemetry().at(-1)?.durations).not.toHaveProperty('inPlace');
    });
  });

  describe('superseded revisions', () => {
    it('should start every requested revision but finish only the newest while a parse is queued', async () => {
      const original = GLTFLoader.prototype.parseAsync;
      const gate = Promise.withResolvers<void>();
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async (data, path) => {
        await gate.promise;
        return original.call(new GLTFLoader(), data, path);
      });
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitFor(() => {
        expect(parseAsync).toHaveBeenCalledOnce();
      });
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 1 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 2 })} geometryHash='c' presentationRevision={3} enableMatcap={false} />,
      );
      gate.resolve();
      await waitForCommits(['c']);
      renderFrame();

      // A superseded revision gets a start and no terminal event: no failure, no commit, no telemetry.
      expect(trace()).toEqual([
        'gltfPreparationStarted 1:a',
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'setHoveredModelComponent unit:b none',
        'gltfPreparationStarted 3:c',
        'gltfDisplayReady 3:c display-ready',
        'gltfPresentationCommitted 3:c unit:c',
        'gltfPresentationMeasured 3:c presented',
      ]);
      expect(measuredTelemetry()).toEqual([
        expect.objectContaining({ parsesStarted: 2, parsesDiscarded: 1, activeParseHighWaterMark: 1 }),
      ]);
    });
  });

  describe('failure', () => {
    it('should report a failed replacement with empty failed telemetry and keep the committed scene', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      const committed = view.container.querySelector('primitive');
      expect(committed).not.toBeNull();
      const disposeGeometry = await spyOnPresentedGeometryDispose(parseAsync);
      const before = trace().length;
      parseAsync.mockRejectedValueOnce(new Error('invalid replacement'));

      view.rerender(
        <GltfMesh
          gltfFile={buildGlb({ indices: [0, 2, 1] })}
          geometryHash='b'
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitFor(() => {
        expect(trace(before)).toContain('gltfPresentationMeasured 2:b failed');
      });
      renderFrame();

      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfPresentationFailed 2:b',
        'gltfPresentationMeasured 2:b failed',
      ]);
      expect(measuredTelemetry().at(-1)).toMatchObject({
        barrier: 'display-ready',
        meshCount: 0,
        triangleCount: 0,
        sourceLineCount: 0,
        lineSegmentCount: 0,
        parsesStarted: 2,
      });
      expect(view.container.querySelector('primitive')).toBe(committed);
      expect(disposeGeometry).not.toHaveBeenCalled();

      // The committed bundle is still live: the next same-topology result is written into it in place.
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 3 })} geometryHash='c' presentationRevision={3} enableMatcap={false} />,
      );
      await waitForCommits(['a', 'c']);
      renderFrame();
      expect(parseAsync).toHaveBeenCalledTimes(2);
      expect(measuredTelemetry().at(-1)).toMatchObject({ revision: 3, key: 'c', outcome: 'presented' });
      expect(measuredTelemetry().at(-1)?.durations).toHaveProperty('inPlace');
      expect(disposeGeometry).not.toHaveBeenCalled();
    });
  });

  describe('section-analysis barrier', () => {
    it('should send analysis-ready before the commit and measure at the first frame when a section view is armed', async () => {
      mocks.sectionView = { isActive: true };
      vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);
      renderFrame();

      expect(trace()).toEqual([
        'gltfPreparationStarted 1:a',
        'gltfDisplayReady 1:a analysis-ready',
        'gltfAnalysisReady 1:a',
        'gltfPresentationCommitted 1:a unit:a',
        'gltfPresentationMeasured 1:a presented',
      ]);
      expect(measuredTelemetry()).toEqual([
        expect.objectContaining({ barrier: 'analysis-ready', topologyJobsStarted: 1, topologyJobsDiscarded: 0 }),
      ]);
    });

    it('should fail an armed replacement whose analysis fails, without a commit', async () => {
      mocks.sectionView = { isActive: true };
      vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('topology failed'));
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      const disposeGeometry = await spyOnPresentedGeometryDispose(parseAsync);
      const before = trace().length;

      // An armed section view refuses the in-place path, so equal topology still parses.
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitFor(() => {
        expect(trace(before)).toContain('gltfPresentationMeasured 2:b failed');
      });

      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b analysis-ready',
        'gltfPresentationFailed 2:b',
        'gltfPresentationMeasured 2:b failed',
      ]);
      expect(committedKeys()).toEqual(['a']);
      expect(disposeGeometry).not.toHaveBeenCalled();
    });

    it('should send only analysis-ready when a section view is armed after a display-ready commit', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockResolvedValue([]);
      const source = buildGlb();
      const view = render(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      const before = trace().length;

      mocks.sectionView = { isActive: true };
      view.rerender(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitFor(() => {
        expect(trace(before)).toContain('gltfAnalysisReady 1:a');
      });
      await act(async () => undefined);
      renderFrame();

      // No new preparation and no second telemetry record: analysis lands on the presentation already on screen.
      expect(trace(before)).toEqual(['gltfAnalysisReady 1:a']);

      // A scene that carries section topology refuses the in-place path even once the section view is off.
      mocks.sectionView = { isActive: false };
      const afterAnalysis = trace().length;
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitForCommits(['a', 'b']);
      renderFrame();
      expect(trace(afterAnalysis)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b display-ready',
        'gltfPresentationCommitted 2:b unit:b',
        'gltfPresentationMeasured 2:b presented',
      ]);
      expect(parseAsync).toHaveBeenCalledTimes(2);
      expect(measuredTelemetry().at(-1)?.durations).toHaveProperty('parse');
      expect(measuredTelemetry().at(-1)?.durations).not.toHaveProperty('inPlace');
    });

    it('should parse an armed replacement while analysis of the unarmed scene on screen is still running', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const analysing =
        Promise.withResolvers<Awaited<ReturnType<typeof sectionTopology.registerGltfSectionSurfaceSources>>>();
      const analyze = vi
        .spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
        .mockImplementationOnce(async () => analysing.promise)
        .mockResolvedValue([]);
      const source = buildGlb();
      const view = render(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      mocks.sectionView = { isActive: true };
      view.rerender(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitFor(() => {
        expect(analyze).toHaveBeenCalledOnce();
      });
      const before = trace().length;

      // The scene on screen has no section topology yet; the armed view alone refuses the in-place path.
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitFor(() => {
        expect(trace(before)).toContain('gltfDisplayReady 2:b analysis-ready');
      });
      await act(async () => undefined);
      // The replacement's analysis queues behind the one already running, so it cannot commit yet.
      expect(committedKeys()).toEqual(['a']);
      analysing.resolve([]);
      await waitForCommits(['a', 'b']);

      expect(parseAsync).toHaveBeenCalledTimes(2);
      // The queued analysis of `a` still lands, and is reported, after `b` has been prepared.
      expect(trace(before).slice(0, 6)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b analysis-ready',
        'gltfAnalysisReady 1:a',
        'gltfAnalysisReady 2:b',
        'gltfPresentationCommitted 2:b unit:b',
      ]);
    });

    it('should send cancelled telemetry, then clear hover, when the viewer unmounts during analysis', async () => {
      mocks.sectionView = { isActive: true };
      const analysing =
        Promise.withResolvers<Awaited<ReturnType<typeof sectionTopology.registerGltfSectionSurfaceSources>>>();
      const analyze = vi
        .spyOn(sectionTopology, 'registerGltfSectionSurfaceSources')
        .mockImplementationOnce(async () => analysing.promise);
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitFor(() => {
        expect(analyze).toHaveBeenCalledOnce();
      });

      view.unmount();
      analysing.resolve([]);
      await act(async () => undefined);

      expect(trace()).toEqual([
        'gltfPreparationStarted 1:a',
        'gltfDisplayReady 1:a analysis-ready',
        'gltfPresentationMeasured 1:a cancelled',
        'setHoveredModelComponent unit:a none',
      ]);
    });
  });

  describe('capture admission', () => {
    it('should admit capture of the bytes on the animation frame after the first presented frame', async () => {
      const source = buildGlb();
      render(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      let admitted = false;
      const admission = (async (): Promise<void> => {
        await awaitGeometryPresentation(source, new AbortController().signal);
        admitted = true;
      })();
      await waitForCommits(['a']);
      expect(admitted).toBe(false);

      renderFrame();
      await act(async () => undefined);
      expect(admitted).toBe(false);
      expect(rendererSpans().filter((span) => span.name === 'renderer.presentation-opportunity')).toEqual([]);

      await act(
        async () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              resolve();
            });
          }),
      );
      expect(admitted).toBe(true);
      await admission;
      const opportunities = rendererSpans().filter((span) => span.name === 'renderer.presentation-opportunity');
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0]?.detail).toMatchObject({ key: 'a', revision: 1, backend: 'webgl' });
    });
  });

  describe('capture admission release', () => {
    it('should admit capture of bytes whose parse fails, without a frame', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockRejectedValueOnce(new Error('invalid model'));
      const source = buildGlb();
      render(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      const admission = trackAdmission(source);

      await waitFor(() => {
        expect(trace()).toContain('gltfPresentationFailed 1:a');
      });
      await act(async () => undefined);

      expect(admission.state.admitted).toBe(true);
      await admission.done;
    });

    it('should admit capture of superseded bytes while their parse is still queued', async () => {
      const original = GLTFLoader.prototype.parseAsync;
      const gate = Promise.withResolvers<void>();
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async (data, path) => {
        await gate.promise;
        return original.call(new GLTFLoader(), data, path);
      });
      const first = buildGlb();
      const view = render(<GltfMesh gltfFile={first} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      const admission = trackAdmission(first);
      await waitFor(() => {
        expect(parseAsync).toHaveBeenCalledOnce();
      });

      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 1 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await act(async () => undefined);

      expect(admission.state.admitted).toBe(true);
      await admission.done;
      gate.resolve();
      await waitForCommits(['b']);
    });

    it('should admit capture when the viewer unmounts before the first frame', async () => {
      const source = buildGlb();
      const view = render(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      const admission = trackAdmission(source);
      await waitForCommits(['a']);
      expect(admission.state.admitted).toBe(false);

      view.unmount();
      await act(async () => undefined);

      expect(admission.state.admitted).toBe(true);
      await admission.done;
    });
  });

  describe('preparation inputs', () => {
    it('should not restart preparation when only matcap, surfaces or lines change', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const source = buildGlb();
      const view = render(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);

      view.rerender(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap />);
      view.rerender(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap enableSurfaces={false} />,
      );
      view.rerender(
        <GltfMesh
          gltfFile={source}
          geometryHash='a'
          presentationRevision={1}
          enableMatcap
          enableSurfaces={false}
          enableLines={false}
        />,
      );
      await act(async () => undefined);

      expect(trace().filter((line) => line.startsWith('gltfPreparationStarted'))).toEqual([
        'gltfPreparationStarted 1:a',
      ]);
      expect(parseAsync).toHaveBeenCalledOnce();
    });
  });
});
