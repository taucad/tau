/**
 * Measure's session: the commands it sends its pointer adapter for each report. Path table (the shortest path to
 * each state), kept current with `pathTable`:
 *
 * 1. `off`: initial
 * 2. `on`: `measureActiveChanged` (on)
 */
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  measureSessionEventTypes,
  measureSessionIgnoredEvents,
  measureSessionMachine,
} from '#machines/measure-session.machine.js';
import type {
  MeasureCatalogRequest,
  MeasureExactCommand,
  MeasureExactRequest,
  MeasureSessionCommand,
  MeasureSessionEvent,
} from '#machines/measure-session.machine.js';

const at = { clientX: 10, clientY: 20 };
const elsewhere = { clientX: 30, clientY: 20 };
const pressed: MeasureSessionEvent = {
  type: 'pointerPressed',
  at,
  pointerCount: 1,
  button: 0,
  hasTarget: true,
  cameraMoving: false,
  pointerId: 1,
  isPrimary: true,
};
const released = (awaitingTargets = false): MeasureSessionEvent => ({
  type: 'pointerReleased',
  at,
  button: 0,
  hasTarget: true,
  hasCurrentStart: false,
  isZeroLength: false,
  hasActiveSnapTarget: !awaitingTargets,
  awaitingTargets,
  pointerId: 1,
});

const exactManifest: Partial<MeasureExactRequest['manifest']> = {};
const exactRequest: MeasureExactRequest = {
  id: 'measurement_1',
  manifest: exactManifest as MeasureExactRequest['manifest'],
  geometryKey: 'g',
  occurrenceA: 'a',
  occurrenceB: 'b',
  poseRevision: 0,
};

const samples: Record<MeasureSessionEvent['type'], readonly MeasureSessionEvent[]> = {
  measureActiveChanged: [
    { type: 'measureActiveChanged', active: true },
    { type: 'measureActiveChanged', active: false },
  ],
  pointerMoved: [{ type: 'pointerMoved', at }],
  pointerLeft: [{ type: 'pointerLeft' }],
  pointerPressed: [pressed],
  pointerReleased: [released()],
  pointerCancelled: [{ type: 'pointerCancelled', pointerId: 1 }],
  windowBlurred: [{ type: 'windowBlurred' }],
  cameraPresented: [{ type: 'cameraPresented' }],
  cameraDragChanged: [{ type: 'cameraDragChanged', dragging: true }],
  poseChanged: [{ type: 'poseChanged', revision: 1 }],
  cutsChanged: [{ type: 'cutsChanged' }],
  startChanged: [{ type: 'startChanged' }],
  sourceChanged: [{ type: 'sourceChanged' }],
  hoverSettingsChanged: [{ type: 'hoverSettingsChanged' }],
  pressReady: [{ type: 'pressReady', generation: 1 }],
  pressSettled: [{ type: 'pressSettled', at }],
  inputDecided: [{ type: 'inputDecided', decision: 'ignored' }],
  geometryChanged: [{ type: 'geometryChanged' }],
  catalogSourceChanged: [{ type: 'catalogSourceChanged' }],
  commitRequested: [{ type: 'commitRequested' }],
  catalogRequested: [{ type: 'catalogRequested', append: false }],
  committed: [{ type: 'committed' }, { type: 'committed', exact: exactRequest }],
};

const idleAdapter = createCallbackLogic<MeasureSessionCommand, undefined>(() => undefined);
const idleExact = createCallbackLogic<MeasureExactCommand, MeasureExactRequest>(() => undefined);
const idleCatalog = createCallbackLogic<{ type: 'stop' }, MeasureCatalogRequest>(() => undefined);
const testMachine = measureSessionMachine.provide({
  actors: { follower: idleAdapter, pointer: idleAdapter, exact: idleExact, catalog: idleCatalog },
});
const pathOptions = {
  events: Object.values(samples).flat(),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** A measure session, on, whose pointer adapter records every command it is sent. */
const startSession = () => {
  const commands: MeasureSessionCommand[] = [];
  let pointerStarts = 0;
  let pointerStops = 0;
  const pointer = createCallbackLogic<MeasureSessionCommand, undefined>(({ receive }) => {
    pointerStarts++;
    receive((message) => {
      commands.push(message);
    });
    return () => {
      pointerStops++;
    };
  });
  /** What happened to each exact query and catalog scan, in order. */
  const work: string[] = [];
  const exact = createCallbackLogic<MeasureExactCommand, MeasureExactRequest>(({ input, receive }) => {
    work.push(`exact ${input.id} started`);
    receive((message) => {
      work.push(`exact ${input.id} ${message.type === 'cancel' ? `cancelled: ${message.reason}` : 'dropped'}`);
    });
    return () => {
      work.push(`exact ${input.id} stopped`);
    };
  });
  const catalog = createCallbackLogic<{ type: 'stop' }, MeasureCatalogRequest>(({ input }) => {
    work.push(`catalog ${input.append ? 'append' : 'fresh'} started`);
    return () => {
      work.push('catalog stopped');
    };
  });
  const guard = guardActors();
  const actor = createActor(
    measureSessionMachine.provide({ actors: { follower: idleAdapter, pointer, exact, catalog } }),
    { inspect: guard.inspect },
  ).start();
  actor.send({ type: 'measureActiveChanged', active: true });
  return {
    actor,
    commands,
    /** The exact queries' and scans' lifecycle since the last call. */
    work: (): string[] => work.splice(0),
    starts: () => pointerStarts,
    stops: () => pointerStops,
    /** The commands sent since the last call. */
    take: (): MeasureSessionCommand[] => commands.splice(0),
  };
};

describe('measure session totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...measureSessionEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(testMachine, pathOptions).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'off', events: [] },
      { state: 'on', events: ['measureActiveChanged'] },
    ]);
    expect(unreachedStates(testMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(testMachine, { ...pathOptions, ignore: measureSessionIgnoredEvents })).toEqual([]);
  });
});

describe('measure session', () => {
  it('should answer a release with the decision its measure input emitted', () => {
    const session = startSession();
    session.actor.send(pressed);
    session.actor.send(released());
    expect(session.take()).toEqual([{ type: 'releaseDecided', decision: 'accepted' }]);

    // A camera drag steals the held press.
    session.actor.send(pressed);
    session.actor.send({ type: 'cameraDragChanged', dragging: true });
    session.actor.send(released());
    expect(session.take()).toEqual([{ type: 'releaseDecided', decision: 'ignored' }]);
    session.actor.stop();
  });

  it('should land a waiting press only under the generation it waited in', () => {
    const session = startSession();
    session.actor.send(pressed);
    session.actor.send(released(true));
    const [deferral] = session.take();
    expect(deferral).toEqual({ type: 'pressDeferred', generation: 1 });

    session.actor.send({ type: 'pressReady', generation: 1 });
    expect(session.take()).toEqual([{ type: 'pressLanded', generation: 1 }]);

    // The pointer moved on while it waited. Landing placed a start, which the follower reports before the landing
    // settles: hover from where the pointer is now all the same.
    session.actor.send({ type: 'pointerMoved', at: elsewhere });
    session.take();
    session.actor.send({ type: 'startChanged' });
    session.actor.send({ type: 'pressSettled', at });
    expect(session.take()).toEqual([{ type: 'hover', at: elsewhere, when: 'frame' }]);

    // It left while the press waited: clear the hover the landing drew.
    session.actor.send({ type: 'pointerLeft' });
    session.take();
    session.actor.send({ type: 'pressSettled', at });
    expect(session.take()).toEqual([{ type: 'hoverCleared' }]);
    session.actor.stop();
  });

  it.each([
    ['a newer press', pressed],
    ['a camera drag', { type: 'cameraDragChanged', dragging: true }],
    ['a pose change', { type: 'poseChanged', revision: 3 }],
    ['a cut change', { type: 'cutsChanged' }],
    ['a start placed or cancelled', { type: 'startChanged' }],
    ['a model change', { type: 'sourceChanged' }],
  ] as ReadonlyArray<readonly [string, MeasureSessionEvent]>)(
    'should drop a waiting press after %s',
    (_name, event) => {
      const session = startSession();
      session.actor.send(pressed);
      session.actor.send(released(true));
      session.actor.send(event);
      session.take();
      session.actor.send({ type: 'pressReady', generation: 1 });
      expect(session.take()).toEqual([]);
      session.actor.stop();
    },
  );

  it('should drop a waiting press and stop listening when Measure turns off, and listen afresh when it turns on', () => {
    const session = startSession();
    session.actor.send(pressed);
    session.actor.send(released(true));
    session.take();
    session.actor.send({ type: 'measureActiveChanged', active: false });
    expect(session.stops()).toBe(1);
    expect(session.actor.getSnapshot().context.hover).toBeUndefined();

    session.actor.send({ type: 'measureActiveChanged', active: true });
    session.actor.send({ type: 'pressReady', generation: 1 });
    expect(session.starts()).toBe(2);
    expect(session.take()).toEqual([]);
    session.actor.stop();
  });

  it('should hover again at once in the frame that presented a new camera, and on the next frame after a pose change', () => {
    const session = startSession();
    session.actor.send({ type: 'pointerMoved', at });
    expect(session.take()).toEqual([{ type: 'hover', at, when: 'frame' }]);

    session.actor.send({ type: 'cameraPresented' });
    expect(session.take()).toEqual([{ type: 'candidatesInvalidated' }, { type: 'hover', at, when: 'now' }]);

    session.actor.send({ type: 'poseChanged', revision: 4 });
    expect(session.take()).toEqual([{ type: 'hover', at, when: 'frame' }]);

    session.actor.send({ type: 'pointerLeft' });
    session.actor.send({ type: 'cameraPresented' });
    expect(session.take()).toEqual([{ type: 'hoverCleared' }, { type: 'candidatesInvalidated' }]);
    session.actor.stop();
  });

  it('should ask the pointer adapter to commit the chosen candidate on Use target', () => {
    const session = startSession();
    session.actor.send({ type: 'commitRequested' });
    expect(session.take()).toEqual([{ type: 'commitChosen' }]);
    session.actor.stop();
  });

  it('should run one exact query at a time, cancelling the one a new commit replaces', () => {
    const session = startSession();
    session.actor.send({ type: 'committed', exact: exactRequest });
    session.actor.send({ type: 'committed', exact: { ...exactRequest, id: 'measurement_2' } });
    // A commit that asks for none still replaces the running one.
    session.actor.send({ type: 'committed' });
    expect(session.work()).toEqual([
      'exact measurement_1 started',
      'exact measurement_1 cancelled: The exact query was replaced by a new selection.',
      'exact measurement_1 stopped',
      'exact measurement_2 started',
      'exact measurement_2 cancelled: The exact query was replaced by a new selection.',
      'exact measurement_2 stopped',
    ]);
    expect(session.actor.getSnapshot().context.exactRef).toBeUndefined();
    session.actor.stop();
  });

  it.each([
    ['a pose change', { type: 'poseChanged', revision: 2 }],
    ['a cut change', { type: 'cutsChanged' }],
    ['a geometry change', { type: 'geometryChanged' }],
  ] as ReadonlyArray<readonly [string, MeasureSessionEvent]>)(
    'should drop a running exact query after %s, whose record graphics marked',
    (_name, event) => {
      const session = startSession();
      session.actor.send({ type: 'committed', exact: exactRequest });
      session.work();
      session.actor.send(event);
      expect(session.work()).toEqual(['exact measurement_1 dropped', 'exact measurement_1 stopped']);
      session.actor.stop();
    },
  );

  it('should cancel a running exact query and stop a scan when Measure turns off, and only stop them with the session', () => {
    const session = startSession();
    session.actor.send({ type: 'committed', exact: exactRequest });
    session.actor.send({ type: 'catalogRequested', append: false });
    session.work();
    session.actor.send({ type: 'measureActiveChanged', active: false });
    expect(session.work()).toEqual([
      'exact measurement_1 cancelled: Measurement closed before the exact query finished.',
      'exact measurement_1 stopped',
      'catalog stopped',
    ]);

    session.actor.send({ type: 'measureActiveChanged', active: true });
    session.actor.send({ type: 'committed', exact: exactRequest });
    session.actor.send({ type: 'catalogRequested', append: false });
    session.work();
    session.actor.stop();
    // The view closing: the exact query's own cleanup cancels its record.
    expect(session.work().toSorted()).toEqual(['catalog stopped', 'exact measurement_1 stopped']);
  });

  it.each([
    ['a new request', { type: 'catalogRequested', append: true }],
    ['the presented camera', { type: 'cameraPresented' }],
    ['a pose change', { type: 'poseChanged', revision: 2 }],
    ['a cut change', { type: 'cutsChanged' }],
    ['its source', { type: 'catalogSourceChanged' }],
  ] as ReadonlyArray<readonly [string, MeasureSessionEvent]>)('should stop a running scan after %s', (_name, event) => {
    const session = startSession();
    session.actor.send({ type: 'catalogRequested', append: false });
    session.work();
    session.actor.send(event);
    expect(session.work()[0]).toBe('catalog stopped');
    session.actor.stop();
  });
});
