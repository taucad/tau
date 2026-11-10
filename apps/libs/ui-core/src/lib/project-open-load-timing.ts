/**
 * The project-open window probe: spans for the two stretches of a project open that had none.
 *
 * Between the last instrumented phase and useful paint, and between useful paint and first action, a project open
 * carried no span at all. The viewer's mount was sampled as most of the second window, and each open was counted
 * acquiring seventeen 2D contexts and connecting CodeMirror's editor class three times, but none of it was timed. This
 * bridges the viewer's own load spans (`@taucad/viewer/lib/viewer-load-timing`) into the project-open recorder, and
 * records every Long Animation Frame as a `frame.long` span so a window's blocked time can be set against the spans
 * that overlap it.
 *
 * Inert unless a local harness injected a valid configuration before this module ran: nothing is imported, observed or
 * subscribed otherwise, so an ordinary page pays one property read.
 *
 * @module
 */

import { pageProjectOpenPerformance, readLocalProjectOpenPerformance } from '#lib/project-open-performance.js';
import type { ProjectOpenPerformance, ProjectOpenPhase } from '#lib/project-open-performance.js';
import type { ViewerLoadPhase, ViewerLoadSpan } from '@taucad/viewer/lib/viewer-load-timing';

const viewerPhases: Readonly<Record<ViewerLoadPhase, ProjectOpenPhase>> = {
  'canvas.mount': 'viewer.mount',
  'renderer.create': 'viewer.renderer',
  'frame.first': 'viewer.firstFrame',
  'gizmo.create': 'viewer.gizmo',
  'canvas.2d': 'canvas.2d',
};

/** The shape Chromium reports for `long-animation-frame`, which TypeScript's DOM lib does not declare. */
type LongAnimationFrameEntry = PerformanceEntry & {
  readonly blockingDuration?: number;
  readonly scripts?: readonly unknown[];
};

/**
 * Forward one viewer span.
 *
 * @param recorder - The page's admitted recorder.
 * @param span - The viewer's finished span.
 */
export const recordViewerLoadSpan = (recorder: ProjectOpenPerformance, span: ViewerLoadSpan): void => {
  recorder.record(viewerPhases[span.phase], {
    start: span.start,
    end: span.end,
    outcome: span.outcome,
    ...(span.source === undefined ? {} : { source: span.source }),
  });
};

/**
 * Record Long Animation Frames, buffered from the navigation's start, as `frame.long` spans.
 *
 * @param recorder - The page's admitted recorder.
 */
const observeLongFrames = (recorder: ProjectOpenPerformance): void => {
  if (typeof PerformanceObserver === 'undefined') {
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LongAnimationFrameEntry[]) {
      recorder.record('frame.long', {
        start: entry.startTime,
        end: entry.startTime + entry.duration,
        outcome: 'ok',
        counters: {
          blocking: Math.round(entry.blockingDuration ?? 0),
          scripts: entry.scripts?.length ?? 0,
        },
      });
    }
  });
  try {
    // Only Chromium reports the type; elsewhere the window keeps the spans it has.
    observer.observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    observer.disconnect();
  }
};

/**
 * Install the window probe when a local harness asked for it. Call once, before hydration.
 *
 * @returns Whether the probe was installed.
 */
export const installProjectOpenLoadTiming = (): boolean => {
  if (readLocalProjectOpenPerformance() === undefined) {
    return false;
  }
  const recorder = pageProjectOpenPerformance();
  observeLongFrames(recorder);
  // Loaded only when measuring, so an ordinary page's entry graph does not grow. The viewer mounts long after this
  // resolves, and a span emitted with no subscriber is simply not built.
  // async-iife: bootstrap -- the entry cannot await a diagnostic import.
  void (async (): Promise<void> => {
    try {
      const { subscribeViewerLoadTiming } = await import('@taucad/viewer/lib/viewer-load-timing');
      subscribeViewerLoadTiming((span) => {
        recordViewerLoadSpan(recorder, span);
      });
    } catch {
      // A diagnostic that fails to load leaves the page as it was.
    }
  })();
  return true;
};
