// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import {
  ContextMenuSliderItem,
  DropdownMenuSliderItem,
  MenuSliderItem,
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

type HarnessProperties = {
  readonly onValueChange: (value: number) => void;
  readonly onStep?: (direction: -1 | 1, modifiers: { shift: boolean }) => void;
};

const DropdownHarness = ({ onValueChange, onStep }: HarnessProperties): React.JSX.Element => {
  const [value, setValue] = React.useState(50);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent onEscapeKeyDown={preventMenuSliderEscapeDismissal}>
        <DropdownMenuItem>Previous action</DropdownMenuItem>
        <DropdownMenuSliderItem
          value={value}
          trailingAdornment='%'
          aria-label='Opacity'
          onValueChange={(nextValue) => {
            setValue(nextValue);
            onValueChange(nextValue);
          }}
          onStep={onStep}
        >
          Opacity
        </DropdownMenuSliderItem>
        <DropdownMenuItem>Next action</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ContextHarness = ({ onValueChange }: HarnessProperties): React.JSX.Element => {
  const [value, setValue] = React.useState(50);

  return (
    <ContextMenu>
      <ContextMenuTrigger>Target</ContextMenuTrigger>
      <ContextMenuContent onEscapeKeyDown={preventMenuSliderEscapeDismissal}>
        <ContextMenuItem>Previous action</ContextMenuItem>
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

type SliderSurface = 'dropdown' | 'context' | 'popover';

const ScrubDismissHarness = ({ surface }: { readonly surface: SliderSurface }): React.JSX.Element => {
  const [value, setValue] = React.useState(50);
  const properties = { value, 'aria-label': 'Opacity', onValueChange: setValue };

  return (
    <>
      <button type='button'>Outside slider surface</button>
      {surface === 'dropdown' ? (
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>Settings</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSliderItem {...properties}>Opacity</DropdownMenuSliderItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : surface === 'context' ? (
        <ContextMenu>
          <ContextMenuTrigger>Target</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSliderItem {...properties}>Opacity</ContextMenuSliderItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <Popover defaultOpen>
          <PopoverTrigger>Settings</PopoverTrigger>
          <PopoverContent>
            <button type='button'>Previous action</button>
            <MenuSliderItem {...properties} dataSlot='plain-slider-item'>
              Opacity
            </MenuSliderItem>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};

/** Opens the dropdown from the keyboard and moves from the item above onto the slider row. */
const highlightDropdownSliderRow = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.tab();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('menuitem', { name: 'Previous action' })).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  const row = screen.getByRole('menuitem', { name: 'Opacity, 50%' });
  expect(row).toHaveFocus();
  return row;
};

describe('MenuSliderItem', () => {
  it.each<SliderSurface>(['dropdown', 'context', 'popover'])(
    'should dismiss %s on the first outside press after scrubbing and restoring its value',
    async (surface) => {
      const user = userEvent.setup();
      render(<ScrubDismissHarness surface={surface} />);
      if (surface === 'context') {
        fireEvent.contextMenu(screen.getByText('Target'));
      }
      const surfaceRole = surface === 'popover' ? 'dialog' : 'menu';
      await screen.findByRole(surfaceRole);
      const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Opacity' });
      const slider = input.closest<HTMLElement>('[data-slot$="slider-item"]')!;
      Object.defineProperty(slider, 'offsetWidth', { configurable: true, value: 100 });

      fireSliderPointerEvent(slider, 'pointerdown', 0);
      fireSliderPointerEvent(slider, 'pointermove', 4);
      expect(input).toHaveValue('54');
      fireSliderPointerEvent(slider, 'pointermove', 8);
      expect(input).toHaveValue('58');
      fireSliderPointerEvent(slider, 'pointerup', 8);
      expect(screen.getByRole(surfaceRole)).toBeInTheDocument();

      if (surface === 'popover') {
        act(() => {
          input.focus();
          input.select();
        });
      } else {
        act(() => {
          screen.getByRole('menuitem', { name: 'Opacity, 58' }).focus();
        });
        await user.keyboard('{Enter}');
      }
      await user.keyboard('50{Enter}');
      expect(input).toHaveValue('50');
      expect(screen.getByRole(surfaceRole)).toBeInTheDocument();

      const outside = screen.getByText('Outside slider surface');
      fireSliderPointerEvent(outside, 'pointerdown', 200);
      fireSliderPointerEvent(outside, 'pointerup', 200);
      fireEvent.click(outside);
      await waitFor(() => {
        expect(screen.queryByRole(surfaceRole)).not.toBeInTheDocument();
      });
    },
  );

  it('supports type, Enter, Arrow keys, and two-stage Escape without dismissing the dropdown early', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DropdownHarness onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const input = screen.getByRole('spinbutton', { name: 'Opacity' });

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

  it('should read its value with the unit, announce its range and take End without leaving the menu', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DropdownHarness onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const input = screen.getByRole('spinbutton', { name: 'Opacity' });

    expect(input).toHaveAttribute('aria-valuetext', '50%');
    expect(input).toHaveAttribute('aria-valuemin', '0');
    expect(input).toHaveAttribute('aria-valuemax', '100');

    await user.click(input);
    await user.keyboard('{End}');
    expect(onValueChange).toHaveBeenLastCalledWith(100);
    expect(input).toHaveAttribute('aria-valuetext', '100%');
    expect(input).toHaveFocus();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('should hand arrow keys and the Shift state to onStep instead of stepping by itself', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onStep = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSliderItem value={50} aria-label='Opacity' onValueChange={onValueChange} onStep={onStep}>
            Opacity
          </DropdownMenuSliderItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('spinbutton', { name: 'Opacity' }));

    await user.keyboard('{ArrowUp}');
    expect(onStep).toHaveBeenLastCalledWith(1, { shift: false });

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(onStep).toHaveBeenLastCalledWith(-1, { shift: true });
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('scrubs and reverts editing inside a context menu without dismissing it early', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ContextHarness onValueChange={onValueChange} />);
    fireEvent.contextMenu(screen.getByText('Target'));
    const input = screen.getByRole('spinbutton', { name: 'Opacity' });
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

  describe('keyboard', () => {
    it('should reach the row with the arrow keys and keep the menu open when it is selected', async () => {
      const user = userEvent.setup();
      render(<DropdownHarness onValueChange={vi.fn()} />);
      const row = await highlightDropdownSliderRow(user);

      await user.keyboard(' ');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(row).toHaveFocus();

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Next action' })).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(row).toHaveFocus();
    });

    it('should read the stepped value in the highlighted row’s name', async () => {
      const user = userEvent.setup();
      render(<DropdownHarness onValueChange={vi.fn()} />);
      const row = await highlightDropdownSliderRow(user);

      await user.keyboard('{ArrowRight}');

      expect(row).toHaveAccessibleName('Opacity, 51%');
      expect(row).toHaveFocus();
    });

    it('should step the highlighted row with ArrowRight and ArrowLeft', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<DropdownHarness onValueChange={onValueChange} />);
      const row = await highlightDropdownSliderRow(user);

      await user.keyboard('{ArrowRight}');
      expect(onValueChange).toHaveBeenLastCalledWith(51);
      await user.keyboard('{ArrowLeft}{ArrowLeft}');
      expect(onValueChange).toHaveBeenLastCalledWith(49);
      expect(row).toHaveFocus();
      expect(screen.getByRole('spinbutton', { name: 'Opacity' })).toHaveValue('49');
    });

    it('should hand ArrowRight, ArrowLeft and the Shift state to onStep', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onStep = vi.fn();
      render(<DropdownHarness onValueChange={onValueChange} onStep={onStep} />);
      await highlightDropdownSliderRow(user);

      await user.keyboard('{ArrowRight}');
      expect(onStep).toHaveBeenLastCalledWith(1, { shift: false });
      await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
      expect(onStep).toHaveBeenLastCalledWith(1, { shift: true });
      await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
      expect(onStep).toHaveBeenLastCalledWith(-1, { shift: true });
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('should type on Enter and return to the row when Enter commits', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<DropdownHarness onValueChange={onValueChange} />);
      const row = await highlightDropdownSliderRow(user);

      await user.keyboard('{Enter}');
      const input = screen.getByRole('spinbutton', { name: 'Opacity' });
      expect(input).toHaveFocus();
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.keyboard('75{Enter}');
      expect(onValueChange).toHaveBeenLastCalledWith(75);
      expect(row).toHaveFocus();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('should start typing when a digit is pressed on the row', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<DropdownHarness onValueChange={onValueChange} />);
      const row = await highlightDropdownSliderRow(user);

      await user.keyboard('3');
      const input = screen.getByRole('spinbutton', { name: 'Opacity' });
      expect(input).toHaveFocus();
      expect(input).toHaveValue('3');

      await user.keyboard('{Enter}');
      expect(onValueChange).toHaveBeenLastCalledWith(3);
      expect(row).toHaveFocus();
    });

    it('should revert on Escape and return to the row without closing the menu', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<DropdownHarness onValueChange={onValueChange} />);
      const row = await highlightDropdownSliderRow(user);

      await user.keyboard('{Enter}90{Escape}');
      expect(onValueChange).toHaveBeenLastCalledWith(50);
      expect(screen.getByRole('spinbutton', { name: 'Opacity' })).toHaveValue('50');
      expect(row).toHaveFocus();
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should reach and step the row in a context menu', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<ContextHarness onValueChange={onValueChange} />);
      fireEvent.contextMenu(screen.getByText('Target'));

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Previous action' })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Opacity, 50%' })).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(onValueChange).toHaveBeenLastCalledWith(51);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });
});
