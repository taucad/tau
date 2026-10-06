import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, Vector3 } from 'three';
import { createCameraView } from '@taucad/camera';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { useCameraFraming } from '#components/geometry/graphics/three/use-camera-framing.js';

const send = vi.fn();
let fitListener: (() => void) | undefined;
let size = { width: 800, height: 600 };
const get = () => ({ size });
let liveRig: ThreeCameraRig | undefined;
const rig = {
  actorRef: {
    getSnapshot: () => ({
      context: {
        view: {
          target: [4, 5, 6],
          direction: [0, 0, 1],
          up: [0, 0, 1],
          verticalSpan: 20,
          viewport: { width: 1, height: 1, pixelRatio: 2 },
        },
      },
    }),
    send,
  },
};
const unsubscribe = vi.fn();
let framing = {
  identity: 'file-a' as string | undefined,
  pendingView: undefined as unknown,
  preserveOrientationOnFirstFrame: false,
  firstFrameView: undefined as unknown,
  initialized: false,
};
const graphicsActor = {
  on: vi.fn((_type: string, listener: () => void) => {
    fitListener = listener;
    return { unsubscribe };
  }),
};

vi.mock('@react-three/fiber', () => ({
  useThree: <T>(selector?: (state: { size: typeof size; get: typeof get }) => T) =>
    selector ? selector({ size, get }) : { size, get },
}));
vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => liveRig ?? rig,
  useViewCameraFraming: () => framing,
  useGraphics: () => graphicsActor,
}));

describe('useCameraFraming portable camera events', () => {
  beforeEach(() => {
    send.mockClear();
    unsubscribe.mockClear();
    graphicsActor.on.mockClear();
    framing = {
      identity: 'file-a',
      pendingView: undefined,
      preserveOrientationOnFirstFrame: false,
      firstFrameView: undefined,
      initialized: false,
    };
    fitListener = undefined;
    size = { width: 800, height: 600 };
  });

  afterEach(() => {
    liveRig?.dispose();
    liveRig = undefined;
  });

  it('frames the first real bounds and resolves a valid camera up', () => {
    const bounds = new Box3(new Vector3(-10, -5, -2), new Vector3(10, 5, 2));
    renderHook(() =>
      useCameraFraming({
        geometryRadius: 12,
        geometryBounds: bounds,
        stageOptions: { rotation: { side: 0, vertical: Math.PI / 2 } },
      }),
    );

    const setView = send.mock.calls.find(([event]) => event.type === 'setView')?.[0] as {
      direction: [number, number, number];
      up: [number, number, number];
    };
    expect(new Vector3(...setView.direction).cross(new Vector3(...setView.up)).lengthSq()).toBeGreaterThan(1e-8);
    expect(send).toHaveBeenCalledWith({ type: 'setBounds', bounds: { min: [-10, -5, -2], max: [10, 5, 2] } });
    expect(send).toHaveBeenLastCalledWith({ type: 'frame', margin: 0.1 });
    expect(framing.firstFrameView).toEqual(rig.actorRef.getSnapshot().context.view);
  });

  it('restores the saved canonical view after the configured framing', () => {
    const cameraView = {
      target: [8, 9, 10],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 7,
    } as const;
    framing.pendingView = cameraView;
    const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));

    renderHook(() => useCameraFraming({ geometryRadius: 4, geometryBounds: bounds }));

    const frameIndex = send.mock.calls.findIndex(([event]) => event.type === 'frame');
    const restoreIndex = send.mock.calls.findIndex(
      ([event]) => event.type === 'setView' && event.target === cameraView.target,
    );
    expect(frameIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeGreaterThan(frameIndex);
    expect(send.mock.calls[restoreIndex]?.[0]).toEqual({ type: 'setView', ...cameraView });
  });

  it('preserves the view-owned camera when the canvas framing hook remounts', () => {
    const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const first = renderHook(() => useCameraFraming({ geometryRadius: 4, geometryBounds: bounds }));
    expect(framing.initialized).toBe(true);
    first.unmount();
    send.mockClear();

    renderHook(() => useCameraFraming({ geometryRadius: 4, geometryBounds: bounds }));

    expect(send).toHaveBeenCalledWith({ type: 'setBounds', bounds: { min: [-2, -2, -2], max: [2, 2, 2] } });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'frame' }));
  });

  /* A file switch re-latches the session's framing record, so the next geometry is framed with the
   * configured angles again and the new entry's persisted pose is applied exactly once. */
  it('re-frames and applies the persisted pose once when the entry identity changes', () => {
    const cameraView = {
      target: [8, 9, 10],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 7,
    } as const;
    const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const hook = renderHook(
      (props: { radius: number }) => useCameraFraming({ geometryRadius: props.radius, geometryBounds: bounds }),
      { initialProps: { radius: 4 } },
    );
    send.mockClear();

    /* The registry mutates the session's framing record in place, so the object identity the effect
     * depends on does not change: the re-latch takes effect on the next geometry, which is the
     * ordering the design wants -- the old code re-framed the file that was leaving. */
    framing.identity = 'file-b';
    framing.pendingView = cameraView;
    framing.initialized = false;
    hook.rerender({ radius: 4.5 });

    expect(send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });
    expect(send).toHaveBeenLastCalledWith({ type: 'setView', ...cameraView });
    expect(framing.initialized).toBe(true);

    send.mockClear();
    hook.rerender({ radius: 9 });

    expect(send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setView', target: cameraView.target }));
  });

  it('should preserve the placed camera throughout repeated pane resizing', () => {
    liveRig = createThreeCameraRig({
      initialView: createCameraView({
        frameId: 'resize-test',
        requestedVerticalFieldOfView: 45,
        perspectiveZoom: 1,
        target: [0, 0, 0],
        direction: [1, -1, 1],
        up: [0, 0, 1],
        verticalSpan: 10,
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        viewport: { width: 800, height: 600, pixelRatio: 2 },
      }),
    });
    liveRig.actorRef.start();
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const hook = renderHook(() => useCameraFraming({ geometryRadius: 2, geometryBounds: bounds }));
    liveRig.actorRef.send({
      type: 'setView',
      target: [4, 5, 6],
      direction: [0, 1, 0],
      up: [0, 0, 1],
      verticalSpan: 20,
    });
    const placedView = liveRig.actorRef.getSnapshot().context.view;
    const frame = hook.result.current;

    for (const width of [700, 600, 400, 900, 1400, 800]) {
      size = { ...size, width };
      // ActorBridge owns viewport projection; framing must not change the placed camera.
      liveRig.actorRef.send({ type: 'setViewport', viewport: { ...size, pixelRatio: 2 } });
      hook.rerender();
      const resizedView = liveRig.actorRef.getSnapshot().context.view;
      expect(resizedView.target).toEqual(placedView.target);
      expect(resizedView.verticalSpan).toBe(placedView.verticalSpan);
      expect(resizedView.direction).toEqual(placedView.direction);
      expect(resizedView.up).toEqual(placedView.up);
      expect(hook.result.current).toBe(frame);
    }
    expect(graphicsActor.on).toHaveBeenCalledTimes(1);
  });

  it('should fit the latest viewport on request without resetting orientation', () => {
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const hook = renderHook(() => useCameraFraming({ geometryRadius: 2, geometryBounds: bounds }));
    send.mockClear();

    // No React rerender: the command must read the current R3F measurement.
    size = { width: 1400, height: 500 };
    act(() => fitListener?.());
    expect(send.mock.calls[0]).toEqual([
      { type: 'setViewport', viewport: { width: 1400, height: 500, pixelRatio: 2 } },
    ]);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setView' }));
    expect(send).not.toHaveBeenCalledWith({ type: 'reset' });
    expect(send).toHaveBeenLastCalledWith({ type: 'frame', margin: 0.1 });
    hook.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('publishes the actual canvas viewport before the first fit', () => {
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    renderHook(() => useCameraFraming({ geometryRadius: 2, geometryBounds: bounds }));
    expect(send.mock.calls[0]).toEqual([{ type: 'setViewport', viewport: { width: 800, height: 600, pixelRatio: 2 } }]);
    expect(send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });
  });

  it('does not frame empty geometry', () => {
    renderHook(() => useCameraFraming({ geometryRadius: 0, geometryBounds: new Box3() }));
    expect(send).not.toHaveBeenCalled();
    expect(framing.initialized).toBe(false);
  });
});
