/**
 * `githubCredentialRenewal` (plan § 4 A10): when a project's GitHub credential is minted again, an `after` on the
 * injected clock (I15) where the revision client held a module `setTimeout`. The lease's own rows, which drive a mint
 * through it, are in `hooks/use-revision-status.github-credential.test.tsx`.
 *
 * Path table (the shortest path to each state value), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `waiting`: `schedule`
 */
import { describe, expect, it } from 'vitest';
import { createActor, matchesState } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import {
  githubCredentialRenewalEventTypes,
  githubCredentialRenewalIgnoredEvents,
  githubCredentialRenewalMachine,
  longestRenewalDelayMilliseconds,
} from '#machines/github-credential-renewal.machine.js';
import type { GithubCredentialRenewalMachineEvent } from '#machines/github-credential-renewal.machine.js';

/** One renewal under a step clock, counting what it emits. */
const harness = () => {
  const guard = guardActors();
  const clock = new StepClock();
  const actor = createActor(githubCredentialRenewalMachine, { clock, inspect: guard.inspect });
  let due = 0;
  actor.on('due', () => {
    due += 1;
  });
  actor.start();
  return { actor, clock, guard, due: () => due };
};

describe('GitHub credential renewal (A10)', () => {
  it('should emit due once the scheduled wait has run, and not a moment before', () => {
    const { actor, clock, guard, due } = harness();
    actor.send({ type: 'schedule', delayMilliseconds: 60_000 });
    clock.advance(59_999);

    expect(due()).toBe(0);
    expect(actor.getSnapshot().value).toBe('waiting');

    clock.advance(1);

    expect(due()).toBe(1);
    expect(actor.getSnapshot().value).toBe('idle');
    clock.advance(60_000);

    expect(due()).toBe(1);
    expect(guard.take()).toEqual([]);
  });

  it('should count a schedule that replaces an armed one from zero', () => {
    const { actor, clock, guard, due } = harness();
    actor.send({ type: 'schedule', delayMilliseconds: 60_000 });
    clock.advance(59_999);
    actor.send({ type: 'schedule', delayMilliseconds: 60_000 });
    clock.advance(59_999);

    expect(due()).toBe(0);

    clock.advance(1);

    expect(due()).toBe(1);
    expect(guard.take()).toEqual([]);
  });

  it('should emit nothing for a wait that is cancelled before it runs out', () => {
    const { actor, clock, guard, due } = harness();
    actor.send({ type: 'schedule', delayMilliseconds: 60_000 });
    clock.advance(30_000);
    actor.send({ type: 'cancel' });
    clock.advance(120_000);

    expect(due()).toBe(0);
    expect(actor.getSnapshot().value).toBe('idle');
    expect(guard.take()).toEqual([]);
  });

  it('should run a negative or non-finite wait out at once and clamp a far one, as setTimeout did', () => {
    const { actor, clock, due } = harness();
    actor.send({ type: 'schedule', delayMilliseconds: -5 });
    clock.advance(0);

    expect(due()).toBe(1);

    actor.send({ type: 'schedule', delayMilliseconds: Number.NaN });
    clock.advance(0);

    expect(due()).toBe(2);

    actor.send({ type: 'schedule', delayMilliseconds: Number.MAX_SAFE_INTEGER });

    expect(actor.getSnapshot().context.delayMilliseconds).toBe(longestRenewalDelayMilliseconds);
  });
});

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = {
  [T in GithubCredentialRenewalMachineEvent['type']]: ReadonlyArray<
    Extract<GithubCredentialRenewalMachineEvent, { type: T }>
  >;
};
const samples: Samples = {
  schedule: [{ type: 'schedule', delayMilliseconds: 60_000 }],
  cancel: [{ type: 'cancel' }],
};
const renewal = 'xstate.after.renewal.github-credential-renewal.waiting';
const options = {
  events: (snapshot: AnyMachineSnapshot) => [
    ...Object.values(samples).flat(),
    /* The timer, offered only where it is armed. */
    ...(snapshot.matches('waiting') ? [{ type: renewal }] : []),
  ],
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('GitHub credential renewal totality (MC-R17)', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...githubCredentialRenewalEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(githubCredentialRenewalMachine, options).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'idle', events: [] },
      { state: 'waiting', events: ['schedule'] },
    ]);
    expect(unreachedStates(githubCredentialRenewalMachine, options)).toEqual([]);
  });

  it('should answer every sampled event or declare it ignored', () => {
    expect(
      unansweredEvents(githubCredentialRenewalMachine, { ...options, ignore: githubCredentialRenewalIgnoredEvents }),
    ).toEqual([]);
  });

  it('should declare no pair that the machine answers', () => {
    const gaps = unansweredEvents(githubCredentialRenewalMachine, options);
    expect(
      githubCredentialRenewalIgnoredEvents.filter(
        ([state, eventType]) => !gaps.some((gap) => gap.eventType === eventType && matchesState(state, gap.state)),
      ),
    ).toEqual([]);
  });
});
