import { StrictMode, useLayoutEffect } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, ActorRefFrom } from 'xstate';
import type { ThreeCameraRig } from '@taucad/three/camera';
import type { RenderFrame } from '@taucad/spatial';
import {
  GraphicsProvider,
  useCameraRig,
  useGraphicsCamera,
  useRenderFrame,
  useRenderFrameRetarget,
  useSetRenderFrame,
} from '#hooks/use-graphics.jsx';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import { getGraphicsCameraState } from '#graphics/graphics-camera.js';
import { graphicsMachine, selectGraphicsFramed, selectGraphicsFraming } from '#machines/graphics.machine.js';
import type { FramingPendingPose } from '#machines/framing.machine.js';

const actors: Array<Actor<typeof graphicsMachine>> = [];

const createGraphicsActor = (camera?: Partial<CameraOwnedSettings>) => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: { camera } },
  );
  actor.start();
  actors.push(actor);
  return actor;
};

function RigProbe({ onRig }: { readonly onRig: (rig: ThreeCameraRig) => void }): undefined {
  const rig = useCameraRig();
  useLayoutEffect(() => {
    onRig(rig);
  }, [onRig, rig]);
  return undefined;
}

/** What the view's framing holds: the entry it frames, whether it is framed, and the pose pending for the entry. */
const framingOf = (graphicsActor: Actor<typeof graphicsMachine>) => {
  const snapshot = graphicsActor.getSnapshot();
  const { context } = selectGraphicsFraming(snapshot).getSnapshot();
  return {
    identity: context.identity,
    framed: selectGraphicsFramed(snapshot),
    pendingPose: (context as { pendingPose?: FramingPendingPose }).pendingPose?.pose,
  };
};

const measured = {
  type: 'geometryBoundsMeasured',
  key: 'a',
  bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  radius: Math.sqrt(3),
} as const;

function RenderFrameProbe({
  onFrame,
  onSet,
  onRetarget,
}: {
  readonly onFrame: (frame: RenderFrame) => void;
  readonly onSet: (set: (frame: RenderFrame) => void) => void;
  readonly onRetarget: (frame: RenderFrame) => void;
}): undefined {
  const frame = useRenderFrame();
  const set = useSetRenderFrame();
  useRenderFrameRetarget(onRetarget);
  useLayoutEffect(() => {
    onFrame(frame);
    onSet(set);
  }, [frame, onFrame, onSet, set]);
  return undefined;
}

describe('GraphicsProvider camera rig ownership', () => {
  afterEach(() => {
    for (const actor of actors.splice(0)) {
      actor.stop();
    }
  });

  it('retains both native endpoint identities through repeated zero crossings', () => {
    const graphicsActor = createGraphicsActor();
    let rig: ThreeCameraRig | undefined;
    render(
      <StrictMode>
        <GraphicsProvider graphicsRef={graphicsActor}>
          <RigProbe
            onRig={(value) => {
              rig = value;
            }}
          />
        </GraphicsProvider>
      </StrictMode>,
    );

    expect(rig).toBeDefined();
    // A canvas's controls adapter connects the rig; this test stands in for it.
    const disconnect = rig!.connect();
    const perspective = rig!.perspectiveCamera;
    const orthographic = rig!.orthographicCamera;
    act(() => {
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    });
    expect(rig!.activeCamera).toBe(orthographic);
    expect(getGraphicsCameraState(graphicsActor)?.projection.kind).toBe('orthographic');
    act(() => {
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0.1 });
    });
    expect(rig!.activeCamera).toBe(perspective);
    act(() => {
      rig!.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    });
    expect(rig!.activeCamera).toBe(orthographic);
    expect(rig!.actorRef).toBe(graphicsActor.getSnapshot().context.cameraRef);
    disconnect();
  });

  /* The camera exists as long as its graphics actor: a reader outside the provider (the chat and command surfaces)
   * finds it before any canvas mounts, and with no graphics actor finds none. */
  it('should give readers outside the provider the graphics actor camera', () => {
    const graphicsActor = createGraphicsActor();
    const { result, rerender } = renderHook(
      ({ graphicsRef }: { graphicsRef: ActorRefFrom<typeof graphicsMachine> | undefined }) =>
        useGraphicsCamera(graphicsRef),
      { initialProps: { graphicsRef: undefined as ActorRefFrom<typeof graphicsMachine> | undefined } },
    );
    expect(result.current).toBeUndefined();

    rerender({ graphicsRef: graphicsActor });

    expect(result.current).toBe(graphicsActor.getSnapshot().context.cameraRef);
  });

  /* Law 2: a graphics actor spawned without a camera seed presents the portable camera default. */
  it('builds the rig at the portable default when the host supplies no seed', () => {
    const graphicsActor = createGraphicsActor();
    let rig: ThreeCameraRig | undefined;
    render(
      <GraphicsProvider graphicsRef={graphicsActor}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );

    expect(rig?.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(60);
  });

  /* The field of view is a seed of the graphics actor, not a provider control: a re-rendered provider keeps the rig
   * and the live camera. */
  it('keeps the committed rig, seeded from the graphics input, when the provider re-renders', () => {
    const graphicsActor = createGraphicsActor({ cameraFovAngle: 45 });
    const rigs: ThreeCameraRig[] = [];
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={graphicsActor}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );

    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsActor} seed={{ camera: { cameraFovAngle: 20 } }}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );

    expect(rigs).toHaveLength(1);
    expect(rigs[0]?.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(45);
    // The rig presents the camera on construction, so the seed reaches the THREE camera too.
    expect(rigs[0]?.perspectiveCamera.fov).toBe(45);
  });

  /* Law 3: the camera's owner is the graphics actor, not this mount. A StrictMode double invoke
   * presents one rig, and unmounting the provider must not take the person's camera with it. */
  it('should present one rig in StrictMode and keep the camera past provider unmount', () => {
    const graphicsActor = createGraphicsActor();
    const rigs: ThreeCameraRig[] = [];
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <StrictMode>
        <GraphicsProvider graphicsRef={graphicsActor}>
          <RigProbe onRig={onRig} />
        </GraphicsProvider>
      </StrictMode>,
    );
    expect(rigs).toHaveLength(1);
    const stop = vi.spyOn(rigs[0]!.actorRef, 'stop');

    mounted.unmount();

    expect(stop).not.toHaveBeenCalled();
    expect(rigs[0]!.actorRef.getSnapshot().status).toBe('active');
    expect(getGraphicsCameraState(graphicsActor)).toBeDefined();

    act(() => {
      graphicsActor.stop();
    });

    expect(rigs[0]!.actorRef.getSnapshot().status).toBe('stopped');
  });

  it('should present a new rig when the graphics actor is replaced and stop the first camera with its actor', () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
    const rigs: ThreeCameraRig[] = [];
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={firstActor} seed={{ identity: 'file-a' }}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );
    const firstRig = rigs[0]!;
    const stop = vi.spyOn(firstRig.actorRef, 'stop');

    mounted.rerender(
      <GraphicsProvider graphicsRef={secondActor} seed={{ identity: 'file-a' }}>
        <RigProbe onRig={onRig} />
      </GraphicsProvider>,
    );

    expect(rigs).toHaveLength(2);
    expect(rigs[1]).not.toBe(firstRig);
    expect(rigs[1]!.actorRef).toBe(secondActor.getSnapshot().context.cameraRef);
    expect(stop).not.toHaveBeenCalled();
    expect(firstRig.actorRef.getSnapshot().status).toBe('active');

    act(() => {
      firstActor.stop();
    });

    expect(firstRig.actorRef.getSnapshot().status).toBe('stopped');
  });

  it('should frame each entry identity once without recreating the rig', () => {
    const cameraView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1,
    } as const;
    const graphicsActor = createGraphicsActor({ cameraView });
    let rig: ThreeCameraRig | undefined;
    const mounted = render(
      <GraphicsProvider graphicsRef={graphicsActor} seed={{ identity: 'file-a', camera: { cameraView } }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );
    const firstRig = rig;

    expect(rig!.actorRef.getSnapshot().context.view).toMatchObject(cameraView);
    expect(framingOf(graphicsActor)).toEqual({ identity: 'file-a', framed: false, pendingPose: cameraView });

    // The canvas measures the first geometry, which frames it and applies the pose.
    graphicsActor.send(measured);

    mounted.rerender(
      <GraphicsProvider
        graphicsRef={graphicsActor}
        seed={{ identity: 'file-a', camera: { cameraView: { ...cameraView, verticalSpan: 99 } } }}
      >
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );
    expect(rig).toBe(firstRig);
    expect(framingOf(graphicsActor)).toEqual({ identity: 'file-a', framed: true, pendingPose: undefined });

    // A seed that names no entry (a panel rendered before its entry path is known) is not a file switch.
    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsActor} seed={{ camera: {} }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );
    expect(framingOf(graphicsActor)).toEqual({ identity: 'file-a', framed: true, pendingPose: undefined });

    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsActor} seed={{ identity: 'file-b' }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );
    expect(rig).toBe(firstRig);
    expect(framingOf(graphicsActor)).toEqual({ identity: 'file-b', framed: false, pendingPose: undefined });
  });

  it('keeps sibling viewer camera views isolated', () => {
    const firstView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1,
    } as const;
    const secondView = {
      frameId: 'tau:root',
      target: [-3, -4, -5],
      direction: [0, 1, 0],
      up: [0, 0, 1],
      verticalSpan: 24,
      perspectiveZoom: 1,
    } as const;
    const firstActor = createGraphicsActor({ cameraView: firstView });
    const secondActor = createGraphicsActor({ cameraView: secondView });
    const rigs = new Map<string, ThreeCameraRig>();

    render(
      <>
        <GraphicsProvider graphicsRef={firstActor} seed={{ identity: 'first', camera: { cameraView: firstView } }}>
          <RigProbe onRig={(rig) => rigs.set('first', rig)} />
        </GraphicsProvider>
        <GraphicsProvider graphicsRef={secondActor} seed={{ identity: 'second', camera: { cameraView: secondView } }}>
          <RigProbe onRig={(rig) => rigs.set('second', rig)} />
        </GraphicsProvider>
      </>,
    );

    expect(rigs.get('first')).not.toBe(rigs.get('second'));
    expect(rigs.get('first')?.actorRef.getSnapshot().context.view).toMatchObject(firstView);
    expect(rigs.get('second')?.actorRef.getSnapshot().context.view).toMatchObject(secondView);
    expect(framingOf(firstActor).pendingPose).toEqual(firstView);
    expect(framingOf(secondActor).pendingPose).toEqual(secondView);
  });

  it('retargets one viewport scene and camera without changing its sibling', () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
    const frames = new Map<string, RenderFrame>();
    const setters = new Map<string, (frame: RenderFrame) => void>();
    const retargeted: RenderFrame[] = [];
    render(
      <>
        {[
          ['first', firstActor],
          ['second', secondActor],
        ].map(([id, actor]) => (
          <GraphicsProvider key={id as string} graphicsRef={actor as ActorRefFrom<typeof graphicsMachine>}>
            <RenderFrameProbe
              onFrame={(frame) => frames.set(id as string, frame)}
              onSet={(set) => setters.set(id as string, set)}
              onRetarget={(frame) => retargeted.push(frame)}
            />
          </GraphicsProvider>
        ))}
      </>,
    );
    const next: RenderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [1e12, -2e12, 3e12],
      metersPerRenderUnit: 1e9,
    };
    act(() => setters.get('first')?.(next));

    expect(frames.get('first')).toEqual(next);
    expect(frames.get('second')).toEqual({
      anchorFrameId: 'tau:root',
      originMeters: [0, 0, 0],
      metersPerRenderUnit: 1,
    });
    expect(retargeted).toContainEqual(next);
  });
});
