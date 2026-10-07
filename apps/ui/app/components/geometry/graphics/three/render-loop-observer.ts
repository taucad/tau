/** Submission cycles are not GPU-completion or compositor-presentation events. */
export type RenderLoopStatus = { status: 'active'; fps: number } | { status: 'idle' | 'hidden' };
export type RenderLoopSample = Readonly<{ at: number; source: 'demand' | 'resize-prepaint' }>;
export type RenderLoopCapture = Readonly<{
  metric: 'render-loop-submissions';
  /** Milliseconds from the document's performance time origin. */
  startedAt: number;
  /** Milliseconds from the document's performance time origin, including trailing stalls. */
  endedAt: number;
  samples: readonly RenderLoopSample[];
  interrupted: boolean;
}>;

/** Milliseconds between DOM publications, independent of demand-frame scheduling. */
const publishPeriod = 250;
/** Milliseconds without a submission before the display reports idle. */
const idlePeriod = 500;

export type RenderLoopObserver = Readonly<{
  record: (at: number, sampleSource?: RenderLoopSample['source']) => void;
  setHidden: (value: boolean) => void;
  startCapture: (at: number) => void;
  finishCapture: (at: number) => RenderLoopCapture;
  withResizeSubmission: (render: () => void) => void;
  dispose: () => void;
}>;

export const createRenderLoopObserver = (publish: (status: RenderLoopStatus) => void): RenderLoopObserver => {
  let disposed = false;
  let hidden = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastObservedAt = 0;
  let windowStartedAt: number | undefined;
  let submissions = 0;
  let capture: { startedAt: number; samples: RenderLoopSample[]; interrupted: boolean } | undefined;
  let source: RenderLoopSample['source'] = 'demand';

  const reset = (): void => {
    windowStartedAt = undefined;
    submissions = 0;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const update = (): void => {
    timer = undefined;
    if (disposed || hidden) {
      return;
    }
    const now = performance.now();
    if (now - lastObservedAt >= idlePeriod) {
      reset();
      publish({ status: 'idle' });
      return;
    }
    if (windowStartedAt !== undefined && now > windowStartedAt) {
      publish({ status: 'active', fps: (submissions * 1000) / (now - windowStartedAt) });
    }
    // Keep only a short active window; the capture retains raw samples independently.
    windowStartedAt = now;
    submissions = 0;
    timer = setTimeout(update, publishPeriod);
  };

  return {
    record(at: number, sampleSource = source): void {
      if (disposed || hidden || !Number.isFinite(at)) {
        return;
      }
      const now = performance.now();
      if (windowStartedAt !== undefined && now - lastObservedAt >= idlePeriod) {
        reset();
      }
      lastObservedAt = now;
      windowStartedAt ??= now;
      submissions += 1;
      capture?.samples.push({ at, source: sampleSource });
      timer ??= setTimeout(update, publishPeriod);
    },
    setHidden(value: boolean): void {
      if (disposed) {
        return;
      }
      hidden = value;
      if (capture) {
        capture.interrupted ||= value;
      }
      reset();
      publish({ status: value ? 'hidden' : 'idle' });
    },
    startCapture(at: number): void {
      if (disposed || capture) {
        throw new Error('Render-loop capture is unavailable or already running');
      }
      capture = { startedAt: at, samples: [], interrupted: hidden };
    },
    finishCapture(at: number): RenderLoopCapture {
      if (!capture) {
        throw new Error('No render-loop capture is running');
      }
      const result: RenderLoopCapture = { ...capture, endedAt: at, metric: 'render-loop-submissions' };
      capture = undefined;
      return result;
    },
    withResizeSubmission(render: () => void): void {
      const previousSource = source;
      source = 'resize-prepaint';
      try {
        render();
      } finally {
        source = previousSource;
      }
    },
    dispose(): void {
      disposed = true;
      reset();
      capture = undefined;
    },
  };
};

/** One observer per actual canvas renderer, shared with the debug capture owner. */
export const renderLoopObservers = new WeakMap<HTMLCanvasElement, RenderLoopObserver>();
