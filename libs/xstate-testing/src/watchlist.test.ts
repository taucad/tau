/**
 * The upstream watchlist tripwire (MC-R22; L1 F1–F2). `xstate` is an alpha pinned
 * exactly in the catalog. A bump fails here until this constant moves with it, and
 * moving it means re-running the suites the failure message names.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import { createActor, setup, types } from 'xstate';
import type { InspectionEvent } from 'xstate';

const noPayload = types<Readonly<Record<never, never>>>();

const pinnedXstate = '6.0.0-alpha.59';

const reRun =
  "An xstate bump is its own change. Re-run this library's tests and libs/oxlint's xstate-contract export " +
  'check (MC-A4), then update the pin. A changed result reopens the policy rules it touches (xstate-policy.md MC-R22).';

describe('upstream watchlist', () => {
  it('should run against the pinned xstate', () => {
    const installed = (createRequire(import.meta.url)('xstate/package.json') as { version: string }).version;

    expect(installed, reRun).toBe(pinnedXstate);
  });

  it("should drop a transition function's returned meta from the microstep (k3)", () => {
    const machine = setup({
      schemas: { events: { go: noPayload }, transitionMeta: types<{ tla: 'Go' }>() },
    }).createMachine({
      initial: 'a',
      states: { a: { on: { go: () => ({ target: 'b', meta: { tla: 'Go' } }) } }, b: {} },
    });
    const metas: unknown[] = [];
    const inspect = (event: InspectionEvent): void => {
      if (event.type === '@xstate.transition' && event.event.type === 'go') {
        for (const step of event.microsteps) {
          metas.push(step.meta as unknown);
        }
      }
    };
    createActor(machine, { inspect }).start().send({ type: 'go' });

    expect(
      metas,
      'Upstream now carries a returned meta onto the microstep: MC-R27 may allow bare function transitions.',
    ).toEqual([undefined]);
  });
});
