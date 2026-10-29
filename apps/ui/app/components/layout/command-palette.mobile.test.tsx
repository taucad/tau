// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

vi.mock('#components/ui/sidebar.js', () => ({
  useSidebar: () => ({ isMobile: true }),
  SidebarMenuButton: ({ children }: { readonly children?: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));
vi.mock('#components/nav/project-navigation-command-items.js', () => ({
  ProjectNavigationCommandItems: () => null,
}));
vi.mock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl K' }),
}));

const { CommandPaletteProvider, Commands } = await import('#components/layout/command-palette.js');

beforeEach(() => {
  // Vaul reads the media query when a drawer opens; jsdom has none.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Commands on a phone', () => {
  it('should close the search sheet from a compact outline Cancel beside a field that can shrink', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <CommandPaletteProvider>
            <Commands />
          </CommandPaletteProvider>
        </TooltipProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));

    const sheet = await screen.findByRole('dialog', { name: 'Search' });
    const cancel = within(sheet).getByRole('button', { name: 'Cancel' });
    // `outline` draws one border on the page background; `sm` is the compact 32 px height.
    expect(cancel).toHaveClass('border', 'bg-background', 'h-8', 'shrink-0');
    expect(cancel).not.toHaveClass('h-10');
    // The phone's shorter placeholder fits beside Cancel at 320 px; the dialog keeps the full one.
    const field = within(sheet).getByPlaceholderText('Search projects, chats…');
    expect(field).toHaveClass('text-ellipsis');
    // The field's wrapper takes the row's remaining width and may shrink below its content.
    expect(field.closest('[data-slot=command-input-wrapper]')?.parentElement).toHaveClass(
      '[&_[data-slot=command-input-wrapper]]:min-w-0',
      '[&_[data-slot=command-input-wrapper]]:flex-1',
    );

    fireEvent.click(cancel);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
    });
  });
});
