/**
 * The viewer's load timing: where a project open spends the time between useful paint and first action.
 *
 * The viewer mounts once per open, and that one mount was measured as most of the sampled main-thread time after
 * useful paint, yet nothing named its parts. These spans name them: the canvas mount up to R3F's `onCreated`, the
 * renderer's creation and initialisation, the first presented frame (which is where shader compilation lands), the
 * viewport gizmo's construction, and every 2D canvas context the viewer acquires, tagged by who acquired it.
 *
 * Like `viewer-events.ts`, the viewer only emits. A host subscribes and decides what to do with a span; with no
 * subscriber nothing is built, so a standalone viewer and an ordinary page pay one size check per site. A span carries
 * a closed phase, a closed source and two `performance.now()` readings, never anything about the scene or the user.
 *
 * @module
 */

import { Topic } from '@taucad/events';

/**
 * The timed phases.
 *
 * - `canvas.mount`: the canvas component's first render to R3F's `onCreated`, which includes the renderer.
 * - `renderer.create`: the viewport renderer's construction and `init()`, inside the `gl` factory.
 * - `frame.first`: R3F's `onCreated` to the first frame the canvas presents; first-use shader compilation lands here.
 * - `gizmo.create`: the viewport gizmo's construction, surface, axes and control binding, in one effect run.
 * - `canvas.2d`: one 2D context acquired and drawn by the viewer, tagged with its {@link ViewerCanvas2dSource}.
 *
 * @public
 */
export type ViewerLoadPhase = 'canvas.mount' | 'renderer.create' | 'frame.first' | 'gizmo.create' | 'canvas.2d';

/**
 * Who acquired a 2D context. The gizmo package's own label canvases are not tagged: they are acquired inside
 * `gizmo.create`, so a host attributes an untagged context in that span to the package.
 *
 * @public
 */
export type ViewerCanvas2dSource = 'gizmo.face' | 'gizmo.axis-label' | 'gizmo.style' | 'section.label';

/**
 * How a span ended.
 *
 * @public
 */
export type ViewerLoadOutcome = 'ok' | 'error' | 'cancelled';

/**
 * One finished span, in this realm's `performance.now()` clock.
 *
 * @public
 */
export type ViewerLoadSpan = Readonly<{
  phase: ViewerLoadPhase;
  /** Milliseconds since this realm's time origin. */
  start: number;
  /** Milliseconds since this realm's time origin. */
  end: number;
  outcome: ViewerLoadOutcome;
  source?: ViewerCanvas2dSource;
}>;

/**
 * Ends a span; later calls do nothing.
 *
 * @public
 */
export type FinishViewerLoadSpan = (outcome?: ViewerLoadOutcome) => void;

/* A host handler that throws never reaches the frame path. */
const topic = new Topic<ViewerLoadSpan>({ name: 'viewer-load-timing', onError: () => undefined });
const finished: FinishViewerLoadSpan = () => undefined;

/**
 * Subscribe to the viewer's load spans.
 *
 * @param handler - Called once per finished span; a throw is contained.
 * @returns The unsubscribe.
 * @public
 */
export const subscribeViewerLoadTiming = (handler: (span: ViewerLoadSpan) => void): (() => void) =>
  topic.subscribe(handler);

/**
 * Start one span. With no subscriber this reads no clock and returns a no-op.
 *
 * @param phase - What is being timed.
 * @param source - For `canvas.2d`, who acquired the context.
 * @returns The finish, which emits the span once.
 * @public
 */
export const beginViewerLoadSpan = (phase: ViewerLoadPhase, source?: ViewerCanvas2dSource): FinishViewerLoadSpan => {
  if (topic.size === 0) {
    return finished;
  }
  const start = performance.now();
  let done = false;
  return (outcome = 'ok') => {
    if (done) {
      return;
    }
    done = true;
    topic.emit({ phase, start, end: performance.now(), outcome, ...(source === undefined ? {} : { source }) });
  };
};

/**
 * Time one synchronous 2D canvas acquisition and draw.
 *
 * @param source - Who acquires the context.
 * @param draw - Acquires the context and draws; its result is returned unchanged.
 * @returns What `draw` returned.
 * @public
 */
export const timeViewerCanvas2d = <Result>(source: ViewerCanvas2dSource, draw: () => Result): Result => {
  const finish = beginViewerLoadSpan('canvas.2d', source);
  try {
    const result = draw();
    finish('ok');
    return result;
  } catch (error) {
    finish('error');
    throw error;
  }
};
