import { describe, expect, it } from 'vitest';
import { RuntimeTracer } from '#framework/runtime-tracer.js';

const median = (values: number[]): number => {
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)]!;
};

describe('RuntimeTracer overhead gate', () => {
  it('keeps a short-render span batch below 0.25 ms median overhead', () => {
    const tracer = new RuntimeTracer();
    tracer.setEntrySink(() => undefined);
    const warmups = 8;
    const samples = 31;
    const deltas: number[] = [];

    for (let iteration = 0; iteration < warmups + samples; iteration++) {
      const bareStart = performance.now();
      for (let span = 0; span < 10; span++) {
        performance.now();
        performance.now();
      }
      const bare = performance.now() - bareStart;

      const tracedStart = performance.now();
      for (let span = 0; span < 10; span++) {
        tracer.startSpan('kernel.short-render').end();
      }
      const traced = performance.now() - tracedStart;
      if (iteration >= warmups) {
        deltas.push(traced - bare);
      }
    }

    expect(median(deltas)).toBeLessThanOrEqual(0.25);
  });
});
