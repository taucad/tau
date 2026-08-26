import type { RefObject } from 'react';

/**
 * Crossfade opacity values for source and target elements.
 */
export type CrossfadeOpacity = {
  source: number;
  target: number;
};

/**
 * State for managing a crossfade animation.
 */
export type CrossfadeState = {
  /** Progress ref (0 to 1) */
  progressRef: RefObject<number>;
  /** Whether crossfade is currently active */
  isActiveRef: RefObject<boolean>;
  /** Whether completion callback has been sent */
  hasSentCompleteRef: RefObject<boolean>;
};

/**
 * Smooth step easing function (ease in-out).
 * Creates smooth acceleration and deceleration.
 */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Calculates crossfade opacity values from progress.
 *
 * @param progress - Raw progress value (0 to 1)
 * @returns Object with source and target opacity values (eased)
 */
export function calculateCrossfadeOpacity(progress: number): CrossfadeOpacity {
  const eased = smoothstep(progress);
  return {
    source: 1 - eased,
    target: eased,
  };
}

/**
 * Updates crossfade animation state for one frame.
 *
 * @param root0 - The crossfade update parameters
 * @param root0.state - The crossfade state refs
 * @param root0.delta - Frame delta time in seconds
 * @param root0.duration - Total crossfade duration in milliseconds
 * @param root0.onComplete - Optional callback when crossfade completes
 * @returns The current opacity values, or undefined if not active
 */
export function updateCrossfade({
  state,
  delta,
  duration,
  onComplete,
}: {
  state: CrossfadeState;
  delta: number;
  duration: number;
  onComplete?: () => void;
}): CrossfadeOpacity | undefined {
  if (!state.isActiveRef.current) {
    return undefined;
  }

  // Update progress
  const speed = 1000 / duration;
  state.progressRef.current = Math.min(1, state.progressRef.current + speed * delta);

  const progress = state.progressRef.current;
  const opacity = calculateCrossfadeOpacity(progress);

  // Check if complete
  if (progress >= 1 && !state.hasSentCompleteRef.current) {
    state.hasSentCompleteRef.current = true;
    state.isActiveRef.current = false;
    onComplete?.();
  }

  return opacity;
}

/**
 * Starts a crossfade animation by resetting state.
 */
export function startCrossfade(state: CrossfadeState): void {
  state.isActiveRef.current = true;
  state.progressRef.current = 0;
  state.hasSentCompleteRef.current = false;
}
