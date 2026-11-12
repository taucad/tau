import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createCameraView, resolveCameraState } from '@taucad/camera';
import type { CameraVector, CameraView } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { cameraMachine } from '@taucad/camera/machine';
import { createThreeCameraRig } from '#camera.js';
import { toThreeRenderPoint } from '#spatial.js';

/*
 * The rig's mirror (its render frame and clip policy), its own camera actor's context and the native cameras agree
 * after every order of rig setters, direct actor events, reentrant calls from `onUpdate` and restores.
 */

type Rig = ReturnType<typeof createThreeCameraRig>;

const initialView = createCameraView({
  frameId: 'test-root',
  requestedVerticalFieldOfView: 60,
  perspectiveZoom: 1,
  target: [35, -20, 12],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 600,
  viewport: { width: 1536, height: 900, pixelRatio: 2 },
  bounds: { min: [-220, -180, -55], max: [220, 180, 55] },
});

const viewport = { width: 900, height: 600, pixelRatio: 1 } as const;

const frameAt = (metersPerRenderUnit: number, originMeters: CameraVector = [0, 0, 0]): RenderFrame => ({
  anchorFrameId: initialView.frameId,
  originMeters,
  metersPerRenderUnit,
});

const expectedPosition = (renderFrame: RenderFrame, view: CameraView): number[] =>
  toThreeRenderPoint({ renderFrame, pointMeters: resolveCameraState({ view }).position }).toArray();

/* Expects the rig to present exactly what a fresh rig made from its actor's context presents. */
const expectAgreement = (rig: Rig): void => {
  const { context } = rig.actorRef.getSnapshot();
  const reference = createThreeCameraRig({
    initialView: context.view,
    renderFrame: context.renderFrame,
    clipPlanes: context.clipPolicy,
  });
  expect(rig.renderFrame).toEqual(context.renderFrame);
  for (const key of ['near', 'far', 'fov'] as const) {
    expect(rig.perspectiveCamera[key]).toBeCloseTo(reference.perspectiveCamera[key], 9);
  }
  expect(rig.perspectiveCamera.position.distanceTo(reference.perspectiveCamera.position)).toBeLessThan(1e-9);
  reference.dispose();
};

describe('createThreeCameraRig mirror', () => {
  it('should keep the rig frame when an actor restored from before a rig change changes its view', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();
    const persisted = rig.actorRef.getPersistedSnapshot();
    rig.setRenderFrame(frameAt(4));
    rig.actorRef.stop();
    const restored = createActor(rig.actorRef.logic, { snapshot: persisted }).start();

    restored.send({ type: 'setViewport', viewport });

    expect(rig.renderFrame).toEqual(frameAt(4));
    expect(restored.getSnapshot().context.renderFrame).toEqual(frameAt(4));
    expect(rig.perspectiveCamera.position.toArray()).toEqual(
      expectedPosition(frameAt(4), restored.getSnapshot().context.view),
    );
    restored.stop();
    rig.dispose();
  });

  it('should present and notify a restored actor change whose revision the stopped actor already reached', () => {
    const revisions: number[] = [];
    const rig = createThreeCameraRig({
      initialView,
      onUpdate(_camera, snapshot) {
        revisions.push(snapshot.revision);
      },
    });
    rig.actorRef.start();
    rig.actorRef.send({ type: 'setViewport', viewport });
    const persisted = rig.actorRef.getPersistedSnapshot();
    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    rig.actorRef.stop();
    const restored = createActor(rig.actorRef.logic, { snapshot: persisted }).start();
    revisions.length = 0;

    restored.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 45 });

    expect(restored.getSnapshot().context.revision).toBe(2);
    expect(rig.perspectiveCamera.fov).toBe(45);
    expect(revisions).toEqual([2]);
    restored.stop();
    rig.dispose();
  });

  const reentrantOrders: ReadonlyArray<
    readonly [
      label: string,
      order: Readonly<{ outer: (rig: Rig) => void; inner: (rig: Rig) => void; read: (rig: Rig) => unknown }>,
    ]
  > = [
    [
      'a rig frame inside a rig frame',
      {
        outer(rig) {
          rig.setRenderFrame(frameAt(4));
        },
        inner(rig) {
          rig.setRenderFrame(frameAt(2));
        },
        read: (rig) => rig.actorRef.getSnapshot().context.renderFrame.metersPerRenderUnit,
      },
    ],
    [
      'an actor frame inside a rig frame',
      {
        outer(rig) {
          rig.setRenderFrame(frameAt(4));
        },
        inner(rig) {
          rig.actorRef.send({ type: 'setRenderFrame', renderFrame: frameAt(2) });
        },
        read: (rig) => rig.actorRef.getSnapshot().context.renderFrame.metersPerRenderUnit,
      },
    ],
    [
      'a rig policy inside a rig policy',
      {
        outer(rig) {
          rig.setClipPlanes({ farPaddingVerticalSpans: 4 });
        },
        inner(rig) {
          rig.setClipPlanes({ farPaddingVerticalSpans: 2 });
        },
        read: (rig) => rig.actorRef.getSnapshot().context.clipPolicy?.farPaddingVerticalSpans,
      },
    ],
    [
      'an actor policy inside a rig policy',
      {
        outer(rig) {
          rig.setClipPlanes({ farPaddingVerticalSpans: 4 });
        },
        inner(rig) {
          rig.actorRef.send({ type: 'setClipPolicy', clipPolicy: { farPaddingVerticalSpans: 2 } });
        },
        read: (rig) => rig.actorRef.getSnapshot().context.clipPolicy?.farPaddingVerticalSpans,
      },
    ],
  ];

  it.each(reentrantOrders)('should end on the inner change for %s', (_label, { outer, inner, read }) => {
    let reenter = false;
    const rig = createThreeCameraRig({
      initialView,
      onUpdate() {
        if (reenter) {
          reenter = false;
          inner(rig);
        }
      },
    });
    rig.actorRef.start();
    reenter = true;

    outer(rig);

    expect(read(rig)).toBe(2);
    expectAgreement(rig);
    rig.dispose();
  });

  it('should take an actor policy change after a rig change made inside the start notification', () => {
    let first = true;
    const rig = createThreeCameraRig({
      initialView,
      onUpdate() {
        if (first) {
          first = false;
          rig.setClipPlanes({ farPaddingVerticalSpans: 3 });
        }
      },
    });
    rig.actorRef.start();
    const reference = createThreeCameraRig({ initialView, clipPlanes: { farPaddingVerticalSpans: 7 } });

    rig.actorRef.send({ type: 'setClipPolicy', clipPolicy: { farPaddingVerticalSpans: 7 } });

    expect(rig.actorRef.getSnapshot().context.clipPolicy).toEqual({ farPaddingVerticalSpans: 7 });
    expect(rig.perspectiveCamera.far).toBe(reference.perspectiveCamera.far);
    reference.dispose();
    rig.dispose();
  });

  it('should refuse a render frame or a clip policy the camera actor would refuse', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();

    expect(() => {
      rig.setRenderFrame(frameAt(1e-320));
    }).toThrow(RangeError);
    expect(() => {
      rig.setClipPlanes({
        farPaddingVerticalSpans: 0,
        presentationPlane: { normal: [Number.MAX_VALUE, Number.MAX_VALUE, 0], offsetMeters: 0 },
      });
    }).toThrow(RangeError);
    rig.setClipPlanes({ farPaddingVerticalSpans: 2 });

    expect(rig.renderFrame).toEqual(frameAt(1));
    expect(rig.actorRef.getSnapshot().context.clipPolicy).toEqual({ farPaddingVerticalSpans: 2 });
    expectAgreement(rig);
    rig.dispose();
  });

  /* Starts a rig, runs `inside` once from the next notification, and returns what each notification presented. */
  const presentations = (inside: (rig: Rig) => void, before?: (rig: Rig) => void) => {
    const presented: Array<readonly [metersPerRenderUnit: number, farPadding: number | undefined]> = [];
    let armed = false;
    const rig = createThreeCameraRig({
      initialView,
      onUpdate(_camera, snapshot) {
        presented.push([rig.renderFrame.metersPerRenderUnit, snapshot.clipPolicy?.farPaddingVerticalSpans]);
        if (armed) {
          armed = false;
          inside(rig);
        }
      },
    });
    if (before) {
      before(rig);
      armed = true;
      rig.actorRef.start();
    } else {
      rig.actorRef.start();
      presented.length = 0;
      armed = true;
      rig.actorRef.send({ type: 'setViewport', viewport });
    }
    expectAgreement(rig);
    rig.dispose();
    return presented;
  };

  it.each<
    readonly [label: string, inside: (rig: Rig) => void, expected: ReadonlyArray<readonly [number, number | undefined]>]
  >([
    [
      'two frames',
      (rig) => {
        rig.setRenderFrame(frameAt(4));
        rig.setRenderFrame(frameAt(8));
      },
      [
        [1, undefined],
        [4, undefined],
        [8, undefined],
      ],
    ],
    [
      'a frame and then the frame it replaced',
      (rig) => {
        rig.setRenderFrame(frameAt(4));
        rig.setRenderFrame(frameAt(1));
      },
      [
        [1, undefined],
        [4, undefined],
        [1, undefined],
      ],
    ],
    [
      'two policies',
      (rig) => {
        rig.setClipPlanes({ farPaddingVerticalSpans: 4 });
        rig.setClipPlanes({ farPaddingVerticalSpans: 8 });
      },
      [
        [1, undefined],
        [1, 4],
        [1, 8],
      ],
    ],
    [
      'a policy and then a frame',
      (rig) => {
        rig.setClipPlanes({ farPaddingVerticalSpans: 6 });
        rig.setRenderFrame(frameAt(4));
      },
      [
        [1, undefined],
        [1, 6],
        [4, 6],
      ],
    ],
  ])('should present each of %s set from inside a notification once, in order', (_label, inside, expected) => {
    expect(presentations(inside)).toEqual(expected);
  });

  it('should present a frame set from inside the start notification after a frame set before start once', () => {
    const presented = presentations(
      (rig) => {
        rig.setRenderFrame(frameAt(8));
      },
      (rig) => {
        rig.setRenderFrame(frameAt(2));
      },
    );

    expect(presented).toEqual([
      [2, undefined],
      [2, undefined],
      [8, undefined],
    ]);
  });

  it('should present each of two frames set from an actor subscriber once, in order', () => {
    const presented: number[] = [];
    const rig = createThreeCameraRig({
      initialView,
      onUpdate() {
        presented.push(rig.renderFrame.metersPerRenderUnit);
      },
    });
    rig.actorRef.start();
    let first = true;
    rig.actorRef.subscribe(() => {
      if (first) {
        first = false;
        rig.setRenderFrame(frameAt(4));
        rig.setRenderFrame(frameAt(8));
      }
    });
    presented.length = 0;

    rig.actorRef.send({ type: 'setViewport', viewport });

    expect(presented).toEqual([1, 4, 8]);
    expectAgreement(rig);
    rig.dispose();
  });

  it('should take an actor frame change after a rig frame the actor already held when it arrived', () => {
    let reenter = false;
    const rig = createThreeCameraRig({
      initialView,
      onUpdate() {
        if (reenter) {
          reenter = false;
          rig.actorRef.send({ type: 'setRenderFrame', renderFrame: frameAt(2) });
        }
      },
    });
    rig.actorRef.start();
    reenter = true;
    rig.setRenderFrame(frameAt(2));

    rig.actorRef.send({ type: 'setRenderFrame', renderFrame: frameAt(4) });

    expect(rig.renderFrame).toEqual(frameAt(4));
    expectAgreement(rig);
    rig.dispose();
  });

  it('should keep the rig frame when an actor the rig did not create is sent a frame', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();
    const persisted = rig.actorRef.getPersistedSnapshot();
    rig.actorRef.stop();
    const restored = createActor(rig.actorRef.logic, { snapshot: persisted }).start();

    restored.send({ type: 'setRenderFrame', renderFrame: frameAt(16) });

    expect(restored.getSnapshot().context.renderFrame).toEqual(frameAt(16));
    expect(rig.renderFrame).toEqual(frameAt(1));
    restored.stop();
    rig.dispose();
  });

  it('should not send its own actor a frame after the actor errored', () => {
    const rejected: string[] = [];
    let fail = false;
    const rig = createThreeCameraRig({
      initialView,
      onRejectedEvent(rejection) {
        rejected.push(rejection.event.type);
      },
      onUpdate() {
        if (fail) {
          fail = false;
          throw new Error('host failed');
        }
      },
    });
    const errors: unknown[] = [];
    rig.actorRef.subscribe({
      error(error) {
        errors.push(error);
      },
    });
    rig.actorRef.start();
    fail = true;
    rig.actorRef.send({ type: 'setViewport', viewport });

    rig.setRenderFrame(frameAt(4));

    expect(errors).toHaveLength(1);
    expect(rig.actorRef.getSnapshot().status).toBe('error');
    expect(rig.renderFrame).toEqual(frameAt(4));
    expect(rejected).toEqual([]);
    rig.dispose();
  });

  it.each([11, 23])(
    'should agree on the frame, the policy and the native cameras after seeded reentrant sequences (seed %i)',
    (initialSeed) => {
      let seed = initialSeed;
      // A linear congruential generator: the same seed replays the same sequences.
      const next = (count: number): number => {
        seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
        return Math.floor((seed / 2 ** 32) * count);
      };
      const frames = [frameAt(1), frameAt(2), frameAt(4, [1, 0, 0])];
      const policies = [undefined, { farPaddingVerticalSpans: 2 }, { farPaddingVerticalSpans: 5 }];
      const rigOperations: ReadonlyArray<(rig: Rig) => void> = [
        (rig) => {
          rig.setRenderFrame(frames[next(3)]!);
        },
        (rig) => {
          rig.setClipPlanes(policies[next(3)]);
        },
      ];
      const operations: ReadonlyArray<(rig: Rig) => void> = [
        ...rigOperations,
        (rig) => {
          rig.actorRef.send({ type: 'setRenderFrame', renderFrame: frames[next(3)]! });
        },
        (rig) => {
          rig.actorRef.send({ type: 'setClipPolicy', clipPolicy: policies[next(3)] });
        },
        (rig) => {
          rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: [30, 45, 60][next(3)]! });
        },
      ];
      const pickSome = (count: number): Array<(rig: Rig) => void> =>
        Array.from({ length: count }, () => operations[next(operations.length)]!);
      for (let run = 0; run < 400; run += 1) {
        let inside: Array<(rig: Rig) => void> = [];
        const rig = createThreeCameraRig({
          initialView,
          onUpdate() {
            const reentrant = inside;
            inside = [];
            for (const operation of reentrant) {
              operation(rig);
            }
          },
        });
        for (let before = next(2); before > 0; before -= 1) {
          rigOperations[next(2)]!(rig);
        }
        inside = next(10) < 3 ? pickSome(1 + next(2)) : [];
        rig.actorRef.start();
        for (let step = 1 + next(4); step > 0; step -= 1) {
          const [operation] = pickSome(1);
          inside = next(10) < 4 ? pickSome(1 + next(3)) : [];
          operation!(rig);
          inside = [];
        }
        expectAgreement(rig);
        rig.dispose();
      }
    },
  );
});

describe('createThreeCameraRig following a given actor', () => {
  const startGiven = () => createActor(cameraMachine, { input: { initialView } }).start();

  it('should present the given actor only while connected and never stop it', () => {
    const camera = startGiven();
    const updates: number[] = [];
    const rig = createThreeCameraRig({ actorRef: camera, onUpdate: (_, snapshot) => updates.push(snapshot.revision) });
    expect(rig.actorRef).toBe(camera);

    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 40 });
    expect(updates).toEqual([]);
    expect(rig.perspectiveCamera.fov).toBe(60);

    const disconnect = rig.connect();
    expect(updates).toEqual([1]);
    expect(rig.perspectiveCamera.fov).toBe(40);
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    expect(updates).toEqual([1, 2]);

    disconnect();
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 20 });
    expect(updates).toEqual([1, 2]);
    // An unfollowed rig still reads the actor as it is.
    expect(rig.readState().projection).toMatchObject({ kind: 'perspective', verticalFieldOfView: 20 });

    rig.dispose();
    expect(camera.getSnapshot().status).toBe('active');
    camera.stop();
  });

  it('should take the given actor frame and send it the rig frame once connected', () => {
    const camera = startGiven();
    camera.send({ type: 'setRenderFrame', renderFrame: frameAt(2) });
    const rig = createThreeCameraRig({ actorRef: camera });
    expect(rig.renderFrame).toEqual(frameAt(2));

    rig.setRenderFrame(frameAt(4));
    expect(camera.getSnapshot().context.renderFrame).toEqual(frameAt(2));
    const disconnect = rig.connect();
    expect(camera.getSnapshot().context.renderFrame).toEqual(frameAt(4));

    // A frame the actor takes in a pose becomes the rig's, presented with that pose.
    camera.send({ type: 'poseObserved', ...initialView, source: 'input', renderFrame: frameAt(8, [1, 0, 0]) });
    expect(rig.renderFrame).toEqual(frameAt(8, [1, 0, 0]));
    expectAgreement(rig);
    disconnect();
    camera.stop();
  });

  it('should connect once at a time', () => {
    const camera = startGiven();
    const updates: number[] = [];
    const rig = createThreeCameraRig({ actorRef: camera, onUpdate: (_, snapshot) => updates.push(snapshot.revision) });
    const first = rig.connect();
    const second = rig.connect();
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 40 });
    expect(updates).toEqual([0, 1]);
    second();
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    expect(updates).toEqual([0, 1, 2]);
    first();
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 20 });
    expect(updates).toEqual([0, 1, 2]);
    camera.stop();
  });
});
