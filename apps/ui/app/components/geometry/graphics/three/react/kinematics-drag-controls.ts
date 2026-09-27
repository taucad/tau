/**
 * Drag-to-IK on model components, armed only while the Kinematics pane shows the unit (`dragEnabled`).
 * A primary mouse or pen press on a component whose link can move suspends camera orbit at once (so a
 * click still selects and a drag never orbits); after 4 px it becomes a drag that sends `dragStart`, one
 * rAF-coalesced `dragMove` per frame and `dragEnd`. Escape, pointer cancellation, lost capture, window
 * blur, a hidden tab and unmount send `dragCancel`, which restores the pre-drag pose. Touch always goes
 * to the camera. The pose and drag outcome live in the kinematics actor; this module only recognises
 * the gesture.
 *
 * Drag plane: through the grab point, facing the camera (normal = view direction). Pointer rays hit it
 * in world space and `root.worldToLocal` maps the hit back through the render-frame and glTF→Tau
 * wrappers into the GLB frame the mechanism is expressed in.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Camera, Mesh, Object3D } from 'three';
import { useThree } from '@react-three/fiber';
import type { EventManager, ThreeEvent } from '@react-three/fiber';
import { findLinkByComponent } from '@taucad/kinematics';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';
import { getModelComponentIdInHierarchy } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  createKinematicsDragPlane,
  hasExceededKinematicsDragThreshold,
  intersectKinematicsDragPlane,
  toKinematicsPointerNdc,
} from '#components/geometry/graphics/three/utils/kinematics-drag-math.js';
import type { KinematicsPointerPoint } from '#components/geometry/graphics/three/utils/kinematics-drag-math.js';
import { resolveSectionViewRaycastClip } from '#components/geometry/graphics/three/use-section-view.js';
import { useGraphics, useKinematicsRef, useRenderFrame } from '#hooks/use-graphics.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { getKinematicsUnitState, isGroundedKinematicsLink } from '#machines/kinematics.machine.js';
import type { KinematicsMachineEvent } from '#machines/kinematics.machine.js';

type GraphicsSend = ReturnType<typeof useGraphics>['send'];

const escapeKeyCombination = { key: 'Escape' };

export type KinematicsDragGestureOptions = Readonly<{
  unitId: string;
  componentId: string;
  pointerId: number;
  start: KinematicsPointerPoint;
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
  sendKinematics: (event: KinematicsMachineEvent) => void;
  sendGraphics: GraphicsSend;
  onFinish: () => void;
}>;

export type KinematicsDragGesture = Readonly<{
  /** Whether the press has become a drag, which Escape cancels. */
  isDragging: () => boolean;
  /** Cancels an active drag; the press lasts until release so the camera does not take over. */
  cancel: () => void;
  /** Ends the press now: cancels an active drag and restores the camera, capture and cursor. */
  dispose: () => void;
}>;

/** Runs one press from pointer-down to release. */
export function beginKinematicsDragGesture(options: KinematicsDragGestureOptions): KinematicsDragGesture {
  const { unitId, pointerId, element, controls } = options;
  const document = element.ownerDocument;
  const controlsWereEnabled = controls?.enabled;
  const previousCursor = element.style.cursor;
  const plane = new Plane();
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const target = new Vector3();
  let phase: 'pending' | 'dragging' | 'cancelled' | 'finished' = 'pending';
  /** The latest pointer point still waiting for its frame in the coalescer. */
  let pendingPoint: KinematicsPointerPoint | undefined;

  if (controls) {
    controls.enabled = false;
  }

  const moveTo = (point: KinematicsPointerPoint): void => {
    pendingPoint = undefined;
    const rect = options.canvas.getBoundingClientRect();
    toKinematicsPointerNdc(rect, point, ndc);
    const hit = intersectKinematicsDragPlane({ raycaster, camera: options.camera, plane, ndc, target });
    if (!hit) {
      return;
    }
    options.root.worldToLocal(hit);
    options.sendKinematics({ type: 'dragMove', unitId, target: [hit.x, hit.y, hit.z] });
  };
  const moves = createRafCoalescer(moveTo);

  const startDrag = (): void => {
    phase = 'dragging';
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Capture fails when the browser already ended the pointer session; document listeners still end it.
    }
    options.sendGraphics({ type: 'beginViewerModelHoverSuppression', reason: 'toolOverlay', source: 'viewer' });
    options.sendGraphics({
      type: 'setHoveredModelComponent',
      unitId,
      componentId: options.componentId,
      source: 'viewer',
    });
    element.style.cursor = 'grabbing';
    createKinematicsDragPlane(options.camera, options.grabPoint, plane);
    const grab = options.root.worldToLocal(options.grabPoint.clone());
    options.sendKinematics({
      type: 'dragStart',
      unitId,
      componentId: options.componentId,
      point: [grab.x, grab.y, grab.z],
    });
  };

  const cancelDrag = (): void => {
    if (phase !== 'dragging') {
      return;
    }
    phase = 'cancelled';
    moves.cancel();
    pendingPoint = undefined;
    options.sendKinematics({ type: 'dragCancel', unitId });
  };

  const finish = (): void => {
    if (phase === 'finished') {
      return;
    }
    const wasDragged = phase !== 'pending';
    phase = 'finished';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerCancel);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    globalThis.removeEventListener('blur', abort);
    element.removeEventListener('lostpointercapture', handlePointerCancel);
    moves.cancel();
    if (wasDragged) {
      try {
        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }
      } catch {
        // Some environments do not support capture for every pointer type.
      }
      options.sendGraphics({ type: 'endViewerModelHoverSuppression', reason: 'toolOverlay', source: 'viewer' });
      // The click that follows the release must not toggle selection (the gizmo uses the same guard).
      options.sendGraphics({ type: 'markModelPointerGestureMoved' });
    }
    if (controls && controlsWereEnabled !== undefined) {
      controls.enabled = controlsWereEnabled;
    }
    element.style.cursor = previousCursor;
    options.onFinish();
  };

  /** Ends the press where it was released; the drag keeps the pose the pointer reached. */
  const release = (): void => {
    if (phase === 'dragging') {
      // The last pointer point may still wait for its frame; the pose must end where the pointer did.
      moves.cancel();
      if (pendingPoint) {
        moveTo(pendingPoint);
      }
      options.sendKinematics({ type: 'dragEnd', unitId });
    }
    finish();
  };

  /** Ends the press without keeping the drag: its release will not arrive, or the viewer is going away. */
  function abort(): void {
    cancelDrag();
    finish();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    // A move without the primary button (bit 0 of `buttons`): the release happened where this page could not see it.
    if (event.buttons % 2 === 0) {
      release();
      return;
    }
    if (phase === 'pending' && hasExceededKinematicsDragThreshold(options.start, event)) {
      startDrag();
    }
    if (phase === 'dragging') {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      moves.schedule(pendingPoint);
    }
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.pointerId === pointerId) {
      release();
    }
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (event.pointerId === pointerId) {
      abort();
    }
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      abort();
    }
  }

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp);
  document.addEventListener('pointercancel', handlePointerCancel);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  globalThis.addEventListener('blur', abort);
  element.addEventListener('lostpointercapture', handlePointerCancel);

  return {
    isDragging: () => phase === 'dragging',
    cancel: cancelDrag,
    dispose: abort,
  };
}

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
 * Returns the model's primary pointer-down handler. While the Kinematics pane arms the unit, it claims
 * a mouse or pen press on a movable link's component; every other press (unarmed, touch, grounded
 * links, no mechanism, measure tool) stays with the camera and click.
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
  const gestureRef = useRef<KinematicsDragGesture | undefined>(undefined);
  const lastPressRef = useRef<PointerEvent | undefined>(undefined);
  const raycasterRef = useRef(new Raycaster());

  // Unmount ends a press in flight: an active drag is cancelled and the camera controls return.
  useEffect(
    () => () => {
      gestureRef.current?.dispose();
    },
    [],
  );

  // Escape cancels a drag (A8) ahead of every other Escape binding, such as closing the section view.
  useKeybinding(
    escapeKeyCombination,
    () => {
      gestureRef.current?.cancel();
    },
    { enabled: () => gestureRef.current?.isDragging() === true, priority: 1, scope: 'global' },
  );

  return useCallback(
    (event: ThreeEvent<PointerEvent>): void => {
      const { nativeEvent } = event;
      // Touch stays with the camera, so a finger on a part never takes pinch or orbit away; the pane poses on touch.
      const isDragPointer = nativeEvent.pointerType === 'mouse' || nativeEvent.pointerType === 'pen';
      // R3F repeats one press for every intersected object; only its first delivery counts.
      if (
        nativeEvent.button !== 0 ||
        !isDragPointer ||
        !scene ||
        gestureRef.current !== undefined ||
        nativeEvent === lastPressRef.current
      ) {
        return;
      }
      lastPressRef.current = nativeEvent;
      const { mechanism, dragEnabled } = getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId);
      const graphicsContext = graphicsActor.getSnapshot().context;
      if (!dragEnabled || !mechanism || graphicsContext.modelPointerClickSuppressionReasons.length > 0) {
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
      const clipping = resolveSectionViewRaycastClip(graphicsContext, renderFrame);
      const hit = raycastFirstVisibleMeshHit({ raycaster, meshes: getPickableMeshes(), clipping });
      const componentId = getModelComponentIdInHierarchy(hit?.object);
      const linkId = componentId === undefined ? undefined : findLinkByComponent({ mechanism, componentId });
      if (!hit || componentId === undefined || linkId === undefined) {
        return;
      }

      // R3F and the camera controls listen on the viewer region (`eventSource`), not the canvas.
      const element = events.connected ?? gl.domElement;
      // The viewer's hover label already says a grounded part does not move.
      if (isGroundedKinematicsLink(mechanism, linkId)) {
        return;
      }

      gestureRef.current = beginKinematicsDragGesture({
        unitId,
        componentId,
        pointerId: nativeEvent.pointerId,
        start: { clientX: nativeEvent.clientX, clientY: nativeEvent.clientY },
        grabPoint: hit.point,
        element,
        canvas: gl.domElement,
        camera,
        root: scene,
        controls: toSuspendableControls(controls),
        sendKinematics: (kinematicsEvent) => {
          kinematicsRef.send(kinematicsEvent);
        },
        sendGraphics: (graphicsEvent) => {
          graphicsActor.send(graphicsEvent);
        },
        onFinish: () => {
          gestureRef.current = undefined;
        },
      });
    },
    [get, getPickableMeshes, graphicsActor, kinematicsRef, renderFrame, scene, unitId],
  );
}
