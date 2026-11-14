import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViewerLoadSpan } from '@taucad/viewer/lib/viewer-load-timing';
import { installProjectOpenLoadTiming } from '#lib/project-open-load-timing.js';
import { resetPageProjectOpenPerformance } from '#lib/project-open-performance.js';

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(span: ViewerLoadSpan) => void>,
}));

vi.mock('@taucad/viewer/lib/viewer-load-timing', () => ({
  subscribeViewerLoadTiming: (handler: (span: ViewerLoadSpan) => void) => {
    mocks.handlers.push(handler);
    return () => undefined;
  },
}));

const config = {
  enabled: true,
  origin: 'http://127.0.0.1:4518',
  runId: '123e4567-e89b-42d3-a456-426614174000',
  journeyId: '123e4567-e89b-42d3-a456-426614174001',
  buildId: 'cc200962038bb96efab158c77c821c8322a34740',
  fixtureId: 'root-10',
  routeTemplate: '/w/:workspace/:project',
  profile: 'desktop',
  cacheCohort: 'warm',
  realm: 'page',
};

type ObserverCallback = (list: { getEntries: () => unknown[] }) => void;

const stubPage = () => {
  const measure = vi.fn<(name: string, options: PerformanceMeasureOptions) => void>();
  const observed: Array<{ callback: ObserverCallback; type?: string }> = [];
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4518' });
  vi.stubGlobal('performance', { now: () => 0, timeOrigin: 1000, measure });
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      private readonly record: { callback: ObserverCallback; type?: string };

      public constructor(callback: ObserverCallback) {
        this.record = { callback };
        observed.push(this.record);
      }

      public observe(options: { type: string }): void {
        this.record.type = options.type;
      }

      public disconnect(): void {
        this.record.type = undefined;
      }
    },
  );
  return { measure, observed };
};

afterEach(() => {
  mocks.handlers.length = 0;
  resetPageProjectOpenPerformance();
  vi.unstubAllGlobals();
});

describe('project-open window probe', () => {
  it('should observe and subscribe to nothing outside a browser page', async () => {
    const { measure, observed } = stubPage();
    vi.stubGlobal('location', undefined);

    expect(installProjectOpenLoadTiming()).toBe(false);
    await vi.dynamicImportSettled();

    expect(observed).toEqual([]);
    expect(mocks.handlers).toEqual([]);
    expect(measure).not.toHaveBeenCalled();
  });

  it('should bridge the viewer spans on a deployed page without observing long frames', async () => {
    const { measure, observed } = stubPage();
    vi.stubGlobal('location', { origin: 'https://taucad.dev' });
    vi.stubGlobal('document', {});

    expect(installProjectOpenLoadTiming()).toBe(true);
    await vi.dynamicImportSettled();
    expect(observed).toEqual([]);

    for (const handler of mocks.handlers) {
      handler({ phase: 'canvas.mount', start: 4000, end: 4250, outcome: 'ok' });
    }

    expect(measure.mock.calls.map(([name, options]) => [name, options.start, options.end])).toEqual([
      ['tau.load.viewer.mount', 4000, 4250],
    ]);
    expect(measure.mock.calls[0]?.[1]?.detail).toMatchObject({ environment: 'deployed', runId: null });
  });

  it('should record long frames and the viewer spans under the project-open vocabulary', async () => {
    const { measure, observed } = stubPage();
    vi.stubGlobal('__TAU_LOCAL_PROJECT_OPEN_PERFORMANCE__', config);

    expect(installProjectOpenLoadTiming()).toBe(true);
    await vi.dynamicImportSettled();
    expect(observed.map(({ type }) => type)).toEqual(['long-animation-frame']);

    observed[0]?.callback({
      getEntries: () => [{ startTime: 4200, duration: 180, blockingDuration: 130.4, scripts: [{}, {}] }],
    });
    for (const handler of mocks.handlers) {
      handler({ phase: 'frame.first', start: 4300, end: 5100, outcome: 'ok' });
      handler({ phase: 'canvas.2d', start: 4400, end: 4401, outcome: 'ok', source: 'gizmo.face' });
    }

    expect(measure.mock.calls.map(([name, options]) => [name, options.start, options.end])).toEqual([
      ['tau.load.frame.long', 4200, 4380],
      ['tau.load.viewer.firstFrame', 4300, 5100],
      ['tau.load.canvas.2d', 4400, 4401],
    ]);
    expect(measure.mock.calls[0]?.[1]?.detail).toMatchObject({ counters: { blocking: 130, scripts: 2 } });
    expect(measure.mock.calls[2]?.[1]?.detail).toMatchObject({ source: 'gizmo.face' });
  });
});
