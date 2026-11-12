import { createRoot, _roots } from '@react-three/fiber';
import type { ViewportGizmo } from 'three-viewport-gizmo';
import { Vector4 } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { followGizmoCanvasSize } from '#graphics/three/utils/gizmo.utils.js';

const canvases: HTMLCanvasElement[] = [];
const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  // These roots never render or initialize a GPU; only their real sizing store is used.
  for (const canvas of canvases.splice(0)) {
    _roots.delete(canvas);
  }
});

const createFixture = async () => {
  const canvas = document.createElement('canvas');
  canvases.push(canvas);
  const renderer = new WebGPURenderer({ canvas });
  const root = createRoot(canvas);
  await root.configure({
    gl: renderer,
    size: { width: 640, height: 400, top: 0, left: 0 },
    dpr: 1,
    frameloop: 'never',
  });
  const { store } = _roots.get(canvas)!;
  const savedViewport = new Vector4();
  const gizmo = mock<ViewportGizmo>();
  gizmo.domUpdate.mockImplementation(() => {
    renderer.getViewport(savedViewport);
    return gizmo;
  });
  const stop = followGizmoCanvasSize({ store, gizmo });
  stops.push(stop);
  return { store, renderer, gizmo, savedViewport, stop };
};

describe('followGizmoCanvasSize', () => {
  it('should save the resized renderer viewport in the resize itself, before another frame can restore it', async () => {
    const { store, renderer, gizmo, savedViewport } = await createFixture();
    store.getState().setSize(1280, 720);
    // Asserted synchronously after the resize, before any frame: a later refresh is already too late.
    expect(savedViewport.toArray()).toEqual([0, 0, 1280, 720]);
    expect(gizmo.domUpdate).toHaveBeenCalledOnce();
    renderer.setViewport(savedViewport);
    expect(renderer.getViewport(new Vector4()).toArray()).toEqual([0, 0, 1280, 720]);
    expect(gizmo.update).not.toHaveBeenCalled();
  });

  it('should do no work for unrelated or identical updates and refresh DPR and position changes', async () => {
    const { store, gizmo } = await createFixture();
    store.setState({ controls: null });
    store.getState().setSize(640, 400, 0, 0);
    expect(gizmo.domUpdate).not.toHaveBeenCalled();
    store.getState().setSize(640, 400, 20, 30);
    expect(gizmo.domUpdate).toHaveBeenCalledTimes(1);
    store.getState().setDpr(2);
    expect(gizmo.domUpdate).toHaveBeenCalledTimes(2);
    store.getState().setSize(0, 0);
    expect(gizmo.domUpdate).toHaveBeenCalledTimes(2);
    store.getState().setSize(640, 400);
    expect(gizmo.domUpdate).toHaveBeenCalledTimes(3);
  });

  it('should isolate canvas subscriptions and remove them when stopped', async () => {
    const first = await createFixture();
    const second = await createFixture();
    first.store.getState().setSize(800, 500);
    expect(first.gizmo.domUpdate).toHaveBeenCalledOnce();
    expect(second.gizmo.domUpdate).not.toHaveBeenCalled();
    first.stop();
    first.store.getState().setSize(900, 600);
    second.store.getState().setSize(300, 200);
    expect(first.gizmo.domUpdate).toHaveBeenCalledOnce();
    expect(second.savedViewport.toArray()).toEqual([0, 0, 300, 200]);
    expect(second.gizmo.domUpdate).toHaveBeenCalledOnce();
  });
});
