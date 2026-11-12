/**
 * The camera wheel router: what a wheel or a trackpad pinch does to the view's camera, decided before `camera-controls`
 * sees the event.
 *
 * `camera-controls` treats a `ctrlKey` wheel (the event Chromium and Firefox send for a trackpad pinch) as a zoom in
 * every projection, so in perspective a pinch changed the field of view's zoom while a plain wheel changed the
 * distance. Safari sends `gesturestart` and `gesturechange` for a pinch instead, which `camera-controls` ignores, so the
 * page zoomed. The router makes a pinch move the camera as a plain wheel of the same sign does: a dolly in perspective
 * and a zoom in orthographic.
 *
 * It listens on the controls' surface in the capture phase, so it runs before the controls' own `wheel` listener.
 *
 * Given a camera input (T4.2 onward), the same listeners become the viewer's input router: each press takes the
 * button binding its preset or the trackpad mapping gives it ({@link resolveDrag}), each wheel step the binding
 * {@link resolveWheel} gives it, and the router also applies the right-button click threshold, macOS's Ctrl + click,
 * zoom to cursor, orbit around cursor and inverted zoom. Without one, every binding is today's.
 */
import CameraControlsImpl from 'camera-controls';
import { detectPlatform } from '@taucad/ui/utils/platform';
import { OrthographicCamera, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import type { Camera } from 'three';
import {
  resolveCameraMapping,
  resolveDrag,
  resolveWheel,
  toCameraDragButton,
} from '#graphics/three/controls/camera-presets.js';
import type {
  CameraDragButton,
  CameraGesture,
  CameraInputDevice,
  CameraModifiers,
  CameraPresetId,
} from '#graphics/three/controls/camera-presets.js';

/**
 * What a wheel step does to the camera: change its distance (`dolly`) or its zoom (`zoom`).
 *
 * @public
 */
export type CameraWheelAction = 'dolly' | 'zoom';

/**
 * Resolves what a wheel step does to the camera. A `ctrlKey` wheel (a trackpad pinch) does what a plain wheel does:
 * a dolly in perspective, a zoom in orthographic.
 *
 * @param input - Whether the event carries `ctrlKey`, and whether the camera is a perspective one.
 * @returns The camera action the wheel step takes.
 * @public
 */
export const resolveWheelAction = ({
  perspective,
}: Readonly<{ ctrlKey: boolean; perspective: boolean }>): CameraWheelAction =>
  // The modifier never picks the action, only the projection does (PF1).
  perspective ? 'dolly' : 'zoom';

/**
 * Whether the router takes a wheel event from `camera-controls`: only a `ctrlKey` wheel whose action is not the zoom
 * `camera-controls` would force on it.
 *
 * @param input - Whether the event carries `ctrlKey`, and whether the camera is a perspective one.
 * @returns Whether to stop the event and replay it as a plain wheel.
 * @public
 */
export const shouldRerouteWheel = (input: Readonly<{ ctrlKey: boolean; perspective: boolean }>): boolean =>
  input.ctrlKey && resolveWheelAction(input) !== 'zoom';

/**
 * The change of scale between two `gesturechange` events of one Safari pinch, as a ratio: above 1 spreads the fingers.
 *
 * @param input - The gesture's scale at the previous event and at this one, both relative to `gesturestart`.
 * @returns The ratio, or `undefined` when either scale is not a positive finite number or nothing changed.
 * @public
 */
export const resolvePinchRatio = ({
  previousScale,
  scale,
}: Readonly<{ previousScale: number; scale: number }>): number | undefined => {
  if (!Number.isFinite(previousScale) || !Number.isFinite(scale) || previousScale <= 0 || scale <= 0) {
    return undefined;
  }
  const ratio = scale / previousScale;
  return ratio === 1 ? undefined : ratio;
};

/**
 * How the person navigates the viewer: their mouse preset, this device's input device and the three toggles. Every
 * field is optional; an absent one takes its built-in value.
 *
 * @public
 */
export type CameraInput = Readonly<{
  /** The mouse preset. Absent: Tau's default (P1). */
  preset?: CameraPresetId;
  /** `trackpad` replaces the preset with the trackpad mapping (P7). Absent: mouse. */
  inputDevice?: CameraInputDevice;
  /** Whether a wheel or pinch zooms toward the point under the cursor. Absent: on. */
  zoomToCursor?: boolean;
  /** Whether an orbit turns about the surface point under the cursor. Absent: off. */
  orbitAboutCursor?: boolean;
  /** Whether the wheel and pinch zoom in the opposite direction. Absent: off. */
  invertZoom?: boolean;
}>;

/**
 * What the router reads at each gesture: the camera input, and whether the viewer lets the person pan and zoom.
 *
 * @public
 */
export type CameraInputRouting = Readonly<{
  cameraInput: CameraInput;
  enablePan: boolean;
  enableZoom: boolean;
}>;

/**
 * Finds the surface point under a screen position, in the controls' units, or `undefined` when nothing is under it.
 *
 * @public
 */
export type CameraPivotPicker = (
  input: Readonly<{ clientX: number; clientY: number; camera: Camera }>,
) => Vector3 | undefined;

/**
 * The parts of a `camera-controls` instance the router reads and drives.
 *
 * @public
 */
export type CameraWheelRouterControls = Pick<
  CameraControlsImpl,
  | 'camera'
  | 'enabled'
  | 'distance'
  | 'dollyTo'
  | 'zoomTo'
  | 'dispatchEvent'
  | 'mouseButtons'
  | 'getTarget'
  | 'getPosition'
  | 'setLookAt'
  | 'dollySpeed'
  | 'minDistance'
  | 'maxDistance'
  | 'minZoom'
  | 'maxZoom'
  | 'azimuthRotateSpeed'
  | 'polarRotateSpeed'
  | 'minPolarAngle'
  | 'maxPolarAngle'
>;

/** Safari's `GestureEvent`, which the DOM library does not declare. */
type GestureEventLike = Event & { readonly scale?: unknown; readonly clientX?: unknown; readonly clientY?: unknown };

/**
 * How far a right-button press may travel and still be a click that opens the context menu (C13), in CSS pixels.
 *
 * @public
 */
export const cameraSecondaryClickThresholdPx = 4;

const isWheelEnabled = (controls: CameraWheelRouterControls): boolean =>
  controls.enabled && controls.mouseButtons.wheel !== CameraControlsImpl.ACTION.NONE;

const isPerspective = (controls: CameraWheelRouterControls): boolean =>
  !(controls.camera instanceof OrthographicCamera);

/** Events the router dispatches itself, which it lets through untouched. */
const replayedEvents = new WeakSet<Event>();

/**
 * Copies a wheel event without `ctrlKey`: what a plain wheel of the same deltas would deliver.
 *
 * @param event - The `ctrlKey` wheel event.
 * @returns A new, untrusted wheel event with the same deltas, position, buttons and other modifiers.
 */
const toPlainWheel = (event: WheelEvent): WheelEvent => {
  const plain = new WheelEvent('wheel', {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    ctrlKey: false,
  });
  replayedEvents.add(plain);
  return plain;
};

const captureOptions = { capture: true, passive: false } as const;

/**
 * The `camera-controls` action a gesture takes in this projection.
 *
 * @param gesture - Orbit, pan, zoom or none.
 * @param perspective - Whether the camera is a perspective one: a zoom dollies it, else it changes the zoom.
 * @returns `ROTATE`, `TRUCK`, `DOLLY`, `ZOOM` or `NONE`.
 * @public
 */
export const toCameraControlsAction = (
  gesture: CameraGesture,
  perspective: boolean,
): CameraControlsImpl['mouseButtons']['left'] => {
  switch (gesture) {
    case 'orbit': {
      return CameraControlsImpl.ACTION.ROTATE;
    }
    case 'pan': {
      return CameraControlsImpl.ACTION.TRUCK;
    }
    case 'zoom': {
      return perspective ? CameraControlsImpl.ACTION.DOLLY : CameraControlsImpl.ACTION.ZOOM;
    }
    case 'none': {
      return CameraControlsImpl.ACTION.NONE;
    }
  }
};

/**
 * The button and modifiers a press stands for. On macOS a Ctrl + click is the secondary click it is, so it presses the
 * right button without Ctrl; elsewhere Ctrl and Command are one modifier.
 *
 * @param input - The press's button and modifier keys, and the platform.
 * @returns The button and modifiers the preset resolves, or `undefined` for a button no preset binds.
 * @public
 */
export const resolvePressedButton = ({
  button,
  shiftKey,
  ctrlKey,
  altKey,
  metaKey,
  platform,
}: Readonly<{
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  platform: 'mac' | 'other';
}>): Readonly<{ button: CameraDragButton; modifiers: CameraModifiers }> | undefined => {
  if (platform === 'mac' && button === 0 && ctrlKey) {
    return { button: 'right', modifiers: { shift: shiftKey, ctrl: metaKey, alt: altKey } };
  }
  const dragButton = toCameraDragButton(button);
  return dragButton === undefined
    ? undefined
    : { button: dragButton, modifiers: { shift: shiftKey, ctrl: ctrlKey || metaKey, alt: altKey } };
};

/**
 * The scale one wheel step applies to the camera's distance (perspective) or the inverse of its zoom (orthographic),
 * as `camera-controls` computes it: above 1 moves away.
 *
 * @param input - The step's `deltaY`, `deltaMode` and `ctrlKey`, the controls' speed, the platform and the invert
 *   toggle.
 * @returns The factor the distance is multiplied by, or the zoom divided by.
 * @public
 */
export const resolveWheelZoomScale = ({
  deltaY,
  deltaMode,
  ctrlKey,
  dollySpeed,
  platform,
  invertZoom,
}: Readonly<{
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  dollySpeed: number;
  platform: 'mac' | 'other';
  invertZoom: boolean;
}>): number => {
  // The constants are `camera-controls` 3.1.2's `onMouseWheel`, so a routed step matches a native one.
  const wheelFactor = platform === 'mac' ? -1 : -3;
  const delta = deltaMode === 1 && !ctrlKey ? deltaY / wheelFactor : deltaY / (wheelFactor * 10);
  return 0.95 ** (delta * dollySpeed * (invertZoom ? -1 : 1));
};

const scratch = {
  position: new Vector3(),
  target: new Vector3(),
  cursor: new Vector3(),
  forward: new Vector3(),
  offset: new Vector3(),
  axis: new Vector3(),
  ndc: new Vector2(),
  plane: new Plane(),
  raycaster: new Raycaster(),
  quaternion: new Quaternion(),
  polar: new Quaternion(),
};

type ScreenPoint = Readonly<{ clientX: number; clientY: number }>;

/**
 * The point on the plane through the target, square to the view, that lies under a screen position.
 *
 * @param input - The controls, the surface the position is relative to, the position, and the vector that receives
 *   the point.
 * @returns `out`, or `undefined` when the view ray misses the plane.
 */
const cursorOnTargetPlane = ({
  controls,
  element,
  point,
  out,
}: Readonly<{
  controls: CameraWheelRouterControls;
  element: HTMLElement;
  point: ScreenPoint;
  out: Vector3;
}>): Vector3 | undefined => {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return undefined;
  }
  const { camera } = controls;
  camera.updateMatrixWorld();
  scratch.ndc.set(
    ((point.clientX - rect.left) / rect.width) * 2 - 1,
    -((point.clientY - rect.top) / rect.height) * 2 + 1,
  );
  scratch.raycaster.setFromCamera(scratch.ndc, camera);
  controls.getTarget(scratch.target, true);
  camera.getWorldDirection(scratch.forward);
  scratch.plane.setFromNormalAndCoplanarPoint(scratch.forward, scratch.target);
  return scratch.raycaster.ray.intersectPlane(scratch.plane, out) ?? undefined;
};

/**
 * Zooms by `scale` (above 1 moves away) toward the point under the cursor, or toward the target. In perspective the
 * camera and its target move along the ray through the cursor, so every point on that ray stays under the cursor; in
 * orthographic the zoom changes and the view shifts so the cursor's point on the target plane stays put.
 *
 * @param input - The controls, their surface, the scale and the cursor, absent to zoom toward the target.
 */
const zoomToward = ({
  controls,
  element,
  scale,
  point,
}: Readonly<{
  controls: CameraWheelRouterControls;
  element: HTMLElement;
  scale: number;
  point: ScreenPoint | undefined;
}>): void => {
  const cursor =
    point === undefined ? undefined : cursorOnTargetPlane({ controls, element, point, out: scratch.cursor });
  controls.getPosition(scratch.position, true);
  controls.getTarget(scratch.target, true);
  if (isPerspective(controls)) {
    const distance = scratch.position.distanceTo(scratch.target);
    const next = Math.min(Math.max(distance * scale, controls.minDistance), controls.maxDistance);
    if (distance === 0 || next === distance) {
      return;
    }
    if (cursor === undefined) {
      void controls.dollyTo(next, false);
      return;
    }
    const fraction = 1 - next / distance;
    // The camera moves the same fraction of its way to the cursor's point as the target does, along the cursor ray.
    scratch.offset.subVectors(cursor, scratch.position).multiplyScalar(fraction);
    scratch.position.add(scratch.offset);
    scratch.offset.subVectors(cursor, scratch.target).multiplyScalar(fraction);
    scratch.target.add(scratch.offset);
  } else {
    const { zoom } = controls.camera;
    const next = Math.min(Math.max(zoom / scale, controls.minZoom), controls.maxZoom);
    if (next === zoom) {
      return;
    }
    void controls.zoomTo(next, false);
    if (cursor === undefined) {
      return;
    }
    scratch.offset.subVectors(cursor, scratch.target).multiplyScalar(1 - zoom / next);
    scratch.position.add(scratch.offset);
    scratch.target.add(scratch.offset);
  }
  void controls.setLookAt(
    scratch.position.x,
    scratch.position.y,
    scratch.position.z,
    scratch.target.x,
    scratch.target.y,
    scratch.target.z,
    false,
  );
};

/**
 * Orbits the camera and its target rigidly about a pivot, by the azimuth and polar angles a drag of this many pixels
 * gives, so the pivot keeps its place on screen.
 *
 * @param input - The controls, the pivot, and the azimuth and polar angles to turn by, in radians.
 */
const orbitAbout = ({
  controls,
  pivot,
  azimuth,
  polar,
}: Readonly<{ controls: CameraWheelRouterControls; pivot: Vector3; azimuth: number; polar: number }>): void => {
  const { up } = controls.camera;
  controls.getPosition(scratch.position, true);
  controls.getTarget(scratch.target, true);
  scratch.offset.subVectors(scratch.position, scratch.target);
  const length = scratch.offset.length();
  if (length === 0) {
    return;
  }
  const currentPolar = scratch.offset.angleTo(up);
  const epsilon = 1e-6;
  const nextPolar = Math.min(
    Math.max(currentPolar + polar, Math.max(controls.minPolarAngle, epsilon)),
    Math.min(controls.maxPolarAngle, Math.PI - epsilon),
  );
  // Polar first, about the horizontal axis square to the view, then azimuth about the up axis: neither rolls the view.
  scratch.axis.crossVectors(up, scratch.offset).normalize();
  if (scratch.axis.lengthSq() === 0) {
    return;
  }
  scratch.polar.setFromAxisAngle(scratch.axis, nextPolar - currentPolar);
  scratch.quaternion.setFromAxisAngle(up, azimuth).multiply(scratch.polar);
  scratch.position.sub(pivot).applyQuaternion(scratch.quaternion).add(pivot);
  scratch.target.sub(pivot).applyQuaternion(scratch.quaternion).add(pivot);
  void controls.setLookAt(
    scratch.position.x,
    scratch.position.y,
    scratch.position.z,
    scratch.target.x,
    scratch.target.y,
    scratch.target.z,
    false,
  );
};

/** One press the router holds: its threshold and pivot, while its button is down. */
type HeldPress = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  /** Set while a right-button press has not yet travelled past the click threshold. */
  pending: boolean;
  /** The pivot an orbit about the cursor turns about. */
  readonly pivot: Vector3 | undefined;
};

/**
 * Attaches the camera's input router to the surface the controls are connected to. Call it beside `controls.connect`
 * and call what it returns beside `controls.disconnect`.
 *
 * Without `getRouting`, or while it returns `undefined`, the router is the pinch fix alone (PF1):
 * - A `ctrlKey` wheel in perspective is stopped before `camera-controls` sees it and replayed on its target as a plain
 *   wheel, so it takes the dolly a plain wheel of that sign takes. In orthographic it passes through, a zoom as before.
 * - A Safari pinch (`gesturestart`, `gesturechange`) scales the camera's distance in perspective and its zoom in
 *   orthographic by the change of the gesture's scale, and never zooms the page. A `ctrlKey` wheel inside a Safari
 *   pinch is dropped, so a browser that sends both moves the camera once.
 *
 * With a routing, each mouse press sets the button's action from the preset or the trackpad mapping, and a button and
 * modifier combination the mapping does not list does nothing (C1 to C8). Each wheel step zooms, pans or orbits as the
 * mapping says; a zoom goes toward the cursor unless `zoomToCursor` is off and reverses with `invertZoom`, and a
 * `ctrlKey` wheel never zooms the page (C10, C12, C14). A right-button press moves the camera only once it travels past
 * {@link cameraSecondaryClickThresholdPx}, so a click stays a click (C13), and on macOS a Ctrl + click is that click.
 * With `orbitAboutCursor` and a `pickPivot`, an orbit turns about the surface point under the press (C11).
 *
 * While the controls are disabled the router leaves every event alone.
 *
 * @param input - The controls, the surface element they listen on, and optionally the routing, the pivot picker and
 *   the platform (detected when absent).
 * @returns The function that detaches the router.
 * @public
 */
export const attachCameraWheelRouter = ({
  controls,
  element,
  getRouting,
  pickPivot,
  platform = detectPlatform(),
}: Readonly<{
  controls: CameraWheelRouterControls;
  element: HTMLElement;
  getRouting?: () => CameraInputRouting | undefined;
  pickPivot?: CameraPivotPicker;
  platform?: 'mac' | 'other';
}>): (() => void) => {
  let gestureScale: number | undefined;
  let held: HeldPress | undefined;
  const { ownerDocument } = element;

  const routedMapping = (routing: CameraInputRouting) =>
    resolveCameraMapping({ preset: routing.cameraInput.preset, inputDevice: routing.cameraInput.inputDevice });

  const allowed = (gesture: CameraGesture, routing: CameraInputRouting): CameraGesture =>
    (gesture === 'pan' && !routing.enablePan) || (gesture === 'zoom' && !routing.enableZoom) ? 'none' : gesture;

  const zoomByWheel = (event: WheelEvent, routing: CameraInputRouting): void => {
    const scale = resolveWheelZoomScale({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey,
      dollySpeed: controls.dollySpeed,
      platform,
      invertZoom: routing.cameraInput.invertZoom === true,
    });
    zoomToward({
      controls,
      element,
      scale,
      point: routing.cameraInput.zoomToCursor === false ? undefined : event,
    });
    controls.dispatchEvent({ type: 'control' });
  };

  const onRoutedWheel = (event: WheelEvent, routing: CameraInputRouting): void => {
    // A pinch is the person's zoom gesture: Ctrl + wheel inside the viewer never zooms the page (C14).
    if (event.ctrlKey) {
      event.preventDefault();
    }
    if (!controls.enabled) {
      return;
    }
    if (gestureScale !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const modifiers = { shift: event.shiftKey, ctrl: event.metaKey, alt: event.altKey };
    const gesture = allowed(resolveWheel(routedMapping(routing), { pinch: event.ctrlKey, modifiers }), routing);
    if (gesture === 'zoom') {
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomByWheel(event, routing);
      return;
    }
    if (gesture === 'none') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    controls.mouseButtons.wheel = toCameraControlsAction(gesture, isPerspective(controls));
  };

  const onWheel = (event: WheelEvent): void => {
    if (replayedEvents.has(event)) {
      return;
    }
    const routing = getRouting?.();
    if (routing !== undefined) {
      onRoutedWheel(event, routing);
      return;
    }
    if (!event.ctrlKey || !isWheelEnabled(controls)) {
      return;
    }
    if (gestureScale !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!shouldRerouteWheel({ ctrlKey: event.ctrlKey, perspective: isPerspective(controls) })) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    (event.target ?? element).dispatchEvent(toPlainWheel(event));
  };

  const isPinchEnabled = (routing: CameraInputRouting | undefined): boolean =>
    routing === undefined ? isWheelEnabled(controls) : controls.enabled && routing.enableZoom;

  const onGestureStart = (event: Event): void => {
    const routing = getRouting?.();
    if (routing !== undefined) {
      event.preventDefault();
    }
    if (!isPinchEnabled(routing)) {
      return;
    }
    event.preventDefault();
    const { scale } = event as GestureEventLike;
    gestureScale = typeof scale === 'number' ? scale : 1;
  };

  const onGestureChange = (event: Event): void => {
    const routing = getRouting?.();
    if (routing !== undefined) {
      event.preventDefault();
    }
    if (!isPinchEnabled(routing)) {
      return;
    }
    event.preventDefault();
    const { scale, clientX, clientY } = event as GestureEventLike;
    if (typeof scale !== 'number') {
      return;
    }
    const ratio = resolvePinchRatio({ previousScale: gestureScale ?? 1, scale });
    gestureScale = scale;
    if (ratio === undefined) {
      return;
    }
    if (routing !== undefined) {
      const point =
        routing.cameraInput.zoomToCursor !== false && typeof clientX === 'number' && typeof clientY === 'number'
          ? { clientX, clientY }
          : undefined;
      zoomToward({ controls, element, scale: routing.cameraInput.invertZoom === true ? ratio : 1 / ratio, point });
    } else if (resolveWheelAction({ ctrlKey: true, perspective: isPerspective(controls) }) === 'dolly') {
      void controls.dollyTo(controls.distance / ratio, true);
    } else {
      void controls.zoomTo(controls.camera.zoom * ratio, true);
    }
    controls.dispatchEvent({ type: 'control' });
  };

  const onGestureEnd = (event: Event): void => {
    if (gestureScale !== undefined) {
      event.preventDefault();
    }
    gestureScale = undefined;
  };

  /*
   * Moves of a held press. The listener is added on the document at each press, in the bubble phase, before
   * `camera-controls` re-adds its own, so it runs just before the controls' and can withhold a move from them without
   * hiding it from the page's other listeners.
   */
  const onHeldMove = (event: PointerEvent): void => {
    const press = held;
    if (press === undefined || event.pointerId !== press.pointerId) {
      return;
    }
    if (press.pending) {
      const travelled = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
      if (travelled <= cameraSecondaryClickThresholdPx) {
        event.stopImmediatePropagation();
        return;
      }
      press.pending = false;
    }
    if (press.pivot === undefined) {
      return;
    }
    event.stopImmediatePropagation();
    const { height } = element.getBoundingClientRect();
    if (height > 0) {
      const azimuth = (2 * Math.PI * controls.azimuthRotateSpeed * (press.lastX - event.clientX)) / height;
      const polar = (2 * Math.PI * controls.polarRotateSpeed * (press.lastY - event.clientY)) / height;
      orbitAbout({ controls, pivot: press.pivot, azimuth, polar });
      controls.dispatchEvent({ type: 'control' });
    }
    press.lastX = event.clientX;
    press.lastY = event.clientY;
  };

  const releaseHeld = (): void => {
    held = undefined;
    ownerDocument.removeEventListener('pointermove', onHeldMove);
  };

  const onHeldUp = (event: PointerEvent): void => {
    if (event.pointerId === held?.pointerId) {
      releaseHeld();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    const routing = getRouting?.();
    if (routing === undefined || event.pointerType !== 'mouse' || !controls.enabled) {
      return;
    }
    const pressed = resolvePressedButton({ ...pickKeys(event), button: event.button, platform });
    const slot = (['left', 'middle', 'right'] as const)[event.button];
    if (slot === undefined) {
      return;
    }
    const gesture =
      pressed === undefined
        ? 'none'
        : allowed(resolveDrag(routedMapping(routing), pressed.button, pressed.modifiers), routing);
    controls.mouseButtons[slot] = toCameraControlsAction(gesture, isPerspective(controls));
    releaseHeld();
    if (gesture === 'none') {
      return;
    }
    const pending = pressed?.button === 'right';
    const pivot =
      gesture === 'orbit' && routing.cameraInput.orbitAboutCursor === true
        ? pickPivot?.({ clientX: event.clientX, clientY: event.clientY, camera: controls.camera })
        : undefined;
    if (!pending && pivot === undefined) {
      return;
    }
    held = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pending,
      pivot,
    };
    ownerDocument.addEventListener('pointermove', onHeldMove);
  };

  element.addEventListener('wheel', onWheel, captureOptions);
  element.addEventListener('gesturestart', onGestureStart, captureOptions);
  element.addEventListener('gesturechange', onGestureChange, captureOptions);
  element.addEventListener('gestureend', onGestureEnd, captureOptions);
  element.addEventListener('pointerdown', onPointerDown, captureOptions);
  ownerDocument.addEventListener('pointerup', onHeldUp, captureOptions);
  ownerDocument.addEventListener('pointercancel', onHeldUp, captureOptions);

  return () => {
    element.removeEventListener('wheel', onWheel, captureOptions);
    element.removeEventListener('gesturestart', onGestureStart, captureOptions);
    element.removeEventListener('gesturechange', onGestureChange, captureOptions);
    element.removeEventListener('gestureend', onGestureEnd, captureOptions);
    element.removeEventListener('pointerdown', onPointerDown, captureOptions);
    ownerDocument.removeEventListener('pointerup', onHeldUp, captureOptions);
    ownerDocument.removeEventListener('pointercancel', onHeldUp, captureOptions);
    releaseHeld();
    gestureScale = undefined;
  };
};

const pickKeys = (
  event: MouseEvent,
): Readonly<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }> => ({
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
});
