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
    const changes = foreignChanges(undefined, first, undefined);
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
    const changes = foreignChanges(before, record({ grid: { unit: 'in' } }), undefined);
    expect(changes).toEqual({ graphics: [{ type: 'setGridUnit', payload: { unit: 'in' } }] });
  });

  it('should ask nothing for a record published again', () => {
    const before = record({ camera: pose });
    expect(foreignChanges(before, structuredClone(before), undefined)).toEqual({ graphics: [] });
  });

  it('should never adopt a field the acknowledged patch carries', () => {
    const before = record();
    const next = record({ grid: { unit: 'in' }, camera: pose, display: { ...before.display, grid: false } });
    const changes = foreignChanges(before, next, { grid: { unit: 'in' }, camera: next.camera });
    expect(changes).toEqual({ graphics: [{ type: 'setGridVisibility', payload: false }] });
  });

  it('should turn a preset into an orientation, with its up direction', () => {
    const changes = foreignChanges(record(), record({ camera: { kind: 'preset', preset: 'front' } }), undefined);
    expect(changes.camera).toEqual({ orientation: { direction: [0, -1, 0], up: [0, 0, 1] } });
  });

  it('should carry field of view and up direction in the camera adoption', () => {
    const changes = foreignChanges(record(), record({ fieldOfView: 30, upDirection: 'y' }), undefined);
    expect(changes.camera).toEqual({ verticalFieldOfView: 30, upDirection: 'y' });
    expect(changes.graphics).toEqual([{ type: 'setUpDirection', payload: 'y' }]);
  });

  it('should read the selected kernel view camera', () => {
    const before = record({ selectedKernelView: 'a', kernelViews: [{ id: 'a', camera: pose }] });
    const moved = { ...pose, verticalSpan: 9 };
    const changes = foreignChanges(before, record({ ...before, kernelViews: [{ id: 'a', camera: moved }] }), undefined);
    expect(changes.camera?.pose?.verticalSpan).toBe(9);
    // The default camera is not the view's camera while a kernel view is selected.
    expect(foreignChanges(before, record({ ...before, camera: moved }), undefined).camera).toBeUndefined();
  });
});

describe('nextRecord', () => {
  it('should write the owners over the base and keep what no owner holds', () => {
    const base = record({ name: 'Front', camera: { kind: 'preset', preset: 'front' } });
    const next = nextRecord({ ...ownersOf(base), gridUnit: 'cm', upDirection: 'y' }, base);
    expect(next).toEqual({ ...base, grid: { unit: 'cm' }, upDirection: 'y' });
  });

  it('should keep the base camera and field of view unless a person made them', () => {
    const base = record({ camera: { kind: 'preset', preset: 'front' }, fieldOfView: 40 });
    expect(nextRecord(ownersOf(base), base)).toEqual(base);
    const { kind: _kind, ...view } = pose;
    expect(nextRecord({ ...ownersOf(base), camera: view, fieldOfView: 20 }, base)).toMatchObject({
      camera: pose,
      fieldOfView: 20,
    });
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

  it('should keep the record unit for a grid unit the record cannot hold', () => {
    const base = record({ grid: { unit: 'in' } });
    expect(nextRecord({ ...ownersOf(base), gridUnit: 'µm' }, base).grid).toEqual({ unit: 'in' });
  });
});
