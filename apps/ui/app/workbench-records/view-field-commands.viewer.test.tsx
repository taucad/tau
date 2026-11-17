// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viewFieldPaths, workbenchRecords } from '@taucad/workbench';
import { viewerViewFieldPaths } from '@taucad/viewer/cad/viewer-view-fields';
import type { WorkbenchView } from '@taucad/workbench';
import { personRecordStores } from '#preferences/person-record.store.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

const state = vi.hoisted(() => ({
  viewerControls: true,
  capture: vi.fn<(event: string, properties?: Readonly<Record<string, unknown>>) => void>(),
  edit: vi.fn(async (_viewId: string, _change: (current: unknown) => unknown) => true),
  viewRecords: new Map<string, unknown>(),
}));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => flag === 'viewerControls' && state.viewerControls,
  subscribeFeatureFlags: () => () => undefined,
}));
vi.mock('#flags/feature-flags.js', () => ({
  isFeatureEnabled: (flag: string) => flag === 'viewerControls' && state.viewerControls,
}));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture: state.capture }) }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'project-a', viewRecords: state.viewRecords }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({ useWorkbenchViewCommands: () => ({ edit: state.edit }) }));

const { useViewerViewFieldCommands } = await import('#workbench-records/view-field-commands.js');

const base = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
/* The view sets the grid off and the unit to inches; the person sets axes off and the grid on by default. */
const record: WorkbenchView = { ...base, display: { ...base.display, grid: false }, grid: { unit: 'in' } };

const mount = () => renderHook(() => useViewerViewFieldCommands({ viewId: 'view-1', entryPath: 'main.ts' }));
const events = (name: string): unknown[] =>
  state.capture.mock.calls.filter(([event]) => event === name).map(([, properties]) => properties);

beforeEach(() => {
  localStorage.clear();
  state.viewerControls = true;
  state.capture.mockReset();
  state.edit.mockClear();
  state.viewRecords = new Map([['view-1', record]]);
  personRecordStores.viewer.write({ viewDefaults: { 'display.axes': false, 'display.grid': true } });
});

describe("a view's menu states (T5.3, V5)", () => {
  it('tells the menu where each leaf comes from and what Reset returns it to', () => {
    const { result } = mount();
    const fields = result.current!;
    expect(fields.sourceOf?.('display.grid')).toBe('view');
    expect(fields.sourceOf?.('grid.unit')).toBe('view');
    expect(fields.sourceOf?.('display.axes')).toBe('person');
    expect(fields.sourceOf?.('display.lines')).toBe('tau');
    expect(fields.inheritsFrom?.('display.grid')).toBe('person');
    expect(fields.inheritsFrom?.('grid.unit')).toBe('tau');
    expect(fields.inheritsFrom?.('upDirection')).toBe('tau');
  });

  it('counts a leaf this device lists as set in the view at its format value', () => {
    viewExceptions.add('project-a', 'view-1', 'display.lines');
    const { result } = mount();
    expect(result.current?.sourceOf?.('display.lines')).toBe('view');
  });

  it('follows a change to the person’s defaults', () => {
    const { result } = mount();
    expect(result.current?.sourceOf?.('display.matcap')).toBe('tau');
    act(() => {
      personRecordStores.viewer.write({ viewDefaults: { 'display.matcap': true } });
    });
    expect(result.current?.sourceOf?.('display.matcap')).toBe('person');
  });

  it('reports a set and a reset with level view', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current?.set('display.lines', false);
    });
    act(() => {
      result.current?.reset('display.grid');
    });
    expect(events('viewer_default_changed')).toEqual([{ level: 'view', field: 'display.lines' }]);
    expect(events('viewer_override_reset')).toEqual([{ level: 'view', field: 'display.grid' }]);
  });

  it('gives the menu no sources and reports nothing with the flag off', async () => {
    state.viewerControls = false;
    const { result } = mount();
    const fields = result.current!;
    expect(fields.sourceOf).toBeUndefined();
    expect(fields.inheritsFrom).toBeUndefined();
    await act(async () => {
      await fields.set('display.lines', false);
    });
    expect(state.capture).not.toHaveBeenCalled();
    expect(state.edit).toHaveBeenCalled();
  });

  it('counts over the same leaves as the workbench record', () => {
    expect(viewerViewFieldPaths).toEqual(viewFieldPaths);
  });
});
