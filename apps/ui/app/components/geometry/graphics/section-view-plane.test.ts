import { describe, expect, it } from 'vitest';
import { resolveSectionViewPlane } from '#components/geometry/graphics/section-view-plane.js';

describe('resolveSectionViewPlane', () => {
  it('should preserve pivot and apply XYZ rotation before the direction flip', () => {
    const quarterTurn = resolveSectionViewPlane({
      baseNormal: [1, 0, 0],
      pivot: [4, 5, 6],
      rotation: [0, 0, Math.PI / 2],
      direction: -1,
    });
    expect(quarterTurn.point).toEqual([4, 5, 6]);
    expect(quarterTurn.normal[0]).toBeCloseTo(0);
    expect(quarterTurn.normal[1]).toBeCloseTo(1);
    expect(quarterTurn.normal[2]).toBeCloseTo(0);

    expect(
      resolveSectionViewPlane({
        baseNormal: [1, 0, 0],
        pivot: [4, 5, 6],
        rotation: [0, 0, Math.PI / 2],
        direction: 1,
      }).normal,
    ).toEqual(quarterTurn.normal.map((value) => -value));
  });
});
