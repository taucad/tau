// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { resolveViewSettings, tauViewDefaults, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { personRecordStores } from '#preferences/person-record.store.js';
import { useViewLevels } from '#workbench-records/view-levels.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

const state = vi.hoisted(() => ({
  capture: vi.fn<(event: string, properties?: Readonly<Record<string, unknown>>) => void>(),
  os: 'macos',
  viewerControls: true,
}));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture: state.capture }) }));
vi.mock('#telemetry/platform-class.js', () => ({ osClass: () => state.os }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => flag === 'viewerControls' && state.viewerControls,
  subscribeFeatureFlags: () => () => undefined,
}));
vi.mock('#flags/feature-flags.js', () => ({
  isFeatureEnabled: (flag: string) => flag === 'viewerControls' && state.viewerControls,
}));

const { ViewerSettings } = await import('#components/settings/viewer/viewer-settings.js');
const { resetSessionPerspectiveAngleForTesting } = await import('#components/settings/viewer/view-defaults-group.js');

const renderSection = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <ViewerSettings />
    </TooltipProvider>,
  );

const row = (title: string): HTMLElement => screen.getByRole('group', { name: title });
const viewDefaults = (): Readonly<Record<string, unknown>> => personRecordStores.viewer.read().viewDefaults;

/* Radix Select opens from the keyboard in jsdom, which models no pointer capture. */
const choose = async (label: string, option: string): Promise<void> => {
  screen.getByRole('combobox', { name: label }).focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`, 'u') }));
};

const events = (name: string): unknown[] =>
  state.capture.mock.calls.filter(([event]) => event === name).map(([, properties]) => properties);

beforeEach(() => {
  localStorage.clear();
  state.capture.mockReset();
  state.os = 'macos';
  state.viewerControls = true;
  resetSessionPerspectiveAngleForTesting();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('View defaults (V4)', () => {
  it('lists nine rows, one per leaf, and no up axis', () => {
    renderSection();
    for (const title of [
      'Projection',
      'Surfaces',
      'Edges',
      'Show gizmo',
      'Grid',
      'Axes',
      'Matcap',
      'Post-processing',
      'Grid unit',
    ]) {
      expect(row(title)).toBeInTheDocument();
    }
    expect(screen.queryByRole('group', { name: 'Up axis' })).not.toBeInTheDocument();
  });

  it('shows Tau’s values with no dot, and Reset all is disabled while nothing is set', () => {
    renderSection();
    expect(within(row('Grid')).getByRole('switch', { name: 'Grid' })).toBeChecked();
    expect(within(row('Matcap')).getByRole('switch', { name: 'Matcap' })).not.toBeChecked();
    expect(within(row('Projection')).getByRole('combobox', { name: 'Projection' })).toHaveTextContent('Perspective');
    expect(within(row('Grid unit')).getByRole('combobox', { name: 'Grid unit' })).toHaveTextContent('Millimeter');
    expect(screen.queryByRole('button', { name: 'Reset to Tau default' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset all' })).toBeDisabled();
  });

  it('stores a set leaf whatever its value, shows the dot, and the dot removes the leaf', async () => {
    renderSection();
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(viewDefaults()).toEqual({ 'display.grid': false });
    expect(events('viewer_default_changed')).toEqual([{ level: 'person', field: 'display.grid' }]);
    // Set at this level whatever the value: only Reset removes it.
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(viewDefaults()).toEqual({ 'display.grid': true });
    expect(screen.getByRole('button', { name: 'Reset all' })).toBeEnabled();
    await userEvent.click(within(row('Grid')).getByRole('button', { name: 'Reset to Tau default' }));
    expect(viewDefaults()).toEqual({});
    expect(events('viewer_override_reset')).toEqual([{ level: 'person', field: 'display.grid' }]);
    expect(within(row('Grid')).queryByRole('button', { name: 'Reset to Tau default' })).not.toBeInTheDocument();
  });

  it('resets every set leaf with Reset all', async () => {
    renderSection();
    await userEvent.click(within(row('Axes')).getByRole('switch', { name: 'Axes' }));
    await userEvent.click(within(row('Matcap')).getByRole('switch', { name: 'Matcap' }));
    expect(viewDefaults()).toEqual({ 'display.axes': false, 'display.matcap': true });
    await userEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(viewDefaults()).toEqual({});
    expect(events('viewer_override_reset')).toEqual([
      { level: 'person', field: 'display.axes' },
      { level: 'person', field: 'display.matcap' },
    ]);
    expect(screen.getByRole('button', { name: 'Reset all' })).toBeDisabled();
  });

  it('stores 0 for Orthographic, and Perspective restores the session’s last angle, or 60', async () => {
    renderSection();
    await choose('Projection', 'Orthographic');
    expect(viewDefaults()).toEqual({ fieldOfView: 0 });
    await choose('Projection', 'Perspective');
    expect(viewDefaults()).toEqual({ fieldOfView: 60 });
    act(() => {
      personRecordStores.viewer.write({ viewDefaults: { fieldOfView: 35 } });
    });
    await choose('Projection', 'Orthographic');
    await choose('Projection', 'Perspective');
    expect(viewDefaults()).toEqual({ fieldOfView: 35 });
  });

  it('stores a grid unit', async () => {
    renderSection();
    await choose('Grid unit', 'Inch');
    expect(viewDefaults()).toEqual({ 'grid.unit': 'in' });
  });

  it('moves every open view that does not set the leaf at once, and writes no view file', async () => {
    const inherits = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
    const sets: WorkbenchView = { ...inherits, display: { ...inherits.display, grid: false } };
    // The same file as `inherits`, but this device lists the grid as set in the view, at its format value.
    viewExceptions.add('project-a', 'pinned', 'display.grid');
    function OpenView({ viewId, record }: { readonly viewId: string; readonly record: WorkbenchView }) {
      const levels = useViewLevels('project-a', viewId);
      const grid = resolveViewSettings({ tau: tauViewDefaults, ...levels, view: record }).values['display.grid'];
      return <output aria-label={viewId}>{String(grid)}</output>;
    }
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <TooltipProvider>
        <ViewerSettings />
        <OpenView viewId='inherits' record={inherits} />
        <OpenView viewId='sets' record={sets} />
        <OpenView viewId='pinned' record={inherits} />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText('inherits')).toHaveTextContent('true');
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(screen.getByLabelText('inherits')).toHaveTextContent('false');
    expect(screen.getByLabelText('sets')).toHaveTextContent('false');
    expect(screen.getByLabelText('pinned')).toHaveTextContent('true');
    // The only write is the person's own section; no view file or exception is touched.
    expect(setItem.mock.calls.map(([name]) => name)).toEqual([expect.stringMatching(/viewer-preferences$/u)]);
  });

  it('does not apply the defaults to views while viewerControls is off', async () => {
    personRecordStores.viewer.write({ viewDefaults: { 'display.grid': false } });
    state.viewerControls = false;
    const inherits = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' });
    function OpenView() {
      const levels = useViewLevels('project-a', 'inherits');
      return (
        <output aria-label='inherits'>
          {String(resolveViewSettings({ tau: tauViewDefaults, ...levels, view: inherits }).values['display.grid'])}
        </output>
      );
    }
    render(<OpenView />);
    expect(screen.getByLabelText('inherits')).toHaveTextContent('true');
  });

  it('shows the status line when this device refuses the write, and keeps the value for this tab', async () => {
    renderSection();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await userEvent.click(within(row('Edges')).getByRole('switch', { name: 'Edges' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tau could not save this on this device. It applies until you close Tau',
    );
    expect(within(row('Edges')).getByRole('switch', { name: 'Edges' })).not.toBeChecked();
    // Nothing is blocked; a later write that saves stores both.
    setItem.mockRestore();
    await userEvent.click(within(row('Axes')).getByRole('switch', { name: 'Axes' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(viewDefaults()).toEqual({ 'display.lines': false, 'display.axes': false });
  });
});
