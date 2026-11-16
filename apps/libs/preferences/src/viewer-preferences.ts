import { z } from 'zod';
import { lengthUnits } from '@taucad/workbench';
import type { ViewFieldValues } from '@taucad/workbench';

/**
 * The six mouse presets: which button and modifier orbit, pan and zoom.
 *
 * @public
 */
export const mousePresetIds = ['tau', 'right-orbit', 'middle-ctrl', 'middle-shift', 'shift-middle', 'alt'] as const;

/**
 * One of {@link mousePresetIds}.
 *
 * @public
 */
export type MousePresetId = (typeof mousePresetIds)[number];

/**
 * The gizmo styles. "None" is not a style: it is `viewDefaults['display.gizmo'] = false`.
 *
 * @public
 */
export const gizmoStyleIds = ['cube', 'classic-cube', 'axis-balls', 'axes'] as const;

/**
 * One of {@link gizmoStyleIds}.
 *
 * @public
 */
export type GizmoStyleId = (typeof gizmoStyleIds)[number];

/**
 * The person's own defaults for the inheritable view leaves Settings offers. The up axis is a model convention, chosen
 * per model rather than per person, so it has no personal default; surfaces and edges are set per view only.
 *
 * @public
 */
export type PersonalViewDefaults = Partial<Omit<ViewFieldValues, 'upDirection' | 'display.surfaces' | 'display.lines'>>;

/** Leaves an earlier build stored that no longer have a personal default; dropped on read so the rest survives. */
const retiredViewDefaultKeys: ReadonlySet<string> = new Set([
  'display.surfaces',
  'display.lines',
  'display.postProcessing',
]);

const dropRetiredViewDefaults = (value: unknown): unknown =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !retiredViewDefaultKeys.has(key)))
    : value;

const viewDefaultsShape = z.strictObject({
  fieldOfView: z.number().min(0).max(90).optional(),
  'display.gizmo': z.boolean().optional(),
  'display.grid': z.boolean().optional(),
  'display.axes': z.boolean().optional(),
  'display.matcap': z.boolean().optional(),
  'grid.unit': z.enum(lengthUnits).optional(),
}) satisfies z.ZodType<PersonalViewDefaults>;

const viewDefaultsSchema = z.preprocess(dropRetiredViewDefaults, viewDefaultsShape);

/**
 * The `viewer-preferences` section. Every field is absent until the person sets it: an absent `preset` or
 * `gizmo.style` follows the suggestion for the tool answer, which is never stored.
 *
 * @public
 */
export const viewerPreferencesSchema = z.strictObject({
  version: z.literal(1),
  controls: z.strictObject({
    /** Absent: follow the tool answer. */
    preset: z.enum(mousePresetIds).optional(),
    /** Absent: on. */
    zoomToCursor: z.boolean().optional(),
    /** Absent: off. */
    orbitAboutCursor: z.boolean().optional(),
    /** Absent: off. */
    invertZoom: z.boolean().optional(),
  }),
  gizmo: z.strictObject({
    /** Absent: follow the tool answer. */
    style: z.enum(gizmoStyleIds).optional(),
  }),
  viewDefaults: viewDefaultsSchema,
});

/**
 * A parsed `viewer-preferences` section.
 *
 * @public
 */
export type ViewerPreferences = z.infer<typeof viewerPreferencesSchema>;

/**
 * Viewer preferences with nothing chosen.
 *
 * @public
 */
export const emptyViewerPreferences: ViewerPreferences = Object.freeze({
  version: 1,
  controls: {},
  gizmo: {},
  viewDefaults: {},
});
