/**
 * Manifold tessellation: a quality preset or Manifold's explicit circular-detail settings, never both.
 *
 * The preset table mirrors `@taucad/occt-core`'s `occt-schemas.ts`, so every kernel uses the same words for the
 * same cost. There is no triangle budget: a preview or export meshes once at the requested detail.
 * Manifold has no chordal deviation of its own: it splits each circle into
 * `min(360 / angle, 2πr / edgeLength)` segments. A preset therefore sets the edge length to the size-derived
 * linear value and the angle to the smaller of the preset angle and the angle whose chord deviates by that
 * linear value on a circle as large as the model, so a preset is scale-invariant and fine where OCCT's would be.
 *
 * @public
 */

import { z } from 'zod';
import { quantity, quantityKinds } from '@taucad/runtime/kernel';
import type { TessellationReport } from '@taucad/runtime/types';

/** Tessellation quality presets, coarsest first. @public */
export const manifoldTessellationQualities = ['low', 'medium', 'high', 'extra-high'] as const;

/** A tessellation quality preset name. @public */
export type ManifoldTessellationQuality = (typeof manifoldTessellationQualities)[number];

const tessellationFormsMessage =
  "tessellation is a preset ('low' | 'medium' | 'high' | 'extra-high') or an explicit object " +
  '{ segments?, linearTolerance?, angularTolerance? } with at least one field, never both';

/**
 * Explicit Manifold circular detail: a fixed segment count, a minimum segment length in millimetres
 * (`setMinCircularEdgeLength`) and a minimum segment angle in degrees (`setMinCircularAngle`).
 * At least one field is required and no other key is accepted, so a preset cannot ride along.
 * @public
 */
export const manifoldExplicitTessellationSchema = z
  .strictObject(
    {
      segments: z
        .number()
        .int()
        .min(3)
        .optional()
        .meta({ examples: [64] })
        .describe('Segments in every circle that does not set its own'),
      linearTolerance: quantity({ unit: 'mm', quantityKind: quantityKinds.length, space: 'linear' })
        .positive()
        .optional()
        .meta({ examples: [1] })
        .describe('Minimum circular segment length (distance)'),
      angularTolerance: quantity({ unit: 'deg', quantityKind: quantityKinds.planeAngle, space: 'linear' })
        .positive()
        .optional()
        .meta({ examples: [10] })
        .describe('Minimum circular segment angle (degrees)'),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `explicit tessellation accepts only segments, linearTolerance and angularTolerance; ${tessellationFormsMessage}`
          : undefined,
    },
  )
  .refine(
    (value) =>
      value.segments !== undefined || value.linearTolerance !== undefined || value.angularTolerance !== undefined,
    {
      message: `explicit tessellation needs segments, linearTolerance or angularTolerance; ${tessellationFormsMessage}`,
    },
  )
  .meta({ title: 'Explicit', minProperties: 1 })
  .describe('Explicit circular detail in segments, millimetres and degrees');

/**
 * A tessellation preset or explicit circular detail, never both. JSON Schema `oneOf`.
 * @public
 */
export const manifoldTessellationSchema = z.xor(
  [
    z
      .enum(manifoldTessellationQualities, {
        error: () => `expected a preset 'low' | 'medium' | 'high' | 'extra-high'; ${tessellationFormsMessage}`,
      })
      .meta({ title: 'Preset' })
      .describe('Quality preset derived from the model bounding-box diagonal'),
    manifoldExplicitTessellationSchema,
  ],
  { error: () => tessellationFormsMessage },
);

/** A tessellation preset name or explicit circular detail. @public */
export type ManifoldTessellation = z.output<typeof manifoldTessellationSchema>;

/** Circular-detail settings applied before `main` runs. @public */
export type ManifoldCircularDetail = Readonly<{
  /** Fixed segments per circle; overrides the edge length and the angle when set. */
  segments?: number;
  /** Minimum segment length in millimetres. */
  linearTolerance: number;
  /** Minimum segment angle in degrees. */
  angularTolerance: number;
}>;

/** Settings resolved from a request, with the form that was requested. @public */
export type ManifoldResolvedTessellation = ManifoldCircularDetail &
  Readonly<{ requested: ManifoldTessellationQuality | 'explicit' }>;

/** Manifold's own defaults, used for the fields an explicit request omits. @public */
export const manifoldCircularDefaults = { linearTolerance: 1, angularTolerance: 10 } as const;

/** Bounding-box diagonal divisor and angle in degrees per preset (mirrors `occtTessellationPresets`). @public */
export const manifoldTessellationPresets: Readonly<
  Record<ManifoldTessellationQuality, Readonly<{ divisor: number; angularTolerance: number }>>
> = {
  low: { divisor: 500, angularTolerance: 30 },
  medium: { divisor: 2000, angularTolerance: 20 },
  high: { divisor: 8000, angularTolerance: 12 },
  'extra-high': { divisor: 32_000, angularTolerance: 6 },
};

const presetLinearRange = { min: 0.001, max: 50 } as const;

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Resolve a request into Manifold circular-detail settings. Explicit settings win whole and never read the
 * model's size; a preset reads the bounding-box diagonal.
 *
 * @param tessellation - The preset or explicit settings.
 * @param diagonal - Bounding-box diagonal of the model in millimetres; `NaN` when it has no extent.
 * @returns The settings and the requested form.
 * @public
 */
export const resolveManifoldTessellation = (
  tessellation: ManifoldTessellation,
  diagonal: number,
): ManifoldResolvedTessellation => {
  if (typeof tessellation !== 'string') {
    return {
      requested: 'explicit',
      ...(tessellation.segments === undefined ? {} : { segments: tessellation.segments }),
      linearTolerance: tessellation.linearTolerance ?? manifoldCircularDefaults.linearTolerance,
      angularTolerance: tessellation.angularTolerance ?? manifoldCircularDefaults.angularTolerance,
    };
  }
  const preset = manifoldTessellationPresets[tessellation];
  if (!Number.isFinite(diagonal) || diagonal <= 0) {
    return {
      requested: tessellation,
      linearTolerance: presetLinearRange.max,
      angularTolerance: preset.angularTolerance,
    };
  }
  const linearTolerance = Math.min(presetLinearRange.max, Math.max(presetLinearRange.min, diagonal / preset.divisor));
  const chordAngle = degrees(2 * Math.acos(1 - Math.min(1, (2 * linearTolerance) / diagonal)));
  return {
    requested: tessellation,
    linearTolerance,
    angularTolerance: Math.min(preset.angularTolerance, chordAngle),
  };
};

/**
 * The cost report for a delivered mesh.
 *
 * @param options - Requested settings, counts and elapsed milliseconds.
 * @returns Counts, elapsed milliseconds and the resolution, as hosts show them.
 * @public
 */
export const createManifoldTessellationReport = (options: {
  requested: ManifoldResolvedTessellation;
  triangles: number;
  vertices: number;
  elapsed: number;
}): TessellationReport => ({
  triangles: options.triangles,
  vertices: options.vertices,
  elapsed: options.elapsed,
  requested: options.requested.requested,
  linearTolerance: options.requested.linearTolerance,
  angularTolerance: options.requested.angularTolerance,
});
