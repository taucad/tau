import type { PersonProfile, ToolId } from '#person-profile.js';
import type { GizmoStyleId, MousePresetId, ViewerPreferences } from '#viewer-preferences.js';

/**
 * What one answer to "which tool did you use last" suggests: a mouse preset and a gizmo style that match that tool's
 * camera controls. `named` says whether copy may give the tool as the reason. It is true only when the tool's own
 * documentation describes its orbit, pan and zoom bindings, so the match is checked against the vendor's description;
 * otherwise the copy says "Suggested from your answer", or nothing for Tau's own default.
 *
 * @public
 */
export type ToolSuggestion = Readonly<{ preset: MousePresetId; gizmo: GizmoStyleId; named: boolean }>;

/**
 * The suggestion for each tool answer: the preset and gizmo it starts from, and whether copy may name the tool.
 *
 * @public
 */
export const toolSuggestions: Readonly<Record<ToolId, ToolSuggestion>> = Object.freeze({
  new: { preset: 'tau', gizmo: 'cube', named: false },
  other: { preset: 'tau', gizmo: 'cube', named: false },
  openscad: { preset: 'tau', gizmo: 'cube', named: true },
  slicer: { preset: 'tau', gizmo: 'cube', named: false },
  kicad: { preset: 'tau', gizmo: 'cube', named: false },
  tinkercad: { preset: 'right-orbit', gizmo: 'cube', named: false },
  onshape: { preset: 'right-orbit', gizmo: 'cube', named: true },
  solidworks: { preset: 'middle-ctrl', gizmo: 'cube', named: true },
  blender: { preset: 'middle-shift', gizmo: 'axis-balls', named: true },
  'nx-creo': { preset: 'middle-shift', gizmo: 'cube', named: true },
  fusion: { preset: 'shift-middle', gizmo: 'cube', named: true },
  'game-engine': { preset: 'alt', gizmo: 'axis-balls', named: false },
});

/**
 * The mouse preset a tool answer suggests; Tau's default with no answer.
 *
 * @param tool - The person's tool answer, if any.
 * @returns The suggested preset.
 *
 * @example <caption>A SolidWorks person</caption>
 * ```typescript
 * import { suggestedPreset } from '@taucad/preferences';
 *
 * console.log(suggestedPreset('solidworks')); // 'middle-ctrl'
 * ```
 *
 * @public
 */
export const suggestedPreset = (tool: ToolId | undefined): MousePresetId =>
  tool === undefined ? 'tau' : toolSuggestions[tool].preset;

/**
 * The gizmo style a tool answer suggests; the Cube with no answer.
 *
 * @param tool - The person's tool answer, if any.
 * @returns The suggested style.
 *
 * @example <caption>A Blender person</caption>
 * ```typescript
 * import { suggestedGizmo } from '@taucad/preferences';
 *
 * console.log(suggestedGizmo('blender')); // 'axis-balls'
 * ```
 *
 * @public
 */
export const suggestedGizmo = (tool: ToolId | undefined): GizmoStyleId =>
  tool === undefined ? 'cube' : toolSuggestions[tool].gizmo;

/**
 * The mouse preset the person uses: their own choice, else the suggestion for their tool answer. Suggestions are
 * never stored, so a changed tool answer still moves it.
 *
 * @param viewer - The person's viewer preferences.
 * @param profile - The person's profile.
 * @returns The preset in effect.
 *
 * @public
 */
export const effectivePreset = (viewer: ViewerPreferences, profile: PersonProfile): MousePresetId =>
  viewer.controls.preset ?? suggestedPreset(profile.tool);

/**
 * The gizmo style the person uses: their own choice, else the suggestion for their tool answer.
 *
 * @param viewer - The person's viewer preferences.
 * @param profile - The person's profile.
 * @returns The style in effect.
 *
 * @public
 */
export const effectiveGizmoStyle = (viewer: ViewerPreferences, profile: PersonProfile): GizmoStyleId =>
  viewer.gizmo.style ?? suggestedGizmo(profile.tool);
