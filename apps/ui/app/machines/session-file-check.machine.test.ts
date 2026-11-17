/**
 * `sessionFileCheck` (plan § 4 A14): the patience of a session's file check, on the injected clock (I15). The session
 * folds its report into `availability`; `project-session.machine.file-check.test.ts` holds those rows.
 *
 * Path table (the shortest path to each state value), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `checking`: `checkStarted`
 * 3. `slow`: `checkStarted`, the patience timer
 */
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic, matchesState } from 'xstate';
import type { AnyMachineSnapshot, EventObject } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import {
  modelCheckPatienceMilliseconds,
  sessionFileCheckEventTypes,
  sessionFileCheckIgnoredEvents,
  sessionFileCheckMachine,
} from '#machines/session-file-check.machine.js';
import type { SessionFileCheckMachineEvent, SessionFileCheckReport } from '#machines/session-file-check.machine.js';

/** One check under a step clock, reporting to a parent that records what it hears. */
const harness = () => {
  const guard = guardActors();
  const clock = new StepClock();
  const reports: SessionFileCheckReport[] = [];
  const parent = createActor(
    createCallbackLogic<EventObject>(({ receive }) => {
      receive((event) => reports.push(event as SessionFileCheckReport));
    }),
  ).start();
  const actor = createActor(sessionFileCheckMachine, {
    clock,
    inspect: guard.inspect,
    input: { parentRef: parent },
  }).start();
  return { actor, clock, guard, reports, parent };
};

describe('session file check (A14)', () => {
  it('should report a check slow once it has run for the patience, and not a moment before', () => {
    const { actor, clock, guard, reports } = harness();
    actor.send({ type: 'checkStarted', check: 1 });
    clock.advance(modelCheckPatienceMilliseconds - 1);

    expect(reports).toEqual([]);
    expect(actor.getSnapshot().value).toBe('checking');

    clock.advance(1);

    expect(reports).toEqual([{ type: 'fileCheckSlow', check: 1 }]);
    expect(actor.getSnapshot().value).toBe('slow');
    expect(guard.take()).toEqual([]);
  });

  it('should report nothing for a check that settles inside the patience', () => {
    const { actor, clock, guard, reports } = harness();
    actor.send({ type: 'checkStarted', check: 1 });
    clock.advance(modelCheckPatienceMilliseconds - 1);
    actor.send({ type: 'checkSettled' });
    clock.advance(modelCheckPatienceMilliseconds * 2);

    expect(reports).toEqual([]);
    expect(actor.getSnapshot().value).toBe('idle');
    expect(guard.take()).toEqual([]);
  });

  it('should count a check that replaces a running one from zero, and report it under its own id', () => {
    const { actor, clock, guard, reports } = harness();
    actor.send({ type: 'checkStarted', check: 1 });
    clock.advance(modelCheckPatienceMilliseconds - 1);
    actor.send({ type: 'checkStarted', check: 2 });
    clock.advance(modelCheckPatienceMilliseconds - 1);

    expect(reports).toEqual([]);

    clock.advance(1);

    expect(reports).toEqual([{ type: 'fileCheckSlow', check: 2 }]);
    expect(guard.take()).toEqual([]);
  });

  it('should count again for a check that starts after a slow one', () => {
    const { actor, clock, guard, reports } = harness();
    actor.send({ type: 'checkStarted', check: 1 });
    clock.advance(modelCheckPatienceMilliseconds);
    actor.send({ type: 'checkStarted', check: 2 });

    expect(actor.getSnapshot().value).toBe('checking');

    clock.advance(modelCheckPatienceMilliseconds);

    expect(reports).toEqual([
      { type: 'fileCheckSlow', check: 1 },
      { type: 'fileCheckSlow', check: 2 },
    ]);
    expect(guard.take()).toEqual([]);
  });
});

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = {
  [T in SessionFileCheckMachineEvent['type']]: ReadonlyArray<Extract<SessionFileCheckMachineEvent, { type: T }>>;
};
const samples: Samples = {
  checkStarted: [{ type: 'checkStarted', check: 1 }],
  checkSettled: [{ type: 'checkSettled' }],
};
const patience = 'xstate.after.patience.session-file-check.checking';
const options = {
  input: {},
  events: (snapshot: AnyMachineSnapshot) => [
    ...Object.values(samples).flat(),
    /* The timer, offered only where it is armed. */
    ...(snapshot.matches('checking') ? [{ type: patience }] : []),
  ],
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('session file check totality (MC-R17)', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...sessionFileCheckEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(sessionFileCheckMachine, options).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'idle', events: [] },
      { state: 'checking', events: ['checkStarted'] },
      { state: 'slow', events: ['checkStarted', patience] },
    ]);
    expect(unreachedStates(sessionFileCheckMachine, options)).toEqual([]);
  });

  it('should answer every sampled event or declare it ignored', () => {
    expect(unansweredEvents(sessionFileCheckMachine, { ...options, ignore: sessionFileCheckIgnoredEvents })).toEqual(
      [],
    );
  });

  it('should declare no pair that the machine answers', () => {
    const gaps = unansweredEvents(sessionFileCheckMachine, options);
    expect(
      sessionFileCheckIgnoredEvents.filter(
        ([state, eventType]) => !gaps.some((gap) => gap.eventType === eventType && matchesState(state, gap.state)),
      ),
    ).toEqual([]);
  });
});
