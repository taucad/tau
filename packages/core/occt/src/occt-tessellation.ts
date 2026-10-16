/**
 * Resolution of OCCT tessellation requests into the absolute tolerances OCCT meshes with.
 *
 * A request is a quality preset or explicit tolerances, never both. A preset scales with the
 * shape's bounding-box diagonal; explicit tolerances pass through unchanged, so OCCT always meshes
 * in absolute mode with millimetres and degrees. A triangle budget then bounds the result: preview
 * and capture coarsen one step at a time and report it, export refuses with a suggested value.
 *
 * @public
 */

import type { KernelIssue } from '@taucad/runtime/types';
import type { OcctTessellation, OcctTessellationQuality } from '#occt-schemas.js';

/** Absolute OCCT tolerances: a chordal deviation in millimetres and an angle in degrees. @public */
export type OcctTessellationTolerances = Readonly<{
  linearTolerance: number;
  angularTolerance: number;
}>;

/** Tolerances resolved from a request, with the form that was requested. @public */
export type OcctResolvedTessellation = OcctTessellationTolerances &
  Readonly<{
    /** The preset name, or `'explicit'` for explicit tolerances. */
    requested: OcctTessellationQuality | 'explicit';
  }>;

/** The lane a mesh is produced for; each lane has its own triangle budget. @public */
export type OcctTessellationLane = 'preview' | 'capture' | 'export';

/**
 * Bounding-box diagonal divisor and angular tolerance in degrees for each preset.
 * Linear tolerance is `clamp(diagonal / divisor, 0.001 mm, 50 mm)`.
 * @public
 */
export const occtTessellationPresets: Readonly<
  Record<OcctTessellationQuality, Readonly<{ divisor: number; angularTolerance: number }>>
> = {
  low: { divisor: 500, angularTolerance: 30 },
  medium: { divisor: 2000, angularTolerance: 20 },
  high: { divisor: 8000, angularTolerance: 12 },
  'extra-high': { divisor: 32_000, angularTolerance: 6 },
};

/** Smallest and largest linear tolerance in millimetres a preset resolves to. @public */
export const occtPresetLinearToleranceRange = { min: 0.001, max: 50 } as const;

/**
 * Field values for explicit tolerances that omit one field, per lane. They are the absolute
 * defaults OCCT kernels have always used, so an explicit request meshes exactly as before.
 * @public
 */
export const occtExplicitTessellationDefaults: Readonly<Record<'preview' | 'export', OcctTessellationTolerances>> = {
  preview: { linearTolerance: 0.02, angularTolerance: 20 },
  export: { linearTolerance: 0.01, angularTolerance: 20 },
};

/**
 * Triangle budgets per lane. Over budget, preview and capture coarsen; export refuses.
 * @public
 */
export const occtTriangleBudgets: Readonly<Record<OcctTessellationLane, number>> = {
  preview: 2_000_000,
  capture: 8_000_000,
  export: 20_000_000,
};

/** How many coarser steps preview and capture take before delivering what they have. @public */
export const occtMaxTessellationDowngrades = 3;

const presetLinearTolerance = (diagonal: number, divisor: number): number => {
  if (Number.isNaN(diagonal)) {
    return occtPresetLinearToleranceRange.max;
  }
  return Math.min(occtPresetLinearToleranceRange.max, Math.max(occtPresetLinearToleranceRange.min, diagonal / divisor));
};

/**
 * Resolve a tessellation request into absolute tolerances. Explicit tolerances win whole and
 * never read the shape; a preset reads the bounding-box diagonal once.
 *
 * @param options - The request, the field values for an explicit request that omits one, and a
 * measurement of the shape's bounding-box diagonal in millimetres, called only for a preset.
 * @returns Absolute tolerances and the form that was requested.
 * @public
 */
export const resolveOcctTessellation = (options: {
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
  measureDiagonal: () => number;
}): OcctResolvedTessellation => {
  const { tessellation, explicitDefaults, measureDiagonal } = options;
  if (typeof tessellation === 'string') {
    const preset = occtTessellationPresets[tessellation];
    return {
      requested: tessellation,
      linearTolerance: presetLinearTolerance(measureDiagonal(), preset.divisor),
      angularTolerance: preset.angularTolerance,
    };
  }
  return {
    requested: 'explicit',
    linearTolerance: tessellation.linearTolerance ?? explicitDefaults.linearTolerance,
    angularTolerance: tessellation.angularTolerance ?? explicitDefaults.angularTolerance,
  };
};

/**
 * One step coarser: twice the linear tolerance and four degrees more angular tolerance.
 *
 * @param tolerances - The tolerances that produced too many triangles.
 * @returns The next coarser tolerances.
 * @public
 */
export const coarsenOcctTessellation = (tolerances: OcctTessellationTolerances): OcctTessellationTolerances => ({
  linearTolerance: tolerances.linearTolerance * 2,
  angularTolerance: tolerances.angularTolerance + 4,
});

const roundUpToTwoSignificantDigits = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return value;
  }
  const scale = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Number((Math.ceil(value / scale) * scale).toPrecision(2));
};

/**
 * Tolerances expected to fit a budget, from the observation that triangle count scales with the
 * inverse of the linear tolerance.
 *
 * @param tolerances - The tolerances that exceeded the budget.
 * @param measured - Triangles they produced and the budget they exceeded.
 * @returns Suggested explicit tolerances.
 * @public
 */
export const suggestOcctTessellation = (
  tolerances: OcctTessellationTolerances,
  measured: Readonly<{ triangles: number; budget: number }>,
): OcctTessellationTolerances => ({
  linearTolerance: roundUpToTwoSignificantDigits(
    (tolerances.linearTolerance * measured.triangles) / Math.max(1, measured.budget),
  ),
  angularTolerance: tolerances.angularTolerance,
});

/** The outcome of tessellating within a budget. @public */
export type OcctBudgetedTessellation<T> = Readonly<{
  /** The last tessellation produced. */
  result: T;
  /** Tolerances that produced it. */
  effective: OcctTessellationTolerances;
  /** Coarser steps taken; zero when the request fitted. */
  downgraded: number;
}>;

/**
 * Tessellate, then coarsen one step at a time while the result exceeds the budget, at most
 * {@link occtMaxTessellationDowngrades} times. The last result is delivered even if it is still
 * over budget; the caller reports the downgrade.
 *
 * @param options - Starting tolerances, the triangle budget and the tessellation to run.
 * @returns The delivered result, its tolerances and the number of coarser steps.
 * @public
 */
export const tessellateWithinOcctBudget = <T extends Readonly<{ triangles: number }>>(options: {
  tolerances: OcctTessellationTolerances;
  budget: number;
  tessellate: (tolerances: OcctTessellationTolerances) => T;
}): OcctBudgetedTessellation<T> => {
  const { budget, tessellate } = options;
  let effective = options.tolerances;
  let result = tessellate(effective);
  let downgraded = 0;
  while (result.triangles > budget && downgraded < occtMaxTessellationDowngrades) {
    effective = coarsenOcctTessellation(effective);
    downgraded++;
    result = tessellate(effective);
  }
  return { result, effective, downgraded };
};

const formatTolerances = (tolerances: OcctTessellationTolerances): string =>
  `{ linearTolerance: ${String(tolerances.linearTolerance)}, angularTolerance: ${String(tolerances.angularTolerance)} }`;

/**
 * The warning a preview or capture reports after coarsening an over-budget mesh.
 *
 * @param options - Kernel identity, requested and effective tolerances, steps taken, triangles and budget.
 * @returns A `TESSELLATION_DOWNGRADED` warning.
 * @public
 */
export const createTessellationDowngradedIssue = (options: {
  producer: string;
  requested: OcctResolvedTessellation;
  effective: OcctTessellationTolerances;
  downgraded: number;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { producer, requested, effective, downgraded, triangles, budget } = options;
  const requestedLabel = requested.requested === 'explicit' ? 'explicit tolerances' : `preset '${requested.requested}'`;
  return {
    message:
      `Tessellation exceeded the ${String(budget)}-triangle budget at ${requestedLabel} ${formatTolerances(requested)}; ` +
      `coarsened ${String(downgraded)} step${downgraded === 1 ? '' : 's'} to ${formatTolerances(effective)} ` +
      `(${String(triangles)} triangles). Request a coarser preset or explicit tolerances to choose the mesh yourself.`,
    code: 'TESSELLATION_DOWNGRADED',
    type: 'kernel',
    severity: 'warning',
    details: {
      producer,
      requested: {
        form: requested.requested,
        linearTolerance: requested.linearTolerance,
        angularTolerance: requested.angularTolerance,
      },
      effective: { linearTolerance: effective.linearTolerance, angularTolerance: effective.angularTolerance },
      downgraded,
      triangles,
      budget,
    },
  };
};

/**
 * The error an export reports instead of coarsening a mesh over its budget.
 *
 * @param options - Kernel identity, requested tolerances, triangles produced and budget.
 * @returns A `RESOURCE_LIMIT` error naming suggested explicit tolerances.
 * @public
 */
export const createTessellationBudgetExceededIssue = (options: {
  producer: string;
  requested: OcctResolvedTessellation;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { producer, requested, triangles, budget } = options;
  const suggested = suggestOcctTessellation(requested, { triangles, budget });
  return {
    message:
      `Export tessellation produced ${String(triangles)} triangles, over the ${String(budget)}-triangle export budget, ` +
      `at ${formatTolerances(requested)}. Exports are never coarsened silently; ` +
      `request a coarser preset or tessellation ${formatTolerances(suggested)}.`,
    code: 'RESOURCE_LIMIT',
    type: 'kernel',
    severity: 'error',
    details: {
      producer,
      requested: {
        form: requested.requested,
        linearTolerance: requested.linearTolerance,
        angularTolerance: requested.angularTolerance,
      },
      suggested,
      triangles,
      budget,
    },
  };
};
