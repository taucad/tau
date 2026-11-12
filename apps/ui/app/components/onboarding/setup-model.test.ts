import { describe, expect, it } from 'vitest';
import type { LanguageId } from '@taucad/preferences';
import { emptyDeviceRecord, emptyPersonProfile, emptyViewerPreferences } from '@taucad/preferences';
import {
  announceChangedRows,
  answerRows,
  gizmoChoice,
  hostLine,
  legendBindings,
  presetReason,
  setupSteps,
  toggleGoal,
  toggleLanguage,
} from '#components/onboarding/setup-model.js';
import type { KernelLanguages } from '#components/onboarding/setup-model.js';

const browser: KernelLanguages = {
  host: 'browser',
  onHost: new Set<LanguageId>(['typescript', 'openscad']),
  onDesktop: new Set<LanguageId>(['typescript', 'openscad', 'python', 'csharp']),
};

describe('setup model', () => {
  it('has four steps with viewerControls on and three with it off', () => {
    expect(setupSteps(true)).toEqual(['goals', 'background', 'viewer', 'how']);
    expect(setupSteps(false)).toEqual(['goals', 'background', 'how']);
  });

  it('keeps "Just exploring" and "I\'d rather not write code" exclusive', () => {
    expect(toggleGoal(['printing'], 'exploring', true)).toEqual(['exploring']);
    expect(toggleGoal(['exploring'], 'art', true)).toEqual(['art']);
    expect(toggleGoal(['art'], 'printing', true)).toEqual(['printing', 'art']);
    expect(toggleGoal(['printing', 'art'], 'art', false)).toEqual(['printing']);
    expect(toggleLanguage(['python'], 'none', true)).toEqual(['none']);
    expect(toggleLanguage(['none'], 'csharp', true)).toEqual(['csharp']);
  });

  it('gives the host line only for a language with no kernel here', () => {
    expect(hostLine(['typescript'], browser)).toBeUndefined();
    expect(hostLine(['python', 'csharp'], browser)).toBe(
      'No Python or C# kernel is available in the browser yet. The desktop app has one.',
    );
    expect(hostLine(['python'], { ...browser, onDesktop: new Set<LanguageId>() })).toBe(
      'No Python kernel is available in the browser yet.',
    );
    expect(hostLine(['none'], browser)).toBeUndefined();
  });

  it('names a product as the reason only when the suggestion table allows it', () => {
    expect(presetReason(undefined)).toBe('Tau’s default. Pick another if it is closer to what you know');
    expect(presetReason('solidworks')).toBe('Suggested because you use SolidWorks');
    expect(presetReason('slicer')).toBe('Tau’s default. Pick another if it is closer to what you know');
    expect(presetReason('game-engine')).toBe(
      'Suggested from your answer. Pick another if it is closer to what you know',
    );
  });

  it('reads None from the gizmo view default and the style otherwise', () => {
    expect(gizmoChoice(emptyViewerPreferences, { ...emptyPersonProfile, tool: 'blender' })).toBe('axis-balls');
    expect(
      gizmoChoice({ ...emptyViewerPreferences, viewDefaults: { 'display.gizmo': false } }, emptyPersonProfile),
    ).toBe('none');
  });

  it('renders the legend from the preset data', () => {
    expect(legendBindings('middle-ctrl')).toEqual({
      orbit: [['Middle drag']],
      pan: [['Ctrl', 'Middle drag']],
      zoom: [['Shift', 'Middle drag'], ['Scroll']],
    });
    expect(legendBindings('trackpad')).toEqual({
      orbit: [['Click drag'], ['Alt', 'Two-finger scroll']],
      pan: [['Shift', 'Click drag'], ['Two-finger scroll']],
      zoom: [['Pinch']],
    });
  });

  it('announces only the rows whose text changed', () => {
    const input = {
      profile: emptyPersonProfile,
      viewer: emptyViewerPreferences,
      device: emptyDeviceRecord,
      kernels: browser,
      isViewerControlsEnabled: true,
    };
    const before = answerRows(input);
    const after = answerRows({ ...input, profile: { ...emptyPersonProfile, tool: 'fusion' } });
    expect(announceChangedRows(before, after)).toBe('Viewer: Middle-drag pan, Shift orbit, cube gizmo');
    expect(announceChangedRows(after, after)).toBe('');
  });
});
