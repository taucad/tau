/**
 * The viewer's secondary-pointer gesture: a right press that stays within a few pixels until release opens the part
 * menu where it began; one that travels further is a camera pan. A pure reducer, driven by the canvas region's
 * capture-phase pointer handlers and the viewer's secondary pointer candidate.
 */
import type { ModelComponentSecondaryPointerTarget } from '@taucad/viewer/graphics/three/react/gltf-mesh';

/**
 * How far, in CSS pixels, a right press may travel and still open the part menu.
 *
 * @public
 */
export const viewerSecondaryGestureThresholdPx = 4;

/**
 * A pointer position in viewport coordinates.
 *
 * @public
 */
export type ViewerSecondaryGesturePoint = {
  readonly clientX: number;
  readonly clientY: number;
};

/**
 * The part menu a completed gesture opens: its part and where the press began.
 *
 * @public
 */
export type ViewerSecondaryGestureMenu = {
  readonly target: ModelComponentSecondaryPointerTarget;
  readonly point: ViewerSecondaryGesturePoint;
};

/**
 * Where a secondary gesture is.
 *
 * @public
 */
export type ViewerSecondaryGestureState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'pendingContextClick';
      readonly pointerId: number;
      readonly start: ViewerSecondaryGesturePoint;
      readonly latest: ViewerSecondaryGesturePoint;
      readonly target?: ModelComponentSecondaryPointerTarget;
    }
  | {
      readonly status: 'cameraPan';
      readonly pointerId: number;
      readonly start: ViewerSecondaryGesturePoint;
      readonly latest: ViewerSecondaryGesturePoint;
    }
  | {
      readonly status: 'suppressed';
      readonly pointerId: number;
      readonly start: ViewerSecondaryGesturePoint;
      readonly latest: ViewerSecondaryGesturePoint;
    };

/**
 * The state after a release, and the menu it opens, if any.
 *
 * @public
 */
export type ViewerSecondaryGestureCompletion = {
  readonly state: ViewerSecondaryGestureState;
  readonly menu?: ViewerSecondaryGestureMenu;
};

/**
 * No secondary gesture in progress.
 *
 * @public
 */
export const idleViewerSecondaryGestureState: ViewerSecondaryGestureState = {
  status: 'idle',
};

/**
 * Starts a gesture on a right press.
 *
 * @param options - The pointer, where it pressed, and whether the press is suppressed.
 * @returns The pending (or suppressed) gesture.
 * @public
 */
export function beginViewerSecondaryGesture({
  pointerId,
  point,
  isSuppressed = false,
}: {
  readonly pointerId: number;
  readonly point: ViewerSecondaryGesturePoint;
  readonly isSuppressed?: boolean;
}): ViewerSecondaryGestureState {
  if (isSuppressed) {
    return { status: 'suppressed', pointerId, start: point, latest: point };
  }

  return {
    status: 'pendingContextClick',
    pointerId,
    start: point,
    latest: point,
  };
}

/**
 * Records the part under a pending press, as the viewer reports it.
 *
 * @param state - The current gesture.
 * @param target - The part, or `undefined` when the press missed every part.
 * @returns The gesture with its part.
 * @public
 */
export function attachViewerSecondaryGestureTarget(
  state: ViewerSecondaryGestureState,
  target: ModelComponentSecondaryPointerTarget | undefined,
): ViewerSecondaryGestureState {
  if (state.status !== 'pendingContextClick') {
    return state;
  }

  return { ...state, target };
}

/**
 * Follows the pointer; past the threshold the gesture becomes a camera pan.
 *
 * @param options - The gesture, the pointer and its position, and the threshold.
 * @returns The next gesture.
 * @public
 */
export function moveViewerSecondaryGesture({
  state,
  pointerId,
  point,
  thresholdPx = viewerSecondaryGestureThresholdPx,
}: {
  readonly state: ViewerSecondaryGestureState;
  readonly pointerId: number;
  readonly point: ViewerSecondaryGesturePoint;
  readonly thresholdPx?: number;
}): ViewerSecondaryGestureState {
  if (state.status === 'idle' || state.pointerId !== pointerId) {
    return state;
  }

  if (state.status === 'suppressed') {
    return { ...state, latest: point };
  }

  const nextState = { ...state, latest: point };
  if (getSquaredDistance(state.start, point) <= thresholdPx * thresholdPx) {
    return nextState;
  }

  return {
    status: 'cameraPan',
    pointerId,
    start: state.start,
    latest: point,
  };
}

/**
 * Ends a gesture on release.
 *
 * @param options - The gesture, the pointer and its position, and the threshold.
 * @returns The idle gesture, and the menu to open when the press stayed on a part.
 * @public
 */
export function completeViewerSecondaryGesture({
  state,
  pointerId,
  point,
  thresholdPx = viewerSecondaryGestureThresholdPx,
}: {
  readonly state: ViewerSecondaryGestureState;
  readonly pointerId: number;
  readonly point: ViewerSecondaryGesturePoint;
  readonly thresholdPx?: number;
}): ViewerSecondaryGestureCompletion {
  if (state.status === 'idle' || state.pointerId !== pointerId) {
    return { state };
  }

  if (
    state.status === 'pendingContextClick' &&
    state.target &&
    getSquaredDistance(state.start, point) <= thresholdPx * thresholdPx
  ) {
    return {
      state: idleViewerSecondaryGestureState,
      menu: {
        target: state.target,
        point: state.start,
      },
    };
  }

  return { state: idleViewerSecondaryGestureState };
}

/**
 * Abandons a gesture, for a cancelled pointer or lost capture.
 *
 * @param state - The current gesture.
 * @param pointerId - The pointer that ended; any pointer when omitted.
 * @returns The idle gesture, or `state` when another pointer owns it.
 * @public
 */
export function cancelViewerSecondaryGesture(
  state: ViewerSecondaryGestureState,
  pointerId?: number,
): ViewerSecondaryGestureState {
  if (state.status === 'idle' || (pointerId !== undefined && state.pointerId !== pointerId)) {
    return state;
  }

  return idleViewerSecondaryGestureState;
}

function getSquaredDistance(left: ViewerSecondaryGesturePoint, right: ViewerSecondaryGesturePoint): number {
  const deltaX = right.clientX - left.clientX;
  const deltaY = right.clientY - left.clientY;
  return deltaX * deltaX + deltaY * deltaY;
}
