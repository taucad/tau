import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostTimingNow, recordHostTiming } from '#timing.js';

describe('recordHostTiming', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    performance.clearMarks();
    performance.clearMeasures();
  });

  it('records a measure from the given start with its labels', () => {
    const start = hostTimingNow()!;
    recordHostTiming('log-write', start, { type: 'run.lifecycle', bytes: 120 });
    const [entry] = performance.getEntriesByName('tau.agent-host.log-write', 'measure') as PerformanceMeasure[];
    expect(entry?.startTime).toBe(start);
    expect(entry?.detail).toEqual({ type: 'run.lifecycle', bytes: 120 });
  });

  it('records a mark when no start is given', () => {
    recordHostTiming('model-request-sent', undefined, { bytes: 42 });
    const [entry] = performance.getEntriesByName('tau.agent-host.model-request-sent', 'mark') as PerformanceMark[];
    expect(entry?.detail).toEqual({ bytes: 42 });
  });

  it('never throws when the timeline refuses an entry', () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new Error('no user timing');
    });
    expect(() => recordHostTiming('model-request-sent')).not.toThrow();
  });
});
