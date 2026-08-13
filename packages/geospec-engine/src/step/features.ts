/**
 * Derived BRep face features.
 *
 * The kernel recognizes planar chamfers, cylinders and circular holes; two
 * classes it cannot express in its own face loop are derived here from the
 * per-occurrence analytic face facts and the hole list (register row
 * "Chamfer/hole-pattern derivation", failure mode D-19):
 *
 * - **Revolved chamfers** — a conical face read as a bevel. Its facts come from
 *   `faceFacts`, whose bounds are pinned `useTriangulation=false` (D-3), so the
 *   derived span is identical whether or not the mesh facet ran first.
 * - **Through-hole normalized bolt patterns** — coaxial holes are partitioned
 *   into pads before they can form a pattern, and a through hole never shares a
 *   pattern with a blind one of the same diameter.
 *
 * @module
 */

import type { BrepEvidence } from '#mesh/types.js';

/** Axial separation beyond which two coaxial holes sit on different pads. */
export const padSeparationGap = 20;

/** Occurrence scan cap for per-occurrence face-fact derivation. */
export const maxPartOccurrences = 8;

const axisIndex = { x: 0, y: 1, z: 2 } as const;

type AxisName = keyof typeof axisIndex;

/** One analytic face fact row emitted by the kernel's `faceFacts`. */
export type FaceFact = {
  faceIndex: number;
  surfaceType: string;
  axisDirection?: [number, number, number];
  radius?: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const dominantAxis = (direction: readonly [number, number, number]): AxisName => {
  const [x, y, z] = [Math.abs(direction[0]), Math.abs(direction[1]), Math.abs(direction[2])];
  if (x >= y && x >= z) {
    return 'x';
  }
  return y >= z ? 'y' : 'z';
};

/**
 * Derive the revolved chamfers of a subject from its per-occurrence face facts.
 *
 * A conical face counts as a chamfer when it is wider than it is tall (a bevel,
 * not a taper) and its axial span stays inside {@link padSeparationGap} — a
 * long cone is a feature in its own right, not an edge break. Distances are
 * quantized to microns and deduplicated, because one authored chamfer appears
 * once per occurrence that shares the prototype.
 *
 * @param factsByOccurrence - Face facts per occurrence, in occurrence order.
 * @returns The derived chamfer rows, in first-encounter order.
 * @public
 */
export const deriveRevolvedChamfers = (
  factsByOccurrence: ReadonlyArray<readonly FaceFact[]>,
): NonNullable<BrepEvidence['chamferFeatures']> => {
  const seen = new Set<number>();
  const chamfers: NonNullable<BrepEvidence['chamferFeatures']> = [];
  for (const faces of factsByOccurrence.slice(0, maxPartOccurrences)) {
    for (const face of faces) {
      if (face.surfaceType !== 'cone' || !face.axisDirection) {
        continue;
      }
      const axis = dominantAxis(face.axisDirection);
      const span = [0, 1, 2].map((index) => face.bounds.max[index]! - face.bounds.min[index]!);
      const axial = span[axisIndex[axis]]!;
      const radial =
        Math.max(...[0, 1, 2].filter((index) => index !== axisIndex[axis]).map((index) => span[index]!)) / 2;
      if (!(axial > 0) || axial > radial || axial > padSeparationGap) {
        continue;
      }
      const distance = round3(axial);
      if (seen.has(distance)) {
        continue;
      }
      seen.add(distance);
      chamfers.push({ distance, selection: `revolved chamfer (axis ${axis})` });
    }
  }
  return chamfers;
};

/**
 * Derive circular-hole patterns from the kernel's hole list.
 *
 * Holes group by axis, quantized diameter and through-ness — a through hole and
 * a blind hole of the same diameter are different features, so they never share
 * a pattern. Within a group holes are ordered along their axis and split into
 * pads wherever consecutive holes sit more than {@link padSeparationGap} apart;
 * a pad needs two holes to be a pattern.
 *
 * @param holes - Circular holes reported by the kernel.
 * @returns The pattern rows.
 * @public
 */
export const deriveHolePatterns = (
  holes: NonNullable<BrepEvidence['circularHoles']>,
): NonNullable<BrepEvidence['circularHolePatterns']> => {
  type Hole = NonNullable<BrepEvidence['circularHoles']>[number];
  const groups = new Map<string, Hole[]>();
  for (const hole of holes) {
    const key = `${hole.axis}:${round3(hole.diameter)}:${hole.through}`;
    const group = groups.get(key);
    if (group) {
      group.push(hole);
    } else {
      groups.set(key, [hole]);
    }
  }

  const patterns: NonNullable<BrepEvidence['circularHolePatterns']> = [];
  for (const group of groups.values()) {
    const axis = axisIndex[group[0]!.axis];
    const centerOf = (hole: Hole): number => hole.center?.[axis] ?? 0;
    const ordered = [...group].sort((left, right) => centerOf(left) - centerOf(right));
    const pads: Hole[][] = [[ordered[0]!]];
    for (const hole of ordered.slice(1)) {
      const pad = pads.at(-1)!;
      if (centerOf(hole) - centerOf(pad.at(-1)!) > padSeparationGap) {
        pads.push([hole]);
      } else {
        pad.push(hole);
      }
    }
    for (const pad of pads) {
      if (pad.length < 2) {
        continue;
      }
      const center = [0, 1, 2].map(
        (component) => pad.reduce((sum, hole) => sum + (hole.center?.[component] ?? 0), 0) / pad.length,
      ) as [number, number, number];
      let radialSum = 0;
      for (const hole of pad) {
        const [first, second] = [0, 1, 2]
          .filter((component) => component !== axis)
          .map((component) => (hole.center?.[component] ?? 0) - center[component]!);
        radialSum += Math.hypot(first!, second!);
      }
      patterns.push({
        count: pad.length,
        holeDiameter: pad[0]!.diameter,
        boltCircleDiameter: (2 * radialSum) / pad.length,
        axis: pad[0]!.axis,
        center,
      });
    }
  }
  return patterns;
};
