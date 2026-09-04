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
const beginCameraViewInitialization = vi.fn();
let cameraViewRestoreIdentity: string | undefined = 'file-a';
const graphicsActor = {
  on: vi.fn((_type: string, listener: () => void) => {
    resetListener = listener;
    return { unsubscribe };
  }),
};

vi.mock('@react-three/fiber', () => ({ useThree: () => ({ size }) }));
vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => rig,
  useCameraViewInitialization: () => ({
    identity: cameraViewRestoreIdentity,
    begin: beginCameraViewInitialization,
  }),
  useGraphics: () => graphicsActor,
}));

describe('useCameraFraming portable camera events', () => {
  beforeEach(() => {
    send.mockClear();
    unsubscribe.mockClear();
    graphicsActor.on.mockClear();
    beginCameraViewInitialization.mockReset();
    beginCameraViewInitialization.mockReturnValue({ initialize: true });
    cameraViewRestoreIdentity = 'file-a';
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
    beginCameraViewInitialization.mockReturnValue({ initialize: true, cameraView });
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

  it('preserves the provider-owned view when the canvas framing hook remounts', () => {
    beginCameraViewInitialization.mockReturnValueOnce({ initialize: true }).mockReturnValue({ initialize: false });
    const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const first = renderHook(() => useCameraFraming({ geometryRadius: 4, geometryBounds: bounds }));
    first.unmount();
    send.mockClear();

    renderHook(() => useCameraFraming({ geometryRadius: 4, geometryBounds: bounds }));

    expect(send).toHaveBeenCalledWith({ type: 'setBounds', bounds: { min: [-2, -2, -2], max: [2, 2, 2] } });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'frame' }));
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'saveHome' }));
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
    expect(beginCameraViewInitialization).not.toHaveBeenCalled();
  });
});
