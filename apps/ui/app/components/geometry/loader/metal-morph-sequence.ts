/**
 * Shape sequencing and the morph timeline for the metal morph loader.
 *
 * Both halves are pure so the loader controller, the showcase page and the tests share one oracle: the
 * sequencer decides which form comes next, the timeline decides how far along the current cycle the body is.
 */

export type MorphTimingConfig = Readonly<{
  /** Milliseconds a form holds still between transitions. */
  restDuration: number;
  /** Milliseconds one transition takes from the first ripple to the last settle. */
  morphDuration: number;
}>;

export const defaultMorphTiming: MorphTimingConfig = { restDuration: 1300, morphDuration: 1500 };

export type MorphPhase = 'rest' | 'morph';

export type MorphTimelineSample = Readonly<{
  phase: MorphPhase;
  /** Completed rest+morph cycles before this sample. */
  cycleIndex: number;
  /** Normalised position inside the current phase, 0 inclusive to 1 exclusive. */
  phaseProgress: number;
  /** Eased travel of the transformation front across the body: 0 shows the source form, 1 the target. */
  frontProgress: number;
  /** Liquid-metal amplitude envelope, 0 at rest and 1 while the front is fully molten. */
  molten: number;
  /** Signed, decaying settle wobble that rings after the front has passed. */
  ring: number;
  /** Extra angular impulse envelope while the body is bending, 0 at rest to 1 mid-transition. */
  spinImpulse: number;
  /** Uniform scale multiplier: a small anticipation squash followed by a swell. */
  scale: number;
}>;

/** Minimal-standard multiplicative congruential generator; deterministic and free of bitwise operators. */
export const createSeededRandom = (seed: number): (() => number) => {
  const modulus = 2_147_483_647;
  const multiplier = 48_271;
  let state = Math.abs(Math.trunc(seed)) % modulus;
  if (state === 0) {
    state = 1;
  }
  return () => {
    state = (state * multiplier) % modulus;
    return (state - 1) / (modulus - 1);
  };
};

/** Fresh seed for a loader that did not receive one; deterministic seeds stay available for tests. */
export const randomSeed = (): number => Math.floor(Math.random() * 2_147_483_646) + 1;

/**
 * True when the last `transitionCount` transitions of `history` all move between the same two shapes,
 * for example `A, B, A, B` for three transitions.
 */
export const hasSameShapePairRun = <Shape>(history: readonly Shape[], transitionCount = 3): boolean => {
  if (history.length < transitionCount + 1) {
    return false;
  }
  const window = history.slice(-(transitionCount + 1));
  const pair = new Set(window);
  return pair.size === 2 && window.every((shape, index) => index === 0 || shape !== window[index - 1]);
};

/**
 * Choose the next form. The next form never repeats the current one, and no three consecutive transitions
 * may bounce between the same two forms, so `A, B, A` is followed by anything but `B`.
 */
export const pickNextShape = <Shape>(
  history: readonly Shape[],
  shapes: readonly Shape[],
  random: () => number,
): Shape => {
  const current = history.at(-1);
  const previous = history.at(-2);
  const beforePrevious = history.at(-3);
  const excluded = new Set<Shape>();
  if (current !== undefined) {
    excluded.add(current);
  }
  if (previous !== undefined && beforePrevious !== undefined && beforePrevious === current) {
    excluded.add(previous);
  }
  const candidates = shapes.filter((shape) => !excluded.has(shape));
  const pool = candidates.length > 0 ? candidates : shapes.filter((shape) => shape !== current);
  const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (pick === undefined) {
    throw new Error('The metal morph loader needs at least two shapes to sequence.');
  }
  return pick;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (value: number): number => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

const gaussian = (value: number, centre: number, width: number): number => Math.exp(-(((value - centre) / width) ** 2));

/** Ring-down starts once the front has crossed most of the body and keeps decaying into the rest phase. */
const ringStartFraction = 0.82;
/** Seconds for the settle wobble to decay by `e`. */
const ringDecaySeconds = 0.3;
/** Settle wobble frequency in hertz. */
const ringFrequencyHertz = 3.1;

const settleRing = (secondsSinceRingStart: number): number =>
  secondsSinceRingStart < 0
    ? 0
    : Math.exp(-secondsSinceRingStart / ringDecaySeconds) *
      Math.sin(2 * Math.PI * ringFrequencyHertz * secondsSinceRingStart);

/**
 * Evaluate the loop at `elapsed` milliseconds since the sequence started. Each cycle is a rest followed by a
 * morph; the caller owns the clock so speed changes and pauses never jump the animation.
 */
export const sampleMorphTimeline = (
  elapsed: number,
  timing: MorphTimingConfig = defaultMorphTiming,
): MorphTimelineSample => {
  const cycleDuration = timing.restDuration + timing.morphDuration;
  const safeElapsed = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  const cycleIndex = Math.floor(safeElapsed / cycleDuration);
  const local = safeElapsed - cycleIndex * cycleDuration;
  const ringStart = timing.restDuration + ringStartFraction * timing.morphDuration;

  if (local < timing.restDuration) {
    const secondsSinceRingStart = cycleIndex === 0 ? -1 : (local + cycleDuration - ringStart) / 1000;
    return {
      phase: 'rest',
      cycleIndex,
      phaseProgress: local / timing.restDuration,
      frontProgress: 1,
      molten: 0,
      ring: settleRing(secondsSinceRingStart),
      spinImpulse: 0,
      scale: 1,
    };
  }

  const progress = (local - timing.restDuration) / timing.morphDuration;
  const attack = smoothstep(0, 0.14, progress);
  const release = 1 - smoothstep(0.8, 0.97, progress);
  return {
    phase: 'morph',
    cycleIndex,
    phaseProgress: progress,
    frontProgress: easeInOutCubic((progress - 0.06) / 0.8),
    molten: attack * release,
    ring: settleRing((local - ringStart) / 1000),
    spinImpulse: Math.sin(Math.PI * progress) ** 2,
    scale: 1 - 0.03 * gaussian(progress, 0.09, 0.07) + 0.02 * gaussian(progress, 0.5, 0.22),
  };
};
