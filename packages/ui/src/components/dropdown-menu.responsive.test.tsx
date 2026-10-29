import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
    expect(close).toHaveClass('rounded-full', 'border');

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
});
