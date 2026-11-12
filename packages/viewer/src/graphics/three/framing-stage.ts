/**
 * The host half of the framing actor's stage: the configured orientation a first frame faces, with an up resolved
 * against the camera's current up, and the fit margin (charter G5). The framing actor never reads the camera, so the
 * host resolves the stage and sends it with each measurement.
 *
 * @module
 */

import { resolveCameraUp } from '@taucad/camera';
import type { CameraVector } from '@taucad/camera';
import type { FramingStage } from '#machines/framing.machine.js';
import { defaultStageOptions } from '#graphics/three/stage-options.js';
import type { StageOptions } from '#graphics/three/stage-options.js';

/* Three's default object up, the camera's last resort when the preferred up is parallel to the view direction. */
const defaultUp: CameraVector = [0, 1, 0];

const directionFromRotation = ({ side, vertical }: Readonly<{ side: number; vertical: number }>): CameraVector => {
  const horizontalScale = Math.cos(vertical);
  return [horizontalScale * Math.cos(side), horizontalScale * Math.sin(side), Math.sin(vertical)];
};

/**
 * Resolves stage options into the framing actor's stage.
 *
 * @param stageOptions - The stage's options; missing fields take the defaults.
 * @param currentUp - The camera's up now, which the configured direction keeps where it can.
 * @returns The orientation a first frame faces and the fractional fit margin.
 * @public
 */
export const resolveFramingStage = (stageOptions: StageOptions | undefined, currentUp: CameraVector): FramingStage => {
  const rotation = { ...defaultStageOptions.rotation, ...stageOptions?.rotation };
  const direction = directionFromRotation(rotation);
  return {
    orientation: { direction, up: resolveCameraUp({ direction, preferredUp: currentUp, defaultUp }) },
    margin: stageOptions?.fitMargin ?? defaultStageOptions.fitMargin,
  };
};

/**
 * The default stage, as a framing actor's input: the orientation and margin it holds until a measurement carries the
 * host's stage.
 *
 * @param currentUp - The camera's up now.
 * @returns The default orientation and margin.
 * @public
 */
export const defaultFramingStage = (currentUp: CameraVector): FramingStage => resolveFramingStage(undefined, currentUp);
