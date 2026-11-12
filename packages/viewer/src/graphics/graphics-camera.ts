import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate';
import type { CameraState, CameraVector } from '@taucad/camera';
import type { CameraDriverSnapshot, CameraMachine } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera } from '@taucad/three/camera';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import type { GraphicsCameraRef, graphicsMachine } from '#machines/graphics.machine.js';

/*
 * The view's camera is the graphics actor's `camera` child (charter D5, I11): its lifetime is structural, so there is
 * no session registry. What the registry held is a type here, or a selector of the graphics snapshot or the camera's.
 */

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

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
 * The provider's seed. `identity` names the entry whose geometry the view frames: a new identity sends the graphics
 * actor `entryChanged`, with `camera.cameraView` as the pose its framing applies after the entry's first frame. The
 * camera itself is seeded once, from the graphics actor's `camera` input.
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

/**
 * Reads a camera's current view direction at the moment an event needs it, such as a section added or a plane
 * changed facing away from the viewer.
 *
 * @param camera - The camera actor, as a rig or the graphics actor's camera presents it.
 * @returns The view direction.
 * @public
 */
export const selectCameraViewDirection = (
  camera: Readonly<{
    getSnapshot: () => Readonly<{ context: Readonly<{ view: Readonly<{ direction: CameraVector }> }> }>;
  }>,
): CameraVector => camera.getSnapshot().context.view.direction;
