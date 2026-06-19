import * as THREE from 'three';

export type ControlEvent = { readonly type: string };
export type ControlEventListener = (event: ControlEvent) => void;

export type SetLookAtArguments = [
  positionX: number,
  positionY: number,
  positionZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  enableTransition?: boolean,
];

export type SetPositionArguments = [
  positionX: number,
  positionY: number,
  positionZ: number,
  enableTransition?: boolean,
];

export type SetTargetArguments = [targetX: number, targetY: number, targetZ: number, enableTransition?: boolean];

export type CameraControlsLike = {
  enabled?: boolean;
  readonly camera?: THREE.Camera;
  getTarget: (target: THREE.Vector3, receiveEndValue?: boolean) => THREE.Vector3;
  getDistance?: () => number;
  setLookAt?: (...args: SetLookAtArguments) => Promise<unknown> | void;
  setPosition?: (...args: SetPositionArguments) => Promise<unknown> | void;
  setTarget?: (...args: SetTargetArguments) => Promise<unknown> | void;
  updateCameraUp?: () => void;
  applyCameraUp?: () => void;
  update?: (delta?: number) => boolean | void;
  addEventListener?: (type: string, listener: ControlEventListener) => void;
  removeEventListener?: (type: string, listener: ControlEventListener) => void;
};

export type ClassicTargetControlsLike = {
  enabled?: boolean;
  readonly object?: THREE.Camera;
  readonly camera?: THREE.Camera;
  target: THREE.Vector3;
  update: () => void;
  addEventListener?: (type: string, listener: ControlEventListener) => void;
  removeEventListener?: (type: string, listener: ControlEventListener) => void;
};

export type CameraControlSurface = CameraControlsLike | ClassicTargetControlsLike;

export type ControlsListenerEventNames = {
  readonly start: string;
  readonly stateChange: string;
  readonly userMove: string;
  readonly end: string;
};

export const isClassicTargetControls = (controls: unknown): controls is ClassicTargetControlsLike => {
  return (
    typeof controls === 'object' &&
    controls !== null &&
    'target' in controls &&
    'update' in controls &&
    (controls as { target?: unknown }).target instanceof THREE.Vector3
  );
};

export const isCameraControls = (controls: unknown): controls is CameraControlsLike => {
  return (
    typeof controls === 'object' &&
    controls !== null &&
    typeof (controls as { getTarget?: unknown }).getTarget === 'function'
  );
};

export const resolveControlsTarget = ({
  camera,
  controls,
}: {
  readonly camera: THREE.Camera;
  readonly controls?: unknown;
}): THREE.Vector3 => {
  if (isCameraControls(controls)) {
    return controls.getTarget(camera.position.clone(), false).clone();
  }

  if (isClassicTargetControls(controls)) {
    return controls.target.clone();
  }

  return new THREE.Vector3(0, 0, 0);
};

export const getControlsDistance = ({
  camera,
  controls,
}: {
  readonly camera: THREE.Camera;
  readonly controls?: unknown;
}): number => {
  if (isCameraControls(controls) && typeof controls.getDistance === 'function') {
    return controls.getDistance();
  }

  const target = resolveControlsTarget({ camera, controls });
  return camera.position.distanceTo(target);
};

export const syncControlsLookAt = ({
  camera,
  controls,
  target,
  transition = false,
}: {
  readonly camera: THREE.Camera;
  readonly controls?: unknown;
  readonly target: THREE.Vector3;
  readonly transition?: boolean;
}): void => {
  if (isCameraControls(controls)) {
    if (typeof controls.setLookAt === 'function') {
      void controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        target.x,
        target.y,
        target.z,
        transition,
      );
      return;
    }

    if (typeof controls.setTarget === 'function') {
      void controls.setTarget(target.x, target.y, target.z, transition);
    }

    if (typeof controls.setPosition === 'function') {
      void controls.setPosition(camera.position.x, camera.position.y, camera.position.z, transition);
    }

    return;
  }

  if (isClassicTargetControls(controls)) {
    controls.target.copy(target);
    controls.update();
  }
};

export const syncCameraControlsUp = ({
  camera,
  controls,
  up,
}: {
  readonly camera: THREE.Camera;
  readonly controls?: unknown;
  readonly up: THREE.Vector3;
}): void => {
  camera.up.copy(up);

  if (isCameraControls(controls) && typeof controls.updateCameraUp === 'function') {
    controls.updateCameraUp();
  }
};

export const getControlsListenerEventNames = (controls: unknown): ControlsListenerEventNames => {
  if (isCameraControls(controls)) {
    return {
      start: 'controlstart',
      stateChange: 'update',
      userMove: 'control',
      end: 'controlend',
    };
  }

  return {
    start: 'start',
    stateChange: 'change',
    userMove: 'change',
    end: 'end',
  };
};
