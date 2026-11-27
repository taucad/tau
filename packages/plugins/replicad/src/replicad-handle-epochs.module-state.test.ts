// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Build epochs (catalogue E12, memory R5): a shape kept in module state is delivered again after the build that
 * returned it was released, with no handle accumulating, reuse off and on. Its own file so Vitest runs it beside the
 * other build-epochs files.
 */
import { describe, expect, it } from 'vitest';
import { summarizeLeaks } from '@taucad/runtime-testing';
import {
  closeClientsAfterEachTest,
  collect,
  ledgerOf,
  memoized,
  renderTimeout,
  session,
} from '#replicad-handle-epochs.test-utils.js';

closeClientsAfterEachTest();

describe('replicad build epochs', () => {
  it(
    'should deliver a shape kept in module state again after the build that returned it was released',
    async () => {
      for (const options of [{ computeReuse: false }, {}] as const) {
        const opened = session(memoized, options);
        try {
          const first = await opened.build({ key: 1 });
          const ledger = ledgerOf();
          await collect(ledger);
          const before = ledger.snapshot();
          const glbs: string[] = [];
          const alive: number[] = [];
          for (let step = 1; step <= 40; step += 1) {
            glbs.push(await opened.build({ key: step % 2 === 0 ? 1 : 2 }));
            await collect(ledger);
            alive.push(ledger.since(before).length);
          }

          expect(glbs.filter((_, index) => index % 2 === 1)).toStrictEqual(Array.from({ length: 20 }, () => first));
          expect(new Set(glbs).size).toBe(2);
          const settled = alive.slice(9);
          expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)))).toStrictEqual(
            Array.from({ length: settled.length }, () => settled[0]),
          );
          expect(ledger.stats().doubleDeletes).toBe(0);
        } finally {
          await opened.close();
        }
      }
    },
    renderTimeout,
  );
});
