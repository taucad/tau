import type { RefObject } from 'react';

/** Threshold for considering morph animation complete */
export const morphCompleteThreshold = 0.01;

/**
 * State for managing a morph animation.
 */
export type MorphAnimationState = {
  /** Current progress ref (0 to 1) */
  progressRef: RefObject<number>;
  /** Whether the animation has reached the target */
  hasReachedTargetRef: RefObject<boolean>;
  /** Previous target value for detecting changes */
  previousTargetRef: RefObject<number>;
};

/**
 * Linear interpolation between two values.
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Updates morph animation state for one frame.
 *
 * @param root0 - The morph animation update parameters
 * @param root0.state - The morph animation state refs
 * @param root0.targetProgress - The target progress value (0 to 1)
 * @param root0.delta - Frame delta time in seconds
 * @param root0.animationSpeed - Speed multiplier for the animation
 * @param root0.onComplete - Optional callback when animation reaches target
 * @returns The current progress value
 */
export function updateMorphAnimation({
  state,
  targetProgress,
  delta,
  animationSpeed,
  onComplete,
}: {
  state: MorphAnimationState;
  targetProgress: number;
  delta: number;
  animationSpeed: number;
  onComplete?: (progress: number) => void;
}): number {
  // Animate progress towards target using lerp. The factor must be clamped to
  // 1: RAF deltas can span minutes (tab-hidden / off-viewport pauses), and an
  // unclamped factor extrapolates progress far past the target — the shader's
  // cubic easing then flings every point out of the frustum.
  state.progressRef.current = lerp(state.progressRef.current, targetProgress, Math.min(animationSpeed * delta, 1));

  // Clamp to exact values when very close
  if (Math.abs(state.progressRef.current - targetProgress) < 0.001) {
    state.progressRef.current = targetProgress;
  }

  const progress = state.progressRef.current;

  // Check if we've reached the target
  const distanceToTarget = Math.abs(progress - targetProgress);

  if (!state.hasReachedTargetRef.current && distanceToTarget < morphCompleteThreshold) {
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
