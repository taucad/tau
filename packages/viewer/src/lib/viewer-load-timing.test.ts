import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginViewerLoadSpan, subscribeViewerLoadTiming, timeViewerCanvas2d } from '#lib/viewer-load-timing.js';
import type { ViewerLoadSpan } from '#lib/viewer-load-timing.js';

const unsubscribes: Array<() => void> = [];
const listen = (): ViewerLoadSpan[] => {
  const seen: ViewerLoadSpan[] = [];
  unsubscribes.push(subscribeViewerLoadTiming((span) => seen.push(span)));
  return seen;
};

const stubClock = (): void => {
  let clock = 100;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    clock += 5;
    return clock;
  });
};

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) {
    unsubscribe();
  }
  vi.restoreAllMocks();
});

describe('viewer load timing', () => {
  it('should read no clock and emit nothing without a subscriber', () => {
    const now = vi.spyOn(performance, 'now');

    beginViewerLoadSpan('renderer.create')();
    expect(timeViewerCanvas2d('gizmo.face', () => 'drawn')).toBe('drawn');

    expect(now).not.toHaveBeenCalled();
  });

  it('should emit one span per begin, whichever outcome finishes it first', () => {
    stubClock();
    const seen = listen();

    const finish = beginViewerLoadSpan('frame.first');
    finish('cancelled');
    finish('ok');

    expect(seen).toEqual([{ phase: 'frame.first', start: 105, end: 110, outcome: 'cancelled' }]);
  });

  it('should tag a 2D context with its source and keep a draw failure', () => {
    stubClock();
    const seen = listen();

    expect(timeViewerCanvas2d('gizmo.axis-label', () => 3)).toBe(3);
    expect(() =>
      timeViewerCanvas2d('section.label', () => {
        throw new Error('No 2D context');
      }),
    ).toThrow('No 2D context');

    expect(seen).toEqual([
      { phase: 'canvas.2d', start: 105, end: 110, outcome: 'ok', source: 'gizmo.axis-label' },
      { phase: 'canvas.2d', start: 115, end: 120, outcome: 'error', source: 'section.label' },
    ]);
  });

  it('should keep a throwing host handler off the viewer path', () => {
    unsubscribes.push(
      subscribeViewerLoadTiming(() => {
        throw new Error('Host handler failed');
      }),
    );

    expect(() => {
      beginViewerLoadSpan('gizmo.create')();
    }).not.toThrow();
  });
});
