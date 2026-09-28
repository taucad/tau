import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import { resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut } from '#components/geometry/graphics/section-cuts.js';
import { SectionContourFills } from '#components/geometry/graphics/three/react/section-contour-fill.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import type { CreateSectionCapOverlapWorkerClientOptions } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type * as WorkerClientModule from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type { SectionCapWorkerRequest } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import { createSectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

const unitId = 'unit:main';

const mocks = vi.hoisted(() => ({
  hasWorker: false,
  workerOptions: undefined as CreateSectionCapOverlapWorkerClientOptions | undefined,
  postedRequests: [] as SectionCapWorkerRequest[],
}));

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsSelector: () => unitId,
  useModelInteractionRef: () => ({
    getSnapshot: () => ({
      context: {
        unitsById: {
          [unitId]: {
            hoveredComponentId: undefined,
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
      },
    }),
  }),
  useModelInteractionSelector: () => undefined,
}));

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));

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

/** Removes z < 0: the XY cap lies on z = 0 and shows the box above it. */
const xyCut: SectionCut = { id: 'cut-a', kind: 'plane', plane: 'xy', offset: 0, isFlipped: true };

/**
 * A quarter cutaway about Z through the box centre. Its trim of the square XY cap has the same
 * area, bounds and point counts at almost every start angle, so only the trim itself tells them apart.
 */
const quarterCutaway = (start: number): SectionCut => ({
  id: 'cut-q',
  kind: 'revolution',
  axis: 'z',
  origin: [0, 0, 0],
  start,
  sweep: 90,
});

const cutSetOf = (...cuts: SectionCut[]): SectionCutSet => ({ cuts, pieces: resolveSectionPieces(cuts) });

type Point = readonly [number, number];

type Harness = Readonly<{
  render(cuts: SectionCut[]): Promise<void>;
  frame(): void;
  /** Whether the XY cap's fill covers the point on z = 0. */
  fillCovers(point: Point): boolean;
  /** Whether the XY cap's outline passes through the point on z = 0. */
  outlineTouches(point: Point): boolean;
  unmount(): void;
}>;

// A guard, rather than `instanceof` inline, which would narrow to the class's `any` type arguments.
const isMesh = (object: THREE.Object3D): object is THREE.Mesh => object instanceof THREE.Mesh;

type Triangle = readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];

const isInTriangle = (point: Point, [a, b, c]: Triangle): boolean => {
  const side = (p: Point, q: THREE.Vector3, r: THREE.Vector3): number =>
    (p[0] - r.x) * (q.y - r.y) - (q.x - r.x) * (p[1] - r.y);
  const d1 = side(point, a, b);
  const d2 = side(point, b, c);
  const d3 = side(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
};

const mountFills = async (cuts: SectionCut[]): Promise<Harness> => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const root = createRoot(canvas);
  const gl = mock<WebGLRenderer>();
  gl.domElement = canvas;
  await act(async () => {
    await root.configure({
      camera: new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100),
      frameloop: 'never',
      gl,
      size: { height: 600, left: 0, top: 0, width: 800 },
    });
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x33_66_99 }));
  setModelComponentOwner(box, { unitId, componentId: 'component:block' });
  const inner = new THREE.Group();
  inner.add(box);
  const innerRef = { current: inner };
  const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
  let scene: THREE.Scene | undefined;
  const render = async (next: SectionCut[]): Promise<void> => {
    await act(async () => {
      const store = root.render(
        <ThreeGraphicsBackendProvider value='webgl'>
          <SectionContourFills
            enabled
            cutSet={cutSetOf(...next)}
            innerRef={innerRef}
            snapshotRef={snapshotRef}
            stripeFrequency={2}
            stripeWidth={0.4}
            onCertify={() => undefined}
          />
        </ThreeGraphicsBackendProvider>,
      );
      scene = store.getState().scene;
    });
  };
  await render(cuts);

  /** The visible helpers of the XY cut's face: `${faceKey}|${sourceKey}`. */
  const xyHelpers = (): THREE.Mesh[] => {
    const found: THREE.Mesh[] = [];
    scene!.traverse((child) => {
      if (isMesh(child) && child.name.startsWith('cut-a:0|') && child.visible) {
        found.push(child);
      }
    });
    return found;
  };

  return {
    render,
    frame() {
      act(() => {
        advance(performance.now());
      });
    },
    fillCovers(point) {
      const fill = xyHelpers().find((child) => child.type !== 'LineSegments2');
      if (!fill) {
        return false;
      }
      fill.updateWorldMatrix(true, false);
      const position = fill.geometry.getAttribute('position');
      const index = fill.geometry.getIndex()!;
      const count = Math.min(fill.geometry.drawRange.count, index.count);
      const vertex = (i: number): THREE.Vector3 =>
        new THREE.Vector3().fromBufferAttribute(position, index.getX(i)).applyMatrix4(fill.matrixWorld);
      for (let t = 0; t + 2 < count; t += 3) {
        if (isInTriangle(point, [vertex(t), vertex(t + 1), vertex(t + 2)])) {
          return true;
        }
      }
      return false;
    },
    outlineTouches(point) {
      const outline = xyHelpers().find((child) => child.type === 'LineSegments2');
      if (!outline) {
        return false;
      }
      outline.updateWorldMatrix(true, false);
      const start = outline.geometry.getAttribute('instanceStart');
      const end = outline.geometry.getAttribute('instanceEnd');
      const { instanceCount } = outline.geometry as THREE.InstancedBufferGeometry;
      const target = new THREE.Vector3(point[0], point[1], 0);
      for (let i = 0; i < instanceCount; i++) {
        const a = new THREE.Vector3().fromBufferAttribute(start, i).applyMatrix4(outline.matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(end, i).applyMatrix4(outline.matrixWorld);
        if (new THREE.Line3(a, b).closestPointToPoint(target, true, new THREE.Vector3()).distanceTo(target) < 1e-4) {
          return true;
        }
      }
      return false;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      canvas.remove();
    },
  };
};

describe('SectionContourFills trim', () => {
  let harness: Harness | undefined;

  beforeAll(() => {
    extend({ Group: THREE.Group });
  });

  beforeEach(() => {
    mocks.hasWorker = false;
    mocks.workerOptions = undefined;
    mocks.postedRequests = [];
  });

  afterEach(() => {
    harness?.unmount();
    harness = undefined;
  });

  it('should redraw the exact fill when a cutaway turns 0° to 180° under an unchanged source summary', async () => {
    harness = await mountFills([xyCut, quarterCutaway(0)]);
    harness.frame();
    harness.frame();

    await harness.render([xyCut, quarterCutaway(180)]);
    harness.frame();
    harness.frame();

    expect({ q1: harness.fillCovers([0.5, 0.5]), q3: harness.fillCovers([-0.5, -0.5]) }).toEqual({
      q1: true,
      q3: false,
    });
    expect({ alongQ3Axes: harness.outlineTouches([-0.5, 0]), alongQ1Axes: harness.outlineTouches([0.5, 0]) }).toEqual({
      alongQ3Axes: true,
      alongQ1Axes: false,
    });
  });

  it('should use the worker answer for the new trim when a cutaway turns 0° to 30°', async () => {
    mocks.hasWorker = true;
    harness = await mountFills([xyCut, quarterCutaway(0)]);
    harness.frame();
    const answer = (): void => {
      const request = mocks.postedRequests.at(-1)!;
      act(() => {
        mocks.workerOptions!.onResponse(computeSectionCapWorkerResponse(request));
      });
      harness!.frame();
    };
    answer();
    const postedBefore = mocks.postedRequests.length;

    await harness.render([xyCut, quarterCutaway(30)]);
    harness.frame();
    expect(mocks.postedRequests).toHaveLength(postedBefore + 1);
    answer();
    harness.frame();

    // (0.8, 0.2) is at 14°: cut away at 0°, kept at 30°. (-0.25, 0.9) is at 106°: kept at 0°, cut away at 30°.
    expect({ at14: harness.fillCovers([0.8, 0.2]), at106: harness.fillCovers([-0.25, 0.9]) }).toEqual({
      at14: true,
      at106: false,
    });
    expect(harness.outlineTouches([0.5 * Math.cos(Math.PI / 6), 0.5 * Math.sin(Math.PI / 6)])).toBe(true);
  });
});
