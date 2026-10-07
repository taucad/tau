import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NavChat } from '#components/nav/nav-chat.js';
import { SidebarProvider } from '#components/ui/sidebar.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '#hooks/use-keyboard.js';

function renderNavChat(): void {
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <KeyboardProvider>
        <TooltipProvider>
          <SidebarProvider>
            <NavChat />
            <Routes>
              <Route path='/projects/new' element={<p>Create New Project</p>} />
              <Route path='*' element={null} />
            </Routes>
          </SidebarProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </MemoryRouter>,
  );
}

describe('NavChat', () => {
  it('should link New Project to the project creation page, not the home composer', () => {
    renderNavChat();

    expect(screen.getByRole('link', { name: /New Project/ })).toHaveAttribute('href', '/projects/new');
  });

  it('should open the project creation page from its shortcut', async () => {
    renderNavChat();

    await userEvent.keyboard('{Control>}n{/Control}');

    expect(await screen.findByText('Create New Project')).toBeInTheDocument();
  });
});
