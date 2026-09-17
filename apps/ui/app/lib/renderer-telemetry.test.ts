import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySpanRecord } from '@taucad/runtime';
import {
  clearRendererSpans,
  observeLongAnimationFrames,
  recordRendererSpan,
  rendererSpans,
  telemetryJsonl,
} from '#lib/renderer-telemetry.js';

afterEach(() => {
  clearRendererSpans();
  vi.unstubAllGlobals();
});

describe('renderer telemetry', () => {
  it('gives every span one producer and a unique identifier, and never grows without bound', () => {
    for (let index = 0; index < 520; index++) {
      recordRendererSpan('renderer.frame', { startTime: index, duration: 1 });
    }

    const spans = rendererSpans();
    // I6: a manual export is the only flush, so the buffer is what bounds the page.
    expect(spans).toHaveLength(500);
    expect(spans[0]?.startTime).toBe(20);
    expect(spans[0]?.origin.label).toBe('renderer');
    expect(new Set(spans.map((span) => span.origin.instance)).size).toBe(1);
    expect(new Set(spans.map((span) => span.detail?.['spanId'])).size).toBe(500);
  });

  it('records a long animation frame with what blocked it', () => {
    let deliver: ((list: { getEntries(): unknown[] }) => void) | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        public readonly observe = observe;
        public readonly disconnect = disconnect;
        public constructor(callback: (list: { getEntries(): unknown[] }) => void) {
          deliver = callback;
        }
      },
    );

    const stop = observeLongAnimationFrames();
    deliver?.({
      getEntries: () => [{ startTime: 10, duration: 120, blockingDuration: 70, renderStart: 100, scripts: [{}, {}] }],
    });
    stop();

    expect(observe).toHaveBeenCalledWith({ type: 'long-animation-frame', buffered: true });
    expect(rendererSpans()[0]).toMatchObject({
      name: 'renderer.long-animation-frame',
      startTime: 10,
      duration: 120,
      detail: { blockingDuration: 70, scriptCount: 2, renderDelay: 90 },
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('exports one JSON line per span on the absolute clock, whichever producer emitted it', () => {
    const worker: TelemetrySpanRecord = {
      name: 'kernel.render',
      startTime: 5,
      duration: 1,
      workerTimeOrigin: 1000,
      origin: { label: 'worker', instance: 'w1' },
      epoch: 1_000_000,
    };
    recordRendererSpan('renderer.presentation', { startTime: 1, duration: 2 });
    const [presentation] = rendererSpans();

    const lines = telemetryJsonl([worker, presentation!]).split('\n');

    expect(lines).toHaveLength(2);
    // The renderer's epoch is `Date.now() - performance.now()`, far past the worker's fixture epoch.
    expect(JSON.parse(lines[0]!)).toMatchObject({ name: 'kernel.render' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ name: 'renderer.presentation', origin: { label: 'renderer' } });
  });
});
