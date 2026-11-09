/*
 * Totality baseline for `cameraMachine` (graphics event-driven state charter, G0.4; xstate-policy MC-R17, MC-R23).
 * It changes no behaviour: it records what the machine answers today, so later packages shrink the gaps on purpose.
 *
 * Path table (`pathTable`, projection `[value, projection kind]`):
 *
 * | # | State | Projection   | Shortest events from the initial snapshot |
 * | - | ----- | ------------ | ----------------------------------------- |
 * | 1 | `{}`  | perspective  | (initial)                                 |
 * | 2 | `{}`  | orthographic | `setVerticalFieldOfView` 0                |
 *
 * Baseline today:
 *
 * - The machine has one state, and every event in its public alphabet takes a transition there, so
 *   `cameraIgnoredEvents` is empty and `unansweredEvents` finds nothing.
 * - Known defect, kept on purpose (charter D14): a payload the camera domain refuses throws inside the transition,
 *   which errors the actor. From then on every event is a dead letter. `can()` throws on the same payload rather than
 *   answering false. The `known defect` rows pin this; the package that adds a refusal flips them deliberately.
 */

import * as fc from 'fast-check';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { cameraIgnoredEvents, cameraMachine } from '#camera.machine.js';
import type { CameraDriverEvent, CameraDriverInput, CameraMachineEvent } from '#camera.machine.js';
import { cameraProjectionForVerticalFieldOfView, createCameraView } from '#camera-domain.js';
import type { CameraBounds, CameraVector } from '#camera-domain.js';

type EventType = CameraMachineEvent['type'];
type EventOf<Type extends EventType> = Extract<CameraMachineEvent, Readonly<{ type: Type }>>;

const initialView = createCameraView({
  frameId: 'test-root',
  requestedVerticalFieldOfView: 60,
  perspectiveZoom: 1,
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  viewport: { width: 1280, height: 720, pixelRatio: 1 },
  bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
});

const input = { initialView };

/*
 * At least one valid sample per event type. The `satisfies` clause fails to compile when the alphabet gains a type this
 * baseline does not sample, so the enumeration below always covers the whole public alphabet.
 */
const samples = {
  setVerticalFieldOfView: [
    { type: 'setVerticalFieldOfView', verticalFieldOfView: 0 },
    { type: 'setVerticalFieldOfView', verticalFieldOfView: 45 },
  ],
  setViewport: [{ type: 'setViewport', viewport: { width: 640, height: 480, pixelRatio: 2 } }],
  setBounds: [{ type: 'setBounds', bounds: { min: [-5, -2, -1], max: [5, 2, 1] } }],
  setView: [{ type: 'setView', target: [1, 2, 3], direction: [0, -1, 0], up: [0, 0, 1], verticalSpan: 20 }],
  frame: [{ type: 'frame' }, { type: 'frame', bounds: { min: [0, 0, 0], max: [2, 2, 2] }, margin: 0.2 }],
  saveHome: [{ type: 'saveHome' }],
  reset: [{ type: 'reset' }],
} as const satisfies { [Type in EventType]: readonly [EventOf<Type>, ...Array<EventOf<Type>>] };

const publicEvents: readonly CameraMachineEvent[] = Object.values(samples).flat();

const serializeState = (snapshot: AnyMachineSnapshot): string => {
  const context = snapshot.context as { view: { requestedVerticalFieldOfView: number } };
  return JSON.stringify([
    snapshot.value,
    cameraProjectionForVerticalFieldOfView(context.view.requestedVerticalFieldOfView).kind,
  ]);
};

const enumeration = { input, events: publicEvents, limit: 1000, serializeState };

/* Payloads the camera domain refuses today, at least one per payload-carrying event type. */
const refusedPayloads: ReadonlyArray<readonly [label: string, event: CameraMachineEvent]> = [
  ['a non-finite field of view', { type: 'setVerticalFieldOfView', verticalFieldOfView: Number.NaN }],
  ['a field of view above 179 degrees', { type: 'setVerticalFieldOfView', verticalFieldOfView: 180 }],
  ['a zero-width viewport', { type: 'setViewport', viewport: { width: 0, height: 480, pixelRatio: 1 } }],
  ['inverted bounds', { type: 'setBounds', bounds: { min: [1, 0, 0], max: [0, 1, 1] } }],
  ['a zero direction', { type: 'setView', target: [0, 0, 0], direction: [0, 0, 0], up: [0, 0, 1], verticalSpan: 1 }],
  [
    'an up parallel to the direction',
    { type: 'setView', target: [0, 0, 0], direction: [0, 0, 2], up: [0, 0, 1], verticalSpan: 1 },
  ],
  ['a margin above 0.5', { type: 'frame', margin: 0.6 }],
];

/* A driver that records every `sync` it receives, in order. */
const recordingDriver = () => {
  const received: CameraDriverEvent[] = [];
  const logic = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ receive }) => {
    receive((event) => {
      received.push(event);
    });
    return () => undefined;
  });
  return { logic, received };
};

describe('cameraMachine totality baseline', () => {
  it('should sample every event type the machine handles', () => {
    expect(new Set(publicEvents.map((event) => event.type))).toEqual(
      new Set(Object.keys(cameraMachine.config.on ?? {})),
    );
  });

  it('should declare no ignored events today', () => {
    expect(cameraIgnoredEvents).toEqual([]);
  });

  it('should answer every sampled public event in every reachable state', () => {
    expect(unansweredEvents(cameraMachine, { ...enumeration, ignore: cameraIgnoredEvents })).toEqual([]);
    expect(unreachedStates(cameraMachine, enumeration)).toEqual([]);
  });

  it('should reach both projections of its one state, as the path table records', () => {
    expect(pathTable(cameraMachine, enumeration)).toEqual([
      { state: {}, events: [] },
      { state: {}, events: [{ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 }] },
    ]);
  });

  it('should leave no dead letter, unanswered delivery or fault over the whole alphabet', () => {
    const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
    const driver = recordingDriver();
    const actor = createActor(cameraMachine.provide({ actors: { cameraDriver: driver.logic } }), {
      input,
      inspect: guard.inspect,
    }).start();

    for (const event of publicEvents) {
      actor.send(event);
    }

    expect(actor.getSnapshot().status).toBe('active');
    // `saveHome` changes no view, so it is the one event that sends the driver nothing.
    expect(driver.received).toHaveLength(publicEvents.filter((event) => event.type !== 'saveHome').length);
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should answer any sequence of valid events, syncing the driver once per view change', () => {
    const coordinate = fc.double({ min: -100, max: 100, noNaN: true });
    const vector = fc.tuple(coordinate, coordinate, coordinate);
    const length = fc.double({ min: 0.01, max: 100, noNaN: true });
    const bounds: fc.Arbitrary<CameraBounds> = fc
      .tuple(vector, fc.tuple(length, length, length))
      .map(([min, size]) => ({ min, max: [min[0] + size[0], min[1] + size[1], min[2] + size[2]] }));
    const axes: ReadonlyArray<readonly [direction: CameraVector, up: CameraVector]> = [
      [
        [1, -1, 0.7],
        [0, 0, 1],
      ],
      [
        [0, -1, 0],
        [0, 0, 1],
      ],
      [
        [0, 0, -1],
        [0, 1, 0],
      ],
      [
        [1, 0, 0],
        [0, 0, 1],
      ],
    ];
    const event: fc.Arbitrary<CameraMachineEvent> = fc.oneof(
      fc
        .oneof(fc.constant(0), fc.double({ min: 1, max: 120, noNaN: true }))
        .map((verticalFieldOfView) => ({ type: 'setVerticalFieldOfView', verticalFieldOfView }) as const),
      fc
        .record({
          width: fc.integer({ min: 1, max: 4096 }),
          height: fc.integer({ min: 1, max: 4096 }),
          pixelRatio: fc.constantFrom(1, 1.5, 2, 3),
        })
        .map((viewport) => ({ type: 'setViewport', viewport }) as const),
      bounds.map((value) => ({ type: 'setBounds', bounds: value }) as const),
      fc
        .tuple(vector, fc.constantFrom(...axes), length)
        .map(
          ([target, [direction, up], verticalSpan]) =>
            ({ type: 'setView', target, direction, up, verticalSpan }) as const,
        ),
      fc
        .record({ bounds, margin: fc.double({ min: 0, max: 0.5, noNaN: true }) }, { requiredKeys: [] })
        .map((options) => ({ type: 'frame', ...options }) as const),
      fc.constant({ type: 'saveHome' } as const),
      fc.constant({ type: 'reset' } as const),
    );

    fc.assert(
      fc.property(fc.array(event, { maxLength: 30 }), (events) => {
        const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
        const driver = recordingDriver();
        const actor = createActor(cameraMachine.provide({ actors: { cameraDriver: driver.logic } }), {
          input,
          inspect: guard.inspect,
        }).start();
        let revision = 0;
        for (const next of events) {
          actor.send(next);
          if (next.type !== 'saveHome') {
            revision += 1;
          }
        }
        const snapshot = actor.getSnapshot();
        expect(snapshot.status).toBe('active');
        expect(snapshot.context.revision).toBe(revision);
        expect(driver.received.map((sync) => sync.snapshot.revision)).toEqual(
          Array.from({ length: revision }, (_, index) => index + 1),
        );
        actor.stop();
        expect(guard.take()).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  describe('known defect: a refused payload errors the actor', () => {
    it.each(refusedPayloads)('should throw from can() for %s', (_label, event) => {
      const snapshot = createActor(cameraMachine, { input }).getSnapshot();
      expect(() => snapshot.can(event)).toThrow(RangeError);
    });

    it.each(refusedPayloads)('should error the actor and dead-letter what follows, for %s', (_label, event) => {
      const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
      const actor = createActor(cameraMachine, { input, inspect: guard.inspect });
      const errors: unknown[] = [];
      actor.subscribe({ error: (error) => errors.push(error) });
      actor.start();

      actor.send(event);
      actor.send({ type: 'reset' });

      expect(actor.getSnapshot().status).toBe('error');
      expect(errors).toEqual([expect.any(RangeError)]);
      expect(guard.take('fault')).toEqual([
        { kind: 'fault', machineId: 'camera', eventType: event.type, status: 'error' },
      ]);
      expect(guard.take('deadLetter')).toEqual([expect.objectContaining({ kind: 'deadLetter', eventType: 'reset' })]);
      expect(guard.take()).toEqual([]);
    });
  });
});
