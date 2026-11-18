// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createToleranceLadder } from '#utils/tolerance-ladder.js';

describe('tolerance ladder (E8)', () => {
  it('snaps to rungs a quarter octave apart', () => {
    const ladder = createToleranceLadder();

    expect(ladder.quantize('medium', 1)).toBe(1);
    expect(createToleranceLadder().quantize('medium', 0.25)).toBe(0.25);
    expect(createToleranceLadder().quantize('medium', 0.3)).toBeCloseTo(2 ** -1.75, 15);
  });

  it('holds its rung while a drag moves the raw tolerance a little, and moves once it leaves the band', () => {
    const ladder = createToleranceLadder();
    const start = ladder.quantize('medium', 0.5);
    // Within three quarters of a rung either way (2^(0.75/4) ≈ 1.139): the rung holds.
    const held = [0.5 * 1.05, 0.5 * 1.12, 0.5 / 1.12, 0.5 * 1.1].map((raw) => ladder.quantize('medium', raw));
    const moved = ladder.quantize('medium', 0.5 * 1.2);

    expect(held).toStrictEqual([start, start, start, start]);
    expect(moved).toBeCloseTo(2 ** (-1 + 0.25), 15);
    // Other requests keep their own rungs.
    expect(ladder.quantize('high', 0.52)).toBe(0.5);
  });

  it('stays inside the preset range and passes non-finite tolerances through', () => {
    const ladder = createToleranceLadder();

    // The nearest rung, 2^5.75 mm, is above the largest preset tolerance.
    expect(ladder.quantize('low', 50)).toBe(50);
    // The nearest rung, 2^-10 mm, is below the smallest preset tolerance.
    expect(ladder.quantize('extra-high', 0.001)).toBe(0.001);
    expect(ladder.quantize('medium', Number.NaN)).toBeNaN();
  });
});
