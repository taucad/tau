/**
 * The controls adapter: the only listener on a canvas's `camera-controls` instance (charter I9), and the driver that
 * presents the view's camera on the canvas (charter I3).
 *
 * A canvas hands graphics this adapter once its renderer exists (`controlsAttached`), and graphics stops it with the
 * canvas. The `camera-controls` instance, its DOM surface, the R3F root and the native cameras live in the adapter's
 * closure, never in a machine's context (charter D4).
 *
 * The controls listen on R3F's event source when the canvas has one, else on the canvas.
 *
 * Controls to camera:
 * - `controlstart`, `controlend`: `interactionStarted`, `interactionEnded`, sent back to graphics, which forwards them to
 *   the camera and owns click and hover suppression.
 * - `control`: `interactionMoved`, once per gesture.
 * - `update`: `poseObserved` with the source `input`, sent to the camera. When the pose calls for a new render frame
 *   (a far pan or a deep zoom) the frame rides on the same event, so one gesture step is one camera change.
 * - `transitionstart`, `wake`, `update`, `control`, `controlstart`: a render request.
 *
 * Graphics to controls: `navigate`, one orbit, pan or zoom step from a key or a single-click control, moves the
 * controls at once; the next frame's `update` reports the pose with the source `input`, as a drag's does.
 *
 * Camera to canvas, once per presented change: the controls, the retained consumers, the raycaster clipping and R3F's
 * camera. The controls are written for every change except the one this adapter's own `update` reported (the person's
 * gesture, which the controls already hold), unless that change also brought a new render frame or a new native camera.
 * A pose another sender reports with the source `input` (a restored or adopted view) is written like any other. For an
 * orthographic gesture the controls' own zoom is handed the presented zoom, since the rig presents the span through the
 * frustum and `camera-controls` forces its zoom on every update. Each
 * write is stamped with the change's revision so the `update` it causes is an echo the camera ignores.
 *
 * Each frame, at `tickPriority` (after the canvas reports its surface and before the render), the adapter follows the
 * root's event source and steps the controls, unless they are disabled or the canvas's view cube holds its interaction
 * lock.
 */
import type { RootState } from '@react-three/fiber';
import type { Mesh } from 'three';
import CameraControlsImpl from 'camera-controls';
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { createCallbackLogic } from 'xstate';
import { perspectiveVerticalSpan } from '@taucad/camera';
import type { CameraVector } from '@taucad/camera';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { resolveMetersPerRenderUnit, shouldRebaseRenderFrame, shouldRescaleRenderFrame } from '@taucad/spatial';
import type { RenderFrame } from '@taucad/spatial';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import { attachCameraWheelRouter } from '#graphics/three/controls/camera-wheel-router.js';
import { applyCameraNavigationStep } from '#graphics/three/controls/camera-navigation.js';
import type { CameraInputRouting, CameraPivotPicker } from '#graphics/three/controls/camera-wheel-router.js';
import { hasSceneTagInHierarchy, sceneTag } from '#graphics/three/utils/scene-tags.js';
import { raycastFirstVisibleMeshHit } from '#graphics/three/utils/bvh-raycast.js';
import { syncControlsLookAt } from '#graphics/three/utils/camera-controls-adapter.js';
import type { ControlsAdapterLogic } from '#machines/graphics.machine.js';

/** Receives the native camera and the presented snapshot each time the view's camera changes. */
type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

type FrameCallback = (state: RootState, delta: number) => void;
type FrameSubscribe = (
  callback: { current: FrameCallback },
  priority: number,
  store: Readonly<{ getState: () => RootState }>,
) => () => void;

/**
 * The controls step where R3F's controls do (-1): after the canvas host reports a resize to the camera (its
 * `surfacePriority`, -2), before the frame renders.
 *
 * @public
 */
export const tickPriority = -1;

const upAxes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const satisfies Record<string, CameraVector>;

/**
 * What a canvas gives its controls adapter. Every member is a host object or a host callback; the adapter keeps them in
 * its closure.
 *
 * @public
 */
export type ControlsAdapterDependencies = Readonly<{
  /** The R3F root the canvas created. */
  root: RootState;
  /** The view's native camera rig, presenting the graphics actor's camera. */
  rig: ThreeCameraRig;
  /** The provider's publication slot: the adapter fills it while it runs. */
  connectorRef: { current: CameraUpdateHandler | undefined };
  /** Retained camera-bound resources, retargeted before R3F sees a new camera. */
  consumersRef: Readonly<{ current: ReadonlySet<CameraUpdateHandler> }>;
  /** The world up axis the scene's objects take, read when the camera's up changes. */
  getUpAxis: () => keyof typeof upAxes;
  /** Whether the view cube holds the canvas's interaction lock, read each frame: the controls then do not step. */
  isInteractionLocked?: () => boolean;
  /**
   * The person's camera input, read at each gesture. Absent, or returning `undefined`, keeps today's bindings and the
   * pinch fix alone.
   */
  getCameraRouting?: () => CameraInputRouting | undefined;
}>;

/**
 * The parts of a `camera-controls` instance that {@link retargetCameraControls} reads and writes.
 *
 * @public
 */
export type RetargetableCameraControls = Pick<CameraControlsImpl, 'cancel' | 'updateCameraUp'> & {
  camera: ThreeCamera;
  mouseButtons: { wheel: CameraControlsImpl['mouseButtons']['wheel'] };
  touches: { two: CameraControlsImpl['touches']['two'] };
};

/**
 * Points the controls at a new camera, swapping wheel and pinch between dolly and zoom to suit its projection.
 *
 * @param options - The controls and the camera they should drive.
 * @returns Whether the camera changed.
 * @public
 */
export const retargetCameraControls = ({
  controls,
  camera,
}: Readonly<{ controls: RetargetableCameraControls; camera: ThreeCamera }>): boolean => {
  if (controls.camera === camera) {
    return false;
  }
  controls.cancel();
  controls.camera = camera;
  if (camera instanceof OrthographicCamera) {
    if (controls.mouseButtons.wheel === CameraControlsImpl.ACTION.DOLLY) {
      controls.mouseButtons.wheel = CameraControlsImpl.ACTION.ZOOM;
    }
    if (controls.touches.two === CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK) {
      controls.touches.two = CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK;
    }
  } else {
    if (controls.mouseButtons.wheel === CameraControlsImpl.ACTION.ZOOM) {
      controls.mouseButtons.wheel = CameraControlsImpl.ACTION.DOLLY;
    }
    if (controls.touches.two === CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK) {
      controls.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK;
    }
  }
  controls.updateCameraUp();
  return true;
};

const pivotBlockingSceneTags = new Set([
  sceneTag.sectionViewHelper,
  sceneTag.measurementUi,
  sceneTag.gltfSurfacePresentation,
]);

/**
 * Finds the first visible mesh surface under a screen position in an R3F scene: the pivot an orbit about the cursor
 * turns about.
 *
 * @param root - The R3F root whose scene and surface are picked.
 * @returns The picker, in the scene's render units.
 * @public
 */
export const createScenePivotPicker = (root: RootState): CameraPivotPicker => {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  return ({ clientX, clientY, camera }) => {
    const state = root.get();
    const rect = state.gl.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return undefined;
    }
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const meshes: Mesh[] = [];
    state.scene.traverse((object) => {
      if (
        (object as Partial<Mesh>).isMesh === true &&
        object.type !== 'LineSegments2' &&
        !hasSceneTagInHierarchy(object, pivotBlockingSceneTags)
      ) {
        meshes.push(object as Mesh);
      }
    });
    // The trees the model's own pick builds; a mesh whose tree is still building is a miss, so the orbit keeps its target.
    const { hit, pending } = raycastFirstVisibleMeshHit({ raycaster, meshes });
    if (hit !== undefined && !pending) {
      return hit.point.clone();
    }
    return undefined;
  };
};

let installed = false;
const installCameraControls = (): void => {
  if (installed) {
    return;
  }
  installed = true;
  /* eslint-disable @typescript-eslint/naming-convention -- `camera-controls` requires this exact install shape. */
  CameraControlsImpl.install({
    THREE: {
      Box3,
      MathUtils: { clamp: MathUtils.clamp },
      Matrix4,
      Quaternion,
      Raycaster,
      Sphere,
      Spherical,
      Vector2,
      Vector3,
      Vector4,
    },
  });
  /* eslint-enable @typescript-eslint/naming-convention -- The install shape ends here. */
};

/**
 * Reads the pose a `camera-controls` instance holds, in the view's physical frame.
 *
 * @param options - The controls and the render frame their units are in.
 * @returns The pose, or `undefined` when the camera sits on its target.
 * @public
 */
export const readControlsPose = ({
  controls,
  renderFrame,
}: Readonly<{ controls: CameraControlsImpl; renderFrame: RenderFrame }>):
  | Readonly<{
      target: CameraVector;
      direction: CameraVector;
      up: CameraVector;
      verticalSpan: number;
      perspectiveZoom?: number;
    }>
  | undefined => {
  const camera = controls.camera as ThreeCamera;
  const target = controls.getTarget(new Vector3(), false);
  const offset = camera.position.clone().sub(target);
  const distance = offset.length();
  if (distance === 0) {
    return undefined;
  }
  const verticalSpan =
    camera instanceof OrthographicCamera
      ? ((camera.top - camera.bottom) / camera.zoom) * renderFrame.metersPerRenderUnit
      : perspectiveVerticalSpan({
          distance: distance * renderFrame.metersPerRenderUnit,
          verticalFieldOfView: camera.fov,
          zoom: camera.zoom,
        });
  return {
    target: fromThreeRenderPoint({ renderFrame, point: target }),
    direction: [offset.x / distance, offset.y / distance, offset.z / distance],
    up: [camera.up.x, camera.up.y, camera.up.z],
    verticalSpan,
    ...(camera instanceof OrthographicCamera ? {} : { perspectiveZoom: camera.zoom }),
  };
};

/**
 * The render frame a pose calls for: a rescale for a span far from the frame's scale, a rebase for a target far from
 * its origin, else none.
 *
 * @param options - The frame the pose was read in and the pose's target and span.
 * @returns The new frame, or `undefined` to keep this one.
 * @public
 */
export const resolvePoseRenderFrame = ({
  renderFrame,
  target,
  verticalSpan,
}: Readonly<{ renderFrame: RenderFrame; target: CameraVector; verticalSpan: number }>): RenderFrame | undefined => {
  const rescale = shouldRescaleRenderFrame({ renderFrame, visibleSpanMeters: verticalSpan });
  if (!rescale && !shouldRebaseRenderFrame({ renderFrame, targetMeters: target })) {
    return undefined;
  }
  return {
    anchorFrameId: renderFrame.anchorFrameId,
    originMeters: target,
    metersPerRenderUnit: rescale
      ? resolveMetersPerRenderUnit({ characteristicLengthMeters: verticalSpan })
      : renderFrame.metersPerRenderUnit,
  };
};

/**
 * Creates a canvas's controls adapter, the callback logic graphics runs while the canvas is attached.
 *
 * @param dependencies - The canvas's R3F root, the view's rig and the provider's publication slots.
 * @returns The adapter logic to send in `controlsAttached`.
 * @public
 */
export const createControlsAdapter = ({
  root,
  rig,
  connectorRef,
  consumersRef,
  getUpAxis,
  isInteractionLocked = () => false,
  getCameraRouting,
}: ControlsAdapterDependencies): ControlsAdapterLogic =>
  createCallbackLogic(({ sendBack, receive }) => {
    installCameraControls();
    const camera = rig.actorRef;
    const { gl } = root.get();
    const controls = new CameraControlsImpl(rig.activeCamera);
    // The revision whose presentation is writing the controls: the `update` that write causes is an echo (I3).
    let echoRevision: number | undefined;
    // Set while this adapter reports a pose its controls made: the change it causes is already on the controls.
    let observing = false;
    // The zoom the controls forced onto the camera when they reported the pose being presented.
    let observedZoom = 1;
    let held = false;
    let moved = false;
    let published:
      | Readonly<{ camera: ThreeCamera; renderFrame: RenderFrame; up: CameraVector; near: number; far: number }>
      | undefined;

    const invalidate = (): void => {
      root.get().invalidate();
    };

    const applySceneUp = (): void => {
      const [x, y, z] = upAxes[getUpAxis()];
      const { scene } = root.get();
      scene.traverse((object) => {
        object.up.set(x, y, z);
      });
      scene.updateMatrixWorld(true);
    };

    /* The driver: presents one camera change on this canvas. */
    const publish = (nativeCamera: ThreeCamera, snapshot: CameraDriverSnapshot): void => {
      const writeControls =
        !observing || published?.camera !== nativeCamera || published.renderFrame !== snapshot.renderFrame;
      if (writeControls) {
        echoRevision = snapshot.revision;
        try {
          retargetCameraControls({ controls, camera: nativeCamera });
          // The controls took the camera's up when they were made; the camera may have turned it before they attached.
          if (published === undefined || published.up.some((value, index) => value !== snapshot.view.up[index])) {
            controls.updateCameraUp();
          }
          syncControlsLookAt({
            camera: nativeCamera,
            controls,
            target: toThreeRenderPoint({ renderFrame: snapshot.renderFrame, pointMeters: snapshot.view.target }),
            transition: false,
          });
          controls.update(0);
        } finally {
          echoRevision = undefined;
        }
      } else if (nativeCamera instanceof OrthographicCamera && observedZoom !== nativeCamera.zoom) {
        /*
         * The rig presents an orthographic span through the frustum at zoom 1, but `camera-controls` keeps its own zoom
         * and forces it on every update: hand it the presented zoom, or each update would shrink the span again.
         */
        echoRevision = snapshot.revision;
        try {
          void controls.zoomTo(nativeCamera.zoom, false);
          controls.update(0);
        } finally {
          echoRevision = undefined;
        }
      }
      for (const retarget of consumersRef.current) {
        retarget(nativeCamera, snapshot);
      }
      if (snapshot.lastChange.source === 'up') {
        applySceneUp();
      }
      const state = root.get();
      state.raycaster.near = nativeCamera.near;
      state.raycaster.far = nativeCamera.far;
      if (state.camera !== nativeCamera) {
        state.set({ camera: nativeCamera });
      }
      published = {
        camera: nativeCamera,
        renderFrame: snapshot.renderFrame,
        up: snapshot.view.up,
        near: nativeCamera.near,
        far: nativeCamera.far,
      };
      invalidate();
    };

    const onControlStart = (): void => {
      held = true;
      moved = false;
      invalidate();
      sendBack({ type: 'interactionStarted' });
    };
    const onControl = (): void => {
      invalidate();
      if (held && !moved) {
        moved = true;
        sendBack({ type: 'interactionMoved' });
      }
    };
    const onControlEnd = (): void => {
      held = false;
      moved = false;
      sendBack({ type: 'interactionEnded' });
    };
    const onUpdate = (): void => {
      invalidate();
      const { renderFrame } = rig;
      const pose = readControlsPose({ controls, renderFrame });
      if (pose === undefined) {
        return;
      }
      if (echoRevision !== undefined) {
        camera.send({ type: 'poseObserved', ...pose, source: 'input', echoRevision });
        return;
      }
      const nextFrame = resolvePoseRenderFrame({ renderFrame, target: pose.target, verticalSpan: pose.verticalSpan });
      observing = true;
      observedZoom = controls.camera.zoom;
      try {
        camera.send({ type: 'poseObserved', ...pose, source: 'input', ...(nextFrame && { renderFrame: nextFrame }) });
      } finally {
        observing = false;
      }
    };
    /*
     * A navigation step graphics forwards (an arrow key or a single-click control): the controls move at once and step
     * on the next frame, whose `update` reports the pose as the person's input. Not while the view cube holds the lock.
     */
    receive((event) => {
      if (event.type !== 'navigate' || isInteractionLocked()) {
        return;
      }
      const routing = getCameraRouting?.();
      const moved = applyCameraNavigationStep({
        controls,
        step: event.step,
        enablePan: routing?.enablePan,
        enableZoom: routing?.enableZoom,
      });
      if (moved) {
        invalidate();
      }
    });
    const listeners = [
      ['controlstart', onControlStart],
      ['control', onControl],
      ['controlend', onControlEnd],
      ['update', onUpdate],
      ['transitionstart', invalidate],
      ['wake', invalidate],
    ] as const;

    /*
     * The pointer surface: R3F's event source when the canvas has one (its wrapper then takes no pointer events, so the
     * canvas would never see a gesture), else the canvas. R3F connects its events before the canvas is created and
     * reconnects them when the source changes, so each frame checks for a new one.
     */
    let surface: HTMLElement | undefined;
    // The input router sits on the same surface, in the capture phase: a trackpad pinch dollies like a wheel (PF1), and
    // with a camera input each press and wheel step takes its preset's binding.
    let detachWheelRouter: (() => void) | undefined;
    const followSurface = (state: RootState): void => {
      const next = (state.events.connected as HTMLElement | undefined) ?? gl.domElement;
      if (next !== surface) {
        if (surface !== undefined) {
          detachWheelRouter?.();
          controls.disconnect();
        }
        surface = next;
        controls.connect(next);
        detachWheelRouter = attachCameraWheelRouter({
          controls,
          element: next,
          getRouting: getCameraRouting,
          pickPivot: createScenePivotPicker(root),
        });
      }
    };

    /*
     * The tick: once per frame of this canvas's loop, the controls step by the frame's delta (their damping and
     * transitions), unless they are disabled or the view cube holds the interaction lock while it turns the camera
     * (another tool that re-enables the controls when its own drag ends must not let them step under the cube).
     */
    const ticker = {
      current(state: RootState, delta: number): void {
        followSurface(state);
        if (controls.enabled && !isInteractionLocked()) {
          controls.update(delta);
        }
      },
    };

    Reflect.set(rig.perspectiveCamera, 'manual', true);
    Reflect.set(rig.orthographicCamera, 'manual', true);
    const previousControls = root.get().controls;
    root.set({ controls: controls as unknown as RootState['controls'] });
    // Following the camera presents it at once: the controls take its pose, stamped, before anything listens.
    connectorRef.current = publish;
    const stopFollowing = rig.connect();
    applySceneUp();
    for (const [type, listener] of listeners) {
      controls.addEventListener(type, listener);
    }
    followSurface(root.get());
    const unsubscribeFrame = (root.internal.subscribe as FrameSubscribe)(ticker, tickPriority, {
      getState: root.get,
    });

    return () => {
      unsubscribeFrame();
      stopFollowing();
      if (connectorRef.current === publish) {
        connectorRef.current = undefined;
      }
      for (const [type, listener] of listeners) {
        controls.removeEventListener(type, listener);
      }
      detachWheelRouter?.();
      controls.disconnect();
      if (root.get().controls === (controls as unknown as RootState['controls'])) {
        root.set({ controls: previousControls });
      }
      controls.dispose();
    };
  });
