import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { describe, expect, it } from 'vitest';
import { foreignChanges, nextRecord, ownersOf } from '#workbench-records/view-record-binding-changes.js';

const record = (fields: Record<string, unknown> = {}): WorkbenchView =>
  workbenchRecords.view.schema.parse({ version: 1, entryPath: 'src/main.ts', ...fields });
const pose = {
  kind: 'pose',
  frameId: 'tau:root',
  target: [1, 2, 3],
  direction: [1, 0, 0],
  up: [0, 0, 1],
  verticalSpan: 5,
  perspectiveZoom: 1,
} as const;

describe('foreignChanges', () => {
  it('should adopt every field of the first record', () => {
    const first = record({ camera: pose, grid: { unit: 'in' } });
    const changes = foreignChanges(undefined, first);
    expect(changes.graphics.map(({ type }) => type)).toEqual([
      'setSurfaceVisibility',
      'setLinesVisibility',
      'setGizmoVisibility',
      'setGridVisibility',
      'setAxesVisibility',
      'setMatcapVisibility',
      'setPostProcessingVisibility',
      'setGridUnit',
      'setUpDirection',
      'adoptPinnedMeasurements',
    ]);
    expect(changes.section).toEqual(first.section);
    expect(changes.camera).toEqual({
      pose: { target: [1, 2, 3], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 5, perspectiveZoom: 1 },
      verticalFieldOfView: first.fieldOfView,
      upDirection: first.upDirection,
    });
  });

  it('should adopt only the fields that changed', () => {
    const before = record();
    const changes = foreignChanges(before, record({ grid: { unit: 'in' } }));
    expect(changes).toEqual({ graphics: [{ type: 'setGridUnit', payload: { unit: 'in' } }] });
  });

  it('should ask nothing for a record published again', () => {
    const before = record({ camera: pose });
    expect(foreignChanges(before, structuredClone(before))).toEqual({ graphics: [] });
  });

  it('should never adopt the camera, section or measurements the acknowledged patch carries', () => {
    const before = record();
    const next = record({ camera: pose, measurements: [], section: { active: true, cuts: [] } });
    const changes = foreignChanges(before, next, {
      patch: { camera: next.camera, section: next.section, measurements: [] },
    });
    expect(changes).toEqual({ graphics: [] });
  });

  it('should seed an inheritable leaf whatever wrote it, a patch included (GP1)', () => {
    const before = record();
    const next = record({ grid: { unit: 'in' }, display: { ...before.display, grid: false } });
    const changes = foreignChanges(before, next, { patch: { grid: { unit: 'in' }, display: { grid: false } } });
    expect(changes).toEqual({
      graphics: [
        { type: 'setGridVisibility', payload: false },
        { type: 'setGridUnit', payload: { unit: 'in' } },
      ],
    });
  });

  it('should seed the resolution over the levels, never the raw record (V9)', () => {
    const view = record();
    const changes = foreignChanges(undefined, view, { levels: { person: { 'display.grid': false, fieldOfView: 0 } } });
    expect(changes.graphics).toContainEqual({ type: 'setGridVisibility', payload: false });
    expect(changes.camera?.verticalFieldOfView).toBe(0);
    // An exception keeps the view's own format value.
    const kept = foreignChanges(undefined, view, {
      levels: { person: { 'display.grid': false }, exceptions: ['display.grid'] },
    });
    expect(kept.graphics).toContainEqual({ type: 'setGridVisibility', payload: true });
  });

  it('should seed only the leaves a change of levels moves, for the same record (V4 mechanism)', () => {
    const view = record({ display: { ...record().display, axes: false } });
    const changes = foreignChanges(view, view, {
      levels: { person: { 'display.grid': false, 'display.axes': true } },
      previousLevels: {},
    });
    // The view sets its axes off, so the person's default does not reach them.
    expect(changes).toEqual({ graphics: [{ type: 'setGridVisibility', payload: false }] });
  });

  it('should turn a preset into an orientation, with its up direction', () => {
    const changes = foreignChanges(record(), record({ camera: { kind: 'preset', preset: 'front' } }));
    expect(changes.camera).toEqual({ orientation: { direction: [0, -1, 0], up: [0, 0, 1] } });
  });

  it('should carry field of view and up direction in the camera adoption', () => {
    const changes = foreignChanges(record(), record({ fieldOfView: 30, upDirection: 'y' }));
    expect(changes.camera).toEqual({ verticalFieldOfView: 30, upDirection: 'y' });
    expect(changes.graphics).toEqual([{ type: 'setUpDirection', payload: 'y' }]);
  });

  it('should read the selected kernel view camera', () => {
    const before = record({ selectedKernelView: 'a', kernelViews: [{ id: 'a', camera: pose }] });
    const moved = { ...pose, verticalSpan: 9 };
    const changes = foreignChanges(before, record({ ...before, kernelViews: [{ id: 'a', camera: moved }] }));
    expect(changes.camera?.pose?.verticalSpan).toBe(9);
    // The default camera is not the view's camera while a kernel view is selected.
    expect(foreignChanges(before, record({ ...before, camera: moved })).camera).toBeUndefined();
  });
});

describe('nextRecord', () => {
  it('should write the owners over the base and keep what no owner holds', () => {
    const base = record({ name: 'Front', camera: { kind: 'preset', preset: 'front' } });
    const next = nextRecord({ ...ownersOf(base), section: { active: true, cuts: [] } }, base);
    expect(next).toEqual({ ...base, section: { active: true, cuts: [] } });
  });

  it('should keep the ten inheritable leaves exactly as the base holds them (V6)', () => {
    const base = record({
      fieldOfView: 40,
      upDirection: 'y',
      display: { ...record().display, grid: false, postProcessing: true },
      grid: { unit: 'in' },
    });
    const { kind: _kind, ...view } = pose;
    const next = nextRecord({ ...ownersOf(base), camera: view, measurements: [] }, base);
    expect(next).toMatchObject({ camera: pose });
    expect([next.fieldOfView, next.upDirection, next.display, next.grid]).toEqual([
      base.fieldOfView,
      base.upDirection,
      base.display,
      base.grid,
    ]);
  });

  it('should keep the base camera unless a person made it', () => {
    const base = record({ camera: { kind: 'preset', preset: 'front' }, fieldOfView: 40 });
    expect(nextRecord(ownersOf(base), base)).toEqual(base);
  });

  it('should write the camera into the selected kernel view', () => {
    const base = record({ selectedKernelView: 'b', kernelViews: [{ id: 'a', camera: pose }] });
    const { kind: _kind, ...view } = pose;
    const next = nextRecord({ ...ownersOf(base), camera: { ...view, verticalSpan: 7 } }, base);
    expect(next.camera).toEqual(base.camera);
    expect(next.kernelViews).toEqual([
      { id: 'a', camera: pose },
      { id: 'b', camera: { ...pose, verticalSpan: 7 } },
    ]);
  });
});
