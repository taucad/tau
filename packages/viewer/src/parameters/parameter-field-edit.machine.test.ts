import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  parameterFieldEditIgnoredEvents,
  parameterFieldEditMachine,
  selectOwnValue,
} from '#parameters/parameter-field-edit.machine.js';
import type { ParameterFieldEditEvent } from '#parameters/parameter-field-edit.machine.js';

const start = (authority = 10) => {
  const actor = createActor(parameterFieldEditMachine, { input: { authority } }).start();
  const send = (...events: ParameterFieldEditEvent[]): void => {
    for (const event of events) {
      actor.send(event);
    }
  };
  /** The value the row stands on while rendering `authority`. */
  const standing = (rendered: number): number => selectOwnValue(actor.getSnapshot(), rendered) ?? rendered;
  return { actor, send, standing };
};

describe('parameterFieldEditMachine', () => {
  it('stands on its own last value while the rendered authority trails its settled steps', () => {
    const { actor, send, standing } = start();
    send(
      { type: 'submitted', from: 10, value: 11 },
      { type: 'settled', isKept: true },
      { type: 'submitted', from: 11, value: 12 },
      { type: 'observed', value: 11 },
      { type: 'settled', isKept: true },
    );
    expect(standing(11)).toBe(12);
    expect(standing(10)).toBe(12);
    send({ type: 'observed', value: 12 });
    expect(actor.getSnapshot().value).toBe('following');
    expect(standing(12)).toBe(12);
  });

  it('follows a value it never sent once its own edits settle', () => {
    const { actor, send, standing } = start();
    send({ type: 'submitted', from: 10, value: 11 }, { type: 'observed', value: 30 });
    // Unsettled: the authority decides whether that write conflicts with this one.
    expect(standing(30)).toBe(11);
    send({ type: 'settled', isKept: true });
    expect(actor.getSnapshot().value).toBe('following');
    expect(standing(30)).toBe(30);
  });

  it('follows the authority at once when an edit is refused', () => {
    const { actor, send, standing } = start();
    send(
      { type: 'submitted', from: 10, value: 11 },
      { type: 'submitted', from: 11, value: 12 },
      { type: 'settled', isKept: false },
    );
    expect(actor.getSnapshot().value).toBe('following');
    expect(standing(10)).toBe(10);
    // The chained edit behind the refused one settles later and changes nothing.
    send({ type: 'settled', isKept: false });
    expect(actor.getSnapshot().value).toBe('following');
  });

  it('follows a return to its starting value once the row itself returned there', () => {
    const { actor, send } = start();
    send(
      { type: 'submitted', from: 10, value: 11 },
      { type: 'submitted', from: 11, value: 10 },
      { type: 'settled', isKept: true },
      { type: 'settled', isKept: true },
    );
    expect(actor.getSnapshot().value).toBe('following');
  });

  it('answers every event in every reachable state', () => {
    const options = {
      input: { authority: 10 },
      events: [
        { type: 'observed', value: 10 },
        { type: 'observed', value: 11 },
        { type: 'observed', value: 30 },
        { type: 'submitted', from: 10, value: 11 },
        { type: 'settled', isKept: true },
        { type: 'settled', isKept: false },
      ],
      limit: 200,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };
    expect(
      unansweredEvents(parameterFieldEditMachine, { ...options, ignore: parameterFieldEditIgnoredEvents }),
    ).toEqual([]);
    expect(unreachedStates(parameterFieldEditMachine, options)).toEqual([]);
  });
});
