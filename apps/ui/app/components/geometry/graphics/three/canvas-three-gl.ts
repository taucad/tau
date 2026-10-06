import type { CanvasProps, Renderer as FiberCompatibleGl } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';

/**
 * R3F `gl` factory / props for {@link ResolvedGraphicsBackend}.
 *
 * Builds renderers via {@link createRenderer} with the **`viewport`** use case (MSAA,
 * WebGL log-depth / WebGPU reversed-Z — see `tau-renderer.ts`).
 *
 * R3F awaits this factory inside a `configure()` call that nothing awaits, so a renderer that cannot be created
 * (no WebGL context, or a context Safari hands back already lost) would surface as an unhandled rejection that no
 * error boundary sees, leaving a blank canvas. The factory instead reports the failure through `onCreateError` and
 * never settles; the owner unmounts the `<Canvas>` and shows its fallback.
 *
 * @param graphicsBackend - Backend the viewport renderer is created for.
 * @param cameras - Retained cameras whose projection convention must follow the new renderer.
 * @param onCreateError - Receives the renderer creation failure so the owner can render its fallback.
 */
/* oxlint-disable unicorn-js/prevent-abbreviations -- name mirrors R3F `<Canvas gl={...}>` ergonomics */
export function createTauR3fGlProp(
  graphicsBackend: ResolvedGraphicsBackend,
  cameras: readonly ThreeCamera[] = [],
  onCreateError?: (error: Error) => void,
): CanvasProps['gl'] {
  // R3F may configure again on resize before its first async renderer has settled.
  const byCanvas = new WeakMap<HTMLCanvasElement, Promise<FiberCompatibleGl>>();
  return async (defaults) => {
    const canvas = defaults.canvas as HTMLCanvasElement;
    const existing = byCanvas.get(canvas);
    if (existing) {
      return existing;
    }
    const creation = (async (): Promise<FiberCompatibleGl> => {
      let renderer: RendererInstance;
      try {
        renderer = await createRenderer('viewport', graphicsBackend, canvas);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        console.warn('[createTauR3fGlProp] Renderer creation failed:', failure);
        onCreateError?.(failure);
        return new Promise<never>(() => {
          // Never settles: R3F keeps waiting while the owner unmounts this canvas.
          void 0;
        });
      }
      // R3F reapplies DPR on every resize. WebGLRenderer.setPixelRatio also calls
      // setSize, clearing/reallocating the old buffer before R3F sizes the new one.
      const setPixelRatio = renderer.setPixelRatio.bind(renderer);
      renderer.setPixelRatio = (value: number): void => {
        if (renderer.getPixelRatio() !== value) {
          setPixelRatio(value);
        }
      };
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
    })();
    byCanvas.set(canvas, creation);
    return creation;
  };
}
/* oxlint-enable unicorn-js/prevent-abbreviations */
