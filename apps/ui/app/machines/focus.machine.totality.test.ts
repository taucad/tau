/**
 * Totality of the focus machine (MC-R17): every public event is sampled in every reachable state, and each pair left
 * unanswered must be on `focusIgnoredEvents`. The claim is bounded by the samples, the projection (one snapshot per
 * state value, request project and open status) and the traversal limit. Path table (the shortest path to each state
 * value, kept current with `pathTable`):
 *
 * 1. `idle`: initial
 * 2. `resolving`: `routeRequested`
 * 3. `held`: `routeRequested` with slugs that name no project
 * 4. `leaving`: `routeRequested`, a ready `accessAnswered`, `sessionFacts`, `moduleLoaded`, `openSettled`, then a
 *    `routeLeft`
 * 5. `opening.pending`: `routeRequested`, a ready `accessAnswered`
 * 6. `opening.live`: then `sessionFacts` live and `openSettled` live
 * 7. `focused`: then `moduleLoaded`
 * 8. `flushFailed`: from `leaving`, a failed `leaveFlushSettled`
 */
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { createFocusMachine, focusEventTypes, focusIgnoredEvents } from '#machines/focus.machine.js';
import type { FocusContext, FocusEvent, FocusPorts } from '#machines/focus.machine.js';
import { projectFixture, slugsOf } from '#machines/focus.machine.test.fixture.js';

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in FocusEvent['type']]: ReadonlyArray<Extract<FocusEvent, { type: T }>> };

const samples: Samples = {
  routeRequested: [
    { type: 'routeRequested', requestId: 'r1', slugs: slugsOf('a'), projectId: 'a' },
    { type: 'routeRequested', requestId: 'r2', slugs: slugsOf('nothing'), slugsMissing: true },
  ],
  routeLeft: [{ type: 'routeLeft', requestId: 'r3' }],
  accessAnswered: [
    { type: 'accessAnswered', requestId: 'r1', epoch: 0, answer: { status: 'ready', project: projectFixture('a') } },
  ],
  libraryChanged: [{ type: 'libraryChanged', revision: 1 }],
  leaveFlushSettled: [{ type: 'leaveFlushSettled', requestId: 'flush:2', ok: false }],
  moduleLoaded: [{ type: 'moduleLoaded' }],
  openSettled: [{ type: 'openSettled', requestId: 'open:1', result: 'live' }],
  sessionFacts: [{ type: 'sessionFacts', projectId: 'a', status: 'live', chatReady: true, availability: 'settled' }],
  focusedChatResolved: [{ type: 'focusedChatResolved', projectId: 'a', chatId: 'c' }],
  openRequested: [{ type: 'openRequested', projectId: 'a' }],
  retry: [{ type: 'retry' }],
  windowFocused: [{ type: 'windowFocused' }],
};

const port = () => createActor(createCallbackLogic(() => undefined));
const ports: FocusPorts = { library: port(), registry: port(), flush: port(), module: port(), route: port() };
const machine = createFocusMachine({ nativeKernelOf: () => undefined });
const events: readonly FocusEvent[] = Object.values(samples).flat();
const options = {
  input: { ports },
  events,
  limit: 400,
  serializeState: (snapshot: AnyMachineSnapshot) => {
    const context = snapshot.context as FocusContext;
    return JSON.stringify([
      snapshot.value,
      context.request?.projectId,
      context.open.openId !== undefined,
      context.open.live,
      context.facts['a']?.status,
      context.module,
      context.leave?.flush,
    ]);
  },
};

describe('focus machine totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...focusEventTypes].toSorted());
  });

  it('should reach every state', () => {
    expect(unreachedStates(machine, options)).toEqual([]);
    const values = new Set(pathTable(machine, options).map((row) => JSON.stringify(row.state)));

    expect(values).toEqual(
      new Set(
        [
          'idle',
          'resolving',
          'held',
          'leaving',
          { opening: 'pending' },
          { opening: 'live' },
          'focused',
          'flushFailed',
        ].map((value) => JSON.stringify(value)),
      ),
    );
  });

  it('should answer every sampled event in every reachable state except exactly the declared ignore list', () => {
    const unanswered: UnansweredEvent[] = unansweredEvents(machine, options);
    const declared = new Set(focusIgnoredEvents.map(([state, type]) => `${state} ${type}`));
    const dotted = (state: UnansweredEvent['state']): string =>
      typeof state === 'string'
        ? state
        : (Object.entries(state).map(
            ([key, child]) => `${key}.${typeof child === 'string' ? child : JSON.stringify(child)}`,
          )[0] ?? '');

    // Every unanswered pair is declared, and every declared pair is reached unanswered.
    expect(new Set(unanswered.map(({ state, eventType }) => `${dotted(state)} ${eventType}`))).toEqual(declared);
  });
});
