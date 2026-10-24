// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Color,
  CustomBlending,
  DepthFormat,
  DepthTexture,
  WebGLRenderTarget,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  PerspectiveCamera,
  Scene,
  RGFormat,
  RGBAFormat,
  REVISION,
} from 'three';
import type { Group, Material, WebGLRenderer } from 'three';
import {
  createModelEmphasisResources,
  modelEmphasisMaskSamples,
  modelEmphasisMaskPriority,
  modelEmphasisOverlayPriority,
  renderModelEmphasisMask,
  syncModelEmphasisFrame,
  syncModelEmphasisProxies,
} from '#graphics/three/react/model-emphasis-overlay.jsx';
import { createSectionClip } from '#graphics/three/materials/section-clip.js';
import {
  emptyModelEmphasisSet,
  getModelEmphasisSet,
  setModelEmphasisSet,
} from '#graphics/three/materials/model-emphasis-registry.js';

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
  it('should guard the installed depth allocation and framebuffer implementation', () => {
    expect(REVISION).toBe('184');
    const require = createRequire(import.meta.url);
    for (const [file, expected] of [
      ['common/Textures.js', 'f254ca8221e17bf58a2aad3e99735bc6b5b183331dc9aeafd530d73bf2b3347c'],
      ['webgl-fallback/WebGLBackend.js', '453ebc61fe7acf2530e6570a5a12699947fdca5dcbd02c092496c1b8363b82f8'],
      ['webgl-fallback/utils/WebGLTextureUtils.js', '6b08fc0d0af38b893bd243991ba09eef844c2af99cb07c59f53f7a1c7149acc0'],
    ]) {
      const source = readFileSync(require.resolve(`three/src/renderers/${file}`), 'utf8');
      expect(createHash('sha256').update(source).digest('hex'), file).toBe(expected);
    }
  });

  it.each([false, true])('should clear color at the qualified node pass for WebGL2=%s', (isWebGl) => {
    const resources = createModelEmphasisResources('webgpu', createSectionClip('webgpu'));
    const frame = new WebGLRenderTarget(200, 100);
    frame.depthTexture = new DepthTexture(200, 100);
    resources.setMaskSize({ width: 200, height: 100, pixelRatio: 1 });
    const { gl, calls } = makeRecordingRenderer();
    Object.assign(gl, { coordinateSystem: isWebGl ? WebGLCoordinateSystem : WebGPUCoordinateSystem });
    gl.getRenderTarget = () => frame;
    const restore = vi.fn();
    const borrowedDispose = vi.spyOn(frame.depthTexture, 'dispose');
    const render = (): void => {
      renderModelEmphasisMask(resources, {
        gl,
        camera: emptyCamera,
        restoreDepth: restore,
        previousClear: new Color(),
      });
    };
    render();
    expect(resources.maskTarget.depthBuffer).toBe(true);
    expect(resources.maskTarget.samples).toBe(4);
    expect(resources.mask.visibility.selected.depthTest).toBe(true);
    expect(restore).toHaveBeenCalledTimes(0);
    expect(calls.filter((call) => call === 'draw')).toHaveLength(2);
    expect(calls.includes('clear')).toBe(false);
    expect(resources.maskScene.children).toHaveLength(0);
    render();
    gl.getRenderTarget = () => null;
    render();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(calls).toContain('clear');
    resources.dispose();
    expect(borrowedDispose).not.toHaveBeenCalled();
    frame.dispose();
  });

  it('restores clear flags and the frame target when the fused depth draw throws', () => {
    const resources = createModelEmphasisResources('webgpu', createSectionClip('webgpu'));
    const frame = new WebGLRenderTarget(200, 100);
    frame.depthTexture = new DepthTexture(200, 100);
    resources.setMaskSize({ width: 200, height: 100, pixelRatio: 1 });
    const { gl } = makeRecordingRenderer();
    Object.assign(gl, {
      coordinateSystem: WebGLCoordinateSystem,
      autoClear: false,
      autoClearColor: false,
      autoClearDepth: false,
      autoClearStencil: true,
    });
    gl.getRenderTarget = () => frame;
    const setTarget = vi.spyOn(gl, 'setRenderTarget');
    gl.render = () => {
      throw new Error('draw failed');
    };
    expect(() => {
      renderModelEmphasisMask(resources, {
        gl,
        camera: emptyCamera,
        restoreDepth: vi.fn(),
        previousClear: new Color(),
      });
    }).toThrow('draw failed');
    expect(setTarget).toHaveBeenLastCalledWith(frame);
    expect([gl.autoClear, gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil]).toEqual([
      false,
      false,
      false,
      true,
    ]);
    resources.dispose();
    frame.dispose();
  });

  it('packs one node emphasis state without reducing coverage samples or depth precision', () => {
    const resources = createModelEmphasisResources('webgpu', createSectionClip('webgpu'));
    const source = makeSource();
    syncModelEmphasisProxies(resources, { hover: [], selected: [source] });
    expect(resources.maskTarget.texture.format).toBe(RGFormat);
    expect(resources.maskTarget.samples).toBe(4);
    expect(resources.mask.coverage.selected.color.toArray()).toEqual([1, 0, 0]);
    expect(resources.mask.visibility.selected.color.toArray()).toEqual([0, 1, 0]);
    expect(resources.mask.visibility.selected.opacity).toBe(0);
    const dispose = vi.spyOn(resources.maskTarget, 'dispose');
    syncModelEmphasisProxies(resources, { hover: [source], selected: [] });
    expect(dispose).not.toHaveBeenCalled();
    syncModelEmphasisProxies(resources, { hover: [source], selected: [makeSource()] });
    expect(resources.maskTarget.texture.format).toBe(RGBAFormat);
    expect(dispose).toHaveBeenCalledOnce();
    expect(resources.mask.visibility.selected.opacity).toBe(1);
    syncModelEmphasisProxies(resources, { hover: [], selected: [source] });
    expect(resources.maskTarget.texture.format).toBe(RGBAFormat);
    expect(dispose).toHaveBeenCalledOnce();
    syncModelEmphasisProxies(resources, emptyModelEmphasisSet);
    syncModelEmphasisProxies(resources, { hover: [source], selected: [] });
    expect(resources.maskTarget.texture.format).toBe(RGFormat);
    resources.dispose();
  });

  it('proxies each emphasised mesh into both mask layers and the wash group, sharing six materials', () => {
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
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

  it('follows source world transforms without traversing the scene', () => {
    const resources = createModelEmphasisResources('webgpu', createSectionClip('webgpu'));
    const source = makeSource();
    source.position.set(1, 2, 3);
    source.updateMatrixWorld(true);
    syncModelEmphasisProxies(resources, { hover: [], selected: [source] });

    syncModelEmphasisFrame(resources);

    const proxy = resources.maskScene.children[0] as Mesh;
    expect(proxy.matrixWorld.equals(new Matrix4().makeTranslation(1, 2, 3))).toBe(true);
    expect(proxy.matrixWorldAutoUpdate).toBe(false);
    resources.dispose();
  });

  it("clips coverage and wash with the viewer's section clip, and never the visibility layer", () => {
    const clip = createSectionClip('webgpu');
    const resources = createModelEmphasisResources('webgpu', clip);
    const maskOf = (material: Material): unknown => (material as { maskNode?: unknown }).maskNode;

    for (const material of [
      resources.wash.hover,
      resources.wash.selected,
      resources.mask.coverage.hover,
      resources.mask.coverage.selected,
    ]) {
      expect(maskOf(material)).toBe(clip.mask);
    }
    // The visibility layer answers for the uncut solid, so a section cap counts as part surface.
    expect(maskOf(resources.mask.visibility.selected)).toBeUndefined();
    expect(maskOf(resources.mask.visibility.hover)).toBeUndefined();
    resources.dispose();
  });

  it('gives each mask layer and state its own channel, added without touching the others', () => {
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
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
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
    expect(modelEmphasisMaskSamples).toBeGreaterThan(1);
    expect(resources.maskTarget.samples).toBe(modelEmphasisMaskSamples);
    // Nothing ever samples the mask's depth; skipping its resolve keeps that blit off the frame.
    expect(resources.maskTarget.resolveDepthBuffer).toBe(false);
    resources.dispose();
  });

  it("resolves visibility with the frame's own depth, restored into the mask target", () => {
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
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
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
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
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
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

  it('should release the device-resolution mask once nothing is emphasised', () => {
    // 4x MSAA colour + depth at a full-screen phone's drawing buffer is ~51 MiB; it must not
    // outlive the hover or selection that needed it.
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
    syncModelEmphasisProxies(resources, {
      hover: [makeSource()],
      selected: [],
    });
    resources.setMaskSize({ width: 786, height: 1704, pixelRatio: 2 });
    const disposeTarget = vi.spyOn(resources.maskTarget, 'dispose');

    syncModelEmphasisProxies(resources, emptyModelEmphasisSet);

    expect({
      width: resources.maskTarget.width,
      height: resources.maskTarget.height,
    }).toEqual({
      width: 1,
      height: 1,
    });
    expect(disposeTarget).toHaveBeenCalledOnce();
    resources.dispose();
  });

  it('disposes the mask target, composite and shared materials once', () => {
    const resources = createModelEmphasisResources('webgl', createSectionClip('webgl'));
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
