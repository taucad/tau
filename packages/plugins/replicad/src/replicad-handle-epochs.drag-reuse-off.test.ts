// @vitest-environment node
/**
 * Build epochs (memory T6): the WebAssembly heap and live OpenCascade handles stay flat over a 40-step drag with reuse
 * off. Its own file so Vitest runs it beside the other build-epochs files.
 */
import { describe, expect, it } from 'vitest';
import { closeClientsAfterEachTest, expectFlatDrag, renderTimeout } from '#replicad-handle-epochs.test-utils.js';

closeClientsAfterEachTest();

describe('replicad build epochs', () => {
  it(
    'should keep the heap and live handles flat over a long drag with reuse off',
    async () => {
      const { tierBytes } = await expectFlatDrag({ computeReuse: false });
      expect(tierBytes).toStrictEqual([]);
    },
    renderTimeout,
  );
});
