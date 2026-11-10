import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate';
import type { CameraState } from '@taucad/camera';
import type { CameraDriverSnapshot, CameraMachine } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera } from '@taucad/three/camera';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import type { GraphicsCameraRef, graphicsMachine, ViewCameraFraming } from '#machines/graphics.machine.js';

/*
 * The view's camera is the graphics actor's `camera` child (charter D5, I11): its lifetime is structural, so there is
 * no session registry. What was the registry's is now a type or a selector of the graphics snapshot.
 */

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

export type { ViewCameraFraming } from '#machines/graphics.machine.js';

/**
 * Receives the camera and driver snapshot each time a view's camera rig updates.
 *
 * @public
 */
export type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
/**
 * Receives a view's render frame when it changes.
 *
 * @public
 */
export type RenderFrameUpdateHandler = (renderFrame: RenderFrame) => void;

/**
 * The provider's seed. `identity` names the entry whose geometry the view frames: a new identity re-latches the
 * framing record with `camera.cameraView` as its pending pose. The camera itself is seeded once, from the graphics
 * actor's `camera` input.
 *
 * @public
 */
export type ViewCameraSeed = Readonly<{
  identity?: string;
  camera?: Partial<CameraOwnedSettings>;
}>;

/**
 * Types a graphics actor's camera as the actor the native rig presents; XState types a spawned ref apart from a root
 * actor, and the rig reads only what both have.
 *
 * @param cameraRef - The graphics actor's camera.
 * @returns The same actor.
 * @public
 */
export const asCameraActor = (cameraRef: GraphicsCameraRef): Actor<CameraMachine> =>
  cameraRef as unknown as Actor<CameraMachine>;

/**
 * Selects a graphics actor's camera.
 *
 * @param snapshot - The graphics snapshot.
 * @returns The camera actor.
 * @public
 */
export const selectGraphicsCamera = (snapshot: SnapshotFrom<typeof graphicsMachine>): GraphicsCameraRef =>
  snapshot.context.cameraRef;

/**
 * Selects a graphics actor's framing record (a bridge until the framing actor, G5b).
 *
 * @param snapshot - The graphics snapshot.
 * @returns The framing record, mutated in place by the canvas framing hook.
 * @public
 */
export const selectGraphicsCameraFraming = (snapshot: SnapshotFrom<typeof graphicsMachine>): ViewCameraFraming =>
  snapshot.context.cameraFraming;

/**
 * Re-latches a view's framing record when the provider names a new entry. A view can render before its entry path is
 * known (a panel seeded while the project loads), and that is not a file switch: a seed with no identity changes
 * nothing, so the persisted pose is not re-armed over the live one.
 *
 * @param framing - The graphics actor's framing record.
 * @param seed - The provider's seed.
 * @public
 */
export const latchViewCameraFraming = (framing: ViewCameraFraming, seed: ViewCameraSeed): void => {
  if (seed.identity === undefined || framing.identity === seed.identity) {
    return;
  }
  framing.identity = seed.identity;
  framing.pendingView = seed.camera?.cameraView;
  framing.preserveOrientationOnFirstFrame = false;
  framing.firstFrameView = undefined;
  framing.initialized = false;
};

/**
 * Reads the latest complete camera state of a graphics actor's camera, as its native cameras present it.
 *
 * @param graphicsRef - The graphics actor, if any.
 * @returns The camera state, or `undefined` with no graphics actor.
 * @public
 */
export const getGraphicsCameraState = (graphicsRef: GraphicsActorRef | undefined): CameraState | undefined => {
  if (!graphicsRef) {
    return undefined;
  }
  const rig = createThreeCameraRig({ actorRef: asCameraActor(graphicsRef.getSnapshot().context.cameraRef) });
  const state = rig.readState();
  rig.dispose();
  return state;
};
