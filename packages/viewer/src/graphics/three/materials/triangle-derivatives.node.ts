import type { Node } from 'three/webgpu';
import {
  cameraProjectionMatrix,
  cameraWorldMatrix,
  normalViewGeometry,
  positionView,
  select,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';

/**
 * Analytic world-position differentials on the current triangle, per device pixel.
 * The outline geometry supplies a constant geometric normal at all three vertices.
 * Fragment derivatives can cross primitives on Apple GPUs; neither coverage nor
 * its padded clipping mask may depend on those neighboring values.
 * @internal
 * @returns World-space pixel differentials along viewport X and Y.
 */
export const triangleWorldDerivatives = (): { dx: Node<'vec3'>; dy: Node<'vec3'> } => {
  const orthographic = cameraProjectionMatrix.mul(vec4(0, 0, 0, 1)).w.equal(1);
  const ray = select<'vec3'>(orthographic, vec3(0, 0, -1), positionView).toVar();
  const normal = normalViewGeometry;
  const denominator = normal.dot(ray).toVar();
  // A projected nondegenerate triangle has a nonzero denominator. A zero-area
  // primitive contributes no coverage; keep its arithmetic finite as well.
  const inverse = select(denominator.equal(0), 0, denominator.reciprocal()).toVar();
  const scale = select(orthographic, 1, positionView.z.negate()).mul(2);
  const dx = vec3(1, 0, 0)
    .sub(ray.mul(normal.x.mul(inverse)))
    .mul(scale.div(cameraProjectionMatrix.mul(vec4(1, 0, 0, 0)).x.mul(viewportSize.x)));
  const dy = vec3(0, 1, 0)
    .sub(ray.mul(normal.y.mul(inverse)))
    .mul(scale.div(cameraProjectionMatrix.mul(vec4(0, 1, 0, 0)).y.mul(viewportSize.y)));
  // Materialize before the face loops: these depend on the fragment, not the
  // section plane. Returning expressions repeats the matrix products per face.
  return { dx: cameraWorldMatrix.mul(vec4(dx, 0)).xyz.toVar(), dy: cameraWorldMatrix.mul(vec4(dy, 0)).xyz.toVar() };
};
