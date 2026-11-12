import { z } from 'zod';

/**
 * What a person makes, from setup step 1. Several may be chosen.
 *
 * @public
 */
export const goalIds = ['printing', 'mechanical', 'electronics', 'product', 'art', 'exploring'] as const;

/**
 * One of {@link goalIds}.
 *
 * @public
 */
export type GoalId = (typeof goalIds)[number];

/**
 * The tool a person used last, from setup step 2. It suggests a mouse preset and a gizmo style (Finding 7).
 *
 * @public
 */
export const toolIds = [
  'new',
  'tinkercad',
  'slicer',
  'openscad',
  'fusion',
  'solidworks',
  'onshape',
  'blender',
  'nx-creo',
  'game-engine',
  'kicad',
  'other',
] as const;

/**
 * One of {@link toolIds}.
 *
 * @public
 */
export type ToolId = (typeof toolIds)[number];

/**
 * The languages a person reads, from setup step 2. `none` is "I'd rather not write code".
 *
 * @public
 */
export const languageIds = ['typescript', 'python', 'openscad', 'csharp', 'none'] as const;

/**
 * One of {@link languageIds}.
 *
 * @public
 */
export type LanguageId = (typeof languageIds)[number];

/**
 * The `person-profile` section: what the person told setup about themselves. Absent `tool` means not answered.
 *
 * @public
 */
export const personProfileSchema = z.strictObject({
  version: z.literal(1),
  goals: z.array(z.enum(goalIds)).max(goalIds.length),
  tool: z.enum(toolIds).optional(),
  languages: z.array(z.enum(languageIds)).max(languageIds.length),
});

/**
 * A parsed `person-profile` section.
 *
 * @public
 */
export type PersonProfile = z.infer<typeof personProfileSchema>;

/**
 * The profile of a person who has answered nothing.
 *
 * @public
 */
export const emptyPersonProfile: PersonProfile = Object.freeze({ version: 1, goals: [], languages: [] });
