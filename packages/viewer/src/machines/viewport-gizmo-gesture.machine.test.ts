/*
 * The view cube's gesture, driven through a scripted DOM adapter on a `StepClock`. Path table:
 *
 * | Path                                               | State after   | Lock held |
 * | -------------------------------------------------- | ------------- | --------- |
 * | (start)                                            | idle          | no        |
 * | gizmoPressed                                       | pressed       | yes       |
 * | gizmoPressed, after(idleStart)                     | idle          | no        |
 * | gizmoPressed, gizmoTurned                          | turning       | yes       |
 * | gizmoPressed, gizmoTurned, gizmoReleased           | idle          | no        |
 * | gizmoPressed, gizmoReleased                        | idle          | no        |
 */
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  selectViewportGizmoInteractionLocked,
  viewportGizmoGestureEventTypes,
  viewportGizmoGestureIgnoredEvents,
  viewportGizmoGestureMachine,
  viewportGizmoIdleStartMilliseconds,
} from '#machines/viewport-gizmo-gesture.machine.js';
import type {
  ViewportGizmoAdapterEvent,
  ViewportGizmoAppearance,
  ViewportGizmoCommand,
  ViewportGizmoEnvironment,
  ViewportGizmoGestureEvent,
} from '#machines/viewport-gizmo-gesture.machine.js';

const dark: ViewportGizmoEnvironment = { colorScheme: 'dark', isHighContrast: false, accentColor: '#00987c' };

const samples: Record<ViewportGizmoGestureEvent['type'], readonly ViewportGizmoGestureEvent[]> = {
  gizmoPressed: [{ type: 'gizmoPressed' }],
  gizmoTurned: [{ type: 'gizmoTurned' }],
  gizmoReleased: [{ type: 'gizmoReleased' }],
  applyStyle: [{ type: 'applyStyle', environment: dark }],
  upDirectionChanged: [{ type: 'upDirectionChanged', upDirection: 'y' }],
};

const pathOptions = {
  input: {},
  events: Object.values(samples).flat(),
  limit: 200,
  serializeState: (snapshot: AnyMachineSnapshot): string => JSON.stringify(snapshot.value),
};

/** A scripted adapter: records its starts, stops and commands, and reports what the cube did through `report`. */
const scriptAdapter = () => {
  const record = {
    starts: [] as ViewportGizmoAppearance[],
    stops: 0,
    commands: [] as Array<ViewportGizmoCommand['type']>,
    appearances: [] as ViewportGizmoAppearance[],
  };
  let report: ((event: ViewportGizmoAdapterEvent) => void) | undefined;
  const logic = createCallbackLogic<ViewportGizmoCommand, ViewportGizmoAppearance, ViewportGizmoAdapterEvent>(
    ({ input, sendBack, receive }) => {
      record.starts.push(input);
      report = sendBack;
      receive((command) => {
        record.commands.push(command.type);
        if (command.type === 'appearanceChanged') {
          record.appearances.push({ environment: command.environment, upDirection: command.upDirection });
        }
      });
      return () => {
        record.stops += 1;
      };
    },
  );
  return { logic, record, report: (event: ViewportGizmoAdapterEvent) => report?.(event) };
};

const startGesture = (input: Parameters<typeof createActor<typeof viewportGizmoGestureMachine>>[1] = {}) => {
  const adapter = scriptAdapter();
  const guard = guardActors({ ignore: { viewportGizmoGesture: viewportGizmoGestureIgnoredEvents } });
  const clock = new StepClock();
  const actor = createActor(viewportGizmoGestureMachine.provide({ actors: { adapter: adapter.logic } }), {
    input: {},
    clock,
    inspect: guard.inspect,
    ...input,
  }).start();
  const locked = (): boolean => selectViewportGizmoInteractionLocked(actor);
  return { actor, adapter, clock, guard, locked };
};

describe('view cube gesture totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...viewportGizmoGestureEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    const rows = pathTable(viewportGizmoGestureMachine, pathOptions);
    const shortestTo = (value: string): string[] | undefined =>
      rows
        .filter((row) => row.state === value)
        .map((row) => row.events.map((event) => event.type))
        .toSorted((a, b) => a.length - b.length)[0];

    expect(shortestTo('idle')).toEqual([]);
    expect(shortestTo('pressed')).toEqual(['gizmoPressed']);
    expect(shortestTo('turning')).toEqual(['gizmoPressed', 'gizmoTurned']);
    expect(unreachedStates(viewportGizmoGestureMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(
      unansweredEvents(viewportGizmoGestureMachine, { ...pathOptions, ignore: viewportGizmoGestureIgnoredEvents }),
    ).toEqual([]);
  });
});

describe('view cube gesture', () => {
  it('should start its adapter once with the appearance it holds', () => {
    const { adapter, locked } = startGesture({ input: { environment: dark, upDirection: 'y' } });

    expect(adapter.record.starts).toEqual([{ environment: dark, upDirection: 'y' }]);
    expect(locked()).toBe(false);
  });

  it('should hold the interaction lock while a press turns the camera, until the release', () => {
    const { actor, adapter, clock, guard, locked } = startGesture();

    adapter.report({ type: 'gizmoPressed' });
    expect(locked()).toBe(true);
    adapter.report({ type: 'gizmoTurned' });
    adapter.report({ type: 'gizmoTurned' });
    // A turning press outlives the idle-start window.
    clock.advance(viewportGizmoIdleStartMilliseconds + 1000);
    expect(actor.getSnapshot().value).toBe('turning');
    expect(locked()).toBe(true);

    adapter.report({ type: 'gizmoReleased' });

    expect(locked()).toBe(false);
    expect(adapter.record.commands).toEqual(['lockTaken', 'lockedTurn', 'lockedTurn', 'lockReleased']);
    expect(guard.take()).toEqual([]);
  });

  it('should give back an idle press at the end of the idle-start window', () => {
    const { actor, adapter, clock, locked } = startGesture();

    adapter.report({ type: 'gizmoPressed' });
    expect(locked()).toBe(true);
    clock.advance(viewportGizmoIdleStartMilliseconds);

    expect(actor.getSnapshot().value).toBe('idle');
    expect(locked()).toBe(false);
    expect(adapter.record.commands).toEqual(['lockTaken', 'lockReleased']);
  });

  it('should keep a turn after the idle-start release free of the lock', () => {
    const { adapter, clock, locked } = startGesture();
    adapter.report({ type: 'gizmoPressed' });
    clock.advance(viewportGizmoIdleStartMilliseconds);

    // A face click's animation, or a drag that began after the window: the adapter reports its pose; nothing locks.
    adapter.report({ type: 'gizmoTurned' });
    adapter.report({ type: 'gizmoReleased' });

    expect(locked()).toBe(false);
    expect(adapter.record.commands).toEqual(['lockTaken', 'lockReleased']);
  });

  it('should take the lock once for a repeated press, and release it once', () => {
    const { adapter } = startGesture();

    adapter.report({ type: 'gizmoPressed' });
    adapter.report({ type: 'gizmoPressed' });
    adapter.report({ type: 'gizmoTurned' });
    adapter.report({ type: 'gizmoPressed' });
    adapter.report({ type: 'gizmoReleased' });
    adapter.report({ type: 'gizmoReleased' });

    expect(adapter.record.commands).toEqual(['lockTaken', 'lockedTurn', 'lockReleased']);
  });

  it('should stop its adapter with it, so a held lock is given back', () => {
    const { actor, adapter } = startGesture();
    adapter.report({ type: 'gizmoPressed' });
    adapter.report({ type: 'gizmoTurned' });

    actor.stop();

    expect(adapter.record.stops).toBe(1);
  });

  it('should repaint the cube in place for a new environment or up axis, and not for the same one', () => {
    const gesture = startGesture();

    gesture.actor.send({ type: 'applyStyle', environment: dark });
    gesture.actor.send({ type: 'applyStyle', environment: { ...dark } });
    gesture.actor.send({ type: 'upDirectionChanged', upDirection: 'y' });
    gesture.actor.send({ type: 'upDirectionChanged', upDirection: 'y' });

    expect(gesture.adapter.record.starts).toHaveLength(1);
    expect(gesture.adapter.record.appearances).toEqual([
      { environment: dark, upDirection: 'z' },
      { environment: dark, upDirection: 'y' },
    ]);
  });
});
