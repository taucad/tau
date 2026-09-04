import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { ActorRefFrom, CallbackActorLogic } from 'xstate';
import { createActor, fromCallback } from 'xstate';
import { createCameraState, createCameraView, resolveCameraState } from '@taucad/camera';
import type { CameraState } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { cameraMachine, selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type {
  CameraDriverEvent,
  CameraDriverInput,
  CameraDriverSnapshot,
  CameraMachineInput,
} from '@taucad/camera/machine';
import { fromThreeRenderPoint, toThreeRenderPoint } from '#spatial.js';

/** A native Three.js camera accepted by the portable camera capability. @public */
export type ThreeCamera = PerspectiveCamera | OrthographicCamera;

/** Options for {@link readThreeCameraState}. */
type ReadThreeCameraStateOptions = Readonly<{
  camera: ThreeCamera;
  target: Vector3;
  renderFrame: RenderFrame;
}>;

/**
 * Reads a native Three.js camera into Tau's complete renderer-neutral state.
 *
 * @param options - Camera and controls target in world coordinates.
 * @returns A copied serializable state that preserves placement, roll, projection, zoom, clipping, and aspect.
 * @public
 */
export const readThreeCameraState = ({ camera, target, renderFrame }: ReadThreeCameraStateOptions): CameraState => {
  const position = camera.getWorldPosition(new Vector3());
  const worldRotation = camera.getWorldQuaternion(new Quaternion());
  const up = new Vector3(0, 1, 0).applyQuaternion(worldRotation);
  const nearMeters = camera.near * renderFrame.metersPerRenderUnit;
  // A signed native orthographic extent is presentation-only; keep the renderer-neutral state strictly positive.
  const readableNearMeters =
    camera instanceof OrthographicCamera
      ? Math.max(position.distanceTo(target) * renderFrame.metersPerRenderUnit * 1e-9, nearMeters)
      : nearMeters;
  const projection: CameraState['projection'] =
    camera instanceof PerspectiveCamera
      ? { kind: 'perspective', verticalFieldOfView: camera.fov, zoom: camera.zoom }
      : {
          kind: 'orthographic',
          verticalSpan: (camera.top - camera.bottom) * renderFrame.metersPerRenderUnit,
          zoom: camera.zoom,
        };
  const aspect =
    camera instanceof PerspectiveCamera ? camera.aspect : (camera.right - camera.left) / (camera.top - camera.bottom);
  return createCameraState({
    frameId: renderFrame.anchorFrameId,
    position: fromThreeRenderPoint({ renderFrame, point: position }),
    target: fromThreeRenderPoint({ renderFrame, point: target }),
    up: [up.x, up.y, up.z],
    projection,
    clipping: {
      near: readableNearMeters,
      far: camera.far * renderFrame.metersPerRenderUnit,
    },
    aspect,
  });
};

/** Values used to synchronize the retained native cameras. */
type ThreeCameraDriverOptions = Readonly<{
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  getRenderFrame: () => RenderFrame;
  getClipPlanes?: () => ThreeCameraClipPlanePolicy | undefined;
  onUpdate?: (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
}>;

/** Options for {@link createThreeCameraRig}. */
type ThreeCameraRigOptions = CameraMachineInput &
  Readonly<{
    clipPlanes?: ThreeCameraClipPlanePolicy;
    renderFrame?: RenderFrame;
    onUpdate?: (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
  }>;

/** Host clipping policy applied after each bounds-derived endpoint synchronization. */
type ThreeCameraClipPlanePolicy = Readonly<{
  farPaddingVerticalSpans: number;
  presentationPlaneOffsetMeters?: number;
}>;

/** Persistent native endpoint cameras and their canonical actor. @public */
export type ThreeCameraRig = Readonly<{
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  actorRef: ActorRefFrom<typeof cameraMachine>;
  activeCamera: ThreeCamera;
  renderFrame: RenderFrame;
  setRenderFrame: (renderFrame: RenderFrame) => void;
  readState: () => CameraState;
  setClipPlanes: (clipPlanes: ThreeCameraClipPlanePolicy | undefined) => void;
  dispose: () => void;
}>;

const validateClipPlanes = (clipPlanes: ThreeCameraClipPlanePolicy): ThreeCameraClipPlanePolicy => {
  if (!Number.isFinite(clipPlanes.farPaddingVerticalSpans) || clipPlanes.farPaddingVerticalSpans < 0) {
    throw new RangeError('clipPlanes.farPaddingVerticalSpans must be finite and non-negative.');
  }
  if (
    clipPlanes.presentationPlaneOffsetMeters !== undefined &&
    !Number.isFinite(clipPlanes.presentationPlaneOffsetMeters)
  ) {
    throw new RangeError('clipPlanes.presentationPlaneOffsetMeters must be finite.');
  }
  return { ...clipPlanes };
};

const presentationViewportGuardPhysicalPixels = 2;

const resolveNativeNear = ({
  clipPlanes,
  renderFrame,
  snapshot,
  state,
}: {
  readonly clipPlanes: ThreeCameraClipPlanePolicy | undefined;
  readonly renderFrame: RenderFrame;
  readonly snapshot: CameraDriverSnapshot;
  readonly state: CameraState;
}): number => {
  const planeOffsetMeters = clipPlanes?.presentationPlaneOffsetMeters;
  if (planeOffsetMeters === undefined) {
    return state.clipping.near / renderFrame.metersPerRenderUnit;
  }

  const directionX = state.position[0] - state.target[0];
  const directionY = state.position[1] - state.target[1];
  const directionZ = state.position[2] - state.target[2];
  const distance = Math.hypot(directionX, directionY, directionZ);
  const normalizedDirectionX = directionX / distance;
  const normalizedDirectionY = directionY / distance;
  const normalizedDirectionZ = directionZ / distance;
  const upLength = Math.hypot(state.up[0], state.up[1], state.up[2]);
  const normalX = state.up[0] / upLength;
  const normalY = state.up[1] / upLength;
  const normalZ = state.up[2] / upLength;
  const rightX = normalY * normalizedDirectionZ - normalZ * normalizedDirectionY;
  const rightY = normalZ * normalizedDirectionX - normalX * normalizedDirectionZ;
  const rightZ = normalX * normalizedDirectionY - normalY * normalizedDirectionX;
  const rightLength = Math.hypot(rightX, rightY, rightZ);
  const normalizedRightX = rightX / rightLength;
  const normalizedRightY = rightY / rightLength;
  const normalizedRightZ = rightZ / rightLength;
  const screenUpX = normalizedDirectionY * normalizedRightZ - normalizedDirectionZ * normalizedRightY;
  const screenUpY = normalizedDirectionZ * normalizedRightX - normalizedDirectionX * normalizedRightZ;
  const screenUpZ = normalizedDirectionX * normalizedRightY - normalizedDirectionY * normalizedRightX;
  const guardedViewportMagnitude =
    1 +
    (2 * presentationViewportGuardPhysicalPixels) / (snapshot.view.viewport.height * snapshot.view.viewport.pixelRatio);
  const forwardX = -normalizedDirectionX;
  const forwardY = -normalizedDirectionY;
  const forwardZ = -normalizedDirectionZ;
  let lowerRayOriginX = state.position[0];
  let lowerRayOriginY = state.position[1];
  let lowerRayOriginZ = state.position[2];
  let upperRayOriginX = state.position[0];
  let upperRayOriginY = state.position[1];
  let upperRayOriginZ = state.position[2];
  let lowerRayDirectionX = forwardX;
  let lowerRayDirectionY = forwardY;
  let lowerRayDirectionZ = forwardZ;
  let upperRayDirectionX = forwardX;
  let upperRayDirectionY = forwardY;
  let upperRayDirectionZ = forwardZ;

  if (state.projection.kind === 'perspective') {
    const guardedSlope =
      (guardedViewportMagnitude * Math.tan((state.projection.verticalFieldOfView * Math.PI) / 360)) /
      state.projection.zoom;
    lowerRayDirectionX -= guardedSlope * screenUpX;
    lowerRayDirectionY -= guardedSlope * screenUpY;
    lowerRayDirectionZ -= guardedSlope * screenUpZ;
    upperRayDirectionX += guardedSlope * screenUpX;
    upperRayDirectionY += guardedSlope * screenUpY;
    upperRayDirectionZ += guardedSlope * screenUpZ;
  } else {
    const guardedVerticalOffset = guardedViewportMagnitude * (state.projection.verticalSpan / 2);
    lowerRayOriginX -= guardedVerticalOffset * screenUpX;
    lowerRayOriginY -= guardedVerticalOffset * screenUpY;
    lowerRayOriginZ -= guardedVerticalOffset * screenUpZ;
    upperRayOriginX += guardedVerticalOffset * screenUpX;
    upperRayOriginY += guardedVerticalOffset * screenUpY;
    upperRayOriginZ += guardedVerticalOffset * screenUpZ;
  }

  const lowerPlaneSignedDistance =
    planeOffsetMeters - (normalX * lowerRayOriginX + normalY * lowerRayOriginY + normalZ * lowerRayOriginZ);
  const upperPlaneSignedDistance =
    planeOffsetMeters - (normalX * upperRayOriginX + normalY * upperRayOriginY + normalZ * upperRayOriginZ);
  const lowerPlaneDenominator =
    normalX * lowerRayDirectionX + normalY * lowerRayDirectionY + normalZ * lowerRayDirectionZ;
  const upperPlaneDenominator =
    normalX * upperRayDirectionX + normalY * upperRayDirectionY + normalZ * upperRayDirectionZ;
  const lowerPlaneDepth = lowerPlaneSignedDistance / lowerPlaneDenominator;
  const upperPlaneDepth = upperPlaneSignedDistance / upperPlaneDenominator;
  const minimumNear = Math.max(distance * 1e-9, Number.MIN_VALUE);
  const minimumPlaneSignedDistance = Math.min(lowerPlaneSignedDistance, upperPlaneSignedDistance);
  const maximumPlaneSignedDistance = Math.max(lowerPlaneSignedDistance, upperPlaneSignedDistance);
  const orthographicPlaneApproachesZeroFromForward =
    state.projection.kind === 'orthographic' &&
    Number.isFinite(lowerPlaneSignedDistance) &&
    Number.isFinite(upperPlaneSignedDistance) &&
    Number.isFinite(lowerPlaneDenominator) &&
    Number.isFinite(lowerPlaneDepth) &&
    Number.isFinite(upperPlaneDepth) &&
    lowerPlaneDenominator !== 0 &&
    minimumPlaneSignedDistance <= 0 &&
    maximumPlaneSignedDistance >= 0 &&
    (lowerPlaneDenominator > 0 ? maximumPlaneSignedDistance > 0 : minimumPlaneSignedDistance < 0);
  let nearMeters = state.clipping.near;
  if (orthographicPlaneApproachesZeroFromForward) {
    // Orthographic projection is affine: preserve the guarded plane on both sides of the camera plane.
    nearMeters = Math.min(lowerPlaneDepth, upperPlaneDepth);
  } else {
    if (Number.isFinite(lowerPlaneDepth) && lowerPlaneDepth > 0) {
      nearMeters = Math.min(nearMeters, lowerPlaneDepth);
    }
    if (Number.isFinite(upperPlaneDepth) && upperPlaneDepth > 0) {
      nearMeters = Math.min(nearMeters, upperPlaneDepth);
    }
  }
  return (
    (orthographicPlaneApproachesZeroFromForward ? nearMeters : Math.max(minimumNear, nearMeters)) /
    renderFrame.metersPerRenderUnit
  );
};

const resolveNativeFar = ({
  farMeters,
  clipPlanes,
  snapshot,
  renderFrame,
}: {
  readonly farMeters: number;
  readonly clipPlanes: ThreeCameraClipPlanePolicy | undefined;
  readonly snapshot: CameraDriverSnapshot;
  readonly renderFrame: RenderFrame;
}): number =>
  (farMeters + snapshot.view.verticalSpan * (clipPlanes?.farPaddingVerticalSpans ?? 0)) /
  renderFrame.metersPerRenderUnit;

const identityRenderFrame = (anchorFrameId: string): RenderFrame => ({
  anchorFrameId,
  originMeters: [0, 0, 0],
  metersPerRenderUnit: 1,
});

const validateRenderFrameForView = (renderFrame: RenderFrame, frameId: string): RenderFrame => {
  if (renderFrame.anchorFrameId !== frameId) {
    throw new RangeError(
      `renderFrame.anchorFrameId '${renderFrame.anchorFrameId}' must match camera frameId '${frameId}'.`,
    );
  }
  toThreeRenderPoint({ renderFrame, pointMeters: renderFrame.originMeters });
  return renderFrame;
};

const setPositionAndOrientation = ({
  camera,
  state,
  renderFrame,
}: {
  camera: ThreeCamera;
  state: CameraState;
  renderFrame: RenderFrame;
}): void => {
  camera.position.copy(toThreeRenderPoint({ renderFrame, pointMeters: state.position }));
  camera.up.set(state.up[0], state.up[1], state.up[2]);
  camera.lookAt(toThreeRenderPoint({ renderFrame, pointMeters: state.target }));
};

const configurePerspectiveCamera = ({
  camera,
  clipPlanes,
  snapshot,
  renderFrame,
}: {
  camera: PerspectiveCamera;
  clipPlanes: ThreeCameraClipPlanePolicy | undefined;
  snapshot: CameraDriverSnapshot;
  renderFrame: RenderFrame;
}): void => {
  const state = resolveCameraState({
    view: snapshot.view,
    verticalFieldOfView: snapshot.perspectiveVerticalFieldOfView,
  });
  if (state.projection.kind !== 'perspective') {
    throw new Error('Perspective camera frame must use a positive field of view.');
  }
  camera.fov = state.projection.verticalFieldOfView;
  camera.aspect = state.aspect;
  camera.zoom = state.projection.zoom;
  camera.near = resolveNativeNear({ clipPlanes, renderFrame, snapshot, state });
  camera.far = resolveNativeFar({ farMeters: state.clipping.far, clipPlanes, snapshot, renderFrame });
  setPositionAndOrientation({ camera, state, renderFrame });
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
};

const configureOrthographicCamera = ({
  camera,
  clipPlanes,
  snapshot,
  renderFrame,
}: {
  camera: OrthographicCamera;
  clipPlanes: ThreeCameraClipPlanePolicy | undefined;
  snapshot: CameraDriverSnapshot;
  renderFrame: RenderFrame;
}): void => {
  const state = resolveCameraState({ view: snapshot.view, verticalFieldOfView: 0 });
  if (state.projection.kind !== 'orthographic') {
    throw new Error('Orthographic camera frame must include a frustum.');
  }
  const halfHeight = state.projection.verticalSpan / 2;
  const halfWidth = halfHeight * state.aspect;
  camera.left = -halfWidth / renderFrame.metersPerRenderUnit;
  camera.right = halfWidth / renderFrame.metersPerRenderUnit;
  camera.top = halfHeight / renderFrame.metersPerRenderUnit;
  camera.bottom = -halfHeight / renderFrame.metersPerRenderUnit;
  camera.zoom = state.projection.zoom;
  camera.near = resolveNativeNear({ clipPlanes, renderFrame, snapshot, state });
  camera.far = resolveNativeFar({ farMeters: state.clipping.far, clipPlanes, snapshot, renderFrame });
  setPositionAndOrientation({ camera, state, renderFrame });
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
  const renderFrame = validateRenderFrameForView(options.getRenderFrame(), snapshot.view.frameId);
  const clipPlanes = options.getClipPlanes?.();
  configurePerspectiveCamera({ camera: options.perspectiveCamera, clipPlanes, snapshot, renderFrame });
  configureOrthographicCamera({ camera: options.orthographicCamera, clipPlanes, snapshot, renderFrame });
  const activeCamera =
    snapshot.projection.kind === 'orthographic' ? options.orthographicCamera : options.perspectiveCamera;
  options.onUpdate?.(activeCamera, snapshot);
  return activeCamera;
};

const createThreeCameraDriver = (
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
 * @param options - Initial canonical view, error budget, clip/render-frame policy, and update observer.
 * @returns An opaque disposable Three.js camera rig.
 * @public
 * @example <caption>Create and start a portable Three.js camera rig.</caption>
 * ```typescript
 * import { createCameraView } from '@taucad/camera';
 * import { createThreeCameraRig } from '@taucad/three';
 *
 * const initialView = createCameraView({
 *   frameId: 'tau:root',
 *   requestedVerticalFieldOfView: 60,
 *   perspectiveZoom: 1,
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
  const perspectiveCamera = new PerspectiveCamera();
  const orthographicCamera = new OrthographicCamera();
  const initialView = createCameraView(options.initialView);
  let renderFrame = validateRenderFrameForView(
    options.renderFrame ?? identityRenderFrame(initialView.frameId),
    initialView.frameId,
  );
  let clipPlanes = options.clipPlanes ? validateClipPlanes(options.clipPlanes) : undefined;
  let activeCamera: ThreeCamera =
    initialView.requestedVerticalFieldOfView === 0 ? orthographicCamera : perspectiveCamera;

  const driverOptions: ThreeCameraDriverOptions = {
    perspectiveCamera,
    orthographicCamera,
    getRenderFrame: () => renderFrame,
    getClipPlanes: () => clipPlanes,
    onUpdate(camera, snapshot) {
      activeCamera = camera;
      options.onUpdate?.(camera, snapshot);
    },
  };
  const actorRef = createActor(
    cameraMachine.provide({ actors: { cameraDriver: createThreeCameraDriver(driverOptions) } }),
    {
      input: { initialView, pixelBudget: options.pixelBudget },
    },
  );
  synchronizeCameras({
    options: { ...driverOptions, onUpdate: undefined },
    snapshot: selectCameraDriverSnapshot(actorRef.getSnapshot()),
  });
  let disposed = false;

  return {
    perspectiveCamera,
    orthographicCamera,
    actorRef,
    get activeCamera() {
      return activeCamera;
    },
    get renderFrame() {
      return renderFrame;
    },
    setRenderFrame(nextRenderFrame) {
      const validated = validateRenderFrameForView(nextRenderFrame, initialView.frameId);
      if (
        validated.anchorFrameId === renderFrame.anchorFrameId &&
        validated.metersPerRenderUnit === renderFrame.metersPerRenderUnit &&
        validated.originMeters.every((value, index) => value === renderFrame.originMeters[index])
      ) {
        return;
      }
      renderFrame = validated;
      synchronizeCameras({
        options: driverOptions,
        snapshot: selectCameraDriverSnapshot(actorRef.getSnapshot()),
      });
    },
    readState() {
      const { target } = actorRef.getSnapshot().context.view;
      return readThreeCameraState({
        camera: activeCamera,
        target: toThreeRenderPoint({ renderFrame, pointMeters: target }),
        renderFrame,
      });
    },
    setClipPlanes(nextClipPlanes) {
      const validated = nextClipPlanes ? validateClipPlanes(nextClipPlanes) : undefined;
      if (
        validated?.farPaddingVerticalSpans === clipPlanes?.farPaddingVerticalSpans &&
        validated?.presentationPlaneOffsetMeters === clipPlanes?.presentationPlaneOffsetMeters
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
