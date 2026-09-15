import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { designStoryMachine } from '#components/geometry/splash/design-story.machine.js';
import { storyFrame } from '#components/geometry/splash/design-story-timeline.js';
import { storyDuration, storySteps } from '#components/geometry/splash/design-story.constants.js';

describe('shared design story clock', () => {
  it('repeats exactly five beats for ten loops without accumulated pose drift', () => {
    const actor = createActor(designStoryMachine, { input: {} }).start();
    actor.send({ type: 'play' });
    const boundaries: string[] = [];
    let previous = 'create';
    for (let tick = 0; tick < (10 * storyDuration) / 100; tick++) {
      actor.send({ type: 'advance', delta: 100 });
      const frame = storyFrame(actor.getSnapshot().context.elapsed);
      if (frame.step.id !== previous) {
        boundaries.push(frame.step.id);
        previous = frame.step.id;
      }
    }
    expect(boundaries).toHaveLength(50);
    expect(boundaries.slice(0, 5)).toEqual(['check', 'refine', 'assemble', 'print', 'create']);
    expect(storyFrame(actor.getSnapshot().context.elapsed)).toEqual(storyFrame(0));
    actor.stop();
  });

  it('freezes all derived state while paused and rejects invalid or giant frame deltas', () => {
    const actor = createActor(designStoryMachine, { input: {} }).start();
    actor.send({ type: 'advance', delta: 100 });
    expect(actor.getSnapshot().context.elapsed).toBe(0);
    actor.send({ type: 'play' });
    actor.send({ type: 'advance', delta: 50 });
    actor.send({ type: 'pause' });
    actor.send({ type: 'advance', delta: 100 });
    expect(actor.getSnapshot().context.elapsed).toBe(50);
    actor.send({ type: 'play' });
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      actor.send({ type: 'advance', delta });
    }
    expect(actor.getSnapshot().context.elapsed).toBe(50);
    actor.send({ type: 'advance', delta: 60_000 });
    expect(actor.getSnapshot().context.elapsed).toBe(150);
    actor.stop();
  });

  it('returns to the same scatter endpoint on every boundary and keeps readable holds', () => {
    for (const step of storySteps) {
      expect(storyFrame(step.start).entrance).toBe(0);
      expect(storyFrame(step.end - 0.001).exit).toBeCloseTo(1, 8);
      expect(storyFrame(step.start + 500).entrance).toBe(1);
      expect(storyFrame(step.end - 500).exit).toBe(0);
      expect(step.end - step.start - 1000).toBeGreaterThanOrEqual(4000);
    }
  });
});
