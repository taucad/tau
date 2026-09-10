import { describe, expect, it, vi } from 'vitest';
import { createSectionTopologyScheduler } from '#components/geometry/graphics/three/utils/section-topology-scheduler.js';

describe('section topology scheduler', () => {
  it('runs one job and replaces the queued job with the newest generation', async () => {
    let finishFirst: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const runFirst = vi.fn(async () => firstRun);
    const runSecond = vi.fn(async () => undefined);
    const runThird = vi.fn(async () => undefined);
    const scheduler = createSectionTopologyScheduler();

    const first = scheduler.submit({ generation: 1, run: runFirst });
    const second = scheduler.submit({ generation: 2, run: runSecond });
    const third = scheduler.submit({ generation: 3, run: runThird });
    expect(await second).toBe('discarded');
    finishFirst?.();

    expect(await first).toBe('discarded');
    expect(await third).toBe('completed');
    expect(runFirst).toHaveBeenCalledTimes(1);
    expect(runSecond).not.toHaveBeenCalled();
    expect(runThird).toHaveBeenCalledTimes(1);
    expect(scheduler.stats()).toEqual({ started: 2, discarded: 2 });
  });

  it('reports a failed job without blocking the next generation', async () => {
    const scheduler = createSectionTopologyScheduler();
    const failed = scheduler.submit({
      generation: 1,
      run: async () => {
        throw new Error('topology failed');
      },
    });
    const next = scheduler.submit({ generation: 2, run: async () => undefined });

    expect(await failed).toBe('failed');
    expect(await next).toBe('completed');
  });
});
