import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { DropdownMenuSelectItem } from '@taucad/ui/components/menu-slider-item';

/** A menu with a two-level submenu, as the Quick export and kernel-settings menus nest. */
function NestedMenu({ onFormat }: { readonly onFormat?: (value: string) => void }): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>Quick export</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>STL</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger textValue='Format'>
                <span>Format</span>
                <span>Binary</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value='binary' onValueChange={onFormat}>
                  <DropdownMenuRadioItem value='text'>Text</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='binary'>Binary</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const open = async (): Promise<{ user: ReturnType<typeof userEvent.setup>; menu: HTMLElement }> => {
  const user = userEvent.setup();
  render(<NestedMenu />);
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  return { user, menu: await screen.findByRole('menu') };
};

describe('DropdownMenuSub as a sub-view', () => {
  it('should replace the items in the same menu, under a Back row, in a group named for the sub-view', async () => {
    const { user, menu } = await open();
    await user.click(within(menu).getByRole('menuitem', { name: 'Quick export' }));

    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(within(menu).queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
    const back = within(menu).getByRole('menuitem', { name: 'Back to Options' });
    expect(back).toHaveTextContent(/^Back$/u);
    expect(within(menu).getByRole('group', { name: 'Quick export' })).toBeVisible();
    await waitFor(() => {
      expect(within(menu).getByRole('menuitem', { name: 'STL' })).toHaveFocus();
    });
  });

  it('should open with the keyboard and step back on Escape to the row that opened it, then close', async () => {
    const { user, menu } = await open();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => {
      expect(within(menu).getByRole('menuitem', { name: 'STL' })).toHaveFocus();
    });

    await user.keyboard('{Escape}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(menu).getByRole('menuitem', { name: 'Quick export' })).toHaveFocus();
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
  });

  it('should not bind the Left arrow to Back', async () => {
    const { user, menu } = await open();
    await user.click(within(menu).getByRole('menuitem', { name: 'Quick export' }));
    await user.keyboard('{ArrowLeft}');
    expect(within(menu).getByRole('menuitem', { name: 'STL' })).toBeInTheDocument();
  });

  it('should nest a second level, focus its checked row, and step back one level at a time', async () => {
    const onFormat = vi.fn<(value: string) => void>();
    const user = userEvent.setup();
    render(<NestedMenu onFormat={onFormat} />);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Quick export' }));
    await user.click(within(menu).getByRole('menuitem', { name: /Format/u }));

    const back = within(menu).getByRole('menuitem', { name: 'Back to Quick export' });
    expect(back).toHaveTextContent(/^Back$/u);
    expect(within(menu).getByRole('group', { name: 'Format' })).toBeVisible();
    expect(within(menu).queryByRole('menuitem', { name: 'STL' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(menu).getByRole('menuitemradio', { name: 'Binary' })).toHaveFocus();
    });

    await user.click(back);
    expect(within(menu).getByRole('menuitem', { name: 'STL' })).toBeVisible();
    await user.click(within(menu).getByRole('menuitem', { name: 'Back to Options' }));
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  });
});

describe('DropdownMenuSelectItem', () => {
  const options = ['30s', '60s', 'Disabled'];

  function TimeoutMenu({ onValueChange }: { readonly onValueChange: (value: string) => void }): React.JSX.Element {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Viewer settings</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuSelectItem
            value='60s'
            options={options}
            getOptionValue={(option) => option}
            getOptionLabel={(option) => option}
            onValueChange={onValueChange}
          >
            <span>Timeout</span>
          </DropdownMenuSelectItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  it('should open its options as a sub-view, not a second popover, and step back on a choice', async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const user = userEvent.setup();
    render(<TimeoutMenu onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Viewer settings' }));
    const menu = await screen.findByRole('menu');
    const row = within(menu).getByRole('menuitem', { name: /Timeout/u });
    expect(row).toHaveTextContent('60s');

    await user.click(row);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    await waitFor(() => {
      expect(within(menu).getByRole('menuitemradio', { name: '60s' })).toHaveFocus();
    });

    await user.click(within(menu).getByRole('menuitemradio', { name: 'Disabled' }));
    expect(onValueChange).toHaveBeenCalledWith('Disabled');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(menu).getByRole('menuitem', { name: /Timeout/u })).toHaveFocus();
    });
  });

  it('should keep its value against the chevron: only the value takes the free space', async () => {
    const user = userEvent.setup();
    render(<TimeoutMenu onValueChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Viewer settings' }));
    const row = within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Timeout/u });

    const chevron = row.lastElementChild;
    const value = chevron?.previousElementSibling;
    expect(value).toHaveTextContent('60s');
    expect(value).toHaveClass('ml-auto');
    // Two `ml-auto` split the free space and float the value mid-row; the chevron gives its margin up after a value.
    expect(chevron).toHaveClass('ml-auto', '[.ml-auto+&]:ml-0');
  });
});
