import type { CanvasProps, Renderer as FiberCompatibleGl } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';

/**
 * R3F `gl` factory / props for {@link ResolvedGraphicsBackend}.
 *
 * Builds renderers via {@link createRenderer} with the **`viewport`** use case (MSAA,
 * WebGL log-depth / WebGPU reversed-Z — see `tau-renderer.ts`).
 */
/* oxlint-disable unicorn-js/prevent-abbreviations -- name mirrors R3F `<Canvas gl={...}>` ergonomics */
export function createTauR3fGlProp(
  graphicsBackend: ResolvedGraphicsBackend,
  cameras: readonly ThreeCamera[] = [],
): CanvasProps['gl'] {
  return async (defaults) => {
    const renderer = await createRenderer('viewport', graphicsBackend, defaults.canvas as HTMLCanvasElement);
    const reversedDepth = 'reversedDepthBuffer' in renderer && renderer.reversedDepthBuffer;
    for (const camera of cameras) {
      // The rig survives backend remounts. Three r184 only ever enables reversed
      // depth, so restore both conventions before scene warmup or direct rendering.
      camera.coordinateSystem = renderer.coordinateSystem;
      // Three exposes reversedDepth as a getter without a setter.
      Object.assign(camera, { _reversedDepth: reversedDepth });
      camera.updateProjectionMatrix();
    }
    return renderer as FiberCompatibleGl;
  };
}
/* oxlint-enable unicorn-js/prevent-abbreviations */
