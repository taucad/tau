/*
 * W2 (D2, I3): the wait on a pending model attempt is bounded by the instant the gateway states it settles the attempt
 * by (`settlesBy`), not by the host's short waits alone. An answer without `settlesBy` keeps today's waits exactly.
 */

import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { settledInvocation } from '#harness/session.js';
import type { InvocationFunding } from '#waist/ports.js';
import type { InvocationResolution } from '#wire/gateway.js';

/* The API's default invocation deadline and recovery grace (apps/api), which this package cannot import. */
const invocationDeadline = 300_000;
const recoveryGrace = 5 * 60_000;
/** The gateway's `settlesBy` for an attempt dispatched at `dispatchedAt`: its hold's due time plus the grace. */
const settlesByFor = (dispatchedAt: number): string =>
  new Date(dispatchedAt + invocationDeadline + recoveryGrace).toISOString();
/** A dispatch time whose `settlesBy` is `ahead` milliseconds from now (negative: already past). */
const dispatchedFor = (ahead: number): number => Date.now() - invocationDeadline - recoveryGrace + ahead;

/** The short waits, summed: the lookups of a pending attempt without `settlesBy` happen at these offsets. */
const shortWaitOffsets = [0, 250, 750, 1750, 3750, 7750, 15_750];

type Answer = (elapsed: number) => InvocationResolution;

const fundedBy = (answer: Answer, start: number) => {
  const lookups: number[] = [];
  const funding: Extract<InvocationFunding, { type: 'funded' }> = {
    type: 'funded',
    usesBillingAttempt: () => true,
    principal: async () => 'account-a',
    resolveInvocation: async () => {
      const elapsed = Date.now() - start;
      lookups.push(elapsed);
      return answer(elapsed);
    },
  };
  return { funding, lookups };
};

const terminal: InvocationResolution = {
  status: 'terminal',
  operationId: 'operation-1',
  outcome: 'settled',
  chargedCreditAtoms: '10',
};

describe('settledInvocation and the gateway-stated settlement bound (W2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs one lookup sequence to its answer on the faked process timers. */
  const settle = async (answer: Answer, signal = new AbortController().signal) => {
    const start = Date.now();
    const { funding, lookups } = fundedBy(answer, start);
    const settled = settledInvocation({ funding, attemptId: 'run-1:1:0', clock: globalThis, signal });
    // Past any bound the fixtures state; the sequence ends long before.
    await vi.advanceTimersByTimeAsync(invocationDeadline + recoveryGrace);
    return { resolution: await settled, lookups };
  };

  it('should keep the short waits exactly for an answer without settlesBy (older gateway)', async () => {
    const { resolution, lookups } = await settle(() => ({ status: 'pending' }));

    expect(resolution).toEqual({ status: 'pending' });
    expect(lookups).toEqual(shortWaitOffsets);
  });

  it('should poll every 8 s after the short waits until a settlesBy 60 s ahead, then answer the last lookup', async () => {
    const settlesBy = settlesByFor(dispatchedFor(60_000));

    const { resolution, lookups } = await settle(() => ({ status: 'pending', settlesBy }));

    expect(resolution).toEqual({ status: 'pending', settlesBy });
    // The short waits, then the capped backoff, and one last lookup at the stated instant itself.
    expect(lookups).toEqual([...shortWaitOffsets, 23_750, 31_750, 39_750, 47_750, 55_750, 60_000]);
  });

  it('should answer terminal once the gateway settles the attempt before its settlesBy', async () => {
    const settlesBy = settlesByFor(dispatchedFor(60_000));

    const { resolution, lookups } = await settle((elapsed) =>
      elapsed >= 40_000 ? terminal : { status: 'pending', settlesBy },
    );

    expect(resolution).toEqual(terminal);
    expect(lookups.at(-1)).toBe(47_750);
  });

  it('should end after the short waits, as today, when settlesBy is already past', async () => {
    const settlesBy = settlesByFor(dispatchedFor(-1000));

    const { resolution, lookups } = await settle(() => ({ status: 'pending', settlesBy }));

    expect(resolution).toEqual({ status: 'pending', settlesBy });
    expect(lookups).toEqual(shortWaitOffsets);
  });

  it('should keep the stated settlesBy through an unavailable answer', async () => {
    const settlesBy = settlesByFor(dispatchedFor(30_000));

    const { resolution, lookups } = await settle((elapsed) =>
      elapsed === 0 ? { status: 'pending', settlesBy } : { status: 'unavailable' },
    );

    expect(resolution).toEqual({ status: 'unavailable' });
    expect(lookups).toEqual([...shortWaitOffsets, 23_750, 30_000]);
  });

  it('should stop waiting when the run is stopped', async () => {
    const settlesBy = settlesByFor(dispatchedFor(60_000));
    const stop = new AbortController();
    const start = Date.now();
    const { funding, lookups } = fundedBy(() => ({ status: 'pending', settlesBy }), start);
    const settled = settledInvocation({ funding, attemptId: 'run-1:1:0', clock: globalThis, signal: stop.signal });
    const outcome = (async () => {
      try {
        await settled;
        return 'answered';
      } catch {
        return 'stopped';
      }
    })();

    await vi.advanceTimersByTimeAsync(30_000);
    stop.abort(new DOMException('The run was stopped.', 'AbortError'));

    await expect(outcome).resolves.toBe('stopped');
    expect(lookups.at(-1)).toBe(23_750);
  });

  it('should count the time left on a stepped clock, so the bound moves with its timers', async () => {
    vi.useRealTimers();
    const clock = new StepClock();
    const settlesBy = settlesByFor(dispatchedFor(60_000));
    const lookups: number[] = [];
    const funding: Extract<InvocationFunding, { type: 'funded' }> = {
      type: 'funded',
      usesBillingAttempt: () => true,
      principal: async () => 'account-a',
      resolveInvocation: async () => {
        lookups.push(clock.now());
        return { status: 'pending', settlesBy };
      },
    };

    const settled = settledInvocation({ funding, attemptId: 'run-1:1:0', clock, signal: new AbortController().signal });
    // The first lookup arms the first wait.
    await flush();
    await clock.advanceAsync(invocationDeadline);

    await expect(settled).resolves.toMatchObject({ status: 'pending' });
    expect(lookups).toHaveLength(13);
    // Wall time barely moved while the clock stepped: the last lookup is within a moment of the stated 60 s.
    expect(lookups.at(-1)).toBeGreaterThanOrEqual(59_000);
    expect(lookups.at(-1)).toBeLessThanOrEqual(60_000);
  });
});
