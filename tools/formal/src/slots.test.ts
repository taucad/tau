import { describe, expect, it } from 'vitest';
import { mapBounded, processSlots } from '#slots.js';

const tick = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 1);
  });

describe('processSlots', () => {
  it('should run at most its limit of jobs at once and every job in turn', async () => {
    const slots = processSlots(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map(async (job) =>
        slots.run(async () => {
          started.push(job);
          running += 1;
          peak = Math.max(peak, running);
          await tick();
          running -= 1;
          return job * 10;
        }),
      ),
    );

    expect(results).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });

  it('should free a slot when its job throws', async () => {
    const slots = processSlots(1);

    await expect(
      slots.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(slots.run(async () => 'next')).resolves.toBe('next');
  });

  it('should refuse a limit below one', () => {
    expect(() => processSlots(0)).toThrow('positive integer');
  });
});

describe('mapBounded', () => {
  it('should keep the items order whatever order they finish in', async () => {
    const results = await mapBounded([30, 1, 20, 2], 4, async (finishDelay, index) => {
      await new Promise((resolve) => {
        setTimeout(resolve, finishDelay);
      });
      return `${String(index)}:${String(finishDelay)}`;
    });

    expect(results).toEqual(['0:30', '1:1', '2:20', '3:2']);
  });
});
