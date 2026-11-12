/**
 * Drag-to-IK on model components, armed only while the Kinematics pane shows the unit (`dragEnabled`). The gesture
 * (press, threshold, drag, release and cancel) lives in the kinematics actor; this module is its DOM side:
 *
 * - {@link useKinematicsDragControls} returns the model's primary pointer-down handler. It finds the pressed component
 *   from R3F's pick and sends `pressPart` with a drag adapter built for that press. Escape sends `cancelGesture`.
 * - {@link createKinematicsDragAdapter} builds that adapter: callback logic whose closure holds the camera, the glTF
 *   scene root, the drag plane and the DOM elements. While the actor runs it, it suspends the camera controls, reports
 *   the pressed pointer and maps each move onto the drag plane in mechanism space; `dragStarted` captures the pointer
 *   and shows the grabbing cursor. Stopping it restores the controls, the cursor and the capture.
 *
 * A primary mouse or pen press on a component whose link can move suspends camera orbit at once (so a click still
 * selects and a drag never orbits). Touch always goes to the camera.
 *
 * Drag plane: through the grab point, facing the camera (normal = view direction). Pointer rays hit it in world space
 * and `root.worldToLocal` maps the hit back through the render-frame and glTF→Tau wrappers into the GLB frame the
 * mechanism is expressed in.
 */
import { useCallback, useRef } from 'react';
import { Raycaster, Vector2, Vector3 } from 'three';
import type { Camera, Mesh, Object3D } from 'three';
import { useThree } from '@react-three/fiber';
import type { EventManager, ThreeEvent } from '@react-three/fiber';
import { createCallbackLogic } from 'xstate';
import type { SpatialVector } from '@taucad/spatial';
import { raycastFirstVisibleMeshHit } from '#graphics/three/utils/bvh-raycast.js';
import { getModelComponentIdInHierarchy } from '#graphics/three/utils/model-component-owner.js';
import {
  createKinematicsDragPlane,
  intersectKinematicsDragPlane,
  toKinematicsPointerNdc,
} from '#graphics/three/utils/kinematics-drag-math.js';
import { resolveSectionViewRaycastClip } from '#graphics/three/use-section-view.js';
import { useGraphics, useKinematicsRef, useRenderFrame } from '#hooks/use-graphics.jsx';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import {
  getKinematicsUnitState,
  selectKinematicsDragging,
  selectKinematicsPressHeld,
} from '#machines/kinematics.machine.js';
import type {
  KinematicsDragAdapterCommand,
  KinematicsDragAdapterLogic,
  KinematicsMachineEvent,
} from '#machines/kinematics.machine.js';

type GraphicsActor = Pick<ReturnType<typeof useGraphics>, 'send' | 'getSnapshot'>;

const escapeKeyCombination = { key: 'Escape' };

type KinematicsRef = ReturnType<typeof useKinematicsRef>;

/** Whether a drag is under way, read when Escape is pressed. */
const selectDragInProgress = (kinematicsRef: KinematicsRef): boolean =>
  selectKinematicsDragging(kinematicsRef.getSnapshot());

/** The facts a press needs to start a drag on one unit: no press already held, and a draggable mechanism. */
const selectDragStart = (
  kinematicsRef: KinematicsRef,
  unitId: string,
): Readonly<{ pressHeld: boolean; draggable: boolean }> => {
  const kinematics = kinematicsRef.getSnapshot();
  const { mechanism, dragEnabled } = getKinematicsUnitState(kinematics.context, unitId);
  return { pressHeld: selectKinematicsPressHeld(kinematics), draggable: dragEnabled && mechanism !== undefined };
};

/** What a press is hit-tested against: its click suppressions and the section clipping. */
const selectPressGraphicsContext = (
  graphicsActor: GraphicsActor,
): Pick<
  ReturnType<GraphicsActor['getSnapshot']>['context'],
  'modelPointerClickSuppressionReasons' | 'isSectionViewActive' | 'committedSectionCuts'
> => {
  const { modelPointerClickSuppressionReasons, isSectionViewActive, committedSectionCuts } =
    graphicsActor.getSnapshot().context;
  return { modelPointerClickSuppressionReasons, isSectionViewActive, committedSectionCuts };
};

/**
 * The viewer objects one press's drag adapter is built around.
 */
export type KinematicsDragAdapterOptions = Readonly<{
  unitId: string;
  componentId: string;
  pointerId: number;
  /** The grabbed surface point in world (render) space. */
  grabPoint: Vector3;
  /** Pointer-capture and cursor owner: the element R3F and the camera controls listen on. */
  element: HTMLElement;
  /** The canvas whose box maps client points to normalized device coordinates. */
  canvas: HTMLElement;
  camera: Camera;
  /** The glTF scene root; its local frame is the GLB frame of the mechanism. */
  root: Object3D;
  controls: { enabled: boolean } | undefined;
  /** The view's graphics actor, which holds the hover on the dragged part and the click guard after a drag. */
  graphics: GraphicsActor;
}>;

/**
 * Builds the DOM adapter for one press. The kinematics actor starts it when it claims the press and stops it when the
 * press ends.
 *
 * @param options - The viewer objects the press acts on.
 * @returns Callback logic for `pressPart`.
 */
export const createKinematicsDragAdapter = (options: KinematicsDragAdapterOptions): KinematicsDragAdapterLogic =>
  createCallbackLogic<KinematicsDragAdapterCommand, undefined>(({ sendBack, receive }) => {
    const { unitId, pointerId, element, controls, graphics } = options;
    const document = element.ownerDocument;
    const controlsWereEnabled = controls?.enabled;
    const previousCursor = element.style.cursor;
    // The camera holds still while the press suspends its controls, so the plane at the press serves the whole drag.
    const plane = createKinematicsDragPlane(options.camera, options.grabPoint);
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();
    let isDragStarted = false;

    if (controls) {
      controls.enabled = false;
    }

    const send = (event: KinematicsMachineEvent): void => {
      sendBack(event);
    };

    /** The pointer on the drag plane in mechanism space; `undefined` when its ray misses the plane. */
    const toTarget = (event: PointerEvent): SpatialVector | undefined => {
      toKinematicsPointerNdc(options.canvas.getBoundingClientRect(), event, ndc);
      const world = intersectKinematicsDragPlane({ raycaster, camera: options.camera, plane, ndc, target: hit });
      if (!world) {
        return undefined;
      }
      const local = options.root.worldToLocal(world);
      return [local.x, local.y, local.z];
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) {
        send({
          type: 'movePointer',
          pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          buttons: event.buttons,
          target: toTarget(event),
        });
      }
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) {
        send({ type: 'releasePointer', pointerId });
      }
    };
    const handlePointerLost = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) {
        send({ type: 'losePointer', pointerId });
      }
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        send({ type: 'interruptGesture' });
      }
    };
    const handleBlur = (): void => {
      send({ type: 'interruptGesture' });
    };

    // `dragStarted` is the only command.
    receive(() => {
      if (isDragStarted) {
        return;
      }
      isDragStarted = true;
      try {
        element.setPointerCapture(pointerId);
      } catch {
        // Capture fails when the browser already ended the pointer session; document listeners still end it.
      }
      graphics.send({ type: 'beginViewerModelHoverSuppression', reason: 'toolOverlay', source: 'viewer' });
      graphics.send({ type: 'setHoveredModelComponent', unitId, componentId: options.componentId, source: 'viewer' });
      element.style.cursor = 'grabbing';
    });

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerLost);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('blur', handleBlur);
    element.addEventListener('lostpointercapture', handlePointerLost);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerLost);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('blur', handleBlur);
      element.removeEventListener('lostpointercapture', handlePointerLost);
      if (isDragStarted) {
        try {
          if (element.hasPointerCapture(pointerId)) {
            element.releasePointerCapture(pointerId);
          }
        } catch {
          // Some environments do not support capture for every pointer type.
        }
        // A view that is going away keeps no hover to release.
        if (graphics.getSnapshot().status === 'active') {
          graphics.send({ type: 'endViewerModelHoverSuppression', reason: 'toolOverlay', source: 'viewer' });
          // The click that follows the release must not toggle selection (the gizmo uses the same guard).
          graphics.send({ type: 'markModelPointerGestureMoved' });
        }
      }
      if (controls && controlsWereEnabled !== undefined) {
        controls.enabled = controlsWereEnabled;
      }
      element.style.cursor = previousCursor;
    };
  });

type KinematicsDragControlsOptions = Readonly<{
  unitId: string;
  scene: Object3D | undefined;
  getPickableMeshes: () => readonly Mesh[];
}>;

/** The camera controls R3F registered as default, when they expose an `enabled` switch. */
const toSuspendableControls = (controls: unknown): { enabled: boolean } | undefined =>
  controls !== null && typeof controls === 'object' && 'enabled' in controls
    ? (controls as { enabled: boolean })
    : undefined;

/**
 * Returns the model's primary pointer-down handler. While the Kinematics pane arms the unit, it offers the kinematics
 * actor a mouse or pen press on a mechanism component; every other press (unarmed, touch, no mechanism, measure tool)
 * stays with the camera and click, and so does one the actor refuses (a grounded link, or a press already held).
 *
 * The press ends with the actor's gesture: when the viewer unmounts the unit it clears the unit's mechanism, which
 * ends a press on it.
 *
 * @param options - The unit, its glTF scene root and its pickable meshes.
 * @returns The pointer-down handler for the unit's model.
 */
export function useKinematicsDragControls({
  unitId,
  scene,
  getPickableMeshes,
}: KinematicsDragControlsOptions): (event: ThreeEvent<PointerEvent>) => void {
  const kinematicsRef = useKinematicsRef();
  const graphicsActor = useGraphics();
  const renderFrame = useRenderFrame();
  const get = useThree((state) => state.get);
  const lastPressRef = useRef<PointerEvent | undefined>(undefined);
  const raycasterRef = useRef(new Raycaster());

  // Escape cancels a drag (A8) ahead of every other Escape binding, such as closing the section view.
  useKeybinding(
    escapeKeyCombination,
    () => {
      kinematicsRef.send({ type: 'cancelGesture' });
    },
    { enabled: () => selectDragInProgress(kinematicsRef), priority: 1, scope: 'global' },
  );

  return useCallback(
    (event: ThreeEvent<PointerEvent>): void => {
      const { nativeEvent } = event;
      // Touch stays with the camera, so a finger on a part never takes pinch or orbit away; the pane poses on touch.
      const isDragPointer = nativeEvent.pointerType === 'mouse' || nativeEvent.pointerType === 'pen';
      // R3F repeats one press for every intersected object; only its first delivery counts.
      if (nativeEvent.button !== 0 || !isDragPointer || !scene || nativeEvent === lastPressRef.current) {
        return;
      }
      lastPressRef.current = nativeEvent;
      const { pressHeld, draggable } = selectDragStart(kinematicsRef, unitId);
      const graphicsContext = selectPressGraphicsContext(graphicsActor);
      if (pressHeld || !draggable || graphicsContext.modelPointerClickSuppressionReasons.length > 0) {
        return;
      }

      const { camera, gl, controls } = get();
      const events = get().events as EventManager<HTMLElement>;
      const raycaster = raycasterRef.current;
      raycaster.ray.copy(event.ray);
      raycaster.camera = camera;
      raycaster.near = 0;
      raycaster.far = Number.POSITIVE_INFINITY;
      // The section cut is read at the press, as the model's own raycast reads it, not selected per drag step.
      const pickable = getPickableMeshes();
      // The model's own pick already answered this press when it hit a part; ask the trees only otherwise. A pick
      // still waiting on a tree is not a miss: the press is left alone.
      const delivered = pickable.find((mesh) => mesh === event.object);
      const hit = delivered
        ? { object: delivered, point: event.point }
        : raycastFirstVisibleMeshHit({
            raycaster,
            meshes: pickable,
            clipping: resolveSectionViewRaycastClip(graphicsContext, renderFrame),
          }).hit;
      const componentId = getModelComponentIdInHierarchy(hit?.object);
      if (!hit || componentId === undefined) {
        return;
      }

      const grab = scene.worldToLocal(hit.point.clone());
      kinematicsRef.send({
        type: 'pressPart',
        unitId,
        componentId,
        pointerId: nativeEvent.pointerId,
        clientX: nativeEvent.clientX,
        clientY: nativeEvent.clientY,
        point: [grab.x, grab.y, grab.z],
        adapter: createKinematicsDragAdapter({
          unitId,
          componentId,
          pointerId: nativeEvent.pointerId,
          grabPoint: hit.point.clone(),
          // R3F and the camera controls listen on the viewer region (`eventSource`), not the canvas.
          element: events.connected ?? gl.domElement,
          canvas: gl.domElement,
          camera,
          root: scene,
          controls: toSuspendableControls(controls),
          graphics: graphicsActor,
        }),
      });
    },
    [get, getPickableMeshes, graphicsActor, kinematicsRef, renderFrame, scene, unitId],
  );
}
