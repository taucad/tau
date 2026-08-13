import { describe, expect, it } from 'vitest';
import { summarizeLoadPathSamples } from '#experiments/load-path/summary.js';

describe('load-path profiler summary', () => {
  it('should summarize deterministic timing samples by bucket and total', () => {
    const summary = summarizeLoadPathSamples([
      { bucket: 'runtimeExport', ms: 20 },
      { bucket: 'runtimeExport', ms: 10 },
      { bucket: 'runtimeExport', ms: 30 },
      { bucket: 'glbParse', ms: 5 },
      { bucket: 'recordBuild', ms: 2 },
      { bucket: 'statsFacade', ms: 1 },
    ]);

    expect(summary).toEqual({
      buckets: {
        runtimeExport: {
          count: 3,
          minMs: 10,
          medianMs: 20,
          p95Ms: 30,
          maxMs: 30,
          totalMs: 60,
        },
        glbParse: {
          count: 1,
          minMs: 5,
          medianMs: 5,
          p95Ms: 5,
          maxMs: 5,
          totalMs: 5,
        },
        recordBuild: {
          count: 1,
          minMs: 2,
          medianMs: 2,
          p95Ms: 2,
          maxMs: 2,
          totalMs: 2,
        },
        statsFacade: {
          count: 1,
          minMs: 1,
          medianMs: 1,
          p95Ms: 1,
          maxMs: 1,
          totalMs: 1,
        },
      },
      totalMs: {
        count: 6,
        minMs: 1,
        medianMs: 5,
        p95Ms: 30,
        maxMs: 30,
        totalMs: 68,
      },
    });
  });
});
