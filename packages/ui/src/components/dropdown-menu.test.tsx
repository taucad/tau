import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';

function ToggleMenu() {
  const [value, setValue] = useState('z');
  return (
    <>
      <button type='button'>Outside menu</button>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Viewer settings</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuToggleGroupItem
            value={value}
            onValueChange={setValue}
            options={[
              { value: 'x', label: 'X', ariaLabel: 'X' },
              { value: 'z', label: 'Z', ariaLabel: 'Z' },
            ]}
          >
            Up direction
          </DropdownMenuToggleGroupItem>
          <DropdownMenuItem>Reset view</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

describe('DropdownMenuToggleGroupItem dismissal', () => {
  it('keeps a pointer-selected toggle open and dismisses on the first outside pointer', async () => {
    render(<ToggleMenu />);
    await screen.findByRole('menu');
    const toggle = screen.getByRole('radio', { name: 'X' });
    fireEvent.pointerDown(toggle, { button: 0, pointerType: 'mouse', pointerId: 1 });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('Outside menu'), { button: 0, pointerType: 'mouse', pointerId: 1 });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('keeps keyboard toggle selection open and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ToggleMenu />);
    await screen.findByRole('menu');
    const toggle = screen.getByRole('radio', { name: 'X' });
    act(() => {
      toggle.focus();
    });
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('preserves ordinary parent menu item selection after a toggle interaction', async () => {
    const user = userEvent.setup();
    render(<ToggleMenu />);
    await screen.findByRole('menu');
    const toggle = screen.getByRole('radio', { name: 'X' });
    fireEvent.pointerDown(toggle, { button: 0, pointerType: 'mouse', pointerId: 1 });
    fireEvent.click(toggle);
    const item = screen.getByRole('menuitem', { name: 'Reset view' });
    act(() => {
      item.focus();
    });
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
