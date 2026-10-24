import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  CustomBlending,
  DepthTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OneFactor,
  PlaneGeometry,
  RGBAFormat,
  RGFormat,
  Scene,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  WebGLCoordinateSystem,
} from 'three';
import type { Camera, Material, WebGLRenderer } from 'three';
import { QuadMesh } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { SceneOverlay, useOverlayDepthRestorer } from '#graphics/three/scene-overlay.jsx';
import type { DepthRestore } from '#graphics/three/scene-overlay.jsx';
import { useModelEmphasisSet } from '#graphics/three/materials/model-emphasis-registry.js';
import type { ModelEmphasisSet } from '#graphics/three/materials/model-emphasis-registry.js';
import {
  createWebGlSilhouetteMaterial,
  setWebGlSilhouetteMaskSize,
} from '#graphics/three/materials/model-emphasis-silhouette.material.js';
import {
  createWebGpuEmphasisDepthMaterial,
  createWebGpuSilhouetteMaterial,
  setWebGpuSilhouetteMaskSize,
} from '#graphics/three/materials/model-emphasis-silhouette.node.js';
import {
  silhouetteColor,
  silhouetteHoverAlpha,
  silhouetteSelectedAlpha,
} from '#graphics/three/materials/model-emphasis-silhouette.js';
import type { SilhouetteMaskSize } from '#graphics/three/materials/model-emphasis-silhouette.js';
import { installSectionClip } from '#graphics/three/materials/section-clip.js';
import type { SectionClip } from '#graphics/three/materials/section-clip.js';
import { createEmphasisMaskCrop } from '#graphics/three/materials/model-emphasis-crop.js';
import { createEmphasisCompositeRegion } from '#graphics/three/materials/model-emphasis-region.js';
import { useSectionClip } from '#graphics/three/react/section-clipping-group.jsx';

/** Frame-loop slots: after the main/post pass (1), before grid/axes overlays (2). */
export const modelEmphasisMaskPriority = 1.4;
export const modelEmphasisOverlayPriority = 1.5;

/** Translucent wash strength per state; the surface's own material is never touched. */
export const modelEmphasisWashOpacity = { hover: 0.15, selected: 0.3 } as const;

type ModelEmphasisState = 'hover' | 'selected';

/** The two things the mask measures, each into its own channels, from one pass. */
const modelEmphasisMaskLayers = ['coverage', 'visibility'] as const;
type ModelEmphasisMaskLayer = (typeof modelEmphasisMaskLayers)[number];

/**
 * Samples the coverage mask resolves, matching the canvas.
 *
 * One sample per pixel can only report 0 or 1, so the composite's difference is 0 or 1 too and
 * the outline is a hard staircase. Resolved multisample coverage gives the boundary pixels a
 * fraction, and the same difference then ramps — the outline's antialiasing comes from the mask,
 * not from a wider filter in the composite.
 */
export const modelEmphasisMaskSamples = 4;

type Proxy = Readonly<{
  source: Mesh;
  state: ModelEmphasisState;
  mask: Mesh;
  visibility: Mesh;
  wash: Mesh;
}>;

type CompositeMaterial =
  | ReturnType<typeof createWebGlSilhouetteMaterial>
  | ReturnType<typeof createWebGpuSilhouetteMaterial>;

export type ModelEmphasisResources = Readonly<{
  backend: ResolvedGraphicsBackend;
  maskTarget: WebGLRenderTarget;
  maskScene: Scene;
  /** Portalled into the overlay scene: wash proxies then the composite quad. */
  overlayGroup: Group;
  composite: CompositeMaterial;
  mask: Readonly<Record<ModelEmphasisMaskLayer, Readonly<Record<ModelEmphasisState, MeshBasicMaterial>>>>;
  wash: Readonly<Record<ModelEmphasisState, MeshBasicMaterial>>;
  proxies: Proxy[];
  setFrameDepth: (depth: DepthTexture | undefined, isWebGl: boolean) => boolean;
  renderFrameDepth: (renderer: WebGPURenderer) => void;
  setMaskSize: (size: SilhouetteMaskSize) => void;
  frameSize: SilhouetteMaskSize;
  prepareMask: (camera: Camera, bounded: boolean, cropped: boolean) => Camera;
  dispose: () => void;
}>;

const disableRaycast = (): void => undefined;
const emptyCompositeSources: Proxy[] = [];
const maskClearColor = new Color(0x00_00_00);

/** One mask channel per (layer, state): coverage in RG, visibility in BA. */
const maskLayerColor = {
  coverage: { hover: 0xff_00_00, selected: 0x00_ff_00 },
  visibility: { hover: 0x00_00_ff, selected: 0x00_00_00 },
} as const;
const maskLayerOpacity = {
  coverage: { hover: 0, selected: 0 },
  visibility: { hover: 0, selected: 1 },
} as const;

/**
 * Union one channel of the mask; every draw adds exactly its own channel and leaves the rest.
 *
 * `CustomBlending` at One/One rather than `AdditiveBlending`, which scales the colour by the
 * source alpha that the selected-visibility channel carries as its payload.
 *
 * Double-sided because coverage is occupancy, not shading: a section cut opens the shell, and
 * culling the back faces it exposes would punch holes into the mask that the composite then
 * outlines across the section cap.
 *
 * The visibility layer is the same draw under the frame's own depth, so the depth test decides
 * where the part is frontmost — no depth is decoded in a shader, and reversed-Z and logarithmic
 * depth stay the renderer's business. It is deliberately never clipped: a section cut replaces
 * the material it removes with a cap that belongs to the same part, so the uncut solid is what
 * "this part is what you see here" means, while coverage stays clipped to what is drawn.
 */
function createMaskMaterial(layer: ModelEmphasisMaskLayer, state: ModelEmphasisState): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: maskLayerColor[layer][state],
    opacity: maskLayerOpacity[layer][state],
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    side: DoubleSide,
    depthTest: layer === 'visibility',
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  material.name = `tau-emphasis-${layer}-${state}`;
  return material;
}

/**
 * Translucent overlay at geometric depth, so it beats the pushed-back surface by the same
 * slope-scaled margin the characteristic edges rely on. Copying the surface's bias instead made
 * the depth test an exact tie, which resolves per pixel and speckles — see
 * `docs/research/viewer-emphasis-depth-and-coverage-blueprint.md`.
 */
function createWashMaterial(state: ModelEmphasisState): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: silhouetteColor,
    transparent: true,
    opacity: modelEmphasisWashOpacity[state],
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  material.name = `tau-emphasis-wash-${state}`;
  return material;
}

function createProxy(source: Mesh, material: Material): Mesh {
  const proxy = new Mesh(source.geometry, material);
  proxy.matrixAutoUpdate = false;
  proxy.matrixWorldAutoUpdate = false;
  proxy.frustumCulled = false;
  proxy.raycast = disableRaycast;
  return proxy;
}

/**
 * @param backend - The viewer's graphics backend.
 * @param clip - The viewer's section clip. Coverage and wash take it, so the outline and tint follow what is drawn;
 *   the visibility layer never does, so it still answers for the uncut solid.
 */
export function createModelEmphasisResources(
  backend: ResolvedGraphicsBackend,
  clip: SectionClip,
): ModelEmphasisResources {
  const maskTarget = new WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    samples: modelEmphasisMaskSamples,
    // Nothing ever samples the mask's depth — only the depth test reads it — so the resolve blit
    // that would produce a single-sample copy of it is pure cost.
    resolveDepthBuffer: false,
    // Node renderers own implicit 24-bit depth. Node WebGL2 can keep only its MSAA
    // renderbuffer when no depth resolve is requested; native keeps its depth texture.
    // Classic needs an explicit 24-bit texture to avoid its default 16-bit renderbuffer.
    depthTexture: backend === 'webgpu' ? null : new DepthTexture(1, 1, UnsignedIntType),
  });
  maskTarget.texture.name = 'tau-emphasis-mask';
  const maskScene = new Scene();
  const overlayGroup = new Group();
  const washGroup = new Group();
  const composite =
    backend === 'webgpu'
      ? createWebGpuSilhouetteMaterial(maskTarget.texture)
      : createWebGlSilhouetteMaterial(maskTarget.texture);
  const quad = new Mesh(new PlaneGeometry(2, 2), composite);
  const updateCompositeRegion = createEmphasisCompositeRegion(quad.geometry);
  const maskSize: SilhouetteMaskSize = { width: 1, height: 1, pixelRatio: 1 };
  const crop = createEmphasisMaskCrop();
  quad.frustumCulled = false;
  quad.raycast = disableRaycast;
  // Transparent draws sort by renderOrder first; the composite must land on top of the wash.
  quad.renderOrder = 1;
  overlayGroup.add(washGroup, quad);

  const mask = {
    coverage: { hover: createMaskMaterial('coverage', 'hover'), selected: createMaskMaterial('coverage', 'selected') },
    visibility: {
      hover: createMaskMaterial('visibility', 'hover'),
      selected: createMaskMaterial('visibility', 'selected'),
    },
  };
  const wash = { hover: createWashMaterial('hover'), selected: createWashMaterial('selected') };
  for (const material of [mask.coverage.hover, mask.coverage.selected, wash.hover, wash.selected]) {
    installSectionClip(material, clip);
  }
  const proxies: Proxy[] = [];
  let depthStamp: ReturnType<typeof createWebGpuEmphasisDepthMaterial> | undefined;
  let depthQuad: QuadMesh | undefined;
  const setFrameDepth = (source: DepthTexture | undefined, isWebGl: boolean): boolean => {
    if (!source || backend !== 'webgpu') {
      if (depthStamp) {
        depthStamp.frameDepth.value = depthStamp.emptyDepth;
      }
      return false;
    }
    depthStamp ??= createWebGpuEmphasisDepthMaterial(source);
    depthStamp.material.depthTest = isWebGl;
    depthQuad ??= new QuadMesh(depthStamp.material);
    depthStamp.frameDepth.value = source;
    depthStamp.frameRegion.value.copy(crop.uv);
    return true;
  };

  const setMaskSize = (size: SilhouetteMaskSize): void => {
    if (maskSize.width !== size.width || maskSize.height !== size.height) {
      crop.reset();
      maskTarget.setSize(size.width, size.height);
    }
    Object.assign(maskSize, size);
    if (size.width === 1 && size.height === 1) {
      maskTarget.setSize(1, 1);
    }
    if (backend === 'webgpu') {
      setWebGpuSilhouetteMaskSize(composite as ReturnType<typeof createWebGpuSilhouetteMaterial>, size);
    } else {
      setWebGlSilhouetteMaskSize(composite as ReturnType<typeof createWebGlSilhouetteMaterial>, size);
    }
  };

  return {
    backend,
    maskTarget,
    maskScene,
    overlayGroup,
    composite,
    mask,
    wash,
    proxies,
    setMaskSize,
    frameSize: maskSize,
    prepareMask: (camera, bounded, cropped) => {
      const region = updateCompositeRegion(
        bounded && backend === 'webgpu' ? proxies : emptyCompositeSources,
        camera,
        maskSize,
      );
      const maskCamera = crop.update(
        camera,
        cropped && backend === 'webgpu' && proxies.length > 0 ? region : undefined,
        maskSize,
      );
      maskTarget.setSize(crop.pixels.z, crop.pixels.w);
      if (backend === 'webgpu') {
        const nodeComposite = composite as ReturnType<typeof createWebGpuSilhouetteMaterial>;
        nodeComposite.silhouetteRegion.value.copy(crop.uv);
        setWebGpuSilhouetteMaskSize(nodeComposite, {
          width: crop.pixels.z,
          height: crop.pixels.w,
          pixelRatio: maskSize.pixelRatio,
        });
      }
      return maskCamera;
    },
    setFrameDepth,
    renderFrameDepth: (renderer) => {
      depthQuad?.render(renderer);
    },
    dispose: () => {
      depthStamp?.material.dispose();
      depthStamp?.emptyDepth.dispose();
      if (depthStamp) {
        depthStamp.frameDepth.value = depthStamp.emptyDepth;
      }
      proxies.length = 0;
      maskScene.clear();
      washGroup.clear();
      quad.geometry.dispose();
      for (const material of [
        composite,
        mask.coverage.hover,
        mask.coverage.selected,
        mask.visibility.hover,
        mask.visibility.selected,
        wash.hover,
        wash.selected,
      ]) {
        material.dispose();
      }
      maskTarget.dispose();
    },
  };
}

/** Rebuild the proxy pair per emphasised mesh; called only when the emphasis set changes. */
export function syncModelEmphasisProxies(resources: ModelEmphasisResources, set: ModelEmphasisSet): void {
  if (resources.backend === 'webgpu') {
    const both = set.hover.length > 0 && set.selected.length > 0;
    // Once both states need independent channels, keep RGBA until emphasis ends. Moving
    // the pointer across an existing selection must not recreate a 5K target every time.
    const packed = !both && (resources.proxies.length === 0 || resources.maskTarget.texture.format === RGFormat);
    const format = packed ? RGFormat : RGBAFormat;
    if (resources.maskTarget.texture.format !== format) {
      resources.maskTarget.dispose();
      resources.maskTarget.texture.format = format;
    }
    const composite = resources.composite as ReturnType<typeof createWebGpuSilhouetteMaterial>;
    composite.silhouettePackedAlpha.value = packed
      ? set.selected.length > 0
        ? silhouetteSelectedAlpha
        : silhouetteHoverAlpha
      : 0;
    for (const state of ['hover', 'selected'] as const) {
      for (const layer of modelEmphasisMaskLayers) {
        const material = resources.mask[layer][state];
        material.color.setHex(packed ? (layer === 'coverage' ? 0xff_00_00 : 0x00_ff_00) : maskLayerColor[layer][state]);
        material.opacity = packed ? 0 : maskLayerOpacity[layer][state];
      }
    }
  }
  const washGroup = resources.overlayGroup.children[0] as Group;
  resources.proxies.length = 0;
  resources.maskScene.clear();
  washGroup.clear();
  const add = (source: Mesh, state: ModelEmphasisState): void => {
    const mask = createProxy(source, resources.mask.coverage[state]);
    const visibility = createProxy(source, resources.mask.visibility[state]);
    const wash = createProxy(source, resources.wash[state]);
    resources.maskScene.add(mask, visibility);
    washGroup.add(wash);
    resources.proxies.push({ source, state, mask, visibility, wash });
  };
  for (const source of set.hover) {
    add(source, 'hover');
  }
  for (const source of set.selected) {
    add(source, 'selected');
  }
  if (resources.proxies.length === 0) {
    // Nothing is emphasised: give back the device-resolution multisampled target. The mask pass
    // sizes it again on the next emphasised frame.
    resources.setFrameDepth(undefined, false);
    resources.setMaskSize({ width: 1, height: 1, pixelRatio: 1 });
  }
}

/** Per-frame CPU work: follow the sources' world transforms. */
export function syncModelEmphasisFrame(resources: ModelEmphasisResources): void {
  for (const { source, mask, visibility, wash } of resources.proxies) {
    mask.matrixWorld.copy(source.matrixWorld);
    visibility.matrixWorld.copy(source.matrixWorld);
    wash.matrixWorld.copy(source.matrixWorld);
  }
}

/**
 * Draw one frame of the coverage mask: coverage, and the same proxies under the frame's depth.
 *
 * The target carries its own 24-bit depth so `restoreDepth` can stamp the finished frame into it
 * — the same bridge the post owner already publishes for canvas overlays — and the visibility
 * layer then falls out of the ordinary depth test. Without a post owner the restore is a no-op,
 * the depth stays cleared, every pixel reads visible, and the outline is the single-strength one
 * this shipped with.
 */
export function renderModelEmphasisMask(
  resources: ModelEmphasisResources,
  {
    gl,
    camera,
    restoreDepth,
    previousClear,
    boundedComposite = true,
    croppedMask = true,
    fuseNativeClear = true,
  }: {
    gl: WebGLRenderer;
    camera: Camera;
    restoreDepth: DepthRestore;
    previousClear: Color;
    boundedComposite?: boolean;
    croppedMask?: boolean;
    fuseNativeClear?: boolean;
  },
): void {
  const previousTarget = gl.getRenderTarget();
  const previousAutoClear = gl.autoClear;
  const previousAutoClearColor = gl.autoClearColor;
  const previousAutoClearDepth = gl.autoClearDepth;
  const previousAutoClearStencil = gl.autoClearStencil;
  // A composed node frame stays bound until final encoding. Its current depth includes caps.
  const isWebGl = (gl as unknown as WebGPURenderer).coordinateSystem === WebGLCoordinateSystem;
  const compatibleFrame =
    previousTarget &&
    previousTarget.samples <= 1 &&
    previousTarget.width === resources.frameSize.width &&
    previousTarget.height === resources.frameSize.height
      ? (previousTarget.depthTexture ?? undefined)
      : undefined;
  const maskCamera = resources.prepareMask(camera, boundedComposite, croppedMask && Boolean(compatibleFrame));
  const cropped =
    resources.maskTarget.width !== resources.frameSize.width ||
    resources.maskTarget.height !== resources.frameSize.height;
  // Native clears color with coverage, GL before its depth-only draw (color-mask state differs).
  // Keep the explicit native sequence as a qualification control, including cropped depth stamping.
  const inPassDepth = resources.setFrameDepth(
    isWebGl || fuseNativeClear || cropped ? compatibleFrame : undefined,
    isWebGl,
  );
  const fusedClear = inPassDepth && (isWebGl || fuseNativeClear);
  gl.getClearColor(previousClear);
  const previousClearAlpha = gl.getClearAlpha();
  try {
    gl.setRenderTarget(resources.maskTarget);
    gl.setClearColor(maskClearColor, 0);
    if (fusedClear) {
      gl.autoClear = true;
      gl.autoClearColor = isWebGl;
      gl.autoClearDepth = true;
      gl.autoClearStencil = false;
      resources.renderFrameDepth(gl as unknown as WebGPURenderer);
    } else {
      gl.autoClear = false;
      gl.clear(true, true, false);
      if (inPassDepth) {
        resources.renderFrameDepth(gl as unknown as WebGPURenderer);
      } else {
        restoreDepth(resources.maskTarget);
      }
    }
    gl.autoClear = fusedClear && !isWebGl;
    if (gl.autoClear) {
      gl.autoClearColor = true;
      gl.autoClearDepth = false;
      gl.autoClearStencil = false;
    }
    // Both layers in one pass: a second `gl.render` would cost a second multisample resolve of a
    // device-resolution target for nothing, since the layers never read each other.
    gl.render(resources.maskScene, maskCamera);
  } finally {
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(previousClear, previousClearAlpha);
    gl.autoClear = previousAutoClear;
    gl.autoClearColor = previousAutoClearColor;
    gl.autoClearDepth = previousAutoClearDepth;
    gl.autoClearStencil = previousAutoClearStencil;
  }
}

function ModelEmphasisMaskPass({ resources }: { readonly resources: ModelEmphasisResources }): undefined {
  const sizeRef = useMemo(() => new Vector2(), []);
  const previousClearRef = useMemo(() => new Color(), []);
  const restoreDepth = useOverlayDepthRestorer();

  useFrame((state) => {
    const { gl, camera } = state;
    gl.getDrawingBufferSize(sizeRef);
    if (
      resources.frameSize.width !== sizeRef.x ||
      resources.frameSize.height !== sizeRef.y ||
      resources.frameSize.pixelRatio !== gl.getPixelRatio()
    ) {
      resources.setMaskSize({ width: sizeRef.x, height: sizeRef.y, pixelRatio: gl.getPixelRatio() });
    }
    syncModelEmphasisFrame(resources);
    renderModelEmphasisMask(resources, { gl, camera, restoreDepth, previousClear: previousClearRef });
  }, modelEmphasisMaskPriority);

  return undefined;
}

/**
 * Silhouette + wash for hovered/selected model components.
 *
 * Mask stage (priority 1.4): proxies of the emphasised meshes render flat coverage into a
 * multisampled device-resolution target, alongside a second proxy under the frame's restored
 * depth so the same target also carries where the part is frontmost. Overlay stage (priority 1.5, `SceneOverlay`
 * so the post owner's depth restore applies): translucent wash proxies depth-tested against the
 * frame at geometric depth, then one conservatively bounded node composite (fullscreen on classic) that draws the outline where coverage
 * changes — full strength where it is visible, dimmer where it is behind something. Idle cost is
 * zero — neither stage subscribes while nothing is emphasised.
 */
export function ModelEmphasisOverlay(): JSX.Element {
  const rootScene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const backend = useThreeGraphicsBackend();
  const clip = useSectionClip();
  const set = useModelEmphasisSet(rootScene);
  const active = set.hover.length > 0 || set.selected.length > 0;
  const resources = useMemo(() => createModelEmphasisResources(backend, clip), [backend, clip]);

  useEffect(
    () => () => {
      resources.dispose();
    },
    [resources],
  );

  useEffect(() => {
    syncModelEmphasisProxies(resources, set);
    invalidate();
  }, [invalidate, resources, set]);

  return (
    <>
      {active ? <ModelEmphasisMaskPass resources={resources} /> : null}
      <SceneOverlay overlayActive={active} renderPriority={modelEmphasisOverlayPriority}>
        <primitive object={resources.overlayGroup} />
      </SceneOverlay>
    </>
  );
}
