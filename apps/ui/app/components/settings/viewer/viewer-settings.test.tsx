// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { resolveViewSettings, tauViewDefaults, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { metaConfig } from '#constants/meta.constants.js';
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
const { viewerPersonPropertyNames } = await import('#components/settings/viewer/viewer-person-properties.js');

const renderSection = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <ViewerSettings />
    </TooltipProvider>,
  );

const row = (title: string): HTMLElement => screen.getByRole('group', { name: title });
const viewDefaults = (): Readonly<Record<string, unknown>> => personRecordStores.viewer.read().viewDefaults;
const fieldOfView = (): HTMLElement =>
  within(row('Projection')).getByRole('spinbutton', { name: 'Field of view, 0° is orthographic' });

/* Radix Select opens from the keyboard in jsdom, which models no pointer capture. */
const choose = async (label: string, option: string): Promise<void> => {
  screen.getByRole('combobox', { name: label }).focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`, 'u') }));
};

/* A `$set` capture as PostHog receives it, named as analytics names the property. */
const personProperties = (property: keyof typeof viewerPersonPropertyNames, value: string): unknown => ({
  $set: { [viewerPersonPropertyNames[property]]: value },
});

const events = (name: string): unknown[] =>
  state.capture.mock.calls.filter(([event]) => event === name).map(([, properties]) => properties);

beforeEach(() => {
  localStorage.clear();
  state.capture.mockReset();
  state.os = 'macos';
  state.viewerControls = true;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('View defaults (V4)', () => {
  it('lists six rows, and no up axis, surfaces, edges or post-processing', () => {
    renderSection();
    for (const title of ['Projection', 'Show gizmo', 'Grid', 'Axes', 'Matcap', 'Grid unit']) {
      expect(row(title)).toBeInTheDocument();
    }
    for (const title of ['Up axis', 'Surfaces', 'Edges', 'Post-processing']) {
      expect(screen.queryByRole('group', { name: title })).not.toBeInTheDocument();
    }
  });

  it('shows Tau’s values with no dot, and Reset all is disabled while nothing is set', () => {
    renderSection();
    expect(within(row('Grid')).getByRole('switch', { name: 'Grid' })).toBeChecked();
    expect(within(row('Matcap')).getByRole('switch', { name: 'Matcap' })).not.toBeChecked();
    expect(fieldOfView()).toHaveAttribute('aria-valuenow', '60');
    expect(within(row('Projection')).getByText('Field of view')).toBeInTheDocument();
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

  it('uses the editor’s field-of-view slider: typing 0 stores orthographic, and arrow keys step the angle', async () => {
    renderSection();
    await userEvent.click(fieldOfView());
    await userEvent.clear(fieldOfView());
    await userEvent.type(fieldOfView(), '0{Enter}');
    expect(viewDefaults()).toEqual({ fieldOfView: 0 });
    expect(within(row('Projection')).getByText('Orthographic')).toBeInTheDocument();
    await userEvent.click(fieldOfView());
    await userEvent.keyboard('{ArrowUp}');
    expect(viewDefaults()).toEqual({ fieldOfView: 1 });
  });

  it('ignores a typed angle that matches the shown one, and clamps one past 90°', async () => {
    renderSection();
    await userEvent.click(fieldOfView());
    await userEvent.keyboard('{Enter}');
    expect(viewDefaults()).toEqual({});
    await userEvent.click(fieldOfView());
    await userEvent.clear(fieldOfView());
    await userEvent.type(fieldOfView(), '120{Enter}');
    expect(viewDefaults()).toEqual({ fieldOfView: 90 });
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
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tau could not save this on this device. It applies until you close Tau',
    );
    expect(within(row('Grid')).getByRole('switch', { name: 'Grid' })).not.toBeChecked();
    // Nothing is blocked; a later write that saves stores both.
    setItem.mockRestore();
    await userEvent.click(within(row('Axes')).getByRole('switch', { name: 'Axes' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(viewDefaults()).toEqual({ 'display.grid': false, 'display.axes': false });
  });
});

describe('Navigation and Gizmo (V2, V3, M2)', () => {
  it('shows the tool answer’s suggestion until one is chosen, and Reset returns to it', async () => {
    personRecordStores.profile.write({ tool: 'solidworks' });
    renderSection();
    const select = (): HTMLElement => screen.getByRole('combobox', { name: 'Mouse controls' });
    expect(select()).toHaveTextContent('Middle-drag orbit, Ctrl pan');
    expect(personRecordStores.viewer.read().controls.preset).toBeUndefined();
    await choose('Mouse controls', 'Right-drag orbit');
    expect(personRecordStores.viewer.read().controls.preset).toBe('right-orbit');
    expect(events('viewer_preset_selected')).toEqual([{ preset: 'right-orbit', suggested: false, source: 'settings' }]);
    expect(events('$set')).toEqual([personProperties('mousePreset', 'right-orbit')]);
    await userEvent.click(within(row('Mouse controls')).getByRole('button', { name: 'Reset to the suggestion' }));
    expect(personRecordStores.viewer.read().controls.preset).toBeUndefined();
    expect(select()).toHaveTextContent('Middle-drag orbit, Ctrl pan');
    expect(events('$set').at(-1)).toEqual(personProperties('mousePreset', 'middle-ctrl'));
    // With no preset stored, a changed tool answer moves the shown preset (C9).
    act(() => {
      personRecordStores.profile.write({ tool: 'fusion' });
    });
    expect(select()).toHaveTextContent('Middle-drag pan, Shift orbit');
  });

  it('lists the six presets with the suggestion marked, and reports choosing it as suggested', async () => {
    personRecordStores.profile.write({ tool: 'blender' });
    renderSection();
    screen.getByRole('combobox', { name: 'Mouse controls' }).focus();
    await userEvent.keyboard('{Enter}');
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Tau default',
      'Right-drag orbit',
      'Middle-drag orbit, Ctrl pan',
      'Middle-drag orbit, Shift panSuggested',
      'Middle-drag pan, Shift orbit',
      'Alt-drag navigation',
    ]);
    await userEvent.click(options[0]!);
    await choose('Mouse controls', 'Middle-drag orbit, Shift pan');
    expect(events('viewer_preset_selected')).toEqual([
      { preset: 'tau', suggested: false, source: 'settings' },
      { preset: 'middle-shift', suggested: true, source: 'settings' },
    ]);
  });

  it('resets to Tau’s default with no tool answer', async () => {
    renderSection();
    await choose('Mouse controls', 'Alt-drag navigation');
    await userEvent.click(within(row('Mouse controls')).getByRole('button', { name: 'Reset to Tau default' }));
    expect(screen.getByRole('combobox', { name: 'Mouse controls' })).toHaveTextContent('Tau default');
  });

  it('notes the Alt preset’s window-manager hazard on Linux only (C14)', () => {
    state.os = 'linux';
    personRecordStores.viewer.write({ controls: { preset: 'alt' } });
    const linux = renderSection();
    expect(within(row('Mouse controls')).getByText(/Alt-drag to move windows/u)).toBeInTheDocument();
    linux.unmount();
    state.os = 'windows';
    renderSection();
    expect(screen.queryByText(/Alt-drag to move windows/u)).not.toBeInTheDocument();
  });

  it('shows the toggles’ built-in values while unset and stores a value when changed', async () => {
    renderSection();
    expect(screen.getByRole('switch', { name: 'Zoom to cursor' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Orbit around cursor' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Invert zoom' })).not.toBeChecked();
    expect(personRecordStores.viewer.read().controls).toEqual({});
    await userEvent.click(screen.getByRole('switch', { name: 'Zoom to cursor' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Orbit around cursor' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Invert zoom' }));
    expect(personRecordStores.viewer.read().controls).toEqual({
      zoomToCursor: false,
      orbitAboutCursor: true,
      invertZoom: true,
    });
  });

  it('names the person properties as setup and analytics do', () => {
    expect(viewerPersonPropertyNames).toEqual({ mousePreset: 'mouse_preset', gizmoStyle: 'gizmo_style' });
  });

  it('has no trackpad gestures row', () => {
    renderSection();
    expect(screen.queryByRole('group', { name: 'Trackpad gestures' })).not.toBeInTheDocument();
    expect(screen.queryByText('This device')).not.toBeInTheDocument();
  });

  it('lists the four gizmo styles with the suggestion marked', async () => {
    personRecordStores.profile.write({ tool: 'game-engine' });
    renderSection();
    expect(screen.getByRole('combobox', { name: 'Gizmo style' })).toHaveTextContent('Axis balls');
    screen.getByRole('combobox', { name: 'Gizmo style' }).focus();
    await userEvent.keyboard('{Enter}');
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Cube',
      'Classic cube',
      'Axis ballsSuggested',
      'Axes',
    ]);
  });

  it('stores a gizmo style without touching Show gizmo, and Show gizmo without touching the style', async () => {
    personRecordStores.profile.write({ tool: 'blender' });
    renderSection();
    await userEvent.click(within(row('Show gizmo')).getByRole('switch', { name: 'Show gizmo' }));
    expect(personRecordStores.viewer.read().gizmo).toEqual({});
    expect(viewDefaults()).toEqual({ 'display.gizmo': false });
    await choose('Gizmo style', 'Classic cube');
    expect(personRecordStores.viewer.read().gizmo).toEqual({ style: 'classic-cube' });
    expect(viewDefaults()).toEqual({ 'display.gizmo': false });
    expect(events('viewer_gizmo_selected')).toEqual([{ style: 'classic-cube', suggested: false, source: 'settings' }]);
    expect(events('$set')).toEqual([personProperties('gizmoStyle', 'classic-cube')]);
    await userEvent.click(within(row('Show gizmo')).getByRole('switch', { name: 'Show gizmo' }));
    expect(personRecordStores.viewer.read().gizmo).toEqual({ style: 'classic-cube' });
    expect(viewDefaults()).toEqual({ 'display.gizmo': true });
    await userEvent.click(within(row('Gizmo style')).getByRole('button', { name: 'Reset to the suggestion' }));
    expect(personRecordStores.viewer.read().gizmo).toEqual({});
    expect(viewDefaults()).toEqual({ 'display.gizmo': true });
  });

  it('follows a change another tab stores, without a reload', () => {
    renderSection();
    act(() => {
      const name = `${metaConfig.cookiePrefix}${cookieName.viewerPreferences}`;
      localStorage.setItem(
        name,
        JSON.stringify({ value: { version: 1, controls: { preset: 'shift-middle' }, gizmo: {}, viewDefaults: {} } }),
      );
      globalThis.dispatchEvent(new StorageEvent('storage', { key: name }));
    });
    expect(screen.getByRole('combobox', { name: 'Mouse controls' })).toHaveTextContent('Middle-drag pan, Shift orbit');
  });
});
