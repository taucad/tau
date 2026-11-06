/**
 * JSCAD tessellation: a quality preset or an explicit default segment count, never both.
 *
 * The preset names mirror `@taucad/occt-core`'s `occt-schemas.ts`, so every kernel uses the same words for the same
 * cost. There is no triangle budget: a preview or export meshes once at the requested count. JSCAD
 * primitives take a fixed `segments` count (32 by default) whatever their size, so a preset is a default segment
 * count: 16, 32, 64 or 128. It applies to every circular primitive that does not pass its own `segments`; `medium`
 * is JSCAD's own default, so a `medium` model is the model as written.
 *
 * @public
 */

import { z } from 'zod';
import type { TessellationReport } from '@taucad/runtime/types';

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
 * The cost report for a delivered mesh.
 *
 * @param options - Requested form, counts and elapsed milliseconds.
 * @returns Counts, elapsed milliseconds and the requested form, as hosts show them.
 * @public
 */
export const createJscadTessellationReport = (options: {
  requested: JscadResolvedTessellation;
  triangles: number;
  vertices: number;
  elapsed: number;
}): TessellationReport => ({
  triangles: options.triangles,
  vertices: options.vertices,
  elapsed: options.elapsed,
  requested: options.requested.requested,
});

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
