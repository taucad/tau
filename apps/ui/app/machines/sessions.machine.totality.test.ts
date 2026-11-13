/**
 * Totality baseline for the sessions registry machine (MC-R17). It locks today's answers before any state moves:
 * every public event is sampled in every reachable state, and each pair left unanswered must be on
 * `sessionsIgnoredEvents`. A later change that answers an event removes its pair; this file then fails until it does.
 * `sessions.machine.test.ts` keeps its own contract row over a narrower sample; both read the same table.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value and live set) and the
 * traversal limit. The registry spawns real `projectSession` children; pure traversal never starts them, so their
 * reports reach the registry only as the sampled `sessionState` and `sessionClosed` events. `quiesced` and `forced`
 * are final: the traversal still steps their snapshots (row 6), but `unansweredEvents` skips a done snapshot, so no
 * answer is checked there. Path table (the shortest path to each state value), kept current with `pathTable`:
 *
 * 1. `ready`, nothing live: initial
 * 2. `ready`, `a` live: `open`
 * 3. `quiesced`: `quit` with nothing live (`quitting` passes through its `always`)
 * 4. `quitting`, `a` live: `open`, `quit`
 * 5. `forced`, `a` live: `open`, `quit`, `quitAnyway`
 * 6. `forced`, nothing live: then `sessionClosed`, which the root still folds into a done snapshot's context
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { matchesState } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { sessionsEventTypes, sessionsIgnoredEvents, sessionsMachine } from '#machines/sessions.machine.js';
import type { SessionsMachineEvent } from '#machines/sessions.machine.js';

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in SessionsMachineEvent['type']]: ReadonlyArray<Extract<SessionsMachineEvent, { type: T }>> };

const samples: Samples = {
  open: [{ type: 'open', projectId: 'a' }],
  close: [{ type: 'close', projectId: 'a', reason: 'user' }],
  touch: [{ type: 'touch', projectId: 'a' }],
  idleExpired: [{ type: 'idleExpired', projectId: 'a' }],
  releaseMemory: [{ type: 'releaseMemory', keepProjectId: 'a' }],
  sessionState: [
    { type: 'sessionState', projectId: 'a', state: 'live', runs: 0, dirty: false, pushed: true },
    { type: 'sessionState', projectId: 'a', state: 'closing', runs: 0, dirty: false, pushed: true, pending: 1 },
  ],
  sessionClosed: [{ type: 'sessionClosed', projectId: 'a', reason: 'user' }],
  cancelPendingOpen: [{ type: 'cancelPendingOpen' }],
  quit: [{ type: 'quit' }],
  quitAnyway: [{ type: 'quitAnyway' }],
};

const events: readonly SessionsMachineEvent[] = Object.values(samples).flat();
const options = {
  input: { budget: 2 },
  events,
  limit: 200,
  /* The live set joins the projection: `open` keeps the value at `ready`, and only a live session holds `quitting`. */
  serializeState: (snapshot: AnyMachineSnapshot) =>
    JSON.stringify([snapshot.value, Object.keys((snapshot.context as { refs: Record<string, unknown> }).refs)]),
};

describe('sessions machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...sessionsEventTypes].toSorted());
    expect(new Set(sessionsEventTypes).size).toBe(sessionsEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(sessionsMachine, options).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'ready', events: [] },
      { state: 'ready', events: ['open'] },
      { state: 'quiesced', events: ['quit'] },
      { state: 'quitting', events: ['open', 'quit'] },
      { state: 'forced', events: ['open', 'quit', 'quitAnyway'] },
      { state: 'forced', events: ['open', 'quit', 'quitAnyway', 'sessionClosed'] },
    ]);
    expect(unreachedStates(sessionsMachine, options)).toEqual([]);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(sessionsMachine, { ...options, ignore: sessionsIgnoredEvents })).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(sessionsMachine, options);
    const stale = sessionsIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
