// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@taucad/ui/components/dropdown-menu';
import { KernelSettings, countChangedSettings, kernelSettingsGroups, withSetting } from '#cad/kernel-settings.jsx';

/** The OCCT render schema's tessellation: a preset or explicit tolerances, never both. */
const unionSchema = {
  type: 'object',
  properties: {
    tessellation: {
      default: 'medium',
      oneOf: [
        { type: 'string', title: 'Preset', enum: ['low', 'medium', 'high', 'extra-high'] },
        {
          type: 'object',
          title: 'Explicit',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            linearTolerance: { type: 'number', exclusiveMinimum: 0, examples: [0.02], 'x-tau-unit': 'mm' },
            angularTolerance: { type: 'number', exclusiveMinimum: 0, examples: [20], 'x-tau-unit': 'deg' },
          },
        },
      ],
    },
  },
};
const defaults = { tessellation: 'medium' };

const renderSettings = (values: Record<string, unknown>, onChange = vi.fn(), onReset = vi.fn()) => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Viewer settings</DropdownMenuTrigger>
      <DropdownMenuContent>
        <KernelSettings
          groups={kernelSettingsGroups(unionSchema, defaults)}
          values={values}
          defaults={defaults}
          onChange={onChange}
          onReset={onReset}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return { onChange, onReset };
};

/** Opens the Kernel settings sub-view from its row. */
const openKernelSettings = (): HTMLElement => {
  fireEvent.click(screen.getByRole('menuitem', { name: /^Kernel settings/u }));
  return screen.getByRole('group', { name: 'Kernel settings' });
};

const tessellation = (): HTMLElement => screen.getByRole('group', { name: 'Tessellation' });

describe('kernel settings for a preset-or-explicit union', () => {
  it('reads the union as one choice of the presets or the explicit tolerances', () => {
    const [group] = kernelSettingsGroups(unionSchema, defaults);
    expect(group?.label).toBe('Tessellation');
    expect(group?.fields).toEqual([
      expect.objectContaining({
        kind: 'choice',
        path: ['tessellation'],
        presets: ['low', 'medium', 'high', 'extra-high'],
        explicitSeed: { linearTolerance: 0.02, angularTolerance: 20 },
        explicitFields: [
          expect.objectContaining({ path: ['tessellation', 'linearTolerance'], unit: 'mm' }),
          expect.objectContaining({ path: ['tessellation', 'angularTolerance'], unit: '°' }),
        ],
      }),
    ]);
  });

  it('is one row reading Defaults, or how many settings are changed', () => {
    renderSettings({});
    expect(screen.getByRole('menuitem', { name: 'Kernel settings, Defaults' })).toHaveTextContent(
      /Kernel settingsDefaults$/u,
    );
    // No disclosure: the options open only as a sub-view.
    expect(screen.queryByRole('group', { name: 'Kernel settings' })).toBeNull();
  });

  it('reads “1 changed” on the row when a setting differs from its default', () => {
    renderSettings({ tessellation: 'high' });
    expect(screen.getByRole('menuitem', { name: 'Kernel settings, 1 changed' })).toBeInTheDocument();
  });

  it('opens under a Back row and a Tessellation heading, with one radio list of the presets and Custom', () => {
    renderSettings({ tessellation: 'high' });
    const view = openKernelSettings();
    expect(within(view).getByRole('menuitem', { name: 'Back to Options' })).toHaveTextContent(/^Back$/u);
    expect(within(view).getByText('Tessellation')).toBeVisible();
    expect(
      within(tessellation())
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Low', 'Medium', 'High', 'Extra high', 'Custom']);
    expect(within(tessellation()).getByRole('menuitemradio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('menuitem', { name: /^Linear tolerance/u })).toBeNull();
  });

  it('checks the kernel default preset when nothing is stored', () => {
    renderSettings({});
    openKernelSettings();
    expect(within(tessellation()).getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('checks Custom for a stored explicit object and shows its tolerances in their units', () => {
    renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    openKernelSettings();
    expect(within(tessellation()).getByRole('menuitemradio', { name: 'Custom' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Linear tolerance, 0.5mm' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Angular tolerance, 12°' })).toBeInTheDocument();
  });

  it('replaces the value whole when a preset is chosen, and stays open', () => {
    const { onChange } = renderSettings({ tessellation: 'low' });
    openKernelSettings();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Extra high' }));
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'extra-high' });
    expect(screen.getByRole('group', { name: 'Kernel settings' })).toBeVisible();
  });

  it('chooses Custom with the schema examples, never merged with the preset it leaves', () => {
    const { onChange } = renderSettings({ tessellation: 'high' });
    openKernelSettings();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Custom' }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ tessellation: { linearTolerance: 0.02, angularTolerance: 20 } });
    expect(screen.getByRole('group', { name: 'Kernel settings' })).toBeVisible();
  });

  it('drops the explicit tolerances whole when a preset is chosen from Custom', () => {
    const { onChange } = renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    openKernelSettings();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Medium' }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'medium' });
  });

  it('does nothing when the checked choice is chosen again', () => {
    const { onChange } = renderSettings({ tessellation: { linearTolerance: 0.5 } });
    openKernelSettings();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Custom' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits one explicit field by keyboard and keeps the other fields of the stored object only', () => {
    const { onChange } = renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    openKernelSettings();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Angular tolerance/u }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ tessellation: { linearTolerance: 0.5, angularTolerance: 13 } });
  });

  it('shows an unset explicit field at its example and stores only the field that was edited', () => {
    const { onChange } = renderSettings({ tessellation: { linearTolerance: 0.5 } });
    openKernelSettings();
    expect(screen.getByRole('menuitem', { name: 'Angular tolerance, 20°' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Linear tolerance/u }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ tessellation: { linearTolerance: 0.501 } });
  });

  it('reaches the choices with the menu keys and selects one with Enter', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings({ tessellation: 'medium' });
    openKernelSettings();
    act(() => {
      screen.getByRole('menuitemradio', { name: 'Medium' }).focus();
    });
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'High' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'high' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('ends with Reset to defaults under a separator, disabled while nothing is changed', () => {
    renderSettings({});
    const view = openKernelSettings();
    const reset = within(view).getByRole('menuitem', { name: 'Reset to defaults' });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(reset.querySelector('.lucide-rotate-ccw')).not.toBeNull();
    expect(reset.previousElementSibling).toHaveAttribute('role', 'separator');
    expect(view.lastElementChild).toBe(reset);
  });

  it('resets a changed setting from Reset to defaults and stays open', () => {
    const { onReset } = renderSettings({ tessellation: 'high' });
    const view = openKernelSettings();
    const reset = within(view).getByRole('menuitem', { name: 'Reset to defaults' });
    expect(reset).not.toHaveAttribute('aria-disabled');
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: 'Kernel settings' })).toBeVisible();
  });

  it('counts the choice as one change and never spreads a preset string into an explicit edit', () => {
    const groups = kernelSettingsGroups(unionSchema, defaults);
    expect(countChangedSettings(groups, { tessellation: { linearTolerance: 0.5 } }, defaults)).toBe(1);
    expect(countChangedSettings(groups, { tessellation: 'medium' }, defaults)).toBe(0);
    expect(withSetting({ values: {}, defaults }, ['tessellation', 'linearTolerance'], 0.1)).toEqual({
      tessellation: { linearTolerance: 0.1 },
    });
  });
});

/** A board view's options as the runtime derives them from Zod: optional string enums, no declared defaults. */
const enumSchema = {
  type: 'object',
  properties: {
    style: { type: 'string', title: 'Style', enum: ['presentation', 'technical'] },
    finish: {
      type: 'string',
      title: 'Pad finish',
      enum: ['enig', 'hasl', 'bare'],
      'x-tau-labels': { enig: 'ENIG', hasl: 'HASL' },
    },
    palette: { type: 'string', enum: ['fabrication', 'engineering'], default: 'fabrication' },
  },
};

const renderEnumSettings = (values: Record<string, unknown>, onChange = vi.fn()) => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Viewer settings</DropdownMenuTrigger>
      <DropdownMenuContent>
        <KernelSettings
          groups={kernelSettingsGroups(enumSchema, {})}
          values={values}
          defaults={{}}
          onChange={onChange}
          onReset={vi.fn()}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  openKernelSettings();
  return onChange;
};

const openSubmenu = async (name: RegExp): Promise<HTMLElement> => {
  const trigger = screen.getByRole('menuitem', { name });
  act(() => {
    trigger.focus();
  });
  // A submenu is a sub-view of the menu: Enter opens it in place (UX policy §7).
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('group', { name: trigger.getAttribute('aria-label')?.split(',')[0] });
};

describe('kernel settings for a string enum', () => {
  it('reads each string enum as one dropdown row with its labels', () => {
    const [group] = kernelSettingsGroups(enumSchema, {});
    expect(group?.fields).toEqual([
      {
        kind: 'enum',
        path: ['style'],
        label: 'Style',
        values: [
          { value: 'presentation', label: 'Presentation' },
          { value: 'technical', label: 'Technical' },
        ],
        defaultValue: undefined,
      },
      {
        kind: 'enum',
        path: ['finish'],
        label: 'Pad finish',
        values: [
          { value: 'enig', label: 'ENIG' },
          { value: 'hasl', label: 'HASL' },
          { value: 'bare', label: 'Bare' },
        ],
        defaultValue: undefined,
      },
      {
        kind: 'enum',
        path: ['palette'],
        label: 'Palette',
        values: [
          { value: 'fabrication', label: 'Fabrication' },
          { value: 'engineering', label: 'Engineering' },
        ],
        defaultValue: 'fabrication',
      },
    ]);
  });

  it('never reads a mixed or non-string enum as a dropdown', () => {
    const groups = kernelSettingsGroups(
      { type: 'object', properties: { mixed: { enum: ['a', 1] }, numbers: { type: 'number', enum: [1, 2] } } },
      {},
    );
    expect(groups.flatMap((group) => group.fields).map((field) => field.kind)).toEqual(['number']);
  });

  it('shows the current value on each row, Default for an unset value the kernel resolves', () => {
    renderEnumSettings({ finish: 'hasl' });
    expect(screen.getByRole('menuitem', { name: 'Style, Default' })).toHaveTextContent('StyleDefault');
    expect(screen.getByRole('menuitem', { name: 'Pad finish, HASL' })).toBeInTheDocument();
    // A declared default shows as itself, with no Default entry.
    expect(screen.getByRole('menuitem', { name: 'Palette, Fabrication' })).toBeInTheDocument();
  });

  it('opens the values as a sub-view and sets the chosen one, keeping the other settings', async () => {
    const onChange = renderEnumSettings({ finish: 'hasl' });
    const style = await openSubmenu(/^Style/);
    expect(
      within(style)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Default', 'Presentation', 'Technical']);
    // One view deeper, under its own Back row and a heading naming the setting.
    expect(within(style).getByRole('menuitem', { name: 'Back to Kernel settings' })).toHaveTextContent(/^Back$/u);
    expect(within(style).getByText('Style')).toBeVisible();
    expect(within(style).getByRole('menuitemradio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(style).getByRole('menuitemradio', { name: 'Technical' }));

    expect(onChange).toHaveBeenCalledWith({ finish: 'hasl', style: 'technical' });
  });

  it('unsets the value when Default is chosen, so the kernel option decides again', async () => {
    const onChange = renderEnumSettings({ style: 'technical', finish: 'hasl' });
    const style = await openSubmenu(/^Style/);

    fireEvent.click(within(style).getByRole('menuitemradio', { name: 'Default' }));

    expect(onChange).toHaveBeenCalledWith({ finish: 'hasl' });
  });

  it('does nothing when the selected value is chosen again', async () => {
    const onChange = renderEnumSettings({ style: 'technical' });
    const style = await openSubmenu(/^Style/);

    fireEvent.click(within(style).getByRole('menuitemradio', { name: 'Technical' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('counts a set value as a change and an unset one as the default', () => {
    const groups = kernelSettingsGroups(enumSchema, {});
    expect(countChangedSettings(groups, {}, {})).toBe(0);
    expect(countChangedSettings(groups, { style: 'technical', palette: 'engineering' }, {})).toBe(2);
  });

  it('removes a top-level setting set to undefined', () => {
    expect(withSetting({ values: { style: 'technical', finish: 'hasl' }, defaults: {} }, ['style'], undefined)).toEqual(
      {
        finish: 'hasl',
      },
    );
  });
});
