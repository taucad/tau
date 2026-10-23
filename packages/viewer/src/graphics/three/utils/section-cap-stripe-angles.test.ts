// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  assignSectionCapStripeAngles,
  sectionCapStripeAnglesDegrees,
} from '#graphics/three/utils/section-cap-stripe-angles.js';

const box = (min: readonly [number, number, number], max: readonly [number, number, number]): THREE.Box3 =>
  new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

const degrees = (radians: number | undefined): number => Math.round(((radians ?? Number.NaN) * 180) / Math.PI);

describe('assignSectionCapStripeAngles', () => {
  it('should hatch a lone part at 45 degrees', () => {
    const angles = assignSectionCapStripeAngles([{ ownerKey: 'a', box: box([0, 0, 0], [1, 1, 1]) }]);
    expect(degrees(angles.get('a'))).toBe(45);
  });

  it('should hatch touching parts at different angles, and spread parts apart over the palette', () => {
    const angles = assignSectionCapStripeAngles([
      { ownerKey: 'left', box: box([0, 0, 0], [1, 1, 1]) },
      { ownerKey: 'right', box: box([1, 0, 0], [2, 1, 1]) },
      { ownerKey: 'far', box: box([10, 0, 0], [11, 1, 1]) },
    ]);
    expect(degrees(angles.get('left'))).toBe(45);
    expect(degrees(angles.get('right'))).toBe(135);
    expect(degrees(angles.get('far'))).toBe(75);
  });

  it('should give every part of a dense cluster its own angle while the palette lasts', () => {
    const owners = sectionCapStripeAnglesDegrees.map((_, index) => ({
      ownerKey: `part-${index}`,
      box: box([index * 0.1, 0, 0], [index * 0.1 + 2, 1, 1]),
    }));
    const angles = assignSectionCapStripeAngles(owners);
    expect(new Set([...angles.values()].map((angle) => degrees(angle))).size).toBe(owners.length);
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
    expect([...reverse.entries()].toSorted()).toEqual([...forward.entries()].toSorted());
  });

  it('should reuse the angle its neighbours use least once the palette runs out', () => {
    const count = sectionCapStripeAnglesDegrees.length + 1;
    const owners = Array.from({ length: count }, (_, index) => ({
      ownerKey: `part-${String(index).padStart(2, '0')}`,
      box: box([0, 0, 0], [1, 1, 1]),
    }));
    const angles = [...assignSectionCapStripeAngles(owners).values()].map((angle) => degrees(angle));
    expect(angles.filter((angle) => angle === 45)).toHaveLength(2);
  });
});
