/**
 * Manifold tessellation: a quality preset or Manifold's explicit circular-detail settings, never both.
 *
 * The preset table, triangle budgets, downgrade step and issue codes mirror `@taucad/occt-core`'s
 * `occt-schemas.ts` and `occt-tessellation.ts`, so every kernel uses the same words for the same cost.
 * Manifold has no chordal deviation of its own: it splits each circle into
 * `min(360 / angle, 2πr / edgeLength)` segments. A preset therefore sets the edge length to the size-derived
 * linear value and the angle to the smaller of the preset angle and the angle whose chord deviates by that
 * linear value on a circle as large as the model, so a preset is scale-invariant and fine where OCCT's would be.
 *
 * @public
 */

import { z } from 'zod';
import { quantity, quantityKinds } from '@taucad/runtime/kernel';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

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

/** Triangle budgets: over the preview budget a render coarsens, over the export budget an export refuses. @public */
export const manifoldTriangleBudgets = { preview: 2_000_000, export: 20_000_000 } as const;

/** How many coarser steps a preview takes before delivering what it has. @public */
export const manifoldMaxTessellationDowngrades = 3;

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
 * One step coarser: twice the edge length, four degrees more angle, half the fixed segments.
 *
 * @param detail - The settings that produced too many triangles.
 * @returns The next coarser settings.
 * @public
 */
export const coarsenManifoldTessellation = (detail: ManifoldCircularDetail): ManifoldCircularDetail => ({
  ...(detail.segments === undefined ? {} : { segments: Math.max(3, Math.round(detail.segments / 2)) }),
  linearTolerance: detail.linearTolerance * 2,
  angularTolerance: detail.angularTolerance + 4,
});

/** The outcome of meshing within a budget. @public */
export type ManifoldBudgetedMesh<T> = Readonly<{ result: T; effective: ManifoldCircularDetail; downgraded: number }>;

/**
 * Mesh, then coarsen one step at a time while the result exceeds the budget, at most
 * {@link manifoldMaxTessellationDowngrades} times; the last result is delivered even if still over budget.
 *
 * @param options - Starting settings, the triangle budget and the meshing to run.
 * @returns The delivered result, its settings and the number of coarser steps.
 * @public
 */
export const meshWithinManifoldBudget = async <T extends Readonly<{ triangles: number }>>(options: {
  detail: ManifoldCircularDetail;
  budget: number;
  mesh: (detail: ManifoldCircularDetail) => Promise<T>;
}): Promise<ManifoldBudgetedMesh<T>> => {
  let effective = options.detail;
  let result = await options.mesh(effective);
  let downgraded = 0;
  while (result.triangles > options.budget && downgraded < manifoldMaxTessellationDowngrades) {
    effective = coarsenManifoldTessellation(effective);
    downgraded++;
    // oxlint-disable-next-line no-await-in-loop -- each step depends on the previous count.
    result = await options.mesh(effective);
  }
  return { result, effective, downgraded };
};

/**
 * The cost report for a delivered mesh.
 *
 * @param options - Requested form, effective settings, steps taken, counts and elapsed milliseconds.
 * @returns Counts, elapsed milliseconds and the effective resolution, as hosts show them.
 * @public
 */
export const createManifoldTessellationReport = (options: {
  requested: ManifoldResolvedTessellation;
  effective: ManifoldCircularDetail;
  downgraded: number;
  triangles: number;
  vertices: number;
  elapsed: number;
}): TessellationReport => ({
  triangles: options.triangles,
  vertices: options.vertices,
  elapsed: options.elapsed,
  requested: options.requested.requested,
  linearTolerance: options.effective.linearTolerance,
  angularTolerance: options.effective.angularTolerance,
  downgraded: options.downgraded,
});

const detailOf = (detail: ManifoldCircularDetail): Record<string, number> => ({
  ...(detail.segments === undefined ? {} : { segments: detail.segments }),
  linearTolerance: detail.linearTolerance,
  angularTolerance: detail.angularTolerance,
});

const formatDetail = (detail: ManifoldCircularDetail): string =>
  `{ ${Object.entries(detailOf(detail))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ')} }`;

const requestedLabel = (requested: ManifoldResolvedTessellation): string =>
  requested.requested === 'explicit' ? 'explicit settings' : `preset '${requested.requested}'`;

/**
 * The warning a preview reports after coarsening an over-budget mesh.
 *
 * @param options - Requested and effective settings, steps taken, triangles and budget.
 * @returns A `TESSELLATION_DOWNGRADED` warning.
 * @public
 */
export const createManifoldTessellationDowngradedIssue = (options: {
  requested: ManifoldResolvedTessellation;
  effective: ManifoldCircularDetail;
  downgraded: number;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { requested, effective, downgraded, triangles, budget } = options;
  return {
    message:
      `Tessellation exceeded the ${String(budget)}-triangle budget at ${requestedLabel(requested)} ${formatDetail(requested)}; ` +
      `coarsened ${String(downgraded)} step${downgraded === 1 ? '' : 's'} to ${formatDetail(effective)} ` +
      `(${String(triangles)} triangles). Request a coarser preset or explicit settings to choose the mesh yourself.`,
    code: 'TESSELLATION_DOWNGRADED',
    type: 'kernel',
    severity: 'warning',
    details: {
      producer: 'manifold',
      requested: { form: requested.requested, ...detailOf(requested) },
      effective: detailOf(effective),
      downgraded,
      triangles,
      budget,
    },
  };
};

/**
 * The error an export reports instead of coarsening a mesh over its budget.
 *
 * @param options - Requested settings, triangles produced and budget.
 * @returns A `RESOURCE_LIMIT` error naming a suggested coarser request.
 * @public
 */
export const createManifoldTessellationBudgetExceededIssue = (options: {
  requested: ManifoldResolvedTessellation;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { requested, triangles, budget } = options;
  const suggested = coarsenManifoldTessellation(requested);
  return {
    message:
      `Export tessellation produced ${String(triangles)} triangles, over the ${String(budget)}-triangle export budget, ` +
      `at ${requestedLabel(requested)} ${formatDetail(requested)}. Exports are never coarsened silently; ` +
      `request a coarser preset or tessellation ${formatDetail(suggested)}.`,
    code: 'RESOURCE_LIMIT',
    type: 'kernel',
    severity: 'error',
    details: {
      producer: 'manifold',
      requested: { form: requested.requested, ...detailOf(requested) },
      suggested: detailOf(suggested),
      triangles,
      budget,
    },
  };
};
