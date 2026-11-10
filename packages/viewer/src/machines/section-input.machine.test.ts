/**
 * The section input: its gesture states and the commands it sends its DOM adapter. Path table (the shortest path to
 * each state), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `hovering`: `hoverPicked` (a handle)
 * 3. `pressed`: `pointerPressed` (a drag handle)
 * 4. `dragging`: `pointerPressed` (a drag handle), `pointerMoved` (past the threshold)
 */
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import type { SectionCut } from '#graphics/section-cuts.js';
import type { SectionHandleTarget } from '#graphics/three/controls/section-handles.js';
import {
  sectionDragThreshold,
  sectionInputEventTypes,
  sectionInputIgnoredEvents,
  sectionInputMachine,
} from '#machines/section-input.machine.js';
import type { SectionInputCommand, SectionInputEvent } from '#machines/section-input.machine.js';

const cut: SectionCut = { id: 'cut_a', kind: 'plane', plane: 'xy', offset: 0, isFlipped: false };
const other: SectionCut = { id: 'cut_b', kind: 'plane', plane: 'yz', offset: 0, isFlipped: false };
const arrow: SectionHandleTarget = { kind: 'plane', cutId: cut.id };
const fan: SectionHandleTarget = { kind: 'select', cutId: other.id };

const pressArrow: SectionInputEvent = { type: 'pointerPressed', pointerId: 1, x: 100, y: 100, handle: arrow, cut };
const travel = sectionDragThreshold + 1;
const moved = (x: number, pointerId = 1): SectionInputEvent => ({
  type: 'pointerMoved',
  pointerId,
  x,
  y: 100,
  offsetX: x - 10,
  offsetY: 90,
});
const released = (x: number, pointerId = 1): SectionInputEvent => ({
  type: 'pointerReleased',
  pointerId,
  x,
  y: 100,
  offsetX: x - 10,
  offsetY: 90,
});
const cutsChanged = (
  cuts: readonly SectionCut[],
  selectedId: string | undefined = cut.id,
  handles: readonly SectionHandleTarget[] = [arrow],
): SectionInputEvent => ({ type: 'cutsChanged', cuts, selectedId, handles, isPickerLive: true });

const samples: Record<SectionInputEvent['type'], readonly SectionInputEvent[]> = {
  hoverPicked: [{ type: 'hoverPicked', handle: arrow }, { type: 'hoverPicked' }],
  pointerPressed: [pressArrow],
  pointerMoved: [moved(100 + travel)],
  pointerReleased: [released(100 + travel)],
  pointerCancelled: [{ type: 'pointerCancelled', pointerId: 1 }],
  cutsChanged: [cutsChanged([cut])],
  sectionViewEnded: [{ type: 'sectionViewEnded' }],
};

const idleAdapter = createCallbackLogic<SectionInputCommand, undefined>(() => undefined);
const testMachine = sectionInputMachine.provide({ actors: { adapter: idleAdapter } });
const pathOptions = {
  events: Object.values(samples).flat(),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** A section input whose adapter records every command it is sent. */
const startInput = () => {
  const commands: SectionInputCommand[] = [];
  const adapter = createCallbackLogic<SectionInputCommand, undefined>(({ receive }) => {
    receive((command) => {
      commands.push(command);
    });
  });
  const guard = guardActors();
  const actor = createActor(sectionInputMachine.provide({ actors: { adapter } }), { inspect: guard.inspect }).start();
  return {
    actor,
    commands,
    /** The command types sent since the last call. */
    take: (): string[] => commands.splice(0).map((command) => command.type),
  };
};

describe('section input totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...sectionInputEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(testMachine, pathOptions).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'idle', events: [] },
      { state: 'hovering', events: ['hoverPicked'] },
      { state: 'pressed', events: ['pointerPressed'] },
      { state: 'dragging', events: ['pointerPressed', 'pointerMoved'] },
    ]);
    expect(unreachedStates(testMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(testMachine, { ...pathOptions, ignore: sectionInputIgnoredEvents })).toEqual([]);
  });
});

describe('section input gesture', () => {
  it('should drag only once the press travels past the threshold, and land the release as the last step', () => {
    const input = startInput();
    input.actor.send(pressArrow);
    expect(input.actor.getSnapshot().value).toBe('pressed');
    expect(input.take()).toEqual(['gestureChanged']);

    input.actor.send(moved(100 + sectionDragThreshold));
    expect(input.actor.getSnapshot().value).toBe('pressed');
    expect(input.take()).toEqual([]);

    input.actor.send(moved(100 + travel));
    expect(input.actor.getSnapshot().value).toBe('dragging');
    expect(input.commands[0]).toEqual({ type: 'dragStep', x: 90 + travel, y: 90 });
    expect(input.take()).toEqual(['dragStep', 'gestureChanged']);

    // Back inside the threshold, the drag goes on.
    input.actor.send(moved(100));
    expect(input.take()).toEqual(['dragStep']);

    input.actor.send(released(120));
    expect(input.commands.slice(0, 2)).toEqual([
      { type: 'dragStep', x: 110, y: 90 },
      { type: 'pressEnded', ending: 'flush' },
    ]);
    expect(input.take()).toEqual(['dragStep', 'pressEnded', 'gestureChanged']);
    expect(input.actor.getSnapshot().value).toBe('idle');
  });

  it.each([
    { change: 'the cut going', event: cutsChanged([other], other.id) },
    { change: 'the cut losing the selection', event: cutsChanged([cut, other], other.id) },
    { change: 'the cut moving to another plane', event: cutsChanged([{ ...cut, plane: 'xz' }]) },
  ])('should cancel a drag, dropping its waiting step, on $change', ({ event }) => {
    const input = startInput();
    input.actor.send(pressArrow);
    input.actor.send(moved(100 + travel));
    input.take();

    input.actor.send(event);

    expect(input.commands[0]).toEqual({ type: 'pressEnded', ending: 'cancel' });
    expect(input.actor.getSnapshot().value).not.toBe('dragging');
    expect(input.actor.getSnapshot().context.press).toBeUndefined();
  });

  it('should keep a drag whose cut only moved', () => {
    const input = startInput();
    input.actor.send(pressArrow);
    input.actor.send(moved(100 + travel));
    input.take();

    input.actor.send(cutsChanged([{ ...cut, offset: 0.01 }]));

    expect(input.take()).toEqual([]);
    expect(input.actor.getSnapshot().value).toBe('dragging');
  });

  it('should answer a tile pressed and released in place with its click, and a tile dragged off with none', () => {
    const input = startInput();
    input.actor.send({ type: 'pointerPressed', pointerId: 1, x: 100, y: 100, tile: 'xz' });
    input.actor.send(released(100));
    expect(input.commands).toContainEqual({ type: 'pressEnded', ending: 'flush', clickedTile: 'xz' });
    input.take();

    input.actor.send({ type: 'pointerPressed', pointerId: 1, x: 100, y: 100, tile: 'xz' });
    input.actor.send(moved(100 + travel));
    expect(input.actor.getSnapshot().value).toBe('pressed');
    input.actor.send(released(100));
    expect(input.commands).toContainEqual({ type: 'pressEnded', ending: 'flush' });
    expect(input.commands.map((command) => command.type)).not.toContain('dragStep');
  });

  it('should never drag a select fan, even with its cut', () => {
    const input = startInput();
    input.actor.send({ type: 'pointerPressed', pointerId: 1, x: 100, y: 100, handle: fan, cut: other });
    input.actor.send(moved(100 + travel));

    expect(input.actor.getSnapshot().value).toBe('pressed');
    expect(input.commands.map((command) => command.type)).not.toContain('dragStep');
  });

  it("should leave the press to its own pointer's moves, releases and cancels", () => {
    const input = startInput();
    input.actor.send(pressArrow);
    input.take();

    input.actor.send(moved(100 + travel, 2));
    input.actor.send(released(100 + travel, 2));
    input.actor.send({ type: 'pointerCancelled', pointerId: 2 });

    expect(input.take()).toEqual([]);
    expect(input.actor.getSnapshot().value).toBe('pressed');
    input.actor.send({ type: 'pointerCancelled', pointerId: 1 });
    expect(input.commands[0]).toEqual({ type: 'pressEnded', ending: 'flush' });
  });

  it('should link the hovered cut only when it changes, and forget a handle no longer drawn', () => {
    const input = startInput();
    input.actor.send({ type: 'hoverPicked', handle: arrow });
    expect(input.commands[0]).toEqual({ type: 'hoverCutChanged', cutId: cut.id });
    input.take();

    input.actor.send({ type: 'hoverPicked', handle: { ...arrow } });
    expect(input.take()).toEqual([]);

    input.actor.send(cutsChanged([cut, other], other.id, [fan]));
    expect(input.actor.getSnapshot().value).toBe('idle');
    expect(input.commands[0]).toEqual({ type: 'hoverCutChanged', cutId: undefined });
    expect(input.take()).toEqual(['hoverCutChanged', 'gestureChanged']);

    // Nothing hovered, nothing to unlink.
    input.actor.send(cutsChanged([cut, other], cut.id, [arrow]));
    expect(input.take()).toEqual([]);
  });

  it('should give everything back when Section turns off', () => {
    const input = startInput();
    input.actor.send({ type: 'hoverPicked', handle: arrow });
    input.actor.send(pressArrow);
    input.actor.send(moved(100 + travel));
    input.take();

    input.actor.send({ type: 'sectionViewEnded' });

    expect(input.commands.slice(0, 2)).toEqual([
      { type: 'pressEnded', ending: 'cancel' },
      { type: 'hoverCutChanged', cutId: undefined },
    ]);
    expect(input.actor.getSnapshot().value).toBe('idle');
    expect(input.actor.getSnapshot().context).toEqual({ hovered: undefined, hoveredTile: undefined, press: undefined });
  });
});
