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
 */
import CameraControlsImpl from 'camera-controls';
import { OrthographicCamera } from 'three';

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
 * The parts of a `camera-controls` instance the router reads and drives.
 *
 * @public
 */
export type CameraWheelRouterControls = Pick<
  CameraControlsImpl,
  'camera' | 'enabled' | 'distance' | 'dollyTo' | 'zoomTo' | 'dispatchEvent'
> & {
  readonly mouseButtons: Readonly<{ wheel: CameraControlsImpl['mouseButtons']['wheel'] }>;
};

/** Safari's `GestureEvent`, which the DOM library does not declare. */
type GestureEventLike = Event & { readonly scale?: unknown };

const isWheelEnabled = (controls: CameraWheelRouterControls): boolean =>
  controls.enabled && controls.mouseButtons.wheel !== CameraControlsImpl.ACTION.NONE;

const isPerspective = (controls: CameraWheelRouterControls): boolean =>
  !(controls.camera instanceof OrthographicCamera);

/**
 * Copies a wheel event without `ctrlKey`: what a plain wheel of the same deltas would deliver.
 *
 * @param event - The `ctrlKey` wheel event.
 * @returns A new, untrusted wheel event with the same deltas, position, buttons and other modifiers.
 */
const toPlainWheel = (event: WheelEvent): WheelEvent =>
  new WheelEvent('wheel', {
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

const captureOptions = { capture: true, passive: false } as const;

/**
 * Attaches the wheel router to the surface the controls are connected to. Call it beside `controls.connect` and call
 * what it returns beside `controls.disconnect`.
 *
 * - A `ctrlKey` wheel in perspective is stopped before `camera-controls` sees it and replayed on its target as a plain
 *   wheel, so it takes the dolly a plain wheel of that sign takes. In orthographic it passes through, a zoom as before.
 * - A Safari pinch (`gesturestart`, `gesturechange`) scales the camera's distance in perspective and its zoom in
 *   orthographic by the change of the gesture's scale, and never zooms the page. A `ctrlKey` wheel inside a Safari
 *   pinch is dropped, so a browser that sends both moves the camera once.
 *
 * While the controls are disabled or their wheel does nothing, the router leaves every event alone.
 *
 * @param input - The controls and the surface element they listen on.
 * @returns The function that detaches the router.
 * @public
 */
export const attachCameraWheelRouter = ({
  controls,
  element,
}: Readonly<{ controls: CameraWheelRouterControls; element: HTMLElement }>): (() => void) => {
  let gestureScale: number | undefined;

  const onWheel = (event: WheelEvent): void => {
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

  const onGestureStart = (event: Event): void => {
    if (!isWheelEnabled(controls)) {
      return;
    }
    event.preventDefault();
    const { scale } = event as GestureEventLike;
    gestureScale = typeof scale === 'number' ? scale : 1;
  };

  const onGestureChange = (event: Event): void => {
    if (!isWheelEnabled(controls)) {
      return;
    }
    event.preventDefault();
    const { scale } = event as GestureEventLike;
    if (typeof scale !== 'number') {
      return;
    }
    const ratio = resolvePinchRatio({ previousScale: gestureScale ?? 1, scale });
    gestureScale = scale;
    if (ratio === undefined) {
      return;
    }
    if (resolveWheelAction({ ctrlKey: true, perspective: isPerspective(controls) }) === 'dolly') {
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

  element.addEventListener('wheel', onWheel, captureOptions);
  element.addEventListener('gesturestart', onGestureStart, captureOptions);
  element.addEventListener('gesturechange', onGestureChange, captureOptions);
  element.addEventListener('gestureend', onGestureEnd, captureOptions);

  return () => {
    element.removeEventListener('wheel', onWheel, captureOptions);
    element.removeEventListener('gesturestart', onGestureStart, captureOptions);
    element.removeEventListener('gesturechange', onGestureChange, captureOptions);
    element.removeEventListener('gestureend', onGestureEnd, captureOptions);
    gestureScale = undefined;
  };
};
