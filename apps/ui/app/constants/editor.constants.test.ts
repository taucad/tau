import { describe, it, expect } from 'vitest';
import {
  mobilePanelIds,
  defaultPanelState,
  defaultRenderTimeout,
  defaultGraphicsSettings,
  parseGraphicsViewSettings,
  parseLegacyModelComponentDisplay,
  omitEmptyComponentDisplayState,
} from '#constants/editor.constants.js';

const componentDisplayUnitId = 'file:src/main.ts';
const coverComponentId = 'component:Cover';

describe('editor constants – panel consistency', () => {
  it('keeps desktop lanes separate from the mobile navigation IDs', () => {
    expect(mobilePanelIds).toEqual(['chat', 'files', 'viewer', 'parameters', 'editor', 'converter', 'details']);
    expect(defaultPanelState.desktopLayout).toEqual({
      chatOpen: true,
      workbenchOpen: true,
      chatWidth: 320,
      workbenchWidth: 420,
      compactAuxiliary: 'chat',
    });
    expect(defaultPanelState.modelPaneview).toEqual({});
    expect(defaultPanelState.consolePaneview).toEqual({});
  });
});

describe('graphics view settings parsing', () => {
  it('should default render timeout to 60_000ms', () => {
    expect(defaultRenderTimeout).toBe(60_000);
    expect(defaultGraphicsSettings.renderTimeout).toBe(defaultRenderTimeout);
  });

  it('should migrate v6 camera state while extracting legacy component display separately', () => {
    const persisted = {
      ...defaultGraphicsSettings,
      schemaVersion: 6,
      cameraFovAngle: 0,
      cameraView: {
        target: [3, 4, 5],
        direction: [2, 0, 0],
        up: [0, 0, 4],
        verticalSpan: 12,
      },
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
    } as const;
    const settings = parseGraphicsViewSettings(persisted);

    expect(settings.schemaVersion).toBe(7);
    expect(settings.cameraFovAngle).toBe(0);
    expect(settings.cameraView).toEqual({
      target: [3, 4, 5],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
    });
    expect(settings).not.toHaveProperty('componentDisplay');
    expect(parseLegacyModelComponentDisplay(persisted)).toEqual({
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

  it.each([2, 3, 4, 5, 6] as const)('should migrate schema v%s settings to v7', (schemaVersion) => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion,
      graphicsBackend: schemaVersion === 3 ? 'auto' : 'webgl',
    });

    expect(settings.schemaVersion).toBe(7);
    expect(settings.cameraView).toBeUndefined();
    expect(settings.graphicsBackend).toBe('webgl');
  });

  it.each([3, 4, 5, 6, 7] as const)('should normalize persisted WebGPU from schema v%s to WebGL', (schemaVersion) => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion,
      graphicsBackend: 'webgpu',
      enableGrid: false,
    });

    expect(settings.schemaVersion).toBe(7);
    expect(settings.graphicsBackend).toBe('webgl');
    expect(settings.enableGrid).toBe(false);
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

  it.each([
    { target: [0, 0, Number.POSITIVE_INFINITY], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 2 },
    { target: [0, 0, 0], direction: [0, 0, 0], up: [0, 0, 1], verticalSpan: 2 },
    { target: [0, 0, 0], direction: [1, 0, 0], up: [2, 0, 0], verticalSpan: 2 },
    { target: [0, 0, 0], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 0 },
  ])('should drop corrupt camera state without discarding other settings', (cameraView) => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 6,
      enableGrid: false,
      cameraFovAngle: 42,
      cameraView,
    });

    expect(settings).toMatchObject({ schemaVersion: 7, enableGrid: false, cameraFovAngle: 42 });
    expect(settings.cameraView).toBeUndefined();
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
