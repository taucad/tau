// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  assignSectionCapStripeAngles,
  sectionCapAlternateSpacingScale,
  sectionCapStripeAnglesDegrees,
} from '#graphics/three/utils/section-cap-stripe-angles.js';
import type { SectionCapHatch } from '#graphics/three/utils/section-cap-stripe-angles.js';

const box = (min: readonly [number, number, number], max: readonly [number, number, number]): THREE.Box3 =>
  new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

const degrees = (hatch: SectionCapHatch | undefined): number =>
  Math.round(((hatch?.angle ?? Number.NaN) * 180) / Math.PI);

const key = (hatch: SectionCapHatch | undefined): string => `${degrees(hatch)}@${hatch?.spacingScale ?? Number.NaN}`;

describe('assignSectionCapStripeAngles', () => {
  it('should hatch a lone part at 45 degrees and the cap spacing', () => {
    const hatches = assignSectionCapStripeAngles([{ ownerKey: 'a', box: box([0, 0, 0], [1, 1, 1]) }]);
    expect(key(hatches.get('a'))).toBe('45@1');
  });

  it('should hatch touching parts at different angles, and spread parts apart over the palette', () => {
    const hatches = assignSectionCapStripeAngles([
      { ownerKey: 'left', box: box([0, 0, 0], [1, 1, 1]) },
      { ownerKey: 'right', box: box([1, 0, 0], [2, 1, 1]) },
      { ownerKey: 'far', box: box([10, 0, 0], [11, 1, 1]) },
    ]);
    expect(degrees(hatches.get('left'))).toBe(45);
    expect(degrees(hatches.get('right'))).toBe(135);
    expect(degrees(hatches.get('far'))).toBe(75);
  });

  it('should give every part of a dense cluster its own angle at the cap spacing while the angles last', () => {
    const owners = sectionCapStripeAnglesDegrees.map((_, index) => ({
      ownerKey: `part-${index}`,
      box: box([index * 0.1, 0, 0], [index * 0.1 + 2, 1, 1]),
    }));
    const hatches = [...assignSectionCapStripeAngles(owners).values()];
    expect(new Set(hatches.map((hatch) => degrees(hatch))).size).toBe(owners.length);
    expect(new Set(hatches.map(({ spacingScale }) => spacingScale))).toEqual(new Set([1]));
  });

  it('should give the part with the most neighbours the first angle, and not depend on input order', () => {
    const housing = { ownerKey: 'housing', box: box([0, 0, 0], [10, 10, 10]) };
    const shaft = { ownerKey: 'shaft', box: box([1, 1, 1], [2, 2, 2]) };
    const gear = { ownerKey: 'gear', box: box([5, 5, 5], [6, 6, 6]) };
    const forward = assignSectionCapStripeAngles([shaft, gear, housing]);
    const reverse = assignSectionCapStripeAngles([housing, gear, shaft]);
    expect(degrees(forward.get('housing'))).toBe(45);
    expect(degrees(forward.get('gear'))).toBe(135);
    expect(degrees(forward.get('shaft'))).toBe(75);
    expect([...reverse.entries()].map(([ownerKey, hatch]) => `${ownerKey}:${key(hatch)}`).toSorted()).toEqual(
      [...forward.entries()].map(([ownerKey, hatch]) => `${ownerKey}:${key(hatch)}`).toSorted(),
    );
  });

  it('should change the spacing, as drafting does, once every angle is taken by a neighbour', () => {
    const count = sectionCapStripeAnglesDegrees.length + 1;
    const owners = Array.from({ length: count }, (_, index) => ({
      ownerKey: `part-${String(index).padStart(2, '0')}`,
      box: box([0, 0, 0], [1, 1, 1]),
    }));
    const hatches = [...assignSectionCapStripeAngles(owners).values()];
    expect(new Set(hatches.map((hatch) => key(hatch))).size).toBe(count);
    expect(hatches.filter(({ spacingScale }) => spacingScale === sectionCapAlternateSpacingScale)).toHaveLength(1);
  });

  it('should keep the cap spacing for parts apart, however many there are', () => {
    const owners = Array.from({ length: sectionCapStripeAnglesDegrees.length * 2 }, (_, index) => ({
      ownerKey: `part-${String(index).padStart(2, '0')}`,
      box: box([index * 10, 0, 0], [index * 10 + 1, 1, 1]),
    }));
    const hatches = [...assignSectionCapStripeAngles(owners).values()];
    expect(new Set(hatches.map(({ spacingScale }) => spacingScale))).toEqual(new Set([1]));
  });
});
