import { describe, it, expect } from 'vitest';
import {
  panelIds,
  desktopPanelIds,
  allotmentPanelOrder,
  defaultPanelState,
  defaultRenderTimeout,
  defaultGraphicsSettings,
  parseGraphicsViewSettings,
  omitEmptyComponentDisplayState,
} from '#constants/editor.constants.js';

const componentDisplayUnitId = 'file:src/main.ts';
const coverComponentId = 'component:Cover';

describe('editor constants – panel consistency', () => {
  it('allotmentPanelOrder should contain every panel from panelIds', () => {
    for (const id of panelIds) {
      expect(allotmentPanelOrder).toContain(id);
    }
  });

  it('allotmentPanelOrder should not contain extra panels missing from panelIds', () => {
    // Allotment.resize() is positional: every entry in allotmentPanelOrder must
    // correspond to exactly one <Allotment.Pane> in chat-interface-desktop.tsx.
    // Stale entries (e.g. an unshipped 'git' panel) shift sizes onto the wrong
    // panes and zero out the last visible pane.
    for (const id of allotmentPanelOrder) {
      expect(panelIds).toContain(id);
    }
  });

  it('desktopPanelIds should be a subset of panelIds', () => {
    for (const id of desktopPanelIds) {
      expect(panelIds).toContain(id);
    }
  });

  it('defaultPanelState.openPanels should have an entry for every desktop panel', () => {
    for (const id of desktopPanelIds) {
      expect(defaultPanelState.openPanels).toHaveProperty(id);
    }
  });

  it('defaultPanelState.panelSizes should have an entry for every panel', () => {
    for (const id of panelIds) {
      expect(defaultPanelState.panelSizes).toHaveProperty(id);
    }
  });
});

describe('graphics view settings parsing', () => {
  it('should default render timeout to 60_000ms', () => {
    expect(defaultRenderTimeout).toBe(60_000);
    expect(defaultGraphicsSettings.renderTimeout).toBe(defaultRenderTimeout);
  });

  it('should parse v5 component display state', () => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 5,
      componentDisplay: {
        schemaVersion: 1,
        unitsById: {
          [componentDisplayUnitId]: {
            hiddenComponentIds: ['component:Housing'],
            isolatedComponentIds: ['component:SunGear'],
            opacityByComponentId: { [coverComponentId]: 0.5 },
          },
        },
      },
    });

    expect(settings.schemaVersion).toBe(5);
    expect(settings.componentDisplay).toEqual({
      schemaVersion: 1,
      unitsById: {
        [componentDisplayUnitId]: {
          hiddenComponentIds: ['component:Housing'],
          isolatedComponentIds: ['component:SunGear'],
          opacityByComponentId: { [coverComponentId]: 0.5 },
        },
      },
    });
  });

  it.each([2, 3, 4] as const)('should migrate schema v%s settings to v5', (schemaVersion) => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion,
      graphicsBackend: schemaVersion === 3 ? 'auto' : 'webgl',
    });

    expect(settings.schemaVersion).toBe(5);
    expect(settings.graphicsBackend).toBe('webgl');
  });

  it('should fall back to defaults for corrupt persisted settings', () => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 5,
      componentDisplay: {
        schemaVersion: 1,
        unitsById: {
          [componentDisplayUnitId]: {
            hiddenComponentIds: [false],
          },
        },
      },
    });

    expect(settings).toEqual(defaultGraphicsSettings);
  });

  it('should omit empty component display state', () => {
    expect(
      omitEmptyComponentDisplayState({
        schemaVersion: 1,
        unitsById: {
          [componentDisplayUnitId]: {
            hiddenComponentIds: [],
            isolatedComponentIds: [],
            opacityByComponentId: {},
          },
        },
      }),
    ).toBeUndefined();

    expect(
      omitEmptyComponentDisplayState({
        schemaVersion: 1,
        unitsById: {
          [componentDisplayUnitId]: {
            hiddenComponentIds: ['component:Housing'],
          },
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      unitsById: {
        [componentDisplayUnitId]: {
          hiddenComponentIds: ['component:Housing'],
        },
      },
    });
  });
});
