/**
 * The page's half of `pose_model` (live-render blueprint LRP-7): apply a command to the shown unit's Kinematics actor,
 * and read the motion back for `view_state`.
 */

import type { TauViewerPoseCommand, TauViewerViewState } from '@taucad/mcp/viewer-protocol';
import { getKinematicsUnitState } from '@taucad/viewer/machines/kinematics.machine';
import type { KinematicsRef } from '@taucad/viewer/machines/graphics.machine';

/**
 * The motion a unit reports in its view: its mechanism, playback and every coordinate, or nothing without a mechanism.
 *
 * @param kinematicsRef - The graphics actor's Kinematics actor.
 * @param unitId - The shown unit.
 * @returns The motion fields of the view, or `undefined`.
 */
export const motionOf = (
  kinematicsRef: KinematicsRef,
  unitId: string,
): Required<Pick<TauViewerViewState, 'mechanism' | 'playback' | 'coordinates'>> | undefined => {
  const unit = getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId);
  const { mechanism, playback } = unit;
  if (mechanism === undefined) {
    return undefined;
  }
  return {
    mechanism: {
      preserved: true,
      joints: Object.keys(mechanism.joints).length,
      animations: (mechanism.animations ?? []).map(({ id }) => id),
    },
    playback: {
      status: playback.status,
      ...(playback.animationId === undefined ? {} : { animationId: playback.animationId }),
      time: playback.time,
      speed: playback.speed,
    },
    coordinates: { ...(unit.pose?.coordinates ?? unit.coordinates) },
  };
};

/**
 * Apply one `pose_model` command to the shown unit: the server resolved the time a clip starts or stops at, so the
 * page selects the clip, seeks to that time, and then plays or holds it.
 *
 * @param kinematicsRef - The graphics actor's Kinematics actor.
 * @param unitId - The shown unit.
 * @param command - The command, for this unit's model.
 * @returns Nothing.
 */
export const applyPoseCommand = (kinematicsRef: KinematicsRef, unitId: string, command: TauViewerPoseCommand): void => {
  const { animation, coordinates } = command;
  if (animation !== undefined) {
    if (animation.action === 'reset') {
      kinematicsRef.send({ type: 'reset', unitId });
      return;
    }
    kinematicsRef.send({ type: 'selectAnimation', unitId, animationId: animation.id });
    if (animation.speed !== undefined) {
      kinematicsRef.send({ type: 'setPlaybackSpeed', unitId, speed: animation.speed });
    }
    kinematicsRef.send({ type: 'seek', unitId, time: animation.time ?? 0 });
    if (animation.action === 'play') {
      kinematicsRef.send({ type: 'play', unitId, animationId: animation.id });
    } else if (animation.action === 'pause') {
      kinematicsRef.send({ type: 'pause', unitId });
    }
  }
  for (const [id, value] of Object.entries(coordinates ?? {})) {
    kinematicsRef.send({ type: 'setCoordinate', unitId, id, value });
  }
};
