/**
 * JSCAD tessellation: a quality preset or an explicit default segment count, never both.
 *
 * The preset names, triangle budgets, downgrade rule and issue codes mirror `@taucad/occt-core`'s
 * `occt-schemas.ts` and `occt-tessellation.ts`, so every kernel uses the same words for the same cost. JSCAD
 * primitives take a fixed `segments` count (32 by default) whatever their size, so a preset is a default segment
 * count: 16, 32, 64 or 128. It applies to every circular primitive that does not pass its own `segments`; `medium`
 * is JSCAD's own default, so a `medium` model is the model as written.
 *
 * @public
 */

import { z } from 'zod';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

/** Tessellation quality presets, coarsest first. @public */
export const jscadTessellationQualities = ['low', 'medium', 'high', 'extra-high'] as const;

/** A tessellation quality preset name. @public */
export type JscadTessellationQuality = (typeof jscadTessellationQualities)[number];

const tessellationFormsMessage =
  "tessellation is a preset ('low' | 'medium' | 'high' | 'extra-high') or an explicit object { segments }, never both";

/**
 * An explicit default segment count for circular primitives that do not pass their own. No other key is accepted,
 * so a preset cannot ride along.
 * @public
 */
export const jscadExplicitTessellationSchema = z
  .strictObject(
    {
      segments: z
        .number()
        .int()
        .min(4)
        .meta({ examples: [64] })
        .describe('Segments in every circular primitive that does not pass its own'),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `explicit tessellation accepts only segments; ${tessellationFormsMessage}`
          : undefined,
    },
  )
  .meta({ title: 'Explicit' })
  .describe('Explicit default segment count');

/**
 * A tessellation preset or an explicit default segment count, never both. JSON Schema `oneOf`.
 * @public
 */
export const jscadTessellationSchema = z.xor(
  [
    z
      .enum(jscadTessellationQualities, {
        error: () => `expected a preset 'low' | 'medium' | 'high' | 'extra-high'; ${tessellationFormsMessage}`,
      })
      .meta({ title: 'Preset' })
      .describe('Quality preset: 16, 32, 64 or 128 segments per circular primitive'),
    jscadExplicitTessellationSchema,
  ],
  { error: () => tessellationFormsMessage },
);

/** A tessellation preset name or an explicit default segment count. @public */
export type JscadTessellation = z.output<typeof jscadTessellationSchema>;

/** Default segment count per preset. @public */
export const jscadTessellationPresets: Readonly<Record<JscadTessellationQuality, number>> = {
  low: 16,
  medium: 32,
  high: 64,
  'extra-high': 128,
};

/** JSCAD's own default segment count, which a model evaluates at. @public */
export const jscadDefaultSegments = 32;

/** Triangle budgets: over the preview budget a render coarsens, over the export budget an export refuses. @public */
export const jscadTriangleBudgets = { preview: 2_000_000, export: 20_000_000 } as const;

/** How many coarser steps a preview takes before delivering what it has. @public */
export const jscadMaxTessellationDowngrades = 3;

/** A default segment count with the form that was requested. @public */
export type JscadResolvedTessellation = Readonly<{
  requested: JscadTessellationQuality | 'explicit';
  segments: number;
}>;

/**
 * Resolve a request into a default segment count.
 *
 * @param tessellation - The preset or explicit count.
 * @returns The count and the requested form.
 * @public
 */
export const resolveJscadTessellation = (tessellation: JscadTessellation): JscadResolvedTessellation =>
  typeof tessellation === 'string'
    ? { requested: tessellation, segments: jscadTessellationPresets[tessellation] }
    : { requested: 'explicit', segments: tessellation.segments };

/**
 * One step coarser: half the segments, never under four.
 *
 * @param segments - The count that produced too many triangles.
 * @returns The next coarser count.
 * @public
 */
export const coarsenJscadTessellation = (segments: number): number => Math.max(4, Math.round(segments / 2));

/** The outcome of meshing within a budget. @public */
export type JscadBudgetedMesh<T> = Readonly<{ result: T; segments: number; downgraded: number }>;

/**
 * Mesh, then coarsen one step at a time while the result exceeds the budget, at most
 * {@link jscadMaxTessellationDowngrades} times; the last result is delivered even if still over budget.
 *
 * @param options - Starting count, the triangle budget and the meshing to run.
 * @returns The delivered result, its count and the number of coarser steps.
 * @public
 */
export const meshWithinJscadBudget = async <T extends Readonly<{ triangles: number }>>(options: {
  segments: number;
  budget: number;
  mesh: (segments: number) => Promise<T>;
}): Promise<JscadBudgetedMesh<T>> => {
  let { segments } = options;
  let result = await options.mesh(segments);
  let downgraded = 0;
  while (result.triangles > options.budget && downgraded < jscadMaxTessellationDowngrades && segments > 4) {
    segments = coarsenJscadTessellation(segments);
    downgraded++;
    // oxlint-disable-next-line no-await-in-loop -- each step depends on the previous count.
    result = await options.mesh(segments);
  }
  return { result, segments, downgraded };
};

/**
 * The cost report for a delivered mesh. The effective segment count travels in a downgrade warning's details.
 *
 * @param options - Requested form, steps taken, counts and elapsed milliseconds.
 * @returns Counts, elapsed milliseconds and the effective resolution, as hosts show them.
 * @public
 */
export const createJscadTessellationReport = (options: {
  requested: JscadResolvedTessellation;
  downgraded: number;
  triangles: number;
  vertices: number;
  elapsed: number;
}): TessellationReport => ({
  triangles: options.triangles,
  vertices: options.vertices,
  elapsed: options.elapsed,
  requested: options.requested.requested,
  downgraded: options.downgraded,
});

const requestedLabel = (requested: JscadResolvedTessellation): string =>
  requested.requested === 'explicit' ? 'explicit tessellation' : `preset '${requested.requested}'`;

/**
 * The warning a preview reports after coarsening an over-budget mesh.
 *
 * @param options - Requested and effective counts, steps taken, triangles and budget.
 * @returns A `TESSELLATION_DOWNGRADED` warning.
 * @public
 */
export const createJscadTessellationDowngradedIssue = (options: {
  requested: JscadResolvedTessellation;
  segments: number;
  downgraded: number;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { requested, segments, downgraded, triangles, budget } = options;
  return {
    message:
      `Tessellation exceeded the ${String(budget)}-triangle budget at ${requestedLabel(requested)} ` +
      `{ segments: ${String(requested.segments)} }; coarsened ${String(downgraded)} step${downgraded === 1 ? '' : 's'} ` +
      `to { segments: ${String(segments)} } (${String(triangles)} triangles). ` +
      'Request a coarser preset or explicit segments to choose the mesh yourself.',
    code: 'TESSELLATION_DOWNGRADED',
    type: 'kernel',
    severity: 'warning',
    details: {
      producer: 'jscad',
      requested: { form: requested.requested, segments: requested.segments },
      effective: { segments },
      downgraded,
      triangles,
      budget,
    },
  };
};

/**
 * The error an export reports instead of coarsening a mesh over its budget.
 *
 * @param options - Requested count, triangles produced and budget.
 * @returns A `RESOURCE_LIMIT` error naming a suggested coarser request.
 * @public
 */
export const createJscadTessellationBudgetExceededIssue = (options: {
  requested: JscadResolvedTessellation;
  triangles: number;
  budget: number;
}): KernelIssue => {
  const { requested, triangles, budget } = options;
  const suggested = coarsenJscadTessellation(requested.segments);
  return {
    message:
      `Export tessellation produced ${String(triangles)} triangles, over the ${String(budget)}-triangle export budget, ` +
      `at ${requestedLabel(requested)} { segments: ${String(requested.segments)} }. Exports are never coarsened ` +
      `silently; request a coarser preset or tessellation { segments: ${String(suggested)} }.`,
    code: 'RESOURCE_LIMIT',
    type: 'kernel',
    severity: 'error',
    details: {
      producer: 'jscad',
      requested: { form: requested.requested, segments: requested.segments },
      suggested: { segments: suggested },
      triangles,
      budget,
    },
  };
};

const circularPrimitives = [
  'arc',
  'circle',
  'ellipse',
  'cylinder',
  'cylinderElliptic',
  'sphere',
  'ellipsoid',
  'roundedRectangle',
  'roundedCuboid',
  'roundedCylinder',
] as const;

/**
 * Wrap the circular primitives so a call without its own `segments` (or, for `torus`, `innerSegments` and
 * `outerSegments`) uses the active default count. With no active count the originals run unchanged.
 *
 * @param primitives - `@jscad/modeling`'s `primitives` namespace.
 * @param activeSegments - Reads the default count for the current run, or `undefined` for JSCAD's own.
 * @returns A namespace with the same members.
 * @public
 */
export const withDefaultSegments = <Primitives extends Readonly<Record<string, unknown>>>(
  primitives: Primitives,
  activeSegments: () => number | undefined,
): Primitives => {
  const wrapped: Record<string, unknown> = { ...primitives };
  const wrap = (name: string, keys: readonly string[]): void => {
    const original = primitives[name];
    if (typeof original !== 'function') {
      return;
    }
    wrapped[name] = (options?: unknown, ...rest: unknown[]): unknown => {
      const segments = activeSegments();
      if (segments === undefined || (options !== undefined && (typeof options !== 'object' || options === null))) {
        const unchanged: unknown = Reflect.apply(original, undefined, [options, ...rest]);
        return unchanged;
      }
      const given: Record<string, unknown> = { ...(options as Record<string, unknown> | undefined) };
      for (const key of keys) {
        given[key] ??= segments;
      }
      const built: unknown = Reflect.apply(original, undefined, [given, ...rest]);
      return built;
    };
  };
  for (const name of circularPrimitives) {
    wrap(name, ['segments']);
  }
  wrap('torus', ['innerSegments', 'outerSegments']);
  return wrapped as Primitives;
};
