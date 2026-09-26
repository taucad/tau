import { describe, it, expect } from 'vitest';
import { isSectionRemoved, resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import {
  mobilePanelIds,
  defaultPanelState,
  defaultRenderTimeout,
  defaultGraphicsSettings,
  parseGraphicsViewSettings,
  parseLegacyModelComponentDisplay,
  omitEmptyComponentDisplayState,
  readLegacyRenderTimeout,
} from '#constants/editor.constants.js';

const componentDisplayUnitId = 'file:src/main.ts';
const coverComponentId = 'component:Cover';

describe('editor constants – panel consistency', () => {
  it('keeps desktop lanes separate from the mobile navigation IDs', () => {
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
  /* Schema v11 (E1): the render timeout is owned per file, so it no longer rides in a view record. */
  it('should keep the render timeout out of the per-view record', () => {
    expect(defaultRenderTimeout).toBe(180_000);
    expect(defaultGraphicsSettings).not.toHaveProperty('renderTimeout');
    expect(
      parseGraphicsViewSettings({ ...defaultGraphicsSettings, schemaVersion: 10, renderTimeout: 30_000 }),
    ).not.toHaveProperty('renderTimeout');
    expect(readLegacyRenderTimeout({ renderTimeout: 30, schemaVersion: 1 })).toBe(30_000);
    expect(readLegacyRenderTimeout({ renderTimeout: 30_000, schemaVersion: 10 })).toBe(30_000);
    expect(readLegacyRenderTimeout({ schemaVersion: 11 })).toBeUndefined();
  });

  it('should strip a legacy environment preset without discarding other settings', () => {
    const obsoleteSettingsKey = ['environment', 'Preset'].join('');
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      [obsoleteSettingsKey]: 'performance',
      enableGrid: false,
    });

    expect(settings.enableGrid).toBe(false);
    expect(settings).not.toHaveProperty(obsoleteSettingsKey);
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

    expect(settings.schemaVersion).toBe(12);
    expect(settings.cameraFovAngle).toBe(0);
    expect(settings.cameraView).toEqual({
      frameId: 'tau:root',
      target: [0.003, 0.004, 0.005],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 0.012,
      perspectiveZoom: 1,
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

  it.each([2, 3, 4, 5, 6, 8, 9] as const)('should migrate schema v%s settings to v12', (schemaVersion) => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion,
      graphicsBackend: schemaVersion === 3 ? 'auto' : 'webgl',
    });

    expect(settings.schemaVersion).toBe(12);
    expect(settings.cameraView).toBeUndefined();
    expect(settings.graphicsBackend).toBe('webgl');
  });

  it.each([3, 4, 5, 6, 7, 8] as const)(
    'should normalize persisted WebGPU from schema v%s to WebGL',
    (schemaVersion) => {
      const settings = parseGraphicsViewSettings({
        ...defaultGraphicsSettings,
        schemaVersion,
        graphicsBackend: 'webgpu',
        enableGrid: false,
      });

      expect(settings.schemaVersion).toBe(12);
      expect(settings.graphicsBackend).toBe('webgl');
      expect(settings.enableGrid).toBe(false);
    },
  );

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

    expect(settings).toMatchObject({ schemaVersion: 12, enableGrid: false, cameraFovAngle: 42 });
    expect(settings.cameraView).toBeUndefined();
  });

  it('should preserve v9 perspective zoom and drop only an invalid camera view', () => {
    const cameraView = {
      target: [1, 2, 3],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1.75,
    } as const;
    expect(parseGraphicsViewSettings({ ...defaultGraphicsSettings, schemaVersion: 9, cameraView }).cameraView).toEqual({
      frameId: 'tau:root',
      ...cameraView,
    });

    const invalid = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 9,
      enableGrid: false,
      cameraView: { ...cameraView, perspectiveZoom: 0 },
    });
    expect(invalid).toMatchObject({ schemaVersion: 12, enableGrid: false });
    expect(invalid.cameraView).toBeUndefined();
  });

  it('should restore schema v8 camera views with unit perspective zoom', () => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 8,
      cameraView: {
        target: [1, 2, 3],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 12,
      },
    });

    expect(settings.cameraView).toEqual({
      frameId: 'tau:root',
      target: [1, 2, 3],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 12,
      perspectiveZoom: 1,
    });
  });

  it('should migrate v7 pinned measurement lengths from millimetres to metres', () => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 7,
      pinnedMeasurements: [
        {
          id: 'measurement-1',
          startPoint: [1000, 2000, 3000],
          endPoint: [4000, 5000, 6000],
          distance: 5196.152,
        },
      ],
    });

    expect(settings.pinnedMeasurements?.[0]).toMatchObject({
      id: 'measurement-1',
      frameId: 'tau:root',
      startPoint: [1, 2, 3],
      endPoint: [4, 5, 6],
    });
    expect(settings.pinnedMeasurements?.[0]?.distance).toBeCloseTo(Math.sqrt(27));
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

describe('section view settings', () => {
  const axisOf = { xy: [0, 0, 1], xz: [0, 1, 0], yz: [1, 0, 0] } as const;

  /*
   * A version 11 record removed the side of the pivot its `direction` times its rotated +axis normal points to; the
   * rotation turned the normal about X, then Y, then Z. `removed` is that side along the plane's axis, read from the
   * v11 resolver.
   */
  it.each([
    // A small turn leaves each normal on the side of the plane it started on.
    { plane: 'xy', turn: 'slightly', rotation: [0.4, 0.5, 0.6], direction: 1, removed: 1 },
    { plane: 'xy', turn: 'slightly', rotation: [0.4, 0.5, 0.6], direction: -1, removed: -1 },
    { plane: 'xz', turn: 'slightly', rotation: [0.4, 0.5, 0.6], direction: 1, removed: 1 },
    { plane: 'xz', turn: 'slightly', rotation: [0.4, 0.5, 0.6], direction: -1, removed: -1 },
    { plane: 'yz', turn: 'slightly', rotation: [0.4, 0.5, 0.6], direction: 1, removed: 1 },
    { plane: 'yz', turn: 'slightly', rotation: [0.4, 0.5, 0.6], direction: -1, removed: -1 },
    // Turned past 90°, the normal points the other way along the axis, so v11 removed the other side.
    { plane: 'xy', turn: '180° about X', rotation: [Math.PI, 0, 0], direction: 1, removed: -1 },
    { plane: 'xy', turn: '180° about X', rotation: [Math.PI, 0, 0], direction: -1, removed: 1 },
    { plane: 'xy', turn: '120° about Y', rotation: [0, (2 * Math.PI) / 3, 0], direction: 1, removed: -1 },
    { plane: 'xy', turn: '120° about Y', rotation: [0, (2 * Math.PI) / 3, 0], direction: -1, removed: 1 },
    // Turned about Z, then Y, then X instead, this normal would end up on the other side.
    { plane: 'xz', turn: 'about all three axes', rotation: [Math.PI / 2, Math.PI / 2, 1], direction: 1, removed: 1 },
    { plane: 'xz', turn: 'about all three axes', rotation: [Math.PI / 2, Math.PI / 2, 1], direction: -1, removed: -1 },
  ] as const)(
    'should migrate a v11 $plane plane turned $turn with direction $direction to a cut that removes the side it removed',
    ({ plane, rotation, direction, removed }) => {
      const pivot: [number, number, number] = [0.1, 0.2, 0.3];
      const settings = parseGraphicsViewSettings({
        ...defaultGraphicsSettings,
        schemaVersion: 11,
        sectionView: { active: true, plane, pivot, rotation, direction },
        sectionDisplay: { clipLines: false, clipMesh: true, planeName: 'cartesian' },
      });

      expect(settings.schemaVersion).toBe(12);
      expect(settings).not.toHaveProperty('sectionDisplay');
      expect(settings.sectionView?.active).toBe(true);
      const pieces = resolveSectionPieces((settings.sectionView?.cuts ?? []).map((cut) => ({ ...cut, id: 'cut' })));
      expect(pieces).toHaveLength(1);
      const step = (sign: number): [number, number, number] => [
        pivot[0] + axisOf[plane][0] * 0.01 * sign,
        pivot[1] + axisOf[plane][1] * 0.01 * sign,
        pivot[2] + axisOf[plane][2] * 0.01 * sign,
      ];
      expect(isSectionRemoved(step(removed), pieces)).toBe(true);
      expect(isSectionRemoved(step(-removed), pieces)).toBe(false);
    },
  );

  it('should drop a v11 rotation and keep the offset through the pivot', () => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 11,
      sectionView: { active: false, plane: 'xz', pivot: [1, 2, 3], rotation: [0, 0.5, 0], direction: -1 },
    });

    expect(settings.sectionView).toEqual({
      active: false,
      cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: true }],
    });
  });

  it('should migrate a v11 view with no plane to no cuts, inactive', () => {
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      schemaVersion: 11,
      sectionView: { active: true, pivot: [0, 0, 0], rotation: [0, 0, 0], direction: 1 },
    });

    expect(settings.sectionView).toEqual({ active: false, cuts: [] });
  });

  it('should keep v12 cuts as written', () => {
    const sectionView = {
      active: true,
      cuts: [
        { kind: 'plane', plane: 'yz', offset: -0.25, isFlipped: false },
        { kind: 'revolution', axis: 'z', origin: [1, 2, 3], start: 30, sweep: 200 },
      ],
    } as const;

    expect(parseGraphicsViewSettings({ ...defaultGraphicsSettings, sectionView }).sectionView).toEqual(sectionView);
  });

  const cut = { kind: 'plane', plane: 'xy', offset: 0, isFlipped: false } as const;

  it.each([
    { invalid: 'more cuts than a section holds', cuts: [cut, cut, cut, cut, cut] },
    { invalid: 'a null cut', cuts: [cut, null] },
  ])('should drop only the section view from a record with $invalid', ({ cuts }) => {
    const cameraView = { target: [1, 2, 3], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 12, perspectiveZoom: 1 };
    const pinnedMeasurements = [
      { id: 'measurement-1', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 },
    ];
    const settings = parseGraphicsViewSettings({
      ...defaultGraphicsSettings,
      enableGrid: false,
      cameraView,
      pinnedMeasurements,
      sectionView: { active: true, cuts },
    });

    expect(settings).toEqual({
      ...defaultGraphicsSettings,
      enableGrid: false,
      cameraView: { frameId: 'tau:root', ...cameraView },
      pinnedMeasurements,
    });
    expect(settings).not.toHaveProperty('sectionView');
  });
});
