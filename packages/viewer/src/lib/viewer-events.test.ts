import { afterEach, describe, expect, it, vi } from 'vitest';
import { markGeometryReceipt, observeLongAnimationFrames, onViewerEvent } from '#lib/renderer-telemetry.js';
import type { ViewerTelemetryEvent } from '#lib/viewer-events.js';
import { resetViewerEvents, viewerContextLost, viewerFirstFrame, viewerRendererCreated } from '#lib/viewer-events.js';

const unsubscribes: Array<() => void> = [];
const listen = (): ViewerTelemetryEvent[] => {
  const seen: ViewerTelemetryEvent[] = [];
  unsubscribes.push(onViewerEvent((event) => seen.push(event)));
  return seen;
};

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) {
    unsubscribe();
  }
  resetViewerEvents();
  vi.unstubAllGlobals();
});

describe('viewer events (FR-17)', () => {
  it('should report a context loss and its restore on the next renderer, once', () => {
    const seen = listen();
    viewerRendererCreated('webgpu');
    viewerContextLost('webgpu');
    viewerRendererCreated('webgl');
    viewerRendererCreated('webgl');
    expect(seen).toEqual([
      { event: 'context-lost', backend: 'webgpu' },
      { event: 'context-restored', backend: 'webgl' },
    ]);
  });

  it('should carry only the closed first-frame facts', () => {
    const seen = listen();
    viewerFirstFrame({ backend: 'webgl', duration: 40, triangles: 1200 });
    expect(seen).toEqual([{ event: 'first-frame', backend: 'webgl', duration: 40, triangles: 1200 }]);
  });

  it('should report a geometry download and one burst per long-frame batch once a renderer exists', () => {
    let deliver: ((list: { getEntries(): unknown[] }) => void) | undefined;
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        public readonly observe = vi.fn();
        public readonly disconnect = vi.fn();
        public constructor(callback: (list: { getEntries(): unknown[] }) => void) {
          deliver = callback;
        }
      },
    );
    const seen = listen();
    const stop = observeLongAnimationFrames();
    markGeometryReceipt(new Uint8Array(4));
    deliver?.({ getEntries: () => [{ startTime: 0, duration: 60 }] });
    expect(seen).toEqual([]);

    viewerRendererCreated('webgl');
    markGeometryReceipt(new Uint8Array(4));
    deliver?.({
      getEntries: () => [
        { startTime: 0, duration: 60 },
        { startTime: 70, duration: 80 },
      ],
    });
    stop();
    expect(seen).toEqual([
      { event: 'download', backend: 'webgl', format: 'glb' },
      { event: 'long-frame-burst', backend: 'webgl', duration: 140 },
    ]);
  });

  it('should contain a handler that throws', () => {
    unsubscribes.push(
      onViewerEvent(() => {
        throw new Error('host bug');
      }),
    );
    const seen = listen();
    expect(() => {
      viewerContextLost('webgl');
    }).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});
