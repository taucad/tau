import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { SectionContourFills } from '#components/geometry/graphics/three/react/section-contour-fill.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import type { CreateSectionCapOverlapWorkerClientOptions } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type * as WorkerClientModule from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type { SectionCapWorkerRequest } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { sectionCapPerformanceDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type { SectionCapPerformanceDebugSummary } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { createSectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
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

type FillProperties = Readonly<{
  backend: ResolvedGraphicsBackend;
  plane: THREE.Plane;
  stripeFrequency: number;
  stripeWidth: number;
}>;

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
  /** GPU upload versions of the owned box's cap: fill positions and colours, and outline segments. */
  uploads(): Readonly<{ fillPositions: number; fillColors: number; outline: number }>;
  performance(): SectionCapPerformanceDebugSummary;
  unmount(): void;
}>;

const versionOf = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number =>
  attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;

const defaultProperties: FillProperties = {
  backend: 'webgl',
  plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  stripeFrequency: 2,
  stripeWidth: 0.4,
};

const mountFills = async (): Promise<Harness> => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const root = createRoot(canvas);
  const gl = mock<WebGLRenderer>();
  gl.domElement = canvas;
  const configure = async (width: number, height: number): Promise<void> => {
    await act(async () => {
      await root.configure({
        camera: new THREE.PerspectiveCamera(50, width / height, 0.1, 100),
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

  let properties = defaultProperties;
  let scene: THREE.Scene | undefined;
  const render = async (overrides: Partial<FillProperties> = {}): Promise<void> => {
    properties = { ...properties, ...overrides };
    await act(async () => {
      const store = root.render(
        <ThreeGraphicsBackendProvider value={properties.backend}>
          <SectionContourFills
            enabled
            innerRef={innerRef}
            plane={properties.plane}
            snapshotRef={snapshotRef}
            stripeFrequency={properties.stripeFrequency}
            stripeWidth={properties.stripeWidth}
          />
        </ThreeGraphicsBackendProvider>,
      );
      scene = store.getState().scene;
    });
  };
  await render();

  const fillsRoot = (): THREE.Object3D => scene!.children[0]!;
  const helperOf = (type: 'Mesh' | 'LineSegments2'): THREE.Mesh => {
    const helper = fillsRoot().children.find(
      (child): child is THREE.Mesh => child.type === type && child instanceof THREE.Mesh,
    );
    if (!helper) {
      throw new TypeError(`Expected a drawn ${type} helper.`);
    }
    return helper;
  };

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
    uploads() {
      const fill = helperOf('Mesh').geometry;
      return {
        fillPositions: versionOf(fill.getAttribute('position')),
        fillColors: versionOf(fill.getAttribute('aCapBaseColor')),
        outline: versionOf(helperOf('LineSegments2').geometry.getAttribute('instanceStart')),
      };
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
  });

  afterEach(() => {
    harness?.unmount();
    harness = undefined;
  });

  const mountAndSettle = async (): Promise<Harness> => {
    harness = await mountFills();
    harness.frame();
    harness.frame();
    return harness;
  };

  it('should leave the drawn caps as they are when nothing they are drawn from changed', async () => {
    const fills = await mountAndSettle();
    const uploads = fills.uploads();
    const { committed } = fills.snapshotStore;
    const appliedFrame = fills.performance().latestFrame;

    fills.frame();

    expect(fills.uploads()).toEqual(uploads);
    expect(fills.snapshotStore.committed).toBe(committed);
    const { history, latestFrame } = fills.performance();
    expect(history.at(-1)).toMatchObject({
      counters: { skippedFrameCount: 1, uploadedByteCount: 0, workerRequestCount: 0 },
      timings: { capPolygonBuild: 0, geometryPack: 0, borderWrite: 0, gpuBufferWrite: 0, materialUpdate: 0 },
    });
    // The latest frame keeps describing what is drawn.
    expect(latestFrame).toBe(appliedFrame);
    expect(latestFrame.counters.skippedFrameCount).toBe(0);
  });

  it.each<readonly [string, (fills: Harness) => Promise<void> | void]>([
    [
      'the plane',
      async (fills) => {
        await fills.render({ plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.25) });
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
    expect(fills.uploads().fillPositions).toBeGreaterThan(uploads.fillPositions);
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

    expect(fills.uploads().fillColors).toBeGreaterThan(uploads.fillColors);
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
      planeKey: request!.planeKey,
      sourceSetKey: request!.sourceSetKey,
      message: 'worker failed',
    });
    fills.frame();

    expect(mocks.postedRequests.map(({ requestKey }) => requestKey)).toEqual([
      request!.requestKey,
      request!.requestKey,
    ]);
  });
});
