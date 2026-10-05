import { getModelComponentInstanceSlot } from '#components/geometry/graphics/three/utils/model-component-owner.js';
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
  InstancedMesh,
  InstancedBufferAttribute,
  Matrix4,
  MeshBasicMaterial,
  NearestFilter,
  OneFactor,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import type { Camera, Material, WebGLRenderer } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { SceneOverlay, useOverlayDepthRestorer } from '#components/geometry/graphics/three/scene-overlay.js';
import type { DepthRestore } from '#components/geometry/graphics/three/scene-overlay.js';
import { useModelEmphasisSet } from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import type {
  ModelEmphasisSet,
  ModelEmphasisInstanceSelection,
} from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import {
  createWebGlSilhouetteMaterial,
  setWebGlSilhouetteMaskSize,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.material.js';
import {
  createWebGpuSilhouetteMaterial,
  setWebGpuSilhouetteMaskSize,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.node.js';
import { silhouetteColor } from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';
import type { SilhouetteMaskSize } from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';
import { installSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import type { SectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { useSectionClip } from '#components/geometry/graphics/three/react/section-clipping-group.js';

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

type Proxy = {
  source: Mesh;
  state: ModelEmphasisState;
  mask: Mesh;
  visibility: Mesh;
  wash: Mesh;
  selection?: ModelEmphasisInstanceSelection;
  instanceAttribute?: InstancedBufferAttribute;
  sourceInstanceAttribute?: InstancedBufferAttribute;
  sourceInstanceVersion?: number;
};

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
  setMaskSize: (size: SilhouetteMaskSize) => void;
  dispose: () => void;
}>;

const disableRaycast = (): void => undefined;
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

function disposeInstanceProxies(proxies: readonly Proxy[]): void {
  for (const proxy of proxies) {
    if (!proxy.selection) {
      continue;
    }
    for (const object of [proxy.mask, proxy.visibility, proxy.wash]) {
      if (object instanceof InstancedMesh) {
        object.dispose();
      }
    }
  }
}

/** Exact owned instance backing arrays; renderer storage is an estimate of these attribute payloads. */
export function getModelEmphasisInstanceBytes(resources: ModelEmphasisResources): {
  cpuBytes: number;
  gpuBytesEstimate: number;
  proxyCount: number;
} {
  const buffers = new Set<ArrayBufferLike>();
  const attributes = new Set<InstancedBufferAttribute>();
  let proxyCount = 0;
  for (const proxy of resources.proxies) {
    if (!proxy.instanceAttribute) {
      continue;
    }
    buffers.add(proxy.instanceAttribute.array.buffer);
    attributes.add(proxy.instanceAttribute);
    proxyCount += 3;
  }
  let cpuBytes = 0;
  let gpuBytesEstimate = 0;
  for (const buffer of buffers) {
    cpuBytes += buffer.byteLength;
  }
  for (const attribute of attributes) {
    gpuBytesEstimate += attribute.array.byteLength;
  }
  return { cpuBytes, gpuBytesEstimate, proxyCount };
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
    // 24-bit, matching the canvas the restored depth comes from; a 16-bit renderbuffer would
    // quantise the frame's depth below the margin that separates a surface from its overlays.
    depthTexture: new DepthTexture(1, 1, UnsignedIntType),
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

  const setMaskSize = (size: SilhouetteMaskSize): void => {
    maskTarget.setSize(size.width, size.height);
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
    dispose: () => {
      disposeInstanceProxies(proxies);
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
  const washGroup = resources.overlayGroup.children[0] as Group;
  disposeInstanceProxies(resources.proxies);
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
  const addInstances = (selection: ModelEmphasisInstanceSelection, state: ModelEmphasisState): void => {
    if (
      selection.instanceIds.length === 0 ||
      selection.instanceIds.length !== selection.slots.length ||
      selection.instanceIds.some(
        (id, index) => getModelComponentInstanceSlot(selection.source, id) !== selection.slots[index],
      )
    ) {
      return;
    }
    const attribute = new InstancedBufferAttribute(new Float32Array(selection.instanceIds.length * 16), 16);
    const matrix = new Matrix4();
    for (const [index, id] of selection.instanceIds.entries()) {
      selection.source.getMatrixAt(id, matrix);
      matrix.toArray(attribute.array, index * 16);
    }
    const make = (material: Material): InstancedMesh => {
      const object = new InstancedMesh(selection.source.geometry, material, 0);
      object.instanceMatrix = attribute;
      object.count = selection.instanceIds.length;
      object.matrixAutoUpdate = false;
      object.matrixWorldAutoUpdate = false;
      object.frustumCulled = false;
      object.raycast = disableRaycast;
      return object;
    };
    const mask = make(resources.mask.coverage[state]);
    const visibility = make(resources.mask.visibility[state]);
    const wash = make(resources.wash[state]);
    resources.maskScene.add(mask, visibility);
    washGroup.add(wash);
    resources.proxies.push({
      source: selection.source,
      state,
      mask,
      visibility,
      wash,
      selection,
      instanceAttribute: attribute,
      sourceInstanceAttribute: selection.source.instanceMatrix,
      sourceInstanceVersion: selection.source.instanceMatrix.version,
    });
  };
  for (const selection of set.hoverInstances ?? []) {
    addInstances(selection, 'hover');
  }
  for (const selection of set.selectedInstances ?? []) {
    addInstances(selection, 'selected');
  }
  for (const source of set.hover) {
    add(source, 'hover');
  }
  for (const source of set.selected) {
    add(source, 'selected');
  }
}

/** Per-frame CPU work: follow the sources' world transforms. */
export function syncModelEmphasisFrame(resources: ModelEmphasisResources): void {
  const matrix = new Matrix4();
  for (const proxy of resources.proxies) {
    const { source, mask, visibility, wash, selection, instanceAttribute } = proxy;
    if (selection && instanceAttribute) {
      const live = selection.instanceIds.every(
        (id, index) => getModelComponentInstanceSlot(selection.source, id) === selection.slots[index],
      );
      mask.visible = live;
      visibility.visible = live;
      wash.visible = live;
      if (!live) {
        continue;
      }
      const sourceAttributeChanged = proxy.sourceInstanceAttribute !== selection.source.instanceMatrix;
      const sourceVersionChanged = proxy.sourceInstanceVersion !== selection.source.instanceMatrix.version;
      if (sourceAttributeChanged || sourceVersionChanged) {
        for (const [index, id] of selection.instanceIds.entries()) {
          selection.source.getMatrixAt(id, matrix);
          matrix.toArray(instanceAttribute.array, index * 16);
        }
        instanceAttribute.needsUpdate = true;
        proxy.sourceInstanceAttribute = selection.source.instanceMatrix;
        proxy.sourceInstanceVersion = selection.source.instanceMatrix.version;
      }
    }
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
  }: { gl: WebGLRenderer; camera: Camera; restoreDepth: DepthRestore; previousClear: Color },
): void {
  const previousTarget = gl.getRenderTarget();
  const previousAutoClear = gl.autoClear;
  gl.getClearColor(previousClear);
  const previousClearAlpha = gl.getClearAlpha();
  try {
    gl.setRenderTarget(resources.maskTarget);
    gl.setClearColor(maskClearColor, 0);
    gl.autoClear = false;
    gl.clear(true, true, false);
    restoreDepth(resources.maskTarget);
    // Both layers in one pass: a second `gl.render` would cost a second multisample resolve of a
    // device-resolution target for nothing, since the layers never read each other.
    gl.render(resources.maskScene, camera);
  } finally {
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(previousClear, previousClearAlpha);
    gl.autoClear = previousAutoClear;
  }
}

function ModelEmphasisMaskPass({ resources }: { readonly resources: ModelEmphasisResources }): undefined {
  const sizeRef = useMemo(() => new Vector2(), []);
  const previousClearRef = useMemo(() => new Color(), []);
  const restoreDepth = useOverlayDepthRestorer();

  useFrame((state) => {
    const { gl, camera } = state;
    gl.getDrawingBufferSize(sizeRef);
    if (resources.maskTarget.width !== sizeRef.x || resources.maskTarget.height !== sizeRef.y) {
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
 * frame at geometric depth, then one fullscreen composite that draws the outline where coverage
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
