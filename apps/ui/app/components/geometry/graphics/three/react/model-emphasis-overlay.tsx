import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import type { Material, Object3D } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { SceneOverlay } from '#components/geometry/graphics/three/scene-overlay.js';
import { useModelEmphasisSet } from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import type { ModelEmphasisSet } from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import { applyGltfSurfaceDepthBias } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
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

/** Frame-loop slots: after the main/post pass (1), before grid/axes overlays (2). */
export const modelEmphasisMaskPriority = 1.4;
export const modelEmphasisOverlayPriority = 1.5;

/** Translucent wash strength per state; the surface's own material is never touched. */
export const modelEmphasisWashOpacity = { hover: 0.15, selected: 0.3 } as const;

type ModelEmphasisState = 'hover' | 'selected';

type Proxy = Readonly<{ source: Mesh; mask: Mesh; wash: Mesh }>;

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
  mask: Readonly<Record<ModelEmphasisState, MeshBasicMaterial>>;
  wash: Readonly<Record<ModelEmphasisState, MeshBasicMaterial>>;
  proxies: Proxy[];
  setMaskSize: (size: SilhouetteMaskSize) => void;
  dispose: () => void;
}>;

const disableRaycast = (): void => undefined;
const maskClearColor = new Color(0x00_00_00);

/** Union coverage into R (hover) or G (selected); additive so overlapping states both survive. */
function createMaskMaterial(state: ModelEmphasisState): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: state === 'hover' ? 0xff_00_00 : 0x00_ff_00,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  material.name = `tau-emphasis-mask-${state}`;
  return material;
}

/** Transparent overlay that lands exactly on the biased surface depth (policy rule 7 row 2). */
function createWashMaterial(state: ModelEmphasisState, backend: ResolvedGraphicsBackend): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: silhouetteColor,
    transparent: true,
    opacity: modelEmphasisWashOpacity[state],
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  material.name = `tau-emphasis-wash-${state}`;
  applyGltfSurfaceDepthBias(material, backend, { allowTransparent: true });
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

export function createModelEmphasisResources(backend: ResolvedGraphicsBackend): ModelEmphasisResources {
  const maskTarget = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
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

  const mask = { hover: createMaskMaterial('hover'), selected: createMaskMaterial('selected') };
  const wash = { hover: createWashMaterial('hover', backend), selected: createWashMaterial('selected', backend) };
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
      proxies.length = 0;
      maskScene.clear();
      washGroup.clear();
      quad.geometry.dispose();
      composite.dispose();
      for (const material of [mask.hover, mask.selected, wash.hover, wash.selected]) {
        material.dispose();
      }
      maskTarget.dispose();
    },
  };
}

/** Rebuild the proxy pair per emphasised mesh; called only when the emphasis set changes. */
export function syncModelEmphasisProxies(resources: ModelEmphasisResources, set: ModelEmphasisSet): void {
  const washGroup = resources.overlayGroup.children[0] as Group;
  resources.proxies.length = 0;
  resources.maskScene.clear();
  washGroup.clear();
  const add = (source: Mesh, state: ModelEmphasisState): void => {
    const mask = createProxy(source, resources.mask[state]);
    const wash = createProxy(source, resources.wash[state]);
    resources.maskScene.add(mask);
    washGroup.add(wash);
    resources.proxies.push({ source, mask, wash });
  };
  for (const source of set.hover) {
    add(source, 'hover');
  }
  for (const source of set.selected) {
    add(source, 'selected');
  }
}

const firstMaterial = (object: Object3D): Material | undefined => {
  const { material } = object as Mesh;
  return Array.isArray(material) ? material[0] : material;
};

/** Per-frame CPU work: follow the sources' world transforms and section clipping. */
export function syncModelEmphasisFrame(resources: ModelEmphasisResources): void {
  for (const { source, mask, wash } of resources.proxies) {
    mask.matrixWorld.copy(source.matrixWorld);
    wash.matrixWorld.copy(source.matrixWorld);
  }
  const planes = (resources.proxies[0] && firstMaterial(resources.proxies[0].source)?.clippingPlanes) ?? null;
  for (const material of [
    resources.mask.hover,
    resources.mask.selected,
    resources.wash.hover,
    resources.wash.selected,
  ]) {
    if (material.clippingPlanes !== planes) {
      material.clippingPlanes = planes;
    }
  }
}

function ModelEmphasisMaskPass({ resources }: { readonly resources: ModelEmphasisResources }): undefined {
  const sizeRef = useMemo(() => new Vector2(), []);
  const previousClearRef = useMemo(() => new Color(), []);

  useFrame((state) => {
    const { gl, camera } = state;
    gl.getDrawingBufferSize(sizeRef);
    if (resources.maskTarget.width !== sizeRef.x || resources.maskTarget.height !== sizeRef.y) {
      resources.setMaskSize({ width: sizeRef.x, height: sizeRef.y, pixelRatio: gl.getPixelRatio() });
    }
    syncModelEmphasisFrame(resources);

    const previousTarget = gl.getRenderTarget();
    const previousAutoClear = gl.autoClear;
    gl.getClearColor(previousClearRef);
    const previousClearAlpha = gl.getClearAlpha();
    try {
      gl.setRenderTarget(resources.maskTarget);
      gl.setClearColor(maskClearColor, 0);
      gl.autoClear = true;
      gl.render(resources.maskScene, camera);
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.setClearColor(previousClearRef, previousClearAlpha);
      gl.autoClear = previousAutoClear;
    }
  }, modelEmphasisMaskPriority);

  return undefined;
}

/**
 * Silhouette + wash for hovered/selected model components.
 *
 * Mask stage (priority 1.4): proxies of the emphasised meshes render flat coverage into a
 * device-resolution target with no depth. Overlay stage (priority 1.5, `SceneOverlay` so the
 * post owner's depth restore applies): translucent wash proxies depth-tested against the frame,
 * then one fullscreen composite that draws the outline where coverage changes. Idle cost is
 * zero — neither stage subscribes while nothing is emphasised.
 */
export function ModelEmphasisOverlay(): JSX.Element {
  const rootScene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const backend = useThreeGraphicsBackend();
  const set = useModelEmphasisSet(rootScene);
  const active = set.hover.length > 0 || set.selected.length > 0;
  const resources = useMemo(() => createModelEmphasisResources(backend), [backend]);

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
