import { easeMorph } from '#components/geometry/splash/morph-animation.js';
import {
  storyDuration,
  storySteps,
  storyTransitionDuration,
} from '#components/geometry/splash/design-story.constants.js';

/** A pose is derived from absolute loop time, so pause and repeat cannot drift. */
export const storyFrame = (
  elapsed: number,
): { time: number; step: (typeof storySteps)[number]; age: number; entrance: number; exit: number } => {
  const time = ((elapsed % storyDuration) + storyDuration) % storyDuration;
  const step = storySteps.find((candidate) => time < candidate.end) ?? storySteps[0];
  const age = time - step.start;
  return {
    time,
    step,
    age,
    entrance: easeMorph(Math.min(1, age / storyTransitionDuration)),
    exit: easeMorph(Math.max(0, 1 - (step.end - time) / storyTransitionDuration)),
  };
};

export const partLift = (name: string): number => {
  if (name === 'Housing') {
    return -25;
  }
  if (name === 'Ring') {
    return 25;
  }
  if (name === 'Carrier') {
    return 5;
  }
  if (name === 'Sun') {
    return 70;
  }
  if (name.startsWith('Planet')) {
    return 45;
  }
  if (name === 'Cover') {
    return 140;
  }
  return 165;
};
