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
  resolveCameraState,
} from '#index.js';

const bounds = {
  min: [-220, -180, -55],
  max: [220, 180, 55],
} as const;

const volumetricBounds = { min: [0, 0, 0], max: [20, 14, 8] } as const;
const volumetricCorners = [
  [0, 0, 0],
  [20, 0, 0],
  [0, 14, 0],
  [20, 14, 0],
  [0, 0, 8],
  [20, 0, 8],
  [0, 14, 8],
  [20, 14, 8],
] as const;

const createView = () =>
  createCameraView({
    frameId: 'test-root',
    requestedVerticalFieldOfView: 60,
    perspectiveZoom: 1,
    target: [35, -20, 12],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 600,
    viewport: { width: 1536, height: 900, pixelRatio: 2 },
    bounds,
  });

const dot = (left: readonly number[], right: readonly number[]): number =>
  left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;

const cross = (left: readonly number[], right: readonly number[]): [number, number, number] => [
  left[1]! * right[2]! - left[2]! * right[1]!,
  left[2]! * right[0]! - left[0]! * right[2]!,
  left[0]! * right[1]! - left[1]! * right[0]!,
];

const normalize = (value: readonly number[]): [number, number, number] => {
  const length = Math.hypot(...value);
  return [value[0]! / length, value[1]! / length, value[2]! / length];
};

const projectedPoint = ({
  point,
  view,
  distance,
}: {
  point: readonly [number, number, number];
  view: ReturnType<typeof createCameraView>;
  distance: number;
}): readonly [number, number] => {
  const forward = view.direction.map((coordinate) => -coordinate);
  const right = normalize(cross(forward, view.up));
  const screenUp = normalize(cross(right, forward));
  const eye = view.target.map((coordinate, index) => coordinate + view.direction[index]! * distance);
  const offset = point.map((coordinate, index) => coordinate - eye[index]!);
  const tangent = Math.tan((view.requestedVerticalFieldOfView * Math.PI) / 360);
  const depth = dot(offset, forward);
  return [
    (dot(offset, right) * view.perspectiveZoom) / (depth * tangent * (view.viewport.width / view.viewport.height)),
    (dot(offset, screenUp) * view.perspectiveZoom) / (depth * tangent),
  ];
};

describe('@taucad/camera', () => {
  it('resolves a complete serializable state from the framed view', () => {
    const view = frameCameraBounds({ view: createView(), bounds: volumetricBounds });
    const frame = resolveCameraFrame({ view });

    expect(resolveCameraState({ view })).toEqual({
      frameId: view.frameId,
      position: [
        view.target[0] + view.direction[0] * frame.distance,
        view.target[1] + view.direction[1] * frame.distance,
        view.target[2] + view.direction[2] * frame.distance,
      ],
      target: view.target,
      up: view.up,
      projection: {
        kind: 'perspective',
        verticalFieldOfView: 60,
        zoom: frame.zoom,
      },
      clipping: frame.clipping,
      aspect: view.viewport.width / view.viewport.height,
    });
  });

  it('copies and validates complete serializable camera state', () => {
    const state = createCameraState({
      frameId: 'test-root',
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
    expect(() => createCameraView({ ...view, perspectiveZoom: 0 })).toThrow(RangeError);
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

  it('should retain the established distance and projected-corner zoom for a volumetric fit', () => {
    const framed = frameCameraBounds({
      view: createCameraView({
        ...createView(),
        requestedVerticalFieldOfView: 45,
        direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
        viewport: { width: 768, height: 576, pixelRatio: 1 },
      }),
      bounds: volumetricBounds,
      margin: 0.1,
    });
    const frame = resolveCameraFrame({ view: framed });

    expect(frame.distance).toBeCloseTo(35.808_573_937_594_36, 10);
    expect(framed.perspectiveZoom).toBeCloseTo(1.078_034_861_982_213_3, 10);
    expect(framed.verticalSpan).toBeCloseTo(27.517_471_831_882_276, 10);
    expect(frame.zoom).toBe(framed.perspectiveZoom);

    const coordinates = volumetricCorners.map((point) =>
      projectedPoint({ point, view: framed, distance: frame.distance }),
    );
    expect(Math.max(...coordinates.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]))).toBeCloseTo(0.9, 12);
    expect(coordinates.every(([x, y]) => Math.abs(x) <= 0.9 + 1e-12 && Math.abs(y) <= 0.9 + 1e-12)).toBe(true);
    expect(projectedPoint({ point: [20, 14, 8], view: framed, distance: frame.distance })).toEqual([
      expect.closeTo(0.733_907_379_246_009_8, 10),
      expect.closeTo(0.195_649_892_264_690_48, 10),
    ]);
  });

  it('should frame orthographic bounds from projected corners at the current aspect', () => {
    const framed = frameCameraBounds({
      view: createCameraView({
        ...createView(),
        requestedVerticalFieldOfView: 0,
        perspectiveZoom: 1.75,
        direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
        viewport: { width: 768, height: 576, pixelRatio: 1 },
      }),
      bounds: volumetricBounds,
      margin: 0.1,
    });
    const frame = resolveCameraFrame({ view: framed });

    expect(framed.perspectiveZoom).toBe(1.75);
    expect(frame.zoom).toBe(1);
    expect(frame.frustum).toBeDefined();
    const halfWidth = frame.frustum!.right;
    const halfHeight = frame.frustum!.top;
    const center = framed.target;
    const forward = framed.direction.map((coordinate) => -coordinate);
    const right = normalize(cross(forward, framed.up));
    const screenUp = normalize(cross(right, forward));
    const coordinates = volumetricCorners.map((point) => {
      const offset = point.map((coordinate, index) => coordinate - center[index]!);
      return [dot(offset, right) / halfWidth, dot(offset, screenUp) / halfHeight] as const;
    });
    expect(Math.max(...coordinates.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]))).toBeCloseTo(0.9, 12);
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

  it('is scale-covariant from 1e-30 through 1e30 metres', () => {
    const scales = [1e-30, 1e-24, 1e-18, 1e-12, 1e-9, 1e-6, 1e-3, 1, 1e3, 1e6, 1e12, 1e18, 1e24, 1e30];
    const baseBounds = { min: [-2, -1, -0.5], max: [2, 1, 0.5] } as const;
    const baseView = createCameraView({
      ...createView(),
      target: [0, 0, 0],
      verticalSpan: 6,
      bounds: baseBounds,
    });
    const baseFramed = frameCameraBounds({ view: baseView, bounds: baseBounds });
    const baseFrame = resolveCameraFrame({ view: baseFramed });
    const baseDelta = maximumProjectedPixelDelta({ view: baseFramed, perspectiveVerticalFieldOfView: 0.05 });

    for (const scale of scales) {
      const scaledBounds = {
        min: baseBounds.min.map((value) => value * scale) as [number, number, number],
        max: baseBounds.max.map((value) => value * scale) as [number, number, number],
      };
      const framed = frameCameraBounds({
        view: createCameraView({
          ...baseView,
          target: baseView.target.map((value) => value * scale) as [number, number, number],
          verticalSpan: baseView.verticalSpan * scale,
          bounds: scaledBounds,
        }),
        bounds: scaledBounds,
      });
      const frame = resolveCameraFrame({ view: framed });

      expect(framed.verticalSpan / scale).toBeCloseTo(baseFramed.verticalSpan, 10);
      expect(frame.distance / scale).toBeCloseTo(baseFrame.distance, 10);
      expect(frame.clipping.near / scale).toBeCloseTo(baseFrame.clipping.near, 9);
      expect(frame.clipping.far / scale).toBeCloseTo(baseFrame.clipping.far, 9);
      expect(frame.clipping.far / frame.clipping.near).toBeCloseTo(baseFrame.clipping.far / baseFrame.clipping.near, 9);
      expect(maximumProjectedPixelDelta({ view: framed, perspectiveVerticalFieldOfView: 0.05 })).toBeCloseTo(
        baseDelta,
        8,
      );
    }
  });
});
