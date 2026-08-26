import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { ActorRefFrom, CallbackActorLogic } from 'xstate';
import { createActor, fromCallback } from 'xstate';
import { createCameraState, createCameraView, resolveCameraFrame } from '@taucad/camera';
import type { CameraState } from '@taucad/camera';
import { cameraMachine, selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type {
  CameraDriverEvent,
  CameraDriverInput,
  CameraDriverSnapshot,
  CameraMachineInput,
} from '@taucad/camera/machine';

/** A native Three.js camera accepted by the portable camera capability. @public */
export type ThreeCamera = PerspectiveCamera | OrthographicCamera;

/** Options for {@link readThreeCameraState}. @public */
export type ReadThreeCameraStateOptions = Readonly<{
  camera: ThreeCamera;
  target: Vector3;
}>;

/**
 * Reads a native Three.js camera into Tau's complete renderer-neutral state.
 *
 * @param options - Camera and controls target in world coordinates.
 * @returns A copied serializable state that preserves placement, roll, projection, zoom, clipping, and aspect.
 * @public
 */
export const readThreeCameraState = ({ camera, target }: ReadThreeCameraStateOptions): CameraState => {
  const position = camera.getWorldPosition(new Vector3());
  const worldRotation = camera.getWorldQuaternion(new Quaternion());
  const up = new Vector3(0, 1, 0).applyQuaternion(worldRotation);
  const projection: CameraState['projection'] =
    camera instanceof PerspectiveCamera
      ? { kind: 'perspective', verticalFieldOfView: camera.fov, zoom: camera.zoom }
      : {
          kind: 'orthographic',
          verticalSpan: camera.top - camera.bottom,
          zoom: camera.zoom,
        };
  const aspect =
    camera instanceof PerspectiveCamera ? camera.aspect : (camera.right - camera.left) / (camera.top - camera.bottom);
  return createCameraState({
    position: [position.x, position.y, position.z],
    target: [target.x, target.y, target.z],
    up: [up.x, up.y, up.z],
    projection,
    clipping: { near: camera.near, far: camera.far },
    aspect,
  });
};

/** Options for the low-level Three.js camera driver. @public */
export type ThreeCameraDriverOptions = Readonly<{
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  onUpdate?: (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
}>;

/** Options for {@link createThreeCameraRig}. @public */
export type ThreeCameraRigOptions = CameraMachineInput &
  Readonly<{
    perspectiveCamera?: PerspectiveCamera;
    orthographicCamera?: OrthographicCamera;
    clipPlanes?: ThreeCameraClipPlanePolicy;
    onUpdate?: (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
  }>;

/** Host clipping policy applied after each bounds-derived endpoint synchronization. @public */
export type ThreeCameraClipPlanePolicy = Readonly<{
  near: number;
  minimumPerspectiveFar: number;
  orthographicFarMultiplier: number;
}>;

/** Persistent native endpoint cameras and their canonical actor. @public */
export type ThreeCameraRig = Readonly<{
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  actorRef: ActorRefFrom<typeof cameraMachine>;
  activeCamera: ThreeCamera;
  setClipPlanes: (clipPlanes: ThreeCameraClipPlanePolicy | undefined) => void;
  dispose: () => void;
}>;

const validateClipPlanes = (clipPlanes: ThreeCameraClipPlanePolicy): ThreeCameraClipPlanePolicy => {
  if (!Number.isFinite(clipPlanes.near) || clipPlanes.near <= 0) {
    throw new RangeError('clipPlanes.near must be finite and greater than zero.');
  }
  if (!Number.isFinite(clipPlanes.minimumPerspectiveFar) || clipPlanes.minimumPerspectiveFar <= clipPlanes.near) {
    throw new RangeError('clipPlanes.minimumPerspectiveFar must be finite and greater than clipPlanes.near.');
  }
  if (!Number.isFinite(clipPlanes.orthographicFarMultiplier) || clipPlanes.orthographicFarMultiplier < 1) {
    throw new RangeError('clipPlanes.orthographicFarMultiplier must be finite and at least one.');
  }
  return { ...clipPlanes };
};

const setPositionAndOrientation = ({
  camera,
  snapshot,
  distance,
}: {
  camera: ThreeCamera;
  snapshot: CameraDriverSnapshot;
  distance: number;
}): void => {
  const { direction, target, up } = snapshot.view;
  camera.position.set(
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance,
  );
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(new Vector3(...target));
};

const configurePerspectiveCamera = ({
  camera,
  snapshot,
}: {
  camera: PerspectiveCamera;
  snapshot: CameraDriverSnapshot;
}): void => {
  const frame = resolveCameraFrame({
    view: snapshot.view,
    verticalFieldOfView: snapshot.perspectiveVerticalFieldOfView,
  });
  if (frame.projection.kind !== 'perspective') {
    throw new Error('Perspective camera frame must use a positive field of view.');
  }
  camera.fov = frame.projection.verticalFieldOfView;
  camera.aspect = snapshot.view.viewport.width / snapshot.view.viewport.height;
  camera.zoom = 1;
  camera.near = frame.clipping.near;
  camera.far = frame.clipping.far;
  setPositionAndOrientation({ camera, snapshot, distance: frame.distance });
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
};

const configureOrthographicCamera = ({
  camera,
  snapshot,
}: {
  camera: OrthographicCamera;
  snapshot: CameraDriverSnapshot;
}): void => {
  const frame = resolveCameraFrame({ view: snapshot.view, verticalFieldOfView: 0 });
  if (!frame.frustum) {
    throw new Error('Orthographic camera frame must include a frustum.');
  }
  camera.left = frame.frustum.left;
  camera.right = frame.frustum.right;
  camera.top = frame.frustum.top;
  camera.bottom = frame.frustum.bottom;
  camera.zoom = 1;
  camera.near = frame.clipping.near;
  camera.far = frame.clipping.far;
  setPositionAndOrientation({ camera, snapshot, distance: frame.distance });
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
};

const synchronizeCameras = ({
  options,
  snapshot,
}: {
  options: ThreeCameraDriverOptions;
  snapshot: CameraDriverSnapshot;
}): ThreeCamera => {
  configurePerspectiveCamera({ camera: options.perspectiveCamera, snapshot });
  configureOrthographicCamera({ camera: options.orthographicCamera, snapshot });
  const activeCamera =
    snapshot.projection.kind === 'orthographic' ? options.orthographicCamera : options.perspectiveCamera;
  options.onUpdate?.(activeCamera, snapshot);
  return activeCamera;
};

/**
 * Creates the concrete XState callback driver that synchronizes native Three.js cameras.
 *
 * @param options - Persistent native cameras and optional update observer.
 * @returns XState callback actor logic for `cameraMachine.provide()`.
 * @public
 */
export const createThreeCameraDriver = (
  options: ThreeCameraDriverOptions,
): CallbackActorLogic<CameraDriverEvent, CameraDriverInput> =>
  fromCallback<CameraDriverEvent, CameraDriverInput>(({ input, receive }) => {
    synchronizeCameras({ options, snapshot: input.snapshot });
    receive((event) => {
      synchronizeCameras({ options, snapshot: event.snapshot });
    });
    return () => undefined;
  });

/**
 * Creates two persistent native endpoint cameras driven by one canonical actor.
 *
 * @param options - Initial canonical view, error budget, optional cameras, and update observer.
 * @returns An opaque disposable Three.js camera rig.
 * @public
 * @example <caption>Create and start a portable Three.js camera rig.</caption>
 * ```typescript
 * import { createCameraView } from '@taucad/camera';
 * import { createThreeCameraRig } from '@taucad/three';
 *
 * const initialView = createCameraView({
 *   requestedVerticalFieldOfView: 60,
 *   target: [0, 0, 0],
 *   direction: [1, -1, 0.7],
 *   up: [0, 0, 1],
 *   verticalSpan: 10,
 *   viewport: { width: 1280, height: 720, pixelRatio: 1 },
 *   bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
 * });
 * const rig = createThreeCameraRig({ initialView });
 * rig.actorRef.start();
 * rig.dispose();
 * ```
 */
export const createThreeCameraRig = (options: ThreeCameraRigOptions): ThreeCameraRig => {
  const perspectiveCamera = options.perspectiveCamera ?? new PerspectiveCamera();
  const orthographicCamera = options.orthographicCamera ?? new OrthographicCamera();
  const initialView = createCameraView(options.initialView);
  let clipPlanes = options.clipPlanes ? validateClipPlanes(options.clipPlanes) : undefined;
  let activeCamera: ThreeCamera =
    initialView.requestedVerticalFieldOfView === 0 ? orthographicCamera : perspectiveCamera;

  const applyClipPlanes = (): void => {
    if (!clipPlanes) {
      return;
    }
    perspectiveCamera.near = clipPlanes.near;
    perspectiveCamera.far = Math.max(perspectiveCamera.far, clipPlanes.minimumPerspectiveFar);
    perspectiveCamera.updateProjectionMatrix();

    orthographicCamera.near = clipPlanes.near;
    orthographicCamera.far = Math.max(
      orthographicCamera.far * clipPlanes.orthographicFarMultiplier,
      clipPlanes.near + 1e-3,
    );
    orthographicCamera.updateProjectionMatrix();
  };

  const driverOptions: ThreeCameraDriverOptions = {
    perspectiveCamera,
    orthographicCamera,
    onUpdate(camera, snapshot) {
      applyClipPlanes();
      activeCamera = camera;
      options.onUpdate?.(camera, snapshot);
    },
  };
  const driver = createThreeCameraDriver(driverOptions);
  const actorRef = createActor(cameraMachine.provide({ actors: { cameraDriver: driver } }), {
    input: { initialView, pixelBudget: options.pixelBudget },
  });
  synchronizeCameras({
    options: { perspectiveCamera, orthographicCamera },
    snapshot: selectCameraDriverSnapshot(actorRef.getSnapshot()),
  });
  applyClipPlanes();
  let disposed = false;

  return {
    perspectiveCamera,
    orthographicCamera,
    actorRef,
    get activeCamera() {
      return activeCamera;
    },
    setClipPlanes(nextClipPlanes) {
      const validated = nextClipPlanes ? validateClipPlanes(nextClipPlanes) : undefined;
      if (
        validated?.near === clipPlanes?.near &&
        validated?.minimumPerspectiveFar === clipPlanes?.minimumPerspectiveFar &&
        validated?.orthographicFarMultiplier === clipPlanes?.orthographicFarMultiplier
      ) {
        return;
      }
      clipPlanes = validated;
      synchronizeCameras({
        options: driverOptions,
        snapshot: selectCameraDriverSnapshot(actorRef.getSnapshot()),
      });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      actorRef.stop();
    },
  };
};
