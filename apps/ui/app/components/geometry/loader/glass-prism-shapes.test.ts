// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  getGlassPrismSolid,
  glassPrismShapeDefinitions,
  glassPrismShapeIds,
  morphWeightAt,
  sampleSheetCrossSection,
} from '#components/geometry/loader/glass-prism-shapes.js';
import { sampleRadial } from '#components/geometry/loader/metal-morph-shapes.js';
import type { Vector3Tuple } from '#components/geometry/loader/metal-morph-shapes.js';

const identity = (direction: Vector3Tuple): Vector3Tuple => direction;

const radii = (points: ReadonlyArray<readonly [number, number]>): number[] => points.map(([x, z]) => Math.hypot(x, z));

describe('glassPrismShapeDefinitions', () => {
  it.each(glassPrismShapeIds)('should frame %s within a unit of the origin', (id) => {
    const solid = getGlassPrismSolid(id);
    let furthest = 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 400; step += 1) {
      const z = 1 - (2 * (step + 0.5)) / 400;
      const azimuth = step * Math.PI * (3 - Math.sqrt(5));
      const ring = Math.sqrt(1 - z * z);
      const sample = sampleRadial(solid, [ring * Math.cos(azimuth), z, ring * Math.sin(azimuth)]);
      furthest = Math.max(furthest, sample.radius);
      nearest = Math.min(nearest, sample.radius);
    }

    expect(furthest).toBeGreaterThan(0.72);
    expect(furthest).toBeLessThan(1.12);
    expect(nearest).toBeGreaterThan(0.2);
  });

  it('should keep every morphology convex with more faces than a tetrahedron', () => {
    for (const id of glassPrismShapeIds) {
      const solid = getGlassPrismSolid(id);
      expect(solid.faces.length).toBeGreaterThanOrEqual(5);
      expect(solid.spikes).toBeUndefined();
      expect(solid.roundness).toBe(glassPrismShapeDefinitions[id].roundness);
    }
  });
});

describe('morphWeightAt', () => {
  const front = { sweepAxis: [0, 1, 0] as const, band: 0.28, overshoot: 0.15 };

  it('should show the source form before the front sets out and the target once it has passed', () => {
    for (const direction of [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
    ] as const) {
      expect(morphWeightAt(direction, { ...front, progress: 0 })).toBeCloseTo(0, 9);
      expect(morphWeightAt(direction, { ...front, progress: 1 })).toBeCloseTo(1, 9);
    }
  });

  it('should move the front along the sweep axis', () => {
    const behind = morphWeightAt([0, -1, 0], { ...front, progress: 0.5 });
    const ahead = morphWeightAt([0, 1, 0], { ...front, progress: 0.5 });

    expect(behind).toBeGreaterThan(0.9);
    expect(ahead).toBeLessThan(0.1);
  });
});

describe('sampleSheetCrossSection', () => {
  it('should cut a three-cornered section from the resting prism', () => {
    const prism = getGlassPrismSolid('prism');
    const section = sampleSheetCrossSection({ from: prism, to: prism, toObjectSpace: identity, scale: 1, count: 360 });
    const lengths = radii(section);

    expect(section).toHaveLength(360);
    // Three corners: local maxima of the radius spaced 120 degrees apart.
    const corners = lengths.filter(
      (length, index) => length > lengths.at(index - 1)! && length >= lengths[(index + 1) % lengths.length]!,
    );
    expect(corners).toHaveLength(3);
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeGreaterThan(1.6);
  });

  it('should cut a near-circle from the resting lens', () => {
    const lens = getGlassPrismSolid('lens');
    const lengths = radii(
      sampleSheetCrossSection({ from: lens, to: lens, toObjectSpace: identity, scale: 1, count: 90 }),
    );

    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.03);
  });

  it('should scale with the body and turn with it', () => {
    const slab = getGlassPrismSolid('slab');
    const unturned = sampleSheetCrossSection({ from: slab, to: slab, toObjectSpace: identity, scale: 0.5, count: 4 });
    // A quarter turn about the sheet normal swaps the slab's long and short axes.
    const turned = sampleSheetCrossSection({
      from: slab,
      to: slab,
      toObjectSpace: ([x, y, z]) => [-z, y, x],
      scale: 0.5,
      count: 4,
    });

    expect(Math.hypot(...unturned[0]!)).toBeCloseTo(0.5 * 0.9 * 1 - 0.5 * 0.035 * Math.log(1), 3);
    expect(Math.hypot(...unturned[0]!)).toBeGreaterThan(Math.hypot(...unturned[1]!));
    expect(Math.hypot(...turned[0]!)).toBeCloseTo(Math.hypot(...unturned[1]!), 6);
  });

  it('should blend the section between two forms as the front passes', () => {
    const prism = getGlassPrismSolid('prism');
    const droplet = getGlassPrismSolid('droplet');
    const at = (progress: number): number[] =>
      radii(
        sampleSheetCrossSection({
          from: prism,
          to: droplet,
          front: { sweepAxis: [1, 0, 0], progress, band: 0.28, overshoot: 0 },
          toObjectSpace: identity,
          scale: 1,
          count: 12,
        }),
      );
    const source = radii(
      sampleSheetCrossSection({ from: prism, to: prism, toObjectSpace: identity, scale: 1, count: 12 }),
    );
    const target = radii(
      sampleSheetCrossSection({ from: droplet, to: droplet, toObjectSpace: identity, scale: 1, count: 12 }),
    );

    expect(at(0).map((value) => Number(value.toFixed(6)))).toEqual(source.map((value) => Number(value.toFixed(6))));
    expect(at(1).map((value) => Number(value.toFixed(6)))).toEqual(target.map((value) => Number(value.toFixed(6))));
  });
});
