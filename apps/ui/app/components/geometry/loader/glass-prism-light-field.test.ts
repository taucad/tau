// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  defaultGlassDispersion,
  fresnelReflectance,
  refractDirection,
  refractiveIndex,
  spectralSamples,
  traceLightSheet,
} from '#components/geometry/loader/glass-prism-light-field.js';
import type { RaySegment, SheetVector } from '#components/geometry/loader/glass-prism-light-field.js';

/** Axis-aligned rectangle centred on the origin. */
const rectangle = (halfWidth: number, halfDepth: number): SheetVector[] => [
  [-halfWidth, -halfDepth],
  [halfWidth, -halfDepth],
  [halfWidth, halfDepth],
  [-halfWidth, halfDepth],
];

/** Right-angle isosceles prism with its legs along the axes and the hypotenuse facing `+x, +z`. */
const rightAnglePrism: SheetVector[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
];

const angleOf = (segment: RaySegment): number =>
  Math.atan2(segment.end[1] - segment.start[1], segment.end[0] - segment.start[0]);

const single = (segments: readonly RaySegment[], kind: RaySegment['kind']): RaySegment => {
  const matches = segments.filter((segment) => segment.kind === kind);
  if (matches.length !== 1) {
    throw new Error(`Expected one ${kind} segment, found ${matches.length}.`);
  }
  return matches[0]!;
};

describe('refractiveIndex', () => {
  it('should bend violet more than red', () => {
    const violet = refractiveIndex(defaultGlassDispersion, spectralSamples[0]!.wavelength);
    const red = refractiveIndex(defaultGlassDispersion, spectralSamples.at(-1)!.wavelength);

    expect(violet).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(1.5);
    expect(violet).toBeLessThan(1.8);
  });
});

describe('spectralSamples', () => {
  it('should add back up to white', () => {
    const totals = [0, 0, 0];
    for (const sample of spectralSamples) {
      totals[0]! += sample.color[0];
      totals[1]! += sample.color[1];
      totals[2]! += sample.color[2];
    }

    for (const channel of totals) {
      expect(channel).toBeCloseTo(1, 9);
    }
  });
});

describe('fresnelReflectance', () => {
  it('should reduce to the normal-incidence formula and reach one past the critical angle', () => {
    const index = 1.6;
    expect(fresnelReflectance(1, 1, index)).toBeCloseTo(((index - 1) / (index + 1)) ** 2, 9);
    // Inside the glass, 60 degrees is well past the 38.7 degree critical angle.
    expect(fresnelReflectance(Math.cos(Math.PI / 3), index, 1)).toBe(1);
  });
});

describe('refractDirection', () => {
  it('should obey Snell’s law at the entry face', () => {
    const incidence = Math.PI / 6;
    const direction: SheetVector = [Math.sin(incidence), -Math.cos(incidence)];
    const refracted = refractDirection(direction, [0, 1], { from: 1, into: 1.5 });

    const transmittedAngle = Math.asin(Math.sin(incidence) / 1.5);
    expect(refracted).toBeDefined();
    expect(refracted![0]).toBeCloseTo(Math.sin(transmittedAngle), 9);
    expect(refracted![1]).toBeCloseTo(-Math.cos(transmittedAngle), 9);
  });
});

describe('traceLightSheet', () => {
  const singleWavelength = [{ wavelength: 550, color: [1, 1, 1] as const }];
  const flint = { base: 1.6, dispersion: 0 };

  it('should pass straight through a slab at normal incidence', () => {
    const segments = traceLightSheet({
      polygon: rectangle(0.5, 1),
      beam: { origin: [-3, 0], direction: [1, 0], width: 0, rayCount: 1 },
      glass: flint,
      wavelengths: singleWavelength,
      reach: 2,
    });

    const incident = single(segments, 'incident');
    const internal = segments.find((segment) => segment.kind === 'internal');
    const exit = segments.find((segment) => segment.kind === 'exit');
    expect(incident.end).toEqual([-0.5, 0]);
    expect(internal!.start).toEqual([-0.5, 0]);
    expect(internal!.end[0]).toBeCloseTo(0.5, 9);
    expect(exit!.taper).toBe(true);
    expect(angleOf(exit!)).toBeCloseTo(0, 9);
    // Energy at the entry face: the stray reflection and the transmitted ray share the beam.
    const stray = single(segments, 'stray');
    expect(stray.intensity + internal!.intensity).toBeCloseTo(1, 9);
    expect(stray.intensity).toBeCloseTo(((1.6 - 1) / (1.6 + 1)) ** 2, 9);
  });

  it('should displace an oblique beam sideways and let it leave parallel to itself', () => {
    const incidence = Math.PI / 4;
    const direction: SheetVector = [Math.cos(incidence), Math.sin(incidence)];
    const segments = traceLightSheet({
      polygon: rectangle(0.5, 4),
      beam: { origin: [-2, -2 * Math.tan(incidence)], direction, width: 0, rayCount: 1 },
      glass: flint,
      wavelengths: singleWavelength,
      reach: 2,
    });

    const first = segments.find((segment) => segment.kind === 'exit')!;
    expect(angleOf(first)).toBeCloseTo(incidence, 9);
    // The ray enters at z = -0.5 and climbs through the slab at the refracted angle, so it leaves lower than
    // the z = 0.5 the undeviated line would reach.
    const refracted = Math.asin(Math.sin(incidence) / 1.6);
    expect(first.start[0]).toBeCloseTo(0.5, 9);
    expect(first.start[1]).toBeCloseTo(-0.5 + Math.tan(refracted), 9);
    expect(first.start[1]).toBeLessThan(0.5 * Math.tan(incidence));
  });

  it('should spread a spectrum through a prism with violet deviated furthest', () => {
    const segments = traceLightSheet({
      polygon: [
        [0, 1],
        [-0.9, -0.6],
        [0.9, -0.6],
      ],
      beam: { origin: [-3, 0.1], direction: [1, 0], width: 0, rayCount: 1 },
      reach: 3,
    });

    const exitsByWavelength = spectralSamples.map((sample) => {
      const exit = segments.find(
        (segment) => segment.kind === 'exit' && segment.color === sample.color && segment.start[0] > 0,
      );
      if (!exit) {
        throw new Error(`No exit for ${sample.wavelength} nm.`);
      }
      return { wavelength: sample.wavelength, deviation: -angleOf(exit) };
    });
    for (let index = 1; index < exitsByWavelength.length; index += 1) {
      expect(exitsByWavelength[index]!.deviation).toBeLessThan(exitsByWavelength[index - 1]!.deviation);
    }
    expect(exitsByWavelength[0]!.deviation).toBeGreaterThan(0.3);
  });

  it('should turn a beam by a right angle through total internal reflection', () => {
    const segments = traceLightSheet({
      polygon: rightAnglePrism,
      beam: { origin: [-3, -0.4], direction: [1, 0], width: 0, rayCount: 1 },
      glass: flint,
      wavelengths: singleWavelength,
      // Above the faint reflection every face returns at normal incidence, so only the turn remains.
      minIntensity: 0.1,
      reach: 2,
    });

    const internal = segments.filter((segment) => segment.kind === 'internal');
    const exits = segments.filter((segment) => segment.kind === 'exit');
    // Two internal legs: in through the left face, reflected off the hypotenuse, out through the bottom.
    expect(internal).toHaveLength(2);
    expect(exits).toHaveLength(1);
    expect(angleOf(exits[0]!)).toBeCloseTo(-Math.PI / 2, 9);
    expect(exits[0]!.start[1]).toBeCloseTo(-1, 9);
  });

  it('should let a beam that misses the body run on as white light', () => {
    const segments = traceLightSheet({
      polygon: rectangle(0.5, 0.5),
      beam: { origin: [-3, 2], direction: [1, 0], width: 0.2, rayCount: 3 },
      reach: 4,
    });

    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment.kind).toBe('incident');
      expect(segment.taper).toBe(true);
      expect(segment.color).toEqual([1, 1, 1]);
      expect(segment.end[0]).toBeCloseTo(1, 9);
    }
  });

  it('should bound the work per frame by rays, wavelengths and interactions', () => {
    const rayCount = 24;
    const maxInteractions = 3;
    const segments = traceLightSheet({
      polygon: rectangle(0.6, 0.6),
      beam: { origin: [-3, 0], direction: [1, 0], width: 0.8, rayCount },
      maxInteractions,
      minIntensity: 0,
      reach: 2,
    });

    // Per ray and wavelength: one stray, then per interaction one internal leg and at most one exit.
    const perPath = 1 + maxInteractions * 2;
    expect(segments.length).toBeLessThanOrEqual(rayCount + rayCount * spectralSamples.length * perPath);
    expect(segments.length).toBeGreaterThan(rayCount * spectralSamples.length);
  });
});
