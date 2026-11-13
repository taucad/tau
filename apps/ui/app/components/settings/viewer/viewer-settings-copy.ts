/**
 * Settings → Viewer copy, as data (onboarding blueprint, Finding 6 and Finding 7; ported from the canvas
 * `settings.tsx` and `model.ts`). Row titles and descriptions are the registry's `label` and `description` too, so
 * search and the rows say the same thing.
 */
import type { GizmoStyleId, MousePresetId, PersonalViewDefaults } from '@taucad/preferences';

/** One row's copy. */
export type ViewerRowCopy = Readonly<{ title: string; description: string }>;

/** The inheritable leaves a person's defaults can hold (no up axis). */
export type ViewDefaultLeaf = keyof Required<PersonalViewDefaults>;

/** The rows of the View defaults group. Surfaces, edges and post-processing are view leaves with no row here. */
export type ShownViewDefaultLeaf = Exclude<
  ViewDefaultLeaf,
  'display.surfaces' | 'display.lines' | 'display.postProcessing'
>;

/** What the section answers, under its title. */
export const viewerSectionDescription = 'How 3D views look and respond';

/** The status line when this device would not store a change. Nothing is blocked. */
export const viewerStorageRefused = 'Tau could not save this on this device. It applies until you close Tau';

/** The marker beside the option a tool answer suggests. */
export const suggestedLabel = 'Suggested';

/** Mouse presets, in the order the select lists them. */
export const mousePresetCopy: Readonly<Record<MousePresetId, Readonly<{ name: string; hint: string }>>> = {
  tau: { name: 'Tau default', hint: 'Left-drag orbit, right-drag or middle-drag pan' },
  'right-orbit': { name: 'Right-drag orbit', hint: 'Right-drag orbit, middle-drag pan' },
  'middle-ctrl': { name: 'Middle-drag orbit, Ctrl pan', hint: 'Ctrl + middle-drag pans' },
  'middle-shift': { name: 'Middle-drag orbit, Shift pan', hint: 'Shift + middle-drag pans' },
  'shift-middle': { name: 'Middle-drag pan, Shift orbit', hint: 'Shift + middle-drag orbits' },
  alt: { name: 'Alt-drag navigation', hint: 'Alt with left, middle or right drag' },
};

/** Gizmo styles, in the order the select lists them. "None" is the Show gizmo row. */
export const gizmoStyleCopy: Readonly<Record<GizmoStyleId, Readonly<{ name: string; hint: string }>>> = {
  cube: { name: 'Cube', hint: 'Rounded view cube with labelled faces' },
  'classic-cube': { name: 'Classic cube', hint: 'Sharp view cube' },
  'axis-balls': { name: 'Axis balls', hint: 'One ball per axis direction' },
  axes: { name: 'Axes', hint: 'A small X, Y, Z triad. It shows orientation and takes no click' },
};

/** Navigation and Gizmo rows. */
export const viewerControlCopy = {
  mouseControls: { title: 'Mouse controls', description: 'Which buttons orbit, pan and zoom' },
  zoomToCursor: { title: 'Zoom to cursor', description: 'Zoom toward the pointer instead of the view centre' },
  orbitAroundCursor: { title: 'Orbit around cursor', description: 'Rotate about the point under the pointer' },
  invertZoom: { title: 'Invert zoom', description: 'Scroll up to zoom out' },
  gizmoStyle: { title: 'Gizmo style', description: 'The orientation control you click to snap views' },
} as const satisfies Record<string, ViewerRowCopy>;

/** The Alt preset's hazard on Linux (camera research, C14). */
export const linuxAltNote =
  'Some Linux desktops use Alt-drag to move windows. Choose another preset if the view does not move';

/** The View defaults rows, one per leaf, in the order the group lists them. */
export const viewDefaultCopy: Readonly<Record<ShownViewDefaultLeaf, ViewerRowCopy>> = {
  fieldOfView: {
    title: 'Projection',
    description: 'Drag for the field of view; 0° is orthographic, with parallel edges kept parallel',
  },
  'display.gizmo': { title: 'Show gizmo', description: 'The orientation control in the corner of a view' },
  'display.grid': { title: 'Grid', description: 'A ground grid with a scale label' },
  'display.axes': { title: 'Axes', description: 'The X, Y and Z axes at the origin' },
  'display.matcap': { title: 'Matcap', description: 'Shade surfaces with a studio material' },
  'grid.unit': { title: 'Grid unit', description: 'The length unit the grid shows' },
};

/** The View defaults group's heading detail. */
export const viewDefaultsInfo =
  'Every view that does not set its own uses these. Saved on this device; a project’s view files are not changed.';

/** The reset tooltip in Settings → Viewer: the level above the person is Tau. */
export const resetToTauDefault = 'Reset to Tau default';

/** The reset tooltip for a preset or gizmo style: back to what the tool answer suggests. */
export const resetToSuggestion = 'Reset to the suggestion';
