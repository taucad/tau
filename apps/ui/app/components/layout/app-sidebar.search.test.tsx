import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Folder } from 'lucide-react';
import { AppSidebar } from '#components/layout/app-sidebar.js';
import { CommandPaletteProvider, useCommandPaletteItems } from '#components/layout/command-palette.js';
import { SidebarProvider, SidebarTrigger } from '#components/ui/sidebar.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { featureFlagDefaults } from '#flags/flag.constants.js';

/*
 * The sidebar search trigger with the real sidebar, palette and drawer (D10, W8): phones get a named
 * Search icon in the sheet header that opens a full-height palette; wide screens keep the Search row.
 */

const mockState = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: () => mockState.isMobile,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeatureFlags: () => featureFlagDefaults,
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [true, vi.fn()] as const,
}));

// The data-backed sidebar sections and the project/chat registrations need app services; the palette does not.
vi.mock('#components/nav/project-navigation.js', () => ({
  ProjectNavigation: () => null,
}));

vi.mock('#components/nav/project-navigation-command-items.js', () => ({
  ProjectNavigationCommandItems: () => null,
}));

vi.mock('#components/nav/nav-chat.js', () => ({
  NavChat: () => null,
}));

vi.mock('#components/nav/nav-user.js', () => ({
  NavUser: () => <button type='button'>Account</button>,
}));

function RegisterItems(): undefined {
  useCommandPaletteItems(
    'test',
    () => [
      {
        id: 'rotor-housing',
        label: 'Rotor housing',
        group: 'Projects',
        icon: <Folder aria-hidden />,
        link: '/projects/rotor-housing',
      },
    ],
    [],
  );
  return undefined;
}

function Shell(): React.JSX.Element {
  return (
    <KeyboardProvider>
      <TooltipProvider>
        <CommandPaletteProvider>
          <SidebarProvider>
            <RegisterItems />
            {/* The page header's trigger, which opens the phone sheet. */}
            <SidebarTrigger />
            <AppSidebar />
          </SidebarProvider>
        </CommandPaletteProvider>
      </TooltipProvider>
    </KeyboardProvider>
  );
}

function renderShell(): ReturnType<typeof render> {
  const router = createMemoryRouter([
    { path: '/', element: <Shell /> },
    { path: '/projects/:id', element: <p>Project page</p> },
  ]);
  return render(<RouterProvider router={router} />);
}

async function openPhoneSheet(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
  const sheet = await screen.findByRole('dialog', { name: 'Sidebar' });
  return sheet.querySelector<HTMLElement>('[data-slot=sidebar-header]')!;
}

describe('sidebar search trigger', () => {
  beforeEach(() => {
    mockState.isMobile = false;
    // JSDOM lays nothing out: give the virtualized result list a viewport, and vaul's drag start a pointer capture.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(390);
    Element.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('on phones', () => {
    beforeEach(() => {
      mockState.isMobile = true;
    });

    it('should read [close][wordmark] … [Search] in the sheet header, with no hamburger left', async () => {
      renderShell();
      const header = await openPhoneSheet();
      const controls = [...header.querySelectorAll<HTMLElement>('a, button')];

      const search = within(header).getByRole('button', { name: 'Search' });
      const close = within(header).getByRole('button', { name: 'Close sidebar' });
      act(() => {
        close.focus();
      });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Close sidebar/);
      // Tooltips in the sheet must clear its z-100 (Radix copies the content's z-index to its popper wrapper).
      expect(document.querySelector('[data-slot=tooltip-content]')).toHaveClass('z-110');
      act(() => {
        controls[2]!.focus();
      });
      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toHaveTextContent(/^Search/);
      });
      expect(document.querySelector('[data-slot=tooltip-content]')).toHaveClass('z-110');
      expect(controls).toEqual([close, within(header).getByRole('link', { name: 'Home' }), search]);
      // The icon-lg size: a 40px header target, matching the 40px close and Home controls beside it.
      expect(search).toHaveClass('size-10');
      expect(controls[0]).toHaveClass('size-10');
      expect(search.querySelector('svg')).toHaveClass('lucide-search');
      // One search entry per screen: the wide-screen Search row is not rendered in the sheet.
      expect(screen.getAllByRole('button', { name: 'Search' })).toEqual([search]);
      expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    });

    it('should open a full-height palette with the field focused, and Escape returns focus to Search', async () => {
      renderShell();
      const header = await openPhoneSheet();
      const search = within(header).getByRole('button', { name: 'Search' });

      await userEvent.click(search);

      const palette = await screen.findByRole('dialog', { name: 'Search' });
      expect(palette).toHaveAttribute('data-slot', 'command-palette-sheet');
      // Nearly full height, a sliver below the status bar so its rounded top reads as a drawer.
      expect(palette).toHaveClass(
        'h-[calc(100dvh-env(safe-area-inset-top)-var(--spacing)*3)]',
        'data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-env(safe-area-inset-top)-var(--spacing)*3)]',
        'data-[vaul-drawer-direction=bottom]:rounded-t-(--drawer-radius)',
        'z-110',
      );
      expect(palette).not.toHaveClass('data-[vaul-drawer-direction=bottom]:rounded-none');
      const field = within(palette).getByPlaceholderText('Search projects, chats…');
      await waitFor(() => {
        expect(field).toHaveFocus();
      });
      expect(within(palette).getByRole('button', { name: 'Close' })).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
      });
      expect(search).toHaveFocus();
      // Escape closes only the top layer: the sidebar sheet stays open beneath.
      expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeInTheDocument();
    });

    it('should open the palette sheet from the keyboard shortcut', async () => {
      renderShell();
      await openPhoneSheet();

      await userEvent.keyboard('{Control>}k{/Control}');

      expect(await screen.findByRole('dialog', { name: 'Search' })).toHaveAttribute(
        'data-slot',
        'command-palette-sheet',
      );
    });

    it('should navigate to a picked result', async () => {
      renderShell();
      const header = await openPhoneSheet();
      await userEvent.click(within(header).getByRole('button', { name: 'Search' }));
      const palette = await screen.findByRole('dialog', { name: 'Search' });

      const field = within(palette).getByPlaceholderText('Search projects, chats…');
      await waitFor(() => {
        expect(field).toHaveFocus();
      });
      // Typed into the focused field, as a phone keyboard does; a jsdom click would start a vaul drag.
      await userEvent.keyboard('rotor');
      expect(await within(palette).findByRole('option', { name: 'Rotor housing' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await userEvent.keyboard('{Enter}');

      expect(await screen.findByText('Project page')).toBeInTheDocument();
    });
  });

  describe('on wide screens', () => {
    it('should keep the labelled Search row with its shortcut chip and open the palette dialog', async () => {
      renderShell();
      const sidebar = screen.getByRole('complementary', { name: 'Application sidebar' });
      const header = sidebar.querySelector<HTMLElement>('[data-slot=sidebar-header]')!;
      const row = within(sidebar).getByRole('button', { name: 'Search' });

      expect(within(header).queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
      expect(row).toHaveTextContent('Search');
      expect(row).toHaveClass('max-md:hidden');
      expect(within(row).getByText('Ctrl+K')).toHaveClass('pointer-coarse:hidden');

      await userEvent.click(row);

      const palette = await screen.findByRole('dialog');
      expect(palette).not.toHaveAttribute('data-slot', 'command-palette-sheet');
      await userEvent.click(await within(palette).findByRole('option', { name: 'Rotor housing' }));
      expect(await screen.findByText('Project page')).toBeInTheDocument();
    });

    it('should return focus to the Search row when Escape closes the palette dialog', async () => {
      renderShell();
      const row = screen.getByRole('button', { name: 'Search' });

      await userEvent.click(row);
      const field = await screen.findByPlaceholderText('Search projects, chats, and actions…');
      await waitFor(() => {
        expect(field).toHaveFocus();
      });

      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search projects, chats, and actions…')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(row).toHaveFocus();
      });
    });

    it('should open the palette dialog from the keyboard shortcut and return focus to where it was', async () => {
      renderShell();
      const account = screen.getByRole('button', { name: 'Account' });
      account.focus();

      await userEvent.keyboard('{Control>}k{/Control}');
      expect(await screen.findByPlaceholderText('Search projects, chats, and actions…')).toHaveFocus();

      await userEvent.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search projects, chats, and actions…')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(account).toHaveFocus();
      });
    });

    it('should keep the toggle named Toggle Sidebar', () => {
      renderShell();

      expect(screen.getByRole('button', { name: 'Toggle Sidebar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^(Open|Close) sidebar$/ })).not.toBeInTheDocument();
    });
  });
});
