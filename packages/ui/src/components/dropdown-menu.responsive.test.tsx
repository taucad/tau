import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuToggleGroupItem,
  DropdownMenuTrigger,
} from '#components/dropdown-menu.js';
import { ResponsiveSurfaceProvider } from '#hooks/use-mobile.js';

type MenuProperties = {
  readonly isResponsive?: boolean;
  readonly onRename?: (event: Event) => void;
  readonly onCloseAutoFocus?: (event: Event) => void;
};

function ProjectMenu({ isResponsive = true, onRename, onCloseAutoFocus }: MenuProperties): React.JSX.Element {
  return (
    <DropdownMenu isResponsive={isResponsive}>
      <DropdownMenuTrigger asChild>
        <button type='button' aria-label='More actions for Bracket'>
          ⋮
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent drawerTitle='Bracket' className='w-48' onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuLabel>Project</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href='/docs'>Documentation</a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive'>Move to Trash</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const onPhone = (children: React.ReactNode): React.JSX.Element => (
  <ResponsiveSurfaceProvider isMobile container={undefined}>
    {children}
  </ResponsiveSurfaceProvider>
);

beforeEach(() => {
  // Vaul reads the media query when a drawer opens; jsdom has none.
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('responsive dropdown menu', () => {
  it('should open its items in a bottom drawer named by its title on a phone', async () => {
    const user = userEvent.setup();
    render(onPhone(<ProjectMenu />));

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));

    const drawer = await screen.findByRole('dialog', { name: 'Bracket' });
    expect(drawer).toHaveAttribute('data-slot', 'drawer-content');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Rename' })).toHaveAttribute('data-slot', 'dropdown-menu-item');
    expect(within(drawer).getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/docs');
    expect(within(drawer).getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(within(drawer).getByRole('button', { name: 'Move to Trash' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    expect(within(drawer).getByText('Project')).toHaveAttribute('data-slot', 'dropdown-menu-label');
    expect(within(drawer).getByRole('separator')).toBeInTheDocument();
    // The desktop width is for the menu; the drawer spans the screen.
    expect(drawer).not.toHaveClass('w-48');
  });

  it('should sit above the phone sidebar sheet (z-100) it opens from, overlay included', async () => {
    const user = userEvent.setup();
    render(onPhone(<ProjectMenu />));

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));

    const drawer = await screen.findByRole('dialog', { name: 'Bracket' });
    expect(drawer).toHaveClass('z-110');
    expect(document.querySelector('[data-slot=drawer-overlay]')).toHaveClass('z-110');
  });

  it('should run an item’s onSelect and close the drawer', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn<(event: Event) => void>();
    render(onPhone(<ProjectMenu onRename={onRename} />));

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));
    // A click, not a pointer sequence: vaul's drag handling reads layout jsdom does not have.
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    expect(onRename).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Bracket' })).not.toBeInTheDocument();
    });
  });

  it('should stay open when onSelect prevents the default, as a menu item does', async () => {
    const user = userEvent.setup();
    render(
      onPhone(
        <ProjectMenu
          onRename={(event) => {
            event.preventDefault();
          }}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    expect(screen.getByRole('dialog', { name: 'Bracket' })).toBeInTheDocument();
  });

  it('should close from its circular Close action', async () => {
    const user = userEvent.setup();
    render(onPhone(<ProjectMenu />));

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));
    const close = await screen.findByRole('button', { name: 'Close' });
    expect(close).toHaveClass('rounded-full!', 'border', 'size-11');

    fireEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Bracket' })).not.toBeInTheDocument();
    });
  });

  it('should keep the dropdown menu on a wide screen', async () => {
    const user = userEvent.setup();
    render(
      <ResponsiveSurfaceProvider isMobile={false} container={undefined}>
        <ProjectMenu />
      </ResponsiveSurfaceProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should keep the dropdown menu on a phone unless the menu opts in', async () => {
    const user = userEvent.setup();
    render(onPhone(<ProjectMenu isResponsive={false} />));

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should keep the drawer open when an item’s onClick prevents the default, and skip its onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(event: Event) => void>();
    render(
      onPhone(
        <DropdownMenu isResponsive>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent drawerTitle='Actions'>
            <DropdownMenuItem
              onSelect={onSelect}
              onClick={(event) => {
                event.preventDefault();
              }}
            >
              Duplicate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeInTheDocument();
  });

  it('should never select a disabled item, and keep a disabled link from navigating or being tabbed to', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(event: Event) => void>();
    render(
      onPhone(
        <DropdownMenu isResponsive>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent drawerTitle='Actions'>
            <DropdownMenuItem disabled onSelect={onSelect}>
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem asChild disabled onSelect={onSelect}>
              <a href='/billing'>Billing</a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const archive = await screen.findByRole('button', { name: 'Archive' });
    fireEvent.click(archive);
    const link = screen.getByRole('link', { name: 'Billing' });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabindex', '-1');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeInTheDocument();
  });

  it('should follow a controlled open state and report every change through onOpenChange', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    function Controlled(): React.JSX.Element {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button
            type='button'
            onClick={() => {
              setIsOpen(true);
            }}
          >
            Open from outside
          </button>
          <DropdownMenu
            isResponsive
            open={isOpen}
            onOpenChange={(next) => {
              onOpenChange(next);
              setIsOpen(next);
            }}
          >
            <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
            <DropdownMenuContent drawerTitle='Actions'>
              <DropdownMenuItem>Rename</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      );
    }
    render(onPhone(<Controlled />));

    fireEvent.click(screen.getByRole('button', { name: 'Open from outside' }));
    expect(await screen.findByRole('dialog', { name: 'Actions' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Actions' })).not.toBeInTheDocument();
    });
  });

  it('should move focus into the drawer when it opens and back to the trigger when it closes', async () => {
    const user = userEvent.setup();
    render(onPhone(<ProjectMenu />));
    const trigger = screen.getByRole('button', { name: 'More actions for Bracket' });

    await user.click(trigger);
    // As a menu opens: on its first item.
    const rename = await screen.findByRole('button', { name: 'Rename' });
    await waitFor(() => {
      expect(rename).toHaveFocus();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('should return focus to the trigger even when the menu prevents its close auto-focus, if nothing took it', async () => {
    const user = userEvent.setup();
    render(
      onPhone(
        <ProjectMenu
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        />,
      ),
    );
    const trigger = screen.getByRole('button', { name: 'More actions for Bracket' });

    await user.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Bracket' })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('should leave focus where an item moved it when the menu prevents its close auto-focus', async () => {
    const user = userEvent.setup();
    render(
      onPhone(
        <>
          <input aria-label='Name' />
          <ProjectMenu
            onCloseAutoFocus={(event) => {
              // What the item opened takes focus as the drawer closes, as a dialog or an inline editor does.
              document.querySelector<HTMLInputElement>('input[aria-label=Name]')!.focus();
              event.preventDefault();
            }}
          />
        </>,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'More actions for Bracket' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Bracket' })).not.toBeInTheDocument();
    });
    expect(document.querySelector('input[aria-label=Name]')).toHaveFocus();
  });
});

describe('responsive dropdown menu parts in a drawer', () => {
  /** Opens a responsive menu holding `children` on a phone and returns its drawer. */
  const openWith = async (children: React.ReactNode): Promise<HTMLElement> => {
    const user = userEvent.setup();
    render(
      onPhone(
        <DropdownMenu isResponsive>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent drawerTitle='View'>{children}</DropdownMenuContent>
        </DropdownMenu>,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    return screen.findByRole('dialog', { name: 'View' });
  };

  it('should render a checkbox item as a checkbox row that toggles and closes the drawer', async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    const drawer = await openWith(
      <DropdownMenuCheckboxItem checked onCheckedChange={onCheckedChange}>
        Grid
      </DropdownMenuCheckboxItem>,
    );

    const row = within(drawer).getByRole('checkbox', { name: 'Grid' });
    expect(row).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(row);

    expect(onCheckedChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'View' })).not.toBeInTheDocument();
    });
  });

  it('should keep the drawer open when a checkbox item’s onSelect prevents the default, and still toggle', async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    const drawer = await openWith(
      <DropdownMenuCheckboxItem
        checked={false}
        onCheckedChange={onCheckedChange}
        onSelect={(event) => {
          event.preventDefault();
        }}
      >
        Grid
      </DropdownMenuCheckboxItem>,
    );

    fireEvent.click(within(drawer).getByRole('checkbox', { name: 'Grid' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('dialog', { name: 'View' })).toBeInTheDocument();
  });

  it('should render a radio group as radio rows that choose its value', async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const drawer = await openWith(
      <DropdownMenuRadioGroup value='cozy' onValueChange={onValueChange}>
        <DropdownMenuRadioItem value='compact'>Compact</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value='cozy'>Cozy</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>,
    );

    expect(within(drawer).getByRole('radio', { name: 'Cozy' })).toHaveAttribute('aria-checked', 'true');
    const compact = within(drawer).getByRole('radio', { name: 'Compact' });
    expect(compact).toHaveAttribute('aria-checked', 'false');
    expect(compact.parentElement).toHaveAttribute('role', 'radiogroup');
    fireEvent.click(compact);

    expect(onValueChange).toHaveBeenCalledWith('compact');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'View' })).not.toBeInTheDocument();
    });
  });

  it('should give checkbox, radio and switch rows roles that need no menu parent', async () => {
    const drawer = await openWith(
      <>
        <DropdownMenuCheckboxItem checked>Grid</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value='cozy'>
          <DropdownMenuRadioItem value='compact'>Compact</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='cozy'>Cozy</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSwitchItem isChecked={false}>Snap</DropdownMenuSwitchItem>
      </>,
    );

    const results = await axe.run(drawer, {
      runOnly: { type: 'rule', values: ['aria-required-parent', 'aria-required-children', 'aria-allowed-role'] },
    });

    expect(results.violations).toEqual([]);
  });

  it('should draw every kind of row in the shared drawer list, so each gets the drawer row divider', async () => {
    const drawer = await openWith(
      <>
        <DropdownMenuItem>Rename</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>Grid</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value='cozy'>
          <DropdownMenuRadioItem value='cozy'>Cozy</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSwitchItem isChecked={false}>Snap</DropdownMenuSwitchItem>
      </>,
    );

    const list = drawer.querySelector('[data-slot=dropdown-menu-drawer-items]');
    expect(list).toHaveClass('drawer-row-dividers');
    for (const row of [
      within(drawer).getByRole('button', { name: 'Rename' }),
      within(drawer).getByRole('checkbox', { name: 'Grid' }),
      within(drawer).getByRole('radio', { name: 'Cozy' }),
      within(drawer).getByRole('switch', { name: 'Snap' }),
    ]) {
      expect(row).toHaveAttribute('data-drawer-row');
      expect(list).toContainElement(row);
    }
  });

  it('should render a switch item as one switch row that toggles and keeps the drawer open', async () => {
    const onIsCheckedChange = vi.fn<(checked: boolean) => void>();
    const drawer = await openWith(
      <DropdownMenuSwitchItem isChecked={false} description='Align to the grid' onIsCheckedChange={onIsCheckedChange}>
        Snap
      </DropdownMenuSwitchItem>,
    );

    const row = within(drawer).getByRole('switch', { name: 'Snap' });
    expect(row).toHaveAttribute('aria-checked', 'false');
    expect(row).toHaveAccessibleDescription('Align to the grid');
    // The switch only shows the state: no control inside the row.
    expect(within(row).queryByRole('switch')).not.toBeInTheDocument();
    fireEvent.click(row);

    expect(onIsCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('dialog', { name: 'View' })).toBeInTheDocument();
  });

  it('should render a toggle group item with its options', async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const drawer = await openWith(
      <DropdownMenuToggleGroupItem
        value='mm'
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'in' },
        ]}
        onValueChange={onValueChange}
      >
        Units
      </DropdownMenuToggleGroupItem>,
    );

    fireEvent.click(within(drawer).getByRole('radio', { name: 'in' }));

    expect(onValueChange).toHaveBeenCalledWith('in');
  });

  it('should expand a submenu in place, and close the drawer when one of its items is chosen', async () => {
    const onSelect = vi.fn<(event: Event) => void>();
    const drawer = await openWith(
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={onSelect}>
              STL
              <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>,
    );

    const trigger = within(drawer).getByRole('button', { name: 'Export' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(within(drawer).queryByRole('button', { name: /STL/u })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const content = document.querySelector<HTMLElement>(`[id="${trigger.getAttribute('aria-controls')!}"]`);
    expect(content).toHaveAttribute('role', 'group');
    fireEvent.click(within(content!).getByRole('button', { name: /STL/u }));

    expect(onSelect).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'View' })).not.toBeInTheDocument();
    });
  });

  it('should render a group and keep a plain menu nested in the drawer a menu', async () => {
    const drawer = await openWith(
      <DropdownMenuGroup aria-label='Nested'>
        <DropdownMenu>
          <DropdownMenuTrigger>Inner</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Inner item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DropdownMenuGroup>,
    );

    expect(within(drawer).getByRole('group', { name: 'Nested' })).toBeInTheDocument();
    const inner = within(drawer).getByRole('button', { name: 'Inner' });
    expect(inner).toHaveAttribute('aria-haspopup', 'menu');
    // The keys, not a pointer: vaul's drag handling under the pointer reads layout jsdom does not have.
    inner.focus();
    fireEvent.keyDown(inner, { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: 'Inner item' })).toBeInTheDocument();
  });
});
