import { describe, expect, it } from 'vitest';
import { deriveHolePatterns, deriveRevolvedChamfers, maxPartOccurrences, padSeparationGap } from '#step/features.js';
import type { FaceFact } from '#step/features.js';
import type { BrepEvidence } from '#mesh/types.js';

const cone = (
  axisDirection: [number, number, number],
  min: [number, number, number],
  max: [number, number, number],
): FaceFact => ({ faceIndex: 0, surfaceType: 'cone', axisDirection, radius: 1, bounds: { min, max } });

type HoleSpec = { axis: 'x' | 'y' | 'z'; diameter: number; center: [number, number, number]; through?: boolean };

const hole = ({
  axis,
  diameter,
  center,
  through = false,
}: HoleSpec): NonNullable<BrepEvidence['circularHoles']>[number] => ({ diameter, through, axis, center });

describe('revolved chamfer derivation', () => {
  it('should read a bevelled cone as a chamfer named by its axis', () => {
    expect(deriveRevolvedChamfers([[cone([0, 0, 1], [-13, -13, 3], [13, 13, 6.000_000_2])]])).toStrictEqual([
      { distance: 3, selection: 'revolved chamfer (axis z)' },
    ]);
    expect(deriveRevolvedChamfers([[cone([0, 1, 0], [-13, 3, -13], [13, 6, 13])]])[0]?.selection).toBe(
      'revolved chamfer (axis y)',
    );
    expect(deriveRevolvedChamfers([[cone([1, 0, 0], [3, -13, -13], [6, 13, 13])]])[0]?.selection).toBe(
      'revolved chamfer (axis x)',
    );
  });

  it('should reject a taper, a zero-span cone and a cone longer than the pad gap', () => {
    // Taller than it is wide: a taper, not an edge break.
    expect(deriveRevolvedChamfers([[cone([0, 0, 1], [-2, -2, 0], [2, 2, 10])]])).toStrictEqual([]);
    expect(deriveRevolvedChamfers([[cone([0, 0, 1], [-2, -2, 5], [2, 2, 5])]])).toStrictEqual([]);
    const long = padSeparationGap + 1;
    expect(deriveRevolvedChamfers([[cone([0, 0, 1], [-100, -100, 0], [100, 100, long])]])).toStrictEqual([]);
  });

  it('should ignore non-cone faces and cones with no axis', () => {
    const plane: FaceFact = { faceIndex: 1, surfaceType: 'plane', bounds: { min: [0, 0, 0], max: [1, 1, 1] } };
    const headless: FaceFact = { faceIndex: 2, surfaceType: 'cone', bounds: { min: [0, 0, 0], max: [1, 1, 1] } };

    expect(deriveRevolvedChamfers([[plane, headless]])).toStrictEqual([]);
  });

  it('should report one chamfer per distinct span however many occurrences share it', () => {
    const shared = cone([0, 0, 1], [-13, -13, 3], [13, 13, 6]);
    const other = cone([0, 0, 1], [-13, -13, 0], [13, 13, 5]);

    expect(deriveRevolvedChamfers([[shared], [shared], [other]])).toStrictEqual([
      { distance: 3, selection: 'revolved chamfer (axis z)' },
      { distance: 5, selection: 'revolved chamfer (axis z)' },
    ]);
  });

  it('should stop scanning beyond the occurrence cap', () => {
    const empty: FaceFact[] = [];
    const late = [cone([0, 0, 1], [-13, -13, 3], [13, 13, 6])];
    const occurrences = [...Array.from({ length: maxPartOccurrences }, () => empty), late];

    expect(deriveRevolvedChamfers(occurrences)).toStrictEqual([]);
  });
});

describe('circular hole-pattern derivation', () => {
  it('should measure the bolt circle of coplanar holes', () => {
    const patterns = deriveHolePatterns([
      hole({ axis: 'z', diameter: 8.4, center: [10, 0, 4] }),
      hole({ axis: 'z', diameter: 8.4, center: [-10, 0, 4] }),
      hole({ axis: 'z', diameter: 8.4, center: [0, 10, 4] }),
      hole({ axis: 'z', diameter: 8.4, center: [0, -10, 4] }),
    ]);

    expect(patterns).toStrictEqual([
      { count: 4, holeDiameter: 8.4, boltCircleDiameter: 20, axis: 'z', center: [0, 0, 4] },
    ]);
  });

  it('should keep coaxial holes inside the pad gap together and split them beyond it', () => {
    const together = deriveHolePatterns([
      hole({ axis: 'z', diameter: 20, center: [0, 0, 5] }),
      hole({ axis: 'z', diameter: 20, center: [0, 0, 15] }),
    ]);
    expect(together).toStrictEqual([
      { count: 2, holeDiameter: 20, boltCircleDiameter: 0, axis: 'z', center: [0, 0, 10] },
    ]);

    const apart = deriveHolePatterns([
      hole({ axis: 'x', diameter: 22, center: [-22, 0, 0] }),
      hole({ axis: 'x', diameter: 22, center: [22, 0, 0] }),
    ]);
    expect(apart).toStrictEqual([]);
  });

  it('should never mix a through hole with a blind hole of the same diameter', () => {
    expect(
      deriveHolePatterns([
        hole({ axis: 'y', diameter: 6.35, center: [200, 0, 30], through: true }),
        hole({ axis: 'y', diameter: 6.35, center: [130, 0, 30], through: false }),
      ]),
    ).toStrictEqual([]);
  });

  it('should emit pads along the axis in ascending order and quantize the grouping diameter', () => {
    const patterns = deriveHolePatterns([
      hole({ axis: 'y', diameter: 20, center: [-30, 100, 0] }),
      hole({ axis: 'y', diameter: 20.0004, center: [30, 100, 0] }),
      hole({ axis: 'y', diameter: 20, center: [-30, -100, 0] }),
      hole({ axis: 'y', diameter: 20, center: [30, -100, 0] }),
    ]);

    expect(patterns.map((pattern) => pattern.center?.[1])).toStrictEqual([-100, 100]);
    expect(patterns[1]?.holeDiameter).toBe(20);
  });

  it('should tolerate holes with no recorded centre and single-hole groups', () => {
    expect(deriveHolePatterns([{ diameter: 8, through: false, axis: 'z' }])).toStrictEqual([]);
    expect(
      deriveHolePatterns([
        { diameter: 8, through: false, axis: 'z' },
        { diameter: 8, through: false, axis: 'z' },
      ]),
    ).toStrictEqual([{ count: 2, holeDiameter: 8, boltCircleDiameter: 0, axis: 'z', center: [0, 0, 0] }]);
    expect(deriveHolePatterns([])).toStrictEqual([]);
  });
});
