// Abridged, shared by every option: the A2 v12 section cut list, restated provider-safe.
// Source: geospec 96c6a9bf0 apps/ui/app/components/geometry/graphics/section-cuts.ts:30-68 and
// apps/ui/app/constants/editor.constants.ts:205-218 (the v12 cut list landed on geospec; charter I9 is satisfied).
// Difference from the landed schema: discriminants are one-member enums, not `z.literal`, because a literal becomes
// JSON Schema `const`, which Vertex refuses (libs/chat/src/schemas/provider-tool-schema-compat.test.ts:11-14).
// Parsing is identical.
import { z } from 'zod';

/** Metres, in the `tau:root` frame. */
/** @public */
export const vectorSchema = z.tuple([z.number(), z.number(), z.number()]);

/** At most four cuts (A2 D6: eight convex pieces; `maxSectionCuts`, section-cuts.ts:56). */
/** @public */
export const maxSectionCuts = 4;

/**
 * One cut. `plane` removes its +axis side, or the −axis side when `isFlipped`; `offset` is metres along the axis
 * (xy→z, xz→y, yz→x). `revolution` removes the wedge from `start` through `start + sweep` degrees about `axis`,
 * through `origin` (metres); `start` is stored in [0, 360) (the machine wraps; V1 Table 3).
 */
/** @public */
export const sectionCutSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum(['plane']),
    plane: z.enum(['xy', 'xz', 'yz']),
    offset: z.number(),
    isFlipped: z.boolean(),
  }),
  z.strictObject({
    kind: z.enum(['revolution']),
    axis: z.enum(['x', 'y', 'z']),
    origin: vectorSchema,
    /** Degrees, 0 ≤ start < 360. */
    start: z.number().min(0).lt(360),
    /** Degrees, 5 to 355. */
    sweep: z.number().min(5).max(355),
  }),
]);

/** Entry-scoped cuts. `active` holds only with a cut; removing the last cut turns the tool off. */
/** @public */
export const sectionSchema = z.strictObject({
  active: z.boolean(),
  cuts: z.array(sectionCutSchema).max(maxSectionCuts),
});

/** @public */
export type SectionCut = z.output<typeof sectionCutSchema>;
