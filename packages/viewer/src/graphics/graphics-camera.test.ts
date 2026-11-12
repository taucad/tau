import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic, setup, types } from 'xstate';
import type { Actor, ActorRefFrom } from 'xstate';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import { getGraphicsCameraState, selectCameraViewDirection, selectGraphicsCamera } from '#graphics/graphics-camera.js';
import {
  graphicsMachine,
  selectGraphicsFramed,
  selectGraphicsFraming,
  selectGraphicsFramingIdentity,
} from '#machines/graphics.machine.js';
import type { GraphicsEvent } from '#machines/graphics.machine.js';
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

/* A measured cube about `center`, whose corners lie `half` from it on each axis. */
const measured = (key: string, center = 0, half = 1): Extract<GraphicsEvent, { type: 'geometryBoundsMeasured' }> => ({
  type: 'geometryBoundsMeasured',
  key,
  bounds: { min: [center - half, center - half, center - half], max: [center + half, center + half, center + half] },
  radius: half * Math.sqrt(3),
});

describe('the view camera as a graphics child', () => {
  afterEach(() => {
    for (const actor of actors.splice(0)) {
      actor.stop();
    }
  });

  it('should seed the camera once, from the graphics input, and hold its pose for the first framing', () => {
    const graphicsRef = createGraphicsActor({ cameraFovAngle: 42, cameraView });
    const snapshot = graphicsRef.getSnapshot();
    const camera = selectGraphicsCamera(snapshot);
    const framing = selectGraphicsFraming(snapshot).getSnapshot();

    expect(camera.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(42);
    expect(camera.getSnapshot().context.view).toMatchObject(cameraView);
    expect(framing.value).toBe('awaitingGeometry');
    expect(framing.context).toMatchObject({ pendingPose: { pose: cameraView } });
    expect(getGraphicsCameraState(graphicsRef)?.target).toEqual(cameraView.target);
    expect(selectCameraViewDirection(camera)).toEqual(camera.getSnapshot().context.view.direction);
  });

  it('should keep the framed entry until the entry identity changes', () => {
    const graphicsRef = createGraphicsActor({ cameraView });
    graphicsRef.send({ type: 'entryChanged', identity: 'part.ts', pendingPose: { requestId: 'r', pose: cameraView } });
    graphicsRef.send(measured('a'));
    expect(selectGraphicsFramed(graphicsRef.getSnapshot())).toBe(true);

    graphicsRef.send({ type: 'entryChanged', identity: 'part.ts', pendingPose: { requestId: 'r', pose: cameraView } });

    expect(selectGraphicsFramed(graphicsRef.getSnapshot())).toBe(true);
    expect(selectGraphicsFramingIdentity(graphicsRef.getSnapshot())).toBe('part.ts');
  });

  it('should frame a new entry again while the live field of view survives', () => {
    const graphicsRef = createGraphicsActor({ cameraFovAngle: 42, cameraView });
    const camera = selectGraphicsCamera(graphicsRef.getSnapshot());
    graphicsRef.send({ type: 'entryChanged', identity: 'part.ts' });
    graphicsRef.send(measured('a'));
    camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 33 });

    graphicsRef.send({ type: 'entryChanged', identity: 'bracket.ts' });

    expect(selectGraphicsFramed(graphicsRef.getSnapshot())).toBe(false);
    expect(selectGraphicsFramingIdentity(graphicsRef.getSnapshot())).toBe('bracket.ts');
    expect(camera.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(33);
  });

  it('should frame the first measurement, then apply the held pose over it', () => {
    const graphicsRef = createGraphicsActor({ cameraView });
    const camera = selectGraphicsCamera(graphicsRef.getSnapshot());
    const sources: string[] = [];
    camera.on('viewChanged', (event) => sources.push(event.source));

    graphicsRef.send(measured('a'));

    expect(sources).toEqual(['framing', 'persisted']);
    expect(camera.getSnapshot().context.view).toMatchObject({ target: cameraView.target, verticalSpan: 12 });
  });

  it('should anchor the render frame on a new presentation only', () => {
    const graphicsRef = createGraphicsActor();
    const camera = selectGraphicsCamera(graphicsRef.getSnapshot());

    graphicsRef.send(measured('a', 1));
    const anchored = camera.getSnapshot().context.renderFrame;
    graphicsRef.send(measured('a', 1.05));

    expect(anchored).toMatchObject({ anchorFrameId: 'tau:root', originMeters: [1, 1, 1] });
    expect(camera.getSnapshot().context.renderFrame).toBe(anchored);

    graphicsRef.send(measured('b', 4));

    expect(camera.getSnapshot().context.renderFrame.originMeters).toEqual([4, 4, 4]);
  });

  it('should fit the camera on Fit view without turning it', () => {
    const graphicsRef = createGraphicsActor();
    const camera = selectGraphicsCamera(graphicsRef.getSnapshot());
    graphicsRef.send(measured('a'));
    const { direction } = camera.getSnapshot().context.view;

    graphicsRef.send({ type: 'fitView' });

    expect(camera.getSnapshot().context.lastChange.source).toBe('fit');
    expect(camera.getSnapshot().context.view.direction).toEqual(direction);
  });

  it('should stop the camera with its graphics actor', () => {
    const graphicsRef = createGraphicsActor();
    const camera = selectGraphicsCamera(graphicsRef.getSnapshot());
    expect(camera.getSnapshot().status).toBe('active');

    graphicsRef.stop();

    expect(camera.getSnapshot().status).toBe('stopped');
    expect(selectGraphicsFraming(graphicsRef.getSnapshot()).getSnapshot().status).toBe('stopped');
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
