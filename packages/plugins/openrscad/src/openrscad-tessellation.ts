/**
 * OpenSCAD tessellation: a quality preset or explicit `$fn`, `$fs` and `$fa`, never both.
 *
 * The preset table, triangle budgets, downgrade step and issue codes mirror `@taucad/occt-core`'s
 * `occt-schemas.ts` and `occt-tessellation.ts`, so every kernel uses the same words for the same cost.
 * OpenSCAD splits a circle into `max(min(360 / $fa, 2πr / $fs), 5)` fragments unless `$fn` is set. A preset
 * therefore sets `$fs` to the size-derived linear value and `$fa` to the smaller of the preset angle and the
 * angle whose chord deviates by that linear value on a circle as large as the model, so a preset is
 * scale-invariant and as fine as OCCT's would be. A script's own `$fn` always wins over `$fa` and `$fs`.
 *
 * @public
 */

import { z } from 'zod';
import { quantity, quantityKinds } from '@taucad/runtime/kernel';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

/** Tessellation quality presets, coarsest first. @public */
export const openrscadTessellationQualities = ['low', 'medium', 'high', 'extra-high'] as const;

/** A tessellation quality preset name. @public */
export type OpenrscadTessellationQuality = (typeof openrscadTessellationQualities)[number];

const tessellationFormsMessage =
  "tessellation is a preset ('low' | 'medium' | 'high' | 'extra-high') or an explicit object " +
  '{ segments?, linearTolerance?, angularTolerance? } with at least one field, never both';

const length = () => quantity({ unit: 'mm', quantityKind: quantityKinds.length, space: 'linear' }).positive();
const angle = () => quantity({ unit: 'deg', quantityKind: quantityKinds.planeAngle, space: 'linear' }).positive();

/**
 * Explicit OpenSCAD resolution: `$fn` as `segments`, `$fs` as `linearTolerance` in millimetres and `$fa` as
 * `angularTolerance` in degrees. A field left out keeps the script's own value. At least one field is required
 * and no other key is accepted, so a preset cannot ride along. `minimumSize` and `minimumAngle`, the names
 * before the shared vocabulary, are still read for `linearTolerance` and `angularTolerance`.
 * @public
 */
export const openrscadExplicitTessellationSchema = z
  .strictObject(
    {
      segments: z
        .number()
        .int()
        .min(0)
        .optional()
        .meta({ examples: [64] })
        .describe('Fragments per circle ($fn); 0 lets the linear and angular tolerances decide'),
      linearTolerance: length()
        .optional()
        .meta({ examples: [2] })
        .describe('Minimum fragment size ($fs, distance)'),
      angularTolerance: angle()
        .optional()
        .meta({ examples: [12] })
        .describe('Minimum fragment angle ($fa, degrees)'),
      minimumSize: length().optional().meta({ deprecated: true }).describe('Deprecated name of linearTolerance'),
      minimumAngle: angle().optional().meta({ deprecated: true }).describe('Deprecated name of angularTolerance'),
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
      value.segments !== undefined ||
      value.linearTolerance !== undefined ||
      value.angularTolerance !== undefined ||
      value.minimumSize !== undefined ||
      value.minimumAngle !== undefined,
    {
      message: `explicit tessellation needs segments, linearTolerance or angularTolerance; ${tessellationFormsMessage}`,
    },
  )
  .refine(
    (value) =>
      !(value.linearTolerance !== undefined && value.minimumSize !== undefined) &&
      !(value.angularTolerance !== undefined && value.minimumAngle !== undefined),
    { message: 'give linearTolerance or its old name minimumSize, angularTolerance or minimumAngle, not both' },
  )
  .meta({ title: 'Explicit', minProperties: 1 })
  .describe('Explicit $fn, $fs and $fa in segments, millimetres and degrees');

/**
 * A tessellation preset or explicit `$fn`/`$fs`/`$fa`, never both. JSON Schema `oneOf`.
 * @public
 */
export const openrscadTessellationSchema = z.xor(
  [
    z
      .enum(openrscadTessellationQualities, {
        error: () => `expected a preset 'low' | 'medium' | 'high' | 'extra-high'; ${tessellationFormsMessage}`,
      })
      .meta({ title: 'Preset' })
      .describe('Quality preset derived from the model bounding-box diagonal'),
    openrscadExplicitTessellationSchema,
  ],
  { error: () => tessellationFormsMessage },
);

/** A tessellation preset name or explicit `$fn`/`$fs`/`$fa`. @public */
export type OpenrscadTessellation = z.output<typeof openrscadTessellationSchema>;

/** The special variables set for a run; a field left out keeps the script's own value. @public */
export type OpenrscadResolution = Readonly<{
  /** `$fn`. */
  segments?: number;
  /** `$fs`, in millimetres. */
  linearTolerance?: number;
  /** `$fa`, in degrees. */
  angularTolerance?: number;
}>;

/** A resolution with the form that was requested. @public */
export type OpenrscadResolvedTessellation = OpenrscadResolution &
  Readonly<{ requested: OpenrscadTessellationQuality | 'explicit' }>;

/** Bounding-box diagonal divisor and angle in degrees per preset (mirrors `occtTessellationPresets`). @public */
export const openrscadTessellationPresets: Readonly<
  Record<OpenrscadTessellationQuality, Readonly<{ divisor: number; angularTolerance: number }>>
> = {
  low: { divisor: 500, angularTolerance: 30 },
  medium: { divisor: 2000, angularTolerance: 20 },
  high: { divisor: 8000, angularTolerance: 12 },
  'extra-high': { divisor: 32_000, angularTolerance: 6 },
};

const presetLinearRange = { min: 0.001, max: 50 } as const;

/** Triangle budgets: over the preview budget a render coarsens, over the export budget an export refuses. @public */
export const openrscadTriangleBudgets = { preview: 2_000_000, export: 20_000_000 } as const;

/** How many coarser steps a preview takes before delivering what it has. @public */
export const openrscadMaxTessellationDowngrades = 3;

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Resolve a request into `$fn`/`$fs`/`$fa`. Explicit values win whole and never read the model's size; a preset
 * reads the bounding-box diagonal and leaves `$fn` to the script.
 *
 * @param tessellation - The preset or explicit values.
 * @param diagonal - Bounding-box diagonal of the model in millimetres; `NaN` when it has no extent.
 * @returns The special variables to set and the requested form.
 * @public
 */
export const resolveOpenrscadTessellation = (
  tessellation: OpenrscadTessellation,
  diagonal: number,
): OpenrscadResolvedTessellation => {
  if (typeof tessellation !== 'string') {
    const linearTolerance = tessellation.linearTolerance ?? tessellation.minimumSize;
    const angularTolerance = tessellation.angularTolerance ?? tessellation.minimumAngle;
    return {
      requested: 'explicit',
      ...(tessellation.segments === undefined ? {} : { segments: tessellation.segments }),
      ...(linearTolerance === undefined ? {} : { linearTolerance }),
      ...(angularTolerance === undefined ? {} : { angularTolerance }),
    };
  }
  const preset = openrscadTessellationPresets[tessellation];
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

const scriptAssignmentPattern = /^[\t ]*\$(fn|fa|fs)[\t ]*=/gm;

/**
 * The special variables a script assigns itself on a line of their own, in any of its source files.
 *
 * @param sources - The entry source and every included source.
 * @returns The assigned names among `$fn`, `$fa` and `$fs`.
 * @public
 */
export const scriptOwnedResolution = (sources: Iterable<string>): ReadonlySet<'$fn' | '$fa' | '$fs'> => {
  const owned = new Set<'$fn' | '$fa' | '$fs'>();
  for (const source of sources) {
    for (const match of source.matchAll(scriptAssignmentPattern)) {
      owned.add(`$${match[1] as 'fn' | 'fa' | 'fs'}`);
    }
  }
  return owned;
};

/**
 * Resolve a lane's request. A request the caller gave wins whole (policy P3). With none, the lane's default preset
 * fills only what the script leaves open: a script that sets `$fn` keeps its own resolution, and one that sets
 * `$fa` or `$fs` keeps that value (policy P6, a model's declaration over the kernel default).
 *
 * @param options - The caller's request, the lane's default preset, the model's diagonal and the script's own variables.
 * @returns The special variables to set and the requested form.
 * @public
 */
export const resolveOpenrscadRequest = (options: {
  tessellation: OpenrscadTessellation | undefined;
  laneDefault: OpenrscadTessellationQuality;
  diagonal: number;
  owned: ReadonlySet<'$fn' | '$fa' | '$fs'>;
}): OpenrscadResolvedTessellation => {
  const { tessellation, laneDefault, diagonal, owned } = options;
  if (tessellation !== undefined) {
    return resolveOpenrscadTessellation(tessellation, diagonal);
  }
  if (owned.has('$fn')) {
    return { requested: laneDefault };
  }
  const { linearTolerance, angularTolerance } = resolveOpenrscadTessellation(laneDefault, diagonal);
  return {
    requested: laneDefault,
    ...(owned.has('$fs') ? {} : { linearTolerance }),
    ...(owned.has('$fa') ? {} : { angularTolerance }),
  };
};

/**
 * One step coarser: twice `$fs`, four degrees more `$fa`, half `$fn`. Fields the script owns stay unset.
 *
 * @param resolution - The values that produced too many triangles.
 * @returns The next coarser values.
 * @public
 */
export const coarsenOpenrscadTessellation = (resolution: OpenrscadResolution): OpenrscadResolution => ({
  ...(resolution.segments === undefined
    ? {}
    : { segments: resolution.segments === 0 ? 0 : Math.max(3, Math.round(resolution.segments / 2)) }),
  ...(resolution.linearTolerance === undefined ? {} : { linearTolerance: resolution.linearTolerance * 2 }),
  ...(resolution.angularTolerance === undefined ? {} : { angularTolerance: resolution.angularTolerance + 4 }),
});

/** The outcome of meshing within a budget. @public */
export type OpenrscadBudgetedMesh<T> = Readonly<{ result: T; effective: OpenrscadResolution; downgraded: number }>;

/**
 * Mesh, then coarsen one step at a time while the result exceeds the budget, at most
 * {@link openrscadMaxTessellationDowngrades} times; the last result is delivered even if still over budget.
 *
 * @param options - Starting values, the triangle budget and the meshing to run.
 * @returns The delivered result, its values and the number of coarser steps.
 * @public
 */
export const meshWithinOpenrscadBudget = async <T extends Readonly<{ triangles: number }>>(options: {
  resolution: OpenrscadResolution;
  budget: number;
  mesh: (resolution: OpenrscadResolution) => Promise<T>;
}): Promise<OpenrscadBudgetedMesh<T>> => {
  let effective = options.resolution;
  let result = await options.mesh(effective);
  let downgraded = 0;
  while (result.triangles > options.budget && downgraded < openrscadMaxTessellationDowngrades) {
    const coarser = coarsenOpenrscadTessellation(effective);
    if (JSON.stringify(coarser) === JSON.stringify(effective)) {
      // Every value is the script's own (or `$fn = 0` alone): there is nothing this side can coarsen.
      break;
    }
    effective = coarser;
    downgraded++;
    // oxlint-disable-next-line no-await-in-loop -- each step depends on the previous count.
    result = await options.mesh(effective);
  }
  return { result, effective, downgraded };
};

/**
 * The cost report for a delivered mesh. Tolerances the script kept for itself are not reported.
 *
 * @param options - Requested form, effective values, steps taken, counts and elapsed milliseconds.
 * @returns Counts, elapsed milliseconds and the effective resolution, as hosts show them.
 * @public
 */
export const createOpenrscadTessellationReport = (options: {
  requested: OpenrscadResolvedTessellation;
  effective: OpenrscadResolution;
  downgraded: number;
  triangles: number;
  vertices: number;
  elapsed: number;
}): TessellationReport => ({
  triangles: options.triangles,
  vertices: options.vertices,
  elapsed: options.elapsed,
  requested: options.requested.requested,
  ...(options.effective.linearTolerance === undefined ? {} : { linearTolerance: options.effective.linearTolerance }),
  ...(options.effective.angularTolerance === undefined ? {} : { angularTolerance: options.effective.angularTolerance }),
  downgraded: options.downgraded,
});

const valuesOf = (resolution: OpenrscadResolution): Record<string, number> => ({
  ...(resolution.segments === undefined ? {} : { segments: resolution.segments }),
  ...(resolution.linearTolerance === undefined ? {} : { linearTolerance: resolution.linearTolerance }),
  ...(resolution.angularTolerance === undefined ? {} : { angularTolerance: resolution.angularTolerance }),
});

const formatValues = (resolution: OpenrscadResolution): string =>
  `{ ${Object.entries(valuesOf(resolution))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ')} }`;

const requestedLabel = (requested: OpenrscadResolvedTessellation): string =>
  requested.requested === 'explicit' ? 'explicit values' : `preset '${requested.requested}'`;

/**
 * The warning a preview reports after coarsening an over-budget mesh.
 *
 * @param options - Requested and effective values, steps taken, triangles and budget.
 * @returns A `TESSELLATION_DOWNGRADED` warning.
 * @public
 */
export const createOpenrscadTessellationDowngradedIssue = (options: {
  requested: OpenrscadResolvedTessellation;
  effective: OpenrscadResolution;
  downgraded: number;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { requested, effective, downgraded, triangles, budget } = options;
  return {
    message:
      `Tessellation exceeded the ${String(budget)}-triangle budget at ${requestedLabel(requested)} ${formatValues(requested)}; ` +
      `coarsened ${String(downgraded)} step${downgraded === 1 ? '' : 's'} to ${formatValues(effective)} ` +
      `(${String(triangles)} triangles). Request a coarser preset or explicit values to choose the mesh yourself.`,
    code: 'TESSELLATION_DOWNGRADED',
    type: 'kernel',
    severity: 'warning',
    details: {
      producer: 'openrscad',
      requested: { form: requested.requested, ...valuesOf(requested) },
      effective: valuesOf(effective),
      downgraded,
      triangles,
      budget,
    },
  };
};

/**
 * The error an export reports instead of coarsening a mesh over its budget.
 *
 * @param options - Requested values, triangles produced and budget.
 * @returns A `RESOURCE_LIMIT` error naming a suggested coarser request.
 * @public
 */
export const createOpenrscadTessellationBudgetExceededIssue = (options: {
  requested: OpenrscadResolvedTessellation;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { requested, triangles, budget } = options;
  const suggested = coarsenOpenrscadTessellation(requested);
  return {
    message:
      `Export tessellation produced ${String(triangles)} triangles, over the ${String(budget)}-triangle export budget, ` +
      `at ${requestedLabel(requested)} ${formatValues(requested)}. Exports are never coarsened silently; ` +
      `request a coarser preset or tessellation ${formatValues(suggested)}.`,
    code: 'RESOURCE_LIMIT',
    type: 'kernel',
    severity: 'error',
    details: {
      producer: 'openrscad',
      requested: { form: requested.requested, ...valuesOf(requested) },
      suggested: valuesOf(suggested),
      triangles,
      budget,
    },
  };
};
