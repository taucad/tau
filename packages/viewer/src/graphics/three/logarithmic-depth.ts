import type { Material } from 'three';
import type { MeshStandardNodeMaterial, Node } from 'three/webgpu';
import {
  cameraFar,
  cameraNear,
  positionView,
  select,
  uniform,
  viewZToLogarithmicDepth,
  viewZToOrthographicDepth,
} from 'three/tsl';

const perspectiveProjection = uniform(false).onRenderUpdate(
  ({ camera }) => camera?.projectionMatrix.elements[15] === 0,
);

/**
 * Select depth from the current projection, not the camera that first compiled the material.
 * Three r184 specializes its default log depth by camera kind without including that kind
 * in the render-object shader cache key. A shared node keeps camera preparation/reuse valid.
 * @param viewZ - Negative view-space depth of the fragment or a reprojected cap crossing.
 * @returns Depth in the node WebGL2 viewport's logarithmic/perspective or linear/orthographic convention.
 */
export const logarithmicGeometryDepth = (viewZ: Node<'float'>): Node<'float'> =>
  select(
    perspectiveProjection,
    viewZToLogarithmicDepth(viewZ, cameraNear, cameraFar),
    viewZToOrthographicDepth(viewZ, cameraNear, cameraFar),
  );

const geometryDepth = logarithmicGeometryDepth(positionView.z);
const logarithmicDepthOverrides = new WeakMap<Material, Node<'float'>>();

/**
 * Give a material its own depth on the logarithmic path only. Other paths keep rasterizer depth,
 * and with it the material's polygon offset, which fragment depth would discard.
 * @param material - A material whose fragments do not lie at `positionView`, or that needs a bias.
 * @param depth - Depth in the logarithmic/orthographic convention of {@link logarithmicGeometryDepth}.
 */
export function setLogarithmicDepthOverride(material: Material, depth: Node<'float'>): void {
  logarithmicDepthOverrides.set(material, depth);
}

/** Install the camera-independent default only; preserve authored depth and depth-copy materials. */
export function installLogarithmicGeometryDepth(material: Material): void {
  const target = material as Material & { depthNode?: MeshStandardNodeMaterial['depthNode'] };
  if (material.depthTest && !target.depthNode) {
    target.depthNode = logarithmicDepthOverrides.get(material) ?? geometryDepth;
    material.needsUpdate = true;
  }
}
