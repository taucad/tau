/**
 * Comment's pointer session. Path table (the shortest path to each state), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `pressed`: `pointerDown`
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  commentInputEventTypes,
  commentInputIgnoredEvents,
  commentInputMachine,
} from '#machines/comment-input.machine.js';
import type { CommentInputCommand, CommentInputEvent } from '#machines/comment-input.machine.js';

const down: Extract<CommentInputEvent, { type: 'pointerDown' }> = {
  type: 'pointerDown',
  button: 0,
  isPrimary: true,
  pointerId: 1,
  x: 100,
  y: 100,
  slop: 4,
  cameraMoving: false,
};
const up = (x = 100, y = 100, pointerId = 1): CommentInputEvent => ({ type: 'pointerUp', pointerId, x, y });

const samples: Record<CommentInputEvent['type'], readonly CommentInputEvent[]> = {
  pointerDown: [down],
  pointerUp: [up()],
  cameraMoved: [{ type: 'cameraMoved' }],
  pointerCancel: [{ type: 'pointerCancel', pointerId: 1 }],
  blur: [{ type: 'blur' }],
};

const quiet = commentInputMachine.provide({
  actors: { pointer: createCallbackLogic<CommentInputCommand, undefined>(() => undefined) },
});

const pathOptions = {
  events: Object.values(samples).flat(),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** A comment input whose adapter records every pick it is asked for. */
const startInput = () => {
  const picks: CommentInputCommand[] = [];
  const actor = createActor(
    commentInputMachine.provide({
      actors: {
        pointer: createCallbackLogic<CommentInputCommand, undefined>(({ receive }) => {
          receive((command) => {
            picks.push(command);
          });
        }),
      },
    }),
  ).start();
  return { actor, take: (): CommentInputCommand[] => picks.splice(0) };
};

describe('comment input totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...commentInputEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(quiet, pathOptions).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'idle', events: [] },
      { state: 'pressed', events: ['pointerDown'] },
    ]);
    expect(unreachedStates(quiet, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(quiet, { ...pathOptions, ignore: commentInputIgnoredEvents })).toEqual([]);
  });
});

describe('commentInputMachine', () => {
  it('should ask for one pick for a press released where it went down', () => {
    const input = startInput();
    input.actor.send(down);
    input.actor.send(up(102, 101));
    expect(input.take()).toEqual([{ type: 'pick', x: 102, y: 101 }]);
    input.actor.stop();
  });

  it('should treat a release beyond the slop as an orbit', () => {
    const input = startInput();
    input.actor.send(down);
    input.actor.send(up(110, 100));
    expect(input.take()).toEqual([]);
    input.actor.stop();
  });

  it('should discard a press the camera dragged under, or that began during a drag', () => {
    const input = startInput();
    input.actor.send(down);
    input.actor.send({ type: 'cameraMoved' });
    input.actor.send(up());
    input.actor.send({ ...down, cameraMoving: true });
    input.actor.send(up());
    expect(input.take()).toEqual([]);
    input.actor.stop();
  });

  it('should ignore a secondary button, a second pointer and a cancelled or blurred press', () => {
    const input = startInput();
    input.actor.send({ ...down, button: 2 });
    input.actor.send(up());
    input.actor.send(down);
    input.actor.send(up(100, 100, 2));
    input.actor.send({ type: 'pointerCancel', pointerId: 1 });
    input.actor.send(up());
    input.actor.send(down);
    input.actor.send({ type: 'blur' });
    input.actor.send(up());
    expect(input.take()).toEqual([]);
    input.actor.stop();
  });
});
