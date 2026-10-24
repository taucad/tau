import { describe, expect, it } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { graphicsSettingsForView, newViewRecord, viewCameraOrientation, viewSettingsOf } from '#records/view-record.js';

const record = (overrides: Partial<WorkbenchView> = {}): WorkbenchView =>
  workbenchRecords.view.schema.parse({ version: 1, entryPath: 'plate.ts', ...overrides });

const closeTo = (values: readonly number[]): unknown[] => values.map((value): unknown => expect.closeTo(value, 9));

describe('view-record', () => {
  it('should seed the graphics owner from every field a view keeps', () => {
    const view = record({
      fieldOfView: 30,
      upDirection: 'y',
      display: {
        surfaces: false,
        lines: true,
        gizmo: false,
        grid: false,
        axes: true,
        matcap: true,
        postProcessing: false,
      },
      camera: {
        kind: 'pose',
        frameId: 'tau:root',
        target: [0, 0, 0],
        direction: [0, 0, 1],
        up: [0, 1, 0],
        verticalSpan: 2,
        perspectiveZoom: 1,
      },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 0.2, isFlipped: true }] },
      measurements: [{ id: 'm', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 }],
    });

    expect(graphicsSettingsForView(view)).toMatchObject({
      enableSurfaces: false,
      enableGizmo: false,
      enableGrid: false,
      enableMatcap: true,
      upDirection: 'y',
      cameraFovAngle: 30,
      cameraView: { direction: [0, 0, 1], verticalSpan: 2 },
      sectionView: view.section,
      pinnedMeasurements: view.measurements,
    });
    expect(graphicsSettingsForView(record()).cameraView).toBeUndefined();
  });

  it('should orient a preset from the shared preset table and the isometric preset by the up direction', () => {
    expect(viewCameraOrientation(record({ camera: { kind: 'preset', preset: 'front' } }))).toEqual({
      direction: [0, -1, 0],
      up: [0, 0, 1],
    });
    expect(
      viewCameraOrientation(record({ camera: { kind: 'preset', preset: 'isometric' }, upDirection: 'z' })),
    ).toEqual({ direction: closeTo([Math.sqrt(3 / 8), -Math.sqrt(3 / 8), 0.5]), up: [0, 0, 1] });
    expect(viewCameraOrientation(record({ camera: { kind: 'look', direction: [0, 0, 2] } }))?.up).toEqual([0, 1, 0]);
    expect(
      viewCameraOrientation(
        record({
          camera: {
            kind: 'pose',
            frameId: 'tau:root',
            target: [0, 0, 0],
            direction: [1, 0, 0],
            up: [0, 0, 1],
            verticalSpan: 1,
            perspectiveZoom: 1,
          },
        }),
      ),
    ).toBeUndefined();
  });

  it('should read back from the graphics owner the fields it was seeded with', () => {
    const view = record({
      fieldOfView: 20,
      grid: { unit: 'in' },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0, isFlipped: false }] },
      measurements: [
        { id: 'm', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [0, 1, 0], distance: 1, name: 'Gap' },
      ],
    });
    const seed = graphicsSettingsForView(view);
    const context = {
      ...seed,
      displayUnits: { length: { symbol: view.grid.unit } },
      isSectionViewActive: seed.sectionView!.active,
      sectionCuts: seed.sectionView!.cuts.map((cut, index) => ({ ...cut, id: `cut-${String(index)}` })),
      measurements: [
        ...seed.pinnedMeasurements!.map((measurement) => ({ ...measurement, isPinned: true })),
        { ...seed.pinnedMeasurements![0]!, id: 'unpinned', isPinned: false },
      ],
    };

    const { fieldOfView, upDirection, display, grid, section, measurements } = view;
    expect(viewSettingsOf(context, seed.cameraFovAngle)).toEqual({
      fieldOfView,
      upDirection,
      display,
      grid,
      section,
      measurements,
    });
  });

  it("should keep the active viewer's display choices in a new view", () => {
    const settings = graphicsSettingsForView(record({ fieldOfView: 10, upDirection: 'x' }));
    expect(newViewRecord('gear.ts', settings)).toMatchObject({
      entryPath: 'gear.ts',
      fieldOfView: 10,
      upDirection: 'x',
    });
    expect(newViewRecord(null)).toMatchObject({ entryPath: null, camera: { kind: 'preset', preset: 'isometric' } });
  });
});
