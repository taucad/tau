import { describe, expect, it } from 'vitest';
import { createLogic, setup, types } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';

import { foreignEventChanges, pathTable, unansweredEvents, unreachedStates } from '#paths.js';

const noPayload = types<Readonly<Record<never, never>>>();

const door = setup({
  schemas: {
    context: types<{ locked: boolean }>(),
    events: { open: noPayload, close: noPayload, lock: noPayload, knock: noPayload },
  },
}).createMachine({
  id: 'door',
  context: { locked: false },
  initial: 'closed',
  states: {
    closed: {
      on: {
        open: ({ context }) => (context.locked ? undefined : { target: 'opened' }),
        lock: ({ context }) => ({ context: { locked: !context.locked } }),
        // An answered no-op: a transition function returning `{}`.
        knock: () => ({}),
      },
    },
    opened: {
      on: { close: { target: 'closed' }, knock: () => ({}) },
    },
    // Never entered: no transition targets it.
    jammed: {},
    routing: {
      type: 'choice',
      choice: () => ({ target: 'closed' }),
    },
  },
});

const events = [{ type: 'open' }, { type: 'close' }, { type: 'lock' }, { type: 'knock' }] as const;
const options = {
  events,
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify([snapshot.value, snapshot.context]),
};

describe('pathTable', () => {
  it('should return full events without the @xstate.init step', () => {
    const rows = pathTable(door, options);

    expect(rows).toContainEqual({ state: 'closed', events: [] });
    expect(rows).toContainEqual({ state: 'opened', events: [{ type: 'open' }] });
    expect(rows.flatMap((row) => row.events).some((event) => event.type === '@xstate.init')).toBe(false);
  });
});

describe('unansweredEvents', () => {
  it('should list a guard-refused event as unanswered', () => {
    expect(unansweredEvents(door, options)).toContainEqual({ state: 'closed', eventType: 'open' });
  });

  it('should not list a handled no-op', () => {
    const found = unansweredEvents(door, {
      ...options,
      ignore: [
        ['closed', 'open'],
        ['closed', 'close'],
        ['opened', 'open'],
        ['opened', 'lock'],
      ],
    });

    expect(found).toEqual([]);
  });
});

describe('unreachedStates', () => {
  it('should list an unreached state but never a choice', () => {
    expect(unreachedStates(door, options)).toEqual(['door.jammed']);
  });
});

describe('foreignEventChanges', () => {
  it('should report a fold that folds @xstate.init', () => {
    const counting = createLogic({
      context: { count: 0 },
      run: ({ context }) => ({ context: { count: context.count + 1 } }),
    });

    expect(foreignEventChanges(counting)).toContainEqual({ eventType: '@xstate.init', change: 'context' });
  });

  it('should report nothing for a fold that ignores foreign events', () => {
    const rows = createLogic({
      context: { rows: 0 },
      run: ({ context, event }) =>
        event.type === 'rows'
          ? { context: { rows: context.rows + Number((event as { count?: number }).count) } }
          : undefined,
    });

    expect(foreignEventChanges(rows)).toEqual([]);
  });
});

describe('status-aware traversal', () => {
  it('should keep an active snapshot that an errored one shares a projection with', () => {
    const quiet = setup({ schemas: { events: { poke: noPayload } } }).createMachine({
      id: 'quiet',
      initial: 'idle',
      states: { idle: {} },
    });
    const sample = {
      events: [{ type: 'poke' }, { type: 'xstate.error.execution' }],
      limit: 10,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };

    expect(unansweredEvents(quiet, sample)).toEqual([{ state: 'idle', eventType: 'poke' }]);
  });
});
