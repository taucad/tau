/*
 * G11.0 characterisation of the GLB presentation pipeline as `gltf-mesh.tsx` runs it today.
 *
 * Each row locks the ordered events the viewer sends to graphics for one path through the pipeline
 * (full parse, in-place update, superseded revisions, failure, the section-analysis barrier,
 * teardown), plus the performance-visible seams: first-frame telemetry, capture admission, where the
 * pipeline yields the main thread and which inputs restart preparation. The `presentation` actor (G11b) moves this pipeline out of React; it
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
import { clearRendererSpans, markGeometryReceipt, rendererSpans } from '#lib/renderer-telemetry.js';
import * as gltfEdges from '#graphics/three/materials/gltf-edges.js';
import type { GltfPresentationTelemetry } from '#machines/graphics.machine.js';
import type { GeometryComponentManifest } from '@taucad/types';

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

/** The glTF extension that carries a kernel's component topology in the BIN chunk. */
const topologyExtension = 'TAU_cad_topology';

/**
 * The same part, owned by `componentId` through a `TAU_cad_topology` payload in the BIN chunk, as kernel
 * GLBs carry it. Only a buffer-view index reaches the glTF JSON, so a change of owner leaves the JSON alone.
 */
function buildOwnedGlb(componentId: string, { lift = 0 } = {}): Uint8Array<ArrayBuffer> {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]);
  return writeGlb({
    nodes: [
      {
        name: 'Part',
        primitives: [
          {
            mode: 4,
            positions,
            normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            indices: Uint32Array.from([0, 1, 2]),
            material: surfaceMaterial,
          },
        ],
      },
    ],
    extensionsUsed: [topologyExtension],
    extraBufferViews: [
      {
        key: 'topology',
        data: new TextEncoder().encode(JSON.stringify({ components: [{ id: componentId, nodeIndex: 0 }] })),
      },
    ],
    extensions: (views) => ({ [topologyExtension]: { schemaVersion: 1, topologyBufferView: views['topology']! } }),
  });
}

/** Hold every `requestAnimationFrame` callback until the test runs it, so jsdom's frame clock cannot. */
function captureAnimationFrames(): { run: () => void; readonly pending: () => number } {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  return {
    run: () => {
      for (const callback of frames.splice(0)) {
        callback(performance.now());
      }
    },
    pending: () => frames.length,
  };
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
  manifest?: GeometryComponentManifest;
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
      return `${event.type} ${event.revision}:${event.key} ${event.unitId} manifest=${event.manifest?.geometryHash}`;
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

/** A `performance.now` that moves only when a test advances it. */
function installClock(start = 0): { advance: (milliseconds: number) => void } {
  let now = start;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
}

type ObservedSend = { readonly line: string; readonly attached: boolean; readonly invalidations: number };

/**
 * Record, as each event is sent, whether React has attached a model `<primitive>` and how many frames
 * the viewer had requested by then.
 */
function observeSends(): ObservedSend[] {
  const observed: ObservedSend[] = [];
  mocks.graphicsActor.send.mockImplementation((event: SentEvent) => {
    observed.push({
      line: describeEvent(event),
      attached: document.querySelector('primitive') !== null,
      invalidations: mocks.invalidate.mock.calls.length,
    });
  });
  return observed;
}

/** The counts `gltfPresentationMeasured` reports for {@link buildGlb}'s one surface and its edges. */
const buildGlbCounts = { meshCount: 1, triangleCount: 1, sourceLineCount: 1, lineSegmentCount: 2 };

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
    mocks.invalidate.mockReset();
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
        'gltfPresentationCommitted 1:a unit:a manifest=a',
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
        'gltfPresentationCommitted 0: unit: manifest=undefined',
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

      // In place, the whole update lands inside the render that requested it: no task, no microtask.
      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b display-ready',
        'gltfPresentationCommitted 2:b unit:b manifest=b',
      ]);
      await waitForCommits(['a', 'b']);
      renderFrame();

      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b display-ready',
        'gltfPresentationCommitted 2:b unit:b manifest=b',
        'gltfPresentationMeasured 2:b presented',
      ]);
      // The commit carries the new result's manifest, bounds included, though the scene was reused.
      const manifest = sentEvents().findLast((event) => event.type === 'gltfPresentationCommitted')?.manifest;
      expect(manifest?.nodesById['component:node-0']?.bounds?.max).toEqual([1, 1, 5]);
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
        'gltfPresentationCommitted 2:a unit:a manifest=a',
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
        'gltfPresentationCommitted 2:b unit:b manifest=b',
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
        <GltfMesh
          gltfFile={buildOwnedGlb('component:alpha')}
          geometryHash='a'
          presentationRevision={1}
          enableMatcap={false}
        />,
      );
      await waitForCommits(['a']);

      view.rerender(
        <GltfMesh
          gltfFile={buildOwnedGlb('component:bravo')}
          geometryHash='b'
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitForCommits(['a', 'b']);
      renderFrame();

      expect(parseAsync).toHaveBeenCalledTimes(2);
      expect(measuredTelemetry().at(-1)?.durations).toHaveProperty('parse');
      expect(measuredTelemetry().at(-1)?.durations).not.toHaveProperty('inPlace');
    });

    it('should update in place when the same component owns moved geometry', async () => {
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
      const view = render(
        <GltfMesh
          gltfFile={buildOwnedGlb('component:alpha')}
          geometryHash='a'
          presentationRevision={1}
          enableMatcap={false}
        />,
      );
      await waitForCommits(['a']);

      view.rerender(
        <GltfMesh
          gltfFile={buildOwnedGlb('component:alpha', { lift: 5 })}
          geometryHash='b'
          presentationRevision={2}
          enableMatcap={false}
        />,
      );
      await waitForCommits(['a', 'b']);
      renderFrame();

      expect(parseAsync).toHaveBeenCalledOnce();
      expect(measuredTelemetry().at(-1)?.durations).toHaveProperty('inPlace');
    });

    it('should parse again when a renamed part changes the glTF scene', async () => {
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
        'gltfPresentationCommitted 3:c unit:c manifest=c',
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
        'gltfPresentationCommitted 1:a unit:a manifest=a',
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
      const replacement = buildGlb({ lift: 5 });
      view.rerender(<GltfMesh gltfFile={replacement} geometryHash='b' presentationRevision={2} enableMatcap={false} />);
      const admission = trackAdmission(replacement);
      await waitFor(() => {
        expect(trace(before)).toContain('gltfPresentationMeasured 2:b failed');
      });
      await act(async () => undefined);
      expect(admission.state.admitted).toBe(true);
      await admission.done;

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
        'gltfPresentationCommitted 2:b unit:b manifest=b',
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
      expect(trace(before)).toEqual([
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b analysis-ready',
        'gltfAnalysisReady 1:a',
        'gltfAnalysisReady 2:b',
        'gltfPresentationCommitted 2:b unit:b manifest=b',
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
      const admission = trackAdmission(source);
      await waitForCommits(['a']);
      expect(admission.state.admitted).toBe(false);

      const frames = captureAnimationFrames();
      renderFrame();
      await act(async () => undefined);
      expect(frames.pending()).toBe(1);
      expect(admission.state.admitted).toBe(false);
      expect(rendererSpans().filter((span) => span.name === 'renderer.presentation-opportunity')).toEqual([]);

      frames.run();
      await act(async () => undefined);
      expect(admission.state.admitted).toBe(true);
      await admission.done;
      const opportunities = rendererSpans().filter((span) => span.name === 'renderer.presentation-opportunity');
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0]?.detail).toMatchObject({ key: 'a', revision: 1, backend: 'webgl' });
    });

    it('should admit in-place bytes on the animation frame after their own first frame', async () => {
      const frames = captureAnimationFrames();
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      frames.run();
      clearRendererSpans();

      const replacement = buildGlb({ lift: 5 });
      view.rerender(<GltfMesh gltfFile={replacement} geometryHash='b' presentationRevision={2} enableMatcap={false} />);
      const admission = trackAdmission(replacement);
      await waitForCommits(['a', 'b']);
      expect(admission.state.admitted).toBe(false);

      renderFrame();
      await act(async () => undefined);
      expect(admission.state.admitted).toBe(false);

      frames.run();
      await act(async () => undefined);
      expect(admission.state.admitted).toBe(true);
      await admission.done;
      const opportunities = rendererSpans().filter((span) => span.name === 'renderer.presentation-opportunity');
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0]?.detail).toMatchObject({ key: 'b', revision: 2 });
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

  describe('main-thread yields', () => {
    /** Parse on a clock that advances `parseMilliseconds`, and mark the next task boundary with an event. */
    const parseTaking = (parseMilliseconds: number): void => {
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const original = GLTFLoader.prototype.parseAsync;
      vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async (data, path) => {
        const gltf = await original.call(new GLTFLoader(), data, path);
        now += parseMilliseconds;
        setTimeout(() => {
          mocks.graphicsActor.send({ type: 'taskBoundary' });
        }, 0);
        return gltf;
      });
    };

    it('should yield one task between a parse of 50 ms and its display-ready', async () => {
      parseTaking(50);
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);

      expect(trace().slice(0, 3)).toEqual([
        'gltfPreparationStarted 1:a',
        'taskBoundary undefined:undefined',
        'gltfDisplayReady 1:a display-ready',
      ]);
    });

    it('should not yield between a parse under 50 ms and its display-ready', async () => {
      parseTaking(49);
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);
      await waitFor(() => {
        expect(trace()).toContain('taskBoundary undefined:undefined');
      });

      expect(trace().slice(0, 2)).toEqual(['gltfPreparationStarted 1:a', 'gltfDisplayReady 1:a display-ready']);
    });
  });

  describe('first-frame telemetry values', () => {
    it('should measure each duration from the receipt, preparation, commit and first-frame anchors', async () => {
      const clock = installClock(100);
      const original = GLTFLoader.prototype.parseAsync;
      vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async (data, path) => {
        const gltf = await original.call(new GLTFLoader(), data, path);
        clock.advance(20);
        return gltf;
      });
      const source = buildGlb();
      markGeometryReceipt(source);
      clock.advance(10);
      render(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);
      clock.advance(30);
      renderFrame();

      expect(measuredTelemetry()).toEqual([
        expect.objectContaining({
          glbBytes: source.byteLength,
          meshCount: buildGlbCounts.meshCount,
          triangleCount: buildGlbCounts.triangleCount,
          sourceLineCount: buildGlbCounts.sourceLineCount,
          lineSegmentCount: buildGlbCounts.lineSegmentCount,
          durations: {
            receiptToPreparation: 10,
            parse: 20,
            manifest: 0,
            annotation: 0,
            fatLines: 0,
            materials: 0,
            commitToFirstFrame: 30,
            receiptToFirstFrame: 60,
          },
        }),
      ]);
    });

    it('should measure an in-place update from its own receipt and commit', async () => {
      const clock = installClock(100);
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      clock.advance(100);
      const replacement = buildGlb({ lift: 5 });
      markGeometryReceipt(replacement);
      clock.advance(5);

      view.rerender(<GltfMesh gltfFile={replacement} geometryHash='b' presentationRevision={2} enableMatcap={false} />);
      await waitForCommits(['a', 'b']);
      clock.advance(20);
      renderFrame();

      expect(measuredTelemetry().at(-1)).toMatchObject({
        revision: 2,
        glbBytes: replacement.byteLength,
        durations: {
          receiptToPreparation: 5,
          manifest: 0,
          inPlace: 0,
          annotation: 0,
          commitToFirstFrame: 20,
          receiptToFirstFrame: 25,
        },
      });
    });
  });

  describe('commit timing', () => {
    it('should send the commit only once React has attached the scene, after the pipeline requested a frame', async () => {
      const observed = observeSends();
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);

      expect(observed.map(({ line, attached }) => [line, attached])).toEqual([
        ['gltfPreparationStarted 1:a', false],
        ['gltfDisplayReady 1:a display-ready', false],
        ['gltfPresentationCommitted 1:a unit:a manifest=a', true],
      ]);
      expect(observed[1]?.invalidations).toBe(0);
      expect(observed[2]?.invalidations).toBeGreaterThan(0);
    });

    it('should request a frame for an in-place update before its commit is sent', async () => {
      const observed = observeSends();
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      mocks.invalidate.mockClear();
      const before = observed.length;

      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitForCommits(['a', 'b']);

      const commit = observed.slice(before).find(({ line }) => line.startsWith('gltfPresentationCommitted'));
      expect(commit?.invalidations).toBeGreaterThan(0);
    });

    it('should request a frame when analysis lands on the scene already on screen', async () => {
      const analysing =
        Promise.withResolvers<Awaited<ReturnType<typeof sectionTopology.registerGltfSectionSurfaceSources>>>();
      vi.spyOn(sectionTopology, 'registerGltfSectionSurfaceSources').mockImplementationOnce(
        async () => analysing.promise,
      );
      const source = buildGlb();
      const view = render(
        <GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      mocks.sectionView = { isActive: true };
      view.rerender(<GltfMesh gltfFile={source} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await act(async () => undefined);
      mocks.invalidate.mockClear();

      analysing.resolve([]);
      await waitFor(() => {
        expect(trace()).toContain('gltfAnalysisReady 1:a');
      });

      // No React state changes here; this request is the only thing that draws the caps.
      expect(mocks.invalidate).toHaveBeenCalled();
    });
  });

  describe('first-frame ownership', () => {
    it('should not count a frame drawn before React attaches the scene as its first frame', async () => {
      // A frame requested by the pipeline runs at once, before React re-renders with the new scene.
      mocks.invalidate.mockImplementation(() => {
        mocks.frameCallback?.();
      });
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);

      const lines = trace();
      const committedAt = lines.indexOf('gltfPresentationCommitted 1:a unit:a manifest=a');
      const measuredAt = lines.indexOf('gltfPresentationMeasured 1:a presented');
      expect(committedAt).toBeGreaterThan(-1);
      expect(measuredAt === -1 || measuredAt > committedAt).toBe(true);
    });

    it('should record no presentation opportunity for a presentation replaced before its animation frame', async () => {
      const frames = captureAnimationFrames();
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitForCommits(['a']);
      renderFrame();
      expect(frames.pending()).toBe(1);

      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 5 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitForCommits(['a', 'b']);
      frames.run();

      expect(rendererSpans().filter((span) => span.name === 'renderer.presentation-opportunity')).toEqual([]);
    });
  });

  describe('superseded preparation that throws', () => {
    it('should stay silent when a superseded parse rejects', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const gate = Promise.withResolvers<void>();
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async () => {
        await gate.promise;
        throw new Error('aborted');
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
      gate.resolve();
      await waitForCommits(['b']);

      expect(trace()).toEqual([
        'gltfPreparationStarted 1:a',
        'setHoveredModelComponent unit:a none',
        'gltfPreparationStarted 2:b',
        'gltfDisplayReady 2:b display-ready',
        'gltfPresentationCommitted 2:b unit:b manifest=b',
      ]);
      expect(errors).not.toHaveBeenCalled();
    });

    it('should stay silent when a parse rejects after the viewer unmounts', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const gate = Promise.withResolvers<void>();
      const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementationOnce(async () => {
        await gate.promise;
        throw new Error('aborted');
      });
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await waitFor(() => {
        expect(parseAsync).toHaveBeenCalledOnce();
      });
      view.unmount();
      gate.resolve();
      await act(async () => undefined);
      await act(async () => undefined);

      expect(trace()).toEqual(['gltfPreparationStarted 1:a', 'setHoveredModelComponent unit:a none']);
      expect(errors).not.toHaveBeenCalled();
    });
  });

  describe('annotation and edge yield', () => {
    /** Make edge expansion take `milliseconds` on a frozen clock, and mark the next task boundary. */
    const edgesTaking = (milliseconds: number): { readonly reached: Promise<void> } => {
      const clock = installClock();
      const reached = Promise.withResolvers<void>();
      const original = gltfEdges.applyFatLineSegments;
      vi.spyOn(gltfEdges, 'applyFatLineSegments').mockImplementationOnce((...parameters) => {
        original(...parameters);
        clock.advance(milliseconds);
        setTimeout(() => {
          mocks.graphicsActor.send({ type: 'taskBoundary' });
        }, 0);
        reached.resolve();
      });
      return { reached: reached.promise };
    };

    it('should yield one task when annotation and edges take 16 ms', async () => {
      edgesTaking(16);
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);

      expect(trace().slice(0, 3)).toEqual([
        'gltfPreparationStarted 1:a',
        'taskBoundary undefined:undefined',
        'gltfDisplayReady 1:a display-ready',
      ]);
    });

    it('should not yield when annotation and edges take under 16 ms', async () => {
      edgesTaking(15);
      render(<GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />);
      await waitForCommits(['a']);
      await waitFor(() => {
        expect(trace()).toContain('taskBoundary undefined:undefined');
      });

      expect(trace().slice(0, 2)).toEqual(['gltfPreparationStarted 1:a', 'gltfDisplayReady 1:a display-ready']);
    });

    it('should drop a revision superseded during that yield before it is display-ready', async () => {
      const { reached } = edgesTaking(16);
      const view = render(
        <GltfMesh gltfFile={buildGlb()} geometryHash='a' presentationRevision={1} enableMatcap={false} />,
      );
      await reached;
      view.rerender(
        <GltfMesh gltfFile={buildGlb({ lift: 1 })} geometryHash='b' presentationRevision={2} enableMatcap={false} />,
      );
      await waitForCommits(['b']);

      expect(trace()).not.toContain('gltfDisplayReady 1:a display-ready');
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
