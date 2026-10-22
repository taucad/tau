import { describe, it, expect } from 'vitest';
import { mobilePanelIds, defaultPanelState, defaultOperationTimeout } from '#constants/editor.constants.js';
import { defaultGraphicsSettings, omitEmptyComponentDisplayState } from '@taucad/viewer/graphics/graphics-settings';
import type { PersistedModelComponentDisplayState } from '@taucad/viewer/graphics/graphics-settings';

describe('editor device defaults', () => {
  it('keeps desktop lanes separate from mobile navigation and seeds new graphics owners', () => {
    expect(mobilePanelIds).toEqual([
      'chat',
      'files',
      'viewer',
      'parameters',
      'editor',
      'converter',
      'details',
      'share',
      'revisions',
    ]);
    expect(defaultPanelState.desktopLayout).toMatchObject({
      chatOpen: true,
      workbenchOpen: true,
      chatWidth: 320,
      workbenchWidth: 420,
      compactAuxiliary: 'chat',
    });
    // A phone opens on the model alone, with the drawer collapsed, until the person picks a panel.
    expect(defaultPanelState.mobileActiveTab).toBe('viewer');
    expect(defaultOperationTimeout).toBe(180_000);
    expect(defaultGraphicsSettings.graphicsBackend).toBe('webgl');
  });

  it('omits empty transient component display while retaining a hidden component', () => {
    expect(
      omitEmptyComponentDisplayState({
        schemaVersion: 1,
        unitsById: { 'file:main.ts': { hiddenComponentIds: [], isolatedComponentIds: [], opacityByComponentId: {} } },
      }),
    ).toBeUndefined();
    const display: PersistedModelComponentDisplayState = {
      schemaVersion: 1,
      unitsById: { 'file:main.ts': { hiddenComponentIds: ['part'] } },
    };
    expect(omitEmptyComponentDisplayState(display)).toEqual(display);
  });
});
