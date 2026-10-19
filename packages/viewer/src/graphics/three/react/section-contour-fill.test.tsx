import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
import { SectionContourFills, sectionCapRenderPriority } from '#graphics/three/react/section-contour-fill.jsx';
import { ThreeGraphicsBackendProvider } from '#graphics/three/three-graphics-backend-context.jsx';
import { gltfEdgeHoverColor, sectionCapOpenChainColor } from '#graphics/three/overlay-colors.constants.js';
import { setModelComponentOwner } from '#graphics/three/utils/model-component-owner.js';
import { sectionCapStencilDebugUserDataKey } from '#graphics/three/utils/section-cap-stencil-debug.js';
import type { SectionCapStencilDiagnostics } from '#graphics/three/utils/section-cap-stencil-debug.js';
import type * as SurfaceTopologyModule from '#graphics/three/utils/section-surface-topology.js';
import { setGltfSectionSurfaceRegistrationState } from '#graphics/three/utils/section-surface-topology.js';
import { createSectionViewSafeSnapshotStore } from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet } from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';
import type * as ViewerEnvironmentModule from '#environment/viewer-environment.jsx';

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
  modelInteractionContext: undefined as ModelInteractionContext | undefined,
  collected: 0,
  span: vi.fn(),
}));

vi.mock('#environment/viewer-environment.jsx', async (importOriginal) => {
  const actual = await importOriginal<typeof ViewerEnvironmentModule>();
  return {
    ...actual,
    useViewerEnvironment: () => ({ ...actual.defaultViewerEnvironment, colorScheme: 'light' }),
    useViewerFeature: () => true,
  };
});

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphicsSelector: () => unitId,
  useModelInteractionRef: () => ({ getSnapshot: () => ({ context: mocks.modelInteractionContext }) }),
  useModelInteractionSelector: () => undefined,
}));

vi.mock('#graphics/three/utils/section-surface-topology.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SurfaceTopologyModule>();
  return {
    ...actual,
    collectSectionSurfaceSources(...parameters: Parameters<typeof actual.collectSectionSurfaceSources>) {
      mocks.collected++;
      return actual.collectSectionSurfaceSources(...parameters);
    },
  };
});

vi.mock('#lib/renderer-telemetry.js', () => ({ recordRendererSpan: mocks.span }));

const planeCut = (offset: number): SectionCut => ({ id: 'cut', kind: 'plane', plane: 'xy', offset, isFlipped: false });

const cutSetOf = (...cuts: SectionCut[]): SectionCutSet => ({ cuts, pieces: resolveSectionPieces(cuts) });

type Harness = Readonly<{
  inner: THREE.Group;
  gl: ReturnType<typeof mock<WebGLRenderer>>;
  /** Every cut list the caps reported committing, in order. */
  commits: Array<readonly SectionCut[]>;
  snapshotStore: ReturnType<typeof createSectionViewSafeSnapshotStore>;
  render: (cutSet: SectionCutSet) => Promise<void>;
  frame: () => void;
  root: () => THREE.Object3D;
  /** Every mesh the cap pass drew in its last render, by material name. */
  drawn: () => Map<string, THREE.Mesh[]>;
  unmount: () => void;
}>;

const mountFills = async (cutSet: SectionCutSet, meshes: readonly THREE.Mesh[]): Promise<Harness> => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const root = createRoot(canvas);
  const gl = mock<WebGLRenderer>();
  gl.domElement = canvas;
  gl.getPixelRatio.mockReturnValue(2);
  gl.getDrawingBufferSize.mockImplementation((target: THREE.Vector2) => target.set(1600, 1200));
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  camera.position.set(1, -2, 6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  await act(async () => {
    await root.configure({ camera, frameloop: 'never', gl, size: { height: 600, left: 0, top: 0, width: 800 } });
  });

  const inner = new THREE.Group();
  inner.add(...meshes);
  inner.updateMatrixWorld(true);
  const snapshotStore = createSectionViewSafeSnapshotStore();
  const commits: Array<readonly SectionCut[]> = [];
  let scene: THREE.Scene | undefined;
  const render = async (next: SectionCutSet): Promise<void> => {
    await act(async () => {
      const store = root.render(
        <ThreeGraphicsBackendProvider value='webgl'>
          <SectionContourFills
            enabled
            cutSet={next}
            innerRef={{ current: inner }}
            snapshotRef={{ current: snapshotStore }}
            stripeFrequency={2}
            stripeWidth={0.25}
            onCommit={(cuts) => commits.push(cuts)}
          />
        </ThreeGraphicsBackendProvider>,
      );
      scene = store.getState().scene;
    });
  };
  await render(cutSet);

  return {
    inner,
    gl,
    commits,
    snapshotStore,
    render,
    frame() {
      advance(performance.now());
    },
    root: () => scene!.children[0]!,
    drawn() {
      const [capScene] = gl.render.mock.calls.at(-1) ?? [];
      const byName = new Map<string, THREE.Mesh[]>();
      capScene?.traverse((object) => {
        if ((object as Partial<THREE.Mesh>).isMesh === true && object.visible) {
          const mesh = object as THREE.Mesh;
          const { name } = mesh.material as THREE.Material;
          byName.set(name, [...(byName.get(name) ?? []), mesh]);
        }
      });
      return byName;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      canvas.remove();
    },
  };
};

/** A 2 m cube with its +x face removed: an open shell whose horizontal cut is one open chain and no loop. */
const openBox = (): THREE.Mesh => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  // The first group is the +x face.
  geometry.setIndex([...geometry.getIndex()!.array].slice(6));
  geometry.clearGroups();
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
};

const outlineColors = (drawn: Map<string, THREE.Mesh[]>): number[] =>
  (drawn.get('TauSectionCapOutline') ?? []).map(({ material }) =>
    ((material as THREE.ShaderMaterial).uniforms['tauOutlineColor']!.value as THREE.Color).getHex(),
  );

const ownedBox = (): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x33_66_99 }));
  setModelComponentOwner(mesh, { unitId, componentId });
  return mesh;
};

describe('SectionContourFills', () => {
  let harness: Harness | undefined;

  beforeAll(() => {
    extend({ Group: THREE.Group });
  });

  beforeEach(() => {
    mocks.modelInteractionContext = createModelInteractionContext();
    mocks.collected = 0;
    mocks.span.mockClear();
  });

  afterEach(() => {
    harness?.unmount();
    harness = undefined;
  });

  it('should commit a cut through closed solids, then draw its exact caps after the model in one render', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    expect(harness.commits).toEqual([harness.snapshotStore.committed?.cutSet.cuts]);
    expect(harness.snapshotStore.committed?.kind).toBe('complete');
    expect(harness.gl.render).toHaveBeenCalledTimes(1);
    const drawn = harness.drawn();
    expect(drawn.get('TauSectionStencil:count-back')).toHaveLength(1);
    expect(drawn.get('TauSectionCap')).toHaveLength(1);
    expect(drawn.get('TauSectionCapOutline')).toHaveLength(1);
    expect(sectionCapRenderPriority).toBeGreaterThan(1);
    expect(sectionCapRenderPriority).toBeLessThan(1.4);
    const diagnostics = harness.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
    expect(diagnostics.latest).toMatchObject({ drawnPieceCount: 1, crossingSourceCount: 1 });
  });

  it('should commit each step of a drag and draw it, whatever the triangle count', async () => {
    const coarse = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4));
    harness = await mountFills(cutSetOf(planeCut(0.1)), [coarse]);
    harness.frame();
    const steps = [0.2, 0.3, -0.25].map((offset) => cutSetOf(planeCut(offset)));
    const counts: unknown[] = [];
    for (const step of steps) {
      // oxlint-disable-next-line no-await-in-loop -- each step renders and draws in turn.
      await harness.render(step);
      harness.frame();
      expect(harness.snapshotStore.committed?.cutSet).toBe(step);
      const { latest } = harness.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
      counts.push({ ...latest, submitMilliseconds: 0 });
    }
    expect(harness.commits).toEqual([planeCut(0.1), ...steps.flatMap(({ cuts }) => cuts)].map((cut) => [cut]));
    // The same draws for a sphere of 64 times the triangles.
    harness.inner.remove(coarse);
    harness.inner.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32)));
    await harness.render(steps[0]!);
    harness.frame();
    const { latest } = harness.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
    expect({ ...latest, submitMilliseconds: 0 }).toEqual(counts[0]);
  });

  it('should leave the commit alone on frames whose cuts and sources are unchanged', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    const { committed } = harness.snapshotStore;
    harness.frame();
    harness.frame();
    expect(harness.commits).toHaveLength(1);
    expect(harness.snapshotStore.committed).toBe(committed);
    expect(harness.gl.render).toHaveBeenCalledTimes(3);
  });

  it('should outline and tint a hovered component in its emphasis', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    mocks.modelInteractionContext = createModelInteractionContext(componentId);
    harness.frame();
    const [outline] = harness.drawn().get('TauSectionCapOutline')!;
    const { uniforms } = outline!.material as THREE.ShaderMaterial;
    expect((uniforms['tauOutlineColor']!.value as THREE.Color).getHex()).toBe(
      new THREE.Color(gltfEdgeHoverColor).getHex(),
    );
  });

  it('should commit a cut over an open shell and outline its open chain without a cap', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    const open = openBox();
    open.position.set(4, 0, 0);
    harness.inner.add(open);
    harness.inner.updateMatrixWorld(true);
    const cutSet = cutSetOf(planeCut(0.2));
    await harness.render(cutSet);

    await vi.waitFor(() => {
      harness!.frame();
      expect(outlineColors(harness!.drawn())).toContain(new THREE.Color(sectionCapOpenChainColor).getHex());
    });

    expect(harness.snapshotStore.committed?.cutSet).toBe(cutSet);
    expect(harness.commits.at(-1)).toBe(cutSet.cuts);
    expect(harness.root().userData['sectionCapCompleteness']).toMatchObject({
      status: 'complete',
      exactSourceCount: 1,
      perLoopSourceCount: 1,
      sources: expect.arrayContaining([
        expect.objectContaining({ grade: 'per-loop', reason: 'open-surface' }),
      ]) as unknown,
    });
    // The open box closes no loop: nothing of it is counted, so its cap polygon fills no pixel.
    expect(harness.drawn().get('TauSectionStencil:count-parity')).toBeUndefined();
    expect(harness.drawn().get('TauSectionStencil:count-back')).toHaveLength(1);
    const { loops } = harness.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
    expect(loops).toEqual([
      expect.objectContaining({ closedLoopCount: 0, openChainCount: 1, pendingFaceCount: 0, failure: undefined }),
    ]);
    expect(mocks.span).toHaveBeenCalledWith(
      'renderer.section-cap-graded',
      expect.objectContaining({
        attributes: expect.objectContaining({ grade: 'per-loop', closedLoopCount: 0, openChainCount: 1 }) as unknown,
      }),
    );
  });

  it('should cap the meshes of a model whose registration failed per loop, without building their topology', async () => {
    const model = new THREE.Group();
    model.add(ownedBox());
    setGltfSectionSurfaceRegistrationState(model, 'unsupported');
    harness = await mountFills(cutSetOf(planeCut(0.1)), []);
    harness.inner.add(model);
    harness.inner.updateMatrixWorld(true);

    await vi.waitFor(() => {
      harness!.frame();
      expect(harness!.drawn().get('TauSectionStencil:count-parity')).toHaveLength(1);
    });

    expect(harness.snapshotStore.committed?.kind).toBe('complete');
    expect(harness.drawn().get('TauSectionCap')).toHaveLength(1);
    expect(outlineColors(harness.drawn())).not.toContain(new THREE.Color(sectionCapOpenChainColor).getHex());
    expect(mocks.span).toHaveBeenCalledWith(
      'renderer.section-source-unsupported',
      expect.objectContaining({ attributes: expect.objectContaining({ code: 'topology-unavailable' }) as unknown }),
    );
  });

  it('should commit at once while a model is still preparing, leaving its meshes uncapped', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    const pending = new THREE.Group();
    pending.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    setGltfSectionSurfaceRegistrationState(pending, 'pending');
    harness.inner.add(pending);
    const next = cutSetOf(planeCut(0.3));
    await harness.render(next);
    harness.frame();

    expect(harness.snapshotStore.committed?.cutSet).toBe(next);
    expect(harness.commits.at(-1)).toBe(next.cuts);
    expect(harness.root().userData['sectionCapCompleteness']).toMatchObject({
      exactSourceCount: 1,
      pendingSourceCount: 1,
    });
    // Only the closed box counts into the stencil; the pending mesh is cut and outlined, not capped.
    expect(harness.drawn().get('TauSectionStencil:count-back')).toHaveLength(1);
    expect(harness.drawn().get('TauSectionStencil:count-parity')).toBeUndefined();
    expect(harness.drawn().get('TauSectionCapOutline')).toHaveLength(2);
  });

  it('should grade a large standalone mesh again once its census lands, without the cut changing', async () => {
    // Above the synchronous limit, so its census waits on the worker; without one it lands as unavailable, per loop.
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 80), new THREE.MeshBasicMaterial());
    const cutSet = cutSetOf(planeCut(0.2));
    harness = await mountFills(cutSet, [sphere]);
    harness.frame();
    const grades = () =>
      (harness!.root().userData['sectionCapCompleteness'] as { sources: Array<{ grade: string }> }).sources.map(
        ({ grade }) => grade,
      );
    expect(grades()).toEqual(['pending']);

    await vi.waitFor(() => {
      harness!.frame();
      expect(grades()).toEqual(['per-loop']);
    });
    expect(harness.snapshotStore.committed?.cutSet).toBe(cutSet);
    expect(harness.commits).toEqual([cutSet.cuts]);
  });

  it('should show the back faces of a per-loop source while it is cut, and only then', async () => {
    const open = openBox();
    const material = open.material as THREE.Material;
    const closed = ownedBox();
    harness = await mountFills(cutSetOf(planeCut(0.2)), [closed, open]);
    harness.frame();

    expect(material.side).toBe(THREE.DoubleSide);
    expect((closed.material as THREE.Material).side).toBe(THREE.FrontSide);

    await harness.render({ cuts: [], pieces: [] });
    harness.frame();
    expect(material.side).toBe(THREE.FrontSide);

    await harness.render(cutSetOf(planeCut(0.2)));
    harness.frame();
    expect(material.side).toBe(THREE.DoubleSide);
    harness.unmount();
    harness = undefined;
    expect(material.side).toBe(THREE.FrontSide);
  });

  it('should cap a closed source shown in part per loop, from its visible triangles only', async () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    // BoxGeometry's groups: +x, -x, +y, -y, +z, -z. Hiding the +x material opens the cut at +x.
    const shown = new THREE.MeshBasicMaterial();
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geometry, [hidden, shown, shown, shown, shown, shown]);
    harness = await mountFills(cutSetOf(planeCut(0.2)), [mesh]);

    await vi.waitFor(() => {
      harness!.frame();
      const { loops } = harness!.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
      expect(loops).toEqual([expect.objectContaining({ pendingFaceCount: 0 })]);
    });

    expect(harness.root().userData['sectionCapCompleteness']).toMatchObject({
      sources: [expect.objectContaining({ grade: 'per-loop', reason: 'partial-visibility' })],
    });
    const { loops } = harness.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
    expect(loops[0]).toMatchObject({ closedLoopCount: 0, openChainCount: 1 });
  });

  it('should slice a posed per-loop source where it is drawn now', async () => {
    const open = openBox();
    harness = await mountFills(cutSetOf(planeCut(0.2)), [open]);
    await vi.waitFor(() => {
      harness!.frame();
      expect(outlineColors(harness!.drawn())).toContain(new THREE.Color(sectionCapOpenChainColor).getHex());
    });
    const openChainDraws = () =>
      harness!
        .drawn()
        .get('TauSectionCapOutline')!
        .filter(({ material }) =>
          ((material as THREE.ShaderMaterial).uniforms['tauOutlineColor']!.value as THREE.Color).equals(
            new THREE.Color(sectionCapOpenChainColor),
          ),
        );
    const lastSlice = () =>
      (harness!.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics).loops[0]!.lastSlice;
    const before = lastSlice();

    // A kinematic pose lifts the part by 0.5 after it was graded: the cut crosses it elsewhere in its own frame, so it
    // is sliced again, and its open chain is drawn where the part is now.
    open.position.z = 0.5;
    open.updateMatrixWorld(true);
    await vi.waitFor(() => {
      harness!.frame();
      expect(lastSlice()).not.toBe(before);
      const [after] = openChainDraws();
      expect(after!.matrixWorld.elements[14]).toBeCloseTo(0.5);
    });
  });

  it('should draw nothing with no cut', async () => {
    harness = await mountFills({ cuts: [], pieces: [] }, [ownedBox()]);
    harness.frame();
    expect(harness.snapshotStore.committed?.kind).toBe('uncut');
    expect(harness.gl.render).not.toHaveBeenCalled();
    expect(mocks.collected).toBe(1);
  });
});
