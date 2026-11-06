/**
 * OpenSCAD tessellation: a quality preset or explicit `$fn`, `$fs` and `$fa`, never both.
 *
 * The preset table mirrors `@taucad/occt-core`'s `occt-schemas.ts`, so every kernel uses the same words for the
 * same cost. There is no triangle budget: a preview or export meshes once at the requested values.
 * OpenSCAD splits a circle into `max(min(360 / $fa, 2πr / $fs), 5)` fragments unless `$fn` is set. A preset
 * therefore sets `$fs` to the size-derived linear value and `$fa` to the smaller of the preset angle and the
 * angle whose chord deviates by that linear value on a circle as large as the model, so a preset is
 * scale-invariant and as fine as OCCT's would be. A script's own `$fn` always wins over `$fa` and `$fs`.
 *
 * @public
 */

import { z } from 'zod';
import { quantity, quantityKinds } from '@taucad/runtime/kernel';
import type { TessellationReport } from '@taucad/runtime/types';

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
 * The cost report for a delivered mesh. Tolerances the script kept for itself are not reported.
 *
 * @param options - Requested values, counts and elapsed milliseconds.
 * @returns Counts, elapsed milliseconds and the resolution, as hosts show them.
 * @public
 */
export const createOpenrscadTessellationReport = (options: {
  requested: OpenrscadResolvedTessellation;
  triangles: number;
  vertices: number;
  elapsed: number;
}): TessellationReport => ({
  triangles: options.triangles,
  vertices: options.vertices,
  elapsed: options.elapsed,
  requested: options.requested.requested,
  ...(options.requested.linearTolerance === undefined ? {} : { linearTolerance: options.requested.linearTolerance }),
  ...(options.requested.angularTolerance === undefined ? {} : { angularTolerance: options.requested.angularTolerance }),
});
