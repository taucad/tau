// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
        explicitSeed: { linearTolerance: 0.02, angularTolerance: 20 },
        explicitFields: [
          expect.objectContaining({ path: ['tessellation', 'linearTolerance'], unit: 'mm' }),
          expect.objectContaining({ path: ['tessellation', 'angularTolerance'], unit: '°' }),
        ],
      }),
    ]);
  });

  it('offers the presets and the explicit form, with no tolerance rows while a preset is chosen', () => {
    renderSettings({});
    const choice = screen.getByRole('group', { name: 'Tessellation' });
    expect(choice).toBeInTheDocument();
    for (const name of ['Low', 'Medium', 'High', 'Extra high', 'Explicit']) {
      expect(screen.getByRole('menuitemradio', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('menuitem', { name: /^Linear tolerance/ })).toBeNull();
  });

  it('replaces the value whole when a preset is chosen', () => {
    const onChange = renderSettings({ tessellation: { linearTolerance: 0.5 } });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'High' }));
    expect(onChange).toHaveBeenCalledWith({ tessellation: 'high' });
  });

  it('switches to explicit tolerances seeded from the schema examples, never merged with a preset', () => {
    const onChange = renderSettings({});
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Explicit' }));
    expect(onChange).toHaveBeenCalledWith({ tessellation: { linearTolerance: 0.02, angularTolerance: 20 } });
  });

  it('shows the tolerance rows in their units once the explicit form is chosen', () => {
    const onChange = renderSettings({ tessellation: { linearTolerance: 0.5, angularTolerance: 12 } });
    expect(screen.getByRole('menuitemradio', { name: 'Explicit' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'Linear tolerance, 0.5mm' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Angular tolerance, 12°' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Angular tolerance/ }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ tessellation: { linearTolerance: 0.5, angularTolerance: 13 } });
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
