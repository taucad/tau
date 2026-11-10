import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  markGeometryReceipt,
  observeLongAnimationFrames,
  onViewerEvent,
  readRendererMemory,
} from '#lib/renderer-telemetry.js';
import type { ViewerTelemetryEvent } from '#lib/viewer-events.js';
import {
  longFrameWindow,
  resetViewerEvents,
  viewerContextLost,
  viewerFirstFrame,
  viewerLongFrameBurst,
  viewerRendererCreated,
  viewerUploadStarted,
} from '#lib/viewer-events.js';

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
  vi.useRealTimers();
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

  it('should sum long-frame batches into one event per window, never one per batch', () => {
    vi.useFakeTimers();
    const seen = listen();
    viewerRendererCreated('webgl');
    for (let batch = 0; batch < 200; batch++) {
      viewerLongFrameBurst(60);
    }
    expect(seen).toEqual([]);

    vi.advanceTimersByTime(longFrameWindow);
    expect(seen).toEqual([{ event: 'long-frame-burst', backend: 'webgl', duration: 12_000 }]);

    viewerLongFrameBurst(70);
    vi.advanceTimersByTime(longFrameWindow - 1);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([
      { event: 'long-frame-burst', backend: 'webgl', duration: 12_000 },
      { event: 'long-frame-burst', backend: 'webgl', duration: 70 },
    ]);
  });

  it('should send the summed long frames before the backend changes', () => {
    vi.useFakeTimers();
    const seen = listen();
    viewerRendererCreated('webgpu');
    viewerLongFrameBurst(50);
    viewerRendererCreated('webgl');
    viewerLongFrameBurst(80);
    vi.advanceTimersByTime(longFrameWindow);
    expect(seen).toEqual([
      { event: 'long-frame-burst', backend: 'webgpu', duration: 50 },
      { event: 'long-frame-burst', backend: 'webgl', duration: 80 },
    ]);
  });

  it('should hold no long frames when no host listens', () => {
    vi.useFakeTimers();
    viewerRendererCreated('webgl');
    viewerLongFrameBurst(60);
    const seen = listen();
    vi.advanceTimersByTime(longFrameWindow);
    expect(seen).toEqual([]);
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

  it('should mark the start of a GPU upload on the current backend, and nothing before a renderer exists', () => {
    const seen = listen();
    viewerUploadStarted();
    viewerRendererCreated('webgl');
    viewerUploadStarted();

    expect(seen).toEqual([{ event: 'upload-start', backend: 'webgl' }]);
  });

  it('should read the live renderer counts on demand, and contain a failing read', () => {
    expect(readRendererMemory()).toBeUndefined();
    viewerRendererCreated('webgl', () => ({ geometries: 4, textures: 2 }));
    expect(readRendererMemory()).toEqual({ geometries: 4, textures: 2 });
    viewerRendererCreated('webgl', () => {
      throw new Error('lost');
    });
    expect(readRendererMemory()).toBeUndefined();
  });
});
