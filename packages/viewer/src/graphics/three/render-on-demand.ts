import type { WebGPURenderer } from 'three/webgpu';

/**
 * The parts of Three's node renderer that its internal animation loop drives. Three owns them and its published
 * declarations omit them; `render-on-demand.test.ts` pins them so a Three upgrade that moves them fails there first.
 */
type NodeRendererInternals = {
  readonly _animation: {
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Three's own field holds `null` when stopped.
    readonly _requestId: number | null;
    start: () => void;
    stop: () => void;
  };
  readonly _nodes: { readonly nodeFrame: { readonly frameId: number; update: () => void } };
  readonly info: { autoReset: boolean; frame: number; reset: () => void };
  readonly _inspector: { begin: () => void; finish: () => void };
};

/**
 * Stop Three's node renderer from requesting a frame on every vsync, for a surface that renders on demand.
 *
 * `Renderer.init` starts an internal loop (`Animation.start`) that calls `requestAnimationFrame` on every vsync
 * whether or not an animation loop callback is set, only to reset `info` and advance the node frame. On a
 * `frameloop='demand'` viewport that is 120 scheduled frames a second for an unchanged scene (UI Policy, steady-state
 * decorations: an unchanged scene requests no frames). This stops that loop and does its bookkeeping inside the
 * renders that actually happen, once per task, so a frame that renders several passes advances the node frame once,
 * as the loop would, inside one inspector frame (`begin` before the first pass, `finish` when the task ends). Setting
 * an animation loop callback starts Three's loop again for as long as it is set, and its first call comes from a
 * browser frame with a timestamp; clearing it stops the loop.
 *
 * @param renderer - An initialised node renderer.
 * @public
 */
export function renderOnDemand(renderer: WebGPURenderer): void {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Three internals; pinned by the test.
  const internals = renderer as unknown as NodeRendererInternals;
  const animation = internals._animation;
  const { nodeFrame } = internals._nodes;
  animation.stop();

  let isFrameOpen = false;
  const render = renderer.render.bind(renderer);
  renderer.render = (...parameters: Parameters<WebGPURenderer['render']>): void => {
    if (!isFrameOpen && animation._requestId === null) {
      isFrameOpen = true;
      queueMicrotask(() => {
        isFrameOpen = false;
        internals._inspector.finish();
      });
      if (internals.info.autoReset) {
        internals.info.reset();
      }
      nodeFrame.update();
      internals.info.frame = nodeFrame.frameId;
      internals._inspector.begin();
    }
    render(...parameters);
  };

  const setAnimationLoop = renderer.setAnimationLoop.bind(renderer);
  renderer.setAnimationLoop = async (callback: Parameters<WebGPURenderer['setAnimationLoop']>[0]): Promise<void> => {
    if (callback !== null && animation._requestId === null) {
      // `start` runs one update at once, without a timestamp; with no callback installed yet that update is only
      // bookkeeping, and the callback's first call comes from the browser frame it scheduled.
      animation.start();
    }
    await setAnimationLoop(callback);
    if (callback === null) {
      animation.stop();
    }
  };
}
