import { Matrix4 } from 'three';
import type { ThreeCamera } from '@taucad/three/camera';

// WebGPU clip depth is [0, 1]. z' = w - z converts a reversed projection
// to the forward depth convention consumed by Three r184's GTAONode.
const reverseClipDepth = new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 1, 0, 0, 0, 1);

/** Keep GTAO's reconstruction matrices paired with its forward depth samples. */
export function createGtaoCameraAdapter(
  source: ThreeCamera,
  reversedDepth: boolean,
): Readonly<{ camera: ThreeCamera; update: () => void }> {
  const camera = source.clone();
  const update = (): void => {
    camera.near = source.near;
    camera.far = source.far;
    camera.projectionMatrix.copy(source.projectionMatrix);
    if (reversedDepth) {
      camera.projectionMatrix.premultiply(reverseClipDepth);
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  update();
  return { camera, update };
}
