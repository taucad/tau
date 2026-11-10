import type { RootState } from '@react-three/fiber';
import { WebGPUCoordinateSystem } from 'three';
import { createCallbackLogic } from 'xstate';
import type { WebGPURenderer } from 'three/webgpu';
import type { RendererInstance } from '#graphics/three/renderer.js';
import { reportWebGpuCanvasLoss } from '#graphics/graphics-backend.js';
import { viewerContextLost } from '#lib/viewer-events.js';
import type {
  CanvasEvent,
  CanvasHostCommand,
  CanvasHostLogic,
  CanvasHostReport,
  CanvasSurface,
} from '#machines/canvas.machine.js';

/** The part of a `GPUDevice` that reports its loss; `lib.dom` baselines may predate the WebGPU types. */
type WebGpuLossObservable = Readonly<{ lost: Promise<Readonly<{ reason: string; message: string }>> }>;

/** R3F's frame callback, which reads the root itself. Its subscription only reads `getState` from the store it is given. */
type FrameCallback = (state: RootState, delta: number) => void;
type FrameSubscribe = (
  callback: { current: FrameCallback },
  priority: number,
  store: Readonly<{ getState: () => RootState }>,
) => () => void;

/** After the final encoding (3.5) and the render-loop observer (5), as the first-frame component ran before. */
const observerPriority = 6;

/**
 * The R3F root a host adapter is built around, plus the renderer factory's retirement check: a retired factory's
 * canvas was removed, so nothing it reports belongs to a live canvas.
 *
 * @public
 */
export type CanvasHostRoot = Readonly<{ root: RootState; isRetired: () => boolean }>;

/**
 * The R3F root's surface as the canvas actor records it.
 *
 * @param state - The R3F root state.
 * @returns Its CSS size and pixel ratio.
 */
const surfaceOf = (state: RootState): CanvasSurface => ({
  width: state.size.width,
  height: state.size.height,
  pixelRatio: state.viewport.dpr,
});

/**
 * Builds the host adapter for one R3F root: its renderer, DOM canvas and `invalidate` stay in this
 * closure. While it runs it
 *
 * - reports a lost WebGL context or WebGPU device as `contextLost`, and a WebGPU device the browser destroyed as
 *   `rendererFailed` (the viewer then remounts on WebGL);
 * - reports `surfaceResized` from the frame loop whenever the root's size or pixel ratio changes, so a canvas moved
 *   to a display with another pixel ratio re-sizes its budget slot;
 * - observes the first frame with area and reports `framePresented` once it can be on screen. A frame's GPU work is
 *   submitted when its callbacks run, but the page paints it only once the compositor produces frames again; on a
 *   software adapter the browser first compiles every pipeline, which can hold the compositor for seconds. A second
 *   animation frame after the submission is the earliest point the page shows, and answers input over, the stage;
 * - answers `requestRender` with `invalidate()`.
 *
 * @param host - The R3F root from `onCreated` and its factory's retirement check.
 * @returns Callback logic for the canvas actor's `hostCreated`.
 * @public
 */
export const createCanvasHostLogic = ({ root, isRetired }: CanvasHostRoot): CanvasHostLogic =>
  createCallbackLogic<CanvasHostCommand, undefined>(({ sendBack, receive }) => {
    // An object, not a `let`: the checks below read it after awaits and callbacks, which flow analysis cannot see.
    const life = { stopped: false };
    const report = (event: CanvasHostReport): void => {
      if (!life.stopped && !isRetired()) {
        sendBack(event);
      }
    };
    // R3F types its renderer as WebGL even when the factory supplies WebGPU.
    const renderer = root.gl as RendererInstance;
    let releaseLossListener: () => void;

    if ('isWebGPURenderer' in renderer) {
      const webGpuRenderer = renderer;
      const previousOnDeviceLost = webGpuRenderer.onDeviceLost;
      const onDeviceLost = (info: Parameters<InstanceType<typeof WebGPURenderer>['onDeviceLost']>[0]): void => {
        if (life.stopped || isRetired()) {
          return;
        }
        previousOnDeviceLost.call(webGpuRenderer, info);
        viewerContextLost('webgpu');
        report({ type: 'contextLost' });
      };
      webGpuRenderer.onDeviceLost = onDeviceLost;
      releaseLossListener = () => {
        if (webGpuRenderer.onDeviceLost === onDeviceLost) {
          webGpuRenderer.onDeviceLost = previousOnDeviceLost;
        }
      };
      // Three ignores a loss whose reason is "destroyed", taking it for its own `dispose()`. Only the factory disposes
      // the renderer, and it retires first, so a destroyed device on a live canvas was revoked by the browser: a GPU
      // process that cannot allocate the canvas's swap chain (Chromium on a software adapter) destroys the device right
      // after the first frame. Nothing would draw again, so the canvas is remounted on WebGL, as for a failed start.
      const { device } = webGpuRenderer.backend as { readonly device?: WebGpuLossObservable };
      if (device) {
        // async-iife: bootstrap -- A callback actor cannot await a loss that may never come; it only reports one.
        void (async (): Promise<void> => {
          const info = await device.lost;
          if (info.reason !== 'destroyed' || life.stopped || isRetired()) {
            return;
          }
          reportWebGpuCanvasLoss();
          report({
            type: 'rendererFailed',
            failure: {
              kind: 'webgpu-initialization',
              message: `The browser destroyed the WebGPU device: ${info.message}`,
            },
          });
        })();
      }
    } else {
      const onContextLost = (event: Event): void => {
        if (life.stopped || isRetired()) {
          return;
        }
        event.preventDefault();
        viewerContextLost('webgl');
        report({ type: 'contextLost' });
      };
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      releaseLossListener = () => {
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      };
    }

    // Every frame: report a changed surface. First frame: once one frame with area is submitted, wait two animation
    // frames. A size or pixel-ratio change makes R3F draw, so the frame loop sees every change.
    let frameRequest: number | undefined;
    let submitted = false;
    let reported = surfaceOf(root.get());
    let unsubscribeFrame: (() => void) | undefined;
    const observer = {
      current(): void {
        const surface = surfaceOf(root.get());
        if (
          surface.width !== reported.width ||
          surface.height !== reported.height ||
          surface.pixelRatio !== reported.pixelRatio
        ) {
          reported = surface;
          report({ type: 'surfaceResized', surface });
        }
        if (submitted || surface.width === 0 || surface.height === 0) {
          return;
        }
        submitted = true;
        frameRequest = requestAnimationFrame(() => {
          frameRequest = requestAnimationFrame(() => {
            frameRequest = undefined;
            report({ type: 'framePresented' });
          });
        });
      },
    };
    const subscribe = root.internal.subscribe as FrameSubscribe;
    unsubscribeFrame = subscribe(observer, observerPriority, { getState: root.get });
    const { size } = root.get();
    if (size.width > 0 && size.height > 0) {
      // The canvas may have drawn before the observer subscribed; on demand, ask for the one frame it observes.
      root.invalidate();
    }

    // The one command is `requestRender`.
    receive(() => {
      if (!life.stopped) {
        root.get().invalidate();
      }
    });

    return () => {
      life.stopped = true;
      releaseLossListener();
      unsubscribeFrame?.();
      unsubscribeFrame = undefined;
      if (frameRequest !== undefined) {
        cancelAnimationFrame(frameRequest);
        frameRequest = undefined;
      }
    };
  });

/**
 * The `hostCreated` event that hands one R3F root to its canvas actor: from `onCreated`, and again when the surface
 * re-attaches to a root that is still live.
 *
 * @param host - The R3F root and its factory's retirement check.
 * @returns The event, with the host adapter built around the root.
 * @public
 */
export const canvasHostCreated = (host: CanvasHostRoot): Extract<CanvasEvent, { type: 'hostCreated' }> => {
  // The root state from `onCreated` is a snapshot: R3F replaces `size` and `viewport` on resize, so read it live.
  const state = host.root.get();
  // R3F types its renderer as WebGL even when the factory supplies WebGPU.
  const renderer = state.gl as RendererInstance;
  return {
    type: 'hostCreated',
    backend: renderer.coordinateSystem === WebGPUCoordinateSystem ? 'webgpu' : 'webgl',
    surface: surfaceOf(state),
    domElement: renderer.domElement,
    host: createCanvasHostLogic(host),
  };
};
