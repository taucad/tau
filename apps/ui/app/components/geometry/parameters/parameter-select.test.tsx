// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';

it('shows grouped material options with shaded swatches and keeps the text accessible', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ParameterSelect
      label='Material'
      value='red'
      groups={[
        {
          label: 'Your presets',
          options: [{ value: 'red', label: 'A4 · PETG', secondary: '18 %', swatch: '#CC3311' }],
        },
        {
          label: 'System presets',
          options: [{ value: 'blue', label: 'A3 · PLA', secondary: '95 %', swatch: '#1133CC' }],
        },
      ]}
      onChange={onChange}
    />,
  );

  const trigger = screen.getByRole('combobox', { name: 'Material' });
  expect(trigger.textContent).toContain('A4 · PETG');
  await user.click(trigger);
  const group = screen.getByRole('group', { name: 'System presets' });
  const option = within(group).getByRole('option', { name: /A3 · PLA 95 %/u });
  const swatch = option.querySelector('[data-slot="material-swatch"]');
  expect(swatch?.getAttribute('aria-hidden')).toBe('true');
  expect(swatch?.classList.contains('rounded-full')).toBe(true);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenCalledExactlyOnceWith('blue');
});
