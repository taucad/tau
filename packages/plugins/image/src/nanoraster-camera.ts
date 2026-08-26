import type { CameraState } from '@taucad/camera';
import type { RenderCamera } from 'nanoraster';
import { renderImageVerticalFieldOfViewRange, renderImageZoomRange } from 'nanoraster';

type NanorasterFixedProjection = Extract<RenderCamera, { framing: 'fixed' }>['projection'];

/** Options for {@link toNanorasterCamera}. @public */
export type NanorasterCameraOptions = Readonly<{
  cameraState: CameraState;
  /** Multiplier from source camera lengths to the glTF world unit. @default 1 */
  lengthScale?: number;
}>;

/**
 * Maps Tau's complete renderer-neutral camera state to nanoraster's fixed camera wire contract.
 *
 * @returns A fixed nanoraster camera in the target glTF length unit.
 * @public
 */
export const toNanorasterCamera = ({ cameraState, lengthScale = 1 }: NanorasterCameraOptions): RenderCamera => {
  if (!Number.isFinite(lengthScale) || lengthScale <= 0) {
    throw new RangeError('lengthScale must be finite and greater than zero.');
  }
  const scaleVector = (value: CameraState['position']) =>
    [value[0] * lengthScale, value[1] * lengthScale, value[2] * lengthScale] as const;
  const perspectiveProjection = (): NanorasterFixedProjection | undefined => {
    if (cameraState.projection.kind !== 'perspective') {
      return undefined;
    }
    const verticalFieldOfView = Math.max(
      cameraState.projection.verticalFieldOfView,
      renderImageVerticalFieldOfViewRange[0],
    );
    const zoom =
      (cameraState.projection.zoom * Math.tan((verticalFieldOfView * Math.PI) / 360)) /
      Math.tan((cameraState.projection.verticalFieldOfView * Math.PI) / 360);
    if (zoom < renderImageZoomRange[0] || zoom > renderImageZoomRange[1]) {
      throw new RangeError(`Equivalent nanoraster camera zoom ${zoom} is outside the supported range.`);
    }
    return { kind: 'perspective', verticalFieldOfView, zoom };
  };
  return {
    framing: 'fixed',
    position: scaleVector(cameraState.position),
    target: scaleVector(cameraState.target),
    up: cameraState.up,
    projection:
      perspectiveProjection() ??
      (cameraState.projection.kind === 'orthographic'
        ? {
            kind: 'orthographic',
            verticalSpan: cameraState.projection.verticalSpan * lengthScale,
            zoom: cameraState.projection.zoom,
          }
        : undefined),
    clipping: {
      near: cameraState.clipping.near * lengthScale,
      far: cameraState.clipping.far * lengthScale,
    },
  };
};
