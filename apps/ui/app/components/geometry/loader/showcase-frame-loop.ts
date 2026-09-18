import type { WebGPURenderer } from 'three/webgpu';

/**
 * Frame loop shared by the showcase loaders: a frame cap, wall-clock statistics and a governor that steps the
 * cost down while frames run long and back up, more cautiously each time, once there is headroom. The owner
 * drives its animation and draw from `onFrame`, and applies each governor step from `onAdaptiveLevel`.
 */

/** Governor steps, least visible first. */
export const adaptiveLevels = { pixelRatio: 1, bloom: 2, frameRate: 3 } as const;

export type ShowcaseFrameLoopOptions = Readonly<{
  /** Frames per second the loop aims for before any adaptive cap. */
  targetFrameRate: number;
  /** Advances the animation by the clamped frame delta in milliseconds and draws. */
  onFrame: (deltaMilliseconds: number) => void;
  /** Receives every governor step change: 0 none, then {@link adaptiveLevels}. */
  onAdaptiveLevel?: (level: number) => void;
}>;

export type ShowcaseFrameLoop = Readonly<{
  /** Start drawing through the renderer's animation loop; a no-op while already looping. */
  start: (renderer: WebGPURenderer) => void;
  stop: () => void;
  isLooping: () => boolean;
  getFramesPerSecond: () => number;
  getAdaptiveLevel: () => number;
  /** Frames per second the loop currently aims for, after any adaptive cap. */
  getTargetFrameRate: () => number;
}>;

/** Milliseconds; frame deltas above this (tab switches, debugger pauses) are clamped so the loop never leaps. */
const maximumFrameDelta = 100;
/** Milliseconds between frames-per-second estimates. */
const statisticsWindow = 500;
/** Frames per second the loop settles to once the governor caps it. */
const reducedFrameRate = 30;
/** Milliseconds of slack under the frame cap, so a display tick just short of the interval still draws. */
const frameCapTolerance = 3;
/** Average frame interval, relative to the target, above which a statistics window counts as slow. */
const adaptiveSlowRatio = 1.35;
/** Average frame interval, relative to the target, below which a window counts as having headroom. */
const adaptiveFastRatio = 1.05;
const adaptiveSlowWindows = 2;
/** Windows of headroom before a governor step is undone; doubles each time a step has to be repeated. */
const adaptiveRecoveryWindows = 8;
const adaptiveRecoveryWindowsLimit = 64;

/** Build a loop; see the module description. */
export const createShowcaseFrameLoop = (options: ShowcaseFrameLoopOptions): ShowcaseFrameLoop => {
  let renderer: WebGPURenderer | undefined;
  let isLooping = false;
  let lastFrameTime: number | undefined;
  let framesInWindow = 0;
  let windowElapsed = 0;
  let windowStartedAt: number | undefined;
  let framesPerSecond = 0;
  let adaptiveLevel = 0;
  let slowWindows = 0;
  let headroomWindows = 0;
  let recoveryWindows = adaptiveRecoveryWindows;

  const effectiveFrameRate = (): number =>
    adaptiveLevel >= adaptiveLevels.frameRate
      ? Math.min(reducedFrameRate, options.targetFrameRate)
      : options.targetFrameRate;

  const setAdaptiveLevel = (level: number): void => {
    const next = Math.max(0, Math.min(adaptiveLevels.frameRate, level));
    if (next === adaptiveLevel) {
      return;
    }
    adaptiveLevel = next;
    slowWindows = 0;
    headroomWindows = 0;
    options.onAdaptiveLevel?.(adaptiveLevel);
  };

  const govern = (averageInterval: number, frameInterval: number): void => {
    if (averageInterval > frameInterval * adaptiveSlowRatio) {
      headroomWindows = 0;
      slowWindows += 1;
      if (slowWindows >= adaptiveSlowWindows && adaptiveLevel < adaptiveLevels.frameRate) {
        setAdaptiveLevel(adaptiveLevel + 1);
        recoveryWindows = Math.min(recoveryWindows * 2, adaptiveRecoveryWindowsLimit);
      }
      return;
    }
    slowWindows = 0;
    if (averageInterval < frameInterval * adaptiveFastRatio && adaptiveLevel > 0) {
      headroomWindows += 1;
      if (headroomWindows >= recoveryWindows) {
        setAdaptiveLevel(adaptiveLevel - 1);
      }
      return;
    }
    headroomWindows = 0;
  };

  const frame = (time: number): void => {
    if (!isLooping) {
      return;
    }
    const frameInterval = 1000 / effectiveFrameRate();
    if (lastFrameTime !== undefined && time - lastFrameTime < frameInterval - frameCapTolerance) {
      // Under the frame cap this display tick is skipped; the clock catches up on the next drawn frame.
      return;
    }
    const delta = lastFrameTime === undefined ? 0 : Math.min(maximumFrameDelta, Math.max(0, time - lastFrameTime));
    lastFrameTime = time;
    windowStartedAt ??= time;
    options.onFrame(delta);
    framesInWindow += 1;
    windowElapsed += delta;
    if (windowElapsed >= statisticsWindow) {
      // Statistics use wall-clock time, not the clamped loop deltas, so a struggling device reads truthfully.
      const windowDuration = Math.max(1, time - windowStartedAt);
      framesPerSecond = (framesInWindow * 1000) / windowDuration;
      govern(windowDuration / framesInWindow, frameInterval);
      framesInWindow = 0;
      windowElapsed = 0;
      windowStartedAt = time;
    }
  };

  return {
    start: (target) => {
      if (isLooping) {
        return;
      }
      renderer = target;
      isLooping = true;
      lastFrameTime = undefined;
      windowStartedAt = undefined;
      framesInWindow = 0;
      windowElapsed = 0;
      void renderer.setAnimationLoop(frame);
    },
    stop: () => {
      if (!renderer || !isLooping) {
        return;
      }
      isLooping = false;
      void renderer.setAnimationLoop(null);
    },
    isLooping: () => isLooping,
    getFramesPerSecond: () => framesPerSecond,
    getAdaptiveLevel: () => adaptiveLevel,
    getTargetFrameRate: effectiveFrameRate,
  };
};
