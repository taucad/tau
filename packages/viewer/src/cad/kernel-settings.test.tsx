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

const renderSettings = (values: Record<string, unknown>, onChange = vi.fn()) => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Viewer settings</DropdownMenuTrigger>
      <DropdownMenuContent>
        <KernelSettings
          isDefaultOpen
          groups={kernelSettingsGroups(unionSchema, defaults)}
          values={values}
          defaults={defaults}
          onChange={onChange}
          onReset={vi.fn()}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return onChange;
};

describe('kernel settings for a preset-or-explicit union', () => {
  it('reads the union as one choice of the presets or the explicit tolerances', () => {
    const [group] = kernelSettingsGroups(unionSchema, defaults);
    expect(group?.label).toBe('Tessellation');
    expect(group?.fields).toEqual([
      expect.objectContaining({
        kind: 'choice',
        path: ['tessellation'],
        presets: ['low', 'medium', 'high', 'extra-high'],
        presetSeed: 'medium',
        explicitSeed: { linearTolerance: 0.02, angularTolerance: 20 },
        explicitFields: [
          expect.objectContaining({ path: ['tessellation', 'linearTolerance'], unit: 'mm' }),
          expect.objectContaining({ path: ['tessellation', 'angularTolerance'], unit: '°' }),
        ],
      }),
    ]);
  });

  it('opens a stored preset in Preset mode with the four presets as one segmented control', () => {
    renderSettings({ tessellation: 'high' });
    expect(screen.getByRole('group', { name: 'Tessellation' })).toBeInTheDocument();
    const mode = screen.getByRole('group', { name: 'Tessellation mode' });
    expect(within(mode).getByRole('menuitemradio', { name: 'Preset' })).toHaveAttribute('aria-checked', 'true');
    expect(within(mode).getByRole('menuitemradio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'false');
    const presets = screen.getByRole('group', { name: 'Tessellation preset' });
    expect(
      within(presets)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Low', 'Medium', 'High', 'Extra high']);
    expect(within(presets).getByRole('menuitemradio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('menuitem', { name: /^Linear tolerance/ })).toBeNull();
  });

  it('opens the kernel default preset in Preset mode when nothing is stored', () => {
    renderSettings({});
    const presets = screen.getByRole('group', { name: 'Tessellation preset' });
    expect(within(presets).getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
  });

  it('opens a stored explicit object in Custom mode with its fields in their units', () => {
    renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    const mode = screen.getByRole('group', { name: 'Tessellation mode' });
    expect(within(mode).getByRole('menuitemradio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('group', { name: 'Tessellation preset' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Linear tolerance, 0.5mm' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Angular tolerance, 12°' })).toBeInTheDocument();
  });

  it('replaces the value whole when a preset is chosen', () => {
    const onChange = renderSettings({ tessellation: 'low' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Extra high' }));
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'extra-high' });
  });

  it('switches to Custom with the schema examples, never merged with the preset it leaves', () => {
    const onChange = renderSettings({ tessellation: 'high' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Custom' }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ tessellation: { linearTolerance: 0.02, angularTolerance: 20 } });
  });

  it('switches back to Preset with the default preset, dropping the explicit tolerances whole', () => {
    const onChange = renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Preset' }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'medium' });
  });

  it('does nothing when the selected mode is chosen again', () => {
    const onChange = renderSettings({ tessellation: 'high' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Preset' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits one explicit field by keyboard and keeps the other fields of the stored object only', () => {
    const onChange = renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Angular tolerance/ }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ tessellation: { linearTolerance: 0.5, angularTolerance: 13 } });
  });

  it('shows an unset explicit field at its example and stores only the field that was edited', () => {
    const onChange = renderSettings({ tessellation: { linearTolerance: 0.5 } });
    expect(screen.getByRole('menuitem', { name: 'Angular tolerance, 20°' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Linear tolerance/ }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ tessellation: { linearTolerance: 0.501 } });
  });

  it('reaches the segments with the menu keys and selects one with Enter', async () => {
    const user = userEvent.setup();
    const onChange = renderSettings({ tessellation: 'medium' });
    act(() => {
      screen.getByRole('menuitemradio', { name: 'Medium' }).focus();
    });
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'High' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'high' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
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
