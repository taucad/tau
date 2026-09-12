import type { RefObject } from 'react';

/**
 * State for managing a morph animation.
 */
export type MorphAnimationState = {
  /** Raw (un-eased) progress ref, 0 to 1 */
  progressRef: RefObject<number>;
  /** Whether the animation has reached the target */
  hasReachedTargetRef: RefObject<boolean>;
  /** Previous target value for detecting changes */
  previousTargetRef: RefObject<number>;
};

/** Smoothstep easing shared by the morph timeline and the CPU shader oracle. */
export const easeMorph = (value: number): number => value * value * (3 - 2 * value);

/**
 * Advances a morph toward `targetProgress` on a fixed timeline.
 *
 * Raw progress moves linearly at `1 / duration`, so a morph always lands exactly
 * on its target after `duration` milliseconds — the crossfade that follows sees
 * points resting on the surface rather than still creeping toward it (an
 * exponential lerp never settles, and the state machine's fallback timers cut
 * over while the cloud is still ~6% short). The eased value is what the shader
 * consumes; easing once here lets the shader keep its path piecewise-linear so
 * velocity never drops to zero mid-flight.
 *
 * @param root0 - The morph animation update parameters
 * @param root0.state - The morph animation state refs
 * @param root0.targetProgress - The target progress value (0 to 1)
 * @param root0.delta - Frame delta time in seconds
 * @param root0.duration - Total travel time from 0 to 1 in milliseconds
 * @param root0.onComplete - Optional callback when animation reaches target
 * @returns The eased progress value for this frame
 */
export function updateMorphAnimation({
  state,
  targetProgress,
  delta,
  duration,
  onComplete,
}: {
  state: MorphAnimationState;
  targetProgress: number;
  delta: number;
  duration: number;
  onComplete?: (progress: number) => void;
}): number {
  const step = (delta * 1000) / duration;
  const raw = state.progressRef.current;
  state.progressRef.current =
    raw < targetProgress ? Math.min(targetProgress, raw + step) : Math.max(targetProgress, raw - step);

  const progress = easeMorph(state.progressRef.current);

  if (!state.hasReachedTargetRef.current && state.progressRef.current === targetProgress) {
    state.hasReachedTargetRef.current = true;
    onComplete?.(progress);
  }

  return progress;
}

/**
 * Resets the animation state when target changes.
 * Call this in a useEffect that watches targetProgress.
 */
export function resetMorphAnimationOnTargetChange(state: MorphAnimationState, targetProgress: number): void {
  if (state.previousTargetRef.current !== targetProgress) {
    state.hasReachedTargetRef.current = false;
    state.previousTargetRef.current = targetProgress;
  }
}
