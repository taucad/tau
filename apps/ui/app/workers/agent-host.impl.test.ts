import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createMachine } from 'xstate';
import type { ParameterSetActor } from '@taucad/parameters/set-machine';
import { closeParameterActors } from '#workers/agent-host.impl.js';

/* W6.r2 M1 (D15): a parameter actor's close is bounded; one past the bound or left uncertain is stopped, and a
 * retried close passes a stopped actor instead of waiting the bound again. */
describe('closeParameterActors', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /* An actor whose write never settles, and one whose write settles uncertain once closed. */
  const stuck = createMachine({ initial: 'open', states: { open: { initial: 'writing', states: { writing: {} } } } });
  // The write is uncertain before the close arrives, so the close finds it there.
  const uncertain = createMachine({
    initial: 'open',
    states: { open: { initial: 'uncertain', states: { uncertain: {} } } },
  });
  const parameterActor = (onClose?: 'uncertain'): ParameterSetActor =>
    (onClose === 'uncertain' ? createActor(uncertain) : createActor(stuck)).start() as unknown as ParameterSetActor;

  it('should stop an actor whose write outlives the bound, and pass it when the close is retried', async () => {
    vi.useFakeTimers();
    const actor = parameterActor();
    let failures: unknown[] | undefined;
    const closing = (async () => {
      failures = await closeParameterActors(new Map([['main.ts', actor]]));
    })();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(failures).toHaveLength(1);
    expect(actor.getSnapshot().status).toBe('stopped');
    await closing;
    await expect(closeParameterActors(new Map([['main.ts', actor]]))).resolves.toEqual([]);
  });

  it('should stop an actor whose write stays uncertain, and report it', async () => {
    const actor = parameterActor('uncertain');

    const failures = await closeParameterActors(new Map([['main.ts', actor]]));

    expect(failures).toEqual([new Error('Parameter write for main.ts remains uncertain.')]);
    expect(actor.getSnapshot().status).toBe('stopped');
  });
});
