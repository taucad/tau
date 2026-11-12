import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic, setup, types } from 'xstate';
import type { Actor, ActorRefFrom } from 'xstate';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import {
  getGraphicsCameraState,
  latchViewCameraFraming,
  selectGraphicsCamera,
  selectGraphicsCameraFraming,
} from '#services/graphics-camera-registry.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { eventSchemas } from '#machines/machine-schemas.js';

const actors: Array<Actor<typeof graphicsMachine>> = [];

const createGraphicsActor = (camera?: Partial<CameraOwnedSettings>): Actor<typeof graphicsMachine> => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: { camera } },
  );
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

describe('the view camera as a graphics child', () => {
  afterEach(() => {
    for (const actor of actors.splice(0)) {
      actor.stop();
    }
  });

  it('should seed the camera once, from the graphics input, and arm its pose for the first framing', () => {
    const graphicsRef = createGraphicsActor({ cameraFovAngle: 42, cameraView });
    const snapshot = graphicsRef.getSnapshot();
    const camera = selectGraphicsCamera(snapshot);

    expect(camera.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(42);
    expect(camera.getSnapshot().context.view).toMatchObject(cameraView);
    expect(selectGraphicsCameraFraming(snapshot).pendingView).toEqual(cameraView);
    expect(getGraphicsCameraState(graphicsRef)?.target).toEqual(cameraView.target);
  });

  it('should keep a consumed framing record until the entry identity changes', () => {
    const graphicsRef = createGraphicsActor({ cameraView });
    const framing = selectGraphicsCameraFraming(graphicsRef.getSnapshot());
    latchViewCameraFraming(framing, { identity: 'part.ts', camera: { cameraView } });
    framing.initialized = true;

    latchViewCameraFraming(framing, { identity: 'part.ts', camera: { cameraView } });

    expect(framing.initialized).toBe(true);
  });

  it('should re-latch framing on a new entry identity while the live field of view survives', () => {
    const graphicsRef = createGraphicsActor({ cameraFovAngle: 42, cameraView });
    const snapshot = graphicsRef.getSnapshot();
    const framing = selectGraphicsCameraFraming(snapshot);
    const camera = selectGraphicsCamera(snapshot);
    latchViewCameraFraming(framing, { identity: 'part.ts', camera: { cameraView } });
    framing.initialized = true;
    framing.preserveOrientationOnFirstFrame = true;
    framing.firstFrameView = cameraView;
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 33 });

    latchViewCameraFraming(framing, { identity: 'bracket.ts', camera: {} });

    expect(framing).toEqual({
      identity: 'bracket.ts',
      pendingView: undefined,
      preserveOrientationOnFirstFrame: false,
      firstFrameView: undefined,
      initialized: false,
    });
    expect(camera.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(33);
  });

  /* A viewer panel can render before its entry path is known, and that is not a file switch: the
   * live pose stays and the persisted one is not re-armed behind it. */
  it('should ignore a re-latch that names no entry', () => {
    const graphicsRef = createGraphicsActor({ cameraView });
    const framing = selectGraphicsCameraFraming(graphicsRef.getSnapshot());
    latchViewCameraFraming(framing, { identity: 'part.ts', camera: { cameraView } });
    framing.initialized = true;

    latchViewCameraFraming(framing, { identity: undefined, camera: {} });

    expect(framing).toEqual({
      identity: 'part.ts',
      pendingView: cameraView,
      preserveOrientationOnFirstFrame: false,
      firstFrameView: undefined,
      initialized: true,
    });
  });

  it('should stop the camera with its graphics actor', () => {
    const graphicsRef = createGraphicsActor();
    const camera = selectGraphicsCamera(graphicsRef.getSnapshot());
    expect(camera.getSnapshot().status).toBe('active');

    graphicsRef.stop();

    expect(camera.getSnapshot().status).toBe('stopped');
    expect(getGraphicsCameraState(undefined)).toBeUndefined();
  });

  /* A project stops its views with `stopChild`, not by stopping a root actor, so the release rule is
   * pinned on the path production takes. */
  it('should stop the camera of a graphics actor stopped as a spawned child', () => {
    const parentMachine = setup({
      schemas: {
        context: types<{ child: ActorRefFrom<typeof graphicsMachine> }>(),
        events: eventSchemas<{ type: 'destroyView' }>(),
      },
      actors: {
        graphics: graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      },
    }).createMachine({
      context: ({ spawn, actors }) => ({ child: spawn(actors.graphics, { id: 'graphics-view-child', input: {} }) }),
      on: {
        destroyView: ({ context }, enq) => {
          enq.stop(context.child);
          return {};
        },
      },
    });
    const parent = createActor(parentMachine);
    parent.start();
    const camera = selectGraphicsCamera(parent.getSnapshot().context.child.getSnapshot());
    expect(camera.getSnapshot().status).toBe('active');

    parent.send({ type: 'destroyView' });

    expect(camera.getSnapshot().status).toBe('stopped');
    parent.stop();
  });
});
