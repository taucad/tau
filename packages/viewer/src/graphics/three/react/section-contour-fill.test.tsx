import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
import { SectionContourFills, sectionCapRenderPriority } from '#graphics/three/react/section-contour-fill.jsx';
import type { SectionCertification } from '#graphics/three/react/section-contour-fill.jsx';
import { ThreeGraphicsBackendProvider } from '#graphics/three/three-graphics-backend-context.jsx';
import { gltfEdgeHoverColor } from '#graphics/three/overlay-colors.constants.js';
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
  warning: vi.fn(),
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

vi.mock('@taucad/ui/components/sonner', () => ({ toast: { warning: mocks.warning, error: vi.fn() } }));

const planeCut = (offset: number): SectionCut => ({ id: 'cut', kind: 'plane', plane: 'xy', offset, isFlipped: false });

const cutSetOf = (...cuts: SectionCut[]): SectionCutSet => ({ cuts, pieces: resolveSectionPieces(cuts) });

type Harness = Readonly<{
  inner: THREE.Group;
  gl: ReturnType<typeof mock<WebGLRenderer>>;
  certifications: SectionCertification[];
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
  const certifications: SectionCertification[] = [];
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
            onCertify={(certification) => certifications.push(certification)}
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
    certifications,
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
    mocks.warning.mockClear();
  });

  afterEach(() => {
    harness?.unmount();
    harness = undefined;
  });

  it('should certify a cut through closed solids, then draw its caps after the model in one render', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    expect(harness.certifications).toEqual([
      { status: 'certified', cuts: harness.snapshotStore.committed?.cutSet.cuts },
    ]);
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
    expect(harness.certifications.map(({ status }) => status)).toEqual([
      'certified',
      'certified',
      'certified',
      'certified',
    ]);
    // The same draws for a sphere of 64 times the triangles.
    harness.inner.remove(coarse);
    harness.inner.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32)));
    await harness.render(steps[0]!);
    harness.frame();
    const { latest } = harness.root().userData[sectionCapStencilDebugUserDataKey] as SectionCapStencilDiagnostics;
    expect({ ...latest, submitMilliseconds: 0 }).toEqual(counts[0]);
  });

  it('should leave the certification alone on frames whose cuts and sources are unchanged', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    const { committed } = harness.snapshotStore;
    harness.frame();
    harness.frame();
    expect(harness.certifications).toHaveLength(1);
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

  it('should refuse a cut set over an open shell with a span and one warning', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    const open = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    open.position.set(4, 0, 0);
    harness.inner.add(open);
    harness.inner.updateMatrixWorld(true);
    await harness.render(cutSetOf(planeCut(0.2)));
    harness.gl.render.mockClear();
    harness.frame();
    harness.frame();
    expect(harness.certifications.at(-1)?.status).toBe('rejected');
    expect(harness.snapshotStore.rejection?.failure.code).toBe('open-surface');
    // The sources changed, so nothing stays committed and nothing is capped.
    expect(harness.snapshotStore.committed).toBeUndefined();
    expect(harness.gl.render).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledTimes(1);
    expect(mocks.span).toHaveBeenCalledWith(
      'renderer.section-cap-refused',
      expect.objectContaining({ attributes: expect.objectContaining({ code: 'open-surface' }) as unknown }),
    );
  });

  it('should refuse the meshes of a model whose registration failed, without building them one by one', async () => {
    const model = new THREE.Group();
    model.add(ownedBox());
    setGltfSectionSurfaceRegistrationState(model, 'unsupported');
    harness = await mountFills(cutSetOf(planeCut(0.1)), []);
    harness.inner.add(model);
    harness.inner.updateMatrixWorld(true);
    harness.frame();
    expect(harness.snapshotStore.rejection?.failure.code).toBe('topology-unavailable');
    expect(mocks.span).toHaveBeenCalledWith(
      'renderer.section-source-unsupported',
      expect.objectContaining({ attributes: expect.objectContaining({ code: 'topology-unavailable' }) as unknown }),
    );
  });

  it('should keep the committed caps while a model is still preparing', async () => {
    harness = await mountFills(cutSetOf(planeCut(0.1)), [ownedBox()]);
    harness.frame();
    const { committed } = harness.snapshotStore;
    const pending = new THREE.Group();
    pending.add(new THREE.Mesh(new THREE.BoxGeometry()));
    setGltfSectionSurfaceRegistrationState(pending, 'pending');
    harness.inner.add(pending);
    await harness.render(cutSetOf(planeCut(0.3)));
    harness.frame();
    expect(harness.snapshotStore.committed).toBe(committed);
    expect(harness.gl.render).toHaveBeenCalledTimes(2);
  });

  it('should draw nothing with no cut', async () => {
    harness = await mountFills({ cuts: [], pieces: [] }, [ownedBox()]);
    harness.frame();
    expect(harness.snapshotStore.committed?.kind).toBe('uncut');
    expect(harness.gl.render).not.toHaveBeenCalled();
    expect(mocks.collected).toBe(1);
  });
});
