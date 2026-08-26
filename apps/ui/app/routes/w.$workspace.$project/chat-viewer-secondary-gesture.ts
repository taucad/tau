import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';

export const viewerSecondaryGestureThresholdPx = 4;

export type ViewerSecondaryGesturePoint = {
  readonly clientX: number;
  readonly clientY: number;
};

export type ViewerSecondaryGestureMenu = {
  readonly target: ModelComponentSecondaryPointerTarget;
  readonly point: ViewerSecondaryGesturePoint;
};

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

export type ViewerSecondaryGestureCompletion = {
  readonly state: ViewerSecondaryGestureState;
  readonly menu?: ViewerSecondaryGestureMenu;
};

export const idleViewerSecondaryGestureState: ViewerSecondaryGestureState = { status: 'idle' };

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

  return { status: 'pendingContextClick', pointerId, start: point, latest: point };
}

export function attachViewerSecondaryGestureTarget(
  state: ViewerSecondaryGestureState,
  target: ModelComponentSecondaryPointerTarget | undefined,
): ViewerSecondaryGestureState {
  if (state.status !== 'pendingContextClick') {
    return state;
  }

  return { ...state, target };
}

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
