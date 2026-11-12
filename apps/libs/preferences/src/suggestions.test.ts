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

/** Every tool answer: its preset, its gizmo, and whether copy may name the tool as the reason. */
const expectedSuggestions: ReadonlyArray<readonly [ToolId, MousePresetId, GizmoStyleId, boolean]> = [
  ['new', 'tau', 'cube', false],
  ['other', 'tau', 'cube', false],
  ['openscad', 'tau', 'cube', true],
  ['slicer', 'tau', 'cube', false],
  ['kicad', 'tau', 'cube', false],
  ['tinkercad', 'right-orbit', 'cube', false],
  ['onshape', 'right-orbit', 'cube', true],
  ['solidworks', 'middle-ctrl', 'cube', true],
  ['blender', 'middle-shift', 'axis-balls', true],
  ['nx-creo', 'middle-shift', 'cube', true],
  ['fusion', 'shift-middle', 'cube', true],
  ['game-engine', 'alt', 'axis-balls', false],
];

describe('the suggestion table', () => {
  it('has one row per tool answer', () => {
    expect(Object.keys(toolSuggestions).toSorted()).toEqual([...toolIds].toSorted());
    expect(expectedSuggestions.map(([tool]) => tool).toSorted()).toEqual([...toolIds].toSorted());
  });

  it.each(expectedSuggestions)('suggests for %s the preset %s and the gizmo %s', (...row) => {
    const [tool, preset, gizmo, named] = row;
    expect(suggestedPreset(tool)).toBe(preset);
    expect(suggestedGizmo(tool)).toBe(gizmo);
    expect(toolSuggestions[tool].named).toBe(named);
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
