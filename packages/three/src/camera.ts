import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Actor } from 'xstate';
import { createCallbackLogic } from 'xstate';
import { createCameraState, createCameraView, resolveCameraState } from '@taucad/camera';
import type { CameraState, CameraVector } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { cameraMachine, createCameraActor, selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type {
  CameraActorOptions,
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

/** Options for {@link createThreeCameraRig}. */
type ThreeCameraRigOptions = Pick<CameraMachineInput, 'initialView' | 'pixelBudget'> &
  Pick<CameraActorOptions, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    clipPlanes?: ThreeCameraClipPlanePolicy;
    renderFrame?: RenderFrame;
    onUpdate?: (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
  }>;

/** Host clipping policy applied after each bounds-derived endpoint synchronization. */
type ThreeCameraClipPlanePolicy = Readonly<{
  farPaddingVerticalSpans: number;
  presentationPlane?: Readonly<{
    normal: CameraVector;
    offsetMeters: number;
  }>;
}>;

/** Persistent native endpoint cameras and their canonical actor. @public */
export type ThreeCameraRig = Readonly<{
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  actorRef: Actor<typeof cameraMachine>;
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
  const plane = clipPlanes.presentationPlane;
  if (plane === undefined) {
    return { farPaddingVerticalSpans: clipPlanes.farPaddingVerticalSpans };
  }
  const normal: [number, number, number] = [plane.normal[0], plane.normal[1], plane.normal[2]];
  for (const [index, value] of normal.entries()) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`clipPlanes.presentationPlane.normal[${index}] must be finite.`);
    }
  }
  if (Math.hypot(...normal) === 0) {
    throw new RangeError('clipPlanes.presentationPlane.normal must have non-zero length.');
  }
  if (!Number.isFinite(plane.offsetMeters)) {
    throw new RangeError('clipPlanes.presentationPlane.offsetMeters must be finite.');
  }
  return {
    farPaddingVerticalSpans: clipPlanes.farPaddingVerticalSpans,
    presentationPlane: { normal, offsetMeters: plane.offsetMeters },
  };
};

const presentationViewportGuardPhysicalPixels = 2;

const strictlyBeforePlaneDepth = (depth: number): number =>
  depth - Math.max(Math.abs(depth) * Number.EPSILON, Number.MIN_VALUE);

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
  const plane = clipPlanes?.presentationPlane;
  if (plane === undefined) {
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
  const upX = state.up[0] / upLength;
  const upY = state.up[1] / upLength;
  const upZ = state.up[2] / upLength;
  const normalLength = Math.hypot(...plane.normal);
  const normalX = plane.normal[0] / normalLength;
  const normalY = plane.normal[1] / normalLength;
  const normalZ = plane.normal[2] / normalLength;
  const rightX = upY * normalizedDirectionZ - upZ * normalizedDirectionY;
  const rightY = upZ * normalizedDirectionX - upX * normalizedDirectionZ;
  const rightZ = upX * normalizedDirectionY - upY * normalizedDirectionX;
  const rightLength = Math.hypot(rightX, rightY, rightZ);
  const normalizedRightX = rightX / rightLength;
  const normalizedRightY = rightY / rightLength;
  const normalizedRightZ = rightZ / rightLength;
  const screenUpX = normalizedDirectionY * normalizedRightZ - normalizedDirectionZ * normalizedRightY;
  const screenUpY = normalizedDirectionZ * normalizedRightX - normalizedDirectionX * normalizedRightZ;
  const screenUpZ = normalizedDirectionX * normalizedRightY - normalizedDirectionY * normalizedRightX;
  const guardedViewportX =
    1 +
    (2 * presentationViewportGuardPhysicalPixels) / (snapshot.view.viewport.width * snapshot.view.viewport.pixelRatio);
  const guardedViewportY =
    1 +
    (2 * presentationViewportGuardPhysicalPixels) / (snapshot.view.viewport.height * snapshot.view.viewport.pixelRatio);
  const forwardX = -normalizedDirectionX;
  const forwardY = -normalizedDirectionY;
  const forwardZ = -normalizedDirectionZ;
  const verticalSlopeOrHalfSpan =
    state.projection.kind === 'perspective'
      ? Math.tan((state.projection.verticalFieldOfView * Math.PI) / 360) / state.projection.zoom
      : state.projection.verticalSpan / 2;
  const guardedViewportCorners = [
    [-guardedViewportX, -guardedViewportY],
    [-guardedViewportX, guardedViewportY],
    [guardedViewportX, -guardedViewportY],
    [guardedViewportX, guardedViewportY],
  ] as const;
  const planeSamples = guardedViewportCorners.map(([viewportX, viewportY]) => {
    const horizontalOffset = viewportX * verticalSlopeOrHalfSpan * state.aspect;
    const verticalOffset = viewportY * verticalSlopeOrHalfSpan;
    const offsetX = horizontalOffset * normalizedRightX + verticalOffset * screenUpX;
    const offsetY = horizontalOffset * normalizedRightY + verticalOffset * screenUpY;
    const offsetZ = horizontalOffset * normalizedRightZ + verticalOffset * screenUpZ;
    const rayOriginX = state.position[0] + (state.projection.kind === 'orthographic' ? offsetX : 0);
    const rayOriginY = state.position[1] + (state.projection.kind === 'orthographic' ? offsetY : 0);
    const rayOriginZ = state.position[2] + (state.projection.kind === 'orthographic' ? offsetZ : 0);
    const rayDirectionX = forwardX + (state.projection.kind === 'perspective' ? offsetX : 0);
    const rayDirectionY = forwardY + (state.projection.kind === 'perspective' ? offsetY : 0);
    const rayDirectionZ = forwardZ + (state.projection.kind === 'perspective' ? offsetZ : 0);
    const signedDistance = plane.offsetMeters - (normalX * rayOriginX + normalY * rayOriginY + normalZ * rayOriginZ);
    const denominator = normalX * rayDirectionX + normalY * rayDirectionY + normalZ * rayDirectionZ;
    return { denominator, depth: signedDistance / denominator, signedDistance };
  });
  const minimumNear = Math.max(distance * 1e-9, Number.MIN_VALUE);
  const minimumPlaneSignedDistance = Math.min(...planeSamples.map(({ signedDistance }) => signedDistance));
  const maximumPlaneSignedDistance = Math.max(...planeSamples.map(({ signedDistance }) => signedDistance));
  const orthographicPlaneDenominator = planeSamples[0]!.denominator;
  const orthographicPlaneApproachesZeroFromForward =
    state.projection.kind === 'orthographic' &&
    planeSamples.every(({ denominator, depth, signedDistance }) =>
      [denominator, depth, signedDistance].every((value) => Number.isFinite(value)),
    ) &&
    orthographicPlaneDenominator !== 0 &&
    minimumPlaneSignedDistance <= 0 &&
    maximumPlaneSignedDistance >= 0 &&
    (orthographicPlaneDenominator > 0 ? maximumPlaneSignedDistance > 0 : minimumPlaneSignedDistance < 0);
  let nearMeters = state.clipping.near;
  if (orthographicPlaneApproachesZeroFromForward) {
    // Orthographic projection is affine: preserve the guarded plane on both sides of the camera plane.
    nearMeters = strictlyBeforePlaneDepth(Math.min(...planeSamples.map(({ depth }) => depth)));
  } else {
    for (const { depth } of planeSamples) {
      if (Number.isFinite(depth) && depth > 0) {
        nearMeters = Math.min(nearMeters, strictlyBeforePlaneDepth(depth));
      }
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

/* Presents `snapshot` on both native cameras and returns the one its projection selects. */
const synchronizeCameras = (
  perspectiveCamera: PerspectiveCamera,
  orthographicCamera: OrthographicCamera,
  snapshot: CameraDriverSnapshot,
): ThreeCamera => {
  const renderFrame = validateRenderFrameForView(snapshot.renderFrame, snapshot.view.frameId);
  const clipPlanes = snapshot.clipPolicy;
  configurePerspectiveCamera({ camera: perspectiveCamera, clipPlanes, snapshot, renderFrame });
  configureOrthographicCamera({ camera: orthographicCamera, clipPlanes, snapshot, renderFrame });
  return snapshot.projection.kind === 'orthographic' ? orthographicCamera : perspectiveCamera;
};

const sameRenderFrame = (left: RenderFrame, right: RenderFrame): boolean =>
  left.anchorFrameId === right.anchorFrameId &&
  left.metersPerRenderUnit === right.metersPerRenderUnit &&
  left.originMeters.every((value, index) => value === right.originMeters[index]);

const sameClipPlanes = (
  left: ThreeCameraClipPlanePolicy | undefined,
  right: ThreeCameraClipPlanePolicy | undefined,
): boolean =>
  left?.farPaddingVerticalSpans === right?.farPaddingVerticalSpans &&
  left?.presentationPlane?.offsetMeters === right?.presentationPlane?.offsetMeters &&
  left?.presentationPlane?.normal.every((value, index) => value === right?.presentationPlane?.normal[index]) !== false;

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
  /*
   * The presentation rule. The rig's render frame and clip policy (the mirror) are what the native cameras present:
   * every presentation pairs the latest camera snapshot's view with the mirror. A rig setter changes the mirror and
   * presents at once, then tells the camera actor only while the rig's own actor is live (started, not stopped). A
   * frame or policy change that reaches the driver from the actor, and that the rig did not send, updates the mirror.
   */
  let renderFrame = validateRenderFrameForView(
    options.renderFrame ?? identityRenderFrame(initialView.frameId),
    initialView.frameId,
  );
  let clipPlanes = options.clipPlanes ? validateClipPlanes(options.clipPlanes) : undefined;
  let activeCamera: ThreeCamera =
    initialView.requestedVerticalFieldOfView === 0 ? orthographicCamera : perspectiveCamera;
  let live = false;
  let disposed = false;
  // How many frame and policy events the rig sent the actor that the driver has not yet seen it take.
  let pendingFrames = 0;
  let pendingPolicies = 0;
  // The last presentation, so a synchronization that changes nothing presented does not notify again.
  let presented: readonly [revision: number, RenderFrame, ThreeCameraClipPlanePolicy | undefined] | undefined;

  /* Presents the latest view in the mirrored frame and policy, and notifies once per distinct presentation. */
  const present = (notify = true): void => {
    if (presented?.[0] === latest.revision && presented[1] === renderFrame && presented[2] === clipPlanes) {
      return;
    }
    const snapshot: CameraDriverSnapshot = { ...latest, renderFrame, clipPolicy: clipPlanes };
    activeCamera = synchronizeCameras(perspectiveCamera, orthographicCamera, snapshot);
    if (notify) {
      presented = [latest.revision, renderFrame, clipPlanes];
      options.onUpdate?.(activeCamera, snapshot);
    }
  };

  const cameraDriver = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ receive, sendBack, system }) => {
    // The driver is shared by every actor made from this logic, such as one restored from a persisted snapshot.
    const own = system === actorRef.system;
    live ||= own;
    pendingFrames = 0;
    pendingPolicies = 0;
    presented = undefined;
    present();
    // The actor learns what the rig presented while it was not running, in one event each.
    if (!sameRenderFrame(renderFrame, latest.renderFrame)) {
      pendingFrames += 1;
      sendBack({ type: 'setRenderFrame', renderFrame });
    }
    if (!sameClipPlanes(clipPlanes, latest.clipPolicy)) {
      pendingPolicies += 1;
      sendBack({ type: 'setClipPolicy', clipPolicy: clipPlanes });
    }
    receive(({ snapshot }) => {
      if (!sameRenderFrame(snapshot.renderFrame, latest.renderFrame)) {
        if (pendingFrames > 0) {
          pendingFrames -= 1;
        } else {
          ({ renderFrame } = snapshot);
        }
      }
      if (!sameClipPlanes(snapshot.clipPolicy, latest.clipPolicy)) {
        if (pendingPolicies > 0) {
          pendingPolicies -= 1;
        } else {
          clipPlanes = snapshot.clipPolicy;
        }
      }
      latest = snapshot;
      present();
    });
    return () => {
      live &&= !own;
    };
  });
  const actorRef = createCameraActor({
    machine: cameraMachine.provide({ actors: { cameraDriver } }),
    input: { initialView, pixelBudget: options.pixelBudget, renderFrame, clipPolicy: clipPlanes },
    clock: options.clock,
    inspect: options.inspect,
    onRejectedEvent: options.onRejectedEvent,
  });
  let latest = selectCameraDriverSnapshot(actorRef.getSnapshot());
  present(false);

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
      if (sameRenderFrame(validated, renderFrame)) {
        return;
      }
      renderFrame = validated;
      present();
      if (live) {
        pendingFrames += 1;
        actorRef.send({ type: 'setRenderFrame', renderFrame: validated });
      }
    },
    readState() {
      return readThreeCameraState({
        camera: activeCamera,
        target: toThreeRenderPoint({ renderFrame, pointMeters: latest.view.target }),
        renderFrame,
      });
    },
    setClipPlanes(nextClipPlanes) {
      const validated = nextClipPlanes ? validateClipPlanes(nextClipPlanes) : undefined;
      if (sameClipPlanes(validated, clipPlanes)) {
        return;
      }
      clipPlanes = validated;
      present();
      if (live) {
        pendingPolicies += 1;
        actorRef.send({ type: 'setClipPolicy', clipPolicy: validated });
      }
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
