import { describe, expect, it } from 'vitest';
import {
  effectiveGizmoStyle,
  effectivePreset,
  emptyPersonProfile,
  emptyViewerPreferences,
  suggestedGizmo,
  suggestedPreset,
  toolIds,
  toolSuggestions,
} from '@taucad/preferences';
import type { GizmoStyleId, MousePresetId, PersonProfile, ToolId, ViewerPreferences } from '@taucad/preferences';

/** Every tool answer: its preset, its gizmo, and the products copy may name as the reason (camera research R13). */
const expectedSuggestions: ReadonlyArray<readonly [ToolId, MousePresetId, GizmoStyleId, readonly string[]]> = [
  ['new', 'tau', 'cube', []],
  ['other', 'tau', 'cube', []],
  ['openscad', 'tau', 'cube', ['OpenSCAD']],
  ['slicer', 'tau', 'cube', []],
  // KiCad is documented and matches P1, but the answer also covers Altium, which does not.
  ['kicad', 'tau', 'cube', []],
  ['tinkercad', 'right-orbit', 'cube', ['Tinkercad']],
  ['onshape', 'right-orbit', 'cube', ['Onshape']],
  ['solidworks', 'middle-ctrl', 'cube', ['SolidWorks']],
  ['blender', 'middle-shift', 'axis-balls', ['Blender']],
  // No Siemens page documents NX's mapping, so the shared answer names Creo alone.
  ['nx-creo', 'middle-shift', 'cube', ['Creo']],
  ['fusion', 'shift-middle', 'cube', ['Fusion', 'Inventor']],
  ['game-engine', 'alt', 'axis-balls', ['Maya', 'Unity', 'Unreal']],
];

describe('the suggestion table', () => {
  it('has one row per tool answer', () => {
    expect(Object.keys(toolSuggestions).toSorted()).toEqual([...toolIds].toSorted());
    expect(expectedSuggestions.map(([tool]) => tool).toSorted()).toEqual([...toolIds].toSorted());
  });

  it.each(expectedSuggestions)('suggests for %s the preset %s and the gizmo %s, naming %j', (...row) => {
    const [tool, preset, gizmo, names] = row;
    expect(suggestedPreset(tool)).toBe(preset);
    expect(suggestedGizmo(tool)).toBe(gizmo);
    expect(toolSuggestions[tool].names).toEqual(names);
  });

  it("suggests Tau's defaults with no tool answer", () => {
    expect(suggestedPreset(undefined)).toBe('tau');
    expect(suggestedGizmo(undefined)).toBe('cube');
  });
});

describe('effective preset and gizmo style', () => {
  const blender: PersonProfile = { ...emptyPersonProfile, tool: 'blender' };

  it('follow the tool answer while the person has chosen nothing', () => {
    expect(effectivePreset(emptyViewerPreferences, blender)).toBe('middle-shift');
    expect(effectiveGizmoStyle(emptyViewerPreferences, blender)).toBe('axis-balls');
    expect(effectivePreset(emptyViewerPreferences, { ...blender, tool: 'fusion' })).toBe('shift-middle');
  });

  it("use the person's own choice over the suggestion", () => {
    const chosen: ViewerPreferences = {
      ...emptyViewerPreferences,
      controls: { preset: 'tau' },
      gizmo: { style: 'axes' },
    };
    expect(effectivePreset(chosen, blender)).toBe('tau');
    expect(effectiveGizmoStyle(chosen, blender)).toBe('axes');
  });
});
