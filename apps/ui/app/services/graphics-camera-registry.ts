import type { ActorRefFrom } from 'xstate';
import type { CameraState } from '@taucad/camera';
import type { ThreeCameraRig } from '@taucad/three/camera';
import type { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

const cameraRigsByGraphics = new WeakMap<GraphicsActorRef, ThreeCameraRig>();
const listeners = new Set<() => void>();
let version = 0;

const notify = (): void => {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
};

export const registerGraphicsCameraRig = (graphicsRef: GraphicsActorRef, rig: ThreeCameraRig): void => {
  if (cameraRigsByGraphics.get(graphicsRef) === rig) {
    return;
  }
  cameraRigsByGraphics.set(graphicsRef, rig);
  notify();
};

export const unregisterGraphicsCameraRig = (graphicsRef: GraphicsActorRef, rig: ThreeCameraRig): void => {
  if (cameraRigsByGraphics.get(graphicsRef) !== rig) {
    return;
  }
  cameraRigsByGraphics.delete(graphicsRef);
  notify();
};

/** Reads the latest complete camera state without mirroring it into the graphics actor. */
export const getGraphicsCameraState = (graphicsRef: GraphicsActorRef | undefined): CameraState | undefined => {
  if (!graphicsRef) {
    return undefined;
  }
  const rig = cameraRigsByGraphics.get(graphicsRef);
  if (!rig) {
    return undefined;
  }
  return rig.readState();
};

export const hasGraphicsCameraRig = (graphicsRef: GraphicsActorRef | undefined): boolean =>
  Boolean(graphicsRef && cameraRigsByGraphics.has(graphicsRef));

export const subscribeGraphicsCameraRegistry = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getGraphicsCameraRegistryVersion = (): number => version;
