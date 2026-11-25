import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { personProfileSection, viewerPreferencesSection } from '@taucad/preferences';
import type { LeafPatch, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PersonSettingsProvider } from '#components/settings/person-settings.js';
import type { PersonSettings, PersonSettingsWriteResult } from '#components/settings/person-settings.js';
import { ViewerSettings } from '#components/settings/viewer/viewer-settings.js';
import { viewerPersonPropertyNames } from '#components/settings/viewer/viewer-person-properties.js';

/* The host's person record, in memory: each write merges as the stored section does and answers `result`. */
const record = {
  profile: personProfileSection.empty,
  viewer: viewerPreferencesSection.empty,
  result: 'saved' as PersonSettingsWriteResult,
};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};
const writeProfile = (patch: LeafPatch<PersonProfile>): PersonSettingsWriteResult => {
  record.profile = personProfileSection.schema.parse(personProfileSection.merge(record.profile, patch));
  notify();
  return record.result;
};
const writeViewer = (patch: LeafPatch<ViewerPreferences>): PersonSettingsWriteResult => {
  record.viewer = viewerPreferencesSection.schema.parse(viewerPreferencesSection.merge(record.viewer, patch));
  notify();
  return record.result;
};

const host = {
  capture: vi.fn<(event: string, properties?: Readonly<Record<string, unknown>>) => void>(),
  os: 'macos',
  telemetry: {
    viewerPresetSelected: vi.fn<PersonSettings['telemetry']['viewerPresetSelected']>(),
    viewerGizmoSelected: vi.fn<PersonSettings['telemetry']['viewerGizmoSelected']>(),
    viewerDefaultChanged: vi.fn<PersonSettings['telemetry']['viewerDefaultChanged']>(),
    viewerOverrideReset: vi.fn<PersonSettings['telemetry']['viewerOverrideReset']>(),
    setupAnswersCleared: vi.fn<PersonSettings['telemetry']['setupAnswersCleared']>(),
  },
};
const analytics = { capture: host.capture };
const osClass = (): string => host.os;

function Host({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const profile = useSyncExternalStore(subscribe, () => record.profile);
  const viewer = useSyncExternalStore(subscribe, () => record.viewer);
  const value = useMemo<PersonSettings>(
    () => ({ profile, viewer, writeProfile, writeViewer, telemetry: host.telemetry, analytics, osClass }),
    [profile, viewer],
  );
  return <PersonSettingsProvider value={value}>{children}</PersonSettingsProvider>;
}

const renderSection = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <Host>
        <ViewerSettings />
      </Host>
    </TooltipProvider>,
  );

const row = (title: string): HTMLElement => screen.getByRole('group', { name: title });
const viewDefaults = (): Readonly<Record<string, unknown>> => record.viewer.viewDefaults;
const fieldOfView = (): HTMLElement => within(row('Projection')).getByRole('spinbutton', { name: 'Projection' });

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

const personPropertySets = (): unknown[] =>
  host.capture.mock.calls.filter(([event]) => event === '$set').map(([, properties]) => properties);

const inputs = <Input,>(emitter: { readonly mock: { readonly calls: ReadonlyArray<readonly [Input]> } }): Input[] =>
  emitter.mock.calls.map(([input]) => input);

beforeEach(() => {
  record.profile = personProfileSection.empty;
  record.viewer = viewerPreferencesSection.empty;
  record.result = 'saved';
  host.os = 'macos';
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
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
    expect(inputs(host.telemetry.viewerDefaultChanged)).toEqual([{ level: 'person', field: 'display.grid' }]);
    // Set at this level whatever the value: only Reset removes it.
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(viewDefaults()).toEqual({ 'display.grid': true });
    expect(screen.getByRole('button', { name: 'Reset all' })).toBeEnabled();
    await userEvent.click(within(row('Grid')).getByRole('button', { name: 'Reset to Tau default' }));
    expect(viewDefaults()).toEqual({});
    expect(inputs(host.telemetry.viewerOverrideReset)).toEqual([{ level: 'person', field: 'display.grid' }]);
    expect(within(row('Grid')).queryByRole('button', { name: 'Reset to Tau default' })).not.toBeInTheDocument();
  });

  it('resets every set leaf with Reset all', async () => {
    renderSection();
    await userEvent.click(within(row('Axes')).getByRole('switch', { name: 'Axes' }));
    await userEvent.click(within(row('Matcap')).getByRole('switch', { name: 'Matcap' }));
    expect(viewDefaults()).toEqual({ 'display.axes': false, 'display.matcap': true });
    await userEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(viewDefaults()).toEqual({});
    expect(inputs(host.telemetry.viewerOverrideReset)).toEqual([
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

  it('shows the status line while the host does not save a write, and a later saved write clears it', async () => {
    renderSection();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    record.result = 'refused';
    await userEvent.click(within(row('Grid')).getByRole('switch', { name: 'Grid' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tau could not save this on this device. It applies until you close Tau',
    );
    expect(within(row('Grid')).getByRole('switch', { name: 'Grid' })).not.toBeChecked();
    record.result = 'saved';
    await userEvent.click(within(row('Axes')).getByRole('switch', { name: 'Axes' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('Navigation and Gizmo (V2, V3, M2)', () => {
  it('shows the tool answer’s suggestion until one is chosen, and Reset returns to it', async () => {
    writeProfile({ tool: 'solidworks' });
    renderSection();
    const select = (): HTMLElement => screen.getByRole('combobox', { name: 'Mouse controls' });
    expect(select()).toHaveTextContent('Middle-drag orbit, Ctrl pan');
    expect(record.viewer.controls.preset).toBeUndefined();
    await choose('Mouse controls', 'Right-drag orbit');
    expect(record.viewer.controls.preset).toBe('right-orbit');
    expect(inputs(host.telemetry.viewerPresetSelected)).toEqual([
      { preset: 'right-orbit', suggested: false, source: 'settings' },
    ]);
    expect(personPropertySets()).toEqual([personProperties('mousePreset', 'right-orbit')]);
    await userEvent.click(within(row('Mouse controls')).getByRole('button', { name: 'Reset to the suggestion' }));
    expect(record.viewer.controls.preset).toBeUndefined();
    expect(select()).toHaveTextContent('Middle-drag orbit, Ctrl pan');
    expect(personPropertySets().at(-1)).toEqual(personProperties('mousePreset', 'middle-ctrl'));
    // With no preset stored, a changed tool answer moves the shown preset (C9).
    act(() => {
      writeProfile({ tool: 'fusion' });
    });
    expect(select()).toHaveTextContent('Middle-drag pan, Shift orbit');
  });

  it('lists the six presets with the suggestion marked, and reports choosing it as suggested', async () => {
    writeProfile({ tool: 'blender' });
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
    expect(inputs(host.telemetry.viewerPresetSelected)).toEqual([
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
    host.os = 'linux';
    writeViewer({ controls: { preset: 'alt' } });
    const linux = renderSection();
    expect(within(row('Mouse controls')).getByText(/Alt-drag to move windows/u)).toBeInTheDocument();
    linux.unmount();
    host.os = 'windows';
    renderSection();
    expect(screen.queryByText(/Alt-drag to move windows/u)).not.toBeInTheDocument();
  });

  it('shows the toggles’ built-in values while unset and stores a value when changed', async () => {
    renderSection();
    expect(screen.getByRole('switch', { name: 'Zoom to cursor' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Orbit around cursor' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Invert zoom' })).not.toBeChecked();
    expect(record.viewer.controls).toEqual({});
    await userEvent.click(screen.getByRole('switch', { name: 'Zoom to cursor' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Orbit around cursor' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Invert zoom' }));
    expect(record.viewer.controls).toEqual({
      zoomToCursor: false,
      orbitAboutCursor: true,
      invertZoom: true,
    });
  });

  it('shows Turntable while the orbit style is unset, stores Free orbit, and Reset returns to Turntable', async () => {
    renderSection();
    const orbit = screen.getByRole('combobox', { name: 'Orbit style' });
    expect(orbit).toHaveTextContent('Turntable');
    orbit.focus();
    await userEvent.keyboard('{Enter}');
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Turntable', 'Free orbit']);
    await userEvent.click(screen.getByRole('option', { name: 'Free orbit' }));
    expect(record.viewer.controls).toEqual({ orbitStyle: 'free' });
    expect(screen.getByRole('combobox', { name: 'Orbit style' })).toHaveTextContent('Free orbit');
    await userEvent.click(within(row('Orbit style')).getByRole('button', { name: /Reset to Tau default/u }));
    expect(record.viewer.controls).toEqual({});
    expect(screen.getByRole('combobox', { name: 'Orbit style' })).toHaveTextContent('Turntable');
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
    writeProfile({ tool: 'game-engine' });
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
    writeProfile({ tool: 'blender' });
    renderSection();
    await userEvent.click(within(row('Show gizmo')).getByRole('switch', { name: 'Show gizmo' }));
    expect(record.viewer.gizmo).toEqual({});
    expect(viewDefaults()).toEqual({ 'display.gizmo': false });
    await choose('Gizmo style', 'Classic cube');
    expect(record.viewer.gizmo).toEqual({ style: 'classic-cube' });
    expect(viewDefaults()).toEqual({ 'display.gizmo': false });
    expect(inputs(host.telemetry.viewerGizmoSelected)).toEqual([
      { style: 'classic-cube', suggested: false, source: 'settings' },
    ]);
    expect(personPropertySets()).toEqual([personProperties('gizmoStyle', 'classic-cube')]);
    await userEvent.click(within(row('Show gizmo')).getByRole('switch', { name: 'Show gizmo' }));
    expect(record.viewer.gizmo).toEqual({ style: 'classic-cube' });
    expect(viewDefaults()).toEqual({ 'display.gizmo': true });
    await userEvent.click(within(row('Gizmo style')).getByRole('button', { name: 'Reset to the suggestion' }));
    expect(record.viewer.gizmo).toEqual({});
    expect(viewDefaults()).toEqual({ 'display.gizmo': true });
  });
});
