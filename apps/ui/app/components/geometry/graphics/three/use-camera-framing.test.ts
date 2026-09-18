import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, Vector3 } from 'three';
import { useCameraFraming } from '#components/geometry/graphics/three/use-camera-framing.js';

const send = vi.fn();
let resetListener: (() => void) | undefined;
const size = { width: 800, height: 600 };
const rig = {
  actorRef: {
    getSnapshot: () => ({
      context: {
        view: {
          target: [4, 5, 6],
          direction: [0, 0, 1],
          up: [0, 0, 1],
          verticalSpan: 20,
        },
      },
    }),
    send,
  },
};
const unsubscribe = vi.fn();
let framing = { identity: 'file-a' as string | undefined, pendingView: undefined as unknown, initialized: false };
const graphicsActor = {
  on: vi.fn((_type: string, listener: () => void) => {
    resetListener = listener;
    return { unsubscribe };
  }),
};

vi.mock('@react-three/fiber', () => ({ useThree: () => ({ size }) }));
vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => rig,
  useViewCameraFraming: () => framing,
  useGraphics: () => graphicsActor,
}));

describe('useCameraFraming portable camera events', () => {
  beforeEach(() => {
    send.mockClear();
    unsubscribe.mockClear();
    graphicsActor.on.mockClear();
    framing = { identity: 'file-a', pendingView: undefined, initialized: false };
    resetListener = undefined;
    size.width = 800;
    size.height = 600;
  });

  it('frames the first real bounds, resolves a valid camera up, and saves home', () => {
    const bounds = new Box3(new Vector3(-10, -5, -2), new Vector3(10, 5, 2));
    renderHook(() =>
      useCameraFraming({
        geometryRadius: 12,
        geometryBounds: bounds,
        stageOptions: { rotation: { side: 0, vertical: Math.PI / 2 } },
      }),
    );

    const setView = send.mock.calls[0]?.[0] as { direction: [number, number, number]; up: [number, number, number] };
    expect(new Vector3(...setView.direction).cross(new Vector3(...setView.up)).lengthSq()).toBeGreaterThan(1e-8);
    expect(send).toHaveBeenCalledWith({ type: 'setBounds', bounds: { min: [-10, -5, -2], max: [10, 5, 2] } });
    expect(send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });
    expect(send).toHaveBeenLastCalledWith({ type: 'saveHome' });
  });

  it('restores the saved canonical view after capturing the configured home', () => {
    const cameraView = {
      target: [8, 9, 10],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 7,
    } as const;
    framing.pendingView = cameraView;
    const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));

    renderHook(() => useCameraFraming({ geometryRadius: 4, geometryBounds: bounds }));

    const saveHomeIndex = send.mock.calls.findIndex(([event]) => event.type === 'saveHome');
    const restoreIndex = send.mock.calls.findIndex(
      ([event]) => event.type === 'setView' && event.target === cameraView.target,
    );
    expect(saveHomeIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeGreaterThan(saveHomeIndex);
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
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'saveHome' }));
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

    expect(send).toHaveBeenCalledWith({ type: 'saveHome' });
    expect(send).toHaveBeenLastCalledWith({ type: 'setView', ...cameraView });
    expect(framing.initialized).toBe(true);

    send.mockClear();
    hook.rerender({ radius: 9 });

    expect(send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setView', target: cameraView.target }));
    expect(send).not.toHaveBeenCalledWith({ type: 'saveHome' });
  });

  it('preserves orientation on aspect-only reframing and routes reset to the camera actor', () => {
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const hook = renderHook(() => useCameraFraming({ geometryRadius: 2, geometryBounds: bounds }));
    send.mockClear();

    size.width = 1400;
    hook.rerender();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setView' }));
    expect(send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });

    act(() => resetListener?.());
    expect(send).toHaveBeenLastCalledWith({ type: 'reset' });
    hook.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not frame empty geometry', () => {
    renderHook(() => useCameraFraming({ geometryRadius: 0, geometryBounds: new Box3() }));
    expect(send).not.toHaveBeenCalled();
    expect(framing.initialized).toBe(false);
  });
});
