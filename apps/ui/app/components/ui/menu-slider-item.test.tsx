// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@taucad/ui/components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import {
  ContextMenuSliderItem,
  DropdownMenuSliderItem,
  preventMenuSliderEscapeDismissal,
} from '#components/ui/menu-slider-item.js';

const fireSliderPointerEvent = (
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
): void => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(element, event);
};

const DropdownHarness = ({ onValueChange }: { readonly onValueChange: (value: number) => void }): React.JSX.Element => {
  const [value, setValue] = React.useState(50);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent onEscapeKeyDown={preventMenuSliderEscapeDismissal}>
        <DropdownMenuSliderItem
          value={value}
          trailingAdornment='%'
          aria-label='Opacity'
          onValueChange={(nextValue) => {
            setValue(nextValue);
            onValueChange(nextValue);
          }}
        >
          Opacity
        </DropdownMenuSliderItem>
        <DropdownMenuItem>Next action</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ContextHarness = ({ onValueChange }: { readonly onValueChange: (value: number) => void }): React.JSX.Element => {
  const [value, setValue] = React.useState(50);

  return (
    <ContextMenu>
      <ContextMenuTrigger>Target</ContextMenuTrigger>
      <ContextMenuContent onEscapeKeyDown={preventMenuSliderEscapeDismissal}>
        <ContextMenuSliderItem
          value={value}
          trailingAdornment='%'
          aria-label='Opacity'
          onValueChange={(nextValue) => {
            setValue(nextValue);
            onValueChange(nextValue);
          }}
        >
          Opacity
        </ContextMenuSliderItem>
        <ContextMenuItem>Next action</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

describe('MenuSliderItem', () => {
  it('supports type, Enter, Arrow keys, and two-stage Escape without dismissing the dropdown early', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DropdownHarness onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const input = screen.getByRole('textbox', { name: 'Opacity' });

    await user.click(input);
    await user.clear(input);
    await user.type(input, '75');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith(75);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(onValueChange).toHaveBeenLastCalledWith(76);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '90');
    await user.keyboard('{Escape}');
    expect(onValueChange).toHaveBeenLastCalledWith(75);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('scrubs and reverts editing inside a context menu without dismissing it early', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ContextHarness onValueChange={onValueChange} />);
    fireEvent.contextMenu(screen.getByText('Target'));
    const input = screen.getByRole('textbox', { name: 'Opacity' });
    const sliderItem = input.closest<HTMLElement>('[data-slot="context-menu-slider-item"]')!;
    Object.defineProperty(sliderItem, 'offsetWidth', { configurable: true, value: 100 });

    fireSliderPointerEvent(sliderItem, 'pointerdown', 0);
    fireSliderPointerEvent(sliderItem, 'pointermove', -25);
    fireSliderPointerEvent(sliderItem, 'pointerup', -25);

    expect(onValueChange).toHaveBeenLastCalledWith(25);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Next action' })).toBeInTheDocument();

    await user.click(input);
    await user.clear(input);
    await user.type(input, '80');
    await user.keyboard('{Escape}');
    expect(onValueChange).toHaveBeenLastCalledWith(25);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
