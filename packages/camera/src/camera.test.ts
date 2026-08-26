import { describe, expect, it } from 'vitest';

import {
  cameraProjectionForVerticalFieldOfView,
  createCameraState,
  createCameraView,
  findPerspectiveHandoffVerticalFieldOfView,
  frameCameraBounds,
  maximumProjectedPixelDelta,
  orthographicFrustumForVerticalSpan,
  perspectiveDistanceForVerticalSpan,
  perspectiveVerticalSpan,
  resolveCameraFrame,
} from '#index.js';

const bounds = {
  min: [-220, -180, -55],
  max: [220, 180, 55],
} as const;

const createView = () =>
  createCameraView({
    requestedVerticalFieldOfView: 60,
    target: [35, -20, 12],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 600,
    viewport: { width: 1536, height: 900, pixelRatio: 2 },
    bounds,
  });

describe('@taucad/camera', () => {
  it('copies and validates complete serializable camera state', () => {
    const state = createCameraState({
      position: [8, -6, 4],
      target: [1, 2, 3],
      up: [0, 0, 2],
      projection: { kind: 'perspective', verticalFieldOfView: 45, zoom: 1.5 },
      clipping: { near: 0.1, far: 1000 },
      aspect: 16 / 9,
    });

    expect(state.up).toEqual([0, 0, 1]);
    expect(state.projection).toEqual({ kind: 'perspective', verticalFieldOfView: 45, zoom: 1.5 });
    expect(() => createCameraState({ ...state, position: state.target })).toThrow(RangeError);
    expect(() => createCameraState({ ...state, clipping: { near: 1, far: 1 } })).toThrow(RangeError);
  });

  it('uses exact native endpoint projection semantics', () => {
    expect(cameraProjectionForVerticalFieldOfView(0)).toEqual({ kind: 'orthographic' });
    expect(cameraProjectionForVerticalFieldOfView(0.001)).toEqual({ kind: 'perspective', verticalFieldOfView: 0.001 });
    expect(() => cameraProjectionForVerticalFieldOfView(-1)).toThrow(RangeError);
    expect(() => cameraProjectionForVerticalFieldOfView(Number.NaN)).toThrow(RangeError);
  });

  it('round-trips perspective span and distance', () => {
    const verticalSpan = perspectiveVerticalSpan({ distance: 42, verticalFieldOfView: 37, zoom: 1.4 });
    expect(perspectiveDistanceForVerticalSpan({ verticalSpan, verticalFieldOfView: 37, zoom: 1.4 })).toBeCloseTo(
      42,
      12,
    );
  });

  it('preserves vertical span across viewport aspects', () => {
    expect(orthographicFrustumForVerticalSpan({ verticalSpan: 10, aspect: 2 })).toEqual({
      left: -10,
      right: 10,
      top: 5,
      bottom: -5,
    });
    expect(orthographicFrustumForVerticalSpan({ verticalSpan: 10, aspect: 0.5 })).toEqual({
      left: -2.5,
      right: 2.5,
      top: 5,
      bottom: -5,
    });
  });

  it('normalizes arbitrary directions and rejects invalid views', () => {
    const view = createView();
    expect(Math.hypot(...view.direction)).toBeCloseTo(1, 12);
    expect(view.target).toEqual([35, -20, 12]);
    expect(() => createCameraView({ ...view, direction: [0, 0, 0] })).toThrow(RangeError);
    expect(() => createCameraView({ ...view, up: view.direction })).toThrow(RangeError);
    expect(() => createCameraView({ ...view, viewport: { ...view.viewport, width: 0 } })).toThrow(RangeError);
    expect(() => createCameraView({ ...view, bounds: { min: [1, 0, 0], max: [0, 1, 1] } })).toThrow(RangeError);
  });

  it('derives finite tight frames for both native endpoints', () => {
    const perspective = resolveCameraFrame({ view: createView() });
    const orthographic = resolveCameraFrame({ view: { ...createView(), requestedVerticalFieldOfView: 0 } });

    expect(perspective.projection.kind).toBe('perspective');
    expect(perspective.clipping.near).toBeGreaterThan(0);
    expect(perspective.clipping.far).toBeGreaterThan(perspective.clipping.near);
    expect(orthographic.projection.kind).toBe('orthographic');
    expect(orthographic.frustum).toEqual({ left: -512, right: 512, top: 300, bottom: -300 });
    expect(orthographic.clipping.far / orthographic.clipping.near).toBeLessThan(100);
  });

  it('keeps a target-aligned plane in front at shallow orthographic elevations', () => {
    const elevation = (5 * Math.PI) / 180;
    const view = createCameraView({
      ...createView(),
      requestedVerticalFieldOfView: 0,
      target: [0, 0, 0],
      direction: [Math.cos(elevation), 0, Math.sin(elevation)],
    });
    const frame = resolveCameraFrame({ view });
    const lowerViewportClearance = frame.distance * Math.sin(elevation) - (view.verticalSpan / 2) * Math.cos(elevation);

    expect(lowerViewportClearance).toBeGreaterThan(0);
  });

  it('frames off-origin bounds without changing orientation or viewport', () => {
    const view = createView();
    const framed = frameCameraBounds({
      view,
      bounds: { min: [120, -80, 25], max: [360, 140, 145] },
    });

    expect(framed.target).toEqual([240, 30, 85]);
    expect(framed.direction).toEqual(view.direction);
    expect(framed.viewport).toEqual(view.viewport);
    expect(framed.verticalSpan).toBeGreaterThan(0);
  });

  it('derives a positive handoff from the physical-pixel budget', () => {
    const view = createView();
    const handoff = findPerspectiveHandoffVerticalFieldOfView({
      view,
      maximumVerticalFieldOfView: 60,
      pixelBudget: 0.25,
    });
    const delta = maximumProjectedPixelDelta({ view, perspectiveVerticalFieldOfView: handoff });

    expect(handoff).toBeGreaterThan(0);
    expect(handoff).toBeLessThan(0.1);
    expect(delta).toBeLessThanOrEqual(0.25);
    expect(maximumProjectedPixelDelta({ view, perspectiveVerticalFieldOfView: handoff * 1.01 })).toBeGreaterThan(0.25);
  });

  it('accounts for resize and physical pixel ratio in the handoff', () => {
    const view = createView();
    const base = findPerspectiveHandoffVerticalFieldOfView({ view, maximumVerticalFieldOfView: 60 });
    const denser = findPerspectiveHandoffVerticalFieldOfView({
      view: createCameraView({ ...view, viewport: { width: 3072, height: 1800, pixelRatio: 2 } }),
      maximumVerticalFieldOfView: 60,
    });
    const higherRatio = findPerspectiveHandoffVerticalFieldOfView({
      view: createCameraView({ ...view, viewport: { ...view.viewport, pixelRatio: 3 } }),
      maximumVerticalFieldOfView: 60,
    });

    expect(denser).toBeLessThan(base);
    expect(higherRatio).toBeLessThan(base);
  });
});
