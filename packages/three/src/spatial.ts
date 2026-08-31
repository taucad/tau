import { Box3, Matrix4, Plane, Ray, Vector3 } from 'three';
import type { RenderFrame, SpatialBounds, SpatialPlane, SpatialVector } from '@taucad/spatial';
import {
  fromRenderBounds,
  fromRenderPlane,
  fromRenderPoint,
  toRenderBounds,
  toRenderPlane,
  toRenderPoint,
} from '@taucad/spatial';

/** Options for mapping a physical point into a Three render frame. @public */
export type ToThreeRenderPointOptions = Readonly<{ renderFrame: RenderFrame; pointMeters: SpatialVector }>;

/** Options for mapping a Three render-local point into physical metres. @public */
export type FromThreeRenderPointOptions = Readonly<{ renderFrame: RenderFrame; point: Vector3 }>;

/**
 * Builds the uniform outer transform mapping anchor-frame metres into render-local Three coordinates.
 *
 * @param renderFrame - Active per-view render frame.
 * @returns A new Three matrix suitable for an outer scene group.
 * @public
 */
export const createThreeRenderMatrix = (renderFrame: RenderFrame): Matrix4 => {
  const origin = toRenderPoint({ renderFrame, point: [0, 0, 0] });
  const inverseScale = 1 / renderFrame.metersPerRenderUnit;
  if (!Number.isFinite(inverseScale) || inverseScale <= 0) {
    throw new RangeError('renderFrame.metersPerRenderUnit must have a finite reciprocal.');
  }
  return new Matrix4().set(
    inverseScale,
    0,
    0,
    origin[0],
    0,
    inverseScale,
    0,
    origin[1],
    0,
    0,
    inverseScale,
    origin[2],
    0,
    0,
    0,
    1,
  );
};

/**
 * Maps an anchor-frame physical point into a native Three render-local point.
 *
 * @param options - Render frame and physical point in metres.
 * @returns A new native Three vector.
 * @public
 */
export const toThreeRenderPoint = ({ renderFrame, pointMeters }: ToThreeRenderPointOptions): Vector3 =>
  new Vector3(...toRenderPoint({ renderFrame, point: pointMeters }));

/**
 * Maps a native Three render-local point into anchor-frame physical metres.
 *
 * @param options - Render frame and native point.
 * @returns A serializable physical tuple.
 * @public
 */
export const fromThreeRenderPoint = ({ renderFrame, point }: FromThreeRenderPointOptions): SpatialVector =>
  fromRenderPoint({ renderFrame, point: [point.x, point.y, point.z] });

/**
 * Maps a physical ray into render-local coordinates; uniform scaling leaves its direction unchanged.
 *
 * @param options - Render frame and physical Three ray.
 * @returns A new render-local ray.
 * @public
 */
export const toThreeRenderRay = ({ renderFrame, ray }: Readonly<{ renderFrame: RenderFrame; ray: Ray }>): Ray =>
  new Ray(
    toThreeRenderPoint({ renderFrame, pointMeters: [ray.origin.x, ray.origin.y, ray.origin.z] }),
    ray.direction.clone(),
  );

/**
 * Maps a render-local ray into physical coordinates; uniform scaling leaves its direction unchanged.
 *
 * @param options - Render frame and render-local Three ray.
 * @returns A new physical ray whose origin is measured in metres.
 * @public
 */
export const fromThreeRenderRay = ({ renderFrame, ray }: Readonly<{ renderFrame: RenderFrame; ray: Ray }>): Ray =>
  new Ray(new Vector3(...fromThreeRenderPoint({ renderFrame, point: ray.origin })), ray.direction.clone());

/**
 * Maps physical axis-aligned bounds into a native Three box.
 *
 * @param options - Render frame and physical bounds.
 * @returns A new render-local box.
 * @public
 */
export const toThreeRenderBounds = ({
  renderFrame,
  bounds,
}: Readonly<{ renderFrame: RenderFrame; bounds: SpatialBounds }>): Box3 => {
  const renderBounds = toRenderBounds({ renderFrame, bounds });
  return new Box3(new Vector3(...renderBounds.min), new Vector3(...renderBounds.max));
};

/**
 * Maps a native Three box into physical axis-aligned bounds.
 *
 * @param options - Render frame and render-local box.
 * @returns Serializable physical bounds in metres.
 * @public
 */
export const fromThreeRenderBounds = ({
  renderFrame,
  bounds,
}: Readonly<{ renderFrame: RenderFrame; bounds: Box3 }>): SpatialBounds =>
  fromRenderBounds({
    renderFrame,
    bounds: { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] },
  });

/**
 * Maps a physical point-normal plane into a native render-local Three plane.
 *
 * @param options - Render frame and physical plane.
 * @returns A new native plane.
 * @public
 */
export const toThreeRenderPlane = ({
  renderFrame,
  plane,
}: Readonly<{ renderFrame: RenderFrame; plane: SpatialPlane }>): Plane => {
  const renderPlane = toRenderPlane({ renderFrame, plane });
  return new Plane().setFromNormalAndCoplanarPoint(
    new Vector3(...renderPlane.normal).normalize(),
    new Vector3(...renderPlane.point),
  );
};

/**
 * Maps a native render-local Three plane into a physical point-normal plane.
 *
 * @param options - Render frame and native plane.
 * @returns Serializable physical plane in metres.
 * @public
 */
export const fromThreeRenderPlane = ({
  renderFrame,
  plane,
}: Readonly<{ renderFrame: RenderFrame; plane: Plane }>): SpatialPlane => {
  const point = plane.coplanarPoint(new Vector3());
  return fromRenderPlane({
    renderFrame,
    plane: { point: [point.x, point.y, point.z], normal: [plane.normal.x, plane.normal.y, plane.normal.z] },
  });
};
