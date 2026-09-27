import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut } from '#components/geometry/graphics/section-cuts.js';
import { SectionContourFills } from '#components/geometry/graphics/three/react/section-contour-fill.js';
import type { SectionCertification } from '#components/geometry/graphics/three/react/section-contour-fill.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import type { CreateSectionCapOverlapWorkerClientOptions } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type * as WorkerClientModule from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type { SectionCapWorkerRequest } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { sectionCapPerformanceDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { SectionCapPerformanceDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type * as SurfaceTopologyModule from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import { createSectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';

const unitId = 'unit:main';
const componentId = 'component:block';

const createModelInteractionContext = (hoveredComponentId?: string): ModelInteractionContext => ({
  unitsById: {
    [unitId]: {
      hoveredComponentId,
      selectedComponentIds: [],
      hiddenComponentIds: [],
      isolatedComponentIds: [],
      opacityByComponentId: {},
    },
  },
  unitOrder: [unitId],
  revision: 0,
  displayRevision: 0,
  lastInteractionSource: 'viewer',
});

const mocks = vi.hoisted(() => ({
  theme: 'light',
  isTauDebugEnabled: true,
  modelInteractionContext: undefined as ModelInteractionContext | undefined,
  hasWorker: false,
  workerOptions: undefined as CreateSectionCapOverlapWorkerClientOptions | undefined,
  postedRequests: [] as SectionCapWorkerRequest[],
  certifications: [] as SectionCertification[],
  /** The kept-side plane of every slice, in call order. */
  slicedPlanes: [] as THREE.Plane[],
  /** Slices through this plane fail. */
  failingPlane: undefined as THREE.Plane | undefined,
}));

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: mocks.theme }),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsSelector: () => unitId,
  useModelInteractionRef: () => ({ getSnapshot: () => ({ context: mocks.modelInteractionContext }) }),
  useModelInteractionSelector: () => undefined,
}));

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => mocks.isTauDebugEnabled }));

vi.mock('#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkerClientModule>()),
  canUseSectionCapOverlapWorker: () => mocks.hasWorker,
  createSectionCapOverlapWorkerClient(options: CreateSectionCapOverlapWorkerClientOptions) {
    mocks.workerOptions = options;
    return {
      post(request: SectionCapWorkerRequest) {
        mocks.postedRequests.push(request);
      },
      dispose: () => undefined,
    };
  },
}));

vi.mock('#components/geometry/graphics/three/utils/section-surface-topology.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SurfaceTopologyModule>();
  return {
    ...actual,
    sliceSectionSurfaceSource(options: Parameters<typeof actual.sliceSectionSurfaceSource>[0]) {
      mocks.slicedPlanes.push(options.worldPlane.clone());
      if (mocks.failingPlane?.equals(options.worldPlane)) {
        return {
          status: 'failed',
          failure: {
            sourceKey: options.visibleSource.source.key,
            code: 'slice-invariant',
            message: 'The slice did not close.',
          },
        } as const;
      }
      return actual.sliceSectionSurfaceSource(options);
    },
  };
});

/** Removes z < `offset`: the cut the fixture boxes are drawn with. */
const xyCut = (offset: number): SectionCut => ({ id: 'cut-a', kind: 'plane', plane: 'xy', offset, isFlipped: true });

/** Removes x > `offset`, crossing the first cut. */
const yzCut = (offset: number): SectionCut => ({ id: 'cut-b', kind: 'plane', plane: 'yz', offset, isFlipped: false });

/** A cutaway about Z wider than a half turn, removed as two halves. */
const wideCutaway: SectionCut = { id: 'cut-c', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 225 };

const cutSetOf = (...cuts: SectionCut[]): SectionCutSet => ({ cuts, pieces: resolveSectionPieces(cuts) });

type FillProperties = Readonly<{
  backend: ResolvedGraphicsBackend;
  cutSet: SectionCutSet;
  stripeFrequency: number;
  stripeWidth: number;
}>;

/** GPU upload versions of every drawn cap, in helper order: fill positions and colours, and outline segments. */
type Uploads = Readonly<{ fillPositions: number[]; fillColors: number[]; outline: number[] }>;

type Harness = Readonly<{
  /** The first fixture box, owned by `componentId`, cut through its middle. */
  owned: THREE.Mesh;
  /** A second box beside it, so hiding it changes the set of cut sources. */
  neighbour: THREE.Mesh;
  scene: THREE.Scene;
  snapshotStore: ReturnType<typeof createSectionViewSafeSnapshotStore>;
  render(overrides?: Partial<FillProperties>): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  frame(): void;
  /** Turns the camera about the model, as an orbit does. */
  orbit(): void;
  /** The first upload of each list is the owned box's cap on the first face. */
  uploads(): Uploads;
  performance(): SectionCapPerformanceDebugSummary;
  unmount(): void;
}>;

const isMesh = (object: THREE.Object3D): object is THREE.Mesh => object instanceof THREE.Mesh;

const versionOf = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number =>
  attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;

const defaultProperties: FillProperties = {
  backend: 'webgl',
  cutSet: cutSetOf(xyCut(0)),
  stripeFrequency: 2,
  stripeWidth: 0.4,
};

const mountFills = async (initial: Partial<FillProperties> = {}): Promise<Harness> => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const root = createRoot(canvas);
  const gl = mock<WebGLRenderer>();
  gl.domElement = canvas;
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  const configure = async (width: number, height: number): Promise<void> => {
    await act(async () => {
      await root.configure({
        camera,
        frameloop: 'never',
        gl,
        size: { height, left: 0, top: 0, width },
      });
    });
  };
  await configure(800, 600);

  const owned = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x33_66_99 }));
  setModelComponentOwner(owned, { unitId, componentId });
  const neighbour = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x99_66_33 }));
  neighbour.position.set(3, 0, 0);
  const inner = new THREE.Group();
  inner.add(owned, neighbour);
  const innerRef = { current: inner };
  const snapshotStore = createSectionViewSafeSnapshotStore();
  const snapshotRef = { current: snapshotStore };
  const onCertify = (certification: SectionCertification): void => {
    mocks.certifications.push(certification);
  };

  let properties = { ...defaultProperties, ...initial };
  let scene: THREE.Scene | undefined;
  const render = async (overrides: Partial<FillProperties> = {}): Promise<void> => {
    properties = { ...properties, ...overrides };
    await act(async () => {
      const store = root.render(
        <ThreeGraphicsBackendProvider value={properties.backend}>
          <SectionContourFills
            enabled
            cutSet={properties.cutSet}
            innerRef={innerRef}
            snapshotRef={snapshotRef}
            stripeFrequency={properties.stripeFrequency}
            stripeWidth={properties.stripeWidth}
            onCertify={onCertify}
          />
        </ThreeGraphicsBackendProvider>,
      );
      scene = store.getState().scene;
    });
  };
  await render();

  const fillsRoot = (): THREE.Object3D => scene!.children[0]!;
  let orbitAngle = 0;

  return {
    owned,
    neighbour,
    scene: scene!,
    snapshotStore,
    render,
    resize: configure,
    frame() {
      advance(performance.now());
    },
    orbit() {
      orbitAngle += 0.4;
      camera.position.set(Math.sin(orbitAngle) * 6, 2, Math.cos(orbitAngle) * 6);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
    },
    uploads() {
      const uploads: Uploads = { fillPositions: [], fillColors: [], outline: [] };
      for (const child of fillsRoot().children) {
        if (!child.visible || !isMesh(child)) {
          continue;
        }
        if (child.type === 'LineSegments2') {
          uploads.outline.push(versionOf(child.geometry.getAttribute('instanceStart')));
        } else {
          uploads.fillPositions.push(versionOf(child.geometry.getAttribute('position')));
          uploads.fillColors.push(versionOf(child.geometry.getAttribute('aCapBaseColor')));
        }
      }
      return uploads;
    },
    performance() {
      return fillsRoot().userData[sectionCapPerformanceDebugUserDataKey] as SectionCapPerformanceDebugSummary;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      canvas.remove();
    },
  };
};

describe('SectionContourFills frame', () => {
  let harness: Harness | undefined;

  beforeAll(() => {
    extend({ Group: THREE.Group });
  });

  beforeEach(() => {
    mocks.theme = 'light';
    mocks.isTauDebugEnabled = true;
    mocks.modelInteractionContext = createModelInteractionContext();
    mocks.hasWorker = false;
    mocks.workerOptions = undefined;
    mocks.postedRequests = [];
    mocks.certifications = [];
    mocks.slicedPlanes = [];
    mocks.failingPlane = undefined;
  });

  afterEach(() => {
    harness?.unmount();
    harness = undefined;
  });

  const mountAndSettle = async (initial?: Partial<FillProperties>): Promise<Harness> => {
    harness = await mountFills(initial);
    harness.frame();
    harness.frame();
    return harness;
  };

  it.each([
    ['one plane', cutSetOf(xyCut(0))],
    ['two crossing planes', cutSetOf(xyCut(0), yzCut(0))],
    ['a cutaway wider than a half turn', cutSetOf(wideCutaway)],
  ] as const)(
    'should leave the drawn caps of %s as they are through an orbit that changes nothing they are drawn from',
    async (_label, cutSet) => {
      const fills = await mountAndSettle({ cutSet });
      expect(mocks.certifications).toEqual([{ status: 'exact', cuts: cutSet.cuts }]);
      const uploads = fills.uploads();
      const { committed } = fills.snapshotStore;
      const appliedFrame = fills.performance().latestFrame;

      fills.orbit();
      fills.frame();

      expect(fills.uploads()).toEqual(uploads);
      expect(fills.snapshotStore.committed).toBe(committed);
      expect(mocks.certifications).toHaveLength(1);
      const { history, latestFrame } = fills.performance();
      expect(history.at(-1)).toMatchObject({
        counters: { skippedFrameCount: 1, uploadedByteCount: 0, workerRequestCount: 0 },
        timings: { capPolygonBuild: 0, geometryPack: 0, borderWrite: 0, gpuBufferWrite: 0, materialUpdate: 0 },
        faces: [],
      });
      // The latest frame keeps describing what is drawn.
      expect(latestFrame).toBe(appliedFrame);
      expect(latestFrame.counters.skippedFrameCount).toBe(0);
    },
  );

  it('should draw a cap on every face of the cuts and none on the plane between the halves of a wide cutaway', async () => {
    const fills = await mountAndSettle({ cutSet: cutSetOf(xyCut(0), wideCutaway) });

    expect(fills.performance().latestFrame.faces.map(({ faceKey }) => faceKey)).toEqual([
      'cut-a:0',
      'cut-c:0',
      'cut-c:1',
    ]);
    expect(fills.uploads().fillPositions.length).toBeGreaterThanOrEqual(3);
  });

  it('should re-slice only the faces of the cut that moved', async () => {
    const fills = await mountAndSettle({ cutSet: cutSetOf(xyCut(0), yzCut(0)) });
    mocks.slicedPlanes = [];

    await fills.render({ cutSet: cutSetOf(xyCut(0.25), yzCut(0)) });
    fills.frame();

    // Both boxes through the moved face; the other cut's slices are reused.
    expect(mocks.slicedPlanes).toHaveLength(2);
    for (const plane of mocks.slicedPlanes) {
      expect(plane.equals(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.25))).toBe(true);
    }
    expect(
      fills.performance().latestFrame.faces.map(({ faceKey, slicedSourceCount }) => [faceKey, slicedSourceCount]),
    ).toEqual([
      ['cut-a:0', 2],
      ['cut-b:0', 0],
    ]);
    expect(mocks.certifications.at(-1)).toMatchObject({ status: 'exact', cuts: [xyCut(0.25), yzCut(0)] });
  });

  it('should keep every drawn cap and the committed cuts when a new cut set cannot be certified', async () => {
    const initial = cutSetOf(xyCut(0));
    const fills = await mountAndSettle({ cutSet: initial });
    const uploads = fills.uploads();
    // The moved cut slices; the added cut fails, so neither is drawn.
    mocks.failingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

    await fills.render({ cutSet: cutSetOf(xyCut(0.25), yzCut(0)) });
    fills.frame();

    expect(mocks.certifications.at(-1)).toEqual({ status: 'rejected', cuts: initial.cuts });
    expect(mocks.certifications.at(-1)?.cuts).toBe(initial.cuts);
    expect(fills.snapshotStore.committed?.cutSet).toBe(initial);
    expect(fills.uploads()).toEqual(uploads);

    // The refused set is not sliced again while nothing changes.
    mocks.slicedPlanes = [];
    fills.frame();
    expect(mocks.slicedPlanes).toEqual([]);

    mocks.failingPlane = undefined;
    const next = cutSetOf(xyCut(0.25), yzCut(0.5));
    await fills.render({ cutSet: next });
    fills.frame();

    expect(mocks.certifications.at(-1)).toEqual({ status: 'exact', cuts: next.cuts });
    expect(fills.snapshotStore.committed?.cutSet).toBe(next);
    expect(fills.uploads().fillPositions[0]).toBeGreaterThan(uploads.fillPositions[0]!);
  });

  it.each<readonly [string, (fills: Harness) => Promise<void> | void]>([
    [
      'a cut',
      async (fills) => {
        await fills.render({ cutSet: cutSetOf(xyCut(0.25)) });
      },
    ],
    [
      'a source transform',
      (fills) => {
        fills.owned.position.x += 0.5;
      },
    ],
    [
      'a source revision',
      (fills) => {
        fills.owned.geometry.getAttribute('position').needsUpdate = true;
      },
    ],
    [
      'the set of visible sources',
      (fills) => {
        fills.neighbour.visible = false;
      },
    ],
    [
      'a source emphasis',
      () => {
        mocks.modelInteractionContext = createModelInteractionContext(componentId);
      },
    ],
    [
      'the stripe frequency',
      async (fills) => {
        await fills.render({ stripeFrequency: 3 });
      },
    ],
    [
      'the stripe width',
      async (fills) => {
        await fills.render({ stripeWidth: 0.6 });
      },
    ],
    [
      'the theme edge colour',
      async (fills) => {
        mocks.theme = 'dark';
        await fills.render();
      },
    ],
    [
      'the line resolution',
      async (fills) => {
        await fills.resize(640, 480);
      },
    ],
    [
      'the graphics backend',
      async (fills) => {
        await fills.render({ backend: 'webgpu' });
      },
    ],
    [
      'the transform the helpers are placed under',
      (fills) => {
        fills.scene.position.x = 1;
        fills.scene.updateMatrixWorld(true);
      },
    ],
  ])('should rebuild the caps when only %s changes', async (_input, change) => {
    const fills = await mountAndSettle();
    const uploads = fills.uploads();

    await change(fills);
    fills.frame();

    expect(fills.performance().history.at(-1)?.counters.skippedFrameCount).toBe(0);
    expect(fills.uploads().fillPositions[0]).toBeGreaterThan(uploads.fillPositions[0]!);
  });

  it('should describe the drawn caps from the first frame the debug recorder is on', async () => {
    mocks.isTauDebugEnabled = false;
    const fills = await mountAndSettle();

    mocks.isTauDebugEnabled = true;
    await fills.render();
    fills.frame();

    expect(fills.performance().latestFrame.counters).toMatchObject({ skippedFrameCount: 0, sourceCount: 2 });
  });

  it('should apply an exact worker result that lands after the base cap was drawn', async () => {
    mocks.hasWorker = true;
    const fills = await mountAndSettle();
    const [request] = mocks.postedRequests;
    expect(mocks.postedRequests).toHaveLength(1);
    expect(fills.performance().latestFrame.exactDiagnosticIsCurrent).toBe(false);
    const uploads = fills.uploads();

    mocks.workerOptions!.onResponse(computeSectionCapWorkerResponse(request!));
    fills.frame();

    expect(fills.uploads().fillColors[0]).toBeGreaterThan(uploads.fillColors[0]!);
    expect(fills.performance().latestFrame.exactDiagnosticIsCurrent).toBe(true);
    const settled = fills.uploads();
    fills.frame();
    expect(fills.uploads()).toEqual(settled);
  });

  it('should request the exact result again after the worker fails it', async () => {
    mocks.hasWorker = true;
    const fills = await mountAndSettle();
    const [request] = mocks.postedRequests;

    mocks.workerOptions!.onResponse({
      type: 'error',
      sequence: request!.sequence,
      requestKey: request!.requestKey,
      message: 'worker failed',
    });
    fills.frame();

    expect(mocks.postedRequests.map(({ requestKey }) => requestKey)).toEqual([
      request!.requestKey,
      request!.requestKey,
    ]);
  });

  it('should request the exact result again when a cut returns after its response arrived stale', async () => {
    mocks.hasWorker = true;
    const fills = await mountAndSettle();
    const [requestA] = mocks.postedRequests;
    mocks.workerOptions!.onResponse(computeSectionCapWorkerResponse(requestA!));
    fills.frame();
    await fills.render({ cutSet: cutSetOf(xyCut(0.25)) });
    fills.frame();
    const requestB = mocks.postedRequests[1]!;
    await fills.render({ cutSet: cutSetOf(xyCut(0)) });
    fills.frame();
    // B's result lands while the cut is back on A, so it is stale.
    mocks.workerOptions!.onResponse(computeSectionCapWorkerResponse(requestB));
    fills.frame();

    await fills.render({ cutSet: cutSetOf(xyCut(0.25)) });
    fills.frame();
    expect(mocks.postedRequests.map(({ requestKey }) => requestKey)).toEqual([
      requestA!.requestKey,
      requestB.requestKey,
      requestB.requestKey,
    ]);
    mocks.workerOptions!.onResponse(computeSectionCapWorkerResponse(mocks.postedRequests[2]!));
    fills.frame();

    expect(fills.performance().latestFrame).toMatchObject({ exactDiagnosticIsCurrent: true, pendingReason: 'none' });
  });
});
