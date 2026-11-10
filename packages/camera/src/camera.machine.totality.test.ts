/*
 * Totality of `cameraMachine` (graphics event-driven state charter, G0.4 and G3; xstate-policy MC-R17, MC-R23).
 *
 * Path table (`pathTable`, projection `[value, projection kind]`; each row is reached in both projections, the
 * orthographic one through a leading `setVerticalFieldOfView` 0):
 *
 * | # | `input`    | `gesture`  | Shortest events from the initial snapshot                       |
 * | - | ---------- | ---------- | --------------------------------------------------------------- |
 * | 1 | `idle`     | `released` | (initial)                                                       |
 * | 2 | `idle`     | `held`     | `interactionStarted`                                            |
 * | 3 | `settling` | `released` | `poseObserved`                                                  |
 * | 4 | `dragging` | `held`     | `interactionStarted`, `poseObserved`                            |
 * | 5 | `settling` | `held`     | `poseObserved`, `interactionStarted`                            |
 *
 * `input.dragging` with `gesture.released` is unreachable: only a pose of a held gesture enters `dragging`, and the
 * `interactionEnded` that releases the gesture leaves it.
 *
 * - Every event of the public alphabet takes a transition in every reachable state, except the pairs on
 *   `cameraIgnoredEvents`.
 * - A payload the camera domain refuses is not taken: `can()` answers `false`, the actor stays active on its last
 *   valid view, and what follows is still taken. Before G3 the same payload errored the actor (charter D14).
 */

import * as fc from 'fast-check';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';
import { machineAlphabet } from '@taucad/formal/drift';
import { StepClock } from '@taucad/xstate-testing/clock';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { cameraIgnoredEvents, cameraMachine, cameraPoseSettleMilliseconds } from '#camera.machine.js';
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
const pose = { target: [1, 2, 3], direction: [0, -1, 0], up: [0, 0, 1], verticalSpan: 20 } as const;
const sampleBounds = { min: [0, 0, 0], max: [2, 2, 2] } as const;

/*
 * At least one valid sample per event type. The `satisfies` clause fails to compile when the alphabet gains a type this
 * file does not sample, so the enumeration below always covers the whole public alphabet.
 */
const samples = {
  setVerticalFieldOfView: [
    { type: 'setVerticalFieldOfView', verticalFieldOfView: 0 },
    { type: 'setVerticalFieldOfView', verticalFieldOfView: 45 },
  ],
  setViewport: [{ type: 'setViewport', viewport: { width: 640, height: 480, pixelRatio: 2 } }],
  setBounds: [{ type: 'setBounds', bounds: { min: [-5, -2, -1], max: [5, 2, 1] } }],
  setUpDirection: [
    { type: 'setUpDirection', axis: 'y' },
    { type: 'setUpDirection', axis: 'z' },
  ],
  setRenderFrame: [
    {
      type: 'setRenderFrame',
      renderFrame: { anchorFrameId: 'test-root', originMeters: [1, 2, 3], metersPerRenderUnit: 0.001 },
    },
  ],
  setClipPolicy: [
    { type: 'setClipPolicy', clipPolicy: { farPaddingVerticalSpans: 2 } },
    { type: 'setClipPolicy', clipPolicy: undefined },
  ],
  poseObserved: [
    { type: 'poseObserved', ...pose, source: 'input' },
    { type: 'poseObserved', ...pose, source: 'gizmo' },
    { type: 'poseObserved', ...pose, source: 'input', echoRevision: 1 },
  ],
  interactionStarted: [{ type: 'interactionStarted' }],
  interactionMoved: [{ type: 'interactionMoved' }],
  interactionEnded: [{ type: 'interactionEnded' }],
  frameGeometry: [
    { type: 'frameGeometry', bounds: sampleBounds, margin: 0.2, source: 'framing' },
    {
      type: 'frameGeometry',
      bounds: sampleBounds,
      margin: 0.1,
      orientation: { direction: [0, 0, 1], up: [0, 1, 0] },
      source: 'fit',
    },
  ],
  frameBounds: [{ type: 'frameBounds', bounds: sampleBounds, margin: 0.1, source: 'focus' }],
  adoptPersistedPose: [
    { type: 'adoptPersistedPose', requestId: 'sample-pose', pose },
    { type: 'adoptPersistedPose', requestId: 'sample-fields', verticalFieldOfView: 30, upDirection: 'y' },
  ],
  setView: [{ type: 'setView', ...pose }],
  frame: [{ type: 'frame' }, { type: 'frame', bounds: sampleBounds, margin: 0.2 }],
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

/* A payload from an untyped sender, which the event type would not admit. */
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the payload is malformed on purpose.
const untyped = (event: Readonly<Record<string, unknown>>): CameraMachineEvent =>
  event as unknown as CameraMachineEvent;

/* Payloads the camera refuses, at least one per payload-carrying event type. */
const refusedPayloads: ReadonlyArray<readonly [label: string, event: CameraMachineEvent]> = [
  ['a non-finite field of view', { type: 'setVerticalFieldOfView', verticalFieldOfView: Number.NaN }],
  ['a negative field of view', { type: 'setVerticalFieldOfView', verticalFieldOfView: -1 }],
  ['a field of view above 179 degrees', { type: 'setVerticalFieldOfView', verticalFieldOfView: 180 }],
  ['a zero-width viewport', { type: 'setViewport', viewport: { width: 0, height: 480, pixelRatio: 1 } }],
  ['a zero-height viewport', { type: 'setViewport', viewport: { width: 640, height: 0, pixelRatio: 1 } }],
  ['a non-finite pixel ratio', { type: 'setViewport', viewport: { width: 640, height: 480, pixelRatio: Number.NaN } }],
  ['inverted bounds', { type: 'setBounds', bounds: { min: [1, 0, 0], max: [0, 1, 1] } }],
  ['non-finite bounds', { type: 'setBounds', bounds: { min: [0, 0, 0], max: [1, Number.POSITIVE_INFINITY, 1] } }],
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a payload from an untyped sender.
  ['an unknown up axis', { type: 'setUpDirection', axis: 'w' } as unknown as CameraMachineEvent],
  [
    'a render frame of another frame',
    {
      type: 'setRenderFrame',
      renderFrame: { anchorFrameId: 'other', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    },
  ],
  [
    'a render frame with a zero scale',
    {
      type: 'setRenderFrame',
      renderFrame: { anchorFrameId: 'test-root', originMeters: [0, 0, 0], metersPerRenderUnit: 0 },
    },
  ],
  ['a negative far padding', { type: 'setClipPolicy', clipPolicy: { farPaddingVerticalSpans: -1 } }],
  [
    'a zero presentation normal',
    {
      type: 'setClipPolicy',
      clipPolicy: { farPaddingVerticalSpans: 0, presentationPlane: { normal: [0, 0, 0], offsetMeters: 0 } },
    },
  ],
  ['a zero direction', { type: 'poseObserved', ...pose, direction: [0, 0, 0], source: 'input' }],
  ['an up parallel to the direction', { type: 'poseObserved', ...pose, direction: [0, 0, 2], source: 'gizmo' }],
  ['a non-positive vertical span', { type: 'poseObserved', ...pose, verticalSpan: 0, source: 'input' }],
  [
    'a pose from a source that is not a drag',
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a payload from an untyped sender.
    { type: 'poseObserved', ...pose, source: 'persisted' } as unknown as CameraMachineEvent,
  ],
  ['a legacy pose with a zero direction', { type: 'setView', ...pose, direction: [0, 0, 0] }],
  ['a legacy pose with a parallel up', { type: 'setView', ...pose, direction: [0, 0, 2] }],
  ['a frame margin above 0.5', { type: 'frameGeometry', bounds: sampleBounds, margin: 0.6, source: 'fit' }],
  [
    'inverted frame bounds',
    { type: 'frameGeometry', bounds: { min: [1, 0, 0], max: [0, 1, 1] }, margin: 0.1, source: 'framing' },
  ],
  [
    'a frame orientation with a parallel up',
    {
      type: 'frameGeometry',
      bounds: sampleBounds,
      margin: 0.1,
      orientation: { direction: [0, 0, 1], up: [0, 0, 1] },
      source: 'fit',
    },
  ],
  [
    'a frame from a source that is not framing',
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a payload from an untyped sender.
    { type: 'frameGeometry', bounds: sampleBounds, margin: 0.1, source: 'input' } as unknown as CameraMachineEvent,
  ],
  ['a focus margin above 0.5', { type: 'frameBounds', bounds: sampleBounds, margin: 0.6, source: 'focus' }],
  [
    'inverted focus bounds',
    { type: 'frameBounds', bounds: { min: [1, 0, 0], max: [0, 1, 1] }, margin: 0.1, source: 'focus' },
  ],
  ['an adoption with no camera field', { type: 'adoptPersistedPose', requestId: 'refused' }],
  ['an adoption with an empty request id', { type: 'adoptPersistedPose', requestId: '', pose }],
  [
    'an adoption with both a pose and an orientation',
    { type: 'adoptPersistedPose', requestId: 'refused', pose, orientation: { direction: [0, 0, 1], up: [0, 1, 0] } },
  ],
  [
    'an adoption with a zero direction',
    { type: 'adoptPersistedPose', requestId: 'refused', pose: { ...pose, direction: [0, 0, 0] } },
  ],
  [
    'an adoption with a non-finite field of view',
    { type: 'adoptPersistedPose', requestId: 'refused', verticalFieldOfView: Number.NaN },
  ],
  [
    'an adoption with a margin above 0.5',
    {
      type: 'adoptPersistedPose',
      requestId: 'refused',
      orientation: { direction: [0, 0, 1], up: [0, 1, 0] },
      margin: 0.6,
    },
  ],
  ['a legacy frame margin above 0.5', { type: 'frame', margin: 0.6 }],
  // Malformed payloads: a missing or null field is refused like an invalid value, never an actor error.
  ['a missing viewport', untyped({ type: 'setViewport' })],
  ['a null viewport', untyped({ type: 'setViewport', viewport: null })],
  ['missing bounds', untyped({ type: 'setBounds' })],
  ['bounds with a null minimum', untyped({ type: 'setBounds', bounds: { min: null, max: [1, 1, 1] } })],
  ['a missing render frame', untyped({ type: 'setRenderFrame' })],
  [
    'a render frame with no origin',
    untyped({ type: 'setRenderFrame', renderFrame: { anchorFrameId: 'test-root', metersPerRenderUnit: 1 } }),
  ],
  ['a null clip policy', untyped({ type: 'setClipPolicy', clipPolicy: null })],
  [
    'a presentation plane with no normal',
    untyped({
      type: 'setClipPolicy',
      clipPolicy: { farPaddingVerticalSpans: 0, presentationPlane: { offsetMeters: 0 } },
    }),
  ],
  ['a pose with no target', untyped({ type: 'poseObserved', ...pose, target: undefined, source: 'input' })],
  ['a pose with a null direction', untyped({ type: 'poseObserved', ...pose, direction: null, source: 'input' })],
  ['a pose with a null echo stamp', untyped({ type: 'poseObserved', ...pose, source: 'input', echoRevision: null })],
  [
    'a pose with a non-integer echo stamp',
    { type: 'poseObserved', ...pose, source: 'input', echoRevision: Number.NaN },
  ],
  ['an empty legacy pose', untyped({ type: 'setView' })],
  ['a frame with no bounds', untyped({ type: 'frameGeometry', margin: 0.1, source: 'fit' })],
  [
    'a frame with an empty orientation',
    untyped({ type: 'frameGeometry', bounds: sampleBounds, margin: 0.1, orientation: {}, source: 'fit' }),
  ],
  ['a frame with no margin', untyped({ type: 'frameGeometry', bounds: sampleBounds, source: 'framing' })],
  ['a focus with no bounds', untyped({ type: 'frameBounds', margin: 0.1, source: 'focus' })],
  ['a focus with no margin', untyped({ type: 'frameBounds', bounds: sampleBounds, source: 'focus' })],
  [
    'a focus from the framing source',
    untyped({ type: 'frameBounds', bounds: sampleBounds, margin: 0.1, source: 'framing' }),
  ],
  ['a focus with no source', untyped({ type: 'frameBounds', bounds: sampleBounds, margin: 0.1 })],
  ['an up axis from the object prototype', untyped({ type: 'setUpDirection', axis: 'constructor' })],
  ['the up axis toString', untyped({ type: 'setUpDirection', axis: 'toString' })],
  ['the up axis __proto__', untyped({ type: 'setUpDirection', axis: '__proto__' })],
  ['an adoption with a null pose', untyped({ type: 'adoptPersistedPose', requestId: 'refused', pose: null })],
  ['an adoption with an empty pose', untyped({ type: 'adoptPersistedPose', requestId: 'refused', pose: {} })],
  [
    'an adoption whose only field is null',
    untyped({ type: 'adoptPersistedPose', requestId: 'refused', orientation: null }),
  ],
  [
    'an adoption with a non-finite margin',
    { type: 'adoptPersistedPose', requestId: 'refused', pose, margin: Number.NaN },
  ],
  [
    'an adoption with an up axis from the object prototype',
    untyped({ type: 'adoptPersistedPose', requestId: 'refused', upDirection: 'constructor' }),
  ],
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

/* Where each input state is entered from the initial snapshot. */
const inputStates = {
  idle: [],
  dragging: [{ type: 'interactionStarted' }, { type: 'poseObserved', ...pose, source: 'input' }],
  settling: [{ type: 'poseObserved', ...pose, source: 'input' }],
} as const satisfies Record<string, readonly CameraMachineEvent[]>;

describe('cameraMachine totality', () => {
  it('should sample every event type the machine handles, and the one it ignores everywhere', () => {
    const sampled = new Set(publicEvents.map((event) => event.type));

    expect(sampled).toEqual(new Set([...machineAlphabet([cameraMachine]), 'interactionMoved']));
  });

  it('should declare exactly the ignored pairs of the gesture', () => {
    expect(cameraIgnoredEvents).toEqual([
      ['*', 'interactionMoved'],
      ['gesture.held', 'interactionStarted'],
      ['gesture.released', 'interactionEnded'],
    ]);
  });

  it('should answer every sampled public event in every reachable state', () => {
    expect(unansweredEvents(cameraMachine, { ...enumeration, ignore: cameraIgnoredEvents })).toEqual([]);
    expect(unreachedStates(cameraMachine, enumeration)).toEqual([]);
  });

  it('should ignore nothing it does not declare: without the list, only its pairs are unanswered', () => {
    const unanswered = unansweredEvents(cameraMachine, enumeration).map(({ state, eventType }) =>
      JSON.stringify([state, eventType]),
    );

    expect(new Set(unanswered.map((row) => (JSON.parse(row) as [unknown, string])[1]))).toEqual(
      new Set(['interactionMoved', 'interactionStarted', 'interactionEnded']),
    );
    // `interactionEnded` is unanswered only where no gesture is held, and `interactionStarted` only where one is.
    expect(unanswered).not.toContain(JSON.stringify([{ input: 'dragging', gesture: 'held' }, 'interactionEnded']));
    expect(unanswered).not.toContain(JSON.stringify([{ input: 'idle', gesture: 'released' }, 'interactionStarted']));
  });

  it('should reach every input and gesture pair but dragging-released, in both projections', () => {
    const table = pathTable(cameraMachine, enumeration);
    const fieldOfViewZero = { type: 'setVerticalFieldOfView', verticalFieldOfView: 0 } as const;
    const started = { type: 'interactionStarted' } as const;
    const moved = { type: 'poseObserved', ...pose, source: 'input' } as const;
    const rows: ReadonlyArray<readonly [input: string, gesture: string, events: readonly CameraMachineEvent[]]> = [
      ['idle', 'released', []],
      ['idle', 'held', [started]],
      ['settling', 'released', [moved]],
      ['dragging', 'held', [started, moved]],
      ['settling', 'held', [moved, started]],
    ];

    expect(table).toHaveLength(rows.length * 2);
    for (const [inputState, gesture, events] of rows) {
      const reached = table.filter(
        (row) => JSON.stringify(row.state) === JSON.stringify({ input: inputState, gesture }),
      );
      expect(reached.map((row) => row.events.length).sort((left, right) => left - right)).toEqual([
        events.length,
        events.length + 1,
      ]);
      expect(reached.map((row) => row.events)).toContainEqual(events);
      expect(
        reached.some((row) => row.events.some((event) => JSON.stringify(event) === JSON.stringify(fieldOfViewZero))),
      ).toBe(true);
    }
    expect(table.map((row) => row.state)).not.toContainEqual({ input: 'dragging', gesture: 'released' });
  });

  it('should leave no dead letter, unanswered delivery or fault over the whole alphabet', () => {
    const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
    const driver = recordingDriver();
    const clock = new StepClock();
    const actor = createActor(cameraMachine.provide({ actors: { cameraDriver: driver.logic } }), {
      input,
      clock,
      inspect: guard.inspect,
    }).start();

    for (const event of publicEvents) {
      actor.send(event);
    }
    clock.advance(cameraPoseSettleMilliseconds);

    expect(actor.getSnapshot().status).toBe('active');
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should answer any sequence of valid events and keep its invariants', () => {
    const coordinate = fc.double({ min: -100, max: 100, noNaN: true });
    const vector = fc.tuple(coordinate, coordinate, coordinate);
    const length = fc.double({ min: 0.01, max: 100, noNaN: true });
    const bounds: fc.Arbitrary<CameraBounds> = fc
      .tuple(vector, fc.tuple(length, length, length))
      .map(([min, size]) => ({ min, max: [min[0] + size[0], min[1] + size[1], min[2] + size[2]] }));
    const margin = fc.double({ min: 0, max: 0.5, noNaN: true });
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
    const anyPose = fc
      .tuple(vector, fc.constantFrom(...axes), length)
      .map(([target, [direction, up], verticalSpan]) => ({ target, direction, up, verticalSpan }));
    const fieldOfView = fc.oneof(fc.constant(0), fc.double({ min: 1, max: 120, noNaN: true }));
    const event: fc.Arbitrary<CameraMachineEvent> = fc.oneof(
      fieldOfView.map((verticalFieldOfView) => ({ type: 'setVerticalFieldOfView', verticalFieldOfView }) as const),
      fc
        .record({
          width: fc.integer({ min: 1, max: 4096 }),
          height: fc.integer({ min: 1, max: 4096 }),
          pixelRatio: fc.constantFrom(1, 1.5, 2, 3),
        })
        .map((viewport) => ({ type: 'setViewport', viewport }) as const),
      bounds.map((value) => ({ type: 'setBounds', bounds: value }) as const),
      fc.constantFrom('x', 'y', 'z').map((axis) => ({ type: 'setUpDirection', axis }) as const),
      fc.tuple(anyPose, fc.constantFrom('input', 'gizmo'), fc.option(fc.nat(50), { nil: undefined })).map(
        ([value, source, echoRevision]) =>
          ({
            type: 'poseObserved',
            ...value,
            source,
            ...(echoRevision === undefined ? {} : { echoRevision }),
          }) as const,
      ),
      fc.constant({ type: 'interactionStarted' } as const),
      fc.constant({ type: 'interactionMoved' } as const),
      fc.constant({ type: 'interactionEnded' } as const),
      fc
        .tuple(bounds, margin, fc.constantFrom('framing', 'fit'))
        .map(([value, by, source]) => ({ type: 'frameGeometry', bounds: value, margin: by, source }) as const),
      fc
        .tuple(bounds, margin)
        .map(([value, by]) => ({ type: 'frameBounds', bounds: value, margin: by, source: 'focus' }) as const),
      fc
        .tuple(fc.uuid(), anyPose, fc.option(fieldOfView, { nil: undefined }))
        .map(
          ([requestId, value, verticalFieldOfView]) =>
            ({ type: 'adoptPersistedPose', requestId, pose: value, verticalFieldOfView }) as const,
        ),
      anyPose.map((value) => ({ type: 'setView', ...value }) as const),
      fc.record({ bounds, margin }, { requiredKeys: [] }).map((options) => ({ type: 'frame', ...options }) as const),
    );
    const step = fc.oneof(
      { weight: 5, arbitrary: event },
      { weight: 1, arbitrary: fc.integer({ min: 1, max: 300 }).map((milliseconds) => ({ advance: milliseconds })) },
    );

    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
        const driver = recordingDriver();
        const clock = new StepClock();
        const actor = createActor(cameraMachine.provide({ actors: { cameraDriver: driver.logic } }), {
          input,
          clock,
          inspect: guard.inspect,
        }).start();
        const emitted = recordEmitted(actor);

        for (const next of steps) {
          const before = actor.getSnapshot();
          emitted.length = 0;
          if ('advance' in next) {
            clock.advance(next.advance);
          } else {
            actor.send(next);
          }
          const after = actor.getSnapshot();
          const { revision, lastChange } = after.context;

          expect(after.status).toBe('active');
          // I1: one change is one revision, and the last change names it.
          expect(revision - before.context.revision).toBeLessThanOrEqual(1);
          expect(lastChange.revision).toBe(revision);
          expect(emitted.filter((item) => item.type === 'viewChanged')).toHaveLength(
            revision - before.context.revision,
          );
          // Only a held gesture keeps the camera dragging.
          expect(after.matches({ input: 'dragging' }) && !after.matches({ gesture: 'held' })).toBe(false);
          if (!('advance' in next) && next.type === 'adoptPersistedPose') {
            // I2, I8: a persisted pose applies in idle and is dropped everywhere else.
            expect(emitted.at(-1)?.type).toBe(
              before.matches({ input: 'idle' }) ? 'adoptionApplied' : 'adoptionDropped',
            );
            expect(lastChange.source === 'persisted' && lastChange.revision === revision).toBe(
              before.matches({ input: 'idle' }) || before.context.lastChange.source === 'persisted',
            );
          }
          if (!('advance' in next) && next.type === 'poseObserved' && next.echoRevision !== undefined) {
            // I3: an echo changes nothing.
            expect(after.context).toBe(before.context);
            expect(after.value).toEqual(before.value);
          }
        }

        // Every revision reaches the driver exactly once, in order.
        expect(driver.received.map((sync) => sync.snapshot.revision)).toEqual(
          Array.from({ length: actor.getSnapshot().context.revision }, (_, index) => index + 1),
        );
        // Left alone with no gesture held, the camera is idle within one settle window.
        actor.send({ type: 'interactionEnded' });
        clock.advance(cameraPoseSettleMilliseconds);
        expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
        actor.stop();
        expect(guard.take()).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  describe('a refused payload is not taken (charter D14)', () => {
    it('should refuse at least one payload of every payload-carrying event type', () => {
      const carrying = publicEvents.filter((event) => Object.keys(event).length > 1).map((event) => event.type);

      expect(new Set(refusedPayloads.map(([, event]) => event.type))).toEqual(new Set(carrying));
    });

    it.each(refusedPayloads)('should answer false from can() for %s', (_label, event) => {
      const snapshot = createActor(cameraMachine, { input }).getSnapshot();

      expect(snapshot.can(event)).toBe(false);
    });

    describe.each(Object.entries(inputStates))('in input.%s', (state, events) => {
      it.each(refusedPayloads)('should keep the camera and take what follows, for %s', (_label, event) => {
        const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
        const driver = recordingDriver();
        const actor = createActor(cameraMachine.provide({ actors: { cameraDriver: driver.logic } }), {
          input,
          clock: new StepClock(),
          inspect: guard.inspect,
        });
        const errors: unknown[] = [];
        actor.subscribe({ error: (error) => errors.push(error) });
        const emitted = recordEmitted(actor);
        actor.start();
        for (const prior of events) {
          actor.send(prior);
        }
        const before = actor.getSnapshot();
        const synchronized = driver.received.length;
        emitted.length = 0;

        actor.send(event);

        expect(actor.getSnapshot().status).toBe('active');
        expect(errors).toEqual([]);
        expect(actor.getSnapshot().matches({ input: state })).toBe(true);
        expect(actor.getSnapshot().context).toBe(before.context);
        expect(driver.received).toHaveLength(synchronized);
        expect(emitted).toEqual([]);
        expect(guard.take()).toEqual([
          { kind: 'unanswered', machineId: 'camera', value: before.value, eventType: event.type },
        ]);

        actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 33 });
        expect(actor.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(33);
        actor.stop();
        expect(guard.take()).toEqual([]);
      });
    });
  });
});
