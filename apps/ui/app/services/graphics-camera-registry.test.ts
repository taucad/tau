import { afterEach, describe, expect, it } from 'vitest';
import { createActor, enqueueActions, fromPromise, setup } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import {
  acquireViewCameraSession,
  getGraphicsCameraState,
  hasGraphicsCameraRig,
} from '#services/graphics-camera-registry.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const actors: Array<ActorRefFrom<typeof graphicsMachine>> = [];

const createGraphicsActor = (): ActorRefFrom<typeof graphicsMachine> => {
  const actor = createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: {},
  });
  actor.start();
  actors.push(actor);
  return actor;
};

const cameraView = {
  frameId: 'tau:root',
  target: [3, 4, 5],
  direction: [1, 0, 0],
  up: [0, 0, 1],
  verticalSpan: 12,
  perspectiveZoom: 1,
} as const;

describe('ViewCameraSession ownership', () => {
  afterEach(() => {
    for (const actor of actors.splice(0)) {
      actor.stop();
    }
  });

  it('should build the camera once per graphics actor and ignore every later seed', () => {
    const graphicsRef = createGraphicsActor();

    const session = acquireViewCameraSession(graphicsRef, {
      identity: 'part.ts',
      camera: { cameraFovAngle: 42, cameraView },
    });
    const second = acquireViewCameraSession(graphicsRef, {
      identity: 'part.ts',
      camera: { cameraFovAngle: 12, cameraView: { ...cameraView, verticalSpan: 99 } },
    });

    expect(second).toBe(session);
    expect(session.rig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(42);
    expect(session.rig.actorRef.getSnapshot().context.view).toMatchObject(cameraView);
    expect(session.framing.pendingView).toEqual(cameraView);
  });

  it('should keep a consumed framing record until the entry identity changes', () => {
    const graphicsRef = createGraphicsActor();
    const session = acquireViewCameraSession(graphicsRef, { identity: 'part.ts', camera: { cameraView } });
    session.framing.initialized = true;

    acquireViewCameraSession(graphicsRef, { identity: 'part.ts', camera: { cameraView } });

    expect(session.framing.initialized).toBe(true);
  });

  it('should re-latch framing on a new entry identity while the live field of view survives', () => {
    const graphicsRef = createGraphicsActor();
    const session = acquireViewCameraSession(graphicsRef, {
      identity: 'part.ts',
      camera: { cameraFovAngle: 42, cameraView },
    });
    session.framing.initialized = true;
    session.rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 33 });

    acquireViewCameraSession(graphicsRef, { identity: 'bracket.ts', camera: {} });

    expect(session.framing).toEqual({ identity: 'bracket.ts', pendingView: undefined, initialized: false });
    expect(session.rig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(33);
  });

  /* A viewer panel can render before its entry path is known, and that is not a file switch: the
   * live pose stays and the persisted one is not re-armed behind it. */
  it('should ignore a re-latch that names no entry', () => {
    const graphicsRef = createGraphicsActor();
    const session = acquireViewCameraSession(graphicsRef, { identity: 'part.ts', camera: { cameraView } });
    session.framing.initialized = true;

    acquireViewCameraSession(graphicsRef, { identity: undefined, camera: {} });

    expect(session.framing).toEqual({ identity: 'part.ts', pendingView: cameraView, initialized: true });
  });

  it('should release the session when its graphics actor completes', () => {
    const graphicsRef = createGraphicsActor();
    const session = acquireViewCameraSession(graphicsRef, { identity: 'part.ts', camera: {} });
    expect(hasGraphicsCameraRig(graphicsRef)).toBe(true);
    expect(getGraphicsCameraState(graphicsRef)).toBeDefined();

    graphicsRef.stop();

    expect(hasGraphicsCameraRig(graphicsRef)).toBe(false);
    expect(getGraphicsCameraState(graphicsRef)).toBeUndefined();
    expect(session.rig.actorRef.getSnapshot().status).toBe('stopped');
  });

  /* A project stops its views with `stopChild`, not by stopping a root actor, so the release rule is
   * pinned on the path production takes. */
  it('should release the session of a graphics actor stopped as a spawned child', () => {
    const parentMachine = setup({
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState's `types` slot is a phantom value; there is nothing to annotate.
      types: {} as {
        context: { child: ActorRefFrom<typeof graphicsMachine> };
        events: { type: 'destroyView' };
      },
      actors: { graphics: graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }) },
    }).createMachine({
      context: ({ spawn }) => ({ child: spawn('graphics', { id: 'graphics-view-child', input: {} }) }),
      on: {
        destroyView: {
          actions: enqueueActions(({ enqueue, context }) => {
            enqueue.stopChild(context.child);
          }),
        },
      },
    });
    const parent = createActor(parentMachine);
    parent.start();
    const graphicsRef = parent.getSnapshot().context.child;
    const session = acquireViewCameraSession(graphicsRef, { identity: 'part.ts', camera: {} });
    expect(hasGraphicsCameraRig(graphicsRef)).toBe(true);

    parent.send({ type: 'destroyView' });

    expect(hasGraphicsCameraRig(graphicsRef)).toBe(false);
    expect(session.rig.actorRef.getSnapshot().status).toBe('stopped');
    parent.stop();
  });
});
