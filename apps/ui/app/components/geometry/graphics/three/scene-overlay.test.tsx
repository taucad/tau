import { useLayoutEffect } from 'react';
import { WebGLRenderTarget } from 'three';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const renderScene = vi.fn();
  const mainScene = { traverse: vi.fn() };
  const gl = { autoClear: true, clearDepth: vi.fn(), render: renderScene };
  const camera = { isCamera: true };
  let frame: ((state: { gl: typeof gl; scene: typeof mainScene; camera: typeof camera }) => void) | undefined;
  let framePriority: number | undefined;
  const frames: Array<{ callback: NonNullable<typeof frame>; priority?: number }> = [];
  return {
    camera,
    gl,
    mainScene,
    renderScene,
    getFrame: () => frame,
    getFramePriority: () => framePriority,
    frames,
    setFrame: (next: typeof frame, priority?: number) => {
      frame = next;
      framePriority = priority;
      if (next) {
        frames.push({ callback: next, priority });
      }
    },
  };
});

vi.mock('@react-three/fiber', () => ({
  createPortal: (children: React.ReactNode) => <div>{children}</div>,
  useFrame: (callback: Parameters<typeof mocks.setFrame>[0], priority: number) => {
    mocks.setFrame(callback, priority);
  },
  useThree: (selector: (state: { scene: typeof mocks.mainScene }) => unknown) => selector({ scene: mocks.mainScene }),
}));

describe('SceneOverlay depth ownership', () => {
  beforeEach(() => {
    mocks.gl.autoClear = true;
    mocks.gl.clearDepth.mockClear();
    mocks.mainScene.traverse.mockClear();
    mocks.renderScene.mockClear();
    mocks.setFrame(undefined);
    mocks.frames.length = 0;
  });

  it('does not register a positive-priority frame owner when overlays are disabled', async () => {
    const { OverlayDepthProvider, SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');
    render(
      <OverlayDepthProvider>
        <SceneOverlay overlayActive={false}>grid</SceneOverlay>
      </OverlayDepthProvider>,
    );
    expect(mocks.getFramePriority()).toBe(0);
    mocks.getFrame()?.({ gl: mocks.gl, scene: mocks.mainScene, camera: mocks.camera });
    expect(mocks.renderScene).not.toHaveBeenCalled();
  });

  it('restores authoritative post depth then renders only the overlay scene once', async () => {
    const { OverlayDepthProvider, SceneOverlay, useOverlayDepthRestore } =
      await import('#components/geometry/graphics/three/scene-overlay.js');
    const order: string[] = [];
    const targets: unknown[] = [];
    const Register = (): React.ReactNode => {
      useOverlayDepthRestore((target) => {
        order.push('depth');
        targets.push(target);
      });
      return null;
    };
    mocks.renderScene.mockImplementation(() => order.push('overlay'));

    render(
      <OverlayDepthProvider>
        <Register />
        <SceneOverlay overlayActive>grid</SceneOverlay>
      </OverlayDepthProvider>,
    );
    mocks.getFrame()?.({ gl: mocks.gl, scene: mocks.mainScene, camera: mocks.camera });

    expect(order).toEqual(['depth', 'overlay']);
    // An overlay draws on the canvas, so it asks for the frame's depth there and nowhere else.
    expect(targets).toEqual([undefined]);
    expect(mocks.renderScene).toHaveBeenCalledOnce();
    expect(mocks.renderScene.mock.calls[0]![0]).not.toBe(mocks.mainScene);
    expect(mocks.mainScene.traverse).not.toHaveBeenCalled();
    expect(mocks.gl.autoClear).toBe(true);
    expect(mocks.gl.clearDepth).not.toHaveBeenCalled();
  });

  it('should stamp shared canvas depth once per frame and retain independent mask targets', async () => {
    const { OverlayDepthProvider, useOverlayDepthRestore, useOverlayDepthRestorer } =
      await import('#components/geometry/graphics/three/scene-overlay.js');
    const stamp = vi.fn();
    const restorers: Array<ReturnType<typeof useOverlayDepthRestorer>> = [];
    function Register(): React.ReactNode {
      useOverlayDepthRestore(stamp);
      return null;
    }
    function Consumer(): React.ReactNode {
      const restore = useOverlayDepthRestorer();
      useLayoutEffect(() => {
        restorers.push(restore);
      }, [restore]);
      return null;
    }
    render(
      <OverlayDepthProvider>
        <Register />
        <Consumer />
        <Consumer />
      </OverlayDepthProvider>,
    );
    const state = { gl: mocks.gl, scene: mocks.mainScene, camera: mocks.camera };
    const reset = mocks.frames.find(({ priority }) => priority === 0)!.callback;
    reset(state);
    restorers[0]!();
    restorers[1]!();
    expect(stamp).toHaveBeenCalledTimes(1);
    const mask = new WebGLRenderTarget(1, 1);
    restorers[1]!(mask);
    expect(stamp).toHaveBeenLastCalledWith(mask);
    expect(stamp).toHaveBeenCalledTimes(2);
    reset(state);
    restorers[0]!();
    expect(stamp).toHaveBeenCalledTimes(3);
    mask.dispose();
  });

  it('uses existing canvas depth when no post restore is registered', async () => {
    const { OverlayDepthProvider, SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');
    render(
      <OverlayDepthProvider>
        <SceneOverlay overlayActive>grid</SceneOverlay>
      </OverlayDepthProvider>,
    );
    mocks.getFrame()?.({ gl: mocks.gl, scene: mocks.mainScene, camera: mocks.camera });
    expect(mocks.renderScene).toHaveBeenCalledOnce();
    expect(mocks.mainScene.traverse).not.toHaveBeenCalled();
  });

  it('clears depth once before a depth-isolated overlay pass', async () => {
    const { SceneOverlay } = await import('#components/geometry/graphics/three/scene-overlay.js');
    const order: string[] = [];
    mocks.gl.clearDepth.mockImplementation(() => order.push('clear-depth'));
    mocks.renderScene.mockImplementation(() => order.push('overlay'));

    render(
      <SceneOverlay shouldClearDepth overlayActive renderPriority={3}>
        controls
      </SceneOverlay>,
    );
    mocks.getFrame()?.({ gl: mocks.gl, scene: mocks.mainScene, camera: mocks.camera });

    expect(mocks.getFramePriority()).toBe(3);
    expect(order).toEqual(['clear-depth', 'overlay']);
    expect(mocks.gl.clearDepth).toHaveBeenCalledOnce();
  });
});
