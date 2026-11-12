import { toolIds } from '#person-profile.js';
import type { PersonProfile, ToolId } from '#person-profile.js';
import type { GizmoStyleId, MousePresetId, ViewerPreferences } from '#viewer-preferences.js';

/**
 * What one answer to "which tool did you use last" suggests: a mouse preset and a gizmo style that match that tool's
 * camera controls. `names` lists the products copy may give as the reason ("Familiar from Creo"). A product is listed
 * only when its vendor's own documentation (a manual, help page, shortcut sheet or source code) describes its orbit,
 * pan and zoom bindings and they match the preset (camera research R13). An empty list means copy says "Suggested from
 * your answer", or nothing for Tau's own default.
 *
 * @public
 */
export type ToolSuggestion = Readonly<{ preset: MousePresetId; gizmo: GizmoStyleId; names: readonly string[] }>;

/**
 * The suggestion for each tool answer: the preset and gizmo it starts from, and the products copy may name. The
 * "NX or Creo" answer names Creo alone: no Siemens page documents NX's mouse mapping. "KiCad or another ECAD tool"
 * names none, because Altium, which it also covers, orbits differently; "A slicer" names no product.
 *
 * @public
 */
export const toolSuggestions: Readonly<Record<ToolId, ToolSuggestion>> = Object.freeze({
  new: { preset: 'tau', gizmo: 'cube', names: [] },
  other: { preset: 'tau', gizmo: 'cube', names: [] },
  openscad: { preset: 'tau', gizmo: 'cube', names: ['OpenSCAD'] },
  slicer: { preset: 'tau', gizmo: 'cube', names: [] },
  kicad: { preset: 'tau', gizmo: 'cube', names: [] },
  tinkercad: { preset: 'right-orbit', gizmo: 'cube', names: ['Tinkercad'] },
  onshape: { preset: 'right-orbit', gizmo: 'cube', names: ['Onshape'] },
  solidworks: { preset: 'middle-ctrl', gizmo: 'cube', names: ['SolidWorks'] },
  blender: { preset: 'middle-shift', gizmo: 'axis-balls', names: ['Blender'] },
  'nx-creo': { preset: 'middle-shift', gizmo: 'cube', names: ['Creo'] },
  fusion: { preset: 'shift-middle', gizmo: 'cube', names: ['Fusion', 'Inventor'] },
  'game-engine': { preset: 'alt', gizmo: 'axis-balls', names: ['Maya', 'Unity', 'Unreal'] },
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

/**
 * The products a preset is familiar from, for its "Familiar from …" line: every product a tool answer suggesting that
 * preset may name ({@link toolSuggestions}), in answer order. Empty when no answer names a product for it.
 *
 * @param preset - The mouse preset.
 * @returns The product names.
 *
 * @example <caption>Familiar from Blender and Creo</caption>
 * ```typescript
 * import { familiarProducts } from '@taucad/preferences';
 *
 * console.log(familiarProducts('middle-shift')); // ['Blender', 'Creo']
 * ```
 *
 * @public
 */
export const familiarProducts = (preset: MousePresetId): readonly string[] =>
  toolIds.flatMap((tool) => (toolSuggestions[tool].preset === preset ? toolSuggestions[tool].names : []));
