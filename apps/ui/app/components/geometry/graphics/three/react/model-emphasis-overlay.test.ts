// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Color,
  CustomBlending,
  DepthFormat,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  PerspectiveCamera,
  Plane,
  Scene,
} from 'three';
import type { Group, WebGLRenderer } from 'three';
import {
  createModelEmphasisResources,
  modelEmphasisMaskSamples,
  modelEmphasisMaskPriority,
  modelEmphasisOverlayPriority,
  renderModelEmphasisMask,
  syncModelEmphasisFrame,
  syncModelEmphasisProxies,
} from '#components/geometry/graphics/three/react/model-emphasis-overlay.js';
import {
  emptyModelEmphasisSet,
  getModelEmphasisSet,
  setModelEmphasisSet,
} from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';

const makeSource = (metalness = 0.7): Mesh => new Mesh(new BoxGeometry(), new MeshStandardMaterial({ metalness }));
const emptyCamera = new PerspectiveCamera();

/** Records the order of the render-target and draw calls the mask pass makes. */
const makeRecordingRenderer = (): { gl: WebGLRenderer; calls: string[] } => {
  const calls: string[] = [];
  const gl = {
    getRenderTarget: () => null,
    getClearColor: (target: Color) => target,
    getClearAlpha: () => 1,
    setRenderTarget: (target: unknown) => calls.push(target === null ? 'unbind' : 'bind-mask'),
    setClearColor: () => undefined,
    clear: () => calls.push('clear'),
    render: () => calls.push('draw'),
    autoClear: true,
  } as unknown as WebGLRenderer;
  return { gl, calls };
};

describe('model emphasis overlay resources', () => {
  it('proxies each emphasised mesh into both mask layers and the wash group, sharing six materials', () => {
    const resources = createModelEmphasisResources('webgl');
    const hovered = makeSource();
    const selected = makeSource();

    syncModelEmphasisProxies(resources, { hover: [hovered], selected: [selected] });

    // One coverage proxy and one visibility proxy per emphasised mesh, drawn in a single pass.
    expect(resources.maskScene.children).toHaveLength(4);
    const washGroup = resources.overlayGroup.children[0] as Group;
    expect(washGroup.children).toHaveLength(2);
    const [hoverMask, hoverVisibility, selectedMask] = resources.maskScene.children as Mesh[];
    expect(hoverMask!.material).toBe(resources.mask.coverage.hover);
    expect(hoverVisibility!.material).toBe(resources.mask.visibility.hover);
    expect(selectedMask!.material).toBe(resources.mask.coverage.selected);
    expect(hoverMask!.geometry).toBe(hovered.geometry);
    // The wash never touches the source material, so metalness/maps/vertex colours are irrelevant.
    expect((washGroup.children[0] as Mesh).material).toBe(resources.wash.hover);
    expect(hovered.material).toBeInstanceOf(MeshStandardMaterial);
    expect(resources.wash.selected.opacity).toBeGreaterThan(resources.wash.hover.opacity);

    syncModelEmphasisProxies(resources, emptyModelEmphasisSet);
    expect(resources.maskScene.children).toHaveLength(0);
    expect(resources.proxies).toHaveLength(0);
    resources.dispose();
  });

  it('follows source world transforms and clipping without traversing the scene', () => {
    const resources = createModelEmphasisResources('webgpu');
    const source = makeSource();
    const plane = new Plane();
    (source.material as MeshStandardMaterial).clippingPlanes = [plane];
    source.position.set(1, 2, 3);
    source.updateMatrixWorld(true);
    syncModelEmphasisProxies(resources, { hover: [], selected: [source] });

    syncModelEmphasisFrame(resources);

    const proxy = resources.maskScene.children[0] as Mesh;
    expect(proxy.matrixWorld.equals(new Matrix4().makeTranslation(1, 2, 3))).toBe(true);
    expect(proxy.matrixWorldAutoUpdate).toBe(false);
    expect(resources.wash.selected.clippingPlanes).toEqual([plane]);
    expect(resources.mask.coverage.selected.clippingPlanes).toEqual([plane]);
    // The visibility layer answers for the uncut solid, so a section cap counts as part surface.
    expect(resources.mask.visibility.selected.clippingPlanes).toBeNull();
    expect(resources.mask.visibility.hover.clippingPlanes).toBeNull();
    resources.dispose();
  });

  it('gives each mask layer and state its own channel, added without touching the others', () => {
    const resources = createModelEmphasisResources('webgl');
    const channel = (material: { color: Color; opacity: number }): [number, number, number, number] => [
      material.color.r,
      material.color.g,
      material.color.b,
      material.opacity,
    ];
    expect(channel(resources.mask.coverage.hover)).toEqual([1, 0, 0, 0]);
    expect(channel(resources.mask.coverage.selected)).toEqual([0, 1, 0, 0]);
    expect(channel(resources.mask.visibility.hover)).toEqual([0, 0, 1, 0]);
    expect(channel(resources.mask.visibility.selected)).toEqual([0, 0, 0, 1]);
    for (const layer of ['coverage', 'visibility'] as const) {
      for (const material of Object.values(resources.mask[layer])) {
        // Additive blending would scale the colour by the alpha the visibility layer carries.
        expect(material.blending).toBe(CustomBlending);
        expect([material.blendSrc, material.blendDst, material.blendSrcAlpha, material.blendDstAlpha]).toEqual([
          OneFactor,
          OneFactor,
          OneFactor,
          OneFactor,
        ]);
        expect(material.depthWrite).toBe(false);
        expect(material.depthTest).toBe(layer === 'visibility');
      }
    }
    resources.dispose();
  });

  it('multisamples coverage, so the silhouette gets a fractional edge instead of a staircase', () => {
    // Coverage written from one sample per pixel can only be 0 or 1, and the composite's
    // difference is then 0 or 1 too — a hard 2px staircase. Resolving several samples gives the
    // boundary pixels a fraction, which is the outline's antialiasing.
    const resources = createModelEmphasisResources('webgl');
    expect(modelEmphasisMaskSamples).toBeGreaterThan(1);
    expect(resources.maskTarget.samples).toBe(modelEmphasisMaskSamples);
    // Nothing ever samples the mask's depth; skipping its resolve keeps that blit off the frame.
    expect(resources.maskTarget.resolveDepthBuffer).toBe(false);
    resources.dispose();
  });

  it("resolves visibility with the frame's own depth, restored into the mask target", () => {
    const resources = createModelEmphasisResources('webgl');
    syncModelEmphasisProxies(resources, { hover: [], selected: [makeSource()] });
    const { gl, calls } = makeRecordingRenderer();
    const restored: unknown[] = [];

    renderModelEmphasisMask(resources, {
      gl,
      camera: emptyCamera,
      restoreDepth: (target) => {
        restored.push(target);
        calls.push('restore-depth');
      },
      previousClear: new Color(),
    });

    // 24-bit depth, matching the canvas the restored values come from.
    expect(resources.maskTarget.depthBuffer).toBe(true);
    expect(resources.maskTarget.depthTexture?.format).toBe(DepthFormat);
    expect(restored).toEqual([resources.maskTarget]);
    // Clear, stamp the frame's depth, then one draw of both layers. A second `gl.render` would
    // cost a second multisample resolve of a device-resolution target.
    expect(calls).toEqual(['bind-mask', 'clear', 'restore-depth', 'draw', 'unbind']);
    expect(gl.autoClear).toBe(true);
    // Both layers are their own proxy of the one source, so neither has to swap a material.
    const [coverage, visibility] = resources.maskScene.children as Mesh[];
    expect(coverage!.material).toBe(resources.mask.coverage.selected);
    expect(visibility!.material).toBe(resources.mask.visibility.selected);
    expect(coverage!.geometry).toBe(visibility!.geometry);
    resources.dispose();
  });

  it('keeps every emphasis proxy at geometric depth so none of them can tie the biased surface', () => {
    // The surface is the only thing pushed back; overlays win by the slope-scaled margin the
    // characteristic edges already rely on. Copying the surface's bias made the pass/fail an
    // exact `LEQUAL` tie, and a derivative-based `gl_FragDepth` is not reproducible across draws.
    const resources = createModelEmphasisResources('webgl');
    for (const material of [resources.wash.hover, resources.wash.selected, resources.mask.coverage.hover]) {
      expect(material.polygonOffset).toBe(false);
      expect(material.onBeforeCompile.toString()).not.toContain('logdepthbuf_fragment');
    }
    expect(resources.wash.hover.depthTest).toBe(true);
    expect(resources.wash.hover.depthWrite).toBe(false);
    resources.dispose();
  });

  it('measures coverage as occupancy, so a section-clipped open shell reports no interior holes', () => {
    // Front-side coverage culls the back faces a section cut exposes, which punches holes into
    // the mask; the composite then draws the component's tessellation across the section cap.
    const resources = createModelEmphasisResources('webgl');
    for (const material of [
      resources.mask.coverage.hover,
      resources.mask.coverage.selected,
      resources.mask.visibility.hover,
      resources.mask.visibility.selected,
      resources.wash.hover,
      resources.wash.selected,
    ]) {
      expect(material.side).toBe(DoubleSide);
    }
    resources.dispose();
  });

  it('renders the mask after the main pass and the overlay before grid/axes', () => {
    expect(modelEmphasisMaskPriority).toBeGreaterThan(1);
    expect(modelEmphasisOverlayPriority).toBeGreaterThan(modelEmphasisMaskPriority);
    expect(modelEmphasisOverlayPriority).toBeLessThan(2);
  });

  it('disposes the mask target, composite and shared materials once', () => {
    const resources = createModelEmphasisResources('webgl');
    const disposeTarget = vi.spyOn(resources.maskTarget, 'dispose');
    const disposeComposite = vi.spyOn(resources.composite, 'dispose');
    resources.dispose();
    expect(disposeTarget).toHaveBeenCalledTimes(1);
    expect(disposeComposite).toHaveBeenCalledTimes(1);
  });
});

describe('model emphasis registry', () => {
  it('publishes only when the emphasised mesh set actually changes', () => {
    const root = new Scene();
    const mesh = makeSource();
    const listener = vi.fn();
    // Subscribe through the same store the hook uses.
    const set = { hover: [mesh], selected: [] };
    setModelEmphasisSet(root, set);
    expect(getModelEmphasisSet(root).hover).toEqual([mesh]);
    setModelEmphasisSet(root, { hover: [mesh], selected: [] });
    expect(getModelEmphasisSet(root)).toBe(set);
    setModelEmphasisSet(root, { hover: [], selected: [] });
    expect(getModelEmphasisSet(root)).toBe(emptyModelEmphasisSet);
    expect(listener).not.toHaveBeenCalled();
  });
});
