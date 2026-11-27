// @vitest-environment node
/**
 * Build epochs (memory T6): over a 40-step drag the live tier stays within its byte budget and evicts. Its own file so
 * Vitest runs it beside the other build-epochs files.
 */
import { describe, expect, it } from 'vitest';
import { closeClientsAfterEachTest, expectFlatDrag, renderTimeout } from '#replicad-handle-epochs.test-utils.js';

closeClientsAfterEachTest();

describe('replicad build epochs', () => {
  it(
    'should keep the live tier within its byte budget over a long drag',
    async () => {
      const budget = 128 * 1024;
      const { tierBytes, evicted } = await expectFlatDrag({ computeReuseBytes: budget });
      expect(tierBytes.length).toBe(41);
      expect(Math.max(...tierBytes)).toBeLessThanOrEqual(budget);
      expect(evicted).toBeGreaterThan(0);
    },
    renderTimeout,
  );
});
