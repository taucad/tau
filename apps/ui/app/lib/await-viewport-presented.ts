import type { ActorRefFrom, Subscription } from 'xstate';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';

type GraphicsActor = ActorRefFrom<typeof graphicsMachine>;
type CanvasSnapshot = ReturnType<
  NonNullable<ReturnType<GraphicsActor['getSnapshot']>['context']['canvas']>['ref']['getSnapshot']
>;

/**
 * Whether background GPU work may start beside this canvas: it has presented a frame on its render tier (the canvas
 * machine's `presented` state, which `selectPresentedRenderTier` reads), or it will never draw again (lost, stopped, or
 * a WebGL renderer that failed). A WebGPU canvas that failed is replaced by a WebGL one, so that replacement is waited
 * for. It reads the snapshot through types only: the thumbnail generator that waits here loads with the project
 * route's interactive tier, and the canvas machine's module graph loads with the viewer.
 */
const canvasSettled = (snapshot: CanvasSnapshot): boolean =>
  snapshot.matches('presented') ||
  snapshot.status !== 'active' ||
  snapshot.matches('lost') ||
  (snapshot.matches('failed') && snapshot.context.backend !== 'webgpu');

/**
 * Resolve once the viewport of `graphics` has presented on its render tier, so a background capture (an automatic
 * thumbnail) starts after the person's view is on screen rather than competing with its first frame. A viewer that
 * mounts no canvas, or none at all, does not hold it. On a software GPU the two share one CPU-bound GPU process: a
 * thumbnail started while a WebGPU canvas falls back to WebGL held the viewport's first frame for about 14 s.
 *
 * @param graphics - The main viewer's graphics actor, or `undefined` when no viewer shows the entry.
 * @param signal - Rejects with its reason when aborted.
 */
export async function awaitViewportPresented(graphics: GraphicsActor | undefined, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!graphics) {
    return;
  }
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let canvasSubscription: Subscription | undefined;
  let watchedCanvasId: string | undefined;
  let settled = false;
  const finish = (): void => {
    settled = true;
    graphicsSubscription.unsubscribe();
    canvasSubscription?.unsubscribe();
    signal.removeEventListener('abort', abort);
  };
  const abort = (): void => {
    finish();
    reject(signal.reason);
  };
  const settle = (): void => {
    finish();
    resolve();
  };
  const observe = (): void => {
    if (settled) {
      return;
    }
    const snapshot = graphics.getSnapshot();
    const canvas = snapshot.status === 'active' ? snapshot.context.canvas : undefined;
    if (!canvas) {
      settle();
      return;
    }
    if (canvas.canvasId !== watchedCanvasId) {
      canvasSubscription?.unsubscribe();
      watchedCanvasId = canvas.canvasId;
      canvasSubscription = canvas.ref.subscribe({
        next: (next) => {
          if (!settled && canvasSettled(next)) {
            settle();
          }
        },
        complete: observe,
      });
    }
    if (canvasSettled(canvas.ref.getSnapshot())) {
      settle();
    }
  };
  const graphicsSubscription = graphics.subscribe({ next: observe, complete: observe });
  signal.addEventListener('abort', abort, { once: true });
  observe();
  return promise;
}
