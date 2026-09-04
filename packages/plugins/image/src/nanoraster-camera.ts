import type { CameraState } from '@taucad/camera';
import type { RenderCamera } from 'nanoraster';
import { renderImageVerticalFieldOfViewRange, renderImageZoomRange } from 'nanoraster';

type NanorasterFixedProjection = Extract<RenderCamera, { framing: 'fixed' }>['projection'];

const clamp = (value: number, range: readonly [number, number]): number =>
  Math.min(range[1], Math.max(range[0], value));

const halfFieldOfViewTangent = (verticalFieldOfView: number): number => Math.tan((verticalFieldOfView * Math.PI) / 360);

const normalizePerspectiveProjection = (
  projection: Extract<CameraState['projection'], { kind: 'perspective' }>,
): NanorasterFixedProjection => {
  if (
    !Number.isFinite(projection.verticalFieldOfView) ||
    projection.verticalFieldOfView <= 0 ||
    projection.verticalFieldOfView > renderImageVerticalFieldOfViewRange[1] ||
    !Number.isFinite(projection.zoom) ||
    projection.zoom <= 0
  ) {
    throw new RangeError('Perspective camera projection must contain a valid field of view and positive finite zoom.');
  }
  if (
    projection.verticalFieldOfView >= renderImageVerticalFieldOfViewRange[0] &&
    projection.zoom >= renderImageZoomRange[0] &&
    projection.zoom <= renderImageZoomRange[1]
  ) {
    return projection;
  }
  const effectiveTangent = halfFieldOfViewTangent(projection.verticalFieldOfView) / projection.zoom;
  let verticalFieldOfView = clamp(projection.verticalFieldOfView, renderImageVerticalFieldOfViewRange);
  let zoom = halfFieldOfViewTangent(verticalFieldOfView) / effectiveTangent;
  if (zoom < renderImageZoomRange[0] || zoom > renderImageZoomRange[1]) {
    zoom = clamp(zoom, renderImageZoomRange);
    verticalFieldOfView = (Math.atan(effectiveTangent * zoom) * 360) / Math.PI;
  }
  if (
    verticalFieldOfView < renderImageVerticalFieldOfViewRange[0] ||
    verticalFieldOfView > renderImageVerticalFieldOfViewRange[1]
  ) {
    throw new RangeError('Equivalent perspective camera is outside the supported field-of-view and zoom ranges.');
  }
  return { kind: 'perspective', verticalFieldOfView, zoom };
};

const normalizeOrthographicProjection = (
  projection: Extract<CameraState['projection'], { kind: 'orthographic' }>,
): NanorasterFixedProjection => {
  if (
    !Number.isFinite(projection.verticalSpan) ||
    projection.verticalSpan <= 0 ||
    !Number.isFinite(projection.zoom) ||
    projection.zoom <= 0
  ) {
    throw new RangeError('Orthographic camera projection must contain a positive finite span and zoom.');
  }
  if (projection.zoom >= renderImageZoomRange[0] && projection.zoom <= renderImageZoomRange[1]) {
    return projection;
  }
  const zoom = clamp(projection.zoom, renderImageZoomRange);
  const verticalSpan = projection.verticalSpan * (zoom / projection.zoom);
  if (!Number.isFinite(verticalSpan) || verticalSpan <= 0) {
    throw new RangeError('Equivalent orthographic camera vertical span is outside the supported range.');
  }
  return { kind: 'orthographic', verticalSpan, zoom };
};

/** Options for {@link toNanorasterCamera}. @public */
export type NanorasterCameraOptions = Readonly<{
  cameraState: CameraState;
}>;

/**
 * Maps Tau's complete renderer-neutral camera state to nanoraster's fixed camera wire contract.
 *
 * @returns A fixed nanoraster camera in the caller's declared world.
 * @public
 */
export const toNanorasterCamera = ({ cameraState }: NanorasterCameraOptions): RenderCamera => {
  if (cameraState.frameId !== 'tau:root') {
    throw new RangeError(`Nanoraster camera must use frame "tau:root"; received "${cameraState.frameId}".`);
  }
  return {
    framing: 'fixed',
    position: cameraState.position,
    target: cameraState.target,
    up: cameraState.up,
    projection:
      cameraState.projection.kind === 'perspective'
        ? normalizePerspectiveProjection(cameraState.projection)
        : normalizeOrthographicProjection(cameraState.projection),
    clipping: {
      near: cameraState.clipping.near,
      far: cameraState.clipping.far,
    },
  };
};
