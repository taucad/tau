import { StrictMode, useLayoutEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ThreeCameraRig } from '@taucad/three/camera';
import type { RenderFrame } from '@taucad/spatial';
import {
  GraphicsProvider,
  useCameraRig,
  useCameraViewInitialization,
  useRenderFrame,
  useRenderFrameRetarget,
  useSetRenderFrame,
} from '#hooks/use-graphics.js';
import type { CameraViewInitialization } from '#hooks/use-graphics.js';
import { getGraphicsCameraState, hasGraphicsCameraRig } from '#services/graphics-camera-registry.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const actors: Array<ActorRefFrom<typeof graphicsMachine>> = [];

const createGraphicsActor = () => {
  const actor = createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: {},
  });
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

function InitializationProbe({
  onBegin,
}: {
  readonly onBegin: (begin: () => CameraViewInitialization) => void;
}): undefined {
  const initialization = useCameraViewInitialization();
  useLayoutEffect(() => {
    onBegin(initialization.begin);
  }, [initialization, onBegin]);
  return undefined;
}

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
    expect(hasGraphicsCameraRig(graphicsActor)).toBe(true);
  });

  it('constructs a card camera at its requested field of view before the first frame', () => {
    const graphicsActor = createGraphicsActor();
    let rig: ThreeCameraRig | undefined;
    render(
      <GraphicsProvider graphicsRef={graphicsActor} initialVerticalFieldOfView={45}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
      </GraphicsProvider>,
    );

    expect(rig?.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(45);
    expect(rig?.perspectiveCamera.fov).toBe(45);
  });

  it('unregisters and stops the committed rig after StrictMode unmount', async () => {
    const graphicsActor = createGraphicsActor();
    let rig: ThreeCameraRig | undefined;
    let stop: ReturnType<typeof vi.spyOn> | undefined;
    const mounted = render(
      <StrictMode>
        <GraphicsProvider graphicsRef={graphicsActor}>
          <RigProbe
            onRig={(value) => {
              rig = value;
              stop ??= vi.spyOn(value.actorRef, 'stop');
            }}
          />
        </GraphicsProvider>
      </StrictMode>,
    );

    mounted.unmount();
    await waitFor(() => {
      expect(hasGraphicsCameraRig(graphicsActor)).toBe(false);
    });
    expect(stop).toHaveBeenCalled();
  });

  it('isolates graphics-actor replacement and stops the previous rig', async () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
    const rigs: ThreeCameraRig[] = [];
    let begin: (() => CameraViewInitialization) | undefined;
    const onRig = (rig: ThreeCameraRig): void => {
      if (rigs.at(-1) !== rig) {
        rigs.push(rig);
      }
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={firstActor} cameraViewRestore={{ identity: 'file-a' }}>
        <RigProbe onRig={onRig} />
        <InitializationProbe
          onBegin={(value) => {
            begin = value;
          }}
        />
      </GraphicsProvider>,
    );
    const firstRig = rigs[0]!;
    const stop = vi.spyOn(firstRig.actorRef, 'stop');
    expect(begin?.()).toEqual({ initialize: true, cameraView: undefined });

    mounted.rerender(
      <GraphicsProvider graphicsRef={secondActor} cameraViewRestore={{ identity: 'file-a' }}>
        <RigProbe onRig={onRig} />
        <InitializationProbe
          onBegin={(value) => {
            begin = value;
          }}
        />
      </GraphicsProvider>,
    );
    await waitFor(() => {
      expect(stop).toHaveBeenCalledOnce();
    });

    expect(rigs).toHaveLength(2);
    expect(rigs[1]).not.toBe(firstRig);
    expect(hasGraphicsCameraRig(firstActor)).toBe(false);
    expect(hasGraphicsCameraRig(secondActor)).toBe(true);
    expect(begin?.()).toEqual({ initialize: true, cameraView: undefined });
  });

  it('consumes one saved view per entry identity without recreating the rig', () => {
    const graphicsActor = createGraphicsActor();
    const cameraView = {
      frameId: 'tau:root',
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1,
    } as const;
    let begin: (() => CameraViewInitialization) | undefined;
    let rig: ThreeCameraRig | undefined;
    const onBegin = (value: () => CameraViewInitialization): void => {
      begin = value;
    };
    const mounted = render(
      <GraphicsProvider graphicsRef={graphicsActor} cameraViewRestore={{ identity: 'file-a', cameraView }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
        <InitializationProbe onBegin={onBegin} />
      </GraphicsProvider>,
    );
    const firstRig = rig;

    expect(rig!.actorRef.getSnapshot().context.view).toMatchObject(cameraView);
    expect(begin?.()).toEqual({ initialize: true, cameraView });
    expect(begin?.()).toEqual({ initialize: false });

    mounted.rerender(
      <GraphicsProvider
        graphicsRef={graphicsActor}
        cameraViewRestore={{ identity: 'file-a', cameraView: { ...cameraView, verticalSpan: 99 } }}
      >
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
        <InitializationProbe onBegin={onBegin} />
      </GraphicsProvider>,
    );
    expect(rig).toBe(firstRig);
    expect(begin?.()).toEqual({ initialize: false });

    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsActor} cameraViewRestore={{ identity: 'file-b' }}>
        <RigProbe
          onRig={(value) => {
            rig = value;
          }}
        />
        <InitializationProbe onBegin={onBegin} />
      </GraphicsProvider>,
    );
    expect(rig).toBe(firstRig);
    expect(begin?.()).toEqual({ initialize: true, cameraView: undefined });
  });

  it('keeps sibling viewer camera views isolated', () => {
    const firstActor = createGraphicsActor();
    const secondActor = createGraphicsActor();
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
    const rigs = new Map<string, ThreeCameraRig>();
    const initializers = new Map<string, () => CameraViewInitialization>();

    render(
      <>
        <GraphicsProvider graphicsRef={firstActor} cameraViewRestore={{ identity: 'first', cameraView: firstView }}>
          <RigProbe onRig={(rig) => rigs.set('first', rig)} />
          <InitializationProbe onBegin={(begin) => initializers.set('first', begin)} />
        </GraphicsProvider>
        <GraphicsProvider graphicsRef={secondActor} cameraViewRestore={{ identity: 'second', cameraView: secondView }}>
          <RigProbe onRig={(rig) => rigs.set('second', rig)} />
          <InitializationProbe onBegin={(begin) => initializers.set('second', begin)} />
        </GraphicsProvider>
      </>,
    );

    expect(rigs.get('first')).not.toBe(rigs.get('second'));
    expect(rigs.get('first')?.actorRef.getSnapshot().context.view).toMatchObject(firstView);
    expect(rigs.get('second')?.actorRef.getSnapshot().context.view).toMatchObject(secondView);
    expect(initializers.get('first')?.()).toEqual({ initialize: true, cameraView: firstView });
    expect(initializers.get('second')?.()).toEqual({ initialize: true, cameraView: secondView });
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
