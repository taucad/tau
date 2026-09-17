// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createSeededRandom,
  defaultMorphTiming,
  hasSameShapePairRun,
  pickNextShape,
  sampleMorphTimeline,
} from '#components/geometry/loader/metal-morph-sequence.js';
import { metalMorphShapeIds } from '#components/geometry/loader/metal-morph-shapes.js';

describe('createSeededRandom', () => {
  it('should replay the same sequence for the same seed and stay inside [0, 1)', () => {
    const first = createSeededRandom(1234);
    const second = createSeededRandom(1234);
    const values = Array.from({ length: 50 }, () => first());

    expect(values).toEqual(Array.from({ length: 50 }, () => second()));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(new Set(values).size).toBeGreaterThan(40);
  });

  it('should recover from a zero seed instead of locking at zero', () => {
    const random = createSeededRandom(0);
    expect(random()).not.toBe(random());
  });
});

describe('hasSameShapePairRun', () => {
  it('should flag three transitions bouncing between two shapes', () => {
    expect(hasSameShapePairRun(['cube', 'icosahedron', 'cube', 'icosahedron'])).toBe(true);
    expect(hasSameShapePairRun(['escher-star', 'cube', 'icosahedron', 'cube', 'icosahedron'])).toBe(true);
  });

  it('should accept two transitions on one pair and anything involving a third shape', () => {
    expect(hasSameShapePairRun(['cube', 'icosahedron', 'cube'])).toBe(false);
    expect(hasSameShapePairRun(['cube', 'icosahedron', 'cube', 'dodecahedron'])).toBe(false);
    expect(hasSameShapePairRun(['icosahedron', 'cube', 'icosahedron', 'dodecahedron'])).toBe(false);
  });
});

describe('pickNextShape', () => {
  it('should never repeat the current shape and never allow three same-pair transitions', () => {
    const random = createSeededRandom(42);
    const history: string[] = ['cube'];
    const seen = new Set<string>();
    for (let step = 0; step < 10_000; step += 1) {
      const next = pickNextShape(history, metalMorphShapeIds, random);
      expect(next).not.toBe(history.at(-1));
      history.push(next);
      seen.add(next);
      expect(hasSameShapePairRun(history)).toBe(false);
    }
    expect([...seen].sort()).toEqual([...metalMorphShapeIds].sort());
  });

  it('should exclude exactly the bouncing shape after an A, B, A run', () => {
    const counts = new Map<string, number>();
    const random = createSeededRandom(7);
    for (let step = 0; step < 2000; step += 1) {
      const next = pickNextShape(['cube', 'icosahedron', 'cube'], metalMorphShapeIds, random);
      counts.set(next, (counts.get(next) ?? 0) + 1);
    }
    expect(counts.has('cube')).toBe(false);
    expect(counts.has('icosahedron')).toBe(false);
    expect([...counts.keys()].sort()).toEqual(['dodecahedron', 'escher-star', 'stella-octangula']);
  });

  it('should start from any shape when the history is empty', () => {
    expect(metalMorphShapeIds).toContain(pickNextShape([], metalMorphShapeIds, () => 0.99));
  });
});

describe('sampleMorphTimeline', () => {
  const cycle = defaultMorphTiming.restDuration + defaultMorphTiming.morphDuration;

  it('should rest at the target form before the first transition', () => {
    const sample = sampleMorphTimeline(0);

    expect(sample).toMatchObject({ phase: 'rest', cycleIndex: 0, frontProgress: 1, molten: 0, ring: 0, scale: 1 });
  });

  it('should move the front monotonically from source to target during a morph', () => {
    let previous = 0;
    for (let step = 0; step <= 100; step += 1) {
      const elapsed = defaultMorphTiming.restDuration + (step / 100) * (defaultMorphTiming.morphDuration - 1);
      const sample = sampleMorphTimeline(elapsed);
      expect(sample.phase).toBe('morph');
      expect(sample.cycleIndex).toBe(0);
      expect(sample.frontProgress).toBeGreaterThanOrEqual(previous);
      expect(sample.molten).toBeGreaterThanOrEqual(0);
      expect(sample.molten).toBeLessThanOrEqual(1);
      expect(sample.scale).toBeGreaterThan(0.95);
      expect(sample.scale).toBeLessThan(1.05);
      previous = sample.frontProgress;
    }
    expect(sampleMorphTimeline(defaultMorphTiming.restDuration).frontProgress).toBe(0);
    expect(previous).toBe(1);
  });

  it('should be molten mid-transition, dry at both ends, and ring down into the next rest', () => {
    const mid = sampleMorphTimeline(defaultMorphTiming.restDuration + defaultMorphTiming.morphDuration * 0.5);
    expect(mid.molten).toBe(1);
    expect(mid.spinImpulse).toBeCloseTo(1, 9);

    const start = sampleMorphTimeline(defaultMorphTiming.restDuration);
    expect(start.molten).toBe(0);

    const nextRest = sampleMorphTimeline(cycle + 20);
    expect(nextRest.phase).toBe('rest');
    expect(nextRest.cycleIndex).toBe(1);
    expect(Math.abs(nextRest.ring)).toBeGreaterThan(0);

    const settled = sampleMorphTimeline(cycle + defaultMorphTiming.restDuration - 1);
    expect(Math.abs(settled.ring)).toBeLessThan(0.05);
  });

  it('should clamp negative or non-finite elapsed values to the start', () => {
    expect(sampleMorphTimeline(-500)).toEqual(sampleMorphTimeline(0));
    expect(sampleMorphTimeline(Number.NaN)).toEqual(sampleMorphTimeline(0));
  });
});
