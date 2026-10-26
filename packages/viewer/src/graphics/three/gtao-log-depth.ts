import { PerspectiveCamera, REVISION, Vector4 } from 'three';
import type { ThreeCamera } from '@taucad/three/camera';
import type { Node } from 'three/webgpu';
import {
  logarithmicDepthToViewZ,
  perspectiveDepthToViewZ,
  sample,
  select,
  uniform,
  viewZToLogarithmicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';

/**
 * Adapt r184's unconditional logarithmic-to-perspective GTAO decoder to the actual
 * camera. Geometry keeps its original clip interval. AO uses a well-conditioned
 * reconstruction projection only; it never clips or writes geometry depth.
 * @param source - The actual raster camera.
 * @param rawDepth - Retained geometry depth in the renderer convention.
 * @returns Paired GTAO/denoise samples and stable reconstruction uniforms.
 * @internal
 */
export function createLogDepthAoAdapter(
  source: ThreeCamera,
  rawDepth: ReturnType<typeof sample>,
): {
  camera: ThreeCamera;
  gtaoDepth: ReturnType<typeof sample>;
  forwardDepth: ReturnType<typeof sample>;
  update: (current?: ThreeCamera) => void;
} {
  if (REVISION !== '184') {
    throw new Error('Requalify GTAO logarithmic depth decoding for this Three revision');
  }
  const camera = source.clone();
  const planes = uniform(new Vector4());
  const perspective = uniform(false);
  const update = (current = source): void => {
    perspective.value = current instanceof PerspectiveCamera;
    camera.projectionMatrix.copy(current.projectionMatrix);
    // These values condition reconstruction, not the rasterizer's clipping. Keeping
    // the original tiny near here rounds distant forward depth to background again.
    camera.near = perspective.value ? current.far / 100 : 1;
    camera.far = perspective.value ? current.far : 2;
    if (perspective.value) {
      camera.projectionMatrix.elements[10] = -(camera.far + camera.near) / (camera.far - camera.near);
      camera.projectionMatrix.elements[14] = (-2 * camera.far * camera.near) / (camera.far - camera.near);
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // Match viewZToLogarithmicDepth's near clamp, which its inverse omits in r184.
    planes.value.set(Math.max(current.near, 1e-6), current.far, camera.near, camera.far);
  };
  update();
  const viewZ = (uv: Node): Node<'float'> =>
    logarithmicDepthToViewZ((rawDepth.sample(uv) as Node<'vec4'>).r, planes.x, planes.y);
  const forwardDepth = sample((uv) =>
    select(
      perspective,
      viewZToPerspectiveDepth(viewZ(uv), planes.z, planes.w),
      (rawDepth.sample(uv) as Node<'vec4'>).r,
    ),
  );
  // GTAO always runs its log decoder, including for orthographic cameras. Encode
  // the desired forward depth through the inverse of that decoder; denoise consumes
  // forwardDepth directly. No extra target, scene replay or renderer-state mutation.
  const gtaoDepth = sample((uv) =>
    viewZToLogarithmicDepth(
      select(
        perspective,
        viewZ(uv),
        perspectiveDepthToViewZ((rawDepth.sample(uv) as Node<'vec4'>).r, planes.z, planes.w),
      ),
      planes.z,
      planes.w,
    ),
  );
  return { camera, gtaoDepth, forwardDepth, update };
}
