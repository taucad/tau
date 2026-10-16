import type { KinematicsSource } from '@taucad/workbench-panes/kinematics/kinematics-source';
import type { HostBridge } from '#app/host-bridge.js';

/**
 * The Kinematics pane's source on the viewer page. It calls no tool: the mechanism arrives inside the shown GLB, whose
 * topology payload the graphics actor's kinematics actor loads, and pose, playback and drag all live in that actor.
 * The page has no CAD actor, part menu or hidden panel, so it supplies none of the optional pieces: the pane counts as
 * shown while mounted, never reports a build in progress or a rejected mechanism, and takes no reveal requests.
 *
 * @param _bridge - The page's host bridge, unused until the page offers reveal or mechanism diagnostics.
 * @returns A source with none of the optional pieces.
 */
export function createKinematicsSource(_bridge: HostBridge): KinematicsSource {
  return {};
}
