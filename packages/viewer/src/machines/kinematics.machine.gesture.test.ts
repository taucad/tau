/**
 * The kinematics actor's part-drag gesture, driven through a scripted drag adapter on a `StepClock`. Path table (the
 * shortest path to each state), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `pressed`: `loadMechanism`, `setDragEnabled`, `pressPart`
 * 3. `dragging.coalescing`: … `pressPart`, `movePointer` (past the threshold, on the drag plane)
 * 4. `dragging.steady`: … `pressPart`, `movePointer` (past the threshold, off the drag plane)
 * 5. `cancelled`: … `movePointer`, `cancelGesture`
 */
import type { Mechanism, SolvePoseInput, SolvePoseOutcome } from '@taucad/kinematics';
import type * as KinematicsModule from '@taucad/kinematics';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  getKinematicsUnitState,
  kinematicsDragMoveWindow,
  kinematicsEventTypes,
  kinematicsIgnoredEvents,
  kinematicsMachine,
  selectKinematicsDragging,
} from '#machines/kinematics.machine.js';
import type {
  KinematicsDragAdapterCommand,
  KinematicsEmitted,
  KinematicsMachineContext,
  KinematicsMachineEvent,
} from '#machines/kinematics.machine.js';

// The solver is scripted: it turns the arm to the target's x, so each row reads which target was solved.
const solver = vi.hoisted(() => ({ solvePose: vi.fn<(input: SolvePoseInput) => SolvePoseOutcome>() }));

vi.mock('@taucad/kinematics', async (importOriginal) => {
  const actual = await importOriginal<typeof KinematicsModule>();
  return { ...actual, solvePose: solver.solvePose };
});

const unitId = 'file:main.ts';
const origin = [0, 0, 0] as const;
const axis = [0, 0, 1] as const;
const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
  joints: { arm: { type: 'revolute', parent: 'base', child: 'arm', origin, axis } },
};

/** A drag adapter that records its life and the commands it receives; the test plays the DOM. */
const scriptAdapter = () => {
  const record = { starts: 0, stops: 0, commands: [] as Array<KinematicsDragAdapterCommand['type']> };
  const logic = createCallbackLogic<KinematicsDragAdapterCommand, undefined>(({ receive }) => {
    record.starts += 1;
    receive((command) => {
      record.commands.push(command.type);
    });
    return () => {
      record.stops += 1;
    };
  });
  return { logic, record };
};

const idleAdapter = createCallbackLogic<KinematicsDragAdapterCommand, undefined>(() => undefined);

const press = (adapter = idleAdapter, componentId = 'component:arm'): KinematicsMachineEvent => ({
  type: 'pressPart',
  unitId,
  componentId,
  pointerId: 7,
  clientX: 100,
  clientY: 100,
  point: [10, 0, 0],
  adapter,
});

/** A pointer move at `clientX`; its target on the drag plane is `[clientX, 0, 0]`, or none for a ray that misses it. */
const move = (
  clientX: number,
  target: readonly [number, number, number] | 'miss' = [clientX, 0, 0],
  { buttons = 1, pointerId = 7 }: Readonly<{ buttons?: number; pointerId?: number }> = {},
): KinematicsMachineEvent => ({
  type: 'movePointer',
  pointerId,
  clientX,
  clientY: 100,
  buttons,
  target: target === 'miss' ? undefined : [...target],
});

/**
 * The targets the solver was asked for, in order, one entry per solve. XState evaluates a transition function during
 * selection and again to take it, so one solve may call the scripted solver twice with the same target.
 */
const solvedTargets = (): number[] =>
  solver.solvePose.mock.calls
    .map(([{ goals }]) => (goals[0]?.type === 'point' ? goals[0].target[0] : Number.NaN))
    .filter((target, index, targets) => index === 0 || targets[index - 1] !== target);

const samples: Record<KinematicsMachineEvent['type'], readonly KinematicsMachineEvent[]> = {
  loadMechanism: [{ type: 'loadMechanism', unitId, mechanism }],
  clearMechanism: [{ type: 'clearMechanism', unitId }],
  setCoordinate: [{ type: 'setCoordinate', unitId, id: 'arm', value: 5 }],
  reset: [{ type: 'reset', unitId }],
  play: [{ type: 'play', unitId }],
  selectAnimation: [{ type: 'selectAnimation', unitId, animationId: '@sweep' }],
  pause: [{ type: 'pause', unitId }],
  seek: [{ type: 'seek', unitId, time: 1 }],
  setPlaybackSpeed: [{ type: 'setPlaybackSpeed', unitId, speed: 2 }],
  tick: [{ type: 'tick', unitId, elapsed: 0.1 }],
  dragStart: [{ type: 'dragStart', unitId, componentId: 'component:arm', point: [10, 0, 0] }],
  dragMove: [{ type: 'dragMove', unitId, target: [20, 0, 0] }],
  dragEnd: [{ type: 'dragEnd', unitId }],
  dragCancel: [{ type: 'dragCancel', unitId }],
  setDragEnabled: [{ type: 'setDragEnabled', unitId, enabled: true }],
  setHoveredComponents: [{ type: 'setHoveredComponents', unitId, componentIds: [] }],
  pressPart: [press()],
  movePointer: [move(150), move(150, 'miss'), move(150, [150, 0, 0], { buttons: 0 })],
  releasePointer: [{ type: 'releasePointer', pointerId: 7 }],
  losePointer: [{ type: 'losePointer', pointerId: 7 }],
  interruptGesture: [{ type: 'interruptGesture' }],
  cancelGesture: [{ type: 'cancelGesture' }],
};

const serializeState = (snapshot: AnyMachineSnapshot): string => {
  const context = snapshot.context as KinematicsMachineContext;
  const unit = getKinematicsUnitState(context, unitId);
  return JSON.stringify([snapshot.value, unit.mechanism !== undefined, unit.dragEnabled, unit.drag !== undefined]);
};

const pathOptions = {
  input: {},
  events: Object.values(samples).flat(),
  limit: 2000,
  serializeState,
};

/** An armed unit on a guarded actor with its own clock, recording what it emits. */
const startArmed = () => {
  const guard = guardActors({ ignore: { kinematics: kinematicsIgnoredEvents } });
  const clock = new StepClock();
  const actor = createActor(kinematicsMachine, { input: {}, clock, inspect: guard.inspect }).start();
  const settled: KinematicsEmitted[] = [];
  actor.on('poseSettled', (event) => {
    settled.push(event);
  });
  actor.send({ type: 'loadMechanism', unitId, mechanism });
  actor.send({ type: 'setDragEnabled', unitId, enabled: true });
  const unit = () => getKinematicsUnitState(actor.getSnapshot().context, unitId);
  return { actor, clock, guard, settled, unit };
};

beforeEach(() => {
  solver.solvePose.mockReset();
  solver.solvePose.mockImplementation(({ goals }) => {
    const [goal] = goals;
    const arm = goal?.type === 'point' ? goal.target[0] : 0;
    return { status: 'solved', pose: { linkTransforms: {}, coordinates: { arm } }, iterations: 1, residual: 0 };
  });
});

describe('kinematics gesture totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...kinematicsEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    const rows = pathTable(kinematicsMachine, pathOptions);
    const shortestTo = (value: unknown): string[] | undefined =>
      rows
        .filter((row) => JSON.stringify(row.state) === JSON.stringify(value))
        .map((row) => row.events.map((event) => event.type))
        .toSorted((a, b) => a.length - b.length)[0];

    expect(shortestTo('idle')).toEqual([]);
    expect(shortestTo('pressed')).toEqual(['loadMechanism', 'setDragEnabled', 'pressPart']);
    expect(shortestTo({ dragging: 'coalescing' })).toEqual([
      'loadMechanism',
      'setDragEnabled',
      'pressPart',
      'movePointer',
    ]);
    expect(shortestTo({ dragging: 'steady' })).toEqual(['loadMechanism', 'setDragEnabled', 'pressPart', 'movePointer']);
    expect(shortestTo('cancelled')).toEqual([
      'loadMechanism',
      'setDragEnabled',
      'pressPart',
      'movePointer',
      'cancelGesture',
    ]);
    expect(unreachedStates(kinematicsMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(kinematicsMachine, { ...pathOptions, ignore: kinematicsIgnoredEvents })).toEqual([]);
  });
});

describe('kinematics gesture', () => {
  describe('press', () => {
    it('should claim a press on a movable part of an armed unit and start its adapter once', () => {
      const { actor } = startArmed();
      const { logic, record } = scriptAdapter();

      actor.send(press(logic));
      actor.send(press(scriptAdapter().logic));

      expect(actor.getSnapshot().value).toBe('pressed');
      expect(record).toEqual({ starts: 1, stops: 0, commands: [] });
    });

    it('should refuse a press on a grounded part, an unknown part or a disarmed unit', () => {
      const { actor } = startArmed();
      const { logic, record } = scriptAdapter();

      actor.send(press(logic, 'component:base'));
      actor.send(press(logic, 'component:unknown'));
      actor.send({ type: 'setDragEnabled', unitId, enabled: false });
      actor.send(press(logic));

      expect(actor.getSnapshot().value).toBe('idle');
      expect(record.starts).toBe(0);
    });

    it('should leave a press under the threshold to the click and stop the adapter on release', () => {
      const { actor, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));

      actor.send(move(102));
      actor.send({ type: 'releasePointer', pointerId: 7 });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(record).toEqual({ starts: 1, stops: 1, commands: [] });
      expect(unit().drag).toBeUndefined();
      expect(settled).toEqual([]);
      expect(actor.getSnapshot().context).toMatchObject({ gesture: undefined, dragAdapter: undefined });
    });

    it('should keep a press below 4 px a click and start the drag at exactly 4 px', () => {
      const { actor } = startArmed();
      actor.send(press());

      actor.send({ ...move(102), clientY: 102 } as KinematicsMachineEvent);
      expect(actor.getSnapshot().value).toBe('pressed');

      actor.send({ ...move(100), clientY: 104 } as KinematicsMachineEvent);
      expect(selectKinematicsDragging(actor.getSnapshot())).toBe(true);
    });

    it('should ignore another pointer', () => {
      const { actor, unit } = startArmed();
      actor.send(press());

      actor.send(move(150, [150, 0, 0], { pointerId: 8 }));
      actor.send({ type: 'releasePointer', pointerId: 8 });
      actor.send({ type: 'losePointer', pointerId: 8 });

      expect(actor.getSnapshot().value).toBe('pressed');
      expect(unit().drag).toBeUndefined();
    });
  });

  describe('drag', () => {
    it('should start the drag past the threshold and tell the adapter', () => {
      const { actor, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));

      actor.send(move(104));

      expect(selectKinematicsDragging(actor.getSnapshot())).toBe(true);
      expect(record.commands).toEqual(['dragStarted']);
      expect(unit().drag).toMatchObject({ componentId: 'component:arm', link: 'arm', target: [10, 0, 0] });
    });

    it('should coalesce pointer targets into one solve per window on the injected clock', () => {
      const { actor, clock, unit } = startArmed();
      actor.send(press());
      actor.send(move(104));
      actor.send(move(130));
      actor.send(move(150));

      expect(solver.solvePose).not.toHaveBeenCalled();

      clock.advance(kinematicsDragMoveWindow);

      expect(solvedTargets()).toEqual([150]);
      expect(unit().coordinates['arm']).toBe(150);
      expect(actor.getSnapshot().value).toEqual({ dragging: 'steady' });
    });

    it('should solve the target still waiting for its window before keeping the pose on release', () => {
      const { actor, clock, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));
      actor.send(move(150));
      clock.advance(kinematicsDragMoveWindow);

      actor.send(move(190));
      actor.send({ type: 'releasePointer', pointerId: 7 });
      clock.advance(kinematicsDragMoveWindow);

      expect(solvedTargets()).toEqual([150, 190]);
      expect(unit().coordinates['arm']).toBe(190);
      expect(unit().drag).toBeUndefined();
      expect(actor.getSnapshot().value).toBe('idle');
      expect(record.stops).toBe(1);
      expect(settled).toEqual([{ type: 'poseSettled', unitId, revision: unit().revision }]);
    });

    it('should keep the part where it is while the pointer ray misses the drag plane', () => {
      const { actor, clock, unit } = startArmed();
      actor.send(press());
      actor.send(move(150, 'miss'));
      clock.advance(kinematicsDragMoveWindow);

      expect(actor.getSnapshot().value).toEqual({ dragging: 'steady' });
      expect(solver.solvePose).not.toHaveBeenCalled();
      expect(unit().drag).toBeDefined();
    });

    it('should end the drag where the pointer was when a move arrives without the primary button', () => {
      const { actor, clock, settled, unit } = startArmed();
      actor.send(press());
      actor.send(move(150));

      // The release happened outside the page; the next move reports no button held.
      actor.send(move(170, [170, 0, 0], { buttons: 0 }));
      actor.send(move(190));
      clock.advance(kinematicsDragMoveWindow);

      expect(unit().coordinates['arm']).toBe(150);
      expect(actor.getSnapshot().value).toBe('idle');
      expect(settled).toHaveLength(1);
    });
  });

  describe('cancellation', () => {
    it('should cancel on Escape, ignore moves until release and only then end the press', () => {
      const { actor, clock, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 5 });
      actor.send(press(logic));
      actor.send(move(150));
      clock.advance(kinematicsDragMoveWindow);
      expect(unit().coordinates['arm']).toBe(150);

      actor.send({ type: 'cancelGesture' });
      actor.send(move(180));
      clock.advance(kinematicsDragMoveWindow);

      expect(actor.getSnapshot().value).toBe('cancelled');
      expect(selectKinematicsDragging(actor.getSnapshot())).toBe(false);
      expect(unit()).toMatchObject({ drag: undefined, coordinates: { arm: 5 } });
      expect(record.stops).toBe(0);
      expect(settled).toEqual([{ type: 'poseSettled', unitId, revision: unit().revision }]);

      actor.send({ type: 'releasePointer', pointerId: 7 });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(record.stops).toBe(1);
      expect(settled).toHaveLength(1);
    });

    it.each([
      ['losePointer', { type: 'losePointer', pointerId: 7 }],
      ['interruptGesture', { type: 'interruptGesture' }],
    ] as const)('should cancel the drag and end the press on %s', (_name, event) => {
      const { actor, clock, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));
      actor.send(move(150));
      clock.advance(kinematicsDragMoveWindow);
      actor.send(move(170));

      actor.send(event);
      clock.advance(kinematicsDragMoveWindow);

      expect(unit()).toMatchObject({ drag: undefined, coordinates: { arm: 0 } });
      expect(solvedTargets()).toEqual([150]);
      expect(actor.getSnapshot().value).toBe('idle');
      expect(record.stops).toBe(1);
      expect(settled).toHaveLength(1);
    });

    it('should end a pending press on interruption without starting a drag', () => {
      const { actor, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));

      actor.send({ type: 'interruptGesture' });
      actor.send(move(150));

      expect(actor.getSnapshot().value).toBe('idle');
      expect(unit().drag).toBeUndefined();
      expect(record).toEqual({ starts: 1, stops: 1, commands: [] });
      expect(settled).toEqual([]);
    });

    it('should end the press and give the camera back when the viewer clears the unit mid-drag', () => {
      const { actor, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));
      actor.send(move(150));

      actor.send({ type: 'clearMechanism', unitId });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(record.stops).toBe(1);
      expect(unit().mechanism).toBeUndefined();
      // A cleared unit has no pose to settle.
      expect(settled).toEqual([]);
    });

    it('should restore the pose and settle it once when the pane disarms mid-drag, holding the press until release', () => {
      const { actor, clock, settled, unit } = startArmed();
      const { logic, record } = scriptAdapter();
      actor.send(press(logic));
      actor.send(move(150));
      clock.advance(kinematicsDragMoveWindow);

      actor.send({ type: 'setDragEnabled', unitId, enabled: false });
      actor.send(move(170));
      clock.advance(kinematicsDragMoveWindow);
      actor.send({ type: 'releasePointer', pointerId: 7 });

      expect(unit()).toMatchObject({ drag: undefined, coordinates: { arm: 0 } });
      expect(settled).toHaveLength(1);
      expect(record.stops).toBe(1);
    });
  });

  describe('poseSettled', () => {
    it('should emit once per settled drag, from the gesture and from direct drag events alike', () => {
      const { actor, clock, settled, unit } = startArmed();

      actor.send(press());
      actor.send(move(150));
      clock.advance(kinematicsDragMoveWindow);
      actor.send({ type: 'releasePointer', pointerId: 7 });
      const kept = unit().revision;
      actor.send({ type: 'dragEnd', unitId });

      actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [10, 0, 0] });
      actor.send({ type: 'dragMove', unitId, target: [60, 0, 0] });
      actor.send({ type: 'dragCancel', unitId });
      actor.send({ type: 'dragCancel', unitId });

      expect(settled).toEqual([
        { type: 'poseSettled', unitId, revision: kept },
        { type: 'poseSettled', unitId, revision: unit().revision },
      ]);
      expect(unit().coordinates['arm']).toBe(150);
    });

    it('should not emit for a slider edit, playback or a press that never became a drag', () => {
      const { actor, settled } = startArmed();

      actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 20 });
      actor.send({ type: 'reset', unitId });
      actor.send(press());
      actor.send({ type: 'releasePointer', pointerId: 7 });

      expect(settled).toEqual([]);
    });
  });
});
