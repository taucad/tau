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
import { ViewerSettings } from '@taucad/settings-ui/components/settings/viewer/viewer-settings';
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
  useFeature: () => false,
  useFeatureState: (flag: string) => (flag === 'viewerControls' && state.viewerControls ? 'on' : 'off'),
  subscribeFeatureFlags: () => () => undefined,
}));
vi.mock('#flags/feature-flags.js', () => ({
  isFeatureEnabled: () => false,
  readFeatureState: (flag: string) => (flag === 'viewerControls' && state.viewerControls ? 'on' : 'off'),
}));

const { PersonSettingsHost } = await import('#components/settings/person-settings-host.js');
const { viewerPersonPropertyNames } =
  await import('@taucad/settings-ui/components/settings/viewer/viewer-person-properties');

/* Settings → Viewer over this device's person record, as the settings dialog composes it. */
const renderSection = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <PersonSettingsHost>
        <ViewerSettings />
      </PersonSettingsHost>
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
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Settings → Viewer over the person record', () => {
  it('reports a choice through onboarding telemetry and sets the person property through analytics', async () => {
    personRecordStores.profile.write({ tool: 'solidworks' });
    renderSection();
    await choose('Mouse controls', 'Right-drag orbit');
    expect(personRecordStores.viewer.read().controls.preset).toBe('right-orbit');
    expect(events('viewer_preset_selected')).toEqual([{ preset: 'right-orbit', suggested: false, source: 'settings' }]);
    expect(events('$set')).toEqual([{ $set: { [viewerPersonPropertyNames.mousePreset]: 'right-orbit' } }]);
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(events('viewer_default_changed')).toEqual([{ level: 'person', field: 'display.grid' }]);
    await userEvent.click(within(row('Grid')).getByRole('button', { name: 'Reset to Tau default' }));
    expect(events('viewer_override_reset')).toEqual([{ level: 'person', field: 'display.grid' }]);
  });

  it('notes the Alt preset’s window-manager hazard from this device’s OS class (C14)', () => {
    state.os = 'linux';
    personRecordStores.viewer.write({ controls: { preset: 'alt' } });
    const linux = renderSection();
    expect(within(row('Mouse controls')).getByText(/Alt-drag to move windows/u)).toBeInTheDocument();
    linux.unmount();
    state.os = 'windows';
    renderSection();
    expect(screen.queryByText(/Alt-drag to move windows/u)).not.toBeInTheDocument();
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
        <PersonSettingsHost>
          <ViewerSettings />
        </PersonSettingsHost>
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

  it('shows Turntable, with nothing to reset, for an orbit style stored as the retired Tumble', () => {
    localStorage.setItem(
      `${metaConfig.cookiePrefix}${cookieName.viewerPreferences}`,
      JSON.stringify({
        value: { version: 1, controls: { preset: 'alt', orbitStyle: 'tumble' }, gizmo: {}, viewDefaults: {} },
      }),
    );
    renderSection();
    expect(screen.getByRole('combobox', { name: 'Orbit style' })).toHaveTextContent('Turntable');
    expect(within(row('Orbit style')).queryByRole('button', { name: /Reset to Tau default/u })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mouse controls' })).toHaveTextContent('Alt-drag navigation');
    expect(personRecordStores.viewer.read().controls).toEqual({ preset: 'alt' });
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
