/**
 * Resolution of OCCT tessellation requests into the absolute tolerances OCCT meshes with.
 *
 * A request is a quality preset or explicit tolerances, never both. A preset scales with the
 * shape's bounding-box diagonal; explicit tolerances pass through unchanged, so OCCT always meshes
 * in absolute mode with millimetres and degrees. The mesh is produced once at the resolved
 * tolerances; there is no triangle budget, no coarsening and no export refusal.
 *
 * @public
 */

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
