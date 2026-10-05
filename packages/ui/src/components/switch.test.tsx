import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSwitchItem } from '#components/dropdown-menu.js';
import { menuSwitchRowVariants } from '#components/menu.variants.js';
import { SwitchRow } from '#components/switch.js';

function FastMode({ onChange }: { readonly onChange?: (isChecked: boolean) => void }): React.JSX.Element {
  const [isChecked, setIsChecked] = useState(false);
  return (
    <SwitchRow
      isChecked={isChecked}
      description='1.5x speed, increased usage'
      onIsCheckedChange={(next) => {
        setIsChecked(next);
        onChange?.(next);
      }}
    >
      Fast mode
    </SwitchRow>
  );
}

describe('SwitchRow', () => {
  it('names the switch by its title and describes it by its description', () => {
    render(<FastMode />);
    const toggle = screen.getByRole('switch', { name: 'Fast mode' });
    expect(toggle).toHaveAccessibleDescription('1.5x speed, increased usage');
    expect(toggle).not.toBeChecked();
  });

  it('toggles once when any part of the row is clicked', () => {
    const onChange = vi.fn();
    render(<FastMode onChange={onChange} />);
    fireEvent.click(screen.getByText('1.5x speed, increased usage'));
    expect(screen.getByRole('switch', { name: 'Fast mode' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Fast mode' }));
    expect(screen.getByRole('switch', { name: 'Fast mode' })).not.toBeChecked();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('refuses changes while disabled', () => {
    const onChange = vi.fn();
    render(
      <SwitchRow isDisabled isChecked={false} onIsCheckedChange={onChange}>
        Grid
      </SwitchRow>,
    );
    fireEvent.click(screen.getByText('Grid'));
    expect(screen.getByRole('switch', { name: 'Grid' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shares its row classes with the dropdown switch item', () => {
    render(
      <>
        <SwitchRow isChecked={false}>Grid</SwitchRow>
        <DropdownMenu open>
          <DropdownMenuContent>
            <DropdownMenuSwitchItem isChecked={false} description='Lighting effects are active'>
              Matcap
            </DropdownMenuSwitchItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>,
    );
    const row = screen.getByText('Grid').closest('[data-slot=switch-row]');
    const item = screen.getByRole('menuitem');
    for (const className of menuSwitchRowVariants().split(' ')) {
      expect(row).toHaveClass(className);
    }
    for (const className of menuSwitchRowVariants({ described: true }).split(' ')) {
      expect(item).toHaveClass(className);
    }
    expect(screen.getByRole('switch', { name: 'Matcap' })).toHaveAccessibleDescription('Lighting effects are active');
  });
});
