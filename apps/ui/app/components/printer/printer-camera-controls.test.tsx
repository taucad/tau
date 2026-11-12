import type * as FiberModule from '@react-three/fiber';
import { render } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import type CameraControlsImpl from 'camera-controls';
import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCameraControlProps } from '@taucad/viewer/graphics/three/controls/camera-controls-feel';

type FrameEntry = { callback: (state: unknown, delta: number) => void; priority: number | undefined };
const root = vi.hoisted((): { state: unknown; frames: FrameEntry[] } => ({ state: {}, frames: [] }));

vi.mock('@react-three/fiber', async (importOriginal) => {
  const { useEffect } = await import('react');
  return {
    ...(await importOriginal<typeof FiberModule>()),
    useThree: (select: (state: unknown) => unknown) => select(root.state),
    useFrame(callback: (state: unknown, delta: number) => void, priority?: number) {
      useEffect(() => {
        const entry = { callback, priority };
        root.frames.push(entry);
        return () => {
          root.frames.splice(root.frames.indexOf(entry), 1);
        };
      }, [callback, priority]);
    },
  };
});

const { PrinterCameraControls } = await import('#components/printer/printer-camera-controls.js');

type StubRoot = {
  camera: PerspectiveCamera;
  gl: { domElement: HTMLElement };
  events: { connected: HTMLElement | undefined };
  invalidate: () => void;
  controls: unknown;
  set: (patch: Partial<StubRoot>) => void;
  get: () => StubRoot;
};

const createRoot = () => {
  const domElement = document.createElement('div');
  const state: StubRoot = {
    camera: new PerspectiveCamera(),
    gl: { domElement },
    events: { connected: undefined },
    invalidate: vi.fn(),
    controls: null,
    set(patch) {
      Object.assign(state, patch);
    },
    get: () => state,
  };
  root.state = state;
  return { state, domElement };
};

const feel = resolveCameraControlProps({ enablePan: true, enableZoom: true });

describe('PrinterCameraControls', () => {
  afterEach(() => {
    root.frames.length = 0;
  });

  it('installs one controls instance as R3F controls, steps it once per frame and hands it back on unmount', () => {
    const { state, domElement } = createRoot();
    const controls = createRef<CameraControlsImpl>();
    const view = render(
      <StrictMode>
        <PrinterCameraControls ref={controls} {...feel} />
      </StrictMode>,
    );
    expect(state.controls).toBe(controls.current);
    expect(Object.hasOwn(domElement.dataset, 'cameraControlsVersion')).toBe(true);
    expect(root.frames.map(({ priority }) => priority)).toEqual([-1]);
    const update = vi.spyOn(controls.current!, 'update');
    root.frames[0]?.callback(state, 1 / 60);
    expect(update.mock.calls).toEqual([[1 / 60]]);

    view.unmount();
    expect(state.controls).toBeNull();
    expect(Object.hasOwn(domElement.dataset, 'cameraControlsVersion')).toBe(false);
    expect(root.frames).toEqual([]);
  });

  it('reports a person-driven move and asks for a frame', () => {
    const { state } = createRoot();
    const controls = createRef<CameraControlsImpl>();
    const onControl = vi.fn();
    render(<PrinterCameraControls ref={controls} onControl={onControl} {...feel} />);
    controls.current?.dispatchEvent({ type: 'control' });
    expect(onControl).toHaveBeenCalledOnce();
    expect(state.invalidate).toHaveBeenCalled();
  });
});
